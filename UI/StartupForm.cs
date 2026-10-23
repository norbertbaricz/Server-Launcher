using System.Runtime.InteropServices;
using Server_Launcher.Services;
using Server_Launcher.UI.Controls;

namespace Server_Launcher.UI;

internal sealed class StartupForm : Form
{
    // EASY-TO-TUNE STARTUP WINDOW SIZE. Checks have no artificial minimum display time.
    private const int DialogWidth = 720;
    private const int DialogHeight = 560;
    private readonly Dictionary<string, Label> _checks = new();
    private readonly ModernButton _continue;
    private readonly CancellationTokenSource _lifetime = new();
    private bool _disposed;
    public event Action? OpenRequested;
    public event Action? RestoreRequested;
    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
    private void DragWindow(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        ReleaseCapture(); SendMessage(Handle, 0x00A1, new IntPtr(2), IntPtr.Zero);
    }

    public StartupForm()
    {
        UiLayout.ConfigureDialog(this, "Server Launcher", new Size(DialogWidth, DialogHeight), new Size(540, 420));
        ShowInTaskbar = true;
        StartPosition = FormStartPosition.CenterScreen;
        DoubleBuffered = true;
        var (body, footer) = UiLayout.DialogShell(this, "Server Launcher", DragWindow);
        var stack = UiLayout.Stack(38, 36, 50, 50, 50, 50, 50, 50);
        body.ContentControls.Add(stack);
        stack.Controls.Add(UiLayout.Label("Preparing your launcher", 20f, Theme.Text, true), 0, 0);
        stack.Controls.Add(UiLayout.Label("Checking the essentials for local and online hosting.", 9.5f, Theme.Muted), 0, 1);
        var rows = new[] { ("system", "Computer"), ("storage", "Storage"), ("java", "Java runtimes"),
            ("network", "Connection"), ("bedrock", "Bedrock runtime"), ("sessions", "Previous sessions") };
        for (var i = 0; i < rows.Length; i++)
        {
            var card = new RoundedPanel { Dock = DockStyle.Fill, Margin = new Padding(0, 0, 0, 8), Padding = new Padding(12, 0, 12, 0), DrawBorder = false };
            var row = UiLayout.Grid(2, 1, Theme.Surface);
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 124));
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            row.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            row.Controls.Add(UiLayout.Label(rows[i].Item2, 9f, Theme.Text, true), 0, 0);
            var status = UiLayout.Label("Checking...", 8.5f, Theme.Subtle);
            status.AutoEllipsis = false;
            row.Controls.Add(status, 1, 0);
            card.Controls.Add(row);
            stack.Controls.Add(card, 0, i + 2);
            _checks[rows[i].Item1] = status;
        }
        footer.Controls.Add(UiLayout.Label("Java is downloaded only when needed.", 8f, Theme.Subtle), 0, 0);
        var close = UiLayout.Button("Close");
        close.Margin = new Padding(0, 0, 12, 0);
        close.Click += (_, _) => Close();
        footer.Controls.Add(close, 1, 0);
        _continue = UiLayout.Button("Open launcher", ModernIcon.Play, primary: true);
        _continue.Enabled = false;
        _continue.Click += (_, _) => OpenRequested?.Invoke();
        footer.Controls.Add(_continue, 2, 0);
        ResumeLayout(true);
        Shown += RunChecks;
    }
    private async void RunChecks(object? sender, EventArgs e)
    {
        UiSoundService.PlayStartup();
        var progress = new Progress<StartupCheck>(item =>
        {
            if (IsDisposed || Disposing) return;
            var label = _checks[item.Key];
            label.Text = item.Detail;
            label.ForeColor = item.Error ? Theme.Danger : item.Warning ? Theme.Warning : Theme.Success;
            if (item.Error) { UiSoundService.PlayError(); if (Opacity == 0) RestoreRequested?.Invoke(); }
            _continue.Enabled = StartupDiagnostics.StorageReady;
        });
        try
        {
            await StartupDiagnostics.RunAsync(progress, _lifetime.Token);
            if (!IsDisposed && !Disposing && StartupDiagnostics.StorageReady) OpenRequested?.Invoke();
        }
        catch (Exception ex)
        {
            if (!IsDisposed && !Disposing)
            { if (Opacity == 0) RestoreRequested?.Invoke(); _checks["storage"].Text = ex.Message; _checks["storage"].ForeColor = Theme.Danger; _continue.Enabled = StartupDiagnostics.StorageReady; }
        }
    }
    protected override void OnFormClosing(FormClosingEventArgs e) { base.OnFormClosing(e); if (!e.Cancel) _lifetime.Cancel(); }
    protected override void Dispose(bool disposing)
    {
        if (disposing && !_disposed) { _disposed = true; _lifetime.Cancel(); _lifetime.Dispose(); }
        base.Dispose(disposing);
    }
    protected override void WndProc(ref Message message)
    {
        if (Program.RestoreWindowMessage > 0 && message.Msg == Program.RestoreWindowMessage) { RestoreRequested?.Invoke(); return; }
        if (UiLayout.TryHandleResize(this, ref message)) return; base.WndProc(ref message);
    }
}

internal sealed class LauncherApplicationContext : ApplicationContext
{
    private readonly StartupForm _startup = new();
    private bool _opening;
    private bool _startInTray;
    public LauncherApplicationContext(bool startInTray = false)
    {
        _startInTray = startInTray;
        if (startInTray) { _startup.Opacity = 0; _startup.ShowInTaskbar = false; }
        _startup.RestoreRequested += () => { _startInTray = false; _startup.Opacity = 1; _startup.ShowInTaskbar = true; _startup.Show(); _startup.Activate(); };
        MainForm = _startup;
        _startup.OpenRequested += OpenLauncher;
        _startup.Show();
    }
    private void OpenLauncher()
    {
        if (_opening || !StartupDiagnostics.StorageReady) return;
        _opening = true;
        try
        {
            var main = new Form1();
            if (_startInTray) { main.Opacity = 0; main.ShowInTaskbar = false; }
            main.Show();
            if (_startInTray) { main.HideToTray(notify: false); main.Opacity = 1; }
            MainForm = main;
            _startup.Close();
            _startup.Dispose();
        }
        catch (Exception ex)
        {
            _opening = false;
            _startup.Opacity = 1; _startup.ShowInTaskbar = true;
            UiFeedback.Error(_startup, ex.Message, "Launcher could not open");
        }
    }
}
