using System.Text.Json;
using Server_Launcher.Core;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

public sealed class ProfileService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public IReadOnlyList<ServerProfile> LoadAll()
    {
        AppPaths.EnsureCreated();
        var result = new List<ServerProfile>();

        foreach (var directory in Directory.EnumerateDirectories(AppPaths.ServersRoot))
        {
            var profilePath = Path.Combine(directory, LauncherConfig.ProfileFileName);
            if (!File.Exists(profilePath))
                continue;

            try
            {
                var json = File.ReadAllText(profilePath);
                var profile = JsonSerializer.Deserialize<ServerProfile>(json, JsonOptions);
                if (profile is null)
                    continue;

                profile.FolderPath = directory;
                MemoryLimits.ClampProfile(profile);
                profile.OptimizationProfile = OptimizationService.NormalizeProfile(profile.OptimizationProfile);
                result.Add(profile);
            }
            catch
            {
                // Ignore damaged profile files so one broken server does not kill the launcher.
            }
        }

        return result.OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase).ToList();
    }

    public void Save(ServerProfile profile)
    {
        MemoryLimits.Validate(profile);
        Directory.CreateDirectory(profile.FolderPath);
        var backend = ServerBackends.Resolve(profile.ServerSoftware);
        if (backend.ContentKind != ServerContentKind.Addons) Directory.CreateDirectory(backend.GetContentRoot(profile));

        var profilePath = Path.Combine(profile.FolderPath, LauncherConfig.ProfileFileName);
        var json = JsonSerializer.Serialize(profile, JsonOptions);
        GlobalSettingsService.WriteAtomically(profilePath, json);
    }
    public void Delete(ServerProfile profile)
    {
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(AppPaths.ServersRoot));
        var folder = Path.TrimEndingDirectorySeparator(Path.GetFullPath(profile.FolderPath));
        if (!string.Equals(Path.GetDirectoryName(folder), root, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only a server folder directly inside this launcher's servers directory can be deleted.");
        if (!Directory.Exists(folder))
            return;
        if ((File.GetAttributes(folder) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidOperationException("Linked server folders must be managed at their original location.");
        if (!File.Exists(Path.Combine(folder, LauncherConfig.ProfileFileName)))
            throw new InvalidOperationException("The selected folder does not contain a launcher profile.");
        if (ServerProcessManager.HasLiveManagedProcess(profile))
            throw new InvalidOperationException("Stop the server before deleting it.");

        // Keep the profile marker until all other entries are removed, so a failed deletion can be retried.
        var profilePath = Path.Combine(folder, LauncherConfig.ProfileFileName);
        var originalProfile = File.ReadAllBytes(profilePath);
        foreach (var entry in Directory.EnumerateFileSystemEntries(folder))
        {
            if (string.Equals(entry, profilePath, StringComparison.OrdinalIgnoreCase)) continue;
            if ((File.GetAttributes(entry) & FileAttributes.Directory) != 0)
                Directory.Delete(entry, recursive: true); // Nested directory links are not traversed.
            else
                File.Delete(entry);
        }
        File.Delete(profilePath);
        try { Directory.Delete(folder); }
        catch
        {
            if (Directory.Exists(folder) && !File.Exists(profilePath)) File.WriteAllBytes(profilePath, originalProfile);
            throw;
        }
    }
}
