namespace Server_Launcher.Models;

public sealed class ServerProfile
{
    public string Name { get; set; } = "Minecraft Server";
    public string FolderPath { get; set; } = string.Empty;
    public string MinecraftVersion { get; set; } = string.Empty;
    // Backend identity remains independent of the UI and the launcher settings.
    public string ServerSoftware { get; set; } = Core.LauncherConfig.ServerSoftwareName;
    public int MinMemoryMb { get; set; } = Core.LauncherConfig.DefaultInitialRamMb;
    public int MaxMemoryMb { get; set; } = Core.LauncherConfig.DefaultRamMb;
    public int ServerPort { get; set; } = Core.LauncherConfig.DefaultServerPort;
    public bool AutoRestart { get; set; }
    public bool AutomaticBackups { get; set; }
    public string OptimizationProfile { get; set; } = Core.LauncherConfig.BalancedProfile;
    // Retained for compatibility with existing profiles. Global Java options are added at launch.
    public string ExtraJvmArguments { get; set; } = string.Empty;
    public int JavaMajorVersion { get; set; }
    public int LastJavaRuntimeMajor { get; set; }
    public string JavaExecutablePath { get; set; } = string.Empty;
    public string ServerBuild { get; set; } = string.Empty;
    public bool? OfflinePlayersAllowed { get; set; }
    public string ModsPath => Path.Combine(FolderPath, "mods");
    public string JarPath => Path.Combine(FolderPath, Core.LauncherConfig.ServerJarFileName);
    public string PluginsPath => Path.Combine(FolderPath, Core.LauncherConfig.PluginsFolderName);
    public string PidFilePath => Path.Combine(FolderPath, Core.LauncherConfig.ServerPidFileName);
}
