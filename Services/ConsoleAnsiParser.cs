using System.Text;
using System.Text.RegularExpressions;
using Server_Launcher.UI.Controls;

namespace Server_Launcher.Services;

public static partial class ConsoleAnsiParser
{
    public readonly record struct Segment(string Text, Color Color);

    private static readonly Dictionary<int, Color> AnsiColors = new()
    {
        [30] = Color.FromArgb(78, 82, 88),
        [31] = Color.FromArgb(232, 88, 88),
        [32] = Color.FromArgb(87, 201, 120),
        [33] = Color.FromArgb(235, 190, 72),
        [34] = Color.FromArgb(86, 156, 214),
        [35] = Color.FromArgb(197, 134, 192),
        [36] = Color.FromArgb(78, 201, 176),
        [37] = Color.FromArgb(220, 224, 230),
        [90] = Color.FromArgb(135, 142, 153),
        [91] = Color.FromArgb(255, 115, 115),
        [92] = Color.FromArgb(115, 225, 145),
        [93] = Color.FromArgb(255, 210, 95),
        [94] = Color.FromArgb(120, 185, 255),
        [95] = Color.FromArgb(220, 150, 215),
        [96] = Color.FromArgb(105, 220, 205),
        [97] = Color.FromArgb(245, 248, 252)
    };

    private static readonly Dictionary<char, Color> MinecraftColors = new()
    {
        ['0'] = Color.FromArgb(0, 0, 0),
        ['1'] = Color.FromArgb(0, 0, 170),
        ['2'] = Color.FromArgb(0, 170, 0),
        ['3'] = Color.FromArgb(0, 170, 170),
        ['4'] = Color.FromArgb(170, 0, 0),
        ['5'] = Color.FromArgb(170, 0, 170),
        ['6'] = Color.FromArgb(255, 170, 0),
        ['7'] = Color.FromArgb(170, 170, 170),
        ['8'] = Color.FromArgb(85, 85, 85),
        ['9'] = Color.FromArgb(85, 85, 255),
        ['a'] = Color.FromArgb(85, 255, 85),
        ['b'] = Color.FromArgb(85, 255, 255),
        ['c'] = Color.FromArgb(255, 85, 85),
        ['d'] = Color.FromArgb(255, 85, 255),
        ['e'] = Color.FromArgb(255, 255, 85),
        ['f'] = Color.FromArgb(255, 255, 255)
    };

    public static IReadOnlyList<Segment> Parse(string line, Color fallback)
    {
        var segments = new List<Segment>();
        var current = fallback;
        var buffer = new StringBuilder();

        void Flush()
        {
            if (buffer.Length == 0)
                return;
            segments.Add(new Segment(buffer.ToString(), current));
            buffer.Clear();
        }

        for (var i = 0; i < line.Length; i++)
        {
            var ch = line[i];

            // ANSI CSI SGR: ESC[...m
            if (ch == '\u001b' && i + 1 < line.Length && line[i + 1] == '[')
            {
                var end = line.IndexOf('m', i + 2);
                if (end >= 0)
                {
                    Flush();
                    var codeText = line[(i + 2)..end];
                    ApplyAnsi(codeText, fallback, ref current);
                    i = end;
                    continue;
                }
            }

            // Minecraft legacy color codes, just in case a plugin writes them literally.
            if (ch == '§' && i + 1 < line.Length)
            {
                var code = char.ToLowerInvariant(line[i + 1]);
                if (MinecraftColors.TryGetValue(code, out var mcColor))
                {
                    Flush();
                    current = mcColor;
                    i++;
                    continue;
                }

                if (code == 'r')
                {
                    Flush();
                    current = fallback;
                    i++;
                    continue;
                }

                if ("klmno".Contains(code))
                {
                    i++;
                    continue;
                }
            }

            buffer.Append(ch);
        }

        Flush();
        if (segments.Count == 0)
            segments.Add(new Segment(string.Empty, fallback));
        return segments;
    }

    public static string Strip(string line)
    {
        var stripped = AnsiSequenceRegex().Replace(line, string.Empty);
        return MinecraftCodeRegex().Replace(stripped, string.Empty);
    }

    private static void ApplyAnsi(string codeText, Color fallback, ref Color current)
    {
        var parts = codeText.Length == 0
            ? new[] { 0 }
            : codeText.Split(';').Select(p => int.TryParse(p, out var value) ? value : 0).ToArray();

        for (var i = 0; i < parts.Length; i++)
        {
            var code = parts[i];
            if (code == 0 || code == 39)
            {
                current = fallback;
                continue;
            }

            if (AnsiColors.TryGetValue(code, out var color))
            {
                current = color;
                continue;
            }

            // 38;2;R;G;B true color
            if (code == 38 && i + 4 < parts.Length && parts[i + 1] == 2)
            {
                var r = Math.Clamp(parts[i + 2], 0, 255);
                var g = Math.Clamp(parts[i + 3], 0, 255);
                var b = Math.Clamp(parts[i + 4], 0, 255);
                current = Color.FromArgb(r, g, b);
                i += 4;
                continue;
            }

            // 38;5;N 256-color. Convert the common 6x6x6 color cube and grayscale.
            if (code == 38 && i + 2 < parts.Length && parts[i + 1] == 5)
            {
                current = ColorFrom256(Math.Clamp(parts[i + 2], 0, 255));
                i += 2;
            }
        }
    }

    private static Color ColorFrom256(int index)
    {
        if (index < 16)
        {
            var standard = new[]
            {
                Color.Black, Color.Maroon, Color.Green, Color.Olive,
                Color.Navy, Color.Purple, Color.Teal, Color.Silver,
                Color.Gray, Color.Red, Color.Lime, Color.Yellow,
                Color.Blue, Color.Magenta, Color.Cyan, Color.White
            };
            return standard[index];
        }

        if (index <= 231)
        {
            var n = index - 16;
            var r = n / 36;
            var g = (n % 36) / 6;
            var b = n % 6;
            static int Map(int v) => v == 0 ? 0 : 55 + v * 40;
            return Color.FromArgb(Map(r), Map(g), Map(b));
        }

        var gray = 8 + (index - 232) * 10;
        return Color.FromArgb(gray, gray, gray);
    }

    [GeneratedRegex("\\x1B\\[[0-?]*[ -/]*[@-~]", RegexOptions.Compiled)]
    private static partial Regex AnsiSequenceRegex();

    [GeneratedRegex("§[0-9A-FK-ORa-fk-or]", RegexOptions.Compiled)]
    private static partial Regex MinecraftCodeRegex();
}
