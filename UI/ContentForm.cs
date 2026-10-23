using System.Diagnostics;
using System.Runtime.InteropServices;
using Server_Launcher.Models;
using Server_Launcher.Services;
using Server_Launcher.UI.Controls;

namespace Server_Launcher.UI;

internal sealed class ContentForm : Form
{
    // EASY-TO-TUNE CONTENT WINDOW DIMENSIONS AND REFRESH INTERVAL.
    private const int DialogWidth = 820;
    private const int DialogHeight = 660;
    private const int MinimumBodyHeight = 320;
    private const int StateRefreshIntervalMs = 1000;
    private readonly ServerProfile _profile;
    private readonly IServerBackend _backend;
    private readonly Func<bool> _isRunning;
    private readonly PluginManager _plugins = new();
    private readonly ModManager _mods = new();
    private readonly AddonManager _addons = new();
    private readonly WorldManager _worlds = new();
    private readonly ActionListBox _list = new();
    private readonly ModernButton _contentTab;
    private readonly ModernButton _worldsTab;
    private readonly ModernButton _done;
    private readonly ModernButton _install;
    private readonly Label _count;
    private readonly Label _status;
    private readonly Label _empty;
    private readonly TableLayoutPanel _contentToolbar;
    private readonly TableLayoutPanel _worldToolbar;
    private readonly List<ModernButton> _imports = new();
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = StateRefreshIntervalMs };
    private bool _worldMode;
    private bool _busy;
    private bool _lastRunning;
    private bool _refreshing;
    private string _activeWorldName = string.Empty;
    private string _operationCaption = string.Empty;
    private string? _feedback;
    private ServerContentKind Kind => _backend.ContentKind;
    private string ContentLabel => Kind switch { ServerContentKind.Mods => "Mods", ServerContentKind.Addons => "Add-ons", _ => "Plugins" };
    private bool Running => _isRunning() || ServerProcessManager.HasLiveManagedProcess(_profile);
    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam);

    public ContentForm(ServerProfile profile, Func<bool> isRunning)
    {
        _profile = profile; _backend = ServerBackends.Resolve(profile.ServerSoftware); _isRunning = isRunning;
        UiLayout.ConfigureDialog(this, "Content", new Size(DialogWidth, DialogHeight), new Size(620, 480));
        DoubleBuffered = true;
        var (body, footer) = UiLayout.DialogShell(this, "Server Launcher  /  Content", DragWindow);
        body.MinimumContentSize = new Size(0, MinimumBodyHeight);
        var layout = UiLayout.Grid(1, 7);
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var height in new[] { 36, 30, 42, 14, 42, 32, 0 })
            layout.RowStyles.Add(new RowStyle(height == 0 ? SizeType.Percent : SizeType.Absolute, height == 0 ? 100 : height));
        body.ContentControls.Add(layout);
        layout.Controls.Add(UiLayout.Label("Server content", 20f, Theme.Text, true), 0, 0);
        layout.Controls.Add(UiLayout.Label("Manage each item with the switch and delete button beside it.", 9f, Theme.Muted), 0, 1);
        var tabs = UiLayout.SpacedRow(2);
        _contentTab = UiLayout.Button(ContentLabel, Kind == ServerContentKind.Addons ? ModernIcon.Content : ModernIcon.Plugins);
        _worldsTab = UiLayout.Button("Worlds", ModernIcon.World);
        _contentTab.Click += (_, _) => SetMode(false); _worldsTab.Click += (_, _) => SetMode(true);
        tabs.Controls.Add(_contentTab, 0, 0); tabs.Controls.Add(_worldsTab, 2, 0); layout.Controls.Add(tabs, 0, 2);
        var toolbarHost = new Panel { Dock = DockStyle.Fill, Margin = Padding.Empty, BackColor = Theme.Background };
        _contentToolbar = UiLayout.SpacedRow(3);
        _install = Toolbar(_contentToolbar, 0, Kind == ServerContentKind.Addons ? "Install packs" : "Install JARs", ModernIcon.Plus, Install_Click, true);
        _imports.Add(_install);
        Toolbar(_contentToolbar, 1, "Open folder", ModernIcon.Folder, OpenFolder_Click);
        Toolbar(_contentToolbar, 2, "Refresh", ModernIcon.Refresh, (_, _) => RefreshContent());
        _worldToolbar = UiLayout.SpacedRow(4);
        _imports.Add(Toolbar(_worldToolbar, 0, "Import world", ModernIcon.Plus, ImportWorld_Click, true));
        _imports.Add(Toolbar(_worldToolbar, 1, "From folder", ModernIcon.Folder, ImportFolder_Click));
        Toolbar(_worldToolbar, 2, "Open folder", ModernIcon.Folder, OpenFolder_Click);
        Toolbar(_worldToolbar, 3, "Refresh", ModernIcon.Refresh, (_, _) => RefreshContent());
        toolbarHost.Controls.Add(_contentToolbar); toolbarHost.Controls.Add(_worldToolbar); layout.Controls.Add(toolbarHost, 0, 4);
        _count = UiLayout.Label(string.Empty, 8.5f, Theme.Subtle); layout.Controls.Add(_count, 0, 5);
        var card = new RoundedPanel { Dock = DockStyle.Fill, Padding = new Padding(8), Margin = Padding.Empty };
        _list.Dock = DockStyle.Fill; _list.BackColor = Theme.Surface; _list.SelectionMode = SelectionMode.MultiExtended;
        _list.ItemTitle = item => item switch { InstalledJar jar => jar.Name, InstalledWorld world => world.Name, InstalledAddon pack => pack.Name, _ => item.ToString() ?? string.Empty };
        _list.ItemDetail = item => item switch
        {
            InstalledJar jar => jar.Enabled ? "Enabled · loads on the next start" : "Disabled · data is preserved",
            InstalledWorld world => WorldDetail(world),
            InstalledAddon pack => (pack.Behavior ? "Behavior" : "Resources") + " " + pack.VersionLabel + (pack.Enabled ? " · Enabled" : " · Disabled"),
            _ => string.Empty
        };
        _list.ItemActions = Actions;
        _list.ActionInvoked += RowAction;
        _list.SelectedIndexChanged += (_, _) => { if (!_refreshing) UpdateSelectionCount(); };
        card.Controls.Add(_list);
        _empty = UiLayout.Label(string.Empty, 10f, Theme.Subtle); _empty.AutoEllipsis = false; _empty.TextAlign = ContentAlignment.MiddleCenter;
        card.Controls.Add(_empty); _empty.BringToFront(); layout.Controls.Add(card, 0, 6);
        footer.ColumnStyles.Clear(); footer.ColumnCount = 2;
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 88));
        _status = UiLayout.Label(string.Empty, 8f, Theme.Subtle); _status.AutoEllipsis = false; footer.Controls.Add(_status, 0, 0);
        _done = UiLayout.Button("Done"); _done.DialogResult = DialogResult.Cancel; _done.Click += (_, _) => Close(); CancelButton = _done;
        footer.Controls.Add(_done, 1, 0);
        _timer.Tick += (_, _) =>
        {
            var running = Running;
            if (running == _lastRunning) return;
            _feedback = null;
            UpdateState();
        };
        SetMode(false); ResumeLayout(true); _timer.Start();
    }
    private ModernButton Toolbar(TableLayoutPanel row, int column, string text, ModernIcon icon, EventHandler click, bool primary = false)
    {
        var button = UiLayout.Button(text, icon, primary); button.Click += click; row.Controls.Add(button, column * 2, 0); return button;
    }
    private string WorldDetail(InstalledWorld world)
    {
        if (world.IsActive) return _lastRunning ? "Active world · in use" : "Selected world · next start";
        if (world.IsActiveDimension) return "Dimension of " + _activeWorldName + (_lastRunning ? " · in use" : " · selected");
        return "Switch on to use this world on the next start";
    }
    private IReadOnlyList<ItemAction> Actions(object item)
    {
        var world = item as InstalledWorld;
        var enabled = item switch
        {
            InstalledJar jar => jar.Enabled,
            InstalledAddon pack => pack.Enabled,
            InstalledWorld w => w.IsActive || w.IsActiveDimension,
            _ => false
        };
        var worldProtected = world is not null && (world.IsActive || world.IsActiveDimension);
        string toggleLabel;
        string deleteLabel;
        if (_busy)
            toggleLabel = deleteLabel = "Wait for the current operation to finish";
        else if (_lastRunning)
        {
            toggleLabel = "Stop the running server before changing this item";
            deleteLabel = "Stop the running server before deleting this item";
        }
        else if (world is { IsActiveDimension: true })
        {
            toggleLabel = "This dimension follows " + _activeWorldName + "; choose another world to switch";
            deleteLabel = "Choose another world before deleting this selected dimension";
        }
        else if (world is { IsActive: true })
        {
            toggleLabel = "This world is already selected; import or choose another world to switch";
            deleteLabel = "Choose another world before deleting the selected world";
        }
        else
        {
            toggleLabel = world is not null ? "Use this world on the next start" : enabled ? "Disable this item" : "Enable this item";
            deleteLabel = "Delete this item";
        }
        var canChange = !_busy && !_lastRunning && !worldProtected;
        return new[]
        {
            new ItemAction("toggle", toggleLabel, ModernIcon.None, canChange, enabled),
            new ItemAction("delete", deleteLabel, ModernIcon.Trash, canChange)
        };
    }
    private void SetMode(bool worlds)
    {
        if (_busy) return;
        if (_worldMode != worlds) { _list.BeginUpdate(); try { _list.Items.Clear(); _list.TopIndex = 0; } finally { _list.EndUpdate(); } }
        _worldMode = worlds; _contentTab.IsActive = !worlds; _worldsTab.IsActive = worlds;
        _contentToolbar.Visible = !worlds; _worldToolbar.Visible = worlds;
        if (worlds) _worldToolbar.BringToFront(); else _contentToolbar.BringToFront();
        _feedback = null;
        RefreshContent();
    }
    private static string ContentKey(object item) => item switch
    {
        InstalledJar jar => "jar:" + (jar.Path.EndsWith(".disabled", StringComparison.OrdinalIgnoreCase) ? jar.Path[..^9] : jar.Path),
        InstalledWorld world => "world:" + world.FolderPath,
        InstalledAddon pack => "pack:" + pack.Id,
        _ => item.ToString() ?? string.Empty
    };
    private void RefreshContent()
    {
        if (IsDisposed || Disposing) return;
        var selected = _list.SelectedItems.Select(ContentKey).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var top = _list.TopIndex;
        var topKey = top < _list.Items.Count ? ContentKey(_list.Items[top]) : null;
        _refreshing = true;
        _list.BeginUpdate();
        try
        {
            _activeWorldName = _worlds.GetActiveWorld(_profile);
            var items = _worldMode ? _worlds.GetInstalledWorlds(_profile).Cast<object>().ToArray()
                : Kind == ServerContentKind.Addons ? _addons.GetInstalled(_profile).Cast<object>().ToArray()
                : (Kind == ServerContentKind.Mods ? _mods.GetContent(_profile) : _plugins.GetContent(_profile)).Cast<object>().ToArray();
            _list.Items.Clear();
            foreach (var item in items) _list.Items.Add(item);
            var restoredTop = -1;
            for (var index = 0; index < _list.Items.Count; index++)
            {
                var key = ContentKey(_list.Items[index]);
                if (selected.Contains(key)) _list.SetSelected(index, true);
                if (string.Equals(key, topKey, StringComparison.OrdinalIgnoreCase)) restoredTop = index;
            }
            _list.TopIndex = restoredTop >= 0 ? restoredTop : top;
        }
        catch (Exception ex) { UiFeedback.Error(this, ex.Message, "Content could not be loaded"); }
        finally { _list.EndUpdate(); _refreshing = false; }
        _empty.Text = _worldMode ? "No worlds found.\nImport a world archive or folder." : Kind switch
        {
            ServerContentKind.Mods => "No Fabric mods installed.\nSelect one or more server-compatible JARs.",
            ServerContentKind.Addons => "No add-ons installed.\nImport .mcpack, .mcaddon or ZIP packs.",
            _ => "No plugins installed.\nSelect one or more plugin JARs."
        };
        _empty.Visible = _list.Items.Count == 0; UpdateState();
    }
    private void UpdateState()
    {
        _lastRunning = Running;
        UpdateSelectionCount();
        foreach (var button in _contentToolbar.Controls.OfType<ModernButton>().Concat(_worldToolbar.Controls.OfType<ModernButton>())) button.Enabled = !_busy;
        foreach (var button in _imports) button.Enabled = !_busy && !_lastRunning;
        _contentTab.Enabled = _worldsTab.Enabled = _done.Enabled = !_busy;
        UpdateStatus();
        _list.Invalidate();
    }
    private void UpdateSelectionCount()
    {
        _count.Text = $"{_list.Items.Count} installed · {_list.SelectedItems.Count} selected";
        if (_worldMode || Kind == ServerContentKind.Addons) _count.Text += (_lastRunning ? " · Active: " : " · Selected: ") + _activeWorldName;
    }
    private void UpdateStatus()
    {
        if (_busy) { _status.Text = _operationCaption + "..."; return; }
        if (_lastRunning) { _status.Text = "Server running · Stop the server before changing or deleting content."; return; }
        if (!string.IsNullOrEmpty(_feedback)) { _status.Text = _feedback + " · Server stopped."; return; }
        _status.Text = _worldMode
            ? "Server stopped · Import or switch worlds. Choose another world before deleting the selected world or its dimensions."
            : Kind == ServerContentKind.Addons ? "Server stopped · Packs apply to the selected world. Ctrl/Shift selects paired packs."
            : "Server stopped · Enable, disable or delete content. Disabled JARs and their data are kept.";
    }
    private async Task RunOperationAsync(Action operation, string caption)
    {
        if (_busy) return;
        if (Running) { UpdateState(); return; }
        _busy = true; UseWaitCursor = true; _operationCaption = caption; _feedback = null; UpdateState();
        try
        {
            await Task.Run(operation);
            if (!IsDisposed && !Disposing) { RefreshContent(); _feedback = caption + " completed"; }
        }
        catch (Exception ex)
        {
            if (!IsDisposed && !Disposing)
            {
                RefreshContent(); _feedback = caption + " failed";
                UiFeedback.Error(this, ex.Message, caption + " failed");
            }
        }
        finally
        {
            _busy = false;
            if (!IsDisposed && !Disposing) { UseWaitCursor = false; UpdateState(); }
        }
    }
    private async Task RunBatchAsync(IEnumerable<string> paths, Action<string> operation, string caption)
    {
        var files = paths.ToArray(); var errors = new List<string>(); var completed = 0;
        await RunOperationAsync(() =>
        {
            foreach (var file in files) try { operation(file); completed++; } catch (Exception ex) { errors.Add(Path.GetFileName(file) + ": " + ex.Message); }
        }, caption);
        if (IsDisposed || Disposing) return;
        _feedback = $"{caption}: {completed} / {files.Length}";
        UpdateStatus();
        if (errors.Count > 0) { UiSoundService.PlayError(); LauncherNotifications.Error(string.Join("\n", errors)); ConfirmActionForm.ShowDetails(this, "Some items failed", "Completed items are applied. These items failed:", errors); }
    }
    private async void RowAction(object item, string action)
    {
        if (_busy) return;
        if (Running) { UpdateState(); return; }
        _lastRunning = false;
        if (!Actions(item).Any(candidate => candidate.Key == action && candidate.Enabled)) return;
        var packs = item is InstalledAddon chosen && _list.SelectedItems.Contains(chosen)
            ? _list.SelectedItems.OfType<InstalledAddon>().ToArray() : item is InstalledAddon single ? new[] { single } : Array.Empty<InstalledAddon>();
        if (action == "delete")
        {
            var names = packs.Length > 0 ? packs.Select(p => p.Name) : new[] { _list.ItemTitle!(item) };
            if (!ConfirmActionForm.Confirm(this, packs.Length > 1 ? "Delete selected packs?" : "Delete this item?",
                item is InstalledWorld ? "The world folder will be permanently removed." : item is InstalledAddon ? "Selected packs are removed and unlinked from every world on this server." : "The JAR is deleted. Its configuration and data folders are kept.", names, "Delete")) return;
            await RunOperationAsync(() =>
            {
                if (item is InstalledWorld world) _worlds.RemoveWorld(_profile, world.FolderPath);
                else if (item is InstalledAddon) _addons.Remove(_profile, packs.Select(p => p.Id));
                else if (item is InstalledJar jar) { if (Kind == ServerContentKind.Mods) _mods.RemoveMod(_profile, jar.Path); else _plugins.RemovePlugin(_profile, jar.Path); }
            }, "Delete item");
        }
        else if (action == "toggle")
        {
            await RunOperationAsync(() =>
            {
                if (item is InstalledWorld world) _worlds.SetActiveWorld(_profile, world.FolderPath);
                else if (item is InstalledAddon pack) _addons.SetEnabled(_profile, packs.Select(p => p.Id), !pack.Enabled);
                else if (item is InstalledJar jar) { if (Kind == ServerContentKind.Mods) _mods.SetEnabled(_profile, jar.Path, !jar.Enabled); else _plugins.SetEnabled(_profile, jar.Path, !jar.Enabled); }
            }, item is InstalledWorld ? "Select world" : "Change content state");
        }
    }
    private async void Install_Click(object? sender, EventArgs e)
    {
        if (_busy || Running) return;
        using var picker = new OpenFileDialog { Filter = Kind == ServerContentKind.Addons ? "Bedrock add-ons (*.mcpack;*.mcaddon;*.zip)|*.mcpack;*.mcaddon;*.zip" : "Java archives (*.jar)|*.jar", Multiselect = true, Title = "Select " + ContentLabel };
        if (picker.ShowDialog(this) != DialogResult.OK) return;
        if (Kind == ServerContentKind.Addons) await RunOperationAsync(() => _addons.InstallPackages(_profile, picker.FileNames), "Install add-ons");
        else await RunBatchAsync(picker.FileNames, path => { if (Kind == ServerContentKind.Mods) _mods.InstallMod(_profile, path); else _plugins.InstallPlugin(_profile, path); }, "Install " + ContentLabel.ToLowerInvariant());
    }
    private async void ImportWorld_Click(object? sender, EventArgs e)
    {
        if (_busy || Running) return;
        using var picker = new OpenFileDialog { Filter = _backend.WorldFormat == ServerWorldFormat.BedrockLevelDb ? "Bedrock worlds (*.mcworld;*.zip)|*.mcworld;*.zip" : "Java worlds (*.zip)|*.zip", Multiselect = true, Title = "Select world archives" };
        if (picker.ShowDialog(this) == DialogResult.OK) await RunBatchAsync(picker.FileNames, path => _worlds.InstallZip(_profile, path), "Import worlds");
    }
    private async void ImportFolder_Click(object? sender, EventArgs e)
    {
        if (_busy || Running) return;
        using var picker = new FolderBrowserDialog { Description = "Select a world folder containing level.dat", UseDescriptionForTitle = true };
        if (picker.ShowDialog(this) == DialogResult.OK) await RunBatchAsync(new[] { picker.SelectedPath }, path => _worlds.InstallFolder(_profile, path), "Import worlds");
    }
    private void OpenFolder_Click(object? sender, EventArgs e)
    {
        try { var folder = _worldMode ? _backend.GetWorldsRoot(_profile) : _backend.GetContentRoot(_profile); Directory.CreateDirectory(folder); Process.Start(new ProcessStartInfo { FileName = folder, UseShellExecute = true }); }
        catch (Exception ex) { UiFeedback.Error(this, ex.Message, "Folder could not be opened"); }
    }
    private void DragWindow(object? sender, MouseEventArgs e) { if (e.Button == MouseButtons.Left) { ReleaseCapture(); SendMessage(Handle, 0xA1, new IntPtr(2), IntPtr.Zero); } }
    protected override void OnFormClosing(FormClosingEventArgs e) { if (_busy && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; return; } base.OnFormClosing(e); }
    protected override void WndProc(ref Message message) { if (UiLayout.TryHandleResize(this, ref message)) return; base.WndProc(ref message); }
    protected override void Dispose(bool disposing) { if (disposing) _timer.Dispose(); base.Dispose(disposing); }
}
