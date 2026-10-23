using System.Text.Json;
using System.Text.RegularExpressions;
using Server_Launcher.Core;

namespace Server_Launcher.Services;

internal static class VersionListCache
{
    public static async Task<IReadOnlyList<string>> GetAsync(string id, Func<Task<IReadOnlyList<string>>> fetch, CancellationToken token)
    {
        var path = Path.Combine(AppPaths.RuntimeRoot, "metadata", id + "-versions.json");
        try
        {
            var versions = await fetch().ConfigureAwait(false);
            if (versions.Count == 0) throw new InvalidDataException("No stable releases were returned by the download service.");
            try { Directory.CreateDirectory(Path.GetDirectoryName(path)!); GlobalSettingsService.WriteAtomically(path, JsonSerializer.Serialize(versions)); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
            return versions;
        }
        catch (Exception ex) when (!token.IsCancellationRequested && (ex is HttpRequestException or OperationCanceledException))
        {
            if (File.Exists(path))
            {
                var cached = JsonSerializer.Deserialize<string[]>(await File.ReadAllTextAsync(path, token).ConfigureAwait(false));
                if (cached is { Length: > 0 }) return cached;
            }
            throw new InvalidOperationException("The release list is unavailable. Connect to the internet to download a new server; existing prepared servers remain usable locally.", ex);
        }
    }
}

public sealed class FabricApiService : IServerInstaller
{
    public Task<IReadOnlyList<string>> GetVersionsAsync(CancellationToken cancellationToken = default) =>
        VersionListCache.GetAsync("fabric", async () =>
        {
            using var doc = await HttpDownloads.JsonAsync(BackendConfig.FabricApi + "/versions/game", cancellationToken).ConfigureAwait(false);
            return doc.RootElement.EnumerateArray().Where(v => v.GetProperty("stable").GetBoolean())
                .Select(v => v.GetProperty("version").GetString()!).ToArray();
        }, cancellationToken);

    public async Task<string> DownloadLatestStableAsync(string minecraftVersion, string destinationPath, IProgress<int>? progress = null,
        CancellationToken cancellationToken = default, string? javaExecutable = null)
    {
        if (string.IsNullOrWhiteSpace(javaExecutable)) throw new InvalidOperationException("Prepare the matching Java runtime before installing Fabric.");
        var java = await JavaManager.ProbeAsync(javaExecutable, cancellationToken).ConfigureAwait(false)
            ?? throw new InvalidOperationException("The selected Java runtime could not be verified.");
        using var loaders = await HttpDownloads.JsonAsync(BackendConfig.FabricApi + "/versions/loader/" + Uri.EscapeDataString(minecraftVersion), cancellationToken).ConfigureAwait(false);
        var loader = loaders.RootElement.EnumerateArray().FirstOrDefault(v => v.GetProperty("loader").GetProperty("stable").GetBoolean() &&
            (!v.TryGetProperty("launcherMeta", out var meta) || !meta.TryGetProperty("min_java_version", out var minimum) || minimum.GetInt32() <= java.Major));
        if (loader.ValueKind == JsonValueKind.Undefined) throw new InvalidOperationException("No stable Fabric Loader supports this Minecraft/Java combination.");
        var loaderVersion = loader.GetProperty("loader").GetProperty("version").GetString()!;
        using var installers = await HttpDownloads.JsonAsync(BackendConfig.FabricApi + "/versions/installer", cancellationToken).ConfigureAwait(false);
        var installer = installers.RootElement.EnumerateArray().First(v => v.GetProperty("stable").GetBoolean());
        var version = installer.GetProperty("version").GetString()!;
        var url = installer.GetProperty("url").GetString()!;
        var cache = Path.Combine(AppPaths.RuntimeRoot, "installers");
        Directory.CreateDirectory(cache);
        var jar = Path.Combine(cache, "fabric-installer-" + version + ".jar");
        // Maven publishes SHA-256 beside the installer JAR. Verify every use, including cached files.
        var checksum = (await HttpDownloads.TextAsync(url + ".sha256", cancellationToken).ConfigureAwait(false)).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)[0];
        if (File.Exists(jar))
        {
            await using var file = File.OpenRead(jar);
            var actual = await System.Security.Cryptography.SHA256.HashDataAsync(file, cancellationToken).ConfigureAwait(false);
            if (!System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(actual, Convert.FromHexString(checksum)))
                throw new InvalidDataException("The cached Fabric installer is damaged. Remove it from runtime/installers and retry.");
        }
        else await HttpDownloads.DownloadAsync(url, jar, progress, cancellationToken, checksum).ConfigureAwait(false);
        var folder = Path.GetDirectoryName(destinationPath)!;
        await JavaToolRunner.RunAsync(javaExecutable, folder,
            new[] { "-jar", jar, "server", "-mcversion", minecraftVersion, "-loader", loaderVersion, "-dir", folder, "-downloadMinecraft" }, cancellationToken).ConfigureAwait(false);
        if (!File.Exists(destinationPath) || !File.Exists(Path.Combine(folder, "server.jar")) || !Directory.Exists(Path.Combine(folder, "libraries")))
            throw new InvalidDataException("Fabric installation did not produce the server launcher and its required files.");
        progress?.Report(100);
        return loaderVersion;
    }
    public void Dispose() { }
}

