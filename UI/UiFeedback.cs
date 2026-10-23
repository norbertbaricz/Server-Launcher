using Server_Launcher.Services;

namespace Server_Launcher.UI;

internal static class UiFeedback
{
    public static void Error(IWin32Window? owner, string message, string title)
    {
        UiSoundService.PlayError();
        LauncherNotifications.Error(message);
        MessageBox.Show(owner, message, title, MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
