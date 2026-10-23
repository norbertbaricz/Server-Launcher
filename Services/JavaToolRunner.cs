using System.Diagnostics;
using Server_Launcher.Core;

namespace Server_Launcher.Services;

internal static class JavaToolRunner
{
    public static async Task RunAsync(string java, string folder, IEnumerable<string> arguments, CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromMinutes(BackendConfig.InstallerTimeoutMinutes));
        var start = new ProcessStartInfo { FileName = java, WorkingDirectory = folder, UseShellExecute = false,
            CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        using var process = new Process { StartInfo = start };
        Task<string>? output = null;
        Task<string>? errors = null;
        try
        {
            if (!process.Start()) throw new InvalidOperationException("The Fabric installer could not be started.");
            output = process.StandardOutput.ReadToEndAsync(timeout.Token);
            errors = process.StandardError.ReadToEndAsync(timeout.Token);
            await process.WaitForExitAsync(timeout.Token).ConfigureAwait(false);
            var log = await output.ConfigureAwait(false) + "\n" + await errors.ConfigureAwait(false);
            if (process.ExitCode != 0) throw new InvalidOperationException("Fabric installation failed:\n" + string.Join('\n', log.Split('\n').TakeLast(16)));
        }
        finally
        {
            timeout.Cancel();
            try { if (!process.HasExited) { process.Kill(entireProcessTree: true); await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5)).ConfigureAwait(false); } }
            catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception or TimeoutException) { }
            if (output is not null && errors is not null)
                try { await Task.WhenAll(output, errors).ConfigureAwait(false); }
                catch (Exception ex) when (ex is IOException or OperationCanceledException or ObjectDisposedException) { }
        }
    }
}
