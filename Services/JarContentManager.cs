using Server_Launcher.Models;

namespace Server_Launcher.Services;

public sealed record InstalledJar(string Name, string Path, bool Enabled)
{
    public override string ToString() => Name + (Enabled ? " · Enabled" : " · Disabled");
}

internal static class JarContentManager
{
    // Disabled JARs stay beside their data; neither Fabric nor Paper loads this suffix.
    public const string DisabledSuffix = ".disabled";
    public static IReadOnlyList<InstalledJar> List(ServerProfile profile)
    {
        var root = Root(profile);
        return Directory.EnumerateFiles(root).Where(IsJar)
            .Where(p => !ArchiveExtractor.Linked(p))
            .Select(p => new InstalledJar(DisplayName(p), p, !p.EndsWith(DisabledSuffix, StringComparison.OrdinalIgnoreCase)))
            .OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase).ToArray();
    }
    public static string Install(ServerProfile profile, string source)
    {
        EnsureStopped(profile);
        if (!File.Exists(source) || !source.EndsWith(".jar", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Select a JAR file.");
        var name = System.IO.Path.GetFileName(source);
        if (!ArchiveExtractor.SafeComponent(name)) throw new InvalidDataException("The JAR file name is invalid.");
        var target = System.IO.Path.Combine(Root(profile), name);
        if (File.Exists(target) || File.Exists(target + DisabledSuffix)) throw new IOException("This JAR already exists, enabled or disabled. Remove the old copy first.");
        var temporary = target + ".part-" + Guid.NewGuid().ToString("N");
        try { File.Copy(source, temporary, overwrite: false); File.Move(temporary, target, overwrite: false); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
        return target;
    }
    public static void SetEnabled(ServerProfile profile, string path, bool enabled)
    {
        EnsureStopped(profile);
        var file = Validate(profile, path);
        var active = file.EndsWith(DisabledSuffix, StringComparison.OrdinalIgnoreCase) ? file[..^DisabledSuffix.Length] : file;
        var target = enabled ? active : active + DisabledSuffix;
        if (file.Equals(target, StringComparison.OrdinalIgnoreCase)) return;
        if (File.Exists(target)) throw new IOException("A JAR with the requested name already exists.");
        File.Move(file, target, overwrite: false);
    }
    public static void Remove(ServerProfile profile, string path)
    {
        EnsureStopped(profile);
        File.Delete(Validate(profile, path));
    }
    public static void EnsureStopped(ServerProfile profile)
    {
        if (ServerProcessManager.HasLiveManagedProcess(profile)) throw new InvalidOperationException("Stop the server before changing its content.");
    }
    private static string Root(ServerProfile profile)
    {
        var backend = ServerBackends.Resolve(profile.ServerSoftware);
        if (backend.ContentKind == ServerContentKind.Addons) throw new InvalidOperationException("Bedrock does not load JAR content.");
        if (ArchiveExtractor.Linked(profile.FolderPath)) throw new IOException("Linked server folders must be managed at their original location.");
        var root = backend.GetContentRoot(profile);
        ArchiveExtractor.EnsureManagedRoot(root);
        return System.IO.Path.TrimEndingDirectorySeparator(System.IO.Path.GetFullPath(root));
    }
    private static string Validate(ServerProfile profile, string path)
    {
        var file = System.IO.Path.GetFullPath(path);
        if (!string.Equals(System.IO.Path.GetDirectoryName(file), Root(profile), StringComparison.OrdinalIgnoreCase) || !IsJar(file))
            throw new IOException("Select content directly inside this server's content folder.");
        if (!File.Exists(file)) throw new FileNotFoundException("The selected JAR no longer exists.", file);
        if (ArchiveExtractor.Linked(file)) throw new IOException("Linked JARs must be managed at their original location.");
        return file;
    }
    private static bool IsJar(string path) => path.EndsWith(".jar", StringComparison.OrdinalIgnoreCase) || path.EndsWith(".jar" + DisabledSuffix, StringComparison.OrdinalIgnoreCase);
    private static string DisplayName(string path)
    {
        var name = System.IO.Path.GetFileName(path);
        return name.EndsWith(DisabledSuffix, StringComparison.OrdinalIgnoreCase) ? name[..^DisabledSuffix.Length] : name;
    }
}
