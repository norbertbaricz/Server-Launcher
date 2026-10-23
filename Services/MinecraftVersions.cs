using System.Collections.Concurrent;
using System.Text.Json;
using Server_Launcher.Core;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

internal sealed record MinecraftRelease(string Id, int JavaMajor, string ServerUrl, string ServerSha1);

internal static class MinecraftVersions
{
    private static readonly ConcurrentDictionary<string, MinecraftRelease> Memory = new(StringComparer.Ordinal);
    public static async Task<MinecraftRelease> GetAsync(string version, CancellationToken token = default)
    {
        if (Memory.TryGetValue(version, out var found)) return found;
        var cache = Path.Combine(AppPaths.RuntimeRoot, "metadata", "minecraft-" + SafeVersion(version) + ".json");
        if (File.Exists(cache))
        {
            try
            {
                var item = JsonSerializer.Deserialize<MinecraftRelease>(await File.ReadAllTextAsync(cache, token).ConfigureAwait(false));
                if (item is not null && item.Id == version && item.JavaMajor is >= 8 and <= 99)
                { Memory[version] = item; return item; }
            }
            catch (Exception ex) when (ex is IOException or JsonException) { }
        }
        using var manifest = await HttpDownloads.JsonAsync(BackendConfig.MinecraftManifest, token).ConfigureAwait(false);
        var entry = manifest.RootElement.GetProperty("versions").EnumerateArray().FirstOrDefault(e => e.GetProperty("id").GetString() == version);
        if (entry.ValueKind == JsonValueKind.Undefined) throw new InvalidOperationException("Minecraft release metadata was not found for " + version);
        using var details = await HttpDownloads.JsonAsync(entry.GetProperty("url").GetString()!, token).ConfigureAwait(false);
        var data = details.RootElement;
        var java = data.TryGetProperty("javaVersion", out var j) ? j.GetProperty("majorVersion").GetInt32() : LegacyJava(version);
        var server = data.GetProperty("downloads").GetProperty("server");
        var result = new MinecraftRelease(version, java, server.GetProperty("url").GetString()!, server.GetProperty("sha1").GetString()!);
        Directory.CreateDirectory(Path.GetDirectoryName(cache)!);
        GlobalSettingsService.WriteAtomically(cache, JsonSerializer.Serialize(result));
        Memory[version] = result;
        return result;
    }
    public static int RequiredJava(ServerProfile profile)
    {
        if (!ServerBackends.Resolve(profile.ServerSoftware).RequiresJava) return 0;
        return RecommendedJava(profile.MinecraftVersion, profile.ServerSoftware,
            Math.Max(profile.JavaMajorVersion, LegacyJava(profile.MinecraftVersion)));
    }
    public static int RecommendedJava(string version, string software, int mojangJava)
    {
        var v = Numbers(version);
        if (software.Equals("Fabric", StringComparison.OrdinalIgnoreCase))
            return v[0] == 1 && v[1] >= 17 ? Math.Max(mojangJava, 17) : mojangJava;
        if (!software.Equals("Paper", StringComparison.OrdinalIgnoreCase)) return mojangJava;
        if (v[0] >= 26) return Math.Max(mojangJava, 25);
        if (v[1] >= 20) return Math.Max(mojangJava, 21);
        if (v[1] >= 17) return Math.Max(mojangJava, 17);
        if (v[1] == 16 && v[2] >= 5) return Math.Max(mojangJava, 16);
        if (v[1] >= 12) return Math.Max(mojangJava, 11);
        return Math.Max(mojangJava, 8);
    }
    public static int LegacyJava(string version)
    {
        var v = Numbers(version);
        if (v[0] >= 26) return 25;
        if (v[0] != 1) throw new InvalidOperationException("The Java requirement is unknown. Reconnect once to load release metadata.");
        if (v[1] > 20 || (v[1] == 20 && v[2] >= 5)) return 21;
        if (v[1] >= 18) return 17;
        if (v[1] == 17) return 16;
        return 8;
    }
    public static int[] Numbers(string value)
    {
        var parts = value.Split('.');
        var result = new int[3];
        for (var i = 0; i < Math.Min(3, parts.Length); i++)
            if (!int.TryParse(parts[i], out result[i])) throw new InvalidDataException("Select a stable Minecraft release.");
        return result;
    }
    private static string SafeVersion(string version) => ArchiveExtractor.SafeComponent(version) ? version
        : throw new InvalidDataException("Invalid Minecraft version.");
}
