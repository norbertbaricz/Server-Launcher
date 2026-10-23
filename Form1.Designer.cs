#nullable enable
using Server_Launcher.Core;
using Server_Launcher.UI.Controls;

namespace Server_Launcher;

partial class Form1
{
    private System.ComponentModel.IContainer? components;
    private Panel titleBar = null!;
    private HiddenScrollPanel sidebar = null!;
    private HiddenScrollPanel content = null!;
    private TableLayoutPanel bodyLayout = null!;
    private ActionListBox serverListBox = null!;
    private Label serverCountLabel = null!;
    private Label emptyServersLabel = null!;
    private ModernButton createServerButton = null!;
    private ModernButton pluginsNavButton = null!;
    private ModernButton settingsNavButton = null!;
    private ServerHeading serverNameLabel = null!;
    private StatusBadge statusValueLabel = null!;
    private Label ramValueLabel = null!;
    private Label ramLimitLabel = null!;
    private Label cpuValueLabel = null!;
    private HeaderBadge serverIpValueLabel = null!;
    private HeaderBadge serverPublicIpValueLabel = null!;
    private Label uptimeValueLabel = null!;
    private ModernButton startButton = null!;
    private ModernButton stopButton = null!;
    private ModernButton restartButton = null!;
    private ModernButton maximizeWindowButton = null!;
    private RoundedPanel consoleView = null!;
    private HiddenScrollRichTextBox consoleBox = null!;
    private Label consolePlaceholderLabel = null!;
    private ModernToggle followOutputToggle = null!;
    private TextBox commandBox = null!;
    private ModernButton sendButton = null!;
    private ToolTip uiToolTip = null!;
    private System.Windows.Forms.Timer metricsTimer = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _lifetime.Cancel();
            DisposeBackground();
            _lifetime.Dispose();
            components?.Dispose();
            _serverProcess.Dispose();
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        uiToolTip = new ToolTip(components) { AutoPopDelay = UiMetrics.ToolTipDurationMs };
        metricsTimer = new System.Windows.Forms.Timer(components);
        SuspendLayout();
        AutoScaleDimensions = new SizeF(UiMetrics.BaseDpi, UiMetrics.BaseDpi);
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = UiMetrics.Font();
        BackColor = Theme.Border;
        ForeColor = Theme.Text;
        Text = LauncherConfig.AppName;
        Icon = AppAssets.Icon;
        ShowIcon = true;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(UiMetrics.MinimumWindowWidth, UiMetrics.MinimumWindowHeight);
        ClientSize = new Size(UiMetrics.WindowWidth, UiMetrics.WindowHeight);
        FormBorderStyle = FormBorderStyle.None;
        DoubleBuffered = true;
        Padding = new Padding(1);

