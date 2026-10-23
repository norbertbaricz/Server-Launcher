using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace Server_Launcher.UI.Controls;

internal static class Theme
{
    // EASY-TO-TUNE COLORS: surfaces, one accent, and semantic status colors.
    public static readonly Color Background = Color.FromArgb(17, 20, 27);
    public static readonly Color Sidebar = Color.FromArgb(21, 25, 33);
    public static readonly Color Surface = Color.FromArgb(26, 31, 41);
    public static readonly Color SurfaceElevated = Color.FromArgb(33, 40, 52);
    public static readonly Color SurfaceHover = Color.FromArgb(43, 52, 68);
    public static readonly Color Border = Color.FromArgb(47, 56, 72);
    public static readonly Color Accent = Color.FromArgb(116, 174, 255);
    public static readonly Color AccentHover = Color.FromArgb(148, 193, 255);
    public static readonly Color AccentFill = Color.FromArgb(43, 98, 186);
    public static readonly Color AccentFillHover = Color.FromArgb(54, 116, 211);
    public static readonly Color Text = Color.FromArgb(237, 241, 248);
    public static readonly Color Muted = Color.FromArgb(173, 185, 203);
    public static readonly Color Subtle = Color.FromArgb(137, 151, 173);
    public static readonly Color Success = Color.FromArgb(101, 218, 163);
    public static readonly Color Danger = Color.FromArgb(248, 132, 146);
    public static readonly Color DangerSurface = Color.FromArgb(76, 38, 49);
    public static readonly Color Warning = Color.FromArgb(239, 195, 112);
    public static readonly Color Console = Color.FromArgb(13, 17, 24);
    public static readonly Color CaptionCloseHover = Color.FromArgb(232, 17, 35);

    public static GraphicsPath RoundedRect(Rectangle rect, int radius)
    {
        var path = new GraphicsPath();
        if (rect.Width <= 0 || rect.Height <= 0)
            return path;

        var safeRadius = Math.Min(Math.Max(0, radius), Math.Min(rect.Width, rect.Height) / 2);
        if (safeRadius == 0)
        {
            path.AddRectangle(rect);
            return path;
        }

        var diameter = safeRadius * 2;
        var arc = new Rectangle(rect.X, rect.Y, diameter, diameter);
        path.AddArc(arc, 180, 90);
        arc.X = rect.Right - diameter;
        path.AddArc(arc, 270, 90);
        arc.Y = rect.Bottom - diameter;
        path.AddArc(arc, 0, 90);
        arc.X = rect.Left;
        path.AddArc(arc, 90, 90);
        path.CloseFigure();
        return path;
    }

    public static Color Blend(Color a, Color b, float amount)
    {
        amount = Math.Clamp(amount, 0f, 1f);
        return Color.FromArgb(
            (int)(a.A + (b.A - a.A) * amount),
            (int)(a.R + (b.R - a.R) * amount),
            (int)(a.G + (b.G - a.G) * amount),
            (int)(a.B + (b.B - a.B) * amount));
    }
}

internal enum ModernIcon
{
    None, Console, Content, Plugins, World, Edit, Plus, Play, Stop, Restart, Send, Folder, Trash, Refresh, Settings,
    Clear, Save, Minimize, Maximize, Restore, Close
}

internal class RoundedPanel : Panel
{
    public int Radius { get; set; } = UiMetrics.CardRadius;
    public Color BorderColor { get; set; } = Theme.Border;
    public bool DrawBorder { get; set; } = true;

    public RoundedPanel()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
            ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        BackColor = Theme.Surface;
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        // Keep the original region-free painting to avoid ghost borders over RDP / high DPI.
        e.Graphics.Clear(Parent?.BackColor ?? Theme.Background);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = new Rectangle(0, 0, Math.Max(1, Width - 1), Math.Max(1, Height - 1));
        using var path = Theme.RoundedRect(rect, UiMetrics.Scale(this, Radius));
        using var brush = new SolidBrush(BackColor);
        e.Graphics.FillPath(brush, path);
        if (DrawBorder)
        {
            using var pen = new Pen(BorderColor) { Alignment = PenAlignment.Inset };
            e.Graphics.DrawPath(pen, path);
        }
        base.OnPaint(e);
    }
}

internal sealed class ModernButton : Control, IButtonControl
{
    private bool _mouseInside;
    private bool _pressed;
    private bool _keyActivation;
    private bool _keyboardFocus;
    private bool _isActive;

