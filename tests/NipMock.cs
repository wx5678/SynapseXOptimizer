using System;
using System.IO;
using System.Collections.Generic;
using SynapseX.Nip;
public class NipMock : ISession {
 public Dictionary<uint,Value> disk=new Dictionary<uint,Value>(),stage=new Dictionary<uint,Value>(),defaults=new Dictionary<uint,Value>();
 public int saves,sets,removes;public string failure="";public string backupPath="";
 public static Value Copy(Value v){return new Value {id=v.id,type=v.type,value=v.value,nativeType=v.nativeType,local=v.local,supported=v.supported};}
 public NipMock(){disk[1]=new Value {id=1,value="5",local=true};disk[2]=new Value {id=2,value="0",local=false};defaults[2]=Copy(disk[2]);Reload();}
 public Value Read(uint id){if(!stage.ContainsKey(id))return new Value {id=id,supported=false};return Copy(stage[id]);}
 public void Set(Value value){if(backupPath!=""&&!File.Exists(backupPath))throw new Exception("Backup missing before write");sets++;if(failure=="set")throw new Exception("Mock set failure");stage[value.id]=Copy(value);stage[value.id].local=true;}
 public void Remove(uint id){removes++;stage[id]=Copy(defaults[id]);}
 public void Save(){saves++;disk.Clear();foreach(var p in stage)disk[p.Key]=Copy(p.Value);if(saves==1&&failure=="verify")disk[1].value="404";if((saves==1&&failure=="save")||failure=="rollback")throw new Exception("Mock save failure");}
 public void Reload(){stage.Clear();foreach(var p in disk)stage[p.Key]=Copy(p.Value);}
 public void Dispose(){}
}
public static class NipEngineTests {
 static void Check(bool ok,string message){if(!ok)throw new Exception(message);}
 static void Fails(Action action,string message){bool failed=false;try{action();}catch{failed=true;}Check(failed,message);}
 static Value[] Targets(){return new[]{new Value {id=1,value="10"},new Value {id=2,value="1"},new Value {id=3,value="5"},new Value {id=550564838,type="String",value="another GPU"}};}
 public static int Run(string root){int cases=0;
  foreach(var mode in new[]{"ok","set","save","verify","rollback"}){
   var mock=new NipMock {failure=mode,backupPath=Path.Combine(root,mode+".xml")};var values=Targets();var preview=Importer.Inspect(mock,values,"test");
   Check(preview.changed==2&&preview.skipped==2,"Diff/skip counts");
   if(mode=="ok"){
    Check(Importer.Apply(mock,values,"test",preview.fingerprint,mock.backupPath)==2,"Apply count");
    Check(mock.disk[1].value=="10"&&mock.disk[2].value=="1","Apply values");
    var backup=Importer.ReadBackup(mock.backupPath);mock.backupPath=Path.Combine(root,"restore-safety.xml");
    Check(Importer.Restore(mock,backup,mock.backupPath)==2,"Restore count");Check(mock.disk[1].value=="5"&&!mock.disk[2].local,"Restore original value and inheritance");
    mock.disk[1].value="99";mock.Reload();int writes=mock.sets;
    Fails(()=>Importer.Restore(mock,backup,Path.Combine(root,"conflict.xml")),"Restore must reject later edits");Check(mock.sets==writes,"Conflict wrote values");
   }else{
    Fails(()=>Importer.Apply(mock,values,"test",preview.fingerprint,mock.backupPath),"Failed write accepted");
    if(mode!="rollback")Check(mock.disk[1].value=="5"&&!mock.disk[2].local,"Rollback did not preserve original");
    if(mode=="set")Check(mock.saves==0,"Set failure must not save");
   }cases++;
  }
  {var mock=new NipMock();var values=Targets();var p=Importer.Inspect(mock,values,"test");mock.stage[1].value="9";Fails(()=>Importer.Apply(mock,values,"test",p.fingerprint,Path.Combine(root,"stale.xml")),"Stale preview accepted");Check(mock.sets==0&&mock.saves==0,"Stale preview writes");cases++;}
  {var mock=new NipMock();var values=Targets();var p=Importer.Inspect(mock,values,"test");string blocker=Path.Combine(root,"not-a-directory");File.WriteAllText(blocker,"block");Fails(()=>Importer.Apply(mock,values,"test",p.fingerprint,Path.Combine(blocker,"backup.xml")),"Backup failure accepted");Check(mock.sets==0&&mock.saves==0,"Wrote without backup");cases++;}
  {var mock=new NipMock();var values=new[]{new Value{id=1,value="5"}};var p=Importer.Inspect(mock,values,"same");Fails(()=>Importer.Apply(mock,values,"same",p.fingerprint,Path.Combine(root,"noop.xml")),"Noop accepted");Check(mock.saves==0,"Noop saved");cases++;}
  return cases;
 }
}
