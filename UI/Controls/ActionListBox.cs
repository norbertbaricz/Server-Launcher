using System.ComponentModel;
using System.Drawing.Drawing2D;

namespace Server_Launcher.UI.Controls;

internal sealed record ItemAction(string Key, string Label, ModernIcon Icon, bool Enabled = true, bool? Toggle = null);

internal sealed class ActionListBox : ModernListBox
{
    // EASY-TO-TUNE ROW AND ACTION DIMENSIONS, in logical pixels.
    private const int RowHeight = 64;
    private const int Inset = 12;
    private const int CardInset = 3;
    private const int TitleHeight = 25;
    private const int DetailHeight = 21;
    private const int ActionHeight = 30;
    private const int ActionWidth = 30;
    private const int ToggleWidth = 46;
    private const int ActionGap = 4;
    private readonly ToolTip _tips = new();
    private string _lastTip = string.Empty;
    private Point _pointer = new(-1, -1);
    private int _hoverIndex = -1;
    private string? _hoverAction;
    private object? _pressedItem;
    private string? _pressedAction;
    private Font _detailFont = UiMetrics.Font(8f);
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Func<object, string>? ItemTitle { get; set; }
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Func<object, string>? ItemDetail { get; set; }
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Func<object, IReadOnlyList<ItemAction>>? ItemActions { get; set; }
    public event Action<object, string>? ActionInvoked;

