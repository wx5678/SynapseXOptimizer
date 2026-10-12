// Independently implemented against documented Windows process/CPU-set/D3DKMT APIs.
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text.RegularExpressions;
using System.Threading;
using System.Xml;
using System.Xml.Serialization;

namespace SynapseX.SessionLab {
    public class CpuSet { public uint Id; public int Group, Logical, Core, Cache, Efficiency; public bool Available; }
    public class ProcessInfo { public int Id; public string Created, Name, Path; }
    public class Setting {
        public ProcessInfo Target; public string Kind, Original, Applied, Status="prepared", Message="";
    }
    public class Journal {
        public int Version=1, Owner; public long OwnerCreated; public string Id, Started, Until, Mode, Status="idle", Message="";
        public ProcessInfo Game; public List<Setting> Settings=new List<Setting>();
    }
    public class Candidate { public ProcessInfo Target; public double CpuPercent; public string Status="watching", Message=""; }
    public class SessionState { public Journal Session; public Candidate[] Candidates; public int TickMs=2000; }
    public class TrimResult { public int ProcessId; public long BeforeBytes, AfterBytes; public string Note="工作集会按后续访问重新载入；不代表释放了进程提交内存，也不能还原原先驻留的页面。"; }
    public static class Native {
        [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int id);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
        [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr h,out long c,out long e,out long k,out long u);
        [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetPriorityClass(IntPtr h);
        [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetPriorityClass(IntPtr h,uint v);
        [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessInformation(IntPtr h,int kind,[In,Out] uint[] value,uint size);
        [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetProcessInformation(IntPtr h,int kind,uint[] value,uint size);
        [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessDefaultCpuSets(IntPtr h,[Out] uint[] ids,uint count,out uint needed);
        [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetProcessDefaultCpuSets(IntPtr h,uint[] ids,uint count);
        [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetSystemCpuSetInformation(IntPtr data,uint size,out uint needed,IntPtr process,uint flags);
        [DllImport("gdi32.dll")] static extern int D3DKMTGetProcessSchedulingPriorityClass(IntPtr h,out int value);
        [DllImport("gdi32.dll")] static extern int D3DKMTSetProcessSchedulingPriorityClass(IntPtr h,int value);
        [DllImport("psapi.dll",SetLastError=true)] static extern bool EmptyWorkingSet(IntPtr h);
        // Native information class 33 (ProcessIoPriority). Optional, gated by query/readback.
        [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h,int kind,out uint value,uint size,out uint returned);
        [DllImport("ntdll.dll")] static extern int NtSetInformationProcess(IntPtr h,int kind,ref uint value,uint size);
        [DllImport("ntdll.dll",EntryPoint="NtQueryInformationProcess")] static extern int NtQueryProcessPower(IntPtr h,int kind,[In,Out] uint[] value,uint size,out uint returned);
        [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr h,uint access,out IntPtr token);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out int pid);
        public static int Foreground() { int pid;GetWindowThreadProcessId(GetForegroundWindow(),out pid);return pid; }
        static Exception Error(string op) { int code=Marshal.GetLastWin32Error();return new Win32Exception(code,op+": "+new Win32Exception(code).Message+" ("+code+")"); }
        static long Created(IntPtr h) {long c,e,k,u;if(!GetProcessTimes(h,out c,out e,out k,out u))throw Error("GetProcessTimes");return c;}
        public static bool Exited(ProcessInfo p) {
            try {using(var process=Process.GetProcessById(p.Id))return process.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()!=p.Created;}
            catch(ArgumentException){return true;}
            // Access denied is not evidence that the process exited.
        }
        public static string ValidatePath(string path) {
            path=System.IO.Path.GetFullPath(path);
            if(!File.Exists(path) || !path.EndsWith(".exe",StringComparison.OrdinalIgnoreCase))throw new ArgumentException("请选择存在的 EXE 文件。");
            string windows=Environment.GetFolderPath(Environment.SpecialFolder.Windows).TrimEnd('\\')+"\\";
            if(path.StartsWith(windows,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("系统目录程序不参与调度实验。");
            if(Regex.IsMatch(System.IO.Path.GetFileNameWithoutExtension(path),"anticheat|easyanticheat|battleye|vgc|vgtray|ace-base|tenprotect|tguard|synapsex|presentmon|clash|uuaccelerator|qiyou|leigod|wegame|steam|epicgameslauncher",RegexOptions.IgnoreCase))throw new InvalidOperationException("保护组件、启动器、加速器及本软件不参与后台调度。");
            return path;
        }
        static IntPtr Open(int id,uint write) {
            if(id<=4 || id==Process.GetCurrentProcess().Id)throw new InvalidOperationException("不能调整系统进程或服务自身。");
            IntPtr h=OpenProcess(0x1000u|write,false,id);if(h==IntPtr.Zero)throw Error("OpenProcess");
            try {
                using(var process=Process.GetProcessById(id)) {
                    if(process.SessionId!=Process.GetCurrentProcess().SessionId)throw new InvalidOperationException("不能调整其他会话。");
                    ValidatePath(process.MainModule.FileName);
                }
                IntPtr token;if(!OpenProcessToken(h,8,out token))throw Error("OpenProcessToken");
                try {using(var owner=new WindowsIdentity(token))using(var self=WindowsIdentity.GetCurrent())if(!owner.User.Equals(self.User))throw new InvalidOperationException("不能调整其他用户的进程。");}
                finally {CloseHandle(token);}
                return h;
            } catch {CloseHandle(h);throw;}
        }
        public static ProcessInfo Inspect(int id) {
            IntPtr h=Open(id,0);try{using(var process=Process.GetProcessById(id))return new ProcessInfo{Id=id,Created=Created(h).ToString(),Name=process.ProcessName,Path=process.MainModule.FileName};}finally{CloseHandle(h);}
        }
        static IntPtr Match(ProcessInfo target,uint write) {
            IntPtr h=Open(target.Id,write);if(Created(h).ToString()!=target.Created){CloseHandle(h);throw new InvalidOperationException("进程身份已变化。");}return h;
        }
        public static double CpuMs(ProcessInfo target) {
            IntPtr h=Match(target,0);try{long c,e,k,u;if(!GetProcessTimes(h,out c,out e,out k,out u))throw Error("GetProcessTimes");return (k+u)/10000.0;}finally{CloseHandle(h);}
        }
        public static CpuSet[] Topology() {
            uint size;GetSystemCpuSetInformation(IntPtr.Zero,0,out size,IntPtr.Zero,0);
            if(size==0 || size>16777216)throw Error("GetSystemCpuSetInformation");
            IntPtr b=Marshal.AllocHGlobal((int)size);
            try {
                if(!GetSystemCpuSetInformation(b,size,out size,IntPtr.Zero,0))throw Error("GetSystemCpuSetInformation");
                var rows=new List<CpuSet>();
                for(int off=0;off+8<=size;) {
                    IntPtr item=IntPtr.Add(b,off);int len=Marshal.ReadInt32(item);
                    if(len<8 || (long)off+len>size)throw new InvalidDataException("CPU topology data invalid");
                    if(Marshal.ReadInt32(item,4)==0 && len>=32) {
                        byte flags=Marshal.ReadByte(item,19);
                        rows.Add(new CpuSet{Id=unchecked((uint)Marshal.ReadInt32(item,8)),Group=(ushort)Marshal.ReadInt16(item,12),Logical=Marshal.ReadByte(item,14),Core=Marshal.ReadByte(item,15),Cache=Marshal.ReadByte(item,16),Efficiency=Marshal.ReadByte(item,18),Available=(flags&2)==0});
                    }off+=len;
                }return rows.ToArray();
            }finally{Marshal.FreeHGlobal(b);}
        }
        static string CpuRead(IntPtr h) {
            uint n;bool ok=GetProcessDefaultCpuSets(h,null,0,out n);if(!ok && Marshal.GetLastWin32Error()!=122)throw Error("GetProcessDefaultCpuSets");
            if(n>65536)throw new InvalidDataException("CPU count invalid");if(n==0)return "";
            uint[] a=new uint[n];if(!GetProcessDefaultCpuSets(h,a,n,out n))throw Error("GetProcessDefaultCpuSets");Array.Sort(a);return string.Join(",",a.Select(x=>x.ToString()).ToArray());
        }
        public static string Read(ProcessInfo target,string kind) {IntPtr h=Match(target,0x400u|(kind=="gpu"?0x200u:0u));try{return ReadHandle(h,kind);}finally{CloseHandle(h);}}
        static string ReadHandle(IntPtr h,string kind) {
            if(kind=="cpus")return CpuRead(h);
            if(kind=="io"){uint value,returned;int status=NtQueryInformationProcess(h,33,out value,4,out returned);if(status!=0||returned!=4)throw new InvalidOperationException("IO 调度查询失败，NTSTATUS 0x"+unchecked((uint)status).ToString("X8"));return value.ToString();}
            if(kind=="cpu"){uint value=GetPriorityClass(h);if(value==0)throw Error("GetPriorityClass");return value.ToString();}
            if(kind=="gpu"){int value;int status=D3DKMTGetProcessSchedulingPriorityClass(h,out value);if(status!=0)throw new InvalidOperationException("GPU 调度查询失败，NTSTATUS 0x"+unchecked((uint)status).ToString("X8"));return value.ToString();}
            if(kind!="memory" && kind!="eco")throw new ArgumentException("Unknown setting");
            uint[] a=kind=="eco"?new uint[]{1,0,0}:new uint[]{0};
            if(!GetProcessInformation(h,kind=="eco"?4:0,a,(uint)a.Length*4)){
                if(kind!="eco")throw Error("GetProcessInformation "+kind);
                uint returned;int status=NtQueryProcessPower(h,77,a,12,out returned);
                if(status!=0 || returned!=12 || a[0]!=1 || (a[1]&~3u)!=0 || (a[2]&~3u)!=0)throw new InvalidOperationException("节能调度原值无法可靠读取，NTSTATUS 0x"+unchecked((uint)status).ToString("X8"));
            }
            return string.Join(",",a.Select(x=>x.ToString()).ToArray());
        }
        public static string Desired(ProcessInfo target,string kind,string old,uint[] ids) {
            if(kind=="cpus") {
                var available=new HashSet<uint>(Topology().Where(x=>x.Available).Select(x=>x.Id));
                if(ids==null || ids.Length==0 || ids.Any(x=>!available.Contains(x)))throw new ArgumentException("请选择本机可用的 CPU 核心。");
                return string.Join(",",ids.Distinct().OrderBy(x=>x).Select(x=>x.ToString()).ToArray());
            }
            if(kind=="cpu"){if(old!="32" && old!="32768" && old!="16384")throw new InvalidOperationException("当前 CPU 优先级不适合让步。");return "16384";}
            if(kind=="io"){uint v=uint.Parse(old);if(v>2)throw new InvalidOperationException("当前 IO 优先级不适合让步。");return Math.Min(v,1u).ToString();}
            if(kind=="memory"){uint v=uint.Parse(old);if(v<1||v>5)throw new InvalidDataException("Memory priority invalid");return Math.Min(v,2u).ToString();}
            if(kind=="gpu"){int v=int.Parse(old);if(v<0||v>3)throw new InvalidOperationException("当前 GPU 优先级不适合让步。");return Math.Min(v,1).ToString();}
            if(kind=="eco"){var a=old.Split(',').Select(uint.Parse).ToArray();if(a.Length!=3||a[0]!=1)throw new InvalidDataException("EcoQoS version invalid");a[1]|=1;a[2]|=1;return string.Join(",",a.Select(x=>x.ToString()).ToArray());}
            throw new ArgumentException("Unknown setting");
        }
        public static void Write(ProcessInfo target,string kind,string expected,string value) {
            IntPtr h=Match(target,0x200|0x2000|0x400);
            try {
                if(ReadHandle(h,kind)!=expected)throw new InvalidOperationException("设置被其他程序改动，未覆盖。");
                bool ok;
                if(kind=="cpus"){uint[] a=value.Length==0?new uint[0]:value.Split(',').Select(uint.Parse).ToArray();ok=SetProcessDefaultCpuSets(h,a.Length==0?null:a,(uint)a.Length);}
                else if(kind=="cpu")ok=SetPriorityClass(h,uint.Parse(value));
                else if(kind=="io"){uint v=uint.Parse(value);int status=NtSetInformationProcess(h,33,ref v,4);if(status!=0)throw new InvalidOperationException("IO 调度写入失败，NTSTATUS 0x"+unchecked((uint)status).ToString("X8"));ok=true;}
                else if(kind=="gpu"){int status=D3DKMTSetProcessSchedulingPriorityClass(h,int.Parse(value));if(status!=0)throw new InvalidOperationException("GPU 调度写入失败，NTSTATUS 0x"+unchecked((uint)status).ToString("X8"));ok=true;}
                else {uint[] a=value.Split(',').Select(uint.Parse).ToArray();ok=SetProcessInformation(h,kind=="eco"?4:0,a,(uint)a.Length*4);}
                if(!ok)throw Error("Write "+kind);
                if(ReadHandle(h,kind)!=value)throw new InvalidOperationException("写入后回读不一致。");
            }finally{CloseHandle(h);}
        }
        public static TrimResult Trim(ProcessInfo target) {
            IntPtr h=Match(target,0x100|0x400);
            try {using(var p=Process.GetProcessById(target.Id)){p.Refresh();long before=p.WorkingSet64;if(!EmptyWorkingSet(h))throw Error("EmptyWorkingSet");p.Refresh();return new TrimResult{ProcessId=target.Id,BeforeBytes=before,AfterBytes=p.WorkingSet64};}}
            finally{CloseHandle(h);}
        }
    }
    public sealed class Engine {
        readonly object gate=new object();readonly string file;readonly Mutex mutex;
        Journal journal=new Journal();Timer timer;long generation;List<Candidate> candidates=new List<Candidate>();
        readonly Dictionary<int,double> cpu=new Dictionary<int,double>();readonly Stopwatch clock=Stopwatch.StartNew();double lastTick;
        string[] kinds=new string[0], whitelist=new string[0];double threshold;
        public Engine(string root) {
            Directory.CreateDirectory(root);file=Path.Combine(Path.GetFullPath(root),"session.xml");
            using(var hash=System.Security.Cryptography.SHA256.Create())mutex=new Mutex(false,"Local\\SynapseX-Session-"+BitConverter.ToString(hash.ComputeHash(System.Text.Encoding.UTF8.GetBytes(file.ToLowerInvariant()))).Replace("-",""));
            Exclusive(()=>{if(File.Exists(file)){journal=Load();CheckOwner();if(journal.Status=="active" && journal.Owner==Process.GetCurrentProcess().Id && journal.OwnerCreated==Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks)throw new InvalidOperationException("本地服务已有活动会话实例。");RestoreCore();}});
        }
        void Exclusive(Action action) {lock(gate){bool held=false;try{try{held=mutex.WaitOne(0);}catch(AbandonedMutexException){held=true;}if(!held)throw new InvalidOperationException("另一服务正在处理会话。");action();}finally{if(held)mutex.ReleaseMutex();}}}
        Journal Load(){using(var reader=XmlReader.Create(file,new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=2000000}))return (Journal)new XmlSerializer(typeof(Journal)).Deserialize(reader);}
        void CheckOwner() {
            if(journal.Version!=1 || journal.Settings.Count>512)throw new InvalidDataException("实验恢复记录无效。");
            if(journal.Status!="active" && journal.Status!="restore-failed")return;
            if(journal.Owner==Process.GetCurrentProcess().Id && journal.OwnerCreated==Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks)return;
            try{using(var p=Process.GetProcessById(journal.Owner))if(p.StartTime.ToUniversalTime().Ticks==journal.OwnerCreated)throw new InvalidOperationException("另一服务拥有本次实验，请在那里停止。");}catch(ArgumentException){}
        }
        void SyncRecord() {
            if(!File.Exists(file))return;var disk=Load();
            if(disk.Id==journal.Id && disk.Owner==journal.Owner)return;
            if(timer!=null)throw new InvalidOperationException("活动会话恢复记录已被外部更改。");
            var old=journal;journal=disk;
            try{CheckOwner();}catch{journal=old;throw;}
            if(journal.Status=="active" || journal.Status=="restore-failed")RestoreCore();
        }
        void Save() {
            string pending=file+".pending";
            using(var stream=new FileStream(pending,FileMode.Create,FileAccess.Write,FileShare.None)){new XmlSerializer(typeof(Journal)).Serialize(stream,journal);stream.Flush(true);}
            if(File.Exists(file))File.Replace(pending,file,null);else File.Move(pending,file);
        }
        public SessionState State() {SessionState result=null;Exclusive(()=>{
            SyncRecord();
            // Round-trip a copy: the timer must never mutate a response during serialization.
            using(var text=new StringWriter()){new XmlSerializer(typeof(Journal)).Serialize(text,journal);using(var reader=new StringReader(text.ToString()))result=new SessionState{Session=(Journal)new XmlSerializer(typeof(Journal)).Deserialize(reader),Candidates=candidates.Select(x=>new Candidate{Target=x.Target,CpuPercent=x.CpuPercent,Status=x.Status,Message=x.Message}).ToArray()};}
        });return result;}
        void Begin(ProcessInfo game,int seconds,string mode) {
            if(timer!=null || journal.Status=="active" || journal.Status=="restore-failed")throw new InvalidOperationException("请先停止并恢复现有会话。");
            if(seconds<30 || seconds>14400)throw new ArgumentException("实验时长需为 30 秒至 4 小时。");
            if(File.Exists(file)){journal=Load();CheckOwner();RestoreCore();if(journal.Status=="restore-failed")throw new InvalidOperationException("有尚未恢复的记录。");}
            var fresh=Native.Inspect(game.Id);if(fresh.Created!=game.Created)throw new InvalidOperationException("目标已重新启动。");
            journal=new Journal{Id=Guid.NewGuid().ToString("N"),Owner=Process.GetCurrentProcess().Id,OwnerCreated=Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks,Started=DateTime.UtcNow.ToString("o"),Until=DateTime.UtcNow.AddSeconds(seconds).ToString("o"),Mode=mode,Game=game,Status="active",Message="会话运行中；退出游戏或到时恢复。"};
            candidates.Clear();cpu.Clear();Save();
        }
        void Arm(){long token=++generation;lastTick=clock.Elapsed.TotalMilliseconds;timer=new Timer(_=>{try{Exclusive(()=>{if(token==generation)Tick();});}catch(Exception e){lock(gate)journal.Message="会话检查失败："+e.Message;try{Exclusive(()=>{if(token==generation)RestoreCore();});}catch{lock(gate)journal.Status="restore-failed";}}},null,2000,2000);}
        void Apply(ProcessInfo target,string kind,uint[] ids) {
            string old=Native.Read(target,kind),applied=Native.Desired(target,kind,old,ids);
            if(old==applied)return;
            var row=journal.Settings.FirstOrDefault(x=>x.Target.Id==target.Id && x.Target.Created==target.Created && x.Kind==kind);
            if(row!=null && row.Status!="restored" && row.Status!="exited")return;
            if(row==null){if(journal.Settings.Count>=512)throw new InvalidOperationException("记录数量达到本次会话上限。");row=new Setting{Target=target,Kind=kind};journal.Settings.Add(row);}
            row.Original=old;row.Applied=applied;row.Status="prepared";row.Message="";Save(); // Write-ahead recovery, including ambiguous write/readback errors.
            try{Native.Write(target,kind,old,applied);row.Status="applied";row.Message="已回读确认";Save();}
            catch(Exception e){row.Message=e.Message;RestoreRow(row);Save();throw;}
        }
        void RestoreRow(Setting row) {
            if(row.Status=="restored" || row.Status=="exited")return;
            try{
                if(row.Target==null || row.Kind==null || !new[]{"cpu","cpus","memory","eco","gpu","io"}.Contains(row.Kind))throw new InvalidDataException("恢复项无效。");
                if(Native.Exited(row.Target)){row.Status="exited";row.Message="原实例已退出";return;}
                string actual=Native.Read(row.Target,row.Kind);
                if(actual!=row.Original)Native.Write(row.Target,row.Kind,row.Applied,row.Original);
                row.Status="restored";row.Message="已回读恢复原值";
            }catch(Exception e){row.Status="restore-failed";row.Message=e.Message;}
        }
        void RestoreCore() {
            ++generation;if(timer!=null){timer.Dispose();timer=null;}
            foreach(var row in journal.Settings.AsEnumerable().Reverse())RestoreRow(row);
            journal.Status=journal.Settings.Any(x=>x.Status=="restore-failed")?"restore-failed":"restored";
            journal.Message=journal.Status=="restored"?"本次实验设置已恢复。":"部分设置恢复失败，请检查明细后重试。";
            if(journal.Id!=null)Save(); // Retain the last session report and precise recovery failures.
        }
        public SessionState Stop(){Exclusive(()=>{SyncRecord();CheckOwner();RestoreCore();});return State();}
        public SessionState StartSingle(ProcessInfo target,string kind,uint[] ids,int seconds) {
            Exclusive(()=>{Begin(target,seconds,"single");try{Apply(target,kind,ids);Arm();}catch{RestoreCore();throw;}});return State();
        }
        public SessionState StartSession(ProcessInfo game,ProcessInfo[] targets,string[] excluded,string[] selectedKinds,double percent,int seconds) {
            Exclusive(()=>{
                if(targets==null || targets.Length<1 || targets.Length>32 || selectedKinds.Length==0 || selectedKinds.Any(x=>!new[]{"cpu","eco","memory","gpu","io"}.Contains(x)))throw new ArgumentException("请选择 1–32 个后台程序和调度项目。");
                if(percent<0||percent>100)throw new ArgumentException("CPU 阈值无效。");
                foreach(var target in targets){var fresh=Native.Inspect(target.Id);if(fresh.Created!=target.Created || target.Id==game.Id || string.Equals(target.Path,game.Path,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("不能将游戏本体或已重启的程序作为后台目标。");}
                Begin(game,seconds,"background-session");kinds=selectedKinds;whitelist=excluded??new string[0];threshold=percent;
                try {foreach(var target in targets.Distinct()) {candidates.Add(new Candidate{Target=target});cpu[target.Id]=Native.CpuMs(target);}Arm();}catch{RestoreCore();throw;}
            });return State();
        }
        void Tick() {
            if(journal.Status!="active")return;
            if(DateTime.UtcNow>=DateTime.Parse(journal.Until).ToUniversalTime() || Native.Exited(journal.Game)){RestoreCore();return;}
            double now=clock.Elapsed.TotalMilliseconds,elapsed=now-lastTick;lastTick=now;
            if(journal.Mode!="background-session")return;
            int foreground=Native.Foreground();
            foreach(var candidate in candidates) {
                try {
                    if(Native.Exited(candidate.Target)){foreach(var r in journal.Settings.Where(x=>x.Target.Id==candidate.Target.Id))RestoreRow(r);candidate.Status="exited";continue;}
                    double value=Native.CpuMs(candidate.Target),previous;cpu.TryGetValue(candidate.Target.Id,out previous);cpu[candidate.Target.Id]=value;
                    candidate.CpuPercent=Math.Round(Math.Max(0,(value-previous)/Math.Max(1,elapsed)*100),1); // Percent of one logical processor; not normalized total CPU.
                    bool protectedNow=foreground==candidate.Target.Id || whitelist.Contains(candidate.Target.Path,StringComparer.OrdinalIgnoreCase);
                    if(protectedNow){foreach(var row in journal.Settings.Where(x=>x.Target.Id==candidate.Target.Id))RestoreRow(row);candidate.Status="exempt";candidate.Message="前台程序或白名单，恢复原设置";}
                    else if(candidate.Status=="error")continue; // No repeated failing writes every tick.
                    else if(candidate.CpuPercent>=threshold){foreach(string kind in kinds)Apply(candidate.Target,kind,null);candidate.Status="applied";candidate.Message="调度已检查；详见回读记录";}
                    else {candidate.Status="watching";candidate.Message="低于触发阈值；已应用项目保持到会话结束";}
                }catch(Exception e){candidate.Status="error";candidate.Message=e.Message;}
            }
            if(journal.Settings.Any(x=>x.Status=="restore-failed")){RestoreCore();return;}
            // No journal rewrite for unchanged CPU samples; Apply/restore events alone persist.
            if(candidates.Any(x=>x.Status=="exempt" || x.Status=="exited"))Save();
        }
    }
}
