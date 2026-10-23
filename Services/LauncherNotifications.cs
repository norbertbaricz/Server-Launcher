using Server_Launcher.Core;

namespace Server_Launcher.Services;

internal sealed record LauncherNotice(string Title, string Message, bool Error);
internal static class LauncherNotifications
{
    // EASY-TO-TUNE NOTIFICATION LIMIT. Repeated stacktrace lines become one desktop alert.
    private const int ErrorCooldownMilliseconds = 10_000;
    private static readonly object Sync = new();
    private static long _lastErrorTick;
    public static event Action<LauncherNotice>? Raised;
    public static void Success(string title, string message) => Publish(new LauncherNotice(title, message, false));
    public static void Error(string message)
    {
        lock (Sync)
        {
            var now = Environment.TickCount64;
            if (_lastErrorTick != 0 && now - _lastErrorTick < ErrorCooldownMilliseconds) return;
            _lastErrorTick = now;
        }
        Publish(new LauncherNotice(LauncherConfig.AppName + " · Error", message, true));
    }
    private static void Publish(LauncherNotice notice)
    {
        if (GlobalSettingsService.Current.DesktopNotificationsEnabled) Raised?.Invoke(notice);
    }
}
