namespace Server_Launcher.Core;

internal static class BackendConfig
{
    // EASY-TO-TUNE NETWORK, RUNTIME AND INSTALLATION LIMITS.
    public const string FabricApi = "https://meta.fabricmc.net/v2";
    public const string MinecraftManifest = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    public const string BedrockLinks = "https://net-secondary.web.minecraft-services.net/api/v1.0/download/links";
    public const string AdoptiumApi = "https://api.adoptium.net/v3";
    public static readonly int[] KnownJavaMajors = { 8, 11, 16, 17, 21, 25 };
    public const string UserAgent = "ServerLauncher/2.5 (local desktop server manager)";
    public const string FabricLaunchJar = "fabric-server-launch.jar";
    public const string BedrockExecutable = "bedrock_server.exe";
    public const int MetadataTimeoutSeconds = 20;
    public const int DownloadTimeoutMinutes = 15;
    public const int JavaProbeTimeoutSeconds = 3;
    public const int StartupProbeBudgetSeconds = 3;
    public const int JavaCacheHours = 24;
    public const int InstallerTimeoutMinutes = 10;
    public const int DefaultBedrockPort = 19132;
    public const int MaximumJavaCandidates = 32;
    public const long MaximumDownloadBytes = 1024L * 1024 * 1024;
    public const long MaximumExtractedBytes = 4L * 1024 * 1024 * 1024;
    public const int MaximumArchiveEntries = 100_000;
}
