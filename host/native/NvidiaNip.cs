using System;
using System.IO;
using System.Text;
using System.Xml;
using System.Xml.Serialization;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace SynapseX.Nip {
 public class Value {
  public uint id; public string name=""; public string type="Dword"; public string value="";
  public bool supported=true; public bool local; public int nativeType;
 }
 public class Row { public Value before; public Value target; public string reason=""; public bool changed; }
 public class Preview { public string name=""; public string fingerprint=""; public Row[] rows; public int changed; public int skipped; }
 public class Backup { public int schema=1; public string scope="Base Profile"; public string name=""; public string createdAt=""; public Row[] rows; }
 public interface ISession : IDisposable { Value Read(uint id); void Set(Value v); void Remove(uint id); void Save(); void Reload(); }

 public static class Importer {
  public static string Hash(byte[] bytes) { using(var h=SHA256.Create()) return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
  public static string Decode(byte[] bytes) {
   if(bytes.Length>2097152)throw new InvalidDataException("NIP 文件超过 2MB。");
   using(var stream=new MemoryStream(bytes))using(var reader=new StreamReader(stream,new UTF8Encoding(false,true),true)) return reader.ReadToEnd();
  }
  static XmlDocument Xml(string text,long limit=2097152) {
   var settings=new XmlReaderSettings { DtdProcessing=DtdProcessing.Prohibit, XmlResolver=null, MaxCharactersInDocument=limit };
   var doc=new XmlDocument { XmlResolver=null };
   using(var reader=XmlReader.Create(new StringReader(text),settings))doc.Load(reader);
   return doc;
  }
  public static Value[] Parse(string text) {
   var doc=Xml(text);
   if(doc.DocumentElement==null || doc.DocumentElement.Name!="ArrayOfProfile")throw new InvalidDataException("不是 NVIDIA Profile Inspector NIP 格式。");
   var profiles=doc.SelectNodes("/ArrayOfProfile/Profile");
   if(profiles.Count!=1 || profiles[0].SelectSingleNode("ProfileName")==null || profiles[0].SelectSingleNode("ProfileName").InnerText!="Base Profile")throw new InvalidDataException("本版支持单个 Base Profile 全局配置；游戏专用或多 Profile 文件暂不导入。");
   if(profiles[0].SelectNodes("Executeables/*").Count!=0)throw new InvalidDataException("全局配置不应绑定游戏程序。");
   var nodes=profiles[0].SelectNodes("Settings/ProfileSetting");
   if(nodes.Count<1 || nodes.Count>1024)throw new InvalidDataException("配置项数量无效（1–1024）。");
   var ids=new HashSet<uint>();var result=new List<Value>();
   foreach(XmlNode node in nodes) {
    foreach(var key in new[]{"SettingID","SettingValue","ValueType"})if(node.SelectNodes(key).Count!=1)throw new InvalidDataException("缺少或重复字段："+key);
    uint id;if(!uint.TryParse(node["SettingID"].InnerText,out id)||!ids.Add(id))throw new InvalidDataException("参数编号无效或重复。");
    var v=new Value {id=id,name=node["SettingNameInfo"]==null?"":node["SettingNameInfo"].InnerText,type=node["ValueType"].InnerText,value=node["SettingValue"].InnerText};
    if(v.name.Length>2048)throw new InvalidDataException("参数名称过长。");
    if(v.type=="Dword") { uint n;if(!uint.TryParse(v.value,out n))throw new InvalidDataException("DWORD 值超出范围。");v.value=n.ToString(System.Globalization.CultureInfo.InvariantCulture);v.nativeType=0; }
    else if(v.type=="Binary") { var bytes=Convert.FromBase64String(v.value);if(bytes.Length>4096)throw new InvalidDataException("二进制值过长。");v.value=Convert.ToBase64String(bytes);v.nativeType=1; }
    else if(v.type=="String") { if(v.value.Length>2047 || v.value.IndexOf('\0')>=0)throw new InvalidDataException("字符串无效。");v.nativeType=3; }
    else throw new InvalidDataException("不支持的参数类型："+v.type);
    result.Add(v);
   }
   return result.ToArray();
  }
  public static bool Equal(Value a,Value b) { return a.supported==b.supported && (!a.supported || (a.type==b.type && a.value==b.value)); }
  public static Preview Inspect(ISession session,Value[] values,string name) {
   var rows=new List<Row>();var fingerprint=new StringBuilder();int changed=0,skipped=0;
   foreach(var target in values) {
    var before=session.Read(target.id);var row=new Row {before=before,target=target};
    if(target.id==271929336 || target.id==550564838)row.reason="来源电脑的 GPU 绑定标识，禁止跨电脑导入";
    else if(!before.supported)row.reason="当前驱动不可读取此项，跳过";
    else if(before.type!=target.type)row.reason="当前驱动的参数类型与文件不同，跳过";
    else { target.nativeType=before.nativeType;row.changed=!Equal(before,target); }
    if(row.reason!="")skipped++;if(row.changed)changed++;
    fingerprint.Append(target.id).Append('|').Append(before.type).Append('|').Append(before.value).Append('|').Append(before.local).Append('|').Append(before.supported).Append('|').Append(target.type).Append('|').Append(target.value).Append('\n');
    rows.Add(row);
   }
   return new Preview {name=name,rows=rows.ToArray(),changed=changed,skipped=skipped,fingerprint=Hash(Encoding.UTF8.GetBytes(fingerprint.ToString()))};
  }
  static void Persist(string file,Backup backup) {
   Directory.CreateDirectory(Path.GetDirectoryName(file));
   using(var stream=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None)) { new XmlSerializer(typeof(Backup)).Serialize(stream,backup);stream.Flush(true); }
  }
  public static Backup ReadBackup(string file) {
   if(new FileInfo(file).Length>16777216)throw new InvalidDataException("备份过大。");
   var doc=Xml(File.ReadAllText(file,Encoding.UTF8),16777216);
   Backup backup;using(var reader=new XmlNodeReader(doc))backup=(Backup)new XmlSerializer(typeof(Backup)).Deserialize(reader);
   if(backup.schema!=1||backup.scope!="Base Profile"||backup.rows==null||backup.rows.Length<1||backup.rows.Length>1024)throw new InvalidDataException("备份格式无效。");
   var ids=new HashSet<uint>();foreach(var row in backup.rows)if(row.before==null||row.target==null||row.before.id!=row.target.id||!ids.Add(row.before.id))throw new InvalidDataException("备份参数无效。");
   return backup;
  }
  static void StageBefore(ISession session,Row row) { if(row.before.local)session.Set(row.before);else session.Remove(row.before.id); }
  static void Verify(ISession session,Row[] rows,bool original) {
   session.Reload();foreach(var row in rows) {
    var wanted=original?row.before:row.target;var actual=session.Read(wanted.id);
    if(!Equal(actual,wanted) || (original && actual.local!=wanted.local))throw new InvalidOperationException("保存后回读不一致：0x"+wanted.id.ToString("X8"));
   }
  }
  public static int Apply(ISession session,Value[] values,string name,string fingerprint,string backupPath) {
   var preview=Inspect(session,values,name);
   if(preview.fingerprint!=fingerprint)throw new InvalidOperationException("驱动设置在预览后发生变化，请重新预览。");
   var rows=new List<Row>();foreach(var row in preview.rows)if(row.changed)rows.Add(row);
   if(rows.Count==0)throw new InvalidOperationException("没有可应用的差异。");
   var backup=new Backup {name=name,createdAt=DateTime.UtcNow.ToString("o"),rows=rows.ToArray()};
   Persist(backupPath,backup); // Durable recovery record BEFORE any driver mutation/save.
   bool saving=false;
   try {
    foreach(var row in backup.rows)session.Set(row.target);
    saving=true;session.Save();Verify(session,backup.rows,false);return rows.Count;
   } catch(Exception error) {
    if(saving) {
     try { session.Reload();foreach(var row in backup.rows)StageBefore(session,row);session.Save();Verify(session,backup.rows,true); }
     catch(Exception recovery) { throw new InvalidOperationException(error.Message+"；回滚未完成，请从备份恢复："+Path.GetFileNameWithoutExtension(backupPath)+"；"+recovery.Message); }
    }
    throw new InvalidOperationException(error.Message+(saving?"；已回滚原值。":"；未提交驱动更改。"));
   }
  }
  public static int Restore(ISession session,Backup backup,string safetyBackup) {
   // Refuse to overwrite subsequent edits by the control panel/another tool.
   var currentRows=new List<Row>();
   foreach(var row in backup.rows) {
    var current=session.Read(row.before.id);
    if(!Equal(current,row.target)&&!Equal(current,row.before))throw new InvalidOperationException("此项在导入后被再次修改，未覆盖：0x"+row.before.id.ToString("X8"));
    currentRows.Add(new Row {before=current,target=row.before,changed=true});
   }
   Persist(safetyBackup,new Backup {name="恢复前保护备份",createdAt=DateTime.UtcNow.ToString("o"),rows=currentRows.ToArray()});
   bool saving=false;
   try { foreach(var row in backup.rows)StageBefore(session,row);saving=true;session.Save();Verify(session,backup.rows,true);return backup.rows.Length; }
   catch(Exception error) {
    if(saving) { try { session.Reload();foreach(var row in currentRows)StageBefore(session,row);session.Save();Verify(session,currentRows.ToArray(),true); }
     catch(Exception recovery) { throw new InvalidOperationException(error.Message+"；恢复失败且回滚未完成："+recovery.Message); } }
    throw;
   }
  }
 }

 // NVDRS_SETTING_V1: 2048 UTF-16 name, fixed 4100-byte value unions; no pointers in union.
 public sealed class NativeSession : ISession {
  [DllImport("nvapi64.dll",CallingConvention=CallingConvention.Cdecl)] static extern IntPtr nvapi_QueryInterface(uint id);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Init();
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Create(out IntPtr session);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int SessionFn(IntPtr session);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int BaseFn(IntPtr session,out IntPtr profile);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int GetFn(IntPtr session,IntPtr profile,uint id,IntPtr setting);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int SetFn(IntPtr session,IntPtr profile,IntPtr setting);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DeleteFn(IntPtr session,IntPtr profile,uint id);
  const int Size=12320,TypeOffset=4104,CurrentOffset=8220;
  IntPtr session,profile;SessionFn destroy,load,save;GetFn get;SetFn set;DeleteFn delete;BaseFn getBase;
  static T Api<T>(uint id) where T:class { var p=nvapi_QueryInterface(id);if(p==IntPtr.Zero)throw new InvalidOperationException("NVIDIA 驱动接口不可用");return Marshal.GetDelegateForFunctionPointer(p,typeof(T)) as T; }
  static void Check(int status) { if(status!=0)throw new InvalidOperationException("NVIDIA NVAPI 错误："+status); }
  public NativeSession() {
   if(IntPtr.Size!=8)throw new InvalidOperationException("需要 64 位 NVIDIA 驱动接口。");
   Check(Api<Init>(0x0150E828)());destroy=Api<SessionFn>(0xDAD9CFF8);load=Api<SessionFn>(0x375DBD6B);save=Api<SessionFn>(0xFCBC7E14);
   getBase=Api<BaseFn>(0xDA8466A0);get=Api<GetFn>(0x73BF8338);set=Api<SetFn>(0x577DD202);delete=Api<DeleteFn>(0xE4A26362);
   Check(Api<Create>(0x0694D52E)(out session));try{Reload();}catch{Dispose();throw;}
  }
  static IntPtr Buffer(uint id) { var p=Marshal.AllocHGlobal(Size);Marshal.Copy(new byte[Size],0,p,Size);Marshal.WriteInt32(p,Size|(1<<16));Marshal.WriteInt32(p,4100,unchecked((int)id));return p; }
  public Value Read(uint id) {
   var p=Buffer(id);try {
    int status=get(session,profile,id,p);if(status==-160)return new Value {id=id,supported=false};Check(status);
    var v=new Value {id=id,nativeType=Marshal.ReadInt32(p,TypeOffset),local=Marshal.ReadInt32(p,4108)==0 && Marshal.ReadInt32(p,4112)==0};
    var data=IntPtr.Add(p,CurrentOffset);
    if(v.nativeType==0) { v.type="Dword";v.value=unchecked((uint)Marshal.ReadInt32(data)).ToString(System.Globalization.CultureInfo.InvariantCulture); }
    else if(v.nativeType==1) { v.type="Binary";int length=Marshal.ReadInt32(data);if(length<0||length>4096)throw new InvalidDataException("驱动二进制长度无效。");var bytes=new byte[length];Marshal.Copy(IntPtr.Add(data,4),bytes,0,length);v.value=Convert.ToBase64String(bytes); }
    else if(v.nativeType==2||v.nativeType==3) { v.type="String";var bytes=new byte[4096];Marshal.Copy(data,bytes,0,bytes.Length);v.value=(v.nativeType==3?Encoding.Unicode:Encoding.Default).GetString(bytes).Split('\0')[0]; }
    else v.supported=false;
    return v;
   }finally{Marshal.FreeHGlobal(p);}
  }
  public void Set(Value v) {
   var p=Buffer(v.id);try {
    Marshal.WriteInt32(p,TypeOffset,v.nativeType);var data=IntPtr.Add(p,CurrentOffset);
    if(v.nativeType==0)Marshal.WriteInt32(data,unchecked((int)uint.Parse(v.value)));
    else if(v.nativeType==1) { var bytes=Convert.FromBase64String(v.value);if(bytes.Length>4096)throw new InvalidDataException("Binary too long");Marshal.WriteInt32(data,bytes.Length);Marshal.Copy(bytes,0,IntPtr.Add(data,4),bytes.Length); }
    else if(v.nativeType==2||v.nativeType==3) { var bytes=(v.nativeType==3?Encoding.Unicode:Encoding.Default).GetBytes(v.value+"\0");if(bytes.Length>4096)throw new InvalidDataException("String too long");Marshal.Copy(bytes,0,data,bytes.Length); }
    else throw new InvalidDataException("Unknown setting type");
    Check(set(session,profile,p));
   }finally{Marshal.FreeHGlobal(p);}
  }
  public void Remove(uint id) { Check(delete(session,profile,id)); }
  public void Save() { Check(save(session)); }
  public void Reload() { Check(load(session));Check(getBase(session,out profile)); }
  public void Dispose() { if(session!=IntPtr.Zero){destroy(session);session=IntPtr.Zero;} }
 }
}
