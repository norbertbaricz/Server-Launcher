using System.IO.Compression;
using Server_Launcher.Core;

namespace Server_Launcher.Services;

internal sealed class ExtractionBudget
{
    public int Entries;
    public long Bytes;
}

internal static class ArchiveExtractor
{
    // Paths are checked using Windows rules, even when source validation runs on another OS.
    private static readonly char[] Invalid = "<>:\"|?*".ToCharArray();
    public static bool SafeComponent(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || value is "." or ".." || value.EndsWith('.') || value.EndsWith(' ') ||
            value.Any(c => c < 32 || Invalid.Contains(c) || c is '/' or '\\')) return false;
        var stem = value.Split('.')[0].ToUpperInvariant();
        return stem is not ("CON" or "PRN" or "AUX" or "NUL") &&
            !(stem.Length == 4 && (stem.StartsWith("COM") || stem.StartsWith("LPT")) && stem[3] is >= '1' and <= '9');
    }
    public static void Extract(string archivePath, string destination, CancellationToken token = default, ExtractionBudget? budget = null,
        long maximumBytes = BackendConfig.MaximumExtractedBytes, int maximumEntries = BackendConfig.MaximumArchiveEntries)
    {
        budget ??= new ExtractionBudget();
        Directory.CreateDirectory(destination);
        if (Linked(destination)) throw new IOException("Linked installation folders are not supported.");
        var prefix = Path.TrimEndingDirectorySeparator(Path.GetFullPath(destination)) + Path.DirectorySeparatorChar;
        var files = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using var archive = ZipFile.OpenRead(archivePath);
        foreach (var entry in archive.Entries)
        {
            token.ThrowIfCancellationRequested();
            if (++budget.Entries > maximumEntries) throw new InvalidDataException("The archive contains too many entries.");
            var path = entry.FullName.Replace('\\', '/');
            var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries).Where(p => p != ".").ToArray();
            if (path.StartsWith('/') || parts.Any(p => !SafeComponent(p))) throw new InvalidDataException("The archive contains an unsafe path.");
            if (parts.Length == 0) continue;
            if (((entry.ExternalAttributes >> 16) & 0xF000) == 0xA000) throw new InvalidDataException("Symbolic links cannot be installed.");
            var target = Path.GetFullPath(Path.Combine(destination, Path.Combine(parts)));
            if (!target.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("An archive path leaves the destination.");
            if (path.EndsWith('/')) { Directory.CreateDirectory(target); continue; }
            if (!files.Add(target)) throw new InvalidDataException("The archive contains duplicate Windows file names.");
            if (entry.Length > maximumBytes - budget.Bytes) throw new InvalidDataException("The extracted archive is too large.");
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            using var input = entry.Open();
            using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            var buffer = new byte[81920];
            long written = 0;
            int read;
            while ((read = input.Read(buffer)) > 0)
            {
                token.ThrowIfCancellationRequested();
                budget.Bytes += read; written += read;
                if (budget.Bytes > maximumBytes || written > entry.Length)
                    throw new InvalidDataException("An archive entry exceeds its declared size.");
                output.Write(buffer, 0, read);
            }
            if (written != entry.Length) throw new InvalidDataException("An archive entry is incomplete.");
        }
    }
    public static bool Linked(string path) => (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0;
    public static void EnsureManagedRoot(string root)
    {
        Directory.CreateDirectory(root);
        if (Linked(root)) throw new IOException("Linked content folders must be managed at their original location.");
    }
}
