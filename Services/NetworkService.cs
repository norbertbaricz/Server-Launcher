using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using Server_Launcher.Core;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

public static class NetworkService
{
    private static readonly HttpClient Client = new() { Timeout = TimeSpan.FromSeconds(LauncherConfig.PublicIpTimeoutSeconds) };
    public static string GetDisplayAddress(ServerProfile profile) => $"{GetLanIpv4Address()}:{profile.ServerPort}";
    public static async Task<string?> GetPublicIpv4Async(CancellationToken cancellationToken)
    {
        try
        {
            var text = (await Client.GetStringAsync(LauncherConfig.PublicIpEndpoint, cancellationToken)).Trim();
            return IPAddress.TryParse(text, out var address) && address.AddressFamily == AddressFamily.InterNetwork ? address.ToString() : null;
        }
        catch (HttpRequestException) { return null; }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { return null; }
    }
    public static string GetLanIpv4Address()
    {
        try
        {
            var candidates = NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType is not (NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel))
                .OrderByDescending(n => n.GetIPProperties().GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork))
                .ThenByDescending(n => n.NetworkInterfaceType is NetworkInterfaceType.Ethernet or NetworkInterfaceType.Wireless80211);
            foreach (var network in candidates)
                foreach (var entry in network.GetIPProperties().UnicastAddresses)
                    if (entry.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(entry.Address) && !entry.Address.ToString().StartsWith("169.254.", StringComparison.Ordinal))
                        return entry.Address.ToString();
        }
        catch (NetworkInformationException) { }
        return "127.0.0.1";
    }
}
