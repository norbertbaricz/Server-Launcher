using Microsoft.Win32;
using Server_Launcher.Core;

namespace Server_Launcher.Services;

internal sealed record StartupRegistration(object? Value, RegistryValueKind Kind);
internal static class WindowsStartupService
{
    // EASY-TO-TUNE PER-USER STARTUP REGISTRATION. No admin access or machine-wide changes.
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string EntryName = "ServerLauncherReborn";
    public const string BackgroundArgument = "--background";
    public static StartupRegistration Read()
    {
        if (!OperatingSystem.IsWindows()) return new StartupRegistration(null, RegistryValueKind.String);
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: false);
        var value = key?.GetValue(EntryName, null, RegistryValueOptions.DoNotExpandEnvironmentNames);
        return new StartupRegistration(value, value is null ? RegistryValueKind.String : key!.GetValueKind(EntryName));
    }
    public static void Apply(bool enabled)
    {
        if (!OperatingSystem.IsWindows()) { if (enabled) throw new PlatformNotSupportedException("Windows startup is available on Windows only."); return; }
        using var key = Registry.CurrentUser.CreateSubKey(RunKey, writable: true) ?? throw new IOException("Windows startup registration could not be opened.");
        if (!enabled) { key.DeleteValue(EntryName, throwOnMissingValue: false); return; }
        var executable = Environment.ProcessPath ?? throw new IOException("The launcher executable path is unavailable.");
        if (!File.Exists(executable)) throw new FileNotFoundException("The launcher executable no longer exists.", executable);
        var command = Quote(executable);
        if (Path.GetFileNameWithoutExtension(executable).Equals("dotnet", StringComparison.OrdinalIgnoreCase))
            command += " " + Quote(Path.Combine(AppPaths.AppRoot, "Server Launcher.dll"));
        key.SetValue(EntryName, command + " " + BackgroundArgument, RegistryValueKind.String);
    }
    public static void Restore(StartupRegistration snapshot)
    {
        if (!OperatingSystem.IsWindows()) return;
        using var key = Registry.CurrentUser.CreateSubKey(RunKey, writable: true) ?? throw new IOException("Windows startup registration could not be restored.");
        if (snapshot.Value is null) key.DeleteValue(EntryName, throwOnMissingValue: false);
        else key.SetValue(EntryName, snapshot.Value, snapshot.Kind);
    }
    private static string Quote(string value)
    {
        if (value.Contains('"') || value.Any(char.IsControl)) throw new IOException("The executable path cannot be registered safely.");
        return "\"" + value + "\"";
    }
}
