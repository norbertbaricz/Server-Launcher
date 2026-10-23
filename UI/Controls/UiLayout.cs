using System.Runtime.InteropServices;
using Server_Launcher.Core;

namespace Server_Launcher.UI.Controls;

internal static class UiMetrics
{
    // All dimensions are logical pixels at 100% scaling. Tune the UI here.
    public const int BaseDpi = 96;
    public const string FontFamily = "Segoe UI";
    public const string HeadingFontFamily = "Segoe UI Semibold";
    public const int WindowWidth = 1280;
    public const int WindowHeight = 720;
    public const int MinimumWindowWidth = 800;
    public const int MinimumWindowHeight = 560;
    public const int CompactBreakpoint = 1120;
    public const int SidebarWidth = 320;
    public const int CompactSidebarWidth = 272;
    public const int ContentPadding = 24;
    public const int CompactContentPadding = 16;
    public const int MinimumContentWidth = 480;
    public const int MinimumContentHeight = 400;
    public const int MinimumSidebarHeight = 380;
    public const int HeaderHeight = 56;
    public const int MetricsHeight = 100;
    public const int ActionsHeight = 54;
    public const int MetricsRefreshMs = 1000;
    public const int ToolTipDurationMs = 10000;
    public const int TitleBarHeight = 44;
    public const int WindowButtonWidth = 46;
    public const int WindowGlyphSize = 10;
    public const int HeaderStatusWidth = 112;
    public const int ButtonContentPadding = 12;
    public const int ButtonIconSize = 18;
    public const int ButtonIconGap = 8;
    public const int ResizeBorder = 7;
    public const int Gap = 12;
    public const int SmallGap = 8;
    public const int ControlHeight = 42;
    public const int FieldHeight = 80;
    public const int MemorySliderHeight = 74;
    public const int CardRadius = 12;
    public const int ControlRadius = 8;
    public const int DialogFooterHeight = 76;

    public static int Scale(Control control, int value) =>
        (int)Math.Round(value * control.DeviceDpi / (double)BaseDpi);

    public static Font Font(float size = 10f, bool heading = false) =>
        new(heading ? HeadingFontFamily : FontFamily, size, FontStyle.Regular, GraphicsUnit.Point);

}

internal static class UiLayout
{
    private const int WmNcHitTest = 0x0084;
    private const int HtClient = 1;

