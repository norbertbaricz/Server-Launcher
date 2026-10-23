using System.ComponentModel;
using System.Drawing.Drawing2D;

namespace Server_Launcher.UI.Controls;

internal sealed class HeaderBadge : Control
{
    // Shared geometry for LAN and WAN cards.
    public const int LogicalHeight = 28;
    public const int HorizontalPadding = 10;
    private const int CornerRadius = 6;
    private bool _hovered;

    public HeaderBadge()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
        Font = UiMetrics.Font(9f);
        ForeColor = Theme.Accent;
        Margin = Padding.Empty;
        TabStop = false;
        AccessibleRole = AccessibleRole.StaticText;
    }

    protected override void OnTextChanged(EventArgs e)
    {
        base.OnTextChanged(e);
        Parent?.PerformLayout();
        Invalidate();
    }
    protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); _hovered = true; Invalidate(); }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); _hovered = false; Invalidate(); }
    protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
    protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); Invalidate(); }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button == MouseButtons.Left && TabStop) Focus();
    }
    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (!TabStop || e.KeyCode is not (Keys.Space or Keys.Enter)) return;
        OnClick(EventArgs.Empty);
        e.Handled = e.SuppressKeyPress = true;
    }
    protected override bool IsInputKey(Keys keyData) => (keyData & Keys.KeyCode) is Keys.Space or Keys.Enter || base.IsInputKey(keyData);
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(Parent?.BackColor ?? Theme.Background);
        if (Width < 2 || Height < 2) return;
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var path = Theme.RoundedRect(new Rectangle(0, 0, Width - 1, Height - 1), UiMetrics.Scale(this, CornerRadius));
        using var fill = new SolidBrush(_hovered && TabStop ? Theme.SurfaceHover : Theme.SurfaceElevated);
        e.Graphics.FillPath(fill, path);
        var inset = UiMetrics.Scale(this, HorizontalPadding);
        TextRenderer.DrawText(e.Graphics, Text, Font, new Rectangle(inset, 0, Math.Max(1, Width - inset * 2), Height), ForeColor,
            TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine |
            TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        if (Focused && TabStop && ShowFocusCues)
        {
            using var pen = new Pen(Theme.Accent);
            e.Graphics.DrawLine(pen, inset, Height - UiMetrics.Scale(this, 3), Width - inset, Height - UiMetrics.Scale(this, 3));
        }
    }
}

internal sealed class ServerHeading : Control
{
    // One row at every width. Addresses truncate in their cards and remain available in tooltips.
    private const int MinimumTitleWidth = 96;
    private const int MinimumNetworkWidth = 72;
    private const int TitleBadgeGap = 12;
    private const int BadgeGap = 8;
    private int _titleWidth;
    private bool _showNetwork;
    public HeaderBadge LanBadge { get; } = new();
    public HeaderBadge WanBadge { get; } = new();
    [DefaultValue(false)]
    public bool ShowNetwork
    {
        get => _showNetwork;
        set { if (_showNetwork == value) return; _showNetwork = value; PerformLayout(); Invalidate(); }
    }

    public ServerHeading()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        Font = UiMetrics.Font(20f, true);
        ForeColor = Theme.Text;
        BackColor = Theme.Background;
        AccessibleRole = AccessibleRole.Grouping;
        LanBadge.Text = "LAN  —";
        WanBadge.Text = "WAN  —";
        Controls.AddRange(new Control[] { LanBadge, WanBadge });
    }

    protected override void OnTextChanged(EventArgs e) { base.OnTextChanged(e); PerformLayout(); Invalidate(); }
    protected override void OnDpiChangedAfterParent(EventArgs e) { base.OnDpiChangedAfterParent(e); PerformLayout(); Invalidate(); }
    protected override void OnLayout(LayoutEventArgs e)
    {
        base.OnLayout(e);
        if (LanBadge is null || WanBadge is null) return;
        LanBadge.Visible = WanBadge.Visible = ShowNetwork;
        _titleWidth = Width;
        if (!ShowNetwork || Width <= 0) return;
        var flags = TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine;
        var padding = UiMetrics.Scale(this, HeaderBadge.HorizontalPadding) * 2;
        var gap = UiMetrics.Scale(this, BadgeGap);
        var titleGap = UiMetrics.Scale(this, TitleBadgeGap);
        var networkWidth = Math.Max(TextRenderer.MeasureText(LanBadge.Text, LanBadge.Font, Size.Empty, flags).Width,
            TextRenderer.MeasureText(WanBadge.Text, WanBadge.Font, Size.Empty, flags).Width) + padding;
        var titleWidth = TextRenderer.MeasureText(Text, Font, Size.Empty, flags).Width;
        var minimumTitle = UiMetrics.Scale(this, MinimumTitleWidth);
        var minimumNetworks = UiMetrics.Scale(this, MinimumNetworkWidth) * 2;
        _titleWidth = Math.Min(titleWidth, Math.Max(minimumTitle, Width - networkWidth * 2 - gap - titleGap));
        _titleWidth = Math.Clamp(_titleWidth, 0, Math.Max(0, Width - titleGap - gap - minimumNetworks));
        networkWidth = Math.Min(networkWidth, Math.Max(0, (Width - _titleWidth - titleGap - gap) / 2));
        var badgeHeight = Math.Min(Height, UiMetrics.Scale(this, HeaderBadge.LogicalHeight));
        var y = (Height - badgeHeight) / 2;
        var x = _titleWidth + titleGap;
        LanBadge.SetBounds(x, y, networkWidth, badgeHeight);
        WanBadge.SetBounds(x + networkWidth + gap, y, networkWidth, badgeHeight);
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(BackColor);
        TextRenderer.DrawText(e.Graphics, Text, Font, new Rectangle(0, 0, Math.Max(1, _titleWidth), Height), ForeColor,
            TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine |
            TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
    }
}

internal sealed class StatusBadge : Control
{
    private const int DotSize = 6;
    private const int ContentGap = 8;
    public StatusBadge()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        Font = UiMetrics.Font(9f);
        ForeColor = Theme.Subtle;
        AccessibleRole = AccessibleRole.StaticText;
    }
    protected override void OnTextChanged(EventArgs e) { base.OnTextChanged(e); Invalidate(); }
    protected override void OnForeColorChanged(EventArgs e) { base.OnForeColorChanged(e); Invalidate(); }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(Parent?.BackColor ?? Theme.Background);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var bounds = new Rectangle(0, 0, Width - 1, Height - 1);
        if (bounds.Width <= 0 || bounds.Height <= 0) return;
        using var path = Theme.RoundedRect(bounds, UiMetrics.Scale(this, 6));
        using var background = new SolidBrush(Theme.Blend(Theme.Surface, ForeColor, .07f));
        e.Graphics.FillPath(background, path);
        var dot = UiMetrics.Scale(this, DotSize);
        var gap = UiMetrics.Scale(this, ContentGap);
        var textWidth = TextRenderer.MeasureText(e.Graphics, Text, Font, Size.Empty, TextFormatFlags.NoPadding | TextFormatFlags.SingleLine).Width;
        var x = Math.Max(UiMetrics.Scale(this, 8), (Width - textWidth - dot - gap) / 2);
        using var foreground = new SolidBrush(ForeColor);
        e.Graphics.FillEllipse(foreground, x, (Height - dot) / 2, dot, dot);
        TextRenderer.DrawText(e.Graphics, Text, Font, new Rectangle(x + dot + gap, 0, Math.Max(1, Width - x - dot - gap - UiMetrics.Scale(this, 8)), Height), ForeColor,
            TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
    }
}
