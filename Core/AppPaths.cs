namespace Server_Launcher.Core;

internal static class AppPaths
{
    public static string AppRoot => AppContext.BaseDirectory;
    public static string ServersRoot => Path.Combine(AppRoot, "servers");
    public static string RuntimeRoot => Path.Combine(AppRoot, "runtime");
    public static string BundledJavaExe => Path.Combine(RuntimeRoot, "java", "bin", "java.exe");

    public static void EnsureCreated()
    {
        Directory.CreateDirectory(ServersRoot);
        Directory.CreateDirectory(RuntimeRoot);
    }
}
