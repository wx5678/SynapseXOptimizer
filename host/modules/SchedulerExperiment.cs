// SynapseX: bounded scheduling experiments using documented Windows APIs.
// Reference contracts: Get/SetThreadPriority, GetThreadTimes, GetProcessTimes,
// GetProcessIdOfThread, Get/SetPriorityClass (Microsoft Learn).
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Threading;

namespace SynapseX.Lab {
    public class Target {
        public int ProcessId, ThreadId, Original, ProcessPriority;
        public string ProcessStart, ThreadStart, Name, Kind;
    }
    public class ThreadSample {
        public int ThreadId, Priority;
        public string ThreadStart;
        public long CpuTicks;
        public double CpuMs, SingleCorePercent;
    }
    public class Sample {
        public Target Process;
        public ThreadSample[] Threads;
        public int Observed, Inaccessible;
        public double ElapsedMs;
    }
    public class LeaseState {
        public string Status = "idle", Message = "", Until = "";
        public Target Target;
        public int Applied, Actual, Error;
    }
    public sealed class SchedulerExperiment {
        [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int id);
        [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenThread(uint access, bool inherit, int id);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
        [DllImport("kernel32.dll", SetLastError=true)] static extern uint GetPriorityClass(IntPtr h);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetPriorityClass(IntPtr h, uint value);
        [DllImport("kernel32.dll", SetLastError=true)] static extern int GetThreadPriority(IntPtr h);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetThreadPriority(IntPtr h, int value);
        [DllImport("kernel32.dll", SetLastError=true)] static extern uint GetProcessIdOfThread(IntPtr h);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetThreadTimes(IntPtr h, out long c, out long e, out long k, out long u);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr h, out long c, out long e, out long k, out long u);
        [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
        [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr h, uint access, out IntPtr token);
        readonly object gate = new object();
        IntPtr processHandle, threadHandle;
        Timer timer;
        long generation;
        LeaseState state = new LeaseState();
        static Exception Error(string operation) {
            int code=Marshal.GetLastWin32Error();
            return new Win32Exception(code,operation+": "+new Win32Exception(code).Message+" (Win32 "+code+")");
        }
        static string Created(IntPtr h, bool thread) {
            long c,e,k,u;
            bool ok = thread ? GetThreadTimes(h,out c,out e,out k,out u) : GetProcessTimes(h,out c,out e,out k,out u);
            if (!ok) throw Error("Cannot read creation time");
            return c.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }
        static IntPtr ProcessHandle(int id, bool write) {
            if (id <= 4 || id == Process.GetCurrentProcess().Id) throw new InvalidOperationException("不能选择系统进程或本地服务自身。");
            IntPtr h = OpenProcess(0x1000u | 0x100000u | (write ? 0x0200u : 0u), false, id);
            if (h == IntPtr.Zero) throw Error("OpenProcess");
            try {
                IntPtr token;
                if (!OpenProcessToken(h, 8, out token)) throw Error("OpenProcessToken");
                try {
                    using (var owner = new WindowsIdentity(token))
                    using (var current = WindowsIdentity.GetCurrent())
                        if (!owner.User.Equals(current.User)) throw new InvalidOperationException("不能调整其他登录用户的进程。");
                } finally { CloseHandle(token); }
                return h;
            } catch { CloseHandle(h); throw; }
        }
        public static Target Inspect(int pid, int tid, string kind) {
            if (kind != "thread" && kind != "background") throw new ArgumentException("Unknown experiment");
            IntPtr p = ProcessHandle(pid, false), t = IntPtr.Zero;
            try {
                var result = new Target { ProcessId=pid, ThreadId=tid, Kind=kind, ProcessStart=Created(p,false) };
                using (var proc = Process.GetProcessById(pid)) { result.Name = proc.ProcessName; }
                uint priority = GetPriorityClass(p);
                if (priority == 0) throw Error("GetPriorityClass");
                result.ProcessPriority=(int)priority;
                if (kind == "background") { result.Original=(int)priority; return result; }
                t = OpenThread(0x0800, false, tid);
                if (t == IntPtr.Zero) throw Error("OpenThread query");
                if (GetProcessIdOfThread(t) != pid) throw new InvalidOperationException("线程已不属于所选进程。");
                result.ThreadStart=Created(t,true); result.Original=GetThreadPriority(t);
                if (result.Original == int.MaxValue) throw Error("GetThreadPriority");
                return result;
            } finally { if(t != IntPtr.Zero)CloseHandle(t); CloseHandle(p); }
        }
        static Dictionary<int,ThreadSample> Snapshot(int pid, out int denied) {
            var rows = new Dictionary<int,ThreadSample>(); denied=0;
            using (var proc = Process.GetProcessById(pid)) {
                if(proc.Threads.Count>2048)throw new InvalidOperationException("线程数量过多，本轮不采样。");
                foreach(ProcessThread item in proc.Threads) {
                    IntPtr h=OpenThread(0x0800,false,item.Id);
                    if(h==IntPtr.Zero){denied++;continue;}
                    try {
                        long c,e,k,u;
                        if(GetProcessIdOfThread(h)!=pid || !GetThreadTimes(h,out c,out e,out k,out u)){denied++;continue;}
                        int priority=GetThreadPriority(h);
                        if(priority==int.MaxValue){denied++;continue;}
                        rows[item.Id]=new ThreadSample {ThreadId=item.Id,ThreadStart=c.ToString(),CpuTicks=k+u,Priority=priority};
                    } finally {CloseHandle(h);}
                }
            }
            return rows;
        }
        public static Sample Measure(int pid) {
            var target=Inspect(pid,0,"background"); int a,b;
            var before=Snapshot(pid,out a); var watch=Stopwatch.StartNew();
            Thread.Sleep(1200);
            var after=Snapshot(pid,out b); watch.Stop();
            if(Inspect(pid,0,"background").ProcessStart!=target.ProcessStart)throw new InvalidOperationException("进程已经重启，请重新选择。");
            var rows=new List<ThreadSample>();
            foreach(var pair in after) {
                ThreadSample old;
                if(!before.TryGetValue(pair.Key,out old) || old.ThreadStart!=pair.Value.ThreadStart)continue;
                long delta=pair.Value.CpuTicks-old.CpuTicks;
                if(delta<0)continue;
                pair.Value.CpuMs=delta/10000.0;
                pair.Value.SingleCorePercent=Math.Round(pair.Value.CpuMs/watch.Elapsed.TotalMilliseconds*100,1);
                rows.Add(pair.Value);
            }
            rows.Sort((x,y)=>y.CpuMs.CompareTo(x.CpuMs));
            return new Sample {Process=target,Threads=rows.ToArray(),Observed=after.Count,Inaccessible=Math.Max(a,b),ElapsedMs=watch.Elapsed.TotalMilliseconds};
        }
        public LeaseState State() { lock(gate) { return new LeaseState {Status=state.Status,Message=state.Message,Until=state.Until,Target=state.Target,Applied=state.Applied,Actual=state.Actual,Error=state.Error}; } }
        void Close() { if(timer!=null){timer.Dispose();timer=null;} if(threadHandle!=IntPtr.Zero){CloseHandle(threadHandle);threadHandle=IntPtr.Zero;} if(processHandle!=IntPtr.Zero){CloseHandle(processHandle);processHandle=IntPtr.Zero;} }
        int Read() { return state.Target.Kind=="thread" ? GetThreadPriority(threadHandle) : (int)GetPriorityClass(processHandle); }
        bool Write(int value) { return state.Target.Kind=="thread" ? SetThreadPriority(threadHandle,value) : SetPriorityClass(processHandle,(uint)value); }
        void Open(Target target, bool write) {
            processHandle=ProcessHandle(target.ProcessId,write && target.Kind=="background");
            if(Created(processHandle,false)!=target.ProcessStart)throw new InvalidOperationException("进程身份已变化。");
            if(target.Kind=="thread") {
                threadHandle=OpenThread(0x0800u|0x100000u|(write?0x0400u:0u),false,target.ThreadId);
                if(threadHandle==IntPtr.Zero)throw Error("OpenThread set");
                if(GetProcessIdOfThread(threadHandle)!=target.ProcessId || Created(threadHandle,true)!=target.ThreadStart)throw new InvalidOperationException("线程身份已变化。");
            }
        }
        public LeaseState Begin(Target target,int seconds) {
            lock(gate) {
                if(state.Status=="active" || state.Status=="restore-failed")throw new InvalidOperationException("请先恢复当前实验。");
                if(seconds!=30 && seconds!=60 && seconds!=300)throw new ArgumentException("Invalid duration");
                if(target.Kind=="thread" && (target.Original<0 || target.Original>=2 || (target.ProcessPriority!=32 && target.ProcessPriority!=32768)))throw new InvalidOperationException("仅测试正常/高于正常进程中优先级为 0 或 1 的线程。");
                if(target.Kind=="background" && target.Original!=32 && target.Original!=32768)throw new InvalidOperationException("仅降低当前正常/高于正常的后台进程。");
                Close(); state=new LeaseState {Target=target,Applied=target.Kind=="thread"?target.Original+1:16384,Status="unchanged"};
                try {
                    Open(target,true);
                    if((int)GetPriorityClass(processHandle)!=target.ProcessPriority || Read()!=target.Original)throw new InvalidOperationException("采样后优先级已变化，请重新采样。");
                    if(!Write(state.Applied))throw Error("Scheduling write denied");
                    state.Status="active"; state.Actual=Read();
                    state.Until=DateTime.UtcNow.AddSeconds(seconds).ToString("o");
                    long leaseGeneration=++generation;
                    timer=new Timer(_=>Expire(leaseGeneration),null,seconds*1000,Timeout.Infinite);
                    if(state.Actual!=state.Applied){Stop();throw new InvalidOperationException("写入后回读不一致，已尝试恢复。");}
                    state.Message="已回读确认；实验到时自动恢复。";
                    return State();
                } catch { if(state.Status!="active" && state.Status!="restore-failed")Close(); throw; }
            }
        }
        public LeaseState Stop() {
            lock(gate) {
                if(state.Status!="active" && state.Status!="restore-failed")return State();
                try {
                    if(WaitForSingleObject(processHandle,0)==0 || (threadHandle!=IntPtr.Zero && WaitForSingleObject(threadHandle,0)==0)) {
                        state.Status="exited";state.Message="目标已退出，无需恢复。";Close();return State();
                    }
                    int actual=Read(); state.Actual=actual;
                    if(actual==state.Target.Original) {state.Status="restored";state.Message="原优先级已恢复。";Close();return State();}
                    if(actual!=state.Applied)throw new InvalidOperationException("优先级被其他程序改动，未覆盖；请检查后再恢复。");
                    if(!Write(state.Target.Original))throw Error("Restore denied");
                    state.Actual=Read(); if(state.Actual!=state.Target.Original)throw new InvalidOperationException("恢复回读失败。");
                    state.Status="restored";state.Message="已回读确认恢复原优先级。";Close();
                } catch(Exception e) {state.Status="restore-failed";state.Message=e.Message;var w=e as Win32Exception;state.Error=w==null?0:w.NativeErrorCode;}
                return State();
            }
        }
        void Expire(long leaseGeneration) { lock(gate) { if(generation==leaseGeneration)Stop(); } }
        public LeaseState Recover(Target target,int applied) {
            lock(gate) {
                if(state.Status=="active")return State();
                Close();state=new LeaseState {Target=target,Applied=applied,Status="restore-failed"};
                try {Open(target,true);return Stop();}
                catch(Exception e) {
                    // An absent PID or a positively identified replacement has
                    // no surviving setting to undo. Access denied is NOT exit.
                    var w=e as Win32Exception;
                    if((w!=null && w.NativeErrorCode==87) || (e is InvalidOperationException && (e.Message=="进程身份已变化。" || e.Message=="线程身份已变化。"))) {state.Status="exited";state.Message="原目标已退出或被新实例替换，未改动新实例。";}
                    else {state.Message=e.Message;state.Error=w==null?0:w.NativeErrorCode;}
                    Close();return State();
                }
            }
        }
    }
}
