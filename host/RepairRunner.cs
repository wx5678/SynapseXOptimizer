using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;

namespace SynapseX {
    public static class RepairRunner {
        public static int Run(string executable, string arguments, string stdoutPath, string stderrPath, bool unicode) {
            var encoding = unicode ? Encoding.Unicode : Encoding.GetEncoding(CultureInfo.CurrentCulture.TextInfo.OEMCodePage);
            var info = new ProcessStartInfo(executable, arguments) {
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true,
                StandardOutputEncoding = encoding, StandardErrorEncoding = encoding
            };
            var gate = new object();
            Exception logFailure = null;
            using (var output = new StreamWriter(new FileStream(stdoutPath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite), new UTF8Encoding(true)))
            using (var error = new StreamWriter(new FileStream(stderrPath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite), new UTF8Encoding(true)))
            using (var process = new Process { StartInfo = info }) {
                output.AutoFlush = true; error.AutoFlush = true;
                process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args) {
                    if (args.Data == null) return;
                    lock (gate) { try { output.WriteLine(args.Data); } catch (Exception ex) { logFailure = ex; } }
                };
                process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args) {
                    if (args.Data == null) return;
                    lock (gate) { try { error.WriteLine(args.Data); } catch (Exception ex) { logFailure = ex; } }
                };
                if (!process.Start()) throw new InvalidOperationException("System tool did not start.");
                process.BeginOutputReadLine(); process.BeginErrorReadLine();
                process.WaitForExit();
                if (logFailure != null) throw new IOException("System tool ended but its log could not be saved.", logFailure);
                return process.ExitCode;
            }
        }
    }
}
