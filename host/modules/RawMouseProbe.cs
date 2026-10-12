using System;
using System.Linq;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
namespace SynapseX.InputLab {
    public class MouseRow {public string Device;public int Reports;public double ObservedHz, MedianIntervalMs, P95IntervalMs, SpanMs;}
    public class ProbeState {public string Status="idle",Message="尚未测试",Until;public MouseRow[] Devices=new MouseRow[0];}
    public static class RawMouseProbe {
        [StructLayout(LayoutKind.Sequential)] struct Device {public ushort Page,Usage;public uint Flags;public IntPtr Target;}
        [DllImport("user32.dll",SetLastError=true)] static extern bool RegisterRawInputDevices(Device[] devices,uint count,uint size);
        [DllImport("user32.dll",SetLastError=true)] static extern uint GetRawInputData(IntPtr raw,uint command,IntPtr data,ref uint size,uint headerSize);
        [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetRawInputDeviceInfo(IntPtr device,uint command,System.Text.StringBuilder data,ref uint size);
        static readonly object gate=new object();static ProbeState state=new ProbeState();static bool stop;
        class ProbeWindow:NativeWindow,IDisposable {
            public readonly Dictionary<string,List<double>> Samples=new Dictionary<string,List<double>>();
            readonly Dictionary<IntPtr,string> names=new Dictionary<IntPtr,string>();readonly Stopwatch time=Stopwatch.StartNew();
            public ProbeWindow(){CreateHandle(new CreateParams{Caption="SynapseX input measurement",Parent=new IntPtr(-3)});if(!RegisterRawInputDevices(new[]{new Device{Page=1,Usage=2,Flags=0x100,Target=Handle}},1,(uint)Marshal.SizeOf(typeof(Device)))){DestroyHandle();throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}}
            protected override void WndProc(ref Message message) {
                if(message.Msg==0x00FF) {
                    uint size=0,header=(uint)(8+2*IntPtr.Size);GetRawInputData(message.LParam,0x10000003,IntPtr.Zero,ref size,header);
                    if(size>=header+24 && size<4096) {
                        IntPtr b=Marshal.AllocHGlobal((int)size);try{
                            if(GetRawInputData(message.LParam,0x10000003,b,ref size,header)!=uint.MaxValue && Marshal.ReadInt32(b)==0 && (Marshal.ReadInt32(b,(int)header+12)!=0||Marshal.ReadInt32(b,(int)header+16)!=0)) {
                                IntPtr device=Marshal.ReadIntPtr(b,8);string name;
                                if(!names.TryGetValue(device,out name)){uint count=0;GetRawInputDeviceInfo(device,0x20000007,null,ref count);var text=new System.Text.StringBuilder((int)Math.Min(4096,count+1));if(count>0&&count<4096)GetRawInputDeviceInfo(device,0x20000007,text,ref count);name=text.Length>0?text.ToString():"设备 "+device.ToString();names[device]=name;}
                                List<double> samples;if(!Samples.TryGetValue(name,out samples)){samples=new List<double>();Samples[name]=samples;}if(samples.Count<200000)samples.Add(time.Elapsed.TotalMilliseconds);
                            }
                        }finally{Marshal.FreeHGlobal(b);}
                    }
                }base.WndProc(ref message);
            }
            public void Dispose(){RegisterRawInputDevices(new[]{new Device{Page=1,Usage=2,Flags=1,Target=IntPtr.Zero}},1,(uint)Marshal.SizeOf(typeof(Device)));DestroyHandle();}
        }
        public static MouseRow Summarize(string device,double[] times) {
            var delta=new List<double>();for(int i=1;i<times.Length;i++)delta.Add(Math.Max(0,times[i]-times[i-1]));delta.Sort();
            double span=times.Length>1?times[times.Length-1]-times[0]:0;
            return new MouseRow{Device=device,Reports=times.Length,SpanMs=Math.Round(span,2),ObservedHz=span>0?Math.Round((times.Length-1)*1000/span,1):0,MedianIntervalMs=delta.Count>0?Math.Round(delta[delta.Count/2],3):0,P95IntervalMs=delta.Count>0?Math.Round(delta[(int)Math.Floor((delta.Count-1)*.95)],3):0};
        }
        public static ProbeState State(){lock(gate)return new ProbeState{Status=state.Status,Message=state.Message,Until=state.Until,Devices=state.Devices.ToArray()};}
        public static ProbeState Start(){lock(gate){if(state.Status=="running")throw new InvalidOperationException("测试正在进行。");stop=false;state=new ProbeState{Status="running",Message="请连续移动鼠标 10 秒；不记录按键、点击或屏幕坐标。",Until=DateTime.UtcNow.AddSeconds(10).ToString("o")};
            var thread=new Thread(()=>{try{using(var window=new ProbeWindow()){var watch=Stopwatch.StartNew();while(watch.Elapsed.TotalSeconds<10){lock(gate){if(stop)break;}Application.DoEvents();Thread.Sleep(1);}lock(gate){state.Devices=window.Samples.Select(p=>Summarize(p.Key,p.Value.ToArray())).ToArray();state.Status="complete";state.Message=state.Devices.Length>0?"已完成。结果为 Raw Input 消息到达频率，不等同于设备标称 USB 回报率；线程调度和批量投递会影响间隔。":"没有收到鼠标移动数据，请在本机连续移动鼠标后重试。";}}}catch(Exception e){lock(gate){state.Status="error";state.Message=e.Message;}}});thread.IsBackground=true;thread.SetApartmentState(ApartmentState.STA);thread.Start();return State();}}
        public static void Stop(){lock(gate)stop=true;}
    }
}
