using System.ComponentModel;
using System.Drawing.Drawing2D;
using Server_Launcher.Core;

namespace Server_Launcher.UI.Controls;

internal sealed class ModernMemorySlider : Control
{
    // EASY-TO-TUNE SLIDER GEOMETRY, in logical pixels.
    private const int SliderHeight = 74;
    private const int TrackTop = 38;
    private const int TrackThickness = 4;
    private const int ThumbRadius = 8;
    private const int SidePadding = 14;
    private readonly Font _smallFont = UiMetrics.Font(8f);
    private int _minimum = LauncherConfig.MinimumRamMb;
    private int _maximum = Math.Max(LauncherConfig.MinimumRamMb, MemoryLimits.TotalPhysicalMemoryMb);
    private int _value = LauncherConfig.MinimumRamMb;
    private bool _dragging;
    private bool _hovered;

    [DefaultValue(LauncherConfig.RamStepMb)]
    public int Step { get; set; } = LauncherConfig.RamStepMb;
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Func<int, string> ValueFormatter { get; set; } = MemoryLimits.Format;
    public event EventHandler? ValueChanged;
    [DefaultValue(LauncherConfig.MinimumRamMb)]
    public int Minimum
    {
        get => _minimum;
        set { _minimum = Math.Max(0, value); _maximum = Math.Max(_minimum, _maximum); Value = _value; Invalidate(); }
    }
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Visible)]
    public int Maximum
    {
        get => _maximum;
        set { _maximum = Math.Max(_minimum, value); Value = _value; Invalidate(); }
    }
    [DefaultValue(LauncherConfig.MinimumRamMb)]
    public int Value
    {
        get => _value;
        set
        {
            var clamped = Math.Clamp(value, Minimum, Maximum);
            if (_value == clamped) return;
            _value = clamped;
            Invalidate();
            ValueChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    public ModernMemorySlider()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
        Height = SliderHeight;
        Font = UiMetrics.Font(10.5f, true);
        ForeColor = Theme.Text;
        BackColor = Theme.Background;
        Cursor = Cursors.Hand;
        TabStop = true;
        AccessibleRole = AccessibleRole.Slider;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(Parent?.BackColor ?? Theme.Background);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var padding = UiMetrics.Scale(this, SidePadding);
        var y = UiMetrics.Scale(this, TrackTop);
        var thickness = Math.Max(2, UiMetrics.Scale(this, TrackThickness));
        var radius = UiMetrics.Scale(this, ThumbRadius);
        var available = Math.Max(1, Width - padding * 2);
        var fraction = Maximum == Minimum ? 0 : (Value - Minimum) / (double)(Maximum - Minimum);
        var x = padding + (int)Math.Round(available * fraction);
        TextRenderer.DrawText(e.Graphics, ValueFormatter(Value), Font,
            new Rectangle(0, 0, Width, UiMetrics.Scale(this, 25)), Enabled ? Theme.Text : Theme.Subtle,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        using var track = Theme.RoundedRect(new Rectangle(padding, y, available, thickness), thickness / 2);
        using var trackBrush = new SolidBrush(Theme.SurfaceElevated);
        e.Graphics.FillPath(trackBrush, track);
        if (x > padding)
        {
            using var fill = Theme.RoundedRect(new Rectangle(padding, y, x - padding, thickness), thickness / 2);
            using var fillBrush = new SolidBrush(Enabled ? Theme.AccentFill : Theme.Subtle);
            e.Graphics.FillPath(fillBrush, fill);
        }
        var centerY = y + thickness / 2;
        if (Enabled && (_hovered || Focused || _dragging))
        {
            using var halo = new SolidBrush(Color.FromArgb(35, Theme.Accent));
            var haloRadius = radius + UiMetrics.Scale(this, 4);
            e.Graphics.FillEllipse(halo, x - haloRadius, centerY - haloRadius, haloRadius * 2, haloRadius * 2);
        }
        using var thumb = new SolidBrush(Enabled ? Theme.Accent : Theme.Subtle);
        e.Graphics.FillEllipse(thumb, x - radius, centerY - radius, radius * 2, radius * 2);
        var limits = new Rectangle(0, UiMetrics.Scale(this, 52), Width, UiMetrics.Scale(this, 20));
        TextRenderer.DrawText(e.Graphics, ValueFormatter(Minimum), _smallFont, limits, Theme.Subtle,
            TextFormatFlags.Left | TextFormatFlags.NoPadding);
        TextRenderer.DrawText(e.Graphics, ValueFormatter(Maximum), _smallFont, limits, Theme.Subtle,
            TextFormatFlags.Right | TextFormatFlags.NoPadding);
    }

    private void SetFromPointer(int x)
    {
        var padding = UiMetrics.Scale(this, SidePadding);
        var fraction = Math.Clamp((x - padding) / (double)Math.Max(1, Width - padding * 2), 0, 1);
        var raw = Minimum + fraction * (Maximum - Minimum);
        var steps = Math.Round((raw - Minimum) / Math.Max(1, Step), MidpointRounding.AwayFromZero);
        Value = fraction >= 1 ? Maximum : (int)Math.Min(Maximum, Minimum + steps * Math.Max(1, Step));
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left || !Enabled) return;
        Focus(); _dragging = true; Capture = true; SetFromPointer(e.X);
    }
    protected override void OnMouseMove(MouseEventArgs e) { base.OnMouseMove(e); if (_dragging) SetFromPointer(e.X); }
    protected override void OnMouseUp(MouseEventArgs e) { base.OnMouseUp(e); if (e.Button == MouseButtons.Left) { _dragging = false; Capture = false; Invalidate(); } }
    protected override void OnMouseCaptureChanged(EventArgs e) { base.OnMouseCaptureChanged(e); if (!Capture) _dragging = false; }
    protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); _hovered = true; Invalidate(); }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); _hovered = false; Invalidate(); }
    protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
    protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); Invalidate(); }
    protected override void OnEnabledChanged(EventArgs e) { base.OnEnabledChanged(e); Invalidate(); }
    protected override void OnMouseWheel(MouseEventArgs e) => HiddenScrollPanel.ForwardMouseWheel(this, e);
    protected override bool IsInputKey(Keys keyData) => (keyData & Keys.KeyCode) is
        Keys.Left or Keys.Right or Keys.Up or Keys.Down or Keys.Home or Keys.End or Keys.PageUp or Keys.PageDown || base.IsInputKey(keyData);
    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        long next = Value;
        switch (e.KeyCode)
        {
            case Keys.Left: case Keys.Down: next -= Math.Max(1, Step); break;
            case Keys.Right: case Keys.Up: next += Math.Max(1, Step); break;
            case Keys.PageDown: next -= Math.Max(1, Step) * 4L; break;
            case Keys.PageUp: next += Math.Max(1, Step) * 4L; break;
            case Keys.Home: next = Minimum; break;
            case Keys.End: next = Maximum; break;
            default: return;
        }
        Value = (int)Math.Clamp(next, Minimum, Maximum);
        e.Handled = true; e.SuppressKeyPress = true;
    }
    protected override void Dispose(bool disposing) { if (disposing) _smallFont.Dispose(); base.Dispose(disposing); }
}