public sealed class BedrockApiService : IServerInstaller
{
    private static readonly Regex Version = new(@"bedrock-server-(?<v>\d+(?:\.\d+){2,3})\.zip$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static async Task<(string Version, string Url)> CurrentAsync(CancellationToken token)
    {
        using var doc = await HttpDownloads.JsonAsync(BackendConfig.BedrockLinks, token).ConfigureAwait(false);
        var link = doc.RootElement.GetProperty("result").GetProperty("links").EnumerateArray()
            .FirstOrDefault(e => e.GetProperty("downloadType").GetString() == "serverBedrockWindows");
        if (link.ValueKind == JsonValueKind.Undefined) throw new InvalidOperationException("The official Windows Bedrock server download is unavailable.");
        var url = link.GetProperty("downloadUrl").GetString()!;
        var uri = HttpDownloads.Https(url);
        if (!(uri.Host.Equals("minecraft.net", StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith(".minecraft.net", StringComparison.OrdinalIgnoreCase)))
            throw new InvalidDataException("The Bedrock service returned an unexpected download host.");
        var match = Version.Match(uri.AbsolutePath);
        if (!match.Success) throw new InvalidDataException("The Bedrock download version could not be identified.");
        return (match.Groups["v"].Value, url);
    }
    public async Task<IReadOnlyList<string>> GetVersionsAsync(CancellationToken cancellationToken = default) =>
        new[] { (await CurrentAsync(cancellationToken).ConfigureAwait(false)).Version };

    public async Task<string> DownloadLatestStableAsync(string minecraftVersion, string destinationPath, IProgress<int>? progress = null,
        CancellationToken cancellationToken = default, string? javaExecutable = null)
    {
        var current = await CurrentAsync(cancellationToken).ConfigureAwait(false);
        if (current.Version != minecraftVersion)
            throw new InvalidOperationException("The current Bedrock release changed. Refresh the release before creating this server.");
        Directory.CreateDirectory(AppPaths.RuntimeRoot);
        var download = Path.Combine(AppPaths.RuntimeRoot, ".bedrock-" + Guid.NewGuid().ToString("N") + ".zip");
        try
        {
            await HttpDownloads.DownloadAsync(current.Url, download, progress, cancellationToken).ConfigureAwait(false);
            await ExtractPackageAsync(download, destinationPath, cancellationToken).ConfigureAwait(false);
        }
        finally { if (File.Exists(download)) File.Delete(download); }
        progress?.Report(100);
        return current.Version;
    }
    internal static async Task ExtractPackageAsync(string package, string destinationPath, CancellationToken token)
    {
        BedrockPackages.Validate(package);
        await Task.Run(() => ArchiveExtractor.Extract(package, Path.GetDirectoryName(destinationPath)!, token), token).ConfigureAwait(false);
        if (!File.Exists(destinationPath)) throw new InvalidDataException("The Bedrock archive did not produce bedrock_server.exe.");
    }
    public void Dispose() { }
}
