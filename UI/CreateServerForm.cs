using System.Runtime.InteropServices;
using Server_Launcher.Core;
using Server_Launcher.Models;
using Server_Launcher.Services;
using Server_Launcher.UI.Controls;

namespace Server_Launcher.UI;

public sealed class CreateServerForm : Form
{
    // EASY-TO-TUNE CREATE WINDOW DIMENSIONS. The body scrolls; actions remain fixed.
    private const int DialogWidth = 720;
    private const int DialogHeight = 760;
    private const int MinimumWidth = 560;
    private const int MinimumHeight = 500;
    private readonly ModernTextBoxHost _nameHost = new();
    private readonly ModernTextBoxHost _portHost = new();
    private readonly ModernDropDown _softwareBox = new();
    private readonly ModernDropDown _versionBox = new();
    private readonly ModernDropDown _optimizationBox = new();
    private readonly ModernMemorySlider _ramSlider = new();
    private readonly ModernToggle _eulaBox = new();
    private readonly ModernToggle _offlineBox = new();
    private readonly ModernButton _createButton;
    private readonly ModernButton _reloadButton;
    private readonly ModernProgressBar _progressBar = new();
    private readonly Label _statusLabel;
    private readonly Label _runtimeHint;
    private readonly TableLayoutPanel _fields;
    private readonly Panel _ramField;
    private readonly ProfileService _profiles = new();
    private readonly CancellationTokenSource _lifetime = new();
    private CancellationTokenSource? _versionRequest;
    private IServerBackend _backend;
    private int _versionGeneration;
    private int _installPhase;
    private bool _busy;
    private bool _loadingVersions;
    private bool _resourcesDisposed;
    private bool _cancelCloseRequested;
    public ServerProfile? CreatedProfile { get; private set; }
    private sealed record SoftwareChoice(string Id, string Label) { public override string ToString() => Label; }

    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    public CreateServerForm(string? software = null)
    {
        _backend = ServerBackends.Resolve(software ?? LauncherConfig.ServerSoftwareName);
        UiLayout.ConfigureDialog(this, "Create Minecraft Server", new Size(DialogWidth, DialogHeight), new Size(MinimumWidth, MinimumHeight));
        DoubleBuffered = true;
        var settings = GlobalSettingsService.Current;
        var (body, footer) = UiLayout.DialogShell(this, "Server Launcher  /  Create server", DragWindow);
        var stack = UiLayout.Stack(36, 30, 76, 76, 76, 108, 68, 36, 36, 38, 12, 36);
        _fields = stack;
        body.ContentControls.Add(stack);
        stack.Controls.Add(UiLayout.Label("Create a Minecraft server", 20f, Theme.Text, true), 0, 0);
        stack.Controls.Add(UiLayout.Label("Choose your server, version and optimization profile.", 9.5f, Theme.Muted), 0, 1);
        foreach (var backend in ServerBackends.Available) _softwareBox.Items.Add(new SoftwareChoice(backend.Id, backend.DisplayName));
        _softwareBox.SelectedItem = _softwareBox.Items.OfType<SoftwareChoice>().First(c => c.Id == _backend.Id);
        _nameHost.TextBox.Text = "My Minecraft Server";
        _nameHost.TextBox.AccessibleName = "Server name";
        stack.Controls.Add(UiLayout.Field("Server name", _nameHost), 0, 2);
        stack.Controls.Add(UiLayout.Field("Server type", _softwareBox), 0, 3);
        var choices = UiLayout.SpacedRow(2);
        var versionRow = UiLayout.Grid(2, 1);
        versionRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        versionRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 50));
        versionRow.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        _versionBox.Dock = DockStyle.Fill;
        _versionBox.Margin = Padding.Empty;
        versionRow.Controls.Add(_versionBox, 0, 0);
        _reloadButton = UiLayout.Button(string.Empty, ModernIcon.Refresh);
        _reloadButton.AccessibleName = "Refresh available releases";
        _reloadButton.Margin = new Padding(8, 0, 0, 0);
        _reloadButton.Click += async (_, _) => await LoadVersionsAsync();
        versionRow.Controls.Add(_reloadButton, 1, 0);
        choices.Controls.Add(UiLayout.Field("Minecraft version", versionRow), 0, 0);
        _optimizationBox.Items.AddRange(new object[] { LauncherConfig.StandardProfile, LauncherConfig.BalancedProfile, LauncherConfig.PerformanceProfile });
        _optimizationBox.SelectedItem = LauncherConfig.BalancedProfile;
        choices.Controls.Add(UiLayout.Field("Optimization profile", _optimizationBox), 2, 0);
        stack.Controls.Add(choices, 0, 4);
        _ramSlider.Minimum = Math.Min(LauncherConfig.MinimumRamMb, MemoryLimits.TotalPhysicalMemoryMb);
        _ramSlider.Maximum = MemoryLimits.TotalPhysicalMemoryMb;
        _ramSlider.Value = settings.MaximumMemoryMb;
        _ramField = UiLayout.Field("Maximum Java RAM", _ramSlider, inputHeight: UiMetrics.MemorySliderHeight);
        stack.Controls.Add(_ramField, 0, 5);
        var portRow = UiLayout.SpacedRow(2);
        _portHost.TextBox.Text = _backend.DefaultPort.ToString();
        portRow.Controls.Add(UiLayout.Field("Server port", _portHost), 0, 0);
        _runtimeHint = UiLayout.Label(string.Empty, 8.5f, Theme.Subtle);
        _runtimeHint.AutoEllipsis = false;
        portRow.Controls.Add(_runtimeHint, 2, 0);
        stack.Controls.Add(portRow, 0, 6);
        _eulaBox.Text = "I accept the Minecraft EULA and server download terms";
        _eulaBox.Dock = DockStyle.Fill;
        _eulaBox.Margin = Padding.Empty;
        stack.Controls.Add(_eulaBox, 0, 7);
        _offlineBox.Text = "Allow offline players on a trusted LAN";
        _offlineBox.Dock = DockStyle.Fill;
        _offlineBox.Margin = Padding.Empty;
        stack.Controls.Add(_offlineBox, 0, 8);
        var offlineHint = UiLayout.Label("Optional: disables online identity checks. Use only on a trusted local network.", 8.5f, Theme.Subtle);
        offlineHint.AutoEllipsis = false;
        stack.Controls.Add(offlineHint, 0, 9);
        var progress = new Panel { Dock = DockStyle.Fill, BackColor = Theme.Background, Padding = new Padding(0, 3, 0, 3), Margin = Padding.Empty };
        _progressBar.Dock = DockStyle.Fill;
        progress.Controls.Add(_progressBar);
        stack.Controls.Add(progress, 0, 10);
        _statusLabel = UiLayout.Label("Loading available releases...", 8.5f, Theme.Muted);
        _statusLabel.AutoEllipsis = false;
        stack.Controls.Add(_statusLabel, 0, 11);
        footer.Controls.Add(UiLayout.Label("Balance is recommended", 8.5f, Theme.Subtle), 0, 0);
        var cancel = UiLayout.Button("Cancel");
        cancel.Margin = new Padding(0, 0, 12, 0);
        cancel.DialogResult = DialogResult.Cancel;
        cancel.Click += (_, _) => Close();
        footer.Controls.Add(cancel, 1, 0);
        CancelButton = cancel;
        _createButton = UiLayout.Button("Create server", ModernIcon.Plus, primary: true);
        _createButton.Click += async (_, _) => await CreateServerAsync();
        footer.Controls.Add(_createButton, 2, 0);
        _softwareBox.SelectedIndexChanged += async (_, _) =>
        {
            if (_busy || _softwareBox.SelectedItem is not SoftwareChoice choice) return;
            _backend = ServerBackends.Resolve(choice.Id);
            _portHost.TextBox.Text = _backend.DefaultPort.ToString();
            _optimizationBox.SelectedItem = LauncherConfig.BalancedProfile;
            UpdateBackendHint();
            await LoadVersionsAsync();
        };
        _nameHost.TextBox.TextChanged += (_, _) => UpdateAvailability();
        _portHost.TextBox.TextChanged += (_, _) => UpdateAvailability();
        _versionBox.SelectedIndexChanged += (_, _) => UpdateAvailability();
        _eulaBox.CheckedChanged += (_, _) => UpdateAvailability();
        UpdateBackendHint();
        UpdateAvailability();
        foreach (Control field in stack.Controls) field.TabIndex = stack.GetRow(field);
        DpiChanged += (_, _) => UpdateBackendHint();
        ResumeLayout(true);
        Shown += async (_, _) => { _nameHost.TextBox.Focus(); await LoadVersionsAsync(); };
    }
    private void UpdateBackendHint()
    {
        _ramSlider.Enabled = !_busy && _backend.RequiresJava && MemoryLimits.IsSupported;
        _ramField.Visible = _backend.RequiresJava;
        _fields.RowStyles[5].Height = _backend.RequiresJava ? UiMetrics.Scale(this, 108) : 0;
        _fields.Height = _fields.RowStyles.Cast<RowStyle>().Sum(row => (int)row.Height);
        _versionBox.ReadOnly = !_backend.RequiresJava;
        _runtimeHint.Text = _backend.RequiresJava ? "Matching Java is prepared automatically.\nTCP server port." : "Native Bedrock · no Java required.\nMemory managed by Bedrock · UDP port.";
    }
    private void UpdateAvailability()
    {
        _createButton.Enabled = !_busy && !_loadingVersions && !string.IsNullOrWhiteSpace(_nameHost.TextBox.Text) &&
            _versionBox.SelectedItem is string && _eulaBox.Checked && int.TryParse(_portHost.TextBox.Text, out var port) && port is >= 1 and <= 65535 &&
            (!_backend.RequiresJava || MemoryLimits.IsSupported);
    }
    private async Task LoadVersionsAsync()
    {
        if (_busy) return;
        _versionRequest?.Cancel();
        var generation = ++_versionGeneration;
        using var request = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token);
        _versionRequest = request;
        var backend = _backend;
        _loadingVersions = true;
        _versionBox.Items.Clear();
        _statusLabel.Text = "Loading " + backend.Id + " releases...";
        UpdateAvailability();
        try
        {
            using var installer = backend.CreateInstaller();
            var versions = await installer.GetVersionsAsync(request.Token);
            if (IsDisposed || Disposing || generation != _versionGeneration) return;
            foreach (var version in versions) _versionBox.Items.Add(version);
            if (_versionBox.Items.Count > 0) _versionBox.SelectedIndex = 0;
            _statusLabel.Text = backend.RequiresJava
                ? $"{versions.Count} release(s) available · Java is prepared after Create."
                : "Official current stable Windows release · prepared automatically.";
        }
        catch (OperationCanceledException) when (request.IsCancellationRequested) { }
        catch (Exception ex)
        {
            if (!IsDisposed && !Disposing && generation == _versionGeneration) { _statusLabel.Text = ex.Message; UiSoundService.PlayError(); }
        }
        finally
        {
            if (ReferenceEquals(_versionRequest, request)) _versionRequest = null;
            if (!IsDisposed && !Disposing && generation == _versionGeneration) { _loadingVersions = false; UpdateAvailability(); }
        }
    }
    private async Task CreateServerAsync()
    {
        if (!_createButton.Enabled || _versionBox.SelectedItem is not string version) return;
        var backend = _backend;
        var settings = GlobalSettingsService.Current;
        var name = _nameHost.TextBox.Text.Trim();
        string folderName;
        try { folderName = SafeFolderName(name); }
        catch (InvalidOperationException ex) { UiFeedback.Error(this, ex.Message, "Invalid server name"); return; }
        var finalFolder = Path.Combine(AppPaths.ServersRoot, folderName);
        if (Directory.Exists(finalFolder) || File.Exists(finalFolder))
        { UiFeedback.Error(this, "A server folder with this name already exists. Choose another name.", "Server exists"); return; }
        var stage = Path.Combine(AppPaths.ServersRoot, ".create-" + Guid.NewGuid().ToString("N"));
        var profile = new ServerProfile
        {
            Name = name, FolderPath = stage, MinecraftVersion = version, ServerSoftware = backend.Id,
            MinMemoryMb = Math.Min(settings.InitialMemoryMb, _ramSlider.Value), MaxMemoryMb = _ramSlider.Value,
            ServerPort = int.Parse(_portHost.TextBox.Text), OfflinePlayersAllowed = _offlineBox.Checked,
            OptimizationProfile = _optimizationBox.SelectedItem as string ?? LauncherConfig.BalancedProfile
        };
        var token = _lifetime.Token;
        SetBusy(true, "Preparing server...");
        _progressBar.Value = 0;
        var moved = false;
        var committed = false;
        try
        {
            ServerPreflight.EnsurePlatform(backend);
            Directory.CreateDirectory(stage);
            if (backend.RequiresJava)
            {
                _installPhase = 1;
                _statusLabel.Text = "Checking the Java requirement...";
                var release = await MinecraftVersions.GetAsync(version, token);
                profile.JavaMajorVersion = MinecraftVersions.RecommendedJava(version, backend.Id, release.JavaMajor);
                var selectedJava = profile.JavaMajorVersion;
                _statusLabel.Text = $"Preparing Java {selectedJava} if needed...";
                var javaProgress = new Progress<int>(value =>
                {
                    if (IsDisposed || Disposing || token.IsCancellationRequested || _installPhase != 1) return;
                    _progressBar.Value = value / 4;
                    _statusLabel.Text = $"Preparing Java {selectedJava}... {value}%";
                });
                profile.LastJavaRuntimeMajor = selectedJava;
                profile.JavaExecutablePath = await new JavaManager().EnsureAsync(selectedJava, javaProgress, token);
            }
            _installPhase = 2;
            _statusLabel.Text = "Installing " + backend.Id + " and its required files...";
            var progress = new Progress<int>(value =>
            {
                if (IsDisposed || Disposing || token.IsCancellationRequested || _installPhase != 2) return;
                _progressBar.Value = 25 + value * 60 / 100;
                _statusLabel.Text = $"Preparing {backend.Id}... {_progressBar.Value}%";
            });
            using (var installer = backend.CreateInstaller())
                profile.ServerBuild = await installer.DownloadLatestStableAsync(version, backend.GetEntryPoint(profile), progress, token, profile.JavaExecutablePath);
            _installPhase = 3;
            _statusLabel.Text = "Applying settings and completing the server...";
            _progressBar.Value = 95;
            await backend.CompleteInstallationAsync(profile, token);
            token.ThrowIfCancellationRequested();
            Directory.Move(stage, finalFolder);
            moved = true;
            profile.FolderPath = finalFolder;
            _profiles.Save(profile);
            committed = true;
            CreatedProfile = profile;
            _progressBar.Value = 100;
            UiSoundService.PlaySuccess();
            LauncherNotifications.Success("Server prepared", profile.Name + " has been installed successfully.");
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        catch (Exception ex)
        {
            if (!IsDisposed && !Disposing) { UiFeedback.Error(this, ex.Message, "Create server failed"); _statusLabel.Text = "Server creation failed. " + ex.Message; }
        }
        finally
        {
            // Creation owns only its unique stage/final folder; pre-existing server data is never touched.
            if (!committed)
            {
                try { if (moved && Directory.Exists(finalFolder)) Directory.Delete(finalFolder, true); }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
                try { if (Directory.Exists(stage)) Directory.Delete(stage, true); }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
            }
            if (!IsDisposed && !Disposing) SetBusy(false, _statusLabel.Text);
        }
    }
    private static string SafeFolderName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var result = new string(value.Select(c => invalid.Contains(c) ? '_' : c).ToArray()).TrimEnd('.', ' ');
        if (!ArchiveExtractor.SafeComponent(result) || result.StartsWith('.'))
            throw new InvalidOperationException("Choose a valid server name without reserved names or path characters.");
        return result;
    }
    private void SetBusy(bool busy, string message)
    {
        _busy = busy;
        _softwareBox.Enabled = _nameHost.Enabled = _portHost.Enabled = _versionBox.Enabled = _optimizationBox.Enabled = _eulaBox.Enabled = _offlineBox.Enabled = _reloadButton.Enabled = !busy;
        UpdateBackendHint();
        _statusLabel.Text = message;
        UseWaitCursor = busy;
        UpdateAvailability();
        if (!busy && _cancelCloseRequested && !IsDisposed && IsHandleCreated) BeginInvoke(new Action(Close));
    }
    private void DragWindow(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        ReleaseCapture(); SendMessage(Handle, 0x00A1, new IntPtr(2), IntPtr.Zero);
    }
    protected override void WndProc(ref Message message) { if (UiLayout.TryHandleResize(this, ref message)) return; base.WndProc(ref message); }
    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (_busy && CreatedProfile is null && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true; _cancelCloseRequested = true; _lifetime.Cancel();
            _statusLabel.Text = "Cancelling and cleaning up the current operation...";
            return;
        }
        base.OnFormClosing(e); if (!e.Cancel) _lifetime.Cancel();
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing && !_resourcesDisposed) { _resourcesDisposed = true; _lifetime.Cancel(); _lifetime.Dispose(); }
        base.Dispose(disposing);
    }
}
