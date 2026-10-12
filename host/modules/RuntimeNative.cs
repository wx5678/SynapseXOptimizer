using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace SynapseX {
    public sealed class PriorityResult {
        public int Error;
        public uint Priority;
        public string StartToken = "";
    }
    public static class RuntimeNative {
        [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int id);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError=true)] static extern uint GetPriorityClass(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr handle, out long created, out long exited, out long kernel, out long user);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetSystemCpuSetInformation(IntPtr data, uint length, out uint returned, IntPtr process, uint flags);

        // Read-only process metadata. Never requests PROCESS_SET_INFORMATION.
        public static PriorityResult Priority(int id) {
            var result = new PriorityResult();
            var handle = OpenProcess(0x1000, false, id);
            if (handle == IntPtr.Zero) {
                result.Error = Marshal.GetLastWin32Error();
                return result;
            }
            try {
                long created, exited, kernel, user;
                if (!GetProcessTimes(handle, out created, out exited, out kernel, out user)) {
                    result.Error = Marshal.GetLastWin32Error(); return result;
                }
                result.StartToken = created.ToString(System.Globalization.CultureInfo.InvariantCulture);
                result.Priority = GetPriorityClass(handle);
                if (result.Priority == 0) { result.Error = Marshal.GetLastWin32Error(); return result; }
                return result;
            } finally { CloseHandle(handle); }
        }

        public static int[][] CpuSets() {
            uint size;
            GetSystemCpuSetInformation(IntPtr.Zero, 0, out size, IntPtr.Zero, 0);
            if (size == 0 || size > 16 * 1024 * 1024) throw new Win32Exception(Marshal.GetLastWin32Error());
            IntPtr buffer = Marshal.AllocHGlobal((int)size);
            try {
                uint returned;
                if (!GetSystemCpuSetInformation(buffer, size, out returned, IntPtr.Zero, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
                var rows = new List<int[]>();
                for (int offset = 0; offset + 8 <= returned;) {
                    IntPtr item = IntPtr.Add(buffer, offset);
                    int length = Marshal.ReadInt32(item);
                    if (length < 8 || (long)offset + length > returned) throw new InvalidOperationException("Invalid CPU set data");
                    if (Marshal.ReadInt32(item, 4) == 0 && length >= 32) {
                        rows.Add(new int[] { Marshal.ReadInt16(item, 12), Marshal.ReadByte(item, 14), Marshal.ReadByte(item, 15), Marshal.ReadByte(item, 16), Marshal.ReadByte(item, 18) });
                    }
                    offset += length;
                }
                return rows.ToArray();
            } finally { Marshal.FreeHGlobal(buffer); }
        }
    }
}
