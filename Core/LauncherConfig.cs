namespace Server_Launcher.Core;

internal static class LauncherConfig
{
    // EASY-TO-TUNE APPLICATION DEFAULTS.
    public const string AppName = "Server Launcher";
    public const string AppVersion = "2.1.0";
    public const string AppUserModelId = "ServerLauncher.Desktop";
    public const string ServerSoftwareName = "Paper";
    public const string PaperProject = "paper";
    public const string PaperApiBaseUrl = "https://fill.papermc.io/v3";
    public const string PaperUserAgent = "ServerLauncher/" + AppVersion + " (https://github.com/norbertbaricz/Server-Launcher)";
    public const int DefaultRamMb = 6144;
    public const int DefaultInitialRamMb = 2048;
    public const int MinimumRamMb = 512;
    public const int RamStepMb = 512;
    public static int MaximumRamMb => MemoryLimits.TotalPhysicalMemoryMb;
    public const int DefaultServerPort = 25565;
    public const int GracefulStopTimeoutSeconds = 20;
    public const int ForceStopWaitMilliseconds = 5000;
    public const int EventSoundVolumePercent = 70;
    public const int ErrorSoundCooldownMs = 3500;
    public const int ReadySoundDelayMs = 750;
    public const int ExitSoundWaitSeconds = 8;
    public const int ExitFinalizationSlackMilliseconds = 2000;
    public const int PublicIpTimeoutSeconds = 6;
    public const int PublicIpRefreshMinutes = 5;
    public const string PublicIpEndpoint = "https://api.ipify.org";
    public const string GlobalSettingsFileName = "launcher.settings.json";
    public const string ServerJarFileName = "server.jar";
    public const string ProfileFileName = "launcher.json";
    public const string EulaFileName = "eula.txt";
    public const string PluginsFolderName = "plugins";
    public const string ServerPidFileName = ".server-launcher.pid";
    public const string StandardProfile = "Standard";
    public const string BalancedProfile = "Balance";
    public const string PerformanceProfile = "Performance";

    // Balance uses conservative G1 tuning. Standard deliberately uses neither array.
    public static readonly string[] G1BaseFlags =
    {
        "-XX:+UseG1GC", "-XX:+ParallelRefProcEnabled", "-XX:MaxGCPauseMillis=200",
        "-XX:+UnlockExperimentalVMOptions", "-XX:+DisableExplicitGC", "-XX:+AlwaysPreTouch",
        "-XX:+PerfDisableSharedMem", "-Dfile.encoding=UTF-8", "-Dterminal.jline=false", "-Dterminal.ansi=true"
    };
    public static readonly string[] AikarPerformanceFlags =
    {
        "-XX:G1NewSizePercent=30", "-XX:G1MaxNewSizePercent=40", "-XX:G1HeapRegionSize=8M",
        "-XX:G1ReservePercent=20", "-XX:G1HeapWastePercent=5", "-XX:G1MixedGCCountTarget=4",
        "-XX:InitiatingHeapOccupancyPercent=15", "-XX:G1MixedGCLiveThresholdPercent=90",
        "-XX:G1RSetUpdatingPauseTimePercent=5", "-XX:SurvivorRatio=32", "-XX:MaxTenuringThreshold=1",
        "-Dusing.aikars.flags=https://mcflags.emc.gs", "-Daikars.new.flags=true"
    };
}
