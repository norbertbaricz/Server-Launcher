using System.Runtime.InteropServices;
using Server_Launcher.Core;

namespace Server_Launcher.Services;

internal sealed record StartupCheck(string Key, string Detail, bool Warning = false, bool Error = false);

internal static class StartupDiagnostics
{
    private static readonly TaskCompletionSource<int> Cleanup = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public static Task<int> CleanupTask => Cleanup.Task;
    public static bool StorageReady { get; private set; }

    public static async Task RunAsync(IProgress<StartupCheck> progress, CancellationToken token)
    {
        // Independent checks overlap. No Java downloads and no mandatory internet connection at startup.
        var core = Task.Run(() =>
        {
            try
            {
                var memory = MemoryLimits.TotalPhysicalMemoryMb;
                progress.Report(new StartupCheck("system", $"{RuntimeInformation.OSArchitecture} · {MemoryLimits.Format(memory)} RAM", Error: !Environment.Is64BitOperatingSystem));
                AppPaths.EnsureCreated();
                var probe = Path.Combine(AppPaths.RuntimeRoot, ".write-check-" + Guid.NewGuid().ToString("N"));
                try { File.WriteAllText(probe, "ok"); } finally { if (File.Exists(probe)) File.Delete(probe); }
                StorageReady = true;
                progress.Report(new StartupCheck("storage", "Server and runtime folders are writable"));
                var count = ServerProcessManager.CleanupOrphanedManagedServers(new ProfileService().LoadAll());
                Cleanup.TrySetResult(count);
                progress.Report(new StartupCheck("sessions", count == 0 ? "No leftover managed server sessions" : $"Closed {count} leftover managed session(s)"));
            }
            catch (Exception ex)
            {
                Cleanup.TrySetResult(0);
                progress.Report(new StartupCheck(StorageReady ? "sessions" : "storage", ex.Message, Error: true));
            }
            var native = RuntimeInformation.OSArchitecture == Architecture.X64 && ServerPreflight.NativeRuntimeAvailable;
            progress.Report(new StartupCheck("bedrock", native ? "Windows x64 / Visual C++ runtime available" : "Bedrock needs Windows x64 and the Visual C++ x64 runtime", Warning: !native));
        });
        var java = CheckJavaAsync(progress, token);
        var network = CheckNetworkAsync(progress, token);
        await Task.WhenAll(core, java, network).ConfigureAwait(false);
    }
    private static async Task CheckJavaAsync(IProgress<StartupCheck> progress, CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(BackendConfig.StartupProbeBudgetSeconds));
        var checkToken = timeout.Token;
        try
        {
            var discovery = Task.Run(async () =>
            {
                try { return await new JavaManager().DiscoverAsync(checkToken).ConfigureAwait(false); }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or OperationCanceledException)
                { return Array.Empty<JavaInstallation>(); }
            });
            var installed = await discovery.WaitAsync(checkToken).ConfigureAwait(false);
            var versions = installed.Select(j => j.Major).Distinct().OrderBy(v => v).ToArray();
            var missing = new ProfileService().LoadAll()
                .Where(p => ServerBackends.TryResolve(p.ServerSoftware, out var backend) && backend.RequiresJava)
                .Select(p => Math.Max(MinecraftVersions.RequiredJava(p), p.LastJavaRuntimeMajor)).Distinct().Where(v => !versions.Contains(v)).OrderBy(v => v).ToArray();
            var detail = versions.Length == 0 ? "No compatible Java detected · prepared when needed" : "Java " + string.Join(", ", versions) + " detected";
            if (missing.Length > 0) detail += " · Java " + string.Join(", ", missing) + " prepared on demand";
            progress.Report(new StartupCheck("java", detail, Warning: versions.Length == 0 || missing.Length > 0));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or OperationCanceledException or InvalidOperationException)
        { progress.Report(new StartupCheck("java", "Java will be checked when a Java server is prepared", Warning: true)); }
    }
    private static async Task CheckNetworkAsync(IProgress<StartupCheck> progress, CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(BackendConfig.StartupProbeBudgetSeconds));
        var online = await HttpDownloads.HasInternetAsync(timeout.Token).ConfigureAwait(false);
        var lan = NetworkService.GetLanIpv4Address();
        progress.Report(new StartupCheck("network", online ? "Internet available · LAN " + lan : "Offline · local hosting remains available · " + lan, Warning: !online));
    }
}