        // Explicit rows and columns remove the dependence on Dock/BringToFront order.
        var shell = UiLayout.Grid(1, 2);
        shell.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, UiMetrics.TitleBarHeight));
        shell.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        Controls.Add(shell);
        titleBar = BuildTitleBar();
        shell.Controls.Add(titleBar, 0, 0);
        bodyLayout = UiLayout.Grid(2, 1);
        bodyLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, UiMetrics.SidebarWidth));
        bodyLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        bodyLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        shell.Controls.Add(bodyLayout, 0, 1);
        sidebar = BuildSidebar();
        content = BuildContent();
        bodyLayout.Controls.Add(sidebar, 0, 0);
        bodyLayout.Controls.Add(content, 1, 0);

        metricsTimer.Interval = UiMetrics.MetricsRefreshMs;
        metricsTimer.Tick += metricsTimer_Tick;
        metricsTimer.Start();
        Resize += Form1_Resize;
        DpiChanged += (_, _) => ApplyResponsiveLayout();
        Shown += (_, _) => { UiLayout.FitToWorkingArea(this); ApplyResponsiveLayout(); };
        ResumeLayout(true);
    }

    private Panel BuildTitleBar()
    {
        var bar = UiLayout.Grid(3, 1, Theme.Sidebar);
        bar.Padding = new Padding(16, 0, 0, 0);
        bar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 30));
        bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        bar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, UiMetrics.WindowButtonWidth * 3));
        bar.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        bar.MouseDown += titleBar_MouseDown;
        var logo = new PictureBox
        {
            Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom,
            Margin = new Padding(0, 11, 10, 11), Image = AppAssets.CreateLogo()
        };
        logo.MouseDown += titleBar_MouseDown;
        logo.Disposed += (_, _) => logo.Image?.Dispose();
        bar.Controls.Add(logo, 0, 0);
        var title = UiLayout.Label(LauncherConfig.AppName, 9.5f, Theme.Muted, true);
        title.MouseDown += titleBar_MouseDown;
        bar.Controls.Add(title, 1, 0);
        var buttons = UiLayout.Grid(3, 1, Theme.Sidebar);
        UiLayout.EqualColumns(buttons, 3);
        buttons.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var minimize = CreateWindowButton(ModernIcon.Minimize, "Minimize");
        minimize.Click += (_, _) => WindowState = FormWindowState.Minimized;
        maximizeWindowButton = CreateWindowButton(ModernIcon.Maximize, "Maximize or restore");
        maximizeWindowButton.Click += (_, _) => ToggleMaximize();
        var close = CreateWindowButton(ModernIcon.Close, "Close launcher");
        close.HoverColor = Theme.CaptionCloseHover;
        close.Click += (_, _) => Close();
        buttons.Controls.Add(minimize, 0, 0);
        buttons.Controls.Add(maximizeWindowButton, 1, 0);
        buttons.Controls.Add(close, 2, 0);
        bar.Controls.Add(buttons, 2, 0);
        return bar;
    }

    private static ModernButton CreateWindowButton(ModernIcon icon, string accessibleName)
    {
        var button = UiLayout.Button(string.Empty, icon);
        button.NormalColor = Theme.Sidebar;
        button.HoverColor = Theme.SurfaceHover;
        button.ForeColor = Theme.Muted;
        button.Radius = 0;
        button.TabStop = false;
        button.AccessibleName = accessibleName;
        return button;
    }

    private HiddenScrollPanel BuildSidebar()
    {
        var panel = new HiddenScrollPanel
        {
            Dock = DockStyle.Fill, BackColor = Theme.Sidebar,
            Padding = new Padding(12, 16, 12, 16), Margin = Padding.Empty
        };
        var layout = UiLayout.Grid(1, 6, Theme.Sidebar);
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var height in new[] { 40, 0, 28, 48, 48, 66 })
            layout.RowStyles.Add(new RowStyle(height == 0 ? SizeType.Percent : SizeType.Absolute, height == 0 ? 100 : height));
        panel.ContentControls.Add(layout);
        var heading = UiLayout.Grid(2, 1, Theme.Sidebar);
        heading.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        heading.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 30));
        heading.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        heading.Controls.Add(UiLayout.Label("Servers", 12f, Theme.Text, true), 0, 0);
        serverCountLabel = UiLayout.Label("0", 9f, Theme.Subtle);
        serverCountLabel.TextAlign = ContentAlignment.MiddleRight;
        heading.Controls.Add(serverCountLabel, 1, 0);
        layout.Controls.Add(heading, 0, 0);

        var listHost = new Panel { Dock = DockStyle.Fill, BackColor = Theme.Sidebar, Margin = Padding.Empty };
        serverListBox = new ActionListBox { Dock = DockStyle.Fill, Margin = Padding.Empty };
        serverListBox.ItemTitle = item => ((Server_Launcher.Models.ServerProfile)item).Name;
        serverListBox.ItemDetail = item => { var profile = (Server_Launcher.Models.ServerProfile)item; return profile.ServerSoftware + " " + profile.MinecraftVersion; };
        serverListBox.ItemActions = ServerRowActions;
        serverListBox.ActionInvoked += ServerRowAction;
        serverListBox.SelectedIndexChanged += serverListBox_SelectedIndexChanged;
        listHost.Controls.Add(serverListBox);
        emptyServersLabel = UiLayout.Label("No servers yet.\nChoose PaperMC, Fabric or Bedrock.", 9f, Theme.Subtle);
        emptyServersLabel.TextAlign = ContentAlignment.TopLeft;
        emptyServersLabel.Padding = new Padding(8, 14, 8, 0);
        emptyServersLabel.AutoEllipsis = false;
        listHost.Controls.Add(emptyServersLabel);
        emptyServersLabel.BringToFront();
        layout.Controls.Add(listHost, 0, 1);
        layout.Controls.Add(UiLayout.Label("MANAGE", 8f, Theme.Subtle, true), 0, 2);
        pluginsNavButton = UiLayout.Button("Content", ModernIcon.Content);
        pluginsNavButton.LeftAligned = true;
        pluginsNavButton.Margin = new Padding(0, 3, 0, 3);
        pluginsNavButton.Click += pluginsNavButton_Click;
        layout.Controls.Add(pluginsNavButton, 0, 3);
        settingsNavButton = UiLayout.Button("Settings", ModernIcon.Settings);
        settingsNavButton.LeftAligned = true;
        settingsNavButton.Margin = new Padding(0, 3, 0, 3);
        settingsNavButton.Click += settingsNavButton_Click;
        layout.Controls.Add(settingsNavButton, 0, 4);
        createServerButton = UiLayout.Button("Create server", ModernIcon.Plus, primary: true);
        createServerButton.Margin = new Padding(0, 20, 0, 4);
        createServerButton.Click += createServerButton_Click;
        layout.Controls.Add(createServerButton, 0, 5);
        return panel;
    }

    private HiddenScrollPanel BuildContent()
    {
        var panel = new HiddenScrollPanel
        {
            Dock = DockStyle.Fill, BackColor = Theme.Background,
            Padding = new Padding(UiMetrics.ContentPadding), Margin = Padding.Empty
        };
        var layout = UiLayout.Grid(1, 4);
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var height in new[] { UiMetrics.HeaderHeight, UiMetrics.MetricsHeight, UiMetrics.ActionsHeight, 0 })
            layout.RowStyles.Add(new RowStyle(height == 0 ? SizeType.Percent : SizeType.Absolute, height == 0 ? 100 : height));
        panel.ContentControls.Add(layout);

        var header = UiLayout.Grid(2, 1);
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, UiMetrics.HeaderStatusWidth));
        header.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        serverNameLabel = new ServerHeading
        {
            Text = "No server selected", Dock = DockStyle.Fill, Margin = new Padding(0, 0, 12, 0)
        };
        header.Controls.Add(serverNameLabel, 0, 0);
        statusValueLabel = new StatusBadge
        {
            Text = "Offline", Dock = DockStyle.Fill, Margin = new Padding(0, (UiMetrics.HeaderHeight - HeaderBadge.LogicalHeight) / 2, 0, (UiMetrics.HeaderHeight - HeaderBadge.LogicalHeight) / 2)
        };
        header.Controls.Add(statusValueLabel, 1, 0);
        layout.Controls.Add(header, 0, 0);

        serverIpValueLabel = serverNameLabel.LanBadge;
        serverPublicIpValueLabel = serverNameLabel.WanBadge;
        serverIpValueLabel.Click += serverIpValueLabel_Click;
        serverPublicIpValueLabel.Click += serverIpValueLabel_Click;
        serverIpValueLabel.AccessibleName = "LAN server address; click to copy";
        serverPublicIpValueLabel.AccessibleName = "WAN public server address; click to copy";
        serverIpValueLabel.AccessibleRole = serverPublicIpValueLabel.AccessibleRole = AccessibleRole.PushButton;

        // Equal whole-pixel tracks align every metric card with its action button.
        var metrics = UiLayout.SpacedRow(3);
        metrics.Margin = new Padding(0, 0, 0, 12);
        var cpu = CreateMetricCard("CPU USAGE", "Server process", out cpuValueLabel, out _);
        var memory = CreateMetricCard("PROCESS MEMORY", "Heap limit: —", out ramValueLabel, out ramLimitLabel);
        var uptime = CreateMetricCard("UPTIME", "Current session", out uptimeValueLabel, out _);
        var cards = new[] { cpu, memory, uptime };
        for (var i = 0; i < cards.Length; i++)
        {
            cards[i].Margin = Padding.Empty;
            metrics.Controls.Add(cards[i], i * 2, 0);
        }
        layout.Controls.Add(metrics, 0, 1);

        var actions = UiLayout.SpacedRow(3);
        actions.Margin = new Padding(0, 0, 0, UiMetrics.Gap);
        startButton = UiLayout.Button("Start", ModernIcon.Play, primary: true);
        stopButton = UiLayout.Button("Stop", ModernIcon.Stop);
        stopButton.NormalColor = Theme.DangerSurface;
        stopButton.HoverColor = Theme.Blend(Theme.DangerSurface, Theme.Danger, 0.2f);
        restartButton = UiLayout.Button("Restart", ModernIcon.Restart);
        startButton.Click += startButton_Click;
        stopButton.Click += stopButton_Click;
        restartButton.Click += restartButton_Click;
        var buttons = new[] { startButton, stopButton, restartButton };
        for (var i = 0; i < buttons.Length; i++)
        {
            buttons[i].Margin = Padding.Empty;
            actions.Controls.Add(buttons[i], i * 2, 0);
        }
        layout.Controls.Add(actions, 0, 2);
        consoleView = BuildConsoleView();
        layout.Controls.Add(consoleView, 0, 3);
        return panel;
    }

    private static RoundedPanel CreateMetricCard(string caption, string detail, out Label valueLabel, out Label detailLabel)
    {
        var card = new RoundedPanel { Dock = DockStyle.Fill, Padding = new Padding(14, 8, 14, 8) };
        var layout = UiLayout.Grid(1, 3, Theme.Surface);
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 20));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 18));
        layout.Controls.Add(UiLayout.Label(caption, 8f, Theme.Muted, true), 0, 0);
        valueLabel = UiLayout.Label("—", 17f, Theme.Text, true);
        layout.Controls.Add(valueLabel, 0, 1);
        detailLabel = UiLayout.Label(detail, 8f, Theme.Subtle);
        layout.Controls.Add(detailLabel, 0, 2);
        card.Controls.Add(layout);
        return card;
    }

    private RoundedPanel BuildConsoleView()
    {
        var view = new RoundedPanel
        {
            Dock = DockStyle.Fill, BackColor = Theme.Console,
            Padding = new Padding(12), Margin = Padding.Empty
        };
        var layout = UiLayout.Grid(1, 3, Theme.Console);
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        view.Controls.Add(layout);
        var toolbar = UiLayout.Grid(3, 1, Theme.Console);
        toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 152));
        toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 44));
        toolbar.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        toolbar.Controls.Add(UiLayout.Label("Live console", 9.5f, Theme.Text, true), 0, 0);
        followOutputToggle = new ModernToggle
        {
            Text = "Follow output", Checked = true, WrapText = false, Dock = DockStyle.Fill,
            ForeColor = Theme.Muted, Font = UiMetrics.Font(8.5f),
            Margin = Padding.Empty, AccessibleName = "Automatically scroll to new console output"
        };
        followOutputToggle.CheckedChanged += (_, _) =>
        {
            if (followOutputToggle.Checked) { consoleBox.Select(consoleBox.TextLength, 0); consoleBox.ScrollToCaret(); }
        };
        toolbar.Controls.Add(followOutputToggle, 1, 0);
        var clear = UiLayout.Button(string.Empty, ModernIcon.Clear);
        clear.AccessibleName = "Clear console";
        uiToolTip.SetToolTip(clear, "Clear console");
        clear.Font = UiMetrics.Font(8.5f);
        clear.Margin = new Padding(8, 2, 0, 2);
        clear.Click += (_, _) => { consoleBox.Clear(); UpdateConsolePlaceholder(); };
        toolbar.Controls.Add(clear, 2, 0);
        layout.Controls.Add(toolbar, 0, 0);

        var logHost = new Panel
        {
            Dock = DockStyle.Fill, BackColor = Theme.Console,
            Margin = Padding.Empty, Padding = new Padding(0, 6, 0, 8)
        };
        consoleBox = new HiddenScrollRichTextBox
        {
            Dock = DockStyle.Fill, BackColor = Theme.Console, ForeColor = Theme.Text,
            Font = UiMetrics.Font(9.5f), ReadOnly = true,
            AccessibleName = "Minecraft server output"
        };
        logHost.Controls.Add(consoleBox);
        consolePlaceholderLabel = UiLayout.Label("Create or select a server to get started.", 11f, Theme.Subtle);
        consolePlaceholderLabel.TextAlign = ContentAlignment.MiddleCenter;
        consolePlaceholderLabel.AutoEllipsis = false;
        logHost.Controls.Add(consolePlaceholderLabel);
        consolePlaceholderLabel.BringToFront();
        layout.Controls.Add(logHost, 0, 1);

        var commandRow = UiLayout.Grid(2, 1, Theme.Console);
        commandRow.Padding = new Padding(0, 8, 0, 0);
        commandRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        commandRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100));
        commandRow.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var commandHost = new ModernTextBoxHost { Dock = DockStyle.Fill, Margin = new Padding(0, 0, 8, 0) };
        commandBox = commandHost.TextBox;
        commandBox.PlaceholderText = "Enter a server command, e.g. list";
        commandBox.AccessibleName = "Server command";
        commandBox.KeyDown += commandBox_KeyDown;
        sendButton = UiLayout.Button("Send", ModernIcon.Send, primary: true);
        sendButton.Click += sendButton_Click;
        commandRow.Controls.Add(commandHost, 0, 0);
        commandRow.Controls.Add(sendButton, 1, 0);
        layout.Controls.Add(commandRow, 0, 2);
        return view;
    }
}
