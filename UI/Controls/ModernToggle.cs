using System.ComponentModel;
using System.Drawing.Drawing2D;

namespace Server_Launcher.UI.Controls;

internal sealed class ModernToggle : Control
{
    // EASY-TO-TUNE SWITCH GEOMETRY, in logical pixels.
    private const int TrackWidth = 40;
    private const int TrackHeight = 22;
    private const int TextGap = 10;
    private bool _checked;
    private bool _hovered;
    private bool _spacePressed;
    private bool _mousePressed;
    [DefaultValue(true)]
    public bool WrapText { get; set; } = true;
    public event EventHandler? CheckedChanged;
    [DefaultValue(false)]
    public bool Checked
    {
        get => _checked;
        set { if (_checked == value) return; _checked = value; Invalidate(); if (IsHandleCreated) AccessibilityNotifyClients(AccessibleEvents.StateChange, -1); CheckedChanged?.Invoke(this, EventArgs.Empty); }
    }

    public ModernToggle()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
        SetStyle(ControlStyles.StandardClick | ControlStyles.StandardDoubleClick, false);
        Font = UiMetrics.Font(9.5f);
        ForeColor = Theme.Text;
        Cursor = Cursors.Hand;
        TabStop = true;
        Margin = Padding.Empty;
        AccessibleRole = AccessibleRole.CheckButton;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(Parent?.BackColor ?? Theme.Background);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var width = UiMetrics.Scale(this, TrackWidth);
        var height = Math.Min(ClientSize.Height, UiMetrics.Scale(this, TrackHeight));
        var rect = new Rectangle(0, Math.Max(0, (Height - height) / 2), width, height);
        TogglePainter.Draw(e.Graphics, rect, Checked, Enabled, _hovered || Focused, DeviceDpi);
        var left = width + UiMetrics.Scale(this, TextGap);
        var textWidth = Math.Max(1, Width - left);
        var flags = TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis;
        if (!WrapText) flags |= TextFormatFlags.SingleLine;
        else flags |= TextFormatFlags.WordBreak | TextFormatFlags.TextBoxControl;
        var measured = TextRenderer.MeasureText(e.Graphics, Text, Font, new Size(textWidth, int.MaxValue), flags);
        var wholeLines = Math.Max(1, Height / Math.Max(1, Font.Height));
        var textHeight = Math.Min(Height, Math.Min(measured.Height, wholeLines * Font.Height));
        TextRenderer.DrawText(e.Graphics, Text, Font,
            new Rectangle(left, Math.Max(0, (Height - textHeight) / 2), textWidth, textHeight),
            Enabled ? ForeColor : Theme.Subtle, flags);

    }

    protected override void OnClick(EventArgs e) { if (Enabled) Checked = !Checked; base.OnClick(e); }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left || !Enabled) return;
        _mousePressed = true; Focus(); Capture = true;
    }
    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (e.Button != MouseButtons.Left) return;
        var toggle = _mousePressed && ClientRectangle.Contains(e.Location);
        _mousePressed = false; Capture = false;
        if (toggle) OnClick(EventArgs.Empty);
    }
    protected override void OnMouseCaptureChanged(EventArgs e)
    {
        base.OnMouseCaptureChanged(e);
        if (!Capture) _mousePressed = false;
    }
    protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); _hovered = true; Invalidate(); }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); _hovered = false; Invalidate(); }
    protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
    protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); _spacePressed = false; Invalidate(); }
    protected override void OnEnabledChanged(EventArgs e) { base.OnEnabledChanged(e); Invalidate(); }
    protected override void OnMouseWheel(MouseEventArgs e) => HiddenScrollPanel.ForwardMouseWheel(this, e);
    protected override bool IsInputKey(Keys keyData) => (keyData & Keys.KeyCode) == Keys.Space || base.IsInputKey(keyData);
    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (e.KeyCode != Keys.Space) return;
        _spacePressed = true;
        e.Handled = true; e.SuppressKeyPress = true;
    }
    protected override void OnKeyUp(KeyEventArgs e)
    {
        base.OnKeyUp(e);
        if (e.KeyCode != Keys.Space) return;
        if (_spacePressed) OnClick(EventArgs.Empty);
        _spacePressed = false;
        e.Handled = true; e.SuppressKeyPress = true;
    }
    protected override AccessibleObject CreateAccessibilityInstance() => new CheckAccessibleObject(this);
    private sealed class CheckAccessibleObject(ModernToggle owner) : ControlAccessibleObject(owner)
    {
        public override AccessibleStates State => base.State | (owner.Checked ? AccessibleStates.Checked : AccessibleStates.None);
        public override string? DefaultAction => "Toggle";
        public override void DoDefaultAction() { if (owner.Enabled) owner.OnClick(EventArgs.Empty); }
    }
}

internal static class TogglePainter
{
    public static void Draw(Graphics graphics, Rectangle track, bool value, bool enabled, bool hovered, int dpi)
    {
        if (track.Width < 2 || track.Height < 2) return;
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var color = value ? Theme.AccentFill : Theme.SurfaceHover;
        if (hovered && enabled) color = value ? Theme.AccentFillHover : Theme.Blend(color, Theme.Muted, .14f);
        if (!enabled) color = Theme.Blend(color, Theme.Background, .4f);
        using var path = Theme.RoundedRect(track, track.Height / 2);
        using var fill = new SolidBrush(color);
        graphics.FillPath(fill, path);
        var inset = Math.Max(2, (int)Math.Round(3 * dpi / 96d));
        var size = Math.Max(1, track.Height - inset * 2);
        var x = value ? track.Right - size - inset : track.Left + inset;
        using var thumb = new SolidBrush(enabled ? Theme.Text : Theme.Subtle);
        graphics.FillEllipse(thumb, x, track.Top + inset, size, size);
    }
}
