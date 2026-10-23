using System.Reflection;

namespace Server_Launcher.Core;

internal static class AppAssets
{
    // Embedded names match the project: IDE builds need no manual asset copying.
    private const string ResourcePrefix = "Server_Launcher.Assets.";
    private static readonly Assembly Resources = typeof(AppAssets).Assembly;
    private static readonly Lazy<Icon> ApplicationIcon = new(LoadIcon);
    public static Icon Icon => ApplicationIcon.Value;
    public static Stream OpenSound(string fileName) => Open("Sounds." + fileName);

    public static Bitmap CreateLogo()
    {
        using var stream = Open("icon.png");
        using var image = Image.FromStream(stream);
        return new Bitmap(image);
    }

    private static Icon LoadIcon()
    {
        using var stream = Open("icon.ico");
        using var icon = new Icon(stream);
        return (Icon)icon.Clone();
    }

    private static Stream Open(string name) => Resources.GetManifestResourceStream(ResourcePrefix + name)
        ?? throw new FileNotFoundException("A required application resource is missing: " + name);
}
