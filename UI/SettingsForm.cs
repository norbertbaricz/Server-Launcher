using System.Runtime.InteropServices;
using Server_Launcher.Core;
using Server_Launcher.Models;
using Server_Launcher.Services;
using Server_Launcher.UI.Controls;

namespace Server_Launcher.UI;

internal sealed class SettingsForm : Form
{
    // EASY-TO-TUNE GLOBAL SETTINGS WINDOW DIMENSIONS.
    private const int DialogWidth = 740;
    private const int DialogHeight = 760;
    private const int MinimumWidth = 540;
    private const int MinimumHeight = 480;
    private readonly ProfileService _profiles;
    private readonly ModernMemorySlider _minimum = new();
    private readonly ModernMemorySlider _maximum = new();
    private readonly ModernDropDown _optimization = new();
    private readonly ModernToggle _publicIp = new();
    private readonly ModernToggle _notifications = new();
    private readonly ModernToggle _closeToTray = new();
    private readonly ModernToggle _windowsStartup = new();
    private readonly TextBox _arguments;
    private readonly ModernButton _save;
    private bool _busy;

    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    public SettingsForm(ProfileService profiles)
    {
        _profiles = profiles;
        var settings = GlobalSettingsService.Current;
        UiLayout.ConfigureDialog(this, "Settings", new Size(DialogWidth, DialogHeight), new Size(MinimumWidth, MinimumHeight));
        DoubleBuffered = true;
        var (body, footer) = UiLayout.DialogShell(this, "Server Launcher  /  Settings", DragWindow);
        var stack = UiLayout.Stack(36, 30, 112, 40, 76, 24, 86, 34, 42, 42, 42, 42, 56);
        body.ContentControls.Add(stack);
        stack.Controls.Add(UiLayout.Label("Settings", 20f, Theme.Text, true), 0, 0);
        stack.Controls.Add(UiLayout.Label("Global preferences for this launcher and all servers.", 9.5f, Theme.Muted), 0, 1);
        var memories = UiLayout.SpacedRow(2);
        var low = Math.Min(LauncherConfig.MinimumRamMb, MemoryLimits.TotalPhysicalMemoryMb);
        _maximum.Minimum = low;
        _maximum.Maximum = MemoryLimits.TotalPhysicalMemoryMb;
        _maximum.Value = settings.MaximumMemoryMb;
        _minimum.Minimum = low;
        _minimum.Maximum = _maximum.Value;
        _minimum.Value = settings.InitialMemoryMb;
        memories.Controls.Add(UiLayout.Field("Initial RAM", _minimum, inputHeight: UiMetrics.MemorySliderHeight), 0, 0);
        memories.Controls.Add(UiLayout.Field("Maximum RAM", _maximum, inputHeight: UiMetrics.MemorySliderHeight), 2, 0);
        stack.Controls.Add(memories, 0, 2);
        var memoryHint = UiLayout.Label("Changing RAM updates PaperMC/Fabric allocations for their next start. Bedrock manages its own memory.", 8.5f, Theme.Subtle);
        memoryHint.AutoEllipsis = false;
        stack.Controls.Add(memoryHint, 0, 3);
        _optimization.Items.AddRange(new object[] { LauncherConfig.StandardProfile, LauncherConfig.BalancedProfile, LauncherConfig.PerformanceProfile });
        _optimization.SelectedItem = settings.OptimizationProfile;
        stack.Controls.Add(UiLayout.Field("Optimization profile · change to update all existing servers", _optimization), 0, 4);
        stack.Controls.Add(UiLayout.Label("Global Java options", 9f, Theme.Muted, true), 0, 5);
        var argsHost = new RoundedPanel { Dock = DockStyle.Fill, BackColor = Theme.SurfaceElevated, Padding = new Padding(12), Margin = Padding.Empty };
        _arguments = new HiddenScrollTextBox
        {
            Multiline = true, AcceptsReturn = true, Dock = DockStyle.Fill, Text = settings.ExtraJvmArguments,
            Font = UiMetrics.Font(9.5f), BackColor = Theme.SurfaceElevated,
            ForeColor = Theme.Text, AccessibleName = "Global Java arguments"
        };
        argsHost.Controls.Add(_arguments);
        stack.Controls.Add(argsHost, 0, 6);
        var javaHint = UiLayout.Label("Used by Balance and Performance. Standard uses only RAM limits and the normal launch command.", 8f, Theme.Subtle);
        javaHint.AutoEllipsis = false;
        stack.Controls.Add(javaHint, 0, 7);
        _publicIp.Text = "Show WAN public address alongside LAN";
        _publicIp.Checked = settings.ShowPublicIp;
        _publicIp.Dock = DockStyle.Fill;
        stack.Controls.Add(_publicIp, 0, 8);
        _notifications.Text = "Show desktop notifications";
        _notifications.Checked = settings.DesktopNotificationsEnabled; _notifications.Dock = DockStyle.Fill;
        stack.Controls.Add(_notifications, 0, 9);
        _closeToTray.Text = "Keep running in the notification area on close";
        _closeToTray.Checked = settings.CloseToTray; _closeToTray.Dock = DockStyle.Fill;
        stack.Controls.Add(_closeToTray, 0, 10);
        _windowsStartup.Text = "Start Server Launcher with Windows";
        _windowsStartup.Checked = settings.StartWithWindows; _windowsStartup.Dock = DockStyle.Fill;
        stack.Controls.Add(_windowsStartup, 0, 11);
        var backgroundHint = UiLayout.Label("The notification-area menu has Open launcher and Exit. Exit stops the running server. Windows startup opens only the launcher; it does not automatically start Minecraft.", 8.5f, Theme.Subtle);
        backgroundHint.AutoEllipsis = false; stack.Controls.Add(backgroundHint, 0, 12);
        _maximum.ValueChanged += (_, _) => _minimum.Maximum = _maximum.Value;
        _minimum.Enabled = _maximum.Enabled = MemoryLimits.IsSupported;
        footer.Controls.Add(UiLayout.Label("Applies across all servers", 8.5f, Theme.Subtle), 0, 0);
        var cancel = UiLayout.Button("Cancel");
        cancel.Margin = new Padding(0, 0, 12, 0);
        cancel.DialogResult = DialogResult.Cancel;
        cancel.Click += (_, _) => Close();
        footer.Controls.Add(cancel, 1, 0);
        CancelButton = cancel;
        _save = UiLayout.Button("Save settings", ModernIcon.Save, primary: true);
        _save.Click += Save_Click;
        footer.Controls.Add(_save, 2, 0);
        ResumeLayout(true);
    }

