using System.Runtime.InteropServices;
using Server_Launcher.Core;
using Server_Launcher.Services;
using Server_Launcher.UI;

namespace Server_Launcher;

internal static class Program
{
    private const string SingleInstanceMutexName = @"Local\ServerLauncher_5A6725F2_992E_4CF5_9A8E_733C1962E0DE";
    private const string ErrorLogFileName = "launcher-errors.log";
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int RegisterWindowMessage(string message);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam);
    internal static readonly int RestoreWindowMessage = OperatingSystem.IsWindows() ? RegisterWindowMessage("ServerLauncherReborn.Restore.5A6725F2") : -1;
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);

    [STAThread]
    private static void Main()
    {
        if (OperatingSystem.IsWindows())
        {
            var result = SetCurrentProcessExplicitAppUserModelID(LauncherConfig.AppUserModelId);
            if (result < 0) Log("Taskbar identity could not be set: " + result);
        }
        var startInTray = Environment.GetCommandLineArgs().Any(argument => argument.Equals(WindowsStartupService.BackgroundArgument, StringComparison.OrdinalIgnoreCase));
        using var mutex = new Mutex(true, SingleInstanceMutexName, out var firstInstance);
        if (!firstInstance)
        {
            if (!startInTray && RestoreWindowMessage > 0) PostMessage(new IntPtr(0xffff), RestoreWindowMessage, IntPtr.Zero, IntPtr.Zero);
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => Report(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            Log(e.ExceptionObject.ToString() ?? "Unhandled application error");
            UiSoundService.PlayError();
        };
        TaskScheduler.UnobservedTaskException += (_, e) => { Log(e.Exception.ToString()); UiSoundService.PlayError(); e.SetObserved(); };
        try { Application.Run(new LauncherApplicationContext(startInTray)); }
        catch (Exception ex) { Report(ex); }
        finally { UiSoundService.Shutdown(); }
    }
    private static void Report(Exception error)
    {
        Log(error.ToString());
        UiFeedback.Error(Form.ActiveForm, error.Message, "Server Launcher error");
    }
    private static void Log(string message)
    {
        try { File.AppendAllText(Path.Combine(AppPaths.AppRoot, ErrorLogFileName), $"[{DateTimeOffset.Now:O}] {message}{Environment.NewLine}"); }
        catch { /* An unavailable log file must not hide the original error dialog. */ }
    }
}
