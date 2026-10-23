using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using Server_Launcher.Core;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

public enum ServerWorldFormat { JavaAnvil, BedrockLevelDb }
public enum ServerContentKind { Plugins, Mods, Addons }
public enum ServerTransport { Tcp, Udp }

public interface IServerInstaller : IDisposable
{
    Task<IReadOnlyList<string>> GetVersionsAsync(CancellationToken cancellationToken = default);
    Task<string> DownloadLatestStableAsync(string minecraftVersion, string destinationPath, IProgress<int>? progress = null,
        CancellationToken cancellationToken = default, string? javaExecutable = null);
}

public interface IServerBackend
{
    string Id { get; }
    string DisplayName { get; }
    bool RequiresJava { get; }
    int DefaultPort { get; }
    bool SupportsJarPlugins { get; }
    ServerContentKind ContentKind { get; }
    ServerTransport Transport { get; }
    string ProcessNamePrefix { get; }
    string StopCommand { get; }
    ServerWorldFormat WorldFormat { get; }
    string DefaultWorldName { get; }
    string GetEntryPoint(ServerProfile profile);
    string GetWorldsRoot(ServerProfile profile);
    string GetContentRoot(ServerProfile profile);
    IServerInstaller CreateInstaller();
    ProcessStartInfo CreateStartInfo(ServerProfile profile, string executable);
    Task CompleteInstallationAsync(ServerProfile profile, CancellationToken cancellationToken = default);
    Task PrepareStartAsync(ServerProfile profile, CancellationToken cancellationToken = default);
    bool IsReadyLine(string line);
    bool IsErrorLine(string line);
}

public static class ServerBackends
{
    private static readonly IReadOnlyDictionary<string, IServerBackend> Backends = new Dictionary<string, IServerBackend>(StringComparer.OrdinalIgnoreCase)
    {
        ["Paper"] = new PaperBackend(), ["Fabric"] = new FabricBackend(), ["Bedrock"] = new BedrockBackend()
    };
    public static IEnumerable<IServerBackend> Available => Backends.Values;
    public static bool TryResolve(string software, out IServerBackend backend)
    {
        if (!string.IsNullOrWhiteSpace(software)) return Backends.TryGetValue(software, out backend!);
        backend = null!;
        return false;
    }
    public static IServerBackend Resolve(string software) => TryResolve(software, out var backend) ? backend
        : throw new NotSupportedException($"The '{software}' backend is not supported.");
    public static string BuildJavaArguments(ServerProfile profile, string globalExtraArguments)
    {
        if (!Resolve(profile.ServerSoftware).RequiresJava) throw new InvalidOperationException("Bedrock uses a native executable, not Java arguments.");
        MemoryLimits.Validate(profile);
        var standard = OptimizationService.NormalizeProfile(profile.OptimizationProfile) == LauncherConfig.StandardProfile;
        if (!standard) MemoryLimits.Validate(new ServerProfile { MinMemoryMb = profile.MinMemoryMb, MaxMemoryMb = profile.MaxMemoryMb, ExtraJvmArguments = globalExtraArguments });
        var parts = new List<string> { $"-Xms{OptimizationService.GetInitialHeapMb(profile)}M", $"-Xmx{profile.MaxMemoryMb}M" };
        parts.AddRange(OptimizationService.BuildJvmFlags(profile));
        if (!standard)
            foreach (var extra in new[] { profile.ExtraJvmArguments, globalExtraArguments })
                if (!string.IsNullOrWhiteSpace(extra)) parts.Add(extra.Replace('\r', ' ').Replace('\n', ' ').Trim());
        parts.Add($"-jar \"{Path.GetFileName(Resolve(profile.ServerSoftware).GetEntryPoint(profile))}\" nogui");
        return string.Join(' ', parts);
    }
}

