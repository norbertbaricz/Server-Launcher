using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Server_Launcher.Core;

namespace Server_Launcher.Services;

internal static class HttpDownloads
{
    // One pooled connection handler is shared by metadata, runtime and server downloads.
    private static readonly HttpClient Client = CreateClient();
    private static HttpClient CreateClient()
    {
        var client = new HttpClient(new SocketsHttpHandler
        {
            AutomaticDecompression = DecompressionMethods.All,
            ConnectTimeout = TimeSpan.FromSeconds(8), PooledConnectionLifetime = TimeSpan.FromMinutes(10)
        }) { Timeout = Timeout.InfiniteTimeSpan };
        client.DefaultRequestHeaders.UserAgent.ParseAdd(BackendConfig.UserAgent);
        return client;
    }
    public static async Task<JsonDocument> JsonAsync(string url, CancellationToken token = default)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(BackendConfig.MetadataTimeoutSeconds));
        using var response = await Client.GetAsync(Https(url), HttpCompletionOption.ResponseHeadersRead, timeout.Token).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token).ConfigureAwait(false);
        return await JsonDocument.ParseAsync(stream, cancellationToken: timeout.Token).ConfigureAwait(false);
    }
    public static async Task<string> TextAsync(string url, CancellationToken token = default)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(BackendConfig.MetadataTimeoutSeconds));
        return await Client.GetStringAsync(Https(url), timeout.Token).ConfigureAwait(false);
    }
    public static async Task<bool> HasInternetAsync(CancellationToken token = default)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Head, BackendConfig.MinecraftManifest);
            using var response = await Client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token).ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException) { return false; }
    }
    public static async Task DownloadAsync(string url, string destination, IProgress<int>? progress = null,
        CancellationToken token = default, string? checksum = null, bool sha1 = false)
    {
        if (File.Exists(destination)) throw new IOException("The destination file already exists: " + Path.GetFileName(destination));
        Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
        var temporary = destination + ".part-" + Guid.NewGuid().ToString("N");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromMinutes(BackendConfig.DownloadTimeoutMinutes));
        try
        {
            using var response = await Client.GetAsync(Https(url), HttpCompletionOption.ResponseHeadersRead, timeout.Token).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            var length = response.Content.Headers.ContentLength;
            if (length > BackendConfig.MaximumDownloadBytes) throw new InvalidDataException("The download exceeds the configured size limit.");
            await using (var input = await response.Content.ReadAsStreamAsync(timeout.Token).ConfigureAwait(false))
            await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true))
            {
                var buffer = new byte[81920];
                long total = 0;
                int read;
                while ((read = await input.ReadAsync(buffer, timeout.Token).ConfigureAwait(false)) > 0)
                {
                    total += read;
                    if (total > BackendConfig.MaximumDownloadBytes) throw new InvalidDataException("The download is too large.");
                    await output.WriteAsync(buffer.AsMemory(0, read), timeout.Token).ConfigureAwait(false);
                    if (length is > 0) progress?.Report((int)Math.Clamp(total * 100 / length.Value, 0, 99));
                }
                if (total == 0 || (length.HasValue && total != length)) throw new IOException("The download was incomplete.");
            }
            if (!string.IsNullOrWhiteSpace(checksum))
            {
                await using var file = File.OpenRead(temporary);
                var hash = sha1 ? await SHA1.HashDataAsync(file, timeout.Token).ConfigureAwait(false)
                    : await SHA256.HashDataAsync(file, timeout.Token).ConfigureAwait(false);
                if (!CryptographicOperations.FixedTimeEquals(hash, Convert.FromHexString(checksum.Trim())))
                    throw new InvalidDataException("The downloaded file failed its integrity check.");
            }
            timeout.Token.ThrowIfCancellationRequested();
            File.Move(temporary, destination, overwrite: false);
            progress?.Report(100);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    public static Uri Https(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var result) || result.Scheme != Uri.UriSchemeHttps)
            throw new InvalidDataException("A download service returned an invalid HTTPS address.");
        return result;
    }
}
