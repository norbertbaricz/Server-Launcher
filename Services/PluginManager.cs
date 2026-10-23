using System.IO.Compression;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

public sealed class PluginManager
{
    public IReadOnlyList<string> GetInstalledPlugins(ServerProfile profile) => GetContent(profile).Where(p => p.Enabled).Select(p => p.Path).ToArray();
    public IReadOnlyList<InstalledJar> GetContent(ServerProfile profile) => JarContentManager.List(profile);
    public string InstallPlugin(ServerProfile profile, string sourceJarPath)
    {
        if (ServerBackends.Resolve(profile.ServerSoftware).ContentKind != ServerContentKind.Plugins) throw new InvalidOperationException("This server does not load Paper plugins.");
        using (var jar = ZipFile.OpenRead(sourceJarPath))
            if (jar.GetEntry("plugin.yml") is null && jar.GetEntry("paper-plugin.yml") is null)
                throw new InvalidDataException("This archive is not a Paper/Bukkit plugin. Fabric mods belong on a Fabric server.");
        return JarContentManager.Install(profile, sourceJarPath);
    }
    public void SetEnabled(ServerProfile profile, string path, bool enabled) => JarContentManager.SetEnabled(profile, path, enabled);
    public void RemovePlugin(ServerProfile profile, string path) => JarContentManager.Remove(profile, path);
}
