using System.Text.Json;
using System.Text.RegularExpressions;
using Server_Launcher.Core;

namespace Server_Launcher.Services;

public sealed class PaperApiService : IServerInstaller
{
    private static readonly Regex StableVersion = new(@"^\d+(?:\.\d+){1,3}$", RegexOptions.CultureInvariant);
    public Task<IReadOnlyList<string>> GetVersionsAsync(CancellationToken cancellationToken = default) =>
        VersionListCache.GetAsync("paper", async () =>
        {
            using var document = await HttpDownloads.JsonAsync($"{LauncherConfig.PaperApiBaseUrl}/projects/{LauncherConfig.PaperProject}", cancellationToken).ConfigureAwait(false);
            return document.RootElement.GetProperty("versions").EnumerateObject().SelectMany(g => g.Value.EnumerateArray())
                .Select(v => v.GetString()!).Where(v => StableVersion.IsMatch(v)).Distinct(StringComparer.Ordinal).ToArray();
        }, cancellationToken);

    public async Task<string> DownloadLatestStableAsync(string minecraftVersion, string destinationPath,
        IProgress<int>? progress = null, CancellationToken cancellationToken = default, string? javaExecutable = null)
    {
        using var doc = await HttpDownloads.JsonAsync($"{LauncherConfig.PaperApiBaseUrl}/projects/{LauncherConfig.PaperProject}/versions/{Uri.EscapeDataString(minecraftVersion)}/builds", cancellationToken).ConfigureAwait(false);
        var build = doc.RootElement.EnumerateArray().Where(b => b.TryGetProperty("channel", out var c) && c.GetString()?.Equals("STABLE", StringComparison.OrdinalIgnoreCase) == true)
            .OrderByDescending(b => b.GetProperty("id").GetInt32()).FirstOrDefault();
        if (build.ValueKind == JsonValueKind.Undefined) throw new InvalidOperationException($"No stable Paper build is available for Minecraft {minecraftVersion}.");
        var download = build.GetProperty("downloads").GetProperty("server:default");
        string? checksum = null;
        if (download.TryGetProperty("checksums", out var hashes) && hashes.TryGetProperty("sha256", out var sha)) checksum = sha.GetString();
        await HttpDownloads.DownloadAsync(download.GetProperty("url").GetString()!, destinationPath, progress, cancellationToken, checksum).ConfigureAwait(false);
        return build.GetProperty("id").GetInt32().ToString();
    }
    public void Dispose() { }
}
