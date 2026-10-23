using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using Server_Launcher.Core;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

internal static class ServerPreflight
{
    public static int BedrockIpv6Port(ServerProfile profile) => profile.ServerPort == 65535 ? 65534 : profile.ServerPort + 1;
    private static readonly string[] NativeLibraries = { "vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll" };
    public static bool NativeRuntimeAvailable => NativeLibraries.All(name => File.Exists(Path.Combine(Environment.SystemDirectory, name)));
    public static void EnsurePlatform(IServerBackend backend)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("This launcher hosts Windows servers.");
        if (!Environment.Is64BitOperatingSystem || RuntimeInformation.OSArchitecture != Architecture.X64)
            throw new PlatformNotSupportedException("The supported server downloads require Windows on an x64 Intel/AMD computer.");
    }
    public static void ValidateProfile(ServerProfile profile)
    {
        var backend = ServerBackends.Resolve(profile.ServerSoftware);
        EnsurePlatform(backend);
        if (profile.ServerPort is < 1 or > 65535) throw new InvalidOperationException("The server port must be between 1 and 65535.");
        if (!backend.RequiresJava && !NativeLibraries.All(name => File.Exists(Path.Combine(Environment.SystemDirectory, name)) || File.Exists(Path.Combine(profile.FolderPath, name))))
            throw new InvalidOperationException("Bedrock needs the Microsoft Visual C++ 2015–2022 x64 runtime. Install it from https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist then retry. Java is not needed for Bedrock.");
    }
    public static void EnsurePortsAvailable(ServerProfile profile)
    {
        var backend = ServerBackends.Resolve(profile.ServerSoftware);
        var ports = new HashSet<int> { profile.ServerPort };
        var ipv6Ports = new HashSet<int>();
        if (!backend.RequiresJava)
        {
            ipv6Ports.Add(BedrockIpv6Port(profile));
            var settings = Path.Combine(profile.FolderPath, "server.properties");
            var visible = File.Exists(settings) && File.ReadLines(settings).Any(l => l.Trim().Equals("enable-lan-visibility=true", StringComparison.OrdinalIgnoreCase));
            if (visible) { ports.Add(BackendConfig.DefaultBedrockPort); ipv6Ports.Add(BackendConfig.DefaultBedrockPort + 1); }
        }
        try
        {
            var properties = IPGlobalProperties.GetIPGlobalProperties();
            var listeners = backend.Transport == ServerTransport.Tcp ? properties.GetActiveTcpListeners() : properties.GetActiveUdpListeners();
            var occupied = listeners.FirstOrDefault(e => backend.Transport == ServerTransport.Tcp
                ? ports.Contains(e.Port) : e.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6
                    ? ipv6Ports.Contains(e.Port) : ports.Contains(e.Port));
            if (occupied is not null) throw new InvalidOperationException($"{backend.Transport.ToString().ToUpperInvariant()} port {occupied.Port} is already in use. Stop the other application or choose another server port.");
        }
        catch (NetworkInformationException) { /* The server will report its own bind error if this OS query is unavailable. */ }
    }
}