    public Color NormalColor { get; set; } = Theme.SurfaceElevated;
    public Color HoverColor { get; set; } = Theme.SurfaceHover;
    public Color ActiveColor { get; set; } = Theme.AccentFill;
    public int Radius { get; set; } = UiMetrics.ControlRadius;
    private ModernIcon _iconKind;
    public ModernIcon IconKind
    {
        get => _iconKind;
        set { if (_iconKind == value) return; _iconKind = value; Invalidate(); }
    }
    public bool LeftAligned { get; set; }
    public DialogResult DialogResult { get; set; }
    public bool IsActive
    {
        get => _isActive;
        set { if (_isActive == value) return; _isActive = value; Invalidate(); }
    }

    public ModernButton()
    {
        // A plain owner-drawn Control avoids Button's native rectangular hover/default borders.
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
            ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
            ControlStyles.Selectable, true);
        SetStyle(ControlStyles.StandardClick | ControlStyles.StandardDoubleClick, false);
        BackColor = Theme.Background;
        ForeColor = Theme.Text;
        Cursor = Cursors.Hand;
        Font = UiMetrics.Font(9.5f, true);
        TabStop = true;
        AccessibleRole = AccessibleRole.PushButton;

    }

    public void NotifyDefault(bool value) => Invalidate();
    public void PerformClick() { if (Enabled && CanSelect) OnClick(EventArgs.Empty); }

    protected override void OnClick(EventArgs e)
    {
        if (!Enabled) return;
        if (DialogResult != DialogResult.None && FindForm() is Form form)
            form.DialogResult = DialogResult;
        base.OnClick(e);
    }
    protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); _mouseInside = true; Invalidate(); }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); _mouseInside = false; Invalidate(); }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left || !Enabled) return;
        _keyboardFocus = false; _pressed = true; Focus(); Capture = true; Invalidate();
    }
    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (Capture) { var pressed = ClientRectangle.Contains(e.Location); if (_pressed != pressed) { _pressed = pressed; Invalidate(); } }
    }
    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (e.Button != MouseButtons.Left) return;
        var activate = Capture && Enabled && ClientRectangle.Contains(e.Location);
        _pressed = false; Capture = false; Invalidate();
        if (activate) PerformClick();
    }
    protected override void OnMouseCaptureChanged(EventArgs e) { base.OnMouseCaptureChanged(e); if (!Capture) { _pressed = false; Invalidate(); } }
    protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); _keyboardFocus = MouseButtons == MouseButtons.None; Invalidate(); }
    protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); _pressed = false; _keyActivation = false; Invalidate(); }
    protected override void OnEnabledChanged(EventArgs e) { base.OnEnabledChanged(e); _pressed = false; Invalidate(); }
    protected override void OnMouseWheel(MouseEventArgs e) => HiddenScrollPanel.ForwardMouseWheel(this, e);
    protected override bool IsInputKey(Keys keyData) => (keyData & Keys.KeyCode) is Keys.Space or Keys.Enter || base.IsInputKey(keyData);
    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (e.KeyCode is not (Keys.Space or Keys.Enter)) return;
        _keyboardFocus = true;
        if (!_keyActivation)
        {
            _keyActivation = true; _pressed = true;
            if (e.KeyCode == Keys.Enter) PerformClick();
        }
        e.Handled = true; e.SuppressKeyPress = true; Invalidate();
    }
    protected override void OnKeyUp(KeyEventArgs e)
    {
        base.OnKeyUp(e);
        if (e.KeyCode is not (Keys.Space or Keys.Enter)) return;
        var activate = _keyActivation && e.KeyCode == Keys.Space;
        _keyActivation = false; _pressed = false; Invalidate();
        if (activate) PerformClick();
        e.Handled = true; e.SuppressKeyPress = true;
    }

    protected override void OnPaintBackground(PaintEventArgs e) => e.Graphics.Clear(Parent?.BackColor ?? Theme.Background);
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = new Rectangle(0, 0, Math.Max(1, Width - 1), Math.Max(1, Height - 1));
        var normal = IsActive ? ActiveColor : NormalColor;
        var hover = IsActive ? Theme.AccentFillHover : HoverColor;
        var current = Enabled ? (_mouseInside ? hover : normal) : Theme.Blend(normal, Theme.Background, 0.50f);
        if (_pressed && Enabled) current = Theme.Blend(current, Theme.Background, 0.18f);
        using var path = Theme.RoundedRect(rect, UiMetrics.Scale(this, Radius));
        using var brush = new SolidBrush(current);
        if (Radius <= 0) e.Graphics.FillRectangle(brush, ClientRectangle);
        else e.Graphics.FillPath(brush, path);
        // Keyboard focus is indicated inside the button, without an outline around it.
        if (Focused && _keyboardFocus && ShowFocusCues && Enabled)
        {
            using var focus = new Pen(Theme.Accent, Math.Max(1, DeviceDpi / 96f * 2))
                { StartCap = LineCap.Round, EndCap = LineCap.Round };
            var inset = UiMetrics.Scale(this, 12);
            e.Graphics.DrawLine(focus, inset, Height - UiMetrics.Scale(this, 4), Math.Max(inset, Width - inset), Height - UiMetrics.Scale(this, 4));
        }
        var foreground = Enabled ? ForeColor : Theme.Subtle;
        if (ModernIconPainter.IsCaption(IconKind))
        {
            if (IconKind == ModernIcon.Close && (_mouseInside || _pressed)) foreground = Color.White;
            ModernIconPainter.DrawCaption(e.Graphics, ClientRectangle, IconKind, foreground, DeviceDpi);
            return;
        }
        var padding = UiMetrics.Scale(this, UiMetrics.ButtonContentPadding);
        var iconSize = UiMetrics.Scale(this, UiMetrics.ButtonIconSize);
        var gap = UiMetrics.Scale(this, UiMetrics.ButtonIconGap);
        var hasText = !string.IsNullOrEmpty(Text);
        var iconWidth = IconKind == ModernIcon.None ? 0 : iconSize + (hasText ? gap : 0);
        var flags = TextFormatFlags.NoPadding | TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix;
        var textWidth = hasText ? TextRenderer.MeasureText(e.Graphics, Text, Font, Size.Empty, flags).Width : 0;
        var available = Math.Max(0, Width - padding * 2);
        // Icon-only buttons use the actual glyph width, even in a compact toolbar.
        var contentWidth = hasText ? Math.Min(available, textWidth + iconWidth) : Math.Min(Width, iconWidth);
        var x = LeftAligned ? padding : (Width - contentWidth) / 2;
        if (IconKind != ModernIcon.None)
        {
            ModernIconPainter.DrawCentered(e.Graphics, new Rectangle(x, 0, iconSize, Height), IconKind, foreground, iconSize);
            x += iconWidth;
        }
        if (hasText)
            TextRenderer.DrawText(e.Graphics, Text, Font, new Rectangle(x, 0, Math.Max(1, contentWidth - iconWidth), Height), foreground,
                flags | TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
    }

    protected override AccessibleObject CreateAccessibilityInstance() => new ButtonAccessibleObject(this);
    private sealed class ButtonAccessibleObject(ModernButton owner) : ControlAccessibleObject(owner)
    {
        public override string? DefaultAction => "Press";
        public override void DoDefaultAction() => owner.PerformClick();
    }
}

