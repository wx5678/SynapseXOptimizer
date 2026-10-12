using System;
using System.IO;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
namespace SynapseX.DpcLab {
    public class DpcState {public string Status="idle",Message="尚未采样",Report="",Trace="",Until;}
    public static class DpcProbe {
        [StructLayout(LayoutKind.Sequential)] struct Wnode {public uint BufferSize,ProviderId;public ulong HistoricalContext;public long TimeStamp;public Guid Guid;public uint ClientContext,Flags;}
        [StructLayout(LayoutKind.Sequential)] struct Properties {public Wnode Wnode;public uint BufferSize,MinimumBuffers,MaximumBuffers,MaximumFileSize,LogFileMode,FlushTimer,EnableFlags;public int AgeLimit;public uint NumberOfBuffers,FreeBuffers,EventsLost,BuffersWritten,LogBuffersLost,RealTimeBuffersLost;public IntPtr LoggerThreadId;public uint LogFileNameOffset,LoggerNameOffset;}
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode)] static extern uint StartTrace(out ulong handle,string name,IntPtr properties);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode)] static extern uint ControlTrace(ulong handle,string name,IntPtr properties,uint code);
        static readonly object gate=new object();static DpcState state=new DpcState();static readonly ManualResetEvent stop=new ManualResetEvent(false);static Thread worker;static Process child;
        static string Quote(string s){return "\""+s.Replace("\"","")+"\"";}
        static string Run(string exe,string args){using(var p=new Process{StartInfo=new ProcessStartInfo(exe,args){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true}}){lock(gate){if(stop.WaitOne(0))throw new OperationCanceledException("诊断已停止，保留采样文件。");p.Start();child=p;}try{var output=p.StandardOutput.ReadToEndAsync();var error=p.StandardError.ReadToEndAsync();if(!p.WaitForExit(30000)){p.Kill();throw new TimeoutException("Xperf 分析超过 30 秒。");}if(p.ExitCode!=0)throw new InvalidOperationException(error.Result+output.Result);return output.Result;}finally{lock(gate)child=null;}}}
        static IntPtr Buffer(string trace,string name) {
            int size=Marshal.SizeOf(typeof(Properties));IntPtr p=Marshal.AllocHGlobal(size+8192);
            byte[] zero=new byte[size+8192];Marshal.Copy(zero,0,p,zero.Length);
            var props=new Properties{Wnode=new Wnode{BufferSize=(uint)zero.Length,Guid=Guid.NewGuid(),ClientContext=1,Flags=0x20000},BufferSize=64,MinimumBuffers=16,MaximumBuffers=64,MaximumFileSize=128,LogFileMode=0x02000000|2,FlushTimer=1,EnableFlags=0x67,LoggerNameOffset=(uint)size,LogFileNameOffset=(uint)size+4096};
            Marshal.StructureToPtr(props,p,false);byte[] filename=System.Text.Encoding.Unicode.GetBytes(trace+"\0"),logger=System.Text.Encoding.Unicode.GetBytes(name+"\0");if(filename.Length>4096||logger.Length>4096){Marshal.FreeHGlobal(p);throw new ArgumentException("诊断路径过长。");}Marshal.Copy(logger,0,IntPtr.Add(p,size),logger.Length);Marshal.Copy(filename,0,IntPtr.Add(p,size+4096),filename.Length);return p;
        }
        public static DpcState State(){lock(gate)return new DpcState{Status=state.Status,Message=state.Message,Report=state.Report,Trace=state.Trace,Until=state.Until};}
        public static DpcState Start(string root,string xperf) {
            lock(gate){if(worker!=null&&worker.IsAlive)throw new InvalidOperationException("采样或分析正在进行。");if(!File.Exists(xperf))throw new FileNotFoundException("请先安装 Windows Performance Toolkit 中的 Xperf。");
                Directory.CreateDirectory(root);string name="SynapseX-DPC-"+Guid.NewGuid().ToString("N");string trace=Path.Combine(Path.GetFullPath(root),name+".etl");string ownership=Path.Combine(root,"active-dpc.txt");
                if(File.Exists(ownership))throw new InvalidOperationException("有上次未结束的诊断记录，请先重连本地服务恢复。");
                stop.Reset();state=new DpcState{Status="running",Message="采样 15 秒，不更改驱动设置；最多保留 128 MB 本地跟踪。",Trace=trace,Until=DateTime.UtcNow.AddSeconds(15).ToString("o")};
                worker=new Thread(()=>{
                    IntPtr b=IntPtr.Zero;ulong handle=0;bool started=false,ownsRecord=false;
                    try {
                        b=Buffer(trace,name);using(var stream=new FileStream(ownership,FileMode.CreateNew,FileAccess.Write,FileShare.Read)){ownsRecord=true;using(var writer=new StreamWriter(stream)){writer.WriteLine(name);writer.WriteLine(trace);writer.WriteLine(Process.GetCurrentProcess().Id);writer.WriteLine(Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks);writer.Flush();stream.Flush(true);}}
                        uint code=StartTrace(out handle,name,b);if(code!=0)throw new Win32Exception((int)code,"DPC 采样启动失败："+new Win32Exception((int)code).Message);started=true;
                        stop.WaitOne(15000);
                        code=ControlTrace(handle,name,b,1);if(code!=0)throw new Win32Exception((int)code,"停止自己的 ETW 会话失败");started=false;
                        var props=(Properties)Marshal.PtrToStructure(b,typeof(Properties));File.Delete(ownership);
                        lock(gate){state.Status="analyzing";state.Message="采样结束，正在生成 DPC / ISR 模块统计。";}
                        string merged=Path.ChangeExtension(trace,"merged.etl");Run(xperf,"-merge "+Quote(trace)+" "+Quote(merged));
                        string report=Run(xperf,"-i "+Quote(merged)+" -a dpcisr -summary");File.WriteAllText(Path.ChangeExtension(trace,"txt"),report);
                        lock(gate){state.Status="complete";state.Report=report.Length>120000?report.Substring(0,120000):report;state.Trace=merged;state.Message="DPC / ISR 统计已生成；这是驱动执行耗时，不是游戏延迟。丢失事件："+props.EventsLost+"。模块无法解析时保留原始地址，不猜测驱动。";}
                    }catch(Exception e){lock(gate){state.Status="error";state.Message=e.Message;}}
                    finally {try{if(started&&b!=IntPtr.Zero){uint code=ControlTrace(handle,name,b,1);if(code==0||code==4201)started=false;}if(ownsRecord&&!started&&File.Exists(ownership))File.Delete(ownership);}catch(Exception e){lock(gate){state.Status="error";state.Message="诊断收尾待处理："+e.Message;}}finally{if(b!=IntPtr.Zero)Marshal.FreeHGlobal(b);}}
                });worker.IsBackground=true;worker.Start();return State();
            }
        }
        public static void Recover(string root) {
            string file=Path.Combine(root,"active-dpc.txt");if(!File.Exists(file))return;
            var lines=File.ReadAllLines(file);if(lines.Length!=4||!System.Text.RegularExpressions.Regex.IsMatch(lines[0],"^SynapseX-DPC-[a-f0-9]{32}$")||Path.GetDirectoryName(Path.GetFullPath(lines[1]))!=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar))throw new InvalidDataException("DPC 恢复记录无效。");
            int owner=int.Parse(lines[2]);try{using(var p=Process.GetProcessById(owner))if(p.StartTime.ToUniversalTime().Ticks.ToString()==lines[3])return;}catch(ArgumentException){}
            IntPtr b=Buffer(lines[1],lines[0]);try{uint code=ControlTrace(0,lines[0],b,0);if(code==4201){File.Delete(file);return;}if(code!=0)throw new Win32Exception((int)code);
                var props=(Properties)Marshal.PtrToStructure(b,typeof(Properties));string actual=Marshal.PtrToStringUni(IntPtr.Add(b,(int)props.LogFileNameOffset));if(!string.Equals(actual,lines[1],StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("日志目标变化，未停止其他会话。");
                code=ControlTrace(0,lines[0],b,1);if(code!=0)throw new Win32Exception((int)code);File.Delete(file);
            }finally{Marshal.FreeHGlobal(b);}
        }
        public static void Stop(){stop.Set();Thread t;lock(gate){t=worker;try{if(child!=null&&!child.HasExited)child.Kill();}catch{}}if(t!=null&&t.IsAlive)t.Join(3000);}
    }
}
