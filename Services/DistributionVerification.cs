using System.Runtime.InteropServices;
using System.Text.Json;
using Server_Launcher.Core;
using Server_Launcher.UI.Controls;

namespace Server_Launcher.Services;

internal static class DistributionVerification
{
    // CI ENTRY POINT. Read resources and render controls without servers or downloads.
    public const string Argument = "--verify-distribution";
    private const int PreviewWidth = 480;
    private const int PreviewHeight = 340;
    private static readonly string[] SoundFiles = { "startup.wav", "error.wav", "success.wav", "status.wav" };

    public static int Run()
    {
        try
        {
            if (!OperatingSystem.IsWindows() || RuntimeInformation.ProcessArchitecture != Architecture.X64)
                throw new PlatformNotSupportedException("The portable distribution requires Windows x64.");

            ApplicationConfiguration.Initialize();
            using var logo = AppAssets.CreateLogo();
            if (logo.Width <= 0 || logo.Height <= 0 || AppAssets.Icon.Width <= 0)
                throw new InvalidDataException("The embedded application images are invalid.");

            foreach (var name in SoundFiles)
            {
                using var input = AppAssets.OpenSound(name);
                using var bytes = new MemoryStream();
                input.CopyTo(bytes);
                var sound = PcmWave.Parse(bytes.ToArray());
                if (sound.Duration <= TimeSpan.Zero)
                    throw new InvalidDataException("An embedded event sound is empty: " + name);
                _ = PcmWave.Parse(sound.WithVolume(LauncherConfig.EventSoundVolumePercent));
            }

            using var preview = new Form
            {
                ClientSize = new Size(PreviewWidth, PreviewHeight),
                BackColor = Theme.Background, AutoScaleMode = AutoScaleMode.None,
                ShowInTaskbar = false
            };
            var button = new ModernButton
            {
                Text = "Start server", IconKind = ModernIcon.Play,
                Location = new Point(24, 24), Size = new Size(432, 42)
            };
            var toggle = new ModernToggle
            {
                Text = "Follow output", Checked = true,
                Location = new Point(24, 82), Size = new Size(432, 36)
            };
            var selection = new ModernDropDown
            {
                Location = new Point(24, 134), Size = new Size(432, 42)
            };
            selection.Items.AddRange(new object[] { "PaperMC", "Fabric", "Bedrock" });
            selection.SelectedIndex = 0;
            var memory = new ModernMemorySlider
            {
                Location = new Point(24, 200), Size = new Size(432, 74),
                Value = Math.Min(LauncherConfig.DefaultInitialRamMb, MemoryLimits.TotalPhysicalMemoryMb)
            };
            preview.Controls.AddRange(new Control[] { button, toggle, selection, memory });
            preview.CreateControl();
            foreach (Control control in preview.Controls) control.CreateControl();
            using var bitmap = new Bitmap(PreviewWidth, PreviewHeight);
            preview.DrawToBitmap(bitmap, new Rectangle(Point.Empty, preview.ClientSize));

            Console.WriteLine(JsonSerializer.Serialize(new
            {
                passed = true, version = LauncherConfig.AppVersion,
                runtime = RuntimeInformation.FrameworkDescription,
                architecture = RuntimeInformation.ProcessArchitecture.ToString(),
                embeddedImages = 2, embeddedSounds = SoundFiles.Length,
                renderedControls = preview.Controls.Count
            }));
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }
}
