using System.Runtime.InteropServices;
using System.Text;
using Server_Launcher.Models;

namespace Server_Launcher.Core;

internal static class MemoryLimits
{
    // Hardware is detected once. These switches remain controlled by the RAM sliders.
    private const ulong KilobytesPerMegabyte = 1024;
    private const ulong BytesPerMegabyte = 1024 * 1024;
    private static readonly string[] ManagedHeapArguments =
    {
        "-Xms", "-Xmx", "-ms", "-mx", "-XX:InitialHeapSize", "-XX:MaxHeapSize"
    };
    private static readonly Lazy<int> DetectedMemory = new(ReadPhysicalMemoryMb);

    public static int TotalPhysicalMemoryMb => DetectedMemory.Value;
    public static bool IsSupported => TotalPhysicalMemoryMb >= LauncherConfig.MinimumRamMb;

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatus
    {
        public uint Length;
        public uint MemoryLoad;
        public ulong TotalPhysical;
        public ulong AvailablePhysical;
        public ulong TotalPageFile;
        public ulong AvailablePageFile;
        public ulong TotalVirtual;
        public ulong AvailableVirtual;
        public ulong AvailableExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetPhysicallyInstalledSystemMemory(out ulong totalMemoryInKilobytes);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);

    private static int ReadPhysicalMemoryMb()
    {
        if (OperatingSystem.IsWindows())
        {
            if (GetPhysicallyInstalledSystemMemory(out var kilobytes) && kilobytes > 0)
                return (int)Math.Clamp(kilobytes / KilobytesPerMegabyte, 1UL, (ulong)int.MaxValue);

            var status = new MemoryStatus { Length = (uint)Marshal.SizeOf<MemoryStatus>() };
            if (GlobalMemoryStatusEx(ref status) && status.TotalPhysical > 0)
                return (int)Math.Clamp(status.TotalPhysical / BytesPerMegabyte, 1UL, (ulong)int.MaxValue);
        }

        // The runtime's limit is a conservative fallback; never invent a 32/64 GB maximum.
        var fallback = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / (long)BytesPerMegabyte;
        return (int)Math.Clamp(fallback, 1, int.MaxValue);
    }

    public static int ClampMemory(int megabytes)
    {
        var minimum = Math.Min(LauncherConfig.MinimumRamMb, TotalPhysicalMemoryMb);
        return Math.Clamp(megabytes, minimum, TotalPhysicalMemoryMb);
    }

    public static void ClampProfile(ServerProfile profile)
    {
        profile.MaxMemoryMb = ClampMemory(profile.MaxMemoryMb);
        profile.MinMemoryMb = Math.Clamp(ClampMemory(profile.MinMemoryMb),
            Math.Min(LauncherConfig.MinimumRamMb, profile.MaxMemoryMb), profile.MaxMemoryMb);
    }

    public static void Validate(ServerProfile profile)
    {
        if (!IsSupported)
            throw new InvalidOperationException($"At least {LauncherConfig.MinimumRamMb} MB of physical RAM is required.");
        if (profile.MinMemoryMb < LauncherConfig.MinimumRamMb ||
            profile.MaxMemoryMb < profile.MinMemoryMb || profile.MaxMemoryMb > TotalPhysicalMemoryMb)
        {
            throw new InvalidOperationException(
                $"RAM must be between {LauncherConfig.MinimumRamMb} and {TotalPhysicalMemoryMb} MB, with initial RAM no higher than maximum RAM.");
        }

        foreach (var argument in SplitArguments(profile.ExtraJvmArguments))
        {
            if (ManagedHeapArguments.Any(prefix => argument.StartsWith(prefix, StringComparison.Ordinal)))
                throw new InvalidOperationException("Set Xms/Xmx with the memory sliders. Remove heap-size switches from Extra JVM arguments.");
        }
    }

    private static IEnumerable<string> SplitArguments(string? arguments)
    {
        if (string.IsNullOrWhiteSpace(arguments))
            yield break;
        var token = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < arguments.Length; i++)
        {
            var character = arguments[i];
            if (character == '\\' && i + 1 < arguments.Length && arguments[i + 1] == '"')
            {
                token.Append('"');
                i++;
            }
            else if (character == '"')
                quoted = !quoted;
            else if (char.IsWhiteSpace(character) && !quoted)
            {
                if (token.Length > 0) { yield return token.ToString(); token.Clear(); }
            }
            else
                token.Append(character);
        }
        if (token.Length > 0)
            yield return token.ToString();
    }

    public static string Format(int megabytes) => megabytes < 1024
        ? $"{megabytes} MB"
        : $"{megabytes / 1024d:0.##} GB";
}
