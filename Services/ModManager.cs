using System.IO.Compression;
using System.Text.Json;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

public sealed class ModManager
{
    // EASY-TO-TUNE MANIFEST LIMIT; JARs are never executed while importing them.
    private const int MaximumManifestBytes = 1024 * 1024;
    public IReadOnlyList<string> GetInstalledMods(ServerProfile profile) => GetContent(profile).Where(p => p.Enabled).Select(p => p.Path).ToArray();
    public IReadOnlyList<InstalledJar> GetContent(ServerProfile profile) => JarContentManager.List(profile);
    public string InstallMod(ServerProfile profile, string source)
    {
        if (ServerBackends.Resolve(profile.ServerSoftware).ContentKind != ServerContentKind.Mods) throw new InvalidOperationException("This server does not use Fabric mods.");
        using (var zip = ZipFile.OpenRead(source))
        {
            var entry = zip.GetEntry("fabric.mod.json") ?? throw new InvalidDataException("This JAR is not a Fabric mod. Forge/NeoForge mods and Paper plugins cannot be installed here.");
            if (entry.Length > MaximumManifestBytes) throw new InvalidDataException("The mod manifest is too large.");
            using var input = entry.Open();
            using var doc = JsonDocument.Parse(input);
            if (doc.RootElement.TryGetProperty("environment", out var environment) && environment.GetString() == "client")
                throw new InvalidOperationException("This mod is marked client-only and cannot run on a dedicated server.");
        }
        return JarContentManager.Install(profile, source);
    }
    public void SetEnabled(ServerProfile profile, string path, bool enabled) => JarContentManager.SetEnabled(profile, path, enabled);
    public void RemoveMod(ServerProfile profile, string path) => JarContentManager.Remove(profile, path);
}