internal abstract class JavaServerBackend : IServerBackend
{
    private static readonly Regex Ready = new(@"\bDone \([^\r\n]+\)!", RegexOptions.CultureInvariant);
    private static readonly Regex Errors = new(@"(?:\b(?:ERROR|SEVERE|FATAL)\b|^Exception in thread|^Caused by:|^\w+(?:\.\w+)+(?:Exception|Error)(?::|$))", RegexOptions.CultureInvariant);
    public abstract string Id { get; }
    public abstract string DisplayName { get; }
    public abstract ServerContentKind ContentKind { get; }
    public bool RequiresJava => true;
    public int DefaultPort => LauncherConfig.DefaultServerPort;
    public bool SupportsJarPlugins => ContentKind == ServerContentKind.Plugins;
    public ServerTransport Transport => ServerTransport.Tcp;
    public string ProcessNamePrefix => "java";
    public string StopCommand => "stop";
    public ServerWorldFormat WorldFormat => ServerWorldFormat.JavaAnvil;
    public string DefaultWorldName => "world";
    public virtual string GetEntryPoint(ServerProfile profile) => profile.JarPath;
    public string GetWorldsRoot(ServerProfile profile) => profile.FolderPath;
    public string GetContentRoot(ServerProfile profile) => ContentKind == ServerContentKind.Mods ? profile.ModsPath : profile.PluginsPath;
    public abstract IServerInstaller CreateInstaller();
    public async Task CompleteInstallationAsync(ServerProfile profile, CancellationToken cancellationToken = default)
    {
        await File.WriteAllTextAsync(Path.Combine(profile.FolderPath, LauncherConfig.EulaFileName), "eula=true\r\n", cancellationToken).ConfigureAwait(false);
        Directory.CreateDirectory(GetContentRoot(profile));
        await PrepareStartAsync(profile, cancellationToken).ConfigureAwait(false);
    }
    public Task PrepareStartAsync(ServerProfile profile, CancellationToken cancellationToken = default) => OptimizationService.ApplyServerPropertiesAsync(profile, cancellationToken);
    public bool IsReadyLine(string line) => Ready.IsMatch(line);
    public bool IsErrorLine(string line) => Errors.IsMatch(line);
    public ProcessStartInfo CreateStartInfo(ServerProfile profile, string executable) => new()
    {
        FileName = executable, Arguments = ServerBackends.BuildJavaArguments(profile, GlobalSettingsService.Current.ExtraJvmArguments),
        WorkingDirectory = profile.FolderPath, UseShellExecute = false, RedirectStandardInput = true,
        RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true,
        StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
    };
}
internal sealed class PaperBackend : JavaServerBackend
{
    public override string Id => "Paper";
    public override string DisplayName => "Vanilla · PaperMC";
    public override ServerContentKind ContentKind => ServerContentKind.Plugins;
    public override IServerInstaller CreateInstaller() => new PaperApiService();
}
internal sealed class FabricBackend : JavaServerBackend
{
    public override string Id => "Fabric";
    public override string DisplayName => "Modded · Fabric";
    public override ServerContentKind ContentKind => ServerContentKind.Mods;
    public override IServerInstaller CreateInstaller() => new FabricApiService();
    public override string GetEntryPoint(ServerProfile profile) => Path.Combine(profile.FolderPath, BackendConfig.FabricLaunchJar);
}
internal sealed class BedrockBackend : IServerBackend
{
    public string Id => "Bedrock";
    public string DisplayName => "Bedrock · Dedicated Server";
    public bool RequiresJava => false;
    public int DefaultPort => BackendConfig.DefaultBedrockPort;
    public bool SupportsJarPlugins => false;
    public ServerContentKind ContentKind => ServerContentKind.Addons;
    public ServerTransport Transport => ServerTransport.Udp;
    public string ProcessNamePrefix => "bedrock_server";
    public string StopCommand => "stop";
    public ServerWorldFormat WorldFormat => ServerWorldFormat.BedrockLevelDb;
    public string DefaultWorldName => "Bedrock level";
    public string GetEntryPoint(ServerProfile profile) => Path.Combine(profile.FolderPath, BackendConfig.BedrockExecutable);
    public string GetWorldsRoot(ServerProfile profile) => Path.Combine(profile.FolderPath, "worlds");
    public string GetContentRoot(ServerProfile profile) => profile.FolderPath;
    public IServerInstaller CreateInstaller() => new BedrockApiService();
    public Task CompleteInstallationAsync(ServerProfile profile, CancellationToken cancellationToken = default) => PrepareStartAsync(profile, cancellationToken);
    public Task PrepareStartAsync(ServerProfile profile, CancellationToken cancellationToken = default) => OptimizationService.ApplyServerPropertiesAsync(profile, cancellationToken);
    public bool IsReadyLine(string line) => line.Contains("Server started.", StringComparison.OrdinalIgnoreCase);
    public bool IsErrorLine(string line) => Regex.IsMatch(line, @"\b(?:ERROR|FATAL)\b|failed to (?:open|bind|start)|unable to bind", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    public ProcessStartInfo CreateStartInfo(ServerProfile profile, string executable) => new()
    {
        FileName = executable, WorkingDirectory = profile.FolderPath, UseShellExecute = false,
        RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true,
        StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
    };
}
