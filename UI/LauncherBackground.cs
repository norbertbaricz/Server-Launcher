using Server_Launcher.Core;
using Server_Launcher.Services;
using Server_Launcher.UI;
using Server_Launcher.UI.Controls;

namespace Server_Launcher;

public partial class Form1
{
    // EASY-TO-TUNE WINDOWS NOTIFICATION LIMITS.
    private const int BalloonMilliseconds = 5000;
    private const int MaximumTrayTooltip = 63;
    private const int MaximumBalloonTitle = 63;
    private const int MaximumBalloonMessage = 240;
    private NotifyIcon? _tray;
    private ToolStripMenuItem? _trayStatus;
    private bool _hiddenInTray;
    private bool _exitRequested;
    private bool _exitInProgress;
    private bool _exitApproved;
    private FormWindowState _restoreState = FormWindowState.Normal;

    private void InitializeBackground()
    {
        var menu = new ContextMenuStrip
        {
            ShowImageMargin = false, BackColor = Theme.SurfaceElevated, ForeColor = Theme.Text,
            Font = UiMetrics.Font(9f), Renderer = new TrayMenuRenderer()
        };
        _trayStatus = new ToolStripMenuItem(LauncherConfig.AppName) { Enabled = false };
        menu.Items.Add(_trayStatus); menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Open launcher", null, (_, _) => RestoreFromTray());
        var exit = new ToolStripMenuItem("Exit and stop server");
        exit.Click += async (_, _) => await ExitLauncherAsync(); menu.Items.Add(exit);
        menu.Opening += (_, _) =>
        {
            var dialogOpen = CurrentDialog() is not null;
            exit.Enabled = !dialogOpen && !_exitInProgress;
            exit.Text = dialogOpen ? "Close the current dialog to exit" : "Exit and stop server";
        };
        _tray = new NotifyIcon(components!) { Icon = AppAssets.Icon, Text = LauncherConfig.AppName, ContextMenuStrip = menu };
        _tray.DoubleClick += (_, _) => RestoreFromTray();
        _tray.BalloonTipClicked += (_, _) => RestoreFromTray();
        LauncherNotifications.Raised += OnDesktopNotice;
        ApplyBackgroundPreferences();
    }
    private void ApplyBackgroundPreferences()
    {
        if (_tray is null) return;
        var settings = GlobalSettingsService.Current;
        _tray.Visible = _hiddenInTray || settings.CloseToTray || settings.DesktopNotificationsEnabled;
        UpdateTrayStatus();
    }
    private void UpdateTrayStatus()
    {
        if (_tray is null) return;
        var state = _serverState.ToString();
        var name = _selectedProfile?.Name ?? LauncherConfig.AppName;
        var text = name + " · " + state;
        _tray.Text = text.Length <= MaximumTrayTooltip ? text : text[..MaximumTrayTooltip];
        if (_trayStatus is not null) _trayStatus.Text = text;
    }
    internal void HideToTray(bool notify = true)
    {
        if (_tray is null || _closing) return;
        if (WindowState != FormWindowState.Minimized) _restoreState = WindowState;
        _hiddenInTray = true; _tray.Visible = true;
        ShowInTaskbar = false; Hide();
        if (notify) OnDesktopNotice(new LauncherNotice(LauncherConfig.AppName, "Running in the notification area. Double-click the icon to return; use Exit to stop the launcher.", false));
    }
    private void RestoreFromTray()
    {
        if (_closing || IsDisposed) return;
        _hiddenInTray = false; Opacity = 1; ShowInTaskbar = true;
        if (WindowState == FormWindowState.Minimized) WindowState = _restoreState;
        Show(); Activate(); BringToFront(); ApplyBackgroundPreferences();
    }
    private void OnDesktopNotice(LauncherNotice notice)
    {
        if (_closing || IsDisposed || Disposing || !GlobalSettingsService.Current.DesktopNotificationsEnabled) return;
        if (InvokeRequired)
        {
            try { if (IsHandleCreated) BeginInvoke(() => OnDesktopNotice(notice)); } catch (InvalidOperationException) { }
            return;
        }
        if (_tray is null) return;
        _tray.Visible = true;
        var title = notice.Title.Length <= MaximumBalloonTitle ? notice.Title : notice.Title[..MaximumBalloonTitle];
        var text = notice.Message.Replace('\0', ' ');
        if (text.Length > MaximumBalloonMessage) text = text[..(MaximumBalloonMessage - 1)] + "…";
        _tray.ShowBalloonTip(BalloonMilliseconds, title, text, notice.Error ? ToolTipIcon.Error : ToolTipIcon.Info);
    }
    private Form? CurrentDialog() => Application.OpenForms.Cast<Form>().FirstOrDefault(form => !ReferenceEquals(form, this) && form.Modal && form.Visible);
    private async Task ExitLauncherAsync()
    {
        if (_exitInProgress || _closing) return;
        if (CurrentDialog() is Form dialog) { RestoreFromTray(); dialog.Activate(); return; }
        _exitRequested = _exitInProgress = true; UpdateState();
        try
        {
            if (!_serverProcess.IsRunning && _serverState == LauncherServerState.Starting)
            {
                _lifetime.Cancel();
                try { await _preparationDone.Task.WaitAsync(TimeSpan.FromMilliseconds(LauncherConfig.ForceStopWaitMilliseconds + LauncherConfig.ExitFinalizationSlackMilliseconds)); }
                catch (TimeoutException) { /* A slow file-system probe must not prevent a real Exit. */ }
            }
            if (_serverProcess.IsRunning)
            {
                BeginStopRequest(); _serverState = LauncherServerState.Stopping; UpdateState();
                AppendConsole("[Launcher] Exiting: saving and stopping the server...", false);
                if (!await _serverProcess.StopGracefullyAsync())
                {
                    _stopWasForced = true;
                    if (!_serverProcess.ForceStopAndWait()) throw new InvalidOperationException("The server is still running. Exit was cancelled so the managed process remains visible.");
                }
            }
            await WaitForExitFeedbackAsync();
            try { await _lastStopSound.WaitAsync(TimeSpan.FromSeconds(LauncherConfig.ExitSoundWaitSeconds)); } catch (TimeoutException) { }
            _exitApproved = true; Close();
        }
        catch (Exception ex)
        {
            _exitRequested = _exitInProgress = false;
            RestoreFromTray(); UiFeedback.Error(this, ex.Message, "Could not exit safely"); UpdateState();
        }
    }
    private void DisposeBackground()
    {
        LauncherNotifications.Raised -= OnDesktopNotice;
        if (_tray is not null) { _tray.Visible = false; _tray.ContextMenuStrip?.Dispose(); _tray.Dispose(); _tray = null; }
    }
    private sealed class TrayMenuRenderer : ToolStripProfessionalRenderer
    {
        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
        { using var brush = new SolidBrush(e.Item.Selected ? Theme.SurfaceHover : Theme.SurfaceElevated); e.Graphics.FillRectangle(brush, new Rectangle(Point.Empty, e.Item.Size)); }
        protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
        { using var brush = new SolidBrush(Theme.SurfaceElevated); e.Graphics.FillRectangle(brush, e.AffectedBounds); }
        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e) { }
        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e) { e.TextColor = e.Item.Enabled ? Theme.Text : Theme.Subtle; base.OnRenderItemText(e); }
    }
}