    public static TableLayoutPanel Grid(int columns, int rows, Color? background = null)
    {
        return new BufferedTableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = columns,
            RowCount = rows,
            GrowStyle = TableLayoutPanelGrowStyle.FixedSize,
            BackColor = background ?? Theme.Background,
            Padding = Padding.Empty,
            Margin = Padding.Empty
        };
    }

    public static void EqualColumns(TableLayoutPanel grid, int count)
    {
        for (var i = 0; i < count; i++)
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / count));
    }

    // Dedicated spacer columns keep the actual card/button widths equal, including at the edges.
    public static TableLayoutPanel SpacedRow(int count, Color? background = null)
    {
        var row = new EqualColumnsLayoutPanel(count)
        {
            Dock = DockStyle.Fill, ColumnCount = count * 2 - 1, RowCount = 1,
            GrowStyle = TableLayoutPanelGrowStyle.FixedSize,
            BackColor = background ?? Theme.Background, Padding = Padding.Empty, Margin = Padding.Empty
        };
        row.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        for (var i = 0; i < count; i++)
        {
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / count));
            if (i < count - 1)
                row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, UiMetrics.Gap));
        }
        return row;
    }

    public static Label Label(string text, float size = 10f, Color? color = null, bool heading = false)
    {
        return new Label
        {
            Text = text,
            Dock = DockStyle.Fill,
            Margin = Padding.Empty,
            Font = UiMetrics.Font(size, heading),
            ForeColor = color ?? Theme.Text,
            TextAlign = ContentAlignment.MiddleLeft,
            AutoEllipsis = true,
            UseMnemonic = false
        };
    }

    public static ModernButton Button(string text, ModernIcon icon = ModernIcon.None, bool primary = false)
    {
        return new ModernButton
        {
            Text = text,
            IconKind = icon,
            Dock = DockStyle.Fill,
            Height = UiMetrics.ControlHeight,
            Margin = Padding.Empty,
            NormalColor = primary ? Theme.AccentFill : Theme.SurfaceElevated,
            HoverColor = primary ? Theme.AccentFillHover : Theme.SurfaceHover
        };
    }

    public static void ConfigureDialog(Form form, string title, Size size, Size minimumSize)
    {
        form.SuspendLayout();
        form.AutoScaleDimensions = new SizeF(UiMetrics.BaseDpi, UiMetrics.BaseDpi);
        form.AutoScaleMode = AutoScaleMode.Dpi;
        form.Text = title;
        form.Icon = AppAssets.Icon;
        form.StartPosition = FormStartPosition.CenterParent;
        form.FormBorderStyle = FormBorderStyle.None;
        form.BackColor = Theme.Border;
        form.ForeColor = Theme.Text;
        form.Font = UiMetrics.Font();
        form.ClientSize = size;
        form.MinimumSize = minimumSize;
        form.Padding = new Padding(1);
        form.ShowInTaskbar = false;
        form.Shown += (_, _) => FitToWorkingArea(form);
    }

    public static (HiddenScrollPanel Body, TableLayoutPanel Footer) DialogShell(
        Form form, string caption, MouseEventHandler dragWindow)
    {
        var shell = Grid(1, 3);
        shell.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, UiMetrics.TitleBarHeight));
        shell.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, UiMetrics.DialogFooterHeight));
        form.Controls.Add(shell);

        var bar = Grid(2, 1, Theme.Sidebar);
        bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        bar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, UiMetrics.WindowButtonWidth * 2));
        bar.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        bar.Padding = new Padding(UiMetrics.ContentPadding, 0, 0, 0);
        bar.MouseDown += (_, e) => { if (e.Clicks > 1) ToggleDialogMaximize(form); else dragWindow(bar, e); };
        var title = Label(caption, 9f, Theme.Muted, true);
        title.MouseDown += (_, e) => { if (e.Clicks > 1) ToggleDialogMaximize(form); else dragWindow(title, e); };
        bar.Controls.Add(title, 0, 0);
        var chrome = Grid(2, 1, Theme.Sidebar);
        EqualColumns(chrome, 2);
        chrome.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var maximize = Button(string.Empty, ModernIcon.Maximize);
        maximize.Radius = 0;
        maximize.NormalColor = Theme.Sidebar;
        maximize.TabStop = false;
        maximize.AccessibleName = "Maximize or restore window";
        maximize.Click += (_, _) => ToggleDialogMaximize(form);
        form.SizeChanged += (_, _) => maximize.IconKind = form.WindowState == FormWindowState.Maximized ? ModernIcon.Restore : ModernIcon.Maximize;
        chrome.Controls.Add(maximize, 0, 0);
        var close = Button(string.Empty, ModernIcon.Close);
        close.Radius = 0;
        close.NormalColor = Theme.Sidebar;
        close.HoverColor = Theme.CaptionCloseHover;
        close.AccessibleName = "Close window";
        close.TabStop = false;
        close.Click += (_, _) => form.Close();
        chrome.Controls.Add(close, 1, 0);
        bar.Controls.Add(chrome, 1, 0);
        shell.Controls.Add(bar, 0, 0);

        var body = new HiddenScrollPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Background,
            Padding = new Padding(UiMetrics.ContentPadding),
            Margin = Padding.Empty
        };
        shell.Controls.Add(body, 0, 1);

        var footer = Grid(3, 1);
        footer.Padding = new Padding(UiMetrics.ContentPadding, 16, UiMetrics.ContentPadding, 16);
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 116));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 168));
        footer.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        shell.Controls.Add(footer, 0, 2);
        return (body, footer);
    }

    public static TableLayoutPanel Stack(params int[] rowHeights)
    {
        var grid = Grid(1, rowHeights.Length);
        grid.Dock = DockStyle.Top;
        grid.Height = rowHeights.Sum();
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var height in rowHeights)
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
        return grid;
    }

    public static Panel Field(string caption, Control input, string? hint = null, int inputHeight = UiMetrics.ControlHeight)
    {
        var field = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Background,
            Margin = Padding.Empty
        };
        var grid = Grid(1, hint is null ? 2 : 3);
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 26));
        grid.RowStyles.Add(new RowStyle(SizeType.Absolute, inputHeight));
        if (hint is not null)
            grid.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        grid.Controls.Add(Label(caption, 9f, Theme.Muted, true), 0, 0);
        if (string.IsNullOrWhiteSpace(input.AccessibleName)) input.AccessibleName = caption;
        input.Dock = DockStyle.Fill;
        input.Margin = Padding.Empty;
        grid.Controls.Add(input, 0, 1);
        if (hint is not null)
            grid.Controls.Add(Label(hint, 8.5f, Theme.Subtle), 0, 2);
        field.Controls.Add(grid);
        return field;
    }

    public static void FitToWorkingArea(Form form)
    {
        var area = Screen.FromControl(form.Owner ?? form).WorkingArea;
        form.MinimumSize = new Size(Math.Min(form.MinimumSize.Width, area.Width),
            Math.Min(form.MinimumSize.Height, area.Height));
        var width = Math.Min(form.Width, area.Width);
        var height = Math.Min(form.Height, area.Height);
        var x = Math.Clamp(form.Left, area.Left, area.Right - width);
        var y = Math.Clamp(form.Top, area.Top, area.Bottom - height);
        form.Bounds = new Rectangle(x, y, width, height);
    }

    private static void ToggleDialogMaximize(Form form) => form.WindowState =
        form.WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;

    [StructLayout(LayoutKind.Sequential)]
    private struct MinMaxInfo
    {
        public Point Reserved;
        public Point MaxSize;
        public Point MaxPosition;
        public Point MinTrackSize;
        public Point MaxTrackSize;
    }

    public static bool TryHandleResize(Form form, ref Message message)
    {
        // Borderless maximized windows must respect the current monitor's taskbar/work area.
        if (message.Msg == 0x0024 && message.LParam != IntPtr.Zero)
        {
            var screen = Screen.FromHandle(form.Handle);
            var info = Marshal.PtrToStructure<MinMaxInfo>(message.LParam);
            info.MaxPosition = new Point(screen.WorkingArea.Left - screen.Bounds.Left, screen.WorkingArea.Top - screen.Bounds.Top);
            info.MaxSize = new Point(screen.WorkingArea.Width, screen.WorkingArea.Height);
            info.MinTrackSize = new Point(form.MinimumSize.Width, form.MinimumSize.Height);
            Marshal.StructureToPtr(info, message.LParam, false);
            message.Result = IntPtr.Zero;
            return true;
        }
        if (message.Msg != WmNcHitTest || form.WindowState != FormWindowState.Normal)
            return false;

        var packed = message.LParam.ToInt64();
        var point = form.PointToClient(new Point((short)(packed & 0xffff), (short)((packed >> 16) & 0xffff)));
        var border = UiMetrics.Scale(form, UiMetrics.ResizeBorder);
        var left = point.X < border;
        var right = point.X >= form.ClientSize.Width - border;
        var top = point.Y < border;
        var bottom = point.Y >= form.ClientSize.Height - border;
        var hit = left && top ? 13 : right && top ? 14 : left && bottom ? 16 :
            right && bottom ? 17 : left ? 10 : right ? 11 : top ? 12 : bottom ? 15 : HtClient;
        if (hit == HtClient)
            return false;

        message.Result = (IntPtr)hit;
        return true;
    }
}

