using System.Runtime.InteropServices;
using Server_Launcher.Core;
using Server_Launcher.Models;
using Server_Launcher.Services;
using Server_Launcher.UI;
using Server_Launcher.UI.Controls;

namespace Server_Launcher;

public partial class Form1 : Form
{
    private readonly ProfileService _profileService = new();
    private readonly JavaManager _javaManager = new();
    private readonly ServerProcessManager _serverProcess = new();

    private ServerProfile? _selectedProfile;
    private DateTime? _serverStartedUtc;
    private LauncherServerState _serverState = LauncherServerState.Offline;
    private bool _closing;
    private bool _deletingServer;
    private bool _loadingProfiles;
    private bool _stopRequested;
    private bool _serverReachedReady;
    private int _activeMaximumMemoryMb;
    private int _errorsAtStop;
    private bool _stopWasForced;
    private Task _lastStopSound = Task.CompletedTask;
    private TaskCompletionSource<int> _preparationDone = CompletedExitFeedback();
    private TaskCompletionSource<int> _exitFeedback = CompletedExitFeedback();
    private static TaskCompletionSource<int> CompletedExitFeedback()
    { var source = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously); source.SetResult(0); return source; }
    private readonly ServerSessionMonitor _session = new();
    private readonly CancellationTokenSource _lifetime = new();
    private string? _publicIp;
    private bool _publicIpResolved;
    private bool _publicIpRequestActive;
    private DateTime _nextPublicIpRefreshUtc;

    // Console retention is independent of server behavior and can be tuned here.
    private const int MaxConsoleCharacters = 500_000;

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    public Form1()
    {
        _ = GlobalSettingsService.Current;
        InitializeComponent();
        InitializeBackground();
        AppPaths.EnsureCreated();

        _serverProcess.OutputReceived += line => AppendConsole(line, false, _serverProcess.SessionId);
        _serverProcess.ErrorReceived += line => AppendConsole(line, true, _serverProcess.SessionId);
        _serverProcess.Exited += (code, session) =>
        {
            var feedback = _exitFeedback;
            if (!IsDisposed && IsHandleCreated)
                try
                {
                    BeginInvoke(new Action(async () =>
                    {
                        try { await _serverProcess.ExitCompletion; OnServerExited(code, session); }
                        finally { feedback.TrySetResult(code); if (!_closing && !IsDisposed && session == _serverProcess.SessionId) UpdateState(); }
                    }));
                }
                catch (InvalidOperationException) { feedback.TrySetResult(code); }
            else feedback.TrySetResult(code);
        };

        LoadProfiles();

        UpdateState();
        ApplyResponsiveLayout();
        Shown += async (_, _) =>
        {
            if (GlobalSettingsService.LoadError is string error)
                UiFeedback.Error(this, "Global settings could not be loaded. Defaults are in use.\n" + error, "Settings error");
            await RefreshPublicAddressAsync(force: true);
        };
    }

    private void LoadProfiles(string? selectFolder = null)
    {
        var previousFolder = selectFolder ?? _selectedProfile?.FolderPath;
        _loadingProfiles = true;
        serverListBox.BeginUpdate();
        try
        {
            serverListBox.Items.Clear();
            foreach (var profile in _profileService.LoadAll()) serverListBox.Items.Add(profile);
            serverListBox.DisplayMember = nameof(ServerProfile.Name);
        }
        finally { serverListBox.EndUpdate(); _loadingProfiles = false; }
        serverCountLabel.Text = serverListBox.Items.Count.ToString();
        emptyServersLabel.Visible = serverListBox.Items.Count == 0;
        if (serverListBox.Items.Count == 0) { SelectProfile(null); return; }
        var target = serverListBox.Items.OfType<ServerProfile>().FirstOrDefault(p => string.Equals(p.FolderPath, previousFolder, StringComparison.OrdinalIgnoreCase));
        serverListBox.SelectedItem = target ?? serverListBox.Items[0];
    }

    private void serverListBox_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (!_loadingProfiles) SelectProfile(serverListBox.SelectedItem as ServerProfile);
    }

    private void SelectProfile(ServerProfile? profile)
    {
        if (_serverProcess.IsRunning && !string.Equals(_selectedProfile?.FolderPath, profile?.FolderPath, StringComparison.OrdinalIgnoreCase))
        {
            MessageBox.Show(this, "Stop the running server before switching profiles.", "Server is running", MessageBoxButtons.OK, MessageBoxIcon.Information);

            if (_selectedProfile is not null)
                serverListBox.SelectedItem = _selectedProfile;
            return;
        }

        var sameFolder = string.Equals(_selectedProfile?.FolderPath, profile?.FolderPath, StringComparison.OrdinalIgnoreCase);
        _selectedProfile = profile;
        if (!sameFolder) consoleBox.Clear();
        _serverState = _serverProcess.IsRunning ? _serverState : LauncherServerState.Offline;
        UpdateState();
    }

    private void createServerButton_Click(object? sender, EventArgs e)
    {
        using var dialog = new CreateServerForm();
        if (dialog.ShowDialog(this) != DialogResult.OK || dialog.CreatedProfile is null)
            return;

        LoadProfiles(dialog.CreatedProfile.FolderPath);
    }

    private IReadOnlyList<ItemAction> ServerRowActions(object item)
    {
        var changing = _deletingServer || _exitInProgress || _serverState is LauncherServerState.Starting or LauncherServerState.Stopping or LauncherServerState.Restarting;
        return new[] { new ItemAction("edit", "Rename server", ModernIcon.Edit, !changing),
            new ItemAction("delete", "Delete this server", ModernIcon.Trash, !changing && !_serverProcess.IsRunning && !_serverProcess.IsFinishing) };
    }
    private async void ServerRowAction(object item, string action)
    {
        if (item is not ServerProfile profile || _deletingServer || _exitInProgress) return;
        if (action == "edit")
        {
            using var editor = new ServerDetailsForm(profile, _profileService);
            if (editor.ShowDialog(this) == DialogResult.OK) { LoadProfiles(_selectedProfile?.FolderPath); UpdateState(); }
        }
        else if (action == "delete") await DeleteServerAsync(profile);
    }
    private async Task DeleteServerAsync(ServerProfile profile)
    {
        if (_serverProcess.IsRunning || _serverProcess.IsFinishing || _deletingServer ||
            _serverState is LauncherServerState.Starting or LauncherServerState.Stopping or LauncherServerState.Restarting) return;
        if (ServerProcessManager.HasLiveManagedProcess(profile))
        {
            ConfirmActionForm.ShowDetails(this, "Server is still running", "Stop the managed server before deleting its folder.", new[] { profile.Name });
            return;
        }
        if (!ConfirmActionForm.Confirm(this, "Delete this server?",
            "This permanently removes the server folder, including its worlds, content and settings. This cannot be undone.",
            new[] { profile.Name, profile.FolderPath }, "Delete server")) return;
        _deletingServer = true;
        UseWaitCursor = true;
        UpdateState();
        try
        {
            await Task.Run(() => _profileService.Delete(profile));
            _deletingServer = false;
            UseWaitCursor = false;
            LoadProfiles();
        }
        catch (Exception ex) { ConfirmActionForm.ShowDetails(this, "Server could not be deleted", "The folder could not be fully removed.", new[] { ex.Message }); }
        finally
        {
            _deletingServer = false;
            UseWaitCursor = false;
            UpdateState();
        }
    }

    private void pluginsNavButton_Click(object? sender, EventArgs e)
    {
        if (_selectedProfile is null)
            return;

        using var dialog = new ContentForm(_selectedProfile, () => _serverProcess.IsRunning);
        dialog.ShowDialog(this);
    }

    private async void settingsNavButton_Click(object? sender, EventArgs e)
    {
        using var dialog = new SettingsForm(_profileService);
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        LoadProfiles(_selectedProfile?.FolderPath);
        UpdateState();
        ApplyBackgroundPreferences();
        AppendConsole("[Launcher] Global settings saved. RAM and optimization changes apply on the next start.", false);
        await RefreshPublicAddressAsync(force: true);
    }

    private async void startButton_Click(object? sender, EventArgs e) => await StartSelectedServerAsync();

    private async Task StartSelectedServerAsync()
    {
        if (_closing || _exitInProgress || _selectedProfile is null || _serverProcess.IsRunning || _serverProcess.IsFinishing || !_exitFeedback.Task.IsCompleted || _serverState == LauncherServerState.Starting) return;
        var profile = _selectedProfile;
        var preparation = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        _preparationDone = preparation;
        try
        {
            var backend = ServerBackends.Resolve(profile.ServerSoftware);
            _serverState = LauncherServerState.Starting;
            UpdateState();
            await StartupDiagnostics.CleanupTask.WaitAsync(_lifetime.Token);
            ServerPreflight.ValidateProfile(profile);
            string executable;
            if (backend.RequiresJava)
            {
                AppendConsole("[Launcher] Checking enabled content and Java compatibility...", false);
                var runtime = await Task.Run(() => RuntimeCompatibility.Evaluate(profile, _lifetime.Token), _lifetime.Token);
                var major = runtime.Major;
                AppendConsole("[Launcher] " + runtime.Detail, false);
                executable = await _javaManager.EnsureAsync(major, token: _lifetime.Token, preferred: profile.JavaExecutablePath);
                if (profile.JavaMajorVersion == 0) profile.JavaMajorVersion = runtime.Baseline;
                profile.LastJavaRuntimeMajor = major;
                profile.JavaExecutablePath = executable;
                _profileService.Save(profile);
            }
            else executable = backend.GetEntryPoint(profile);
            _stopRequested = false;
            _stopWasForced = false;
            _lastStopSound = Task.CompletedTask;
            _errorsAtStop = 0;
            _serverReachedReady = false;
            _activeMaximumMemoryMb = profile.MaxMemoryMb;
            _session.Reset(backend);
            UpdateState();
            var killed = await Task.Run(() => ServerProcessManager.CleanupOrphanedManagedServers(_profileService.LoadAll()), _lifetime.Token);
            if (killed > 0) AppendConsole($"[Launcher] Closed {killed} stale managed process(es) before launch.", false);
            await backend.PrepareStartAsync(profile, _lifetime.Token);
            ServerPreflight.EnsurePortsAvailable(profile);
            if (_closing || _lifetime.IsCancellationRequested) return;
            AppendConsole($"[Launcher] Starting {profile.Name}...", false);
            AppendConsole($"[Launcher] Software: {profile.ServerSoftware} {profile.MinecraftVersion}", false);
            AppendConsole($"[Launcher] Optimization: {OptimizationService.Describe(profile)}", false);
            AppendConsole($"[Launcher] Runtime: {executable}", false);
            _exitFeedback = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
            _serverProcess.Start(profile, executable);
            if (!string.IsNullOrWhiteSpace(_serverProcess.LastLaunchArguments)) AppendConsole($"[Launcher] Launch arguments: {_serverProcess.LastLaunchArguments}", false);
            if (profile.OfflinePlayersAllowed == true) AppendConsole("[Launcher] Offline player authentication is enabled for this trusted-LAN server.", false);
            _serverStartedUtc = DateTime.UtcNow;
            UpdateState();
        }
        catch (OperationCanceledException) when (_closing || _lifetime.IsCancellationRequested) { }
        catch (Exception ex)
        {
            _exitFeedback.TrySetResult(-1);
            if (_closing || IsDisposed || Disposing) return;
            _serverState = LauncherServerState.Offline;
            _serverStartedUtc = null;
            _activeMaximumMemoryMb = 0;
            UiFeedback.Error(this, ex.Message, "Start failed");
            UpdateState();
        }
        finally { preparation.TrySetResult(0); }
    }

    private async void stopButton_Click(object? sender, EventArgs e)
    {
        if (!_serverProcess.IsRunning)
            return;

        BeginStopRequest();
        _serverState = LauncherServerState.Stopping;
        UpdateState();
        AppendConsole("[Launcher] Stopping server safely...", false);

        try
        {
            var stopped = await _serverProcess.StopGracefullyAsync();
            if (!stopped)
            {
                AppendConsole("[Launcher] Graceful stop timed out. Forcing the server process tree to close...", true);
                _stopWasForced = true;
                stopped = _serverProcess.ForceStopAndWait();
            }

            if (stopped) await WaitForExitFeedbackAsync();
            if (!stopped)
            {
                UiFeedback.Error(this, "Windows still reports the managed server process as alive. Another start is blocked until it is gone.", "Server could not be terminated");
            }
        }
        catch (Exception ex)
        {
            _stopWasForced = true;
            _serverProcess.ForceStopAndWait();
            UiFeedback.Error(this, ex.Message, "Stop failed");
        }
        finally
        {
            if (!_serverProcess.IsRunning)
            {
                _serverState = LauncherServerState.Offline;
                _serverStartedUtc = null;
            }
            UpdateState();
        }
    }

    private async void restartButton_Click(object? sender, EventArgs e)
    {
        if (_selectedProfile is null)
            return;

        BeginStopRequest();
        restartButton.Enabled = false;

        try
        {
            if (_serverProcess.IsRunning)
            {
                _serverState = LauncherServerState.Restarting;
                UpdateState();
                AppendConsole("[Launcher] Restart requested. Stopping the current server process first...", false);

                var stopped = await _serverProcess.StopGracefullyAsync();
                if (!stopped)
                {
                    AppendConsole("[Launcher] Graceful restart stop timed out. Forcing a complete process-tree shutdown...", true);
                    _stopWasForced = true;
                    stopped = _serverProcess.ForceStopAndWait();
                }

                if (!stopped)
                    throw new InvalidOperationException("The old server process is still alive, so restart was blocked to prevent a duplicate Minecraft server.");

                await WaitForExitFeedbackAsync();
            }

            _serverState = LauncherServerState.Offline;
            await StartSelectedServerAsync();
        }
        catch (Exception ex)
        {
            _serverState = _serverProcess.IsRunning ? LauncherServerState.Online : LauncherServerState.Offline;
            UiFeedback.Error(this, ex.Message, "Restart failed");
            UpdateState();
        }
    }

    private void sendButton_Click(object? sender, EventArgs e) => SendConsoleCommand();

    private void commandBox_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode != Keys.Enter)
            return;

        e.SuppressKeyPress = true;
        SendConsoleCommand();
    }

    private void SendConsoleCommand()
    {
        var command = commandBox.Text.Trim();
        if (command.Length == 0 || !_serverProcess.IsRunning)
            return;

        try
        {
            if (_selectedProfile is not null && command.Equals(ServerBackends.Resolve(_selectedProfile.ServerSoftware).StopCommand, StringComparison.OrdinalIgnoreCase)) BeginStopRequest();
            _serverProcess.SendCommand(command);
            AppendConsole($"> {command}", false);
            commandBox.Clear();
        }
        catch (Exception ex)
        {
            UiFeedback.Error(this, ex.Message, "Command failed");
        }
    }

    private void AppendConsole(string line, bool isError, int? sourceSession = null)
    {
        if (_closing || IsDisposed || Disposing || (sourceSession.HasValue && sourceSession.Value != _serverProcess.SessionId))
            return;
        if (consoleBox.InvokeRequired)
        {
            try
            {
                if (IsHandleCreated)
                    BeginInvoke(() => AppendConsole(line, isError, sourceSession));
            }
            catch (InvalidOperationException)
            {
                // Closing the window can race the final redirected Java output.
            }
            return;
        }

        var cleanLine = ConsoleAnsiParser.Strip(line);
        UpdateStateFromConsole(cleanLine);
        var segments = ConsoleAnsiParser.Parse(line, isError ? Theme.Danger : GetConsoleColor(cleanLine));
        var preserveView = !followOutputToggle.Checked;
        var selectionStart = consoleBox.SelectionStart;
        var selectionEnd = selectionStart + consoleBox.SelectionLength;
        var scroll = consoleBox.BeginAppend(preserveView);
        var removed = 0;
        try
        {
            consoleBox.Select(consoleBox.TextLength, 0);
            foreach (var segment in segments)
            {
                consoleBox.SelectionColor = segment.Color;
                consoleBox.AppendText(segment.Text);
            }
            consoleBox.SelectionColor = Theme.Text;
            consoleBox.AppendText(Environment.NewLine);
            if (consoleBox.TextLength > MaxConsoleCharacters)
            {
                removed = consoleBox.TextLength - MaxConsoleCharacters;
                consoleBox.Select(0, removed);
                consoleBox.SelectedText = string.Empty;
            }
            consolePlaceholderLabel.Visible = false;
        }
        finally
        {
            var start = Math.Max(0, selectionStart - removed);
            var end = Math.Max(start, selectionEnd - removed);
            consoleBox.EndAppend(preserveView, scroll, start, end - start);
        }
    }

    private void UpdateStateFromConsole(string cleanLine)
    {
        if (cleanLine.StartsWith("[Launcher]", StringComparison.Ordinal) || cleanLine.StartsWith("> ", StringComparison.Ordinal)) return;
        var signal = _session.Observe(cleanLine);
        if (signal.IsError) { UiSoundService.PlayError(); LauncherNotifications.Error((_selectedProfile?.Name ?? "Server") + ": " + cleanLine); }
        if (signal.BecameReady && _serverProcess.IsRunning && _serverState is LauncherServerState.Starting or LauncherServerState.Restarting)
        {
            _serverReachedReady = true;
            _serverState = LauncherServerState.Online;
            if (signal.PlayReadySound) _ = PlayReadySoundWhenStableAsync(_serverProcess.SessionId);
            UpdateState();
        }
        if ((cleanLine.Contains("Stopping server", StringComparison.OrdinalIgnoreCase) || cleanLine.Contains("Saving players", StringComparison.OrdinalIgnoreCase)) && _serverProcess.IsRunning && _serverState != LauncherServerState.Restarting)
        {
            _serverState = LauncherServerState.Stopping;
            UpdateState();
        }
    }

    private async Task PlayReadySoundWhenStableAsync(int session)
    {
        try
        {
            await Task.Delay(LauncherConfig.ReadySoundDelayMs, _lifetime.Token);
            if (!_closing && _serverProcess.IsRunning && _serverProcess.SessionId == session && _serverState == LauncherServerState.Online && _session.ErrorCount == 0)
            {
                UiSoundService.PlayServerReady();
                LauncherNotifications.Success("Server started", (_selectedProfile?.Name ?? "Minecraft server") + " is ready to play.");
            }
        }
        catch (OperationCanceledException) { }
    }

    private static Color GetConsoleColor(string line)
    {
        if (line.Contains("ERROR", StringComparison.OrdinalIgnoreCase) ||
            line.Contains("SEVERE", StringComparison.OrdinalIgnoreCase))
            return Theme.Danger;

        if (line.Contains("WARN", StringComparison.OrdinalIgnoreCase))
            return Theme.Warning;

        if (line.StartsWith("[Launcher]", StringComparison.OrdinalIgnoreCase))
            return Theme.Accent;

        if (line.StartsWith("> ", StringComparison.Ordinal))
            return Theme.Success;

        return Theme.Text;
    }

    private async Task WaitForExitFeedbackAsync()
    {
        var timeout = TimeSpan.FromMilliseconds(LauncherConfig.ForceStopWaitMilliseconds + LauncherConfig.ExitFinalizationSlackMilliseconds);
        await _serverProcess.ExitCompletion.WaitAsync(timeout);
        await _exitFeedback.Task.WaitAsync(timeout);
    }
    private void BeginStopRequest()
    {
        if (!_stopRequested) _errorsAtStop = _session.ErrorCount;
        _stopRequested = true;
    }
    private void OnServerExited(int exitCode, int session)
    {
        if (_closing || _serverProcess.IsRunning || session != _serverProcess.SessionId) return;
        var clean = exitCode == 0 && !_stopWasForced && (_serverReachedReady || _stopRequested) &&
            (_stopRequested ? _session.ErrorCount == _errorsAtStop : _session.ErrorCount == 0);
        if (clean)
        {
            _lastStopSound = UiSoundService.PlayServerStoppedAsync();
            LauncherNotifications.Success("Server stopped", (_selectedProfile?.Name ?? "Minecraft server") + " stopped successfully.");
        }
        else
        {
            UiSoundService.PlayError();
            LauncherNotifications.Error((_selectedProfile?.Name ?? "Server") + (_stopWasForced ? " was forcibly stopped." : $" exited with code {exitCode}. Check the console for errors."));
        }
        AppendConsole($"[Launcher] Server process exited with code {exitCode}.", !clean);
        _serverStartedUtc = null;
        if (_serverState != LauncherServerState.Restarting) _serverState = LauncherServerState.Offline;
        UpdateState();
    }

    private void metricsTimer_Tick(object? sender, EventArgs e)
    {
        _ = RefreshPublicAddressAsync();
        if (!Visible || WindowState == FormWindowState.Minimized) return;
        if (_selectedProfile is null)
        {
            cpuValueLabel.Text = "0.0%";
            ramValueLabel.Text = "—";
            ramLimitLabel.Text = "Heap limit: —";
            uptimeValueLabel.Text = "00:00:00";
            return;
        }

        if (!_serverProcess.IsRunning)
        {
            cpuValueLabel.Text = "0.0%";
            ramValueLabel.Text = "0 MB";
            uptimeValueLabel.Text = "00:00:00";
            return;
        }

        var metrics = _serverProcess.GetMetrics();
        cpuValueLabel.Text = $"{metrics.CpuPercent:0.0}%";
        ramValueLabel.Text = $"{metrics.RamMb:0} MB";

        if (_serverStartedUtc.HasValue)
        {
            var uptime = DateTime.UtcNow - _serverStartedUtc.Value;
            uptimeValueLabel.Text = $"{(int)uptime.TotalHours:00}:{uptime.Minutes:00}:{uptime.Seconds:00}";
        }
    }

    private void UpdateState()
    {
        if (startButton is null)
            return;

        var hasProfile = _selectedProfile is not null;
        var running = _serverProcess.IsRunning;
        var transition = _deletingServer || _exitInProgress || _serverProcess.IsFinishing || (!running && !_exitFeedback.Task.IsCompleted) || _serverState is LauncherServerState.Starting or LauncherServerState.Stopping or LauncherServerState.Restarting;

        var supported = hasProfile && ServerBackends.TryResolve(_selectedProfile!.ServerSoftware, out _);
        startButton.Enabled = supported && !running && !transition;
        stopButton.Enabled = running && _serverState is not (LauncherServerState.Stopping or LauncherServerState.Restarting);
        restartButton.Enabled = supported && !transition;
        commandBox.Enabled = running && _serverState != LauncherServerState.Stopping;
        sendButton.Enabled = commandBox.Enabled;
        serverListBox.Enabled = !transition;
        createServerButton.Enabled = !running && !transition;
        pluginsNavButton.Enabled = supported && !transition;
        settingsNavButton.Enabled = !transition;
        serverListBox.Invalidate();
        UpdateTrayStatus();

        var (statusText, statusColor) = _serverState switch
        {
            LauncherServerState.Starting => ("Starting", Theme.Warning),
            LauncherServerState.Online => ("Online", Theme.Success),
            LauncherServerState.Stopping => ("Stopping", Theme.Warning),
            LauncherServerState.Restarting => ("Restarting", Theme.Warning),
            _ => ("Offline", Theme.Subtle)
        };
        if (_deletingServer) { statusText = "Deleting"; statusColor = Theme.Danger; }
        statusValueLabel.Text = statusText;
        statusValueLabel.ForeColor = statusColor;
        UpdateConsolePlaceholder();

        if (_selectedProfile is null)
        {
            serverNameLabel.Text = "No server selected";
            serverNameLabel.ShowNetwork = false;
            ramValueLabel.Text = "—";
            ramLimitLabel.Text = "Heap limit: —";
            cpuValueLabel.Text = "0.0%";
            serverIpValueLabel.Text = "LAN  —";
            serverPublicIpValueLabel.Text = "WAN  —";
            serverIpValueLabel.TabStop = serverPublicIpValueLabel.TabStop = false;
            serverIpValueLabel.Cursor = serverPublicIpValueLabel.Cursor = Cursors.Default;
            uiToolTip.SetToolTip(serverIpValueLabel, null);
            uiToolTip.SetToolTip(serverPublicIpValueLabel, null);
            uptimeValueLabel.Text = "00:00:00";
            return;
        }

        serverNameLabel.Text = _selectedProfile.Name;
        serverNameLabel.ShowNetwork = true;
        ramValueLabel.Text = running ? ramValueLabel.Text : "0 MB";
        var javaServer = !ServerBackends.TryResolve(_selectedProfile.ServerSoftware, out var selectedBackend) || selectedBackend.RequiresJava;
        ramLimitLabel.Text = javaServer ? $"Heap limit: {MemoryLimits.Format(running && _activeMaximumMemoryMb > 0 ? _activeMaximumMemoryMb : _selectedProfile.MaxMemoryMb)}" : "Managed by Bedrock";
        var address = NetworkService.GetDisplayAddress(_selectedProfile);
        serverIpValueLabel.Text = $"LAN  {address}";
        serverIpValueLabel.TabStop = true;
        serverIpValueLabel.Cursor = Cursors.Hand;
        var wan = GlobalSettingsService.Current.ShowPublicIp ? (_publicIp is null ? (_publicIpResolved ? "Unavailable" : "Detecting...") : $"{_publicIp}:{_selectedProfile.ServerPort}") : "Hidden";
        serverPublicIpValueLabel.Text = "WAN  " + wan;
        serverPublicIpValueLabel.TabStop = GlobalSettingsService.Current.ShowPublicIp && _publicIp is not null;
        serverPublicIpValueLabel.Cursor = serverPublicIpValueLabel.TabStop ? Cursors.Hand : Cursors.Default;
        uiToolTip.SetToolTip(serverPublicIpValueLabel, _publicIp is null ? "Public address could not yet be detected." : $"{_publicIp}:{_selectedProfile.ServerPort}\nClick to copy the WAN address.");
        uiToolTip.SetToolTip(serverNameLabel, _selectedProfile.Name);
        uiToolTip.SetToolTip(serverIpValueLabel, $"{address}\nClick to copy the LAN address.");
        uiToolTip.SetToolTip(ramValueLabel, "Resident memory of the server process (working set).");
        uiToolTip.SetToolTip(ramLimitLabel, javaServer ? "Maximum Java heap (-Xmx). Process memory can exceed this value." : "Bedrock manages native memory; Java heap arguments do not apply.");
    }

    private void serverIpValueLabel_Click(object? sender, EventArgs e)
    {
        if (_selectedProfile is null) return;
        var wan = ReferenceEquals(sender, serverPublicIpValueLabel);
        if (wan && (_publicIp is null || !GlobalSettingsService.Current.ShowPublicIp)) return;
        var address = wan ? $"{_publicIp}:{_selectedProfile.ServerPort}" : NetworkService.GetDisplayAddress(_selectedProfile);
        try { Clipboard.SetText(address); AppendConsole($"[Launcher] Copied {(wan ? "WAN" : "LAN")} address: {address}", false); }
        catch (Exception) { UiSoundService.PlayError(); }
    }

    private async Task RefreshPublicAddressAsync(bool force = false)
    {
        if (_closing || _publicIpRequestActive || !GlobalSettingsService.Current.ShowPublicIp || (!force && DateTime.UtcNow < _nextPublicIpRefreshUtc)) return;
        _publicIpRequestActive = true;
        _nextPublicIpRefreshUtc = DateTime.UtcNow.AddMinutes(LauncherConfig.PublicIpRefreshMinutes);
        try
        {
            _publicIp = await NetworkService.GetPublicIpv4Async(_lifetime.Token);
            _publicIpResolved = true;
            if (!_closing && !IsDisposed) UpdateState();
        }
        catch (OperationCanceledException) when (_closing || _lifetime.IsCancellationRequested) { }
        finally { _publicIpRequestActive = false; }
    }

    private void Form1_Resize(object? sender, EventArgs e) => ApplyResponsiveLayout();

    private void ApplyResponsiveLayout()
    {
        if (bodyLayout is null || content is null)
            return;

        if (maximizeWindowButton is not null) maximizeWindowButton.IconKind = WindowState == FormWindowState.Maximized ? ModernIcon.Restore : ModernIcon.Maximize;
        var logicalWidth = ClientSize.Width * UiMetrics.BaseDpi / (double)DeviceDpi;
        var compact = logicalWidth < UiMetrics.CompactBreakpoint;
        var sidebarWidth = compact ? UiMetrics.CompactSidebarWidth : UiMetrics.SidebarWidth;
        var padding = compact ? UiMetrics.CompactContentPadding : UiMetrics.ContentPadding;
        bodyLayout.SuspendLayout();
        var width = UiMetrics.Scale(this, sidebarWidth);
        if (bodyLayout.ColumnStyles[0].Width != width) bodyLayout.ColumnStyles[0].Width = width;
        var contentPadding = new Padding(UiMetrics.Scale(this, padding));
        if (content.Padding != contentPadding) content.Padding = contentPadding;
        content.MinimumContentSize = new Size(UiMetrics.MinimumContentWidth, UiMetrics.MinimumContentHeight);
        sidebar.MinimumContentSize = new Size(0, UiMetrics.MinimumSidebarHeight);
        bodyLayout.ResumeLayout(true);
    }

    private void UpdateConsolePlaceholder()
    {
        consolePlaceholderLabel.Visible = consoleBox.TextLength == 0;
        consolePlaceholderLabel.Text = _selectedProfile is null
            ? "Create or select a server to get started."
            : "Ready when you are.\nStart the server to see live console output.";
    }

    private void titleBar_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
            return;

        if (e.Clicks >= 2)
        {
            ToggleMaximize();
            return;
        }

        ReleaseCapture();
        SendMessage(Handle, 0x00A1, new IntPtr(2), IntPtr.Zero);
    }

    private void ToggleMaximize()
    {
        var screen = Screen.FromHandle(Handle);
        var area = screen.WorkingArea;
        MaximizedBounds = new Rectangle(area.Left - screen.Bounds.Left, area.Top - screen.Bounds.Top,
            area.Width, area.Height);
        WindowState = WindowState == FormWindowState.Maximized
            ? FormWindowState.Normal
            : FormWindowState.Maximized;
    }

    protected override void WndProc(ref Message m)
    {
        if (Program.RestoreWindowMessage > 0 && m.Msg == Program.RestoreWindowMessage) { RestoreFromTray(); return; }
        if (UiLayout.TryHandleResize(this, ref m))
            return;
        base.WndProc(ref m);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (_deletingServer && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; return; }
        if (e.CloseReason == CloseReason.UserClosing && !_exitApproved)
        {
            e.Cancel = true;
            if (!_exitRequested && GlobalSettingsService.Current.CloseToTray) HideToTray();
            else if (!_exitInProgress) BeginInvoke(new Action(async () => await ExitLauncherAsync()));
            return;
        }
        base.OnFormClosing(e);
        if (e.Cancel) return;
        _closing = true; _stopRequested = true; _lifetime.Cancel(); metricsTimer.Stop();
        // Real Exit and Windows shutdown retain ownership cleanup; hiding in the tray never reaches this path.
        _serverProcess.ForceStopAndWait();
        ServerProcessManager.CleanupOrphanedManagedServers(_profileService.LoadAll());
    }

    private enum LauncherServerState
    {
        Offline,
        Starting,
        Online,
        Stopping,
        Restarting
    }
}
