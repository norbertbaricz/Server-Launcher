using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using Server_Launcher.Core;

namespace Server_Launcher.Services;

public sealed record JavaInstallation(string Path, int Major, bool IsJdk, long Length, long ModifiedUtcTicks)
{
    public bool StillExists()
    {
        try { var f = new FileInfo(Path); return f.Exists && f.Length == Length && f.LastWriteTimeUtc.Ticks == ModifiedUtcTicks; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return false; }
    }
}

public sealed class JavaManager
{
    private sealed record Inventory(DateTime SavedUtc, List<JavaInstallation> Installations);
    private static readonly ConcurrentDictionary<int, SemaphoreSlim> InstallLocks = new();
    private static readonly object CacheLock = new();
    private static List<JavaInstallation> _inventory = new();
    private static readonly Regex VersionPattern = new("(?:java.version\\s*=|(?:java|openjdk) version)\\s*\"?(?<v>[0-9]+)(?:\\.(?<minor>[0-9]+))?", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static string CachePath => Path.Combine(AppPaths.RuntimeRoot, "java-inventory.json");

    public async Task<IReadOnlyList<JavaInstallation>> DiscoverAsync(CancellationToken token = default, bool refresh = false)
    {
        token.ThrowIfCancellationRequested();
        if (!refresh)
        {
            lock (CacheLock) if (_inventory.Count > 0 && _inventory.All(j => j.StillExists())) return _inventory.ToArray();
            try
            {
                if (File.Exists(CachePath))
                {
                    var saved = JsonSerializer.Deserialize<Inventory>(await File.ReadAllTextAsync(CachePath, token).ConfigureAwait(false));
                    if (saved is not null && DateTime.UtcNow - saved.SavedUtc < TimeSpan.FromHours(BackendConfig.JavaCacheHours) &&
                        saved.Installations is { Count: > 0 } && saved.Installations.All(j => j is not null && j.StillExists()))
                    { lock (CacheLock) _inventory = saved.Installations; return saved.Installations; }
                }
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException) { }
        }
        var found = new ConcurrentBag<JavaInstallation>();
        using var concurrency = new SemaphoreSlim(3);
        var candidates = await Task.Run(() => Candidates().Take(BackendConfig.MaximumJavaCandidates).ToArray(), token).ConfigureAwait(false);
        var tasks = candidates.Select(async path =>
        {
            await concurrency.WaitAsync(token).ConfigureAwait(false);
            try { var java = await ProbeAsync(path, token).ConfigureAwait(false); if (java is not null) found.Add(java); }
            finally { concurrency.Release(); }
        }).ToArray();
        try { await Task.WhenAll(tasks).ConfigureAwait(false); }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        var list = found.GroupBy(j => j.Path, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).OrderByDescending(j => j.Major).ToList();
        lock (CacheLock)
        {
            _inventory = _inventory.Where(j => j.StillExists()).Concat(list).GroupBy(j => j.Path, StringComparer.OrdinalIgnoreCase).Select(g => g.Last()).ToList();
            list = _inventory.ToList();
        }
        SaveCache(list);
        token.ThrowIfCancellationRequested();
        return list;
    }

    public async Task<string> EnsureAsync(int major, IProgress<int>? progress = null, CancellationToken token = default, string? preferred = null)
    {
        if (major is < 8 or > 99) throw new InvalidOperationException("An unsupported Java version was requested.");
        // File-system probes may touch a slow PATH entry. Keep them away from the UI thread.
        var existing = await Task.Run(() => FindAsync(major, preferred, token), token).ConfigureAwait(false);
        token.ThrowIfCancellationRequested();
        if (existing is not null) return existing;
        var gate = InstallLocks.GetOrAdd(major, _ => new SemaphoreSlim(1));
        await gate.WaitAsync(token).ConfigureAwait(false);
        string? temporary = null;
        try
        {
            existing = await FindAsync(major, preferred, token).ConfigureAwait(false);
            if (existing is not null) return existing;
            if (!OperatingSystem.IsWindows() || !Environment.Is64BitOperatingSystem)
                throw new PlatformNotSupportedException("Automatic Java preparation requires 64-bit Windows.");
            using var metadata = await HttpDownloads.JsonAsync($"{BackendConfig.AdoptiumApi}/assets/latest/{major}/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse", token).ConfigureAwait(false);
            var assets = metadata.RootElement;
            if (assets.GetArrayLength() == 0) throw new InvalidOperationException($"No Windows x64 JDK {major} download is available.");
            var asset = assets[0];
            if (asset.GetProperty("version").GetProperty("major").GetInt32() != major) throw new InvalidDataException("The JDK service returned another Java version.");
            var package = asset.GetProperty("binary").GetProperty("package");
            Directory.CreateDirectory(AppPaths.RuntimeRoot);
            temporary = Path.Combine(AppPaths.RuntimeRoot, ".java-install-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(temporary);
            var zip = Path.Combine(temporary, "jdk.zip");
            await HttpDownloads.DownloadAsync(package.GetProperty("link").GetString()!, zip, progress, token,
                package.GetProperty("checksum").GetString()).ConfigureAwait(false);
            var extracted = Path.Combine(temporary, "unpacked");
            await Task.Run(() => ArchiveExtractor.Extract(zip, extracted, token), token).ConfigureAwait(false);
            var homes = Directory.EnumerateDirectories(extracted).Prepend(extracted)
                .Where(p => File.Exists(Path.Combine(p, "bin", "java.exe"))).ToArray();
            if (homes.Length != 1) throw new InvalidDataException("The JDK archive does not contain one Java runtime.");
            var verified = await ProbeAsync(Path.Combine(homes[0], "bin", "java.exe"), token).ConfigureAwait(false);
            if (verified is null || verified.Major != major) throw new InvalidDataException("The downloaded JDK could not be verified.");
            var target = Path.Combine(AppPaths.RuntimeRoot, "java-" + major);
            if (Directory.Exists(target))
                throw new IOException($"The existing runtime\\java-{major} folder is not a working JDK. Move it aside and retry.");
            Directory.Move(homes[0], target);
            var executable = Path.Combine(target, "bin", "java.exe");
            var installedFile = new FileInfo(executable);
            var entry = new JavaInstallation(executable, major, true, installedFile.Length, installedFile.LastWriteTimeUtc.Ticks);
            lock (CacheLock) { _inventory.RemoveAll(j => !j.StillExists()); _inventory.Add(entry); SaveCache(_inventory); }
            return executable;
        }
        catch (HttpRequestException ex)
        { throw new InvalidOperationException($"Java {major} is not installed and could not be downloaded. Connect once to prepare it, or install a matching x64 JDK and set JAVA_HOME. Existing prepared servers can still run locally.", ex); }
        finally
        {
            try { if (temporary is not null && Directory.Exists(temporary)) Directory.Delete(temporary, true); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
            gate.Release();
        }
    }

    private async Task<string?> FindAsync(int major, string? preferred, CancellationToken token)
    {
        if (!string.IsNullOrWhiteSpace(preferred) && File.Exists(preferred))
        {
            JavaInstallation? cached;
            lock (CacheLock) cached = _inventory.FirstOrDefault(j => j.Path.Equals(preferred, StringComparison.OrdinalIgnoreCase) && j.Major == major && j.StillExists());
            if (cached is not null) return cached.Path;
            var java = await ProbeAsync(preferred, token).ConfigureAwait(false);
            if (java?.Major == major) return java.Path;
        }
        var inventory = await DiscoverAsync(token).ConfigureAwait(false);
        var match = inventory.FirstOrDefault(j => j.Major == major && j.StillExists());
        if (match is not null) return match.Path;
        inventory = await DiscoverAsync(token, refresh: true).ConfigureAwait(false);
        return inventory.FirstOrDefault(j => j.Major == major && j.StillExists())?.Path;
    }

    public static async Task<JavaInstallation?> ProbeAsync(string path, CancellationToken token = default)
    {
        if (!File.Exists(path)) return null;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(BackendConfig.JavaProbeTimeoutSeconds));
        using var process = new Process { StartInfo = new ProcessStartInfo
        {
            FileName = path, Arguments = "-XshowSettings:properties -version", UseShellExecute = false,
            RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true
        } };
        Task<string>? output = null;
        Task<string>? error = null;
        try
        {
            if (!process.Start()) return null;
            output = process.StandardOutput.ReadToEndAsync(timeout.Token);
            error = process.StandardError.ReadToEndAsync(timeout.Token);
            await process.WaitForExitAsync(timeout.Token).ConfigureAwait(false);
            var text = await output.ConfigureAwait(false) + "\n" + await error.ConfigureAwait(false);
            if (process.ExitCode != 0 || !Regex.IsMatch(text, @"(?:sun.arch.data.model\s*=\s*64|os.arch\s*=\s*(?:amd64|x86_64))", RegexOptions.IgnoreCase)) return null;
            var match = VersionPattern.Match(text);
            if (!match.Success) return null;
            var major = int.Parse(match.Groups["v"].Value);
            if (major == 1) major = int.Parse(match.Groups["minor"].Value);
            var home = Regex.Match(text, @"(?m)^\s*java.home\s*=\s*(.+)$").Groups[1].Value.Trim();
            var actual = Path.Combine(home, "bin", "java.exe");
            if (File.Exists(actual)) path = actual;
            var file = new FileInfo(path);
            return new JavaInstallation(file.FullName, major, (File.Exists(Path.Combine(Path.GetDirectoryName(path)!, "javac.exe")) || File.Exists(Path.Combine(home, "..", "bin", "javac.exe"))), file.Length, file.LastWriteTimeUtc.Ticks);
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or System.ComponentModel.Win32Exception or OperationCanceledException) { return null; }
        finally
        {
            timeout.Cancel();
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
            catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception) { }
            // Observe canceled/faulted pipe readers so a timed-out probe cannot emit a later UI error.
            if (output is not null && error is not null)
                try { await Task.WhenAll(output, error).ConfigureAwait(false); }
                catch (Exception ex) when (ex is IOException or OperationCanceledException or ObjectDisposedException) { }
        }
    }
    private static IEnumerable<string> Candidates()
    {
        var list = new List<string> { AppPaths.BundledJavaExe };
        try
        {
            if (Directory.Exists(AppPaths.RuntimeRoot))
                list.AddRange(Directory.EnumerateDirectories(AppPaths.RuntimeRoot, "java-*").Select(p => Path.Combine(p, "bin", "java.exe")));
        }
        catch (IOException) { }
        foreach (var key in new[] { "JAVA_HOME", "JDK_HOME" })
        {
            var home = Environment.GetEnvironmentVariable(key);
            if (!string.IsNullOrWhiteSpace(home)) list.Add(Path.Combine(home.Trim('"'), "bin", "java.exe"));
        }
        foreach (var part in (Environment.GetEnvironmentVariable("PATH") ?? string.Empty).Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        { try { list.Add(Path.Combine(part.Trim().Trim('"'), "java.exe")); } catch (ArgumentException) { } }
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        foreach (var vendor in new[] { "Eclipse Adoptium", "Java", "Microsoft", "Amazon Corretto", "BellSoft", "Zulu" })
        {
            var folder = Path.Combine(programFiles, vendor);
            try
            {
                if (Directory.Exists(folder)) list.AddRange(Directory.EnumerateDirectories(folder).Take(16).Select(p => Path.Combine(p, "bin", "java.exe")));
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        }
        return list.Distinct(StringComparer.OrdinalIgnoreCase).Where(File.Exists);
    }
    private static void SaveCache(List<JavaInstallation> inventory)
    {
        try
        {
            Directory.CreateDirectory(AppPaths.RuntimeRoot);
            GlobalSettingsService.WriteAtomically(CachePath, JsonSerializer.Serialize(new Inventory(DateTime.UtcNow, inventory)));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }
}