internal sealed class EqualColumnsLayoutPanel(int count) : BufferedTableLayoutPanel
{
    // Whole-pixel widths stay identical; any indivisible remainder sits at the outside edges.
    private bool _arranging;
    protected override void OnLayout(LayoutEventArgs e)
    {
        if (!_arranging && ColumnStyles.Count == count * 2 - 1 && count > 0)
        {
            _arranging = true;
            SuspendLayout();
            try
            {
                var gap = UiMetrics.Scale(this, UiMetrics.Gap);
                var available = Math.Max(0, ClientSize.Width - gap * (count - 1));
                var width = available / count;
                var remainder = available - width * count;
                var padding = new Padding(remainder / 2, 0, remainder - remainder / 2, 0);
                if (Padding != padding) Padding = padding;
                for (var i = 0; i < ColumnStyles.Count; i++)
                {
                    var target = i % 2 == 0 ? width : gap;
                    ColumnStyles[i].SizeType = SizeType.Absolute;
                    if (ColumnStyles[i].Width != target) ColumnStyles[i].Width = target;
                }
            }
            finally { ResumeLayout(false); _arranging = false; }
        }
        base.OnLayout(e);
    }
}

internal class BufferedTableLayoutPanel : TableLayoutPanel
{
    public BufferedTableLayoutPanel()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }
}