internal sealed class ModernTextBoxHost : RoundedPanel
{
    // Native single-line text uses its real font height, centered inside the outer card.
    private const int HorizontalInset = 12;
    public TextBox TextBox { get; } = new HiddenScrollTextBox();

    public ModernTextBoxHost()
    {
        Radius = UiMetrics.ControlRadius;
        BackColor = Theme.SurfaceElevated;
        Padding = Padding.Empty;
        Height = UiMetrics.ControlHeight;
        MinimumSize = new Size(0, UiMetrics.ControlHeight);
        TextBox.Dock = DockStyle.None;
        TextBox.AutoSize = true;
        TextBox.Multiline = false;
        TextBox.BorderStyle = BorderStyle.None;
        TextBox.BackColor = Theme.SurfaceElevated;
        TextBox.ForeColor = Theme.Text;
        TextBox.Font = UiMetrics.Font();
        TextBox.Margin = Padding.Empty;
        Controls.Add(TextBox);
        TextBox.FontChanged += (_, _) => PerformLayout();
        TextBox.Enter += (_, _) => { BorderColor = Theme.Accent; Invalidate(); };
        TextBox.Leave += (_, _) => { BorderColor = Theme.Border; Invalidate(); };
    }
    protected override void OnLayout(LayoutEventArgs e)
    {
        base.OnLayout(e);
        if (TextBox is null) return;
        var inset = UiMetrics.Scale(this, HorizontalInset);
        var height = TextBox.PreferredHeight;
        TextBox.SetBounds(inset, Math.Max(0, (ClientSize.Height - height) / 2), Math.Max(1, ClientSize.Width - inset * 2), height);
    }
    protected override void OnDpiChangedAfterParent(EventArgs e) { base.OnDpiChangedAfterParent(e); PerformLayout(); }
}

