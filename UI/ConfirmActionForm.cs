using System.Runtime.InteropServices;
using Server_Launcher.UI.Controls;
using Server_Launcher.Services;

namespace Server_Launcher.UI;

internal sealed class ConfirmActionForm : Form
{
    // EASY-TO-TUNE CONFIRMATION DIMENSIONS, in logical pixels.
    private const int DialogWidth = 560;
    private const int DialogHeight = 400;
    private const int MinimumWidth = 480;
    private const int MinimumHeight = 340;
    private readonly ToolTip _toolTip = new();
    private string? _lastTip;

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();
    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    private ConfirmActionForm(string heading, string message, IEnumerable<string> targets, string actionText, bool destructive)
    {
        UiLayout.ConfigureDialog(this, heading, new Size(DialogWidth, DialogHeight), new Size(MinimumWidth, MinimumHeight));
        DoubleBuffered = true;
        var (body, footer) = UiLayout.DialogShell(this, "Server Launcher  /  " + (destructive ? "Confirm action" : "Details"), DragWindow);
        body.ScrollingEnabled = false;
        var content = UiLayout.Grid(1, 3);
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        content.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        content.RowStyles.Add(new RowStyle(SizeType.Absolute, 70));
        content.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        body.ContentControls.Add(content);
        content.Controls.Add(UiLayout.Label(heading, 17f, Theme.Text, true), 0, 0);
        var description = UiLayout.Label(message, 9.5f, Theme.Muted);
        description.AutoEllipsis = false;
        content.Controls.Add(description, 0, 1);
        var card = new RoundedPanel { Dock = DockStyle.Fill, Margin = Padding.Empty, Padding = new Padding(8) };
        var list = new ModernListBox { Dock = DockStyle.Fill, BackColor = Theme.Surface, SelectionMode = SelectionMode.None, ItemHeight = 34 };
        foreach (var target in targets) list.Items.Add(target);
        list.MouseMove += (_, e) =>
        {
            var index = list.IndexFromPoint(e.Location);
            var tip = index >= 0 ? list.Items[index].ToString() : null;
            if (tip != _lastTip) { _lastTip = tip; _toolTip.SetToolTip(list, tip); }
        };
        card.Controls.Add(list);
        content.Controls.Add(card, 0, 2);
        var action = UiLayout.Button(actionText, destructive ? ModernIcon.Trash : ModernIcon.None, primary: !destructive);
        action.DialogResult = destructive ? DialogResult.Yes : DialogResult.OK;
        if (destructive)
        {
            action.NormalColor = Theme.DangerSurface;
            action.HoverColor = Theme.Blend(Theme.DangerSurface, Theme.Danger, .25f);
            action.ForeColor = Theme.Danger;
            var cancel = UiLayout.Button("Cancel");
            cancel.Margin = new Padding(0, 0, 12, 0);
            cancel.DialogResult = DialogResult.Cancel;
            cancel.Click += (_, _) => Close();
            footer.Controls.Add(cancel, 1, 0);
            CancelButton = cancel;
        }
        else CancelButton = action;
        action.Click += (_, _) => Close();
        footer.Controls.Add(action, 2, 0);
        ResumeLayout(true);
    }

    public static bool Confirm(Form owner, string heading, string message, IEnumerable<string> targets, string actionText)
    {
        using var dialog = new ConfirmActionForm(heading, message, targets, actionText, destructive: true);
        return dialog.ShowDialog(owner) == DialogResult.Yes;
    }
    public static void ShowDetails(Form owner, string heading, string message, IEnumerable<string> details)
    {
        UiSoundService.PlayError();
        using var dialog = new ConfirmActionForm(heading, message, details, "Close", destructive: false);
        dialog.ShowDialog(owner);
    }
    private void DragWindow(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        ReleaseCapture();
        SendMessage(Handle, 0x00A1, new IntPtr(2), IntPtr.Zero);
    }
    protected override void WndProc(ref Message m) { if (UiLayout.TryHandleResize(this, ref m)) return; base.WndProc(ref m); }
    protected override void Dispose(bool disposing) { if (disposing) _toolTip.Dispose(); base.Dispose(disposing); }
}
