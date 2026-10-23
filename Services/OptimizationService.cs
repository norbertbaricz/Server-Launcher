using Server_Launcher.Core;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

public static class OptimizationService
{
    // EASY-TO-TUNE JAVA AND NATIVE GAMEPLAY VALUES.
    private const int BalanceViewDistance = 10;
    private const int BalanceSimulationDistance = 8;
    private const int PerformanceViewDistance = 8;
    private const int PerformanceSimulationDistance = 6;
    private const int BedrockBalanceViewDistance = 12;
    private const int BedrockPerformanceViewDistance = 8;
    private const int BedrockTickDistance = 4;

    public static string NormalizeProfile(string? name) => name?.Trim().ToLowerInvariant() switch
    {
        "standard" => LauncherConfig.StandardProfile,
        "performance" or "maximum performance" => LauncherConfig.PerformanceProfile,
        _ => LauncherConfig.BalancedProfile
    };
    public static string[] BuildJvmFlags(ServerProfile profile)
    {
        var mode = NormalizeProfile(profile.OptimizationProfile);
        if (mode == LauncherConfig.StandardProfile || !ServerBackends.Resolve(profile.ServerSoftware).RequiresJava) return Array.Empty<string>();
        // Pre-touch is a deliberate performance trade-off; Balance avoids touching the full heap at startup.
        var baseline = LauncherConfig.G1BaseFlags.Where(flag => mode == LauncherConfig.PerformanceProfile || flag != "-XX:+AlwaysPreTouch");
        if (mode != LauncherConfig.PerformanceProfile) return baseline.ToArray();
        // Recent JVMs removed several legacy experimental G1 switches. Use stable tuning on Java 23+.
        var extra = (profile.LastJavaRuntimeMajor > 0 ? profile.LastJavaRuntimeMajor : MinecraftVersions.RequiredJava(profile)) >= 23
            ? new[] { "-XX:G1ReservePercent=20", "-XX:InitiatingHeapOccupancyPercent=15" }
            : LauncherConfig.AikarPerformanceFlags;
        return baseline.Concat(extra).Distinct(StringComparer.Ordinal).ToArray();
    }
    public static int GetInitialHeapMb(ServerProfile profile) => Math.Clamp(profile.MinMemoryMb, LauncherConfig.MinimumRamMb, profile.MaxMemoryMb);

    public static async Task ApplyServerPropertiesAsync(ServerProfile profile, CancellationToken cancellationToken = default)
    {
        var backend = ServerBackends.Resolve(profile.ServerSoftware);
        var path = Path.Combine(profile.FolderPath, "server.properties");
        var lines = File.Exists(path) ? (await File.ReadAllLinesAsync(path, cancellationToken).ConfigureAwait(false)).ToList() : new List<string>();
        SetProperty(lines, "server-port", profile.ServerPort.ToString());
        if (!HasProperty(lines, "level-name")) SetProperty(lines, "level-name", backend.DefaultWorldName);
        if (profile.OfflinePlayersAllowed.HasValue) SetProperty(lines, "online-mode", profile.OfflinePlayersAllowed.Value ? "false" : "true");
        var mode = NormalizeProfile(profile.OptimizationProfile);
        var performance = mode == LauncherConfig.PerformanceProfile;
        if (backend.RequiresJava)
        {
            if (mode != LauncherConfig.StandardProfile)
            {
                SetProperty(lines, "view-distance", (performance ? PerformanceViewDistance : BalanceViewDistance).ToString());
                SetProperty(lines, "simulation-distance", (performance ? PerformanceSimulationDistance : BalanceSimulationDistance).ToString());
                SetProperty(lines, "network-compression-threshold", performance ? "512" : "256");
                SetProperty(lines, "sync-chunk-writes", performance ? "false" : "true");
            }
        }
        else
        {
            SetProperty(lines, "server-portv6", ServerPreflight.BedrockIpv6Port(profile).ToString());
            SetProperty(lines, "server-name", profile.Name.Replace(';', '_'));
            if (!HasProperty(lines, "enable-lan-visibility")) SetProperty(lines, "enable-lan-visibility", profile.ServerPort == backend.DefaultPort ? "true" : "false");
            if (mode != LauncherConfig.StandardProfile)
            {
                SetProperty(lines, "view-distance", (performance ? BedrockPerformanceViewDistance : BedrockBalanceViewDistance).ToString());
                SetProperty(lines, "tick-distance", BedrockTickDistance.ToString());
                SetProperty(lines, "max-threads", Math.Max(1, performance ? Environment.ProcessorCount - 1 : Environment.ProcessorCount / 2).ToString());
            }
        }
        Directory.CreateDirectory(profile.FolderPath);
        cancellationToken.ThrowIfCancellationRequested();
        GlobalSettingsService.WriteAtomically(path, string.Join(Environment.NewLine, lines) + Environment.NewLine);
    }
    private static bool HasProperty(IEnumerable<string> lines, string name) => lines.Any(raw =>
    {
        var line = raw.Trim();
        return !line.StartsWith('#') && !line.StartsWith('!') && line.Split('=', 2)[0].Trim().Equals(name, StringComparison.OrdinalIgnoreCase) && line.Contains('=');
    });
    internal static void SetProperty(List<string> lines, string name, string value)
    {
        var replaced = false;
        for (var i = lines.Count - 1; i >= 0; i--)
        {
            var line = lines[i].Trim();
            if (line.StartsWith('#') || line.StartsWith('!')) continue;
            var separator = line.IndexOf('=');
            if (separator <= 0 || !line[..separator].Trim().Equals(name, StringComparison.OrdinalIgnoreCase)) continue;
            if (replaced) lines.RemoveAt(i);
            else { lines[i] = name + "=" + value; replaced = true; }
        }
        if (!replaced) lines.Add(name + "=" + value);
    }
    public static string Describe(ServerProfile profile)
    {
        var mode = NormalizeProfile(profile.OptimizationProfile);
        if (!ServerBackends.Resolve(profile.ServerSoftware).RequiresJava)
            return mode + " · native Bedrock settings · memory managed by Bedrock";
        return mode switch
        {
            LauncherConfig.StandardProfile => $"Standard · Java defaults · Xms {GetInitialHeapMb(profile)} MB / Xmx {profile.MaxMemoryMb} MB",
            LauncherConfig.PerformanceProfile => $"Performance · G1 tuning for Java {(profile.LastJavaRuntimeMajor > 0 ? profile.LastJavaRuntimeMajor : MinecraftVersions.RequiredJava(profile))} · Xmx {profile.MaxMemoryMb} MB",
            _ => $"Balance · conservative G1 tuning · Xmx {profile.MaxMemoryMb} MB"
        };
    }
}