internal sealed class ModernProgressBar : Control
{
    private int _value;
    public int Value
    {
        get => _value;
        set { var next = Math.Clamp(value, 0, 100); if (_value == next) return; _value = next; Invalidate(); }
    }

    public ModernProgressBar()
    {
        Height = 6;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(Parent?.BackColor ?? Theme.Background);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = new Rectangle(0, 0, Math.Max(1, Width - 1), Math.Max(1, Height - 1));
        using var track = Theme.RoundedRect(rect, Height / 2);
        using var trackBrush = new SolidBrush(Theme.SurfaceElevated);
        e.Graphics.FillPath(trackBrush, track);
        var width = (int)Math.Round(rect.Width * Value / 100d);
        if (width <= 0) return;
        using var fill = Theme.RoundedRect(new Rectangle(0, 0, width, rect.Height), Height / 2);
        using var fillBrush = new SolidBrush(Theme.Accent);
        e.Graphics.FillPath(fillBrush, fill);
    }
}

internal sealed class HiddenScrollRichTextBox : RichTextBox
{
    // RichEdit messages preserve both the scroll position and selected text while Follow is off.
    private const int EmGetScrollPos = 0x04DD;
    private const int EmSetScrollPos = 0x04DE;
    private const int WmSetRedraw = 0x000B;
    private int _wheelRemainder;
    private bool _redrawSuspended;
    protected override CreateParams CreateParams => NativeScroll.WithoutBars(base.CreateParams);
    protected override void WndProc(ref Message m)
    {
        if (NativeScroll.SuppressBarStyles(ref m)) return;
        if (m.Msg == 0x0460 && m.LParam != IntPtr.Zero) { m.Result = IntPtr.Zero; return; } // EM_SHOWSCROLLBAR
        if (NativeScroll.ScrollText(this, ref m, ref _wheelRemainder)) return;
        base.WndProc(ref m);
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct ScrollPoint { public int X; public int Y; }

    [DllImport("user32.dll", EntryPoint = "SendMessageW")]
    private static extern IntPtr SendMessage(IntPtr handle, int message, IntPtr wParam, ref ScrollPoint point);

    [DllImport("user32.dll", EntryPoint = "SendMessageW")]
    private static extern IntPtr SendMessage(IntPtr handle, int message, IntPtr wParam, IntPtr lParam);

    public HiddenScrollRichTextBox()
    {
        BorderStyle = BorderStyle.None;
        ScrollBars = RichTextBoxScrollBars.None;
        WordWrap = false;
        DetectUrls = false;
        HideSelection = false;
    }

    public ScrollPoint BeginAppend(bool preserveView)
    {
        var point = new ScrollPoint();
        if (IsHandleCreated && preserveView) SendMessage(Handle, EmGetScrollPos, IntPtr.Zero, ref point);
        _redrawSuspended = IsHandleCreated && Visible;
        if (_redrawSuspended) SendMessage(Handle, WmSetRedraw, IntPtr.Zero, IntPtr.Zero);
        return point;
    }

    public void EndAppend(bool preserveView, ScrollPoint point, int selectionStart, int selectionLength)
    {
        try
        {
            if (!preserveView) { Select(TextLength, 0); ScrollToCaret(); }
            else
            {
                var start = Math.Clamp(selectionStart, 0, TextLength);
                Select(start, Math.Clamp(selectionLength, 0, TextLength - start));
                if (IsHandleCreated) SendMessage(Handle, EmSetScrollPos, IntPtr.Zero, ref point);
            }
        }
        finally
        {
            if (_redrawSuspended && IsHandleCreated) SendMessage(Handle, WmSetRedraw, (IntPtr)1, IntPtr.Zero);
            _redrawSuspended = false;
            Invalidate();
        }
    }
}
