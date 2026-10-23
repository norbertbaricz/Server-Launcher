using System.Runtime.InteropServices;
using Server_Launcher.Core;
using Server_Launcher.Models;
using Server_Launcher.Services;
using Server_Launcher.UI.Controls;

namespace Server_Launcher.UI;

internal sealed class ServerDetailsForm : Form
{
    // EASY-TO-TUNE WINDOW LIMITS. Renaming changes the label, never the server's folder.
    private const int DialogWidth = 650;
    private const int DialogHeight = 360;
    private const int MaximumNameLength = 80;
    private readonly ModernTextBoxHost _name = new();
    private readonly ServerProfile _profile;
    private readonly ProfileService _profiles;
    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam);

    public ServerDetailsForm(ServerProfile profile, ProfileService profiles)
    {
        _profile = profile; _profiles = profiles;
        UiLayout.ConfigureDialog(this, "Rename server", new Size(DialogWidth, DialogHeight), new Size(500, 320));
        DoubleBuffered = true;
        var (body, footer) = UiLayout.DialogShell(this, "Server Launcher  /  Rename server", DragWindow);
        var stack = UiLayout.Stack(36, 80, 48);
        body.ContentControls.Add(stack);
        stack.Controls.Add(UiLayout.Label("Rename server", 20f, Theme.Text, true), 0, 0);
        _name.TextBox.Text = profile.Name;
        _name.TextBox.MaxLength = MaximumNameLength;
        stack.Controls.Add(UiLayout.Field("Server name", _name), 0, 1);
        var hint = UiLayout.Label("The name changes without moving server files. Java is managed automatically for Java servers; Bedrock runs natively.", 8.5f, Theme.Subtle);
        hint.AutoEllipsis = false;
        stack.Controls.Add(hint, 0, 2);
        footer.Controls.Add(UiLayout.Label("Server files keep their location", 8f, Theme.Subtle), 0, 0);
        var cancel = UiLayout.Button("Cancel"); cancel.Margin = new Padding(0, 0, 12, 0);
        cancel.Click += (_, _) => Close(); cancel.DialogResult = DialogResult.Cancel; CancelButton = cancel;
        footer.Controls.Add(cancel, 1, 0);
        var save = UiLayout.Button("Save changes", ModernIcon.Save, primary: true);
        save.Click += Save; footer.Controls.Add(save, 2, 0);
        Shown += (_, _) => { _name.TextBox.Focus(); _name.TextBox.SelectAll(); };
        ResumeLayout(true);
    }
    private void Save(object? sender, EventArgs e)
    {
        var name = _name.TextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Any(char.IsControl)) { UiFeedback.Error(this, "Enter a server name without control characters.", "Invalid name"); return; }
        var oldName = _profile.Name;
        try
        {
            if (_profiles.LoadAll().Any(p => !string.Equals(p.FolderPath, _profile.FolderPath, StringComparison.OrdinalIgnoreCase) && string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException("Another server already uses this name. Choose a distinct name.");
            _profile.Name = name;
            _profiles.Save(_profile);
            DialogResult = DialogResult.OK; Close();
        }
        catch (Exception ex) { _profile.Name = oldName; UiFeedback.Error(this, ex.Message, "Changes could not be saved"); }
    }
    private void DragWindow(object? sender, MouseEventArgs e)
    { if (e.Button == MouseButtons.Left) { ReleaseCapture(); SendMessage(Handle, 0xA1, new IntPtr(2), IntPtr.Zero); } }
    protected override void WndProc(ref Message message) { if (UiLayout.TryHandleResize(this, ref message)) return; base.WndProc(ref message); }
}
