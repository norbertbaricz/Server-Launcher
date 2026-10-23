using Server_Launcher.Core;

namespace Server_Launcher.Models;

public sealed class GlobalSettings
{
    // Defaults are configured centrally in LauncherConfig.
    public int InitialMemoryMb { get; set; } = LauncherConfig.DefaultInitialRamMb;
    public int MaximumMemoryMb { get; set; } = LauncherConfig.DefaultRamMb;
    public string OptimizationProfile { get; set; } = LauncherConfig.BalancedProfile;
    public string ExtraJvmArguments { get; set; } = string.Empty;
    public bool ShowPublicIp { get; set; } = true;
    public bool DesktopNotificationsEnabled { get; set; } = true;
    public bool CloseToTray { get; set; }
    public bool StartWithWindows { get; set; }
}