    public ActionListBox()
    {
        ItemHeight = RowHeight;
        AccessibleDescription = "Arrow keys select. F2 edits a server. Space toggles content. Delete removes the focused item. Ctrl/Shift selects multiple items.";
    }
    protected override void OnDpiChangedAfterParent(EventArgs e)
    {
        base.OnDpiChangedAfterParent(e);
        _detailFont.Dispose(); _detailFont = UiMetrics.Font(8f);
    }
    private IReadOnlyList<ItemAction> Actions(object item) => ItemActions?.Invoke(item) ?? Array.Empty<ItemAction>();
    private List<(ItemAction Action, Rectangle Bounds)> Positions(Rectangle row, object item)
    {
        var actions = Actions(item);
        var list = new List<(ItemAction, Rectangle)>();
        var right = row.Right - UiMetrics.Scale(this, CardInset + Inset);
        for (var i = actions.Count - 1; i >= 0; i--)
        {
            var width = UiMetrics.Scale(this, actions[i].Toggle.HasValue ? ToggleWidth : ActionWidth);
            var height = UiMetrics.Scale(this, ActionHeight);
            var rect = new Rectangle(right - width, row.Top + (row.Height - height) / 2, width, height);
            list.Insert(0, (actions[i], rect));
            right = rect.Left - UiMetrics.Scale(this, ActionGap);
        }
        return list;
    }
    protected override void OnDrawItem(DrawItemEventArgs e)
    {
        if (e.Index < 0 || e.Index >= Items.Count) return;
        using var background = new SolidBrush(BackColor);
        e.Graphics.FillRectangle(background, e.Bounds);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var item = Items[e.Index];
        var selected = (e.State & DrawItemState.Selected) != 0;
        var card = Rectangle.Inflate(e.Bounds, -UiMetrics.Scale(this, CardInset), -UiMetrics.Scale(this, CardInset));
        if (card.Width <= 0 || card.Height <= 0) return;
        if (selected)
        {
            using var path = Theme.RoundedRect(card, UiMetrics.Scale(this, UiMetrics.ControlRadius));
            using var fill = new SolidBrush(Theme.SurfaceElevated);
            e.Graphics.FillPath(fill, path);
        }
        var actions = Positions(e.Bounds, item);
        var right = actions.Count == 0 ? card.Right - UiMetrics.Scale(this, Inset) : actions[0].Bounds.Left - UiMetrics.Scale(this, 6);
        var left = card.Left + UiMetrics.Scale(this, Inset);
        var titleHeight = UiMetrics.Scale(this, TitleHeight);
        var detailHeight = UiMetrics.Scale(this, DetailHeight);
        var textTop = e.Bounds.Top + (e.Bounds.Height - titleHeight - detailHeight) / 2;
        var title = new Rectangle(left, textTop, Math.Max(1, right - left), titleHeight);
        var detail = new Rectangle(left, title.Bottom, title.Width, detailHeight);
        var flags = TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding | TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix;
        TextRenderer.DrawText(e.Graphics, ItemTitle?.Invoke(item) ?? GetItemText(item), Font, title, Enabled ? Theme.Text : Theme.Subtle, flags);
        TextRenderer.DrawText(e.Graphics, ItemDetail?.Invoke(item) ?? string.Empty, _detailFont, detail, Theme.Subtle, flags);
        foreach (var (action, bounds) in actions)
        {
            var enabled = Enabled && action.Enabled;
            var hover = enabled && bounds.Contains(_pointer);
            if (action.Toggle.HasValue)
            {
                var track = new Rectangle(bounds.Left + UiMetrics.Scale(this, 3), bounds.Top + UiMetrics.Scale(this, 4),
                    bounds.Width - UiMetrics.Scale(this, 6), bounds.Height - UiMetrics.Scale(this, 8));
                TogglePainter.Draw(e.Graphics, track, action.Toggle.Value, enabled, hover, DeviceDpi);
            }
            else
            {
                using (var path = Theme.RoundedRect(bounds, UiMetrics.Scale(this, 6)))
                using (var fill = new SolidBrush(action.Icon == ModernIcon.Trash
                    ? hover ? Theme.DangerSurface : Theme.Blend(Theme.SurfaceElevated, Theme.DangerSurface, .4f)
                    : hover ? Theme.Blend(Theme.SurfaceHover, Theme.AccentFill, .2f) : selected ? Theme.SurfaceHover : Theme.SurfaceElevated))
                    e.Graphics.FillPath(fill, path);
                ModernIconPainter.DrawCentered(e.Graphics, bounds, action.Icon,
                    !enabled ? Theme.Subtle : action.Icon == ModernIcon.Trash ? Theme.Danger : Theme.Muted,
                    UiMetrics.Scale(this, UiMetrics.ButtonIconSize));
            }
        }
    }
    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        UpdateHover(e.Location);
    }
    private void UpdateHover(Point pointer)
    {
        _pointer = pointer;
        var index = IndexFromPoint(pointer);
        var tip = string.Empty;
        ItemAction? action = null;
        if (index >= 0)
        {
            var item = Items[index];
            action = Positions(GetItemRectangle(index), item).FirstOrDefault(p => p.Bounds.Contains(pointer)).Action;
            tip = action?.Label ?? (ItemTitle?.Invoke(item) ?? GetItemText(item));
        }
        Cursor = Enabled && action is { Enabled: true } ? Cursors.Hand : Cursors.Default;
        if (tip != _lastTip) { _lastTip = tip; _tips.SetToolTip(this, tip); }
        if (_hoverIndex == index && _hoverAction == action?.Key) return;
        if (_hoverIndex >= 0 && _hoverIndex < Items.Count) Invalidate(GetItemRectangle(_hoverIndex));
        _hoverIndex = index; _hoverAction = action?.Key;
        if (index >= 0) Invalidate(GetItemRectangle(index));
    }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); UpdateHover(new Point(-1, -1)); }
    protected override void OnViewportChanged(EventArgs e)
    {
        base.OnViewportChanged(e);
        UpdateHover(IsHandleCreated ? PointToClient(MousePosition) : new Point(-1, -1));
    }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
        {
            var index = IndexFromPoint(e.Location);
            if (index >= 0)
            {
                var item = Items[index];
                var action = Positions(GetItemRectangle(index), item).FirstOrDefault(p => p.Bounds.Contains(e.Location)).Action;
                if (action is not null)
                {
                    Focus();
                    if (Enabled && action.Enabled) { _pressedItem = item; _pressedAction = action.Key; Capture = true; }
                    return;
                }
            }
        }
        base.OnMouseDown(e);
    }
    protected override void OnMouseUp(MouseEventArgs e)
    {
        if (_pressedItem is object item && _pressedAction is string key)
        {
            _pressedItem = null; _pressedAction = null; Capture = false;
            var index = IndexFromPoint(e.Location);
            if (e.Button == MouseButtons.Left && index >= 0 && ReferenceEquals(Items[index], item))
            {
                var action = Positions(GetItemRectangle(index), item).FirstOrDefault(p => p.Bounds.Contains(e.Location)).Action;
                if (Enabled && action is { Enabled: true } && action.Key == key) ActionInvoked?.Invoke(item, key);
            }
            return;
        }
        base.OnMouseUp(e);
    }
    protected override void OnMouseCaptureChanged(EventArgs e)
    {
        base.OnMouseCaptureChanged(e);
        if (!Capture) { _pressedItem = null; _pressedAction = null; }
    }
    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (SelectedItem is object item && e.Modifiers == Keys.None)
        {
            var key = e.KeyCode switch { Keys.Delete => "delete", Keys.F2 => "edit", Keys.Space => "toggle", _ => string.Empty };
            var action = Actions(item).FirstOrDefault(p => p.Key == key);
            if (action is not null)
            {
                e.Handled = e.SuppressKeyPress = true;
                if (action.Enabled) ActionInvoked?.Invoke(item, action.Key);
                return;
            }
        }
        base.OnKeyDown(e);
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { _tips.Dispose(); _detailFont.Dispose(); }
        base.Dispose(disposing);
    }
}
