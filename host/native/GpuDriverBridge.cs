using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

namespace SynapseX.Native
{
    public sealed class DriverSettingState
    {
        public string Key = "";
        public uint Id;
        public bool Supported;
        public bool HasProfileValue;
        public uint Value;
        public int Location;
        public int Status;
    }

    public sealed class NvidiaState
    {
        public bool Available;
        public string Error = "";
        public string ExecutableName = "";
        public bool ApplicationFound;
        public bool CreatedProfile;
        public DriverSettingState[] Settings = new DriverSettingState[0];
    }

    public sealed class AmdFeatureState
    {
        public string Key = "";
        public bool Supported;
        public bool Enabled;
        public int Status;
    }

    public sealed class AmdState
    {
        public bool Available;
        public string Error = "";
        public string GpuName = "";
        public AmdFeatureState[] Features = new AmdFeatureState[0];
    }

    internal static class NativeLoader
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern IntPtr LoadLibrary(string fileName);

        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
        internal static extern IntPtr GetProcAddress(IntPtr module, string name);

        [DllImport("kernel32.dll")]
        internal static extern bool FreeLibrary(IntPtr module);
    }

    public static class NvidiaDrsBridge
    {
        private const int Ok = 0;
        private const int SettingNotFound = -160;
        private const int ExecutableNotFound = -166;

        [DllImport("nvapi64.dll", CallingConvention = CallingConvention.Cdecl)]
        private static extern IntPtr nvapi_QueryInterface(uint id);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int InitializeDelegate();
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int CreateSessionDelegate(out IntPtr session);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int GetBaseProfileDelegate(IntPtr session, out IntPtr profile);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int SessionDelegate(IntPtr session);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FindApplicationDelegate(IntPtr session, [MarshalAs(UnmanagedType.LPWStr)] string appName, out IntPtr profile, ref NvApplicationV1 application);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int CreateProfileDelegate(IntPtr session, ref NvProfileV1 profile, out IntPtr profileHandle);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FindProfileDelegate(IntPtr session, [MarshalAs(UnmanagedType.LPWStr)] string profileName, out IntPtr profileHandle);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int DeleteProfileDelegate(IntPtr session, IntPtr profileHandle);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int CreateApplicationDelegate(IntPtr session, IntPtr profile, ref NvApplicationV1 application);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int GetSettingDelegate(IntPtr session, IntPtr profile, uint settingId, ref NvSettingV1 setting);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int SetSettingDelegate(IntPtr session, IntPtr profile, ref NvSettingV1 setting);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int DeleteSettingDelegate(IntPtr session, IntPtr profile, uint settingId);

        [StructLayout(LayoutKind.Explicit, Size = 4100)]
        private struct NvValue
        {
            [FieldOffset(0)] public uint Dword;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode, Pack = 4)]
        private struct NvSettingV1
        {
            public uint Version;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 2048)] public string SettingName;
            public uint SettingId;
            public int SettingType;
            public int SettingLocation;
            public uint IsCurrentPredefined;
            public uint IsPredefinedValid;
            public NvValue PredefinedValue;
            public NvValue CurrentValue;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct NvApplicationV1
        {
            public uint Version;
            public uint IsPredefined;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 2048)] public string AppName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 2048)] public string UserFriendlyName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 2048)] public string Launcher;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct NvProfileV1
        {
            public uint Version;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 2048)] public string ProfileName;
            public uint GpuSupport;
            public uint IsPredefined;
            public uint NumberOfApplications;
            public uint NumberOfSettings;
        }

        private sealed class Api
        {
            internal InitializeDelegate Initialize;
            internal CreateSessionDelegate CreateSession;
            internal SessionDelegate DestroySession;
            internal SessionDelegate LoadSettings;
            internal SessionDelegate SaveSettings;
            internal FindApplicationDelegate FindApplication;
            internal CreateProfileDelegate CreateProfile;
            internal FindProfileDelegate FindProfile;
            internal DeleteProfileDelegate DeleteProfile;
            internal CreateApplicationDelegate CreateApplication;
            internal GetSettingDelegate GetSetting;
            internal SetSettingDelegate SetSetting;
            internal DeleteSettingDelegate DeleteSetting;
            internal GetBaseProfileDelegate GetBaseProfile;
        }

        private static T Get<T>(uint id) where T : class
        {
            IntPtr pointer = nvapi_QueryInterface(id);
            if (pointer == IntPtr.Zero) throw new InvalidOperationException("NVAPI function is unavailable: 0x" + id.ToString("X8"));
            return Marshal.GetDelegateForFunctionPointer(pointer, typeof(T)) as T;
        }

        private static Api OpenApi()
        {
            Api api = new Api();
            api.Initialize = Get<InitializeDelegate>(0x0150E828);
            api.CreateSession = Get<CreateSessionDelegate>(0x0694D52E);
            api.DestroySession = Get<SessionDelegate>(0xDAD9CFF8);
            api.LoadSettings = Get<SessionDelegate>(0x375DBD6B);
            api.SaveSettings = Get<SessionDelegate>(0xFCBC7E14);
            api.CreateProfile = Get<CreateProfileDelegate>(0xCC176068);
            api.FindProfile = Get<FindProfileDelegate>(0x7E4A9A0B);
            api.DeleteProfile = Get<DeleteProfileDelegate>(0x17093206);
            api.CreateApplication = Get<CreateApplicationDelegate>(0x4347A9DE);
            api.FindApplication = Get<FindApplicationDelegate>(0xEEE566B2);
            api.SetSetting = Get<SetSettingDelegate>(0x577DD202);
            api.GetSetting = Get<GetSettingDelegate>(0x73BF8338);
            api.DeleteSetting = Get<DeleteSettingDelegate>(0xE4A26362);
            api.GetBaseProfile = Get<GetBaseProfileDelegate>(0xDA8466A0);
            int result = api.Initialize();
            if (result != Ok) throw new InvalidOperationException("NvAPI_Initialize failed: " + result);
            return api;
        }

        private static uint MakeVersion(Type type, uint version)
        {
            return (uint)Marshal.SizeOf(type) | (version << 16);
        }

        private static NvApplicationV1 NewApplication(string executableName)
        {
            NvApplicationV1 app = new NvApplicationV1();
            app.Version = MakeVersion(typeof(NvApplicationV1), 1);
            app.AppName = executableName;
            app.UserFriendlyName = "SynapseX " + executableName;
            app.Launcher = "";
            return app;
        }

        private static NvProfileV1 NewProfile(string profileName)
        {
            NvProfileV1 profile = new NvProfileV1();
            profile.Version = MakeVersion(typeof(NvProfileV1), 1);
            profile.ProfileName = profileName;
            return profile;
        }

        private static NvSettingV1 NewSetting(uint id, uint value)
        {
            NvSettingV1 setting = new NvSettingV1();
            setting.Version = MakeVersion(typeof(NvSettingV1), 1);
            setting.SettingName = "";
            setting.SettingId = id;
            setting.SettingType = 0;
            setting.CurrentValue.Dword = value;
            return setting;
        }

        private static IntPtr OpenSession(Api api)
        {
            IntPtr session;
            int result = api.CreateSession(out session);
            if (result != Ok) throw new InvalidOperationException("NvAPI_DRS_CreateSession failed: " + result);
            result = api.LoadSettings(session);
            if (result != Ok) { api.DestroySession(session); throw new InvalidOperationException("NvAPI_DRS_LoadSettings failed: " + result); }
            return session;
        }

        private static int FindApplication(Api api, IntPtr session, string executableName, out IntPtr profile)
        {
            NvApplicationV1 application = NewApplication(executableName);
            return api.FindApplication(session, executableName, out profile, ref application);
        }

        private static DriverSettingState ReadSetting(Api api, IntPtr session, IntPtr profile, string key, uint id)
        {
            NvSettingV1 setting = NewSetting(id, 0);
            int status = api.GetSetting(session, profile, id, ref setting);
            DriverSettingState result = new DriverSettingState();
            result.Key = key;
            result.Id = id;
            result.Status = status;
            result.Supported = status == Ok;
            if (status == Ok)
            {
                result.Value = setting.CurrentValue.Dword;
                result.Location = setting.SettingLocation;
                result.HasProfileValue = setting.SettingLocation == 0;
            }
            return result;
        }

        private static string ProfileName(string executableName)
        {
            uint hash = 2166136261;
            foreach (char character in executableName.ToLowerInvariant()) { hash ^= character; hash *= 16777619; }
            return "SynapseX - " + Path.GetFileNameWithoutExtension(executableName) + " - " + hash.ToString("X8");
        }

        public static NvidiaState Query(string executablePath, string[] keys, uint[] ids)
        {
            NvidiaState output = new NvidiaState();
            output.ExecutableName = Path.GetFileName(executablePath).ToLowerInvariant();
            try
            {
                Api api = OpenApi();
                IntPtr session = OpenSession(api);
                try
                {
                    IntPtr profile;
                    int find = FindApplication(api, session, output.ExecutableName, out profile);
                    output.ApplicationFound = find == Ok;
                    if (!output.ApplicationFound)
                    {
                        int baseResult = api.GetBaseProfile(session, out profile);
                        if (baseResult != Ok) throw new InvalidOperationException("NvAPI_DRS_GetBaseProfile failed: " + baseResult);
                    }
                    List<DriverSettingState> settings = new List<DriverSettingState>();
                    for (int i = 0; i < ids.Length; i++) settings.Add(ReadSetting(api, session, profile, keys[i], ids[i]));
                    output.Settings = settings.ToArray();
                    output.Available = true;
                }
                finally { api.DestroySession(session); }
            }
            catch (Exception error) { output.Error = error.Message; }
            return output;
        }

        public static NvidiaState Apply(string executablePath, string[] keys, uint[] ids, uint[] values)
        {
            NvidiaState output = new NvidiaState();
            output.ExecutableName = Path.GetFileName(executablePath).ToLowerInvariant();
            try
            {
                Api api = OpenApi();
                IntPtr session = OpenSession(api);
                try
                {
                    IntPtr profile;
                    int find = FindApplication(api, session, output.ExecutableName, out profile);
                    output.ApplicationFound = find == Ok;
                    if (find == ExecutableNotFound)
                    {
                        string name = ProfileName(output.ExecutableName);
                        NvProfileV1 profileInfo = NewProfile(name);
                        int create = api.CreateProfile(session, ref profileInfo, out profile);
                        if (create != Ok)
                        {
                            int existing = api.FindProfile(session, name, out profile);
                            if (existing != Ok) throw new InvalidOperationException("NvAPI_DRS_CreateProfile failed: " + create);
                        }
                        NvApplicationV1 application = NewApplication(output.ExecutableName);
                        int createApp = api.CreateApplication(session, profile, ref application);
                        if (createApp != Ok) throw new InvalidOperationException("NvAPI_DRS_CreateApplication failed: " + createApp);
                        output.CreatedProfile = true;
                    }
                    else if (find != Ok) throw new InvalidOperationException("NvAPI_DRS_FindApplicationByName failed: " + find);

                    List<DriverSettingState> before = new List<DriverSettingState>();
                    for (int i = 0; i < ids.Length; i++) before.Add(ReadSetting(api, session, profile, keys[i], ids[i]));
                    for (int i = 0; i < ids.Length; i++)
                    {
                        NvSettingV1 setting = NewSetting(ids[i], values[i]);
                        int set = api.SetSetting(session, profile, ref setting);
                        if (set != Ok) throw new InvalidOperationException("NvAPI_DRS_SetSetting failed for " + keys[i] + ": " + set);
                    }
                    int save = api.SaveSettings(session);
                    if (save != Ok) throw new InvalidOperationException("NvAPI_DRS_SaveSettings failed: " + save);
                    output.Settings = before.ToArray();
                    output.Available = true;
                }
                finally { api.DestroySession(session); }
            }
            catch (Exception error) { output.Error = error.Message; }
            return output;
        }

        // Experimental settings use only an existing application profile. Each value
        // is compared inside the same DRS session before the save transaction.
        public static NvidiaState ApplyExistingChecked(string executablePath, string[] keys, uint[] ids, uint[] values, bool[] remove, uint[] expected, bool[] expectedLocal)
        {
            NvidiaState output = new NvidiaState();
            try {
                if(keys.Length!=ids.Length || ids.Length!=values.Length || values.Length!=remove.Length || remove.Length!=expected.Length || expected.Length!=expectedLocal.Length)throw new ArgumentException("Invalid setting arrays");
                Api api=OpenApi();IntPtr session=OpenSession(api);
                try {
                    IntPtr profile;int find=FindApplication(api,session,Path.GetFileName(executablePath).ToLowerInvariant(),out profile);
                    if(find!=Ok)throw new InvalidOperationException("An existing application profile is required: "+find);
                    for(int i=0;i<ids.Length;i++){
                        DriverSettingState current=ReadSetting(api,session,profile,keys[i],ids[i]);
                        if(!current.Supported || current.Value!=expected[i] || current.HasProfileValue!=expectedLocal[i])throw new InvalidOperationException("Driver value changed: "+keys[i]);
                    }
                    for(int i=0;i<ids.Length;i++){
                        int result;
                        if(remove[i])result=api.DeleteSetting(session,profile,ids[i]);
                        else{NvSettingV1 setting=NewSetting(ids[i],values[i]);result=api.SetSetting(session,profile,ref setting);}
                        if(result!=Ok && !(remove[i]&&result==SettingNotFound))throw new InvalidOperationException("Driver setting write failed: "+keys[i]+" / "+result);
                    }
                    int saved=api.SaveSettings(session);if(saved!=Ok)throw new InvalidOperationException("Driver save failed: "+saved);
                    output.Available=true;
                }finally{api.DestroySession(session);}
            }catch(Exception e){output.Error=e.Message;}
            return output;
        }

        public static NvidiaState Restore(string executablePath, string[] keys, uint[] ids, uint[] values, bool[] hadProfileValues, bool createdProfile)
        {
            NvidiaState output = new NvidiaState();
            output.ExecutableName = Path.GetFileName(executablePath).ToLowerInvariant();
            try
            {
                Api api = OpenApi();
                IntPtr session = OpenSession(api);
                try
                {
                    IntPtr profile;
                    int find = FindApplication(api, session, output.ExecutableName, out profile);
                    if (find != Ok) throw new InvalidOperationException("NVIDIA application profile no longer exists: " + find);
                    if (createdProfile)
                    {
                        int delete = api.DeleteProfile(session, profile);
                        if (delete != Ok) throw new InvalidOperationException("NvAPI_DRS_DeleteProfile failed: " + delete);
                    }
                    else
                    {
                        for (int i = 0; i < ids.Length; i++)
                        {
                            int result;
                            if (hadProfileValues[i])
                            {
                                NvSettingV1 setting = NewSetting(ids[i], values[i]);
                                result = api.SetSetting(session, profile, ref setting);
                            }
                            else result = api.DeleteSetting(session, profile, ids[i]);
                            if (result != Ok && result != SettingNotFound) throw new InvalidOperationException("NVIDIA restore failed for " + keys[i] + ": " + result);
                        }
                    }
                    int save = api.SaveSettings(session);
                    if (save != Ok) throw new InvalidOperationException("NvAPI_DRS_SaveSettings failed: " + save);
                    output.Available = true;
                }
                finally { api.DestroySession(session); }
            }
            catch (Exception error) { output.Error = error.Message; }
            return output;
        }
    }

    public static class AmdAdlxBridge
    {
        private const int Ok = 0;
        private const ulong AdlxVersion = ((ulong)1 << 48) | ((ulong)5 << 32) | 124;

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int InitializeDelegate(ulong version, out IntPtr system);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int TerminateDelegate();
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int GetPointerDelegate(IntPtr self, out IntPtr value);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int GetFeatureDelegate(IntPtr self, IntPtr gpu, out IntPtr feature);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate uint SizeDelegate(IntPtr self);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int AtGpuDelegate(IntPtr self, uint index, out IntPtr gpu);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int GetStringDelegate(IntPtr self, out IntPtr value);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int GetBoolDelegate(IntPtr self, out byte value);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int SetBoolDelegate(IntPtr self, byte value);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int ReleaseDelegate(IntPtr self);

        private sealed class Context : IDisposable
        {
            internal IntPtr Module;
            internal IntPtr System;
            internal IntPtr Gpus;
            internal IntPtr Gpu;
            internal IntPtr Services;
            internal TerminateDelegate Terminate;

            public void Dispose()
            {
                Release(Services);
                Release(Gpus);
                if (Terminate != null) Terminate();
                if (Module != IntPtr.Zero) NativeLoader.FreeLibrary(Module);
            }
        }

        private sealed class FeatureSpec
        {
            internal string Key;
            internal int ServiceIndex;
            internal int SetIndex;
        }

        private static readonly FeatureSpec[] Specs = new FeatureSpec[] {
            new FeatureSpec { Key = "anti-lag", ServiceIndex = 3, SetIndex = 5 },
            new FeatureSpec { Key = "chill", ServiceIndex = 4, SetIndex = 8 },
            new FeatureSpec { Key = "boost", ServiceIndex = 5, SetIndex = 7 },
            new FeatureSpec { Key = "enhanced-sync", ServiceIndex = 7, SetIndex = 5 },
            new FeatureSpec { Key = "frtc", ServiceIndex = 9, SetIndex = 7 },
        };

        private static T Function<T>(IntPtr instance, int index) where T : class
        {
            IntPtr vtable = Marshal.ReadIntPtr(instance);
            IntPtr function = Marshal.ReadIntPtr(vtable, index * IntPtr.Size);
            if (function == IntPtr.Zero) throw new InvalidOperationException("ADLX vtable function is unavailable: " + index);
            return Marshal.GetDelegateForFunctionPointer(function, typeof(T)) as T;
        }

        private static void Release(IntPtr instance)
        {
            if (instance == IntPtr.Zero) return;
            try { Function<ReleaseDelegate>(instance, 1)(instance); } catch { }
        }

        private static Context Open()
        {
            Context context = new Context();
            context.Module = NativeLoader.LoadLibrary("amdadlx64.dll");
            if (context.Module == IntPtr.Zero) throw new DllNotFoundException("AMD ADLX runtime is not installed.");
            IntPtr initializePointer = NativeLoader.GetProcAddress(context.Module, "ADLXInitialize");
            IntPtr terminatePointer = NativeLoader.GetProcAddress(context.Module, "ADLXTerminate");
            if (initializePointer == IntPtr.Zero || terminatePointer == IntPtr.Zero) throw new EntryPointNotFoundException("AMD ADLX initialization functions are unavailable.");
            InitializeDelegate initialize = Marshal.GetDelegateForFunctionPointer(initializePointer, typeof(InitializeDelegate)) as InitializeDelegate;
            context.Terminate = Marshal.GetDelegateForFunctionPointer(terminatePointer, typeof(TerminateDelegate)) as TerminateDelegate;
            int init = initialize(AdlxVersion, out context.System);
            if (init != Ok || context.System == IntPtr.Zero) throw new InvalidOperationException("ADLXInitialize failed: " + init);
            int getGpus = Function<GetPointerDelegate>(context.System, 1)(context.System, out context.Gpus);
            if (getGpus != Ok || context.Gpus == IntPtr.Zero) throw new InvalidOperationException("ADLX GetGPUs failed: " + getGpus);
            uint count = Function<SizeDelegate>(context.Gpus, 3)(context.Gpus);
            if (count == 0) throw new InvalidOperationException("ADLX did not report an AMD GPU.");
            int at = Function<AtGpuDelegate>(context.Gpus, 11)(context.Gpus, 0, out context.Gpu);
            if (at != Ok || context.Gpu == IntPtr.Zero) throw new InvalidOperationException("ADLX GPU enumeration failed: " + at);
            int settings = Function<GetPointerDelegate>(context.System, 7)(context.System, out context.Services);
            if (settings != Ok || context.Services == IntPtr.Zero) throw new InvalidOperationException("ADLX Get3DSettingsServices failed: " + settings);
            return context;
        }

        private static AmdFeatureState ReadFeature(Context context, FeatureSpec spec)
        {
            AmdFeatureState state = new AmdFeatureState();
            state.Key = spec.Key;
            IntPtr feature = IntPtr.Zero;
            try
            {
                int get = Function<GetFeatureDelegate>(context.Services, spec.ServiceIndex)(context.Services, context.Gpu, out feature);
                state.Status = get;
                if (get != Ok || feature == IntPtr.Zero) return state;
                byte supported;
                int support = Function<GetBoolDelegate>(feature, 3)(feature, out supported);
                state.Status = support;
                state.Supported = support == Ok && supported != 0;
                if (!state.Supported) return state;
                byte enabled;
                int current = Function<GetBoolDelegate>(feature, 4)(feature, out enabled);
                state.Status = current;
                if (current == Ok) state.Enabled = enabled != 0;
                return state;
            }
            finally { Release(feature); }
        }

        private static string GetGpuName(Context context)
        {
            IntPtr value;
            int result = Function<GetStringDelegate>(context.Gpu, 7)(context.Gpu, out value);
            return result == Ok && value != IntPtr.Zero ? Marshal.PtrToStringAnsi(value) : "AMD Radeon GPU";
        }

        public static AmdState Query()
        {
            AmdState output = new AmdState();
            try
            {
                using (Context context = Open())
                {
                    output.GpuName = GetGpuName(context);
                    List<AmdFeatureState> features = new List<AmdFeatureState>();
                    foreach (FeatureSpec spec in Specs) features.Add(ReadFeature(context, spec));
                    output.Features = features.ToArray();
                    output.Available = true;
                }
            }
            catch (Exception error) { output.Error = error.Message; }
            return output;
        }

        public static AmdState Apply(string[] keys, bool[] enabled)
        {
            AmdState output = new AmdState();
            try
            {
                using (Context context = Open())
                {
                    output.GpuName = GetGpuName(context);
                    List<AmdFeatureState> before = new List<AmdFeatureState>();
                    for (int index = 0; index < keys.Length; index++)
                    {
                        FeatureSpec spec = Array.Find(Specs, item => item.Key == keys[index]);
                        if (spec == null) throw new InvalidOperationException("Unknown AMD feature: " + keys[index]);
                        AmdFeatureState state = ReadFeature(context, spec);
                        if (!state.Supported) throw new InvalidOperationException("AMD feature is not supported: " + keys[index]);
                        before.Add(state);
                        IntPtr feature = IntPtr.Zero;
                        try
                        {
                            int get = Function<GetFeatureDelegate>(context.Services, spec.ServiceIndex)(context.Services, context.Gpu, out feature);
                            if (get != Ok || feature == IntPtr.Zero) throw new InvalidOperationException("ADLX feature lookup failed: " + get);
                            int set = Function<SetBoolDelegate>(feature, spec.SetIndex)(feature, enabled[index] ? (byte)1 : (byte)0);
                            if (set != Ok) throw new InvalidOperationException("ADLX setting failed for " + keys[index] + ": " + set);
                        }
                        finally { Release(feature); }
                    }
                    output.Features = before.ToArray();
                    output.Available = true;
                }
            }
            catch (Exception error) { output.Error = error.Message; }
            return output;
        }
    }
}
