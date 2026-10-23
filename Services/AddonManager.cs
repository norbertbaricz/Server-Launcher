using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

internal sealed record AddonDependency(Guid Id, string Version);
internal sealed record InstalledAddon(Guid Id, string Name, string FolderPath, bool Behavior, JsonElement Version,
    string VersionLabel, IReadOnlyList<AddonDependency> Dependencies, bool Enabled)
{
    public override string ToString() => $"{Name}  ·  {(Behavior ? "Behavior" : "Resources")} {VersionLabel}" + (Enabled ? "  ·  Enabled" : string.Empty);
}

internal sealed class AddonManager
{
    // EASY-TO-TUNE ADD-ON LIMITS. Packs are installed together so paired dependencies resolve atomically.
    private const int MaximumPacks = 64;
    private const string ManagedMarker = ".server-launcher-addon.json";
    private const int MaximumNestedArchives = 64;
    private const int MaximumManifestBytes = 1024 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private static readonly Regex SemVer = new(@"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$", RegexOptions.CultureInvariant);
    private const string BehaviorRefs = "world_behavior_packs.json";
    private const string ResourceRefs = "world_resource_packs.json";

    public IReadOnlyList<InstalledAddon> GetInstalled(ServerProfile profile)
    {
        EnsureBedrock(profile);
        var active = ActiveWorldFolder(profile, create: false);
        var enabled = References(Path.Combine(active, BehaviorRefs)).Concat(References(Path.Combine(active, ResourceRefs)))
            .Select(IdOf).ToHashSet();
        var result = new List<InstalledAddon>();
        foreach (var behavior in new[] { true, false })
        {
            var root = PackRoot(profile, behavior);
            if (!Directory.Exists(root)) continue;
            if (ArchiveExtractor.Linked(root)) throw new IOException("Linked add-on folders are not supported.");
            foreach (var directory in Directory.EnumerateDirectories(root))
            {
                if (ArchiveExtractor.Linked(directory) || !File.Exists(Path.Combine(directory, ManagedMarker))) continue;
                var pack = ReadPack(directory, profile);
                using var owner = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, ManagedMarker)));
                if (owner.RootElement.GetProperty("owner").GetString() != "ServerLauncher" || owner.RootElement.GetProperty("uuid").GetString() != pack.Id.ToString("D"))
                    throw new InvalidDataException("An add-on ownership record is invalid. Manage that folder manually.");
                if (pack.Behavior != behavior) throw new InvalidDataException("A pack is in the wrong behavior/resource folder: " + pack.Name);
                result.Add(pack with { Enabled = enabled.Contains(pack.Id) });
            }
        }
        if (result.GroupBy(p => p.Id).Any(g => g.Count() > 1)) throw new InvalidDataException("Duplicate add-on UUIDs exist. Resolve the duplicate folders before changing packs.");
        return result.OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    public int InstallPackages(ServerProfile profile, IEnumerable<string> archives)
    {
        EnsureStopped(profile);
        var existing = GetInstalled(profile);
        var allExistingIds = ExistingPackIds(profile);
        var stage = Path.Combine(profile.FolderPath, ".addon-import-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(stage);
        var moved = new List<string>();
        try
        {
            var budget = new ExtractionBudget();
            var pending = new Queue<string>(archives);
            var archiveCount = 0;
            while (pending.Count > 0)
            {
                if (++archiveCount > MaximumNestedArchives) throw new InvalidDataException("The add-on bundle contains too many nested packs.");
                var source = pending.Dequeue();
                if (!File.Exists(source) || !(Path.GetExtension(source).ToLowerInvariant() is ".mcpack" or ".mcaddon" or ".zip"))
                    throw new InvalidDataException("Select .mcpack, .mcaddon or ZIP add-on archives.");
                var folder = Path.Combine(stage, "package-" + archiveCount);
                ArchiveExtractor.Extract(source, folder, budget: budget);
                foreach (var inner in Directory.EnumerateFiles(folder, "*", SearchOption.AllDirectories)
                    .Where(p => Path.GetExtension(p).Equals(".mcpack", StringComparison.OrdinalIgnoreCase) || Path.GetExtension(p).Equals(".mcaddon", StringComparison.OrdinalIgnoreCase)).ToArray())
                    pending.Enqueue(inner);
            }
            var manifests = Directory.EnumerateFiles(stage, "manifest.json", SearchOption.AllDirectories)
                .Where(p => !p.Split(Path.DirectorySeparatorChar).Contains("__MACOSX")).ToArray();
            if (manifests.Length is 0 or > MaximumPacks) throw new InvalidDataException("The bundle must contain between 1 and 64 behavior/resource packs.");
            var packs = manifests.Select(p => ReadPack(Path.GetDirectoryName(p)!, profile)).ToArray();
            if (packs.GroupBy(p => p.Id).Any(g => g.Count() > 1)) throw new InvalidDataException("The bundle contains duplicate pack UUIDs.");
            foreach (var pack in packs)
            {
                if (allExistingIds.Contains(pack.Id)) throw new IOException("A pack with this UUID already exists: " + pack.Name + ". Server-bundled packs are protected; remove an older launcher-installed add-on before installing its replacement.");
                if (packs.Any(other => other != pack && other.FolderPath.StartsWith(pack.FolderPath + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)))
                    throw new InvalidDataException("Nested pack manifests must be supplied as separate .mcpack packages.");
            }
            var catalog = existing.Concat(packs).ToDictionary(p => p.Id);
            var activation = ResolveDependencies(catalog, packs.Select(p => p.Id));
            foreach (var pack in packs)
            {
                var root = PackRoot(profile, pack.Behavior);
                ArchiveExtractor.EnsureManagedRoot(root);
                var target = Path.Combine(root, "sl_" + pack.Id.ToString("D") + "_" + pack.VersionLabel.Replace('+', '_'));
                if (Directory.Exists(target)) throw new IOException("The add-on folder already exists.");
                File.WriteAllText(Path.Combine(pack.FolderPath, ManagedMarker), JsonSerializer.Serialize(new { owner = "ServerLauncher", uuid = pack.Id.ToString("D") }));
                Directory.Move(pack.FolderPath, target);
                moved.Add(target);
            }
            WriteActivation(profile, catalog, activation, enable: true);
            return packs.Length;
        }
        catch (Exception error)
        {
            // A failed reference rollback leaves the installed packs available for recovery.
            if (error is not AggregateException)
                foreach (var folder in moved.AsEnumerable().Reverse())
                    if (Directory.Exists(folder)) Directory.Delete(folder, true);
            throw;
        }
        finally { if (Directory.Exists(stage)) Directory.Delete(stage, true); }
    }

    public void SetEnabled(ServerProfile profile, IEnumerable<Guid> ids, bool enable)
    {
        EnsureStopped(profile);
        var catalog = GetInstalled(profile).ToDictionary(p => p.Id);
        var selected = ids.ToHashSet();
        if (selected.Count == 0 || selected.Any(id => !catalog.ContainsKey(id))) throw new InvalidOperationException("Select installed add-ons.");
        if (enable) selected = ResolveDependencies(catalog, selected).ToHashSet();
        else
        {
            foreach (var pack in catalog.Values.Where(p => p.Enabled && !selected.Contains(p.Id)))
                if (pack.Dependencies.Any(d => selected.Contains(d.Id)))
                    throw new InvalidOperationException("Also select dependent pack '" + pack.Name + "' before disabling its dependency.");
        }
        WriteActivation(profile, catalog, selected, enable);
    }

    public void Remove(ServerProfile profile, IEnumerable<Guid> ids)
    {
        EnsureStopped(profile);
        var catalog = GetInstalled(profile).ToDictionary(p => p.Id);
        var selected = ids.ToHashSet();
        if (selected.Count == 0 || selected.Any(id => !catalog.ContainsKey(id))) throw new InvalidOperationException("Select installed add-ons.");
        foreach (var pack in catalog.Values.Where(p => !selected.Contains(p.Id)))
            if (pack.Dependencies.Any(d => selected.Contains(d.Id)))
                throw new InvalidOperationException("Remove dependent pack '" + pack.Name + "' together with its dependency.");
        var updates = new Dictionary<string, JsonArray>(StringComparer.OrdinalIgnoreCase);
        var worlds = ServerBackends.Resolve(profile.ServerSoftware).GetWorldsRoot(profile);
        if (Directory.Exists(worlds))
        {
            if (ArchiveExtractor.Linked(worlds)) throw new IOException("Linked worlds folders are not supported.");
            foreach (var world in Directory.EnumerateDirectories(worlds).Where(p => !ArchiveExtractor.Linked(p)))
                foreach (var file in new[] { BehaviorRefs, ResourceRefs })
                {
                    var path = Path.Combine(world, file);
                    if (!File.Exists(path)) continue;
                    var refs = References(path);
                    RemoveIds(refs, selected);
                    updates[path] = refs;
                }
        }
        WriteReferences(updates);
        // References are removed first. If Windows refuses deletion, the remaining pack is disabled and can be retried.
        foreach (var id in selected)
        {
            var pack = catalog[id];
            var root = Path.GetFullPath(PackRoot(profile, pack.Behavior));
            if (!string.Equals(Path.GetDirectoryName(Path.GetFullPath(pack.FolderPath)), root, StringComparison.OrdinalIgnoreCase) || ArchiveExtractor.Linked(pack.FolderPath))
                throw new IOException("Select a pack directly inside this server's content folders.");
            Directory.Delete(pack.FolderPath, true);
        }
    }

    private static void WriteActivation(ServerProfile profile, IReadOnlyDictionary<Guid, InstalledAddon> catalog, IEnumerable<Guid> ids, bool enable)
    {
        var active = ActiveWorldFolder(profile, create: true);
        var paths = new[] { Path.Combine(active, BehaviorRefs), Path.Combine(active, ResourceRefs) };
        var arrays = paths.Select(References).ToArray();
        foreach (var id in ids)
        {
            var pack = catalog[id];
            var refs = arrays[pack.Behavior ? 0 : 1];
            RemoveIds(refs, new HashSet<Guid> { id });
            if (enable) refs.Add(new JsonObject { ["pack_id"] = id.ToString("D"), ["version"] = JsonNode.Parse(pack.Version.GetRawText()) });
        }
        WriteReferences(new Dictionary<string, JsonArray> { [paths[0]] = arrays[0], [paths[1]] = arrays[1] });
    }
    private static IReadOnlyList<Guid> ResolveDependencies(IReadOnlyDictionary<Guid, InstalledAddon> catalog, IEnumerable<Guid> ids)
    {
        var resolved = new List<Guid>();
        var visited = new HashSet<Guid>();
        void Visit(Guid id)
        {
            // Paired packs may refer to one another. Activate the complete set once, without recursing forever.
            if (!visited.Add(id)) return;
            if (!catalog.TryGetValue(id, out var pack)) throw new InvalidOperationException("A required add-on is missing: " + id);
            foreach (var dependency in pack.Dependencies)
            {
                if (!catalog.TryGetValue(dependency.Id, out var installed) || !EquivalentVersion(installed.VersionLabel, dependency.Version))
                    throw new InvalidOperationException($"{pack.Name} requires pack {dependency.Id}, version {dependency.Version}. Select its .mcpack in the same installation batch.");
                Visit(dependency.Id);
            }
            resolved.Add(id);
        }
        foreach (var id in ids) Visit(id);
        return resolved;
    }
    private static InstalledAddon ReadPack(string folder, ServerProfile profile)
    {
        var path = Path.Combine(folder, "manifest.json");
        if (new FileInfo(path).Length > MaximumManifestBytes) throw new InvalidDataException("The add-on manifest is too large.");
        using var doc = JsonDocument.Parse(File.ReadAllText(path), new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip });
        var root = doc.RootElement;
        var header = root.GetProperty("header");
        if (!Guid.TryParse(header.GetProperty("uuid").GetString(), out var id) || id == Guid.Empty) throw new InvalidDataException("The pack UUID is invalid.");
        var version = header.GetProperty("version").Clone();
        var label = VersionLabel(version);
        var name = header.TryGetProperty("name", out var n) ? n.GetString() ?? id.ToString() : id.ToString();
        var modules = root.GetProperty("modules").EnumerateArray().ToArray();
        var moduleIds = new HashSet<Guid>();
        foreach (var module in modules)
        {
            if (!Guid.TryParse(module.GetProperty("uuid").GetString(), out var moduleId) || moduleId == Guid.Empty || moduleId == id || !moduleIds.Add(moduleId))
                throw new InvalidDataException("Each add-on module needs its own unique UUID.");
            _ = VersionLabel(module.GetProperty("version"));
        }
        var types = modules.Select(m => m.GetProperty("type").GetString()).ToArray();
        var behavior = types.Any(t => t is "data" or "script");
        var resources = types.Contains("resources");
        if (behavior == resources) throw new InvalidDataException("Only a behavior/script pack or a resource pack can be installed on this server: " + name);
        if (header.TryGetProperty("min_engine_version", out var engine))
        {
            var required = MinecraftVersions.Numbers(VersionLabel(engine).Split('-', '+')[0]);
            var server = MinecraftVersions.Numbers(profile.MinecraftVersion);
            if (Compare(required, server) > 0) throw new InvalidOperationException("The add-on requires a newer Bedrock server: " + name);
        }
        var dependencies = new List<AddonDependency>();
        if (root.TryGetProperty("dependencies", out var dependencyArray))
            foreach (var dependency in dependencyArray.EnumerateArray())
                if (dependency.TryGetProperty("uuid", out var uuid))
                {
                    if (!Guid.TryParse(uuid.GetString(), out var dependencyId)) throw new InvalidDataException("An add-on dependency UUID is invalid.");
                    dependencies.Add(new AddonDependency(dependencyId, VersionLabel(dependency.GetProperty("version"))));
                }
        return new InstalledAddon(id, name, folder, behavior, version, label, dependencies, false);
    }
    private static bool EquivalentVersion(string left, string right) => left.Split('+')[0] == right.Split('+')[0];
    private static int Compare(int[] left, int[] right)
    {
        for (var i = 0; i < 3; i++) if (left[i] != right[i]) return left[i].CompareTo(right[i]);
        return 0;
    }
    private static string VersionLabel(JsonElement version)
    {
        if (version.ValueKind == JsonValueKind.String)
        {
            var value = version.GetString()!;
            if (!SemVer.IsMatch(value)) throw new InvalidDataException("The pack version is not a semantic version.");
            return value;
        }
        if (version.ValueKind != JsonValueKind.Array || version.GetArrayLength() != 3) throw new InvalidDataException("The pack version needs three numbers.");
        var values = version.EnumerateArray().Select(v => v.GetInt32()).ToArray();
        if (values.Any(v => v < 0)) throw new InvalidDataException("Pack version numbers cannot be negative.");
        return string.Join(".", values);
    }
    private static string ActiveWorldFolder(ServerProfile profile, bool create)
    {
        var name = new WorldManager().GetActiveWorld(profile);
        if (!ArchiveExtractor.SafeComponent(name)) throw new InvalidDataException("The active Bedrock world needs a direct, valid folder name.");
        var root = ServerBackends.Resolve(profile.ServerSoftware).GetWorldsRoot(profile);
        if (Directory.Exists(root) && ArchiveExtractor.Linked(root)) throw new IOException("Linked worlds folders are not supported.");
        var folder = Path.Combine(root, name);
        if (Directory.Exists(folder) && ArchiveExtractor.Linked(folder)) throw new IOException("Linked world folders are not supported.");
        if (create) Directory.CreateDirectory(folder);
        return folder;
    }
    private static JsonArray References(string path)
    {
        if (!File.Exists(path)) return new JsonArray();
        if (ArchiveExtractor.Linked(path)) throw new IOException("Linked world pack references are not supported.");
        var node = JsonNode.Parse(File.ReadAllText(path));
        if (node is not JsonArray array) throw new InvalidDataException("A world pack reference file is not a JSON array: " + Path.GetFileName(path));
        foreach (var item in array) _ = IdOf(item);
        return array;
    }
    private static Guid IdOf(JsonNode? node) => node is JsonObject obj && Guid.TryParse(obj["pack_id"]?.GetValue<string>(), out var id)
        ? id : throw new InvalidDataException("A world pack reference has an invalid pack_id.");
    private static void RemoveIds(JsonArray array, HashSet<Guid> ids)
    {
        for (var i = array.Count - 1; i >= 0; i--) if (ids.Contains(IdOf(array[i]))) array.RemoveAt(i);
    }
    private static void WriteReferences(IReadOnlyDictionary<string, JsonArray> updates)
    {
        var originals = updates.Keys.ToDictionary(p => p, p => File.Exists(p) ? File.ReadAllBytes(p) : null);
        var changed = new List<string>();
        try
        {
            foreach (var item in updates)
            {
                GlobalSettingsService.WriteAtomically(item.Key, item.Value.ToJsonString(JsonOptions));
                changed.Add(item.Key);
            }
        }
        catch (Exception error)
        {
            var failures = new List<Exception> { error };
            foreach (var path in changed.AsEnumerable().Reverse())
                try { if (originals[path] is byte[] bytes) File.WriteAllBytes(path, bytes); else File.Delete(path); }
                catch (Exception rollback) { failures.Add(rollback); }
            if (failures.Count > 1) throw new AggregateException("World pack references could not be fully restored. Installed pack folders were preserved for recovery.", failures);
            throw;
        }
    }
    private static HashSet<Guid> ExistingPackIds(ServerProfile profile)
    {
        var result = new HashSet<Guid>();
        foreach (var behavior in new[] { true, false })
        {
            var root = PackRoot(profile, behavior);
            if (!Directory.Exists(root)) continue;
            foreach (var folder in Directory.EnumerateDirectories(root))
            {
                if (ArchiveExtractor.Linked(folder)) continue;
                var manifest = Path.Combine(folder, "manifest.json");
                if (!File.Exists(manifest)) continue;
                if (new FileInfo(manifest).Length > MaximumManifestBytes) throw new InvalidDataException("An existing pack manifest is too large.");
                using var document = JsonDocument.Parse(File.ReadAllText(manifest), new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip });
                if (document.RootElement.TryGetProperty("header", out var header) && header.TryGetProperty("uuid", out var uuid) && Guid.TryParse(uuid.GetString(), out var id)) result.Add(id);
            }
        }
        return result;
    }
    private static string PackRoot(ServerProfile profile, bool behavior) => Path.Combine(profile.FolderPath, behavior ? "behavior_packs" : "resource_packs");
    private static void EnsureBedrock(ServerProfile profile)
    {
        if (ServerBackends.Resolve(profile.ServerSoftware).ContentKind != ServerContentKind.Addons) throw new InvalidOperationException("This server does not use Bedrock add-ons.");
        if (ArchiveExtractor.Linked(profile.FolderPath)) throw new IOException("Linked server folders must be managed at their original location.");
    }
    private static void EnsureStopped(ServerProfile profile)
    {
        EnsureBedrock(profile);
        if (ServerProcessManager.HasLiveManagedProcess(profile)) throw new InvalidOperationException("Stop the server before changing add-ons.");
    }
}
