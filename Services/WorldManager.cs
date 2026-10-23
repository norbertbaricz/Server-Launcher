using System.IO.Compression;
using Server_Launcher.Core;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

public sealed record InstalledWorld(string Name, string FolderPath, bool IsActive, bool IsActiveDimension)
{
    public override string ToString() => Name + (IsActive ? "  ·  Active" : IsActiveDimension ? "  ·  Active dimension" : string.Empty);
}

public sealed class WorldManager
{
    // EASY-TO-TUNE IMPORT LIMITS. Existing destinations are never overwritten.
    private const int MaximumArchiveEntries = 200_000;
    private const long MaximumUncompressedBytes = 32L * 1024 * 1024 * 1024;
    private const string TemporaryPrefix = ".world-import-";
    private static readonly char[] InvalidWindowsCharacters = "<>:\"|?*".ToCharArray();
    private static readonly HashSet<string> ReservedNames = new(StringComparer.OrdinalIgnoreCase)
    { "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9" };

    public IReadOnlyList<InstalledWorld> GetInstalledWorlds(ServerProfile profile)
    {
        var backend = ServerBackends.Resolve(profile.ServerSoftware);
        var root = backend.GetWorldsRoot(profile);
        if (!Directory.Exists(root)) return Array.Empty<InstalledWorld>();
        var active = GetActiveWorld(profile);
        return Directory.EnumerateDirectories(root)
            .Where(path => !Path.GetFileName(path).StartsWith(TemporaryPrefix, StringComparison.Ordinal) && !IsLinked(path) && IsWorld(path, backend.WorldFormat))
            .Select(path => new InstalledWorld(Path.GetFileName(path), path,
                Path.GetFileName(path).Equals(active, StringComparison.OrdinalIgnoreCase),
                backend.WorldFormat == ServerWorldFormat.JavaAnvil && IsActiveDimension(Path.GetFileName(path), active)))
            .OrderByDescending(world => world.IsActive).ThenBy(world => world.Name, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    public string GetActiveWorld(ServerProfile profile)
    {
        var properties = Path.Combine(profile.FolderPath, "server.properties");
        if (!File.Exists(properties)) return ServerBackends.Resolve(profile.ServerSoftware).DefaultWorldName;
        foreach (var raw in File.ReadLines(properties).Reverse())
        {
            var line = raw.Trim();
            if (line.StartsWith('#') || line.StartsWith('!')) continue;
            var separator = line.IndexOf('=');
            if (separator > 0 && line[..separator].Trim().Equals("level-name", StringComparison.OrdinalIgnoreCase))
                return line[(separator + 1)..].Trim();
        }
        return ServerBackends.Resolve(profile.ServerSoftware).DefaultWorldName;
    }

    public string InstallZip(ServerProfile profile, string archivePath)
    {
        EnsureStopped(profile);
        var extension = Path.GetExtension(archivePath);
        if (!File.Exists(archivePath) || !(extension.Equals(".zip", StringComparison.OrdinalIgnoreCase) ||
            (ServerBackends.Resolve(profile.ServerSoftware).WorldFormat == ServerWorldFormat.BedrockLevelDb && extension.Equals(".mcworld", StringComparison.OrdinalIgnoreCase))))
            throw new InvalidOperationException("Select a ZIP world archive or a Bedrock .mcworld file.");
        var backend = ServerBackends.Resolve(profile.ServerSoftware);
        var root = EnsureRoot(profile);
        var temporary = Path.Combine(root, TemporaryPrefix + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temporary);
        try
        {
            ArchiveExtractor.Extract(archivePath, temporary, maximumBytes: MaximumUncompressedBytes, maximumEntries: MaximumArchiveEntries);
            foreach (var sessionLock in Directory.EnumerateFiles(temporary, "session.lock", SearchOption.AllDirectories)) File.Delete(sessionLock);
            var world = FindSingleWorld(temporary, backend.WorldFormat);
            return CommitImport(profile, world, root, SafeWorldName(Path.GetFileNameWithoutExtension(archivePath)));
        }
        finally { if (Directory.Exists(temporary)) Directory.Delete(temporary, recursive: true); }
    }

    public string InstallFolder(ServerProfile profile, string sourceFolder)
    {
        EnsureStopped(profile);
        var backend = ServerBackends.Resolve(profile.ServerSoftware);
        var source = Path.TrimEndingDirectorySeparator(Path.GetFullPath(sourceFolder));
        if (!Directory.Exists(source) || IsLinked(source) || !IsWorld(source, backend.WorldFormat))
            throw new InvalidOperationException(FormatHint(backend.WorldFormat));
        var root = EnsureRoot(profile);
        if (root.StartsWith(source + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || root.Equals(source, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Choose the world folder itself, outside the server's root folder.");
        var temporary = Path.Combine(root, TemporaryPrefix + Guid.NewGuid().ToString("N"));
        try
        {
            long copied = 0;
            CopyFolder(source, temporary, ref copied);
            return CommitImport(profile, temporary, root, SafeWorldName(Path.GetFileName(source)));
        }
        finally { if (Directory.Exists(temporary)) Directory.Delete(temporary, recursive: true); }
    }

    public void SetActiveWorld(ServerProfile profile, string folderPath)
    {
        EnsureStopped(profile);
        var folder = ValidateManagedWorld(profile, folderPath);
        var path = Path.Combine(profile.FolderPath, "server.properties");
        var lines = File.Exists(path) ? File.ReadAllLines(path).ToList() : new List<string>();
        OptimizationService.SetProperty(lines, "level-name", Path.GetFileName(folder));
        GlobalSettingsService.WriteAtomically(path, string.Join(Environment.NewLine, lines) + Environment.NewLine);
    }

    public void RemoveWorld(ServerProfile profile, string folderPath)
    {
        EnsureStopped(profile);
        var folder = ValidateManagedWorld(profile, folderPath);
        var name = Path.GetFileName(folder);
        var active = GetActiveWorld(profile);
        if (name.Equals(active, StringComparison.OrdinalIgnoreCase) || (ServerBackends.Resolve(profile.ServerSoftware).WorldFormat == ServerWorldFormat.JavaAnvil && IsActiveDimension(name, active)))
            throw new InvalidOperationException("Choose another active world before removing this world or its dimensions.");
        Directory.Delete(folder, recursive: true);
    }

    private static string ValidateManagedWorld(ServerProfile profile, string folderPath)
    {
        var root = EnsureRoot(profile);
        var folder = Path.TrimEndingDirectorySeparator(Path.GetFullPath(folderPath));
        if (!string.Equals(Path.GetDirectoryName(folder), root, StringComparison.OrdinalIgnoreCase) ||
            !Directory.Exists(folder) || IsLinked(folder) || !IsWorld(folder, ServerBackends.Resolve(profile.ServerSoftware).WorldFormat))
            throw new InvalidOperationException("Select an installed world directly inside this server's world directory.");
        return folder;
    }
    private static string CommitImport(ServerProfile profile, string source, string root, string name)
    {
        EnsureStopped(profile);
        var destination = Path.Combine(root, name);
        if (Directory.Exists(destination) || File.Exists(destination))
            throw new InvalidOperationException($"A world named '{name}' already exists. Rename the source and import it again.");
        Directory.Move(source, destination);
        return destination;
    }
    private static string FindSingleWorld(string extractionRoot, ServerWorldFormat format)
    {
        if (IsWorld(extractionRoot, format)) return extractionRoot;
        var matches = Directory.EnumerateDirectories(extractionRoot, "*", SearchOption.AllDirectories)
            .Where(folder => !folder.Split(Path.DirectorySeparatorChar).Contains("__MACOSX") && IsWorld(folder, format)).ToArray();
        if (matches.Length != 1) throw new InvalidOperationException(matches.Length == 0 ? FormatHint(format) : "This archive contains multiple worlds. Import each world folder separately.");
        return matches[0];
    }
    private static bool IsWorld(string folder, ServerWorldFormat format) => File.Exists(Path.Combine(folder, "level.dat")) &&
        (format == ServerWorldFormat.BedrockLevelDb ? Directory.Exists(Path.Combine(folder, "db")) : !Directory.Exists(Path.Combine(folder, "db")));
    private static string FormatHint(ServerWorldFormat format) => format == ServerWorldFormat.JavaAnvil
        ? "Choose a Java Edition world containing level.dat. Bedrock worlds require a Bedrock backend."
        : "Choose a Bedrock world containing level.dat and a db directory.";
    private static bool IsLinked(string path) => (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0;
    private static bool IsActiveDimension(string name, string active) => name.Equals(active + "_nether", StringComparison.OrdinalIgnoreCase) || name.Equals(active + "_the_end", StringComparison.OrdinalIgnoreCase);
    private static string EnsureRoot(ServerProfile profile)
    {
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(ServerBackends.Resolve(profile.ServerSoftware).GetWorldsRoot(profile)));
        if (!Directory.Exists(root)) Directory.CreateDirectory(root);
        if (IsLinked(root)) throw new InvalidOperationException("Linked world roots must be managed at their original location.");
        return root;
    }
    private static void EnsureStopped(ServerProfile profile)
    {
        if (ServerProcessManager.HasLiveManagedProcess(profile)) throw new InvalidOperationException("Stop the server before importing, switching or removing worlds.");
    }
    private static bool IsSafeComponent(string value) => value is not ("." or "..") && value.Length > 0 &&
        !value.EndsWith(' ') && !value.EndsWith('.') && !value.Any(c => c < 32 || InvalidWindowsCharacters.Contains(c)) &&
        !ReservedNames.Contains(value.Split('.')[0]);
    private static string SafeWorldName(string name)
    {
        var result = new string(name.Trim().Select(c => c < 32 || InvalidWindowsCharacters.Contains(c) || c is '/' or '\\' ? '_' : c).ToArray()).TrimEnd('.', ' ');
        if (!IsSafeComponent(result)) throw new InvalidOperationException("The world needs a valid folder name.");
        if (result.StartsWith(TemporaryPrefix, StringComparison.Ordinal)) throw new InvalidOperationException("This world name is reserved for temporary imports.");
        return result;
    }
    private static void CopyFolder(string source, string destination, ref long copiedBytes)
    {
        if (IsLinked(source)) throw new InvalidOperationException("World folders cannot contain symbolic links or junctions.");
        Directory.CreateDirectory(destination);
        foreach (var entry in Directory.EnumerateFileSystemEntries(source))
        {
            if (IsLinked(entry)) throw new InvalidOperationException("World folders cannot contain symbolic links or junctions.");
            var name = Path.GetFileName(entry);
            if (!IsSafeComponent(name)) throw new InvalidOperationException("The world contains an invalid Windows file name.");
            if (Directory.Exists(entry)) CopyFolder(entry, Path.Combine(destination, name), ref copiedBytes);
            else if (!name.Equals("session.lock", StringComparison.OrdinalIgnoreCase))
            {
                var size = new FileInfo(entry).Length;
                if (size > MaximumUncompressedBytes - copiedBytes) throw new InvalidOperationException("The world exceeds the configured import size limit.");
                copiedBytes += size;
                File.Copy(entry, Path.Combine(destination, name), overwrite: false);
            }
        }
    }
}
