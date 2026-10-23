using System.Text.Json;
using Server_Launcher.Core;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

public static class GlobalSettingsService
{
    private static readonly object Sync = new();
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true, PropertyNameCaseInsensitive = true };
    private static GlobalSettings? _current;
    public static string? LoadError { get; private set; }
    public static string SettingsPath => Path.Combine(AppPaths.AppRoot, LauncherConfig.GlobalSettingsFileName);
    public static GlobalSettings Current { get { lock (Sync) return _current ??= Load(); } }

    private static GlobalSettings Load()
    {
        try
        {
            var settings = File.Exists(SettingsPath)
                ? JsonSerializer.Deserialize<GlobalSettings>(File.ReadAllText(SettingsPath), JsonOptions) ?? new()
                : new GlobalSettings();
            settings.MaximumMemoryMb = MemoryLimits.ClampMemory(settings.MaximumMemoryMb);
            settings.InitialMemoryMb = Math.Min(MemoryLimits.ClampMemory(settings.InitialMemoryMb), settings.MaximumMemoryMb);
            settings.ExtraJvmArguments ??= string.Empty;
            settings.OptimizationProfile = OptimizationService.NormalizeProfile(settings.OptimizationProfile);
            return settings;
        }
        catch (Exception ex)
        {
            LoadError = ex.Message;
            return new GlobalSettings
            {
                MaximumMemoryMb = MemoryLimits.ClampMemory(LauncherConfig.DefaultRamMb),
                InitialMemoryMb = Math.Min(MemoryLimits.ClampMemory(LauncherConfig.DefaultInitialRamMb), MemoryLimits.ClampMemory(LauncherConfig.DefaultRamMb))
            };
        }
    }

    public static void Validate(GlobalSettings settings)
    {
        MemoryLimits.Validate(new ServerProfile
        {
            MinMemoryMb = settings.InitialMemoryMb, MaxMemoryMb = settings.MaximumMemoryMb,
            ExtraJvmArguments = settings.ExtraJvmArguments
        });
    }

    // A RAM change updates existing profiles as one transaction. Merely changing launcher/network
    // preferences preserves allocations explicitly selected when individual servers were created.
    public static void Save(GlobalSettings settings, ProfileService profileService)
    {
        settings.OptimizationProfile = OptimizationService.NormalizeProfile(settings.OptimizationProfile);
        Validate(settings);
        lock (Sync)
        {
            var previous = Current;
            var changes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var memoryChanged = previous.InitialMemoryMb != settings.InitialMemoryMb || previous.MaximumMemoryMb != settings.MaximumMemoryMb;
            var optimizationChanged = previous.OptimizationProfile != settings.OptimizationProfile;
            if (memoryChanged || optimizationChanged)
            {
                foreach (var profile in profileService.LoadAll())
                {
                    var java = !ServerBackends.TryResolve(profile.ServerSoftware, out var backend) || backend.RequiresJava;
                    if (!java && !optimizationChanged) continue;
                    if (memoryChanged && java) { profile.MinMemoryMb = settings.InitialMemoryMb; profile.MaxMemoryMb = settings.MaximumMemoryMb; }
                    if (optimizationChanged) profile.OptimizationProfile = OptimizationService.NormalizeProfile(settings.OptimizationProfile);
                    MemoryLimits.Validate(profile);
                    changes[Path.Combine(profile.FolderPath, LauncherConfig.ProfileFileName)] = JsonSerializer.Serialize(profile, JsonOptions);
                }
            }
            changes[SettingsPath] = JsonSerializer.Serialize(settings, JsonOptions);
            var originals = changes.Keys.ToDictionary(path => path, path => File.Exists(path) ? File.ReadAllBytes(path) : null, StringComparer.OrdinalIgnoreCase);
            var committed = new List<string>();
            var startupChanged = previous.StartWithWindows != settings.StartWithWindows || settings.StartWithWindows;
            var startup = startupChanged ? WindowsStartupService.Read() : null;
            var startupAttempted = false;
            try
            {
                foreach (var entry in changes)
                {
                    WriteAtomically(entry.Key, entry.Value);
                    committed.Add(entry.Key);
                }
                if (startupChanged) { startupAttempted = true; WindowsStartupService.Apply(settings.StartWithWindows); }
            }
            catch (Exception failure)
            {
                var rollbackErrors = new List<Exception> { failure };
                if (startupAttempted && startup is not null)
                    try { WindowsStartupService.Restore(startup); } catch (Exception error) { rollbackErrors.Add(error); }
                foreach (var path in committed.AsEnumerable().Reverse())
                {
                    try
                    {
                        if (originals[path] is byte[] bytes) File.WriteAllBytes(path, bytes);
                        else File.Delete(path);
                    }
                    catch (Exception error) { rollbackErrors.Add(error); }
                }
                if (rollbackErrors.Count > 1) throw new AggregateException("Settings could not be fully restored after a write failure.", rollbackErrors);
                throw;
            }
            _current = settings;
            LoadError = null;
        }
    }

    internal static void WriteAtomically(string path, string content)
    {
        var temporary = path + ".tmp-" + Guid.NewGuid().ToString("N");
        try { File.WriteAllText(temporary, content); File.Move(temporary, path, overwrite: true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
