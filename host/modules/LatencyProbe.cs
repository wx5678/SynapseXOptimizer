using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.Serialization.Json;
using System.Threading;

namespace SynapseX.LatencyLab {
    public sealed class Point { public double Seconds, MaximumMs; }
    public sealed class Result {
        public string Id, Status, Message, Started, Label, TimerMode, PowerScheme, Os;
        public string Method = "wake-overshoot-qpc-v1";
        public int DurationSeconds, Count, LogicalProcessors;
        public double ElapsedSeconds, MeanMs, P95Ms, P99Ms, MaximumMs, IntervalMs = 1;
        public double HostCpuOneCorePercent;
        public Point[] Points = new Point[0];
    }
    public static class Probe {
        static readonly object gate = new object();
        static Thread worker;
        static ManualResetEvent cancel;
        static Result current = new Result { Status="idle", Message="尚未测试" };
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateWaitableTimerEx(IntPtr attributes, string name, uint flags, uint access);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetWaitableTimer(IntPtr timer, ref long due, int period, IntPtr callback, IntPtr argument, bool resume);
        [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForMultipleObjects(uint count, IntPtr[] handles, bool all, uint milliseconds);
        [DllImport("kernel32.dll")] static extern bool CancelWaitableTimer(IntPtr timer);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
        public static Result State() { lock(gate) return current; }
        public static Result Start(string root, int seconds, string label, string power) {
            if(seconds!=15 && seconds!=30 && seconds!=60) throw new ArgumentException("请选择 15、30 或 60 秒。");
            if((label??"").Length>80) throw new ArgumentException("记录名称不能超过 80 字。");
            lock(gate) {
                if(worker!=null && worker.IsAlive) throw new InvalidOperationException("延迟测试正在运行。");
                var result = new Result { Id=Guid.NewGuid().ToString("N"), Status="running", Message="正在预热计时器…", Started=DateTime.UtcNow.ToString("o"), Label=label??"", DurationSeconds=seconds, PowerScheme=power??"", Os=Environment.OSVersion.VersionString, LogicalProcessors=Environment.ProcessorCount };
                current=Copy(result);
                cancel=new ManualResetEvent(false);
                var stop=cancel;
                worker=new Thread(()=>Run(root,result,stop)) { IsBackground=true, Name="SynapseX latency probe", Priority=ThreadPriority.Normal };
                worker.Start(); return current;
            }
        }
        public static Result Stop() {
            Thread pending;
            lock(gate) { pending=worker; if(pending!=null && pending.IsAlive && cancel!=null) cancel.Set(); }
            if(pending!=null && pending!=Thread.CurrentThread) pending.Join(1500);
            return State();
        }
        public static Result Summarize(double[] samples) {
            var r=new Result { Count=samples.Length };
            if(samples.Length==0) return r;
            var sorted=(double[])samples.Clone(); Array.Sort(sorted);
            double total=0; foreach(double value in sorted) { if(double.IsNaN(value)||double.IsInfinity(value)||value<0) throw new ArgumentException("Invalid sample"); total+=value; }
            r.MeanMs=total/sorted.Length;
            r.P95Ms=sorted[(int)Math.Ceiling(.95*sorted.Length)-1]; r.P99Ms=sorted[(int)Math.Ceiling(.99*sorted.Length)-1]; r.MaximumMs=sorted[sorted.Length-1];
            return r;
        }
        static Result Copy(Result r) {
            return new Result { Id=r.Id, Status=r.Status, Message=r.Message, Started=r.Started, Label=r.Label, TimerMode=r.TimerMode, PowerScheme=r.PowerScheme, Os=r.Os, DurationSeconds=r.DurationSeconds, LogicalProcessors=r.LogicalProcessors, Count=r.Count, ElapsedSeconds=r.ElapsedSeconds, MeanMs=r.MeanMs, P95Ms=r.P95Ms, P99Ms=r.P99Ms, MaximumMs=r.MaximumMs, HostCpuOneCorePercent=r.HostCpuOneCorePercent, Points=r.Points };
        }
        static void Publish(Result r) { lock(gate) current=Copy(r); }
        static void Save(string root, Result r) {
            Directory.CreateDirectory(root);
            string filename=Path.Combine(root,r.Id+".json");
            using(var stream=new FileStream(filename+".pending",FileMode.CreateNew,FileAccess.Write,FileShare.None)) {
                new DataContractJsonSerializer(typeof(Result)).WriteObject(stream,r); stream.Flush(true);
            }
            File.Move(filename+".pending",filename);
        }
        static void Run(string root, Result r, ManualResetEvent stop) {
            IntPtr timer=IntPtr.Zero; bool owns=false;
            // One active measurement on this Windows session, including separate host instances.
            using(var mutex=new Mutex(false,"Local\\SynapseX-LatencyProbe-v1")) {
                try {
                    try { owns=mutex.WaitOne(0); } catch(AbandonedMutexException) { owns=true; }
                    if(!owns) throw new InvalidOperationException("其他实例正在测量，请先停止该测试。");
                    timer=CreateWaitableTimerEx(IntPtr.Zero,null,2,0x1F0003);
                    r.TimerMode="high-resolution";
                    if(timer==IntPtr.Zero) {
                        int code=Marshal.GetLastWin32Error();
                        if(code!=87 && code!=50 && code!=120) throw new Win32Exception(code);
                        timer=CreateWaitableTimerEx(IntPtr.Zero,null,0,0x1F0003); r.TimerMode="standard-fallback";
                    }
                    if(timer==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                    var handles=new IntPtr[]{stop.SafeWaitHandle.DangerousGetHandle(),timer};
                    var values=new List<double>(60000); var points=new List<Point>(250);
                    double frequency=Stopwatch.Frequency;
                    // Warm up this thread only. Never request a system timer resolution or change game priority.
                    var warm=Stopwatch.StartNew();
                    while(warm.ElapsedMilliseconds<300 && !stop.WaitOne(0)) Wait(timer,handles);
                    var ownProcess=Process.GetCurrentProcess();
                    double beforeCpu=ownProcess.TotalProcessorTime.TotalMilliseconds;
                    var elapsed=Stopwatch.StartNew(); double nextBin=.25, peak=0;
                    r.Message="测量中：1 ms 目标等待后的额外唤醒耗时。";
                    while(elapsed.Elapsed.TotalSeconds<r.DurationSeconds && !stop.WaitOne(0) && values.Count<65000) {
                        long start=Stopwatch.GetTimestamp();
                        if(!Wait(timer,handles)) break;
                        double value=Math.Max(0,(Stopwatch.GetTimestamp()-start)*1000.0/frequency-1.0);
                        values.Add(value); peak=Math.Max(peak,value);
                        double now=elapsed.Elapsed.TotalSeconds;
                        if(now>=nextBin) {
                            points.Add(new Point { Seconds=now,MaximumMs=peak });peak=0;nextBin=now+.25;
                            r.ElapsedSeconds=now; r.Count=values.Count; r.Points=points.ToArray(); Publish(r);
                        }
                    }
                    r.ElapsedSeconds=elapsed.Elapsed.TotalSeconds;
                    r.HostCpuOneCorePercent=100*(ownProcess.TotalProcessorTime.TotalMilliseconds-beforeCpu)/Math.Max(1,elapsed.Elapsed.TotalMilliseconds); ownProcess.Dispose();
                    if(values.Count>0 && (points.Count==0 || r.ElapsedSeconds>points[points.Count-1].Seconds)) points.Add(new Point { Seconds=r.ElapsedSeconds,MaximumMs=peak });
                    var stats=Summarize(values.ToArray());
                    r.Count=stats.Count;r.MeanMs=stats.MeanMs;r.P95Ms=stats.P95Ms;r.P99Ms=stats.P99Ms;r.MaximumMs=stats.MaximumMs;r.Points=points.ToArray();
                    r.Status=stop.WaitOne(0)?"cancelled":"complete";
                    r.Message=r.Status=="complete"?"测试完成。结果为定时器与调度共同影响的唤醒延迟，不是游戏端到端延迟。":"已停止，仅保留已采集的样本；不作为完整测试比较。";
                } catch(Exception e) { r.Status="error"; r.Message=e.Message; }
                finally {
                    if(timer!=IntPtr.Zero) { CancelWaitableTimer(timer);CloseHandle(timer); }
                    try { if(owns) Save(root,r); } catch(Exception e) { r.Message+=" 本地记录保存失败："+e.Message; }
                    Publish(r);
                    lock(gate) { if(cancel==stop) cancel=null; }
                    stop.Dispose(); if(owns) mutex.ReleaseMutex();
                }
            }
        }
        static bool Wait(IntPtr timer,IntPtr[] handles) {
            long due=-10000;
            if(!SetWaitableTimer(timer,ref due,0,IntPtr.Zero,IntPtr.Zero,false)) throw new Win32Exception(Marshal.GetLastWin32Error());
            uint code=WaitForMultipleObjects(2,handles,false,2000);
            if(code==0) return false;
            if(code!=1) throw new InvalidOperationException("计时器等待失败或超时："+code);
            return true;
        }
    }
}