    private async void Save_Click(object? sender, EventArgs e)
    {
        if (_busy) return;
        var snapshot = new GlobalSettings
        {
            InitialMemoryMb = _minimum.Value, MaximumMemoryMb = _maximum.Value,
            OptimizationProfile = _optimization.SelectedItem as string ?? LauncherConfig.BalancedProfile,
            ExtraJvmArguments = _arguments.Text.Trim(), ShowPublicIp = _publicIp.Checked,
            DesktopNotificationsEnabled = _notifications.Checked, CloseToTray = _closeToTray.Checked,
            StartWithWindows = _windowsStartup.Checked
        };
        try
        {
            GlobalSettingsService.Validate(snapshot);
            _busy = true;
            _save.Enabled = false;
            UseWaitCursor = true;
            await Task.Run(() => GlobalSettingsService.Save(snapshot, _profiles));
            _busy = false;
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex) { UiFeedback.Error(this, ex.Message, "Settings could not be saved"); }
        finally
        {
            _busy = false;
            UseWaitCursor = false;
            if (!IsDisposed && !Disposing) _save.Enabled = true;
        }
    }
    private void DragWindow(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        ReleaseCapture(); SendMessage(Handle, 0x00A1, new IntPtr(2), IntPtr.Zero);
    }
    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (_busy && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; return; }
        base.OnFormClosing(e);
    }
    protected override void WndProc(ref Message m) { if (UiLayout.TryHandleResize(this, ref m)) return; base.WndProc(ref m); }
}
