using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.IO.Compression;
using System.Text.Json;
using System.Text.RegularExpressions;
using Server_Launcher.Core;
using Server_Launcher.Models;

namespace Server_Launcher.Services;

internal sealed record RuntimeDecision(int Major, int Baseline, string Detail);
internal static class RuntimeCompatibility
{
    // EASY-TO-TUNE SCAN BUDGETS. Optional multi-release classes are deliberately ignored.
    private const int MaximumClasses = 500_000;
    private const int MaximumNestedDepth = 4;
    private const long MaximumNestedBytes = 256L * 1024 * 1024;
    private const int MaximumManifestBytes = 1024 * 1024;
    private sealed record Requirement(long Length, long Stamp, int Major, bool Preview, IReadOnlyList<string[]> JavaRanges);
    private sealed class Budget { public int Classes; public long NestedBytes; }
    private static readonly ConcurrentDictionary<string, Requirement> Cache = new(StringComparer.OrdinalIgnoreCase);

    public static RuntimeDecision Evaluate(ServerProfile profile, CancellationToken token = default)
    {
        var baseline = MinecraftVersions.RequiredJava(profile);
        if (baseline == 0) return new RuntimeDecision(0, 0, "Native Bedrock · no Java required");
        var neededJava = baseline;
        var ranges = new List<(string Jar, string[] Alternatives)>();
        var source = "Minecraft " + profile.MinecraftVersion;
        foreach (var jar in JarContentManager.List(profile).Where(p => p.Enabled))
        {
            token.ThrowIfCancellationRequested();
            var info = new FileInfo(jar.Path);
            if (!Cache.TryGetValue(jar.Path, out var item) || item.Length != info.Length || item.Stamp != info.LastWriteTimeUtc.Ticks)
            {
                try
                {
                    using var zip = ZipFile.OpenRead(jar.Path);
                    var result = Scan(zip, new Budget(), 0, token);
                    item = new Requirement(info.Length, info.LastWriteTimeUtc.Ticks, result.Major, result.Preview, result.JavaRanges);
                }
                catch (Exception ex) when (ex is IOException or InvalidDataException or JsonException)
                { throw new InvalidDataException($"Cannot check Java requirements for {jar.Name}: {ex.Message}", ex); }
                Cache[jar.Path] = item;
            }
            if (item.Preview) throw new InvalidOperationException(jar.Name + " contains Java preview bytecode. Use a normal release build of this plugin/mod; changing Java alone does not enable preview features.");
            ranges.AddRange(item.JavaRanges.Select(range => (jar.Name, range)));
            if (item.Major > neededJava) { neededJava = item.Major; source = jar.Name; }
        }
        if (IsLegacy(profile, baseline) && neededJava > baseline)
            throw new InvalidOperationException($"{source} needs Java {neededJava}, but this legacy Minecraft server uses Java {baseline}. Disable or replace that plugin/mod with a build for Minecraft {profile.MinecraftVersion}, or update the server. No runtime change can guarantee compatibility with older Minecraft APIs.");
        bool Compatible(int candidate) => ranges.All(range => range.Alternatives.Any(expression => MatchesJava(candidate, expression) != false));
        // Prefer the server's normal runtime, then an available LTS, then the exact
        // feature version required by bytecode/metadata. Re-evaluate after every content change.
        var candidates = new[] { baseline }.Concat(BackendConfig.KnownJavaMajors).Append(neededJava)
            .Where(major => major >= neededJava).Distinct().ToArray();
        var selected = candidates.FirstOrDefault(Compatible);
        if (selected == 0)
        {
            var requirements = string.Join("; ", ranges.Select(range => range.Jar + ": " + string.Join(" or ", range.Alternatives)));
            throw new InvalidOperationException($"No Java runtime satisfies Minecraft's requirement (Java {baseline}+), enabled content bytecode (Java {neededJava}+) and mod requirements ({requirements}). Disable or replace the incompatible content.");
        }
        var detail = selected == baseline ? $"Java {selected} · selected automatically for Minecraft"
            : $"Java {selected} · selected automatically for {source}";
        return new RuntimeDecision(selected, baseline, detail);
    }
    private static (int Major, bool Preview, IReadOnlyList<string[]> JavaRanges) Scan(ZipArchive jar, Budget budget, int depth, CancellationToken token)
    {
        var major = 8;
        var preview = false;
        var javaRanges = new List<string[]>();
        Span<byte> header = stackalloc byte[8];
        foreach (var entry in jar.Entries)
        {
            token.ThrowIfCancellationRequested();
            var name = entry.FullName.Replace('\\', '/');
            if (!name.EndsWith(".class", StringComparison.Ordinal) || name.StartsWith("META-INF/versions/", StringComparison.OrdinalIgnoreCase) || name.EndsWith("module-info.class", StringComparison.Ordinal)) continue;
            if (++budget.Classes > MaximumClasses) throw new InvalidDataException("The enabled content exceeds the Java compatibility scan limit.");
            using var stream = entry.Open();
            stream.ReadExactly(header);
            if (BinaryPrimitives.ReadUInt32BigEndian(header) != 0xCAFEBABE) throw new InvalidDataException("A JAR contains an invalid class header.");
            var classMajor = BinaryPrimitives.ReadUInt16BigEndian(header[6..]);
            if (classMajor is < 45 or > 143) throw new InvalidDataException("A JAR contains an unsupported class format.");
            major = Math.Max(major, classMajor - 44);
            preview |= classMajor >= 56 && BinaryPrimitives.ReadUInt16BigEndian(header[4..6]) == 65535;
        }
        // Fabric's nested dependencies are real classpath content, unlike arbitrary embedded JAR resources.
        var metadata = jar.GetEntry("fabric.mod.json");
        if (metadata is not null)
        {
            if (metadata.Length > MaximumManifestBytes) throw new InvalidDataException("The Fabric manifest is too large.");
            using var input = metadata.Open();
            using var doc = JsonDocument.Parse(input);
            if (doc.RootElement.TryGetProperty("depends", out var depends) && depends.TryGetProperty("java", out var java))
            {
                var alternatives = java.ValueKind == JsonValueKind.Array ? java.EnumerateArray().Select(p => p.GetString()!).ToArray() : new[] { java.GetString()! };
                if (alternatives.Length > 0)
                {
                    javaRanges.Add(alternatives);
                    major = Math.Max(major, alternatives.Min(MinimumJava));
                }
            }
            if (doc.RootElement.TryGetProperty("jars", out var dependencies))
                foreach (var dependency in dependencies.EnumerateArray())
                {
                    var file = dependency.GetProperty("file").GetString()!;
                    var nested = jar.GetEntry(file) ?? throw new InvalidDataException("A declared nested Fabric JAR is missing: " + file);
                    if (depth >= MaximumNestedDepth || nested.Length > MaximumNestedBytes - budget.NestedBytes) throw new InvalidDataException("Nested Fabric dependencies exceed the scan budget.");
                    budget.NestedBytes += nested.Length;
                    using var nestedStream = nested.Open();
                    using var memory = new MemoryStream();
                    var buffer = new byte[81920];
                    int read;
                    while ((read = nestedStream.Read(buffer)) > 0)
                    {
                        token.ThrowIfCancellationRequested();
                        if (memory.Length + read > nested.Length) throw new InvalidDataException("A nested JAR exceeds its declared size.");
                        memory.Write(buffer, 0, read);
                    }
                    if (memory.Length != nested.Length) throw new InvalidDataException("A nested Fabric dependency is incomplete.");
                    memory.Position = 0;
                    using var nestedZip = new ZipArchive(memory, ZipArchiveMode.Read);
                    var child = Scan(nestedZip, budget, depth + 1, token);
                    major = Math.Max(major, child.Major); preview |= child.Preview; javaRanges.AddRange(child.JavaRanges);
                }
        }
        return (major, preview, javaRanges);
    }
    private static bool IsLegacy(ServerProfile profile, int baseline)
    {
        var v = MinecraftVersions.Numbers(profile.MinecraftVersion);
        return baseline < 21 || (v[0] == 1 && (v[1] < 20 || (v[1] == 20 && v[2] < 5)));
    }
    // Integer Java feature predicates cover the common Fabric >=17 / >=21 / <26 forms.
    // Complex update/semver expressions remain the Fabric Loader's responsibility.
    private static int MinimumJava(string expression)
    {
        var minimum = 8;
        foreach (Match match in Regex.Matches(expression, @"(?:^|\s)(?<op>>=|>|=)?(?<major>\d+)(?=\s|$)"))
        {
            var version = int.Parse(match.Groups["major"].Value);
            minimum = Math.Max(minimum, version + (match.Groups["op"].Value == ">" ? 1 : 0));
        }
        return minimum;
    }
    private static bool? MatchesJava(int major, string expression)
    {
        if (expression.Trim() == "*") return true;
        foreach (var part in expression.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
        {
            var match = Regex.Match(part, @"\A(?<op>>=|<=|>|<|=)?(?<major>\d+)\z");
            if (!match.Success) return null;
            var value = int.Parse(match.Groups["major"].Value);
            var valid = match.Groups["op"].Value switch { ">=" => major >= value, "<=" => major <= value, ">" => major > value, "<" => major < value, _ => major == value };
            if (!valid) return false;
        }
        return true;
    }
}
