using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Drawing.Drawing2D;

namespace Server_Launcher.UI.Controls;

// One buffered canvas owns painting, selection and input. There is no native LISTBOX
// underneath the row actions, and no native scrollbar to appear between repaints.
internal class ModernListBox : Control
{
    private readonly SortedSet<int> _selected = new();
    private int _focusedIndex = -1;
    private int _anchorIndex = -1;
    private int _topIndex;
    private int _itemHeight = 46;
    private int _updates;
    private int _wheelRemainder;
    private bool _selectionPending;
    private string _typed = string.Empty;
    private long _lastTypedTick;
    private SelectionMode _selectionMode = SelectionMode.One;
    public ItemCollection Items { get; }
    public string DisplayMember { get; set; } = string.Empty;
    public event EventHandler? SelectedIndexChanged;
    public IReadOnlyList<object> SelectedItems => _selected.Select(index => Items[index]).ToArray();
    public int SelectedIndex
    {
        get => _selected.Contains(_focusedIndex) ? _focusedIndex : _selected.Count == 0 ? -1 : _selected.Min;
        set
        {
            if (value < -1 || value >= Items.Count) throw new ArgumentOutOfRangeException(nameof(value));
            SelectOnly(value);
            if (SelectedIndex >= 0) EnsureVisible(SelectedIndex);
        }
    }
    public object? SelectedItem { get => SelectedIndex < 0 ? null : Items[SelectedIndex]; set => SelectedIndex = value is null ? -1 : Items.IndexOf(value); }
    public SelectionMode SelectionMode
    {
        get => _selectionMode;
        set
        {
            if (_selectionMode == value) return;
            _selectionMode = value;
            if (value == SelectionMode.None) SelectOnly(-1);
            else if (value == SelectionMode.One && _selected.Count > 1) SelectOnly(SelectedIndex);
        }
    }
    public int ItemHeight
    {
        get => UiMetrics.Scale(this, _itemHeight);
        set { _itemHeight = Math.Max(1, value); ClampViewport(); Invalidate(); }
    }
    private int VisibleRows => Math.Max(1, ClientSize.Height / ItemHeight);
    public int TopIndex
    {
        get => _topIndex;
        set
        {
            var next = Math.Clamp(value, 0, Math.Max(0, Items.Count - VisibleRows));
            if (_topIndex == next) return;
            _topIndex = next; OnViewportChanged(EventArgs.Empty); Invalidate();
        }
    }
    public ModernListBox()
    {
        Items = new ItemCollection(this);
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
        SetStyle(ControlStyles.StandardClick | ControlStyles.StandardDoubleClick, false);
        BackColor = Theme.Sidebar; ForeColor = Theme.Text; Font = UiMetrics.Font(9.5f, true);
        TabStop = true; AccessibleRole = AccessibleRole.List;
    }
    public string GetItemText(object item) => string.IsNullOrEmpty(DisplayMember) ? item.ToString() ?? string.Empty
        : TypeDescriptor.GetProperties(item)[DisplayMember]?.GetValue(item)?.ToString() ?? item.ToString() ?? string.Empty;
    public Rectangle GetItemRectangle(int index) => new(0, (index - TopIndex) * ItemHeight, ClientSize.Width, ItemHeight);
    public int IndexFromPoint(Point point)
    {
        if (!ClientRectangle.Contains(point)) return -1;
        var index = TopIndex + point.Y / ItemHeight;
        return index < Items.Count ? index : -1;
    }
    public void BeginUpdate() => _updates++;
    public void EndUpdate()
    {
        if (_updates == 0 || --_updates != 0) return;
        ClampViewport();
        if (_selectionPending) { _selectionPending = false; SelectedIndexChanged?.Invoke(this, EventArgs.Empty); }
        Invalidate();
    }
    public void SetSelected(int index, bool selected)
    {
        if (index < 0 || index >= Items.Count) throw new ArgumentOutOfRangeException(nameof(index));
        if (SelectionMode == SelectionMode.None) return;
        if (selected && SelectionMode == SelectionMode.One) { SelectOnly(index); return; }
        var changed = selected ? _selected.Add(index) : _selected.Remove(index);
        if (selected) _focusedIndex = index;
        if (changed) SelectionChanged();
    }
    private void SelectOnly(int index)
    {
        if (SelectionMode == SelectionMode.None) index = -1;
        var changed = _selected.Count != (index < 0 ? 0 : 1) || (index >= 0 && !_selected.Contains(index));
        _selected.Clear();
        if (index >= 0) _selected.Add(index);
        _focusedIndex = _anchorIndex = index;
        if (changed) SelectionChanged();
    }
    private void SelectAt(int index, Keys modifiers)
    {
        if (SelectionMode == SelectionMode.None || index < 0) return;
        if (SelectionMode == SelectionMode.One) { SelectOnly(index); return; }
        if (SelectionMode == SelectionMode.MultiExtended && (modifiers & Keys.Shift) != 0)
        {
            var anchor = _anchorIndex >= 0 ? _anchorIndex : index;
            if ((modifiers & Keys.Control) == 0) _selected.Clear();
            for (var i = Math.Min(anchor, index); i <= Math.Max(anchor, index); i++) _selected.Add(i);
            _focusedIndex = index; SelectionChanged();
        }
        else if (SelectionMode == SelectionMode.MultiSimple || (modifiers & Keys.Control) != 0)
        {
            if (!_selected.Remove(index)) _selected.Add(index);
            _focusedIndex = _anchorIndex = index; SelectionChanged();
        }
        else SelectOnly(index);
        if (_focusedIndex >= 0) EnsureVisible(_focusedIndex);
    }
    private void SelectionChanged()
    {
        if (_updates > 0) { _selectionPending = true; return; }
        Invalidate(); SelectedIndexChanged?.Invoke(this, EventArgs.Empty);
        if (IsHandleCreated) AccessibilityNotifyClients(AccessibleEvents.Selection, -1);
    }
    private void EnsureVisible(int index)
    {
        if (index < TopIndex) TopIndex = index;
        else if (index >= TopIndex + VisibleRows) TopIndex = index - VisibleRows + 1;
    }
    private void ClampViewport() => TopIndex = _topIndex;
    protected virtual void OnViewportChanged(EventArgs e) { }
    protected override void OnDpiChangedAfterParent(EventArgs e) { base.OnDpiChangedAfterParent(e); ClampViewport(); Invalidate(); }
    protected override void OnResize(EventArgs e) { base.OnResize(e); ClampViewport(); }
    protected override void OnEnabledChanged(EventArgs e) { base.OnEnabledChanged(e); Invalidate(); }
    protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
    protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); Invalidate(); }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left || !Enabled) return;
        Focus(); SelectAt(IndexFromPoint(e.Location), ModifierKeys);
    }
    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if (Items.Count <= VisibleRows) HiddenScrollPanel.ScrollAncestor(this, e.Delta);
        else TopIndex -= NativeScroll.ConsumeLines(e.Delta, ref _wheelRemainder, VisibleRows);
        if (e is HandledMouseEventArgs handled) handled.Handled = true;
    }
    protected override bool IsInputKey(Keys keyData) => (keyData & Keys.KeyCode) is
        Keys.Up or Keys.Down or Keys.Home or Keys.End or Keys.PageUp or Keys.PageDown or Keys.Space || base.IsInputKey(keyData);
    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (e.Handled || Items.Count == 0) return;
        if (SelectionMode == SelectionMode.None)
        {
            var nextTop = e.KeyCode switch { Keys.Up => TopIndex - 1, Keys.Down => TopIndex + 1,
                Keys.PageUp => TopIndex - VisibleRows, Keys.PageDown => TopIndex + VisibleRows,
                Keys.Home => 0, Keys.End => Items.Count - 1, _ => int.MinValue };
            if (nextTop == int.MinValue) return;
            TopIndex = nextTop; e.Handled = e.SuppressKeyPress = true; return;
        }
        if (e.Control && e.KeyCode == Keys.A && SelectionMode is SelectionMode.MultiExtended or SelectionMode.MultiSimple)
        {
            BeginUpdate();
            try { for (var i = 0; i < Items.Count; i++) SetSelected(i, true); }
            finally { EndUpdate(); }
        }
        else
        {
            var current = Math.Max(0, _focusedIndex);
            var index = e.KeyCode switch
            {
                Keys.Up => current - 1, Keys.Down => _focusedIndex < 0 ? 0 : current + 1,
                Keys.Home => 0, Keys.End => Items.Count - 1,
                Keys.PageUp => current - VisibleRows, Keys.PageDown => current + VisibleRows,
                Keys.Space => current, _ => -1
            };
            if (index == -1 && e.KeyCode != Keys.Up && e.KeyCode != Keys.PageUp) return;
            index = Math.Clamp(index, 0, Items.Count - 1);
            if (e.Control && e.KeyCode != Keys.Space)
            { _focusedIndex = index; EnsureVisible(index); Invalidate(); }
            else SelectAt(index, e.Modifiers);
        }
        e.Handled = e.SuppressKeyPress = true;
    }
    protected override void OnKeyPress(KeyPressEventArgs e)
    {
        base.OnKeyPress(e);
        if (char.IsControl(e.KeyChar) || SelectionMode == SelectionMode.None || Items.Count == 0) return;
        var now = Environment.TickCount64;
        _typed = now - _lastTypedTick > 800 ? e.KeyChar.ToString() : _typed + e.KeyChar;
        _lastTypedTick = now;
        var match = Items.Select((item, index) => (item, index))
            .FirstOrDefault(p => GetItemText(p.item).StartsWith(_typed, StringComparison.CurrentCultureIgnoreCase));
        if (match.item is not null) SelectedIndex = match.index;
        else
        {
            _typed = e.KeyChar.ToString();
            for (var step = 1; step <= Items.Count; step++)
            {
                var index = (Math.Max(-1, SelectedIndex) + step) % Items.Count;
                if (!GetItemText(Items[index]).StartsWith(_typed, StringComparison.CurrentCultureIgnoreCase)) continue;
                SelectedIndex = index; break;
            }
        }
        e.Handled = true;
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        if (_updates > 0) return;
        e.Graphics.Clear(BackColor);
        for (var index = TopIndex; index < Items.Count; index++)
        {
            var row = GetItemRectangle(index);
            if (row.Top >= ClientSize.Height) break;
            if (!row.IntersectsWith(e.ClipRectangle)) continue;
            var state = _selected.Contains(index) ? DrawItemState.Selected : DrawItemState.None;
            if (!Enabled) state |= DrawItemState.Disabled;
            if (Focused && index == _focusedIndex) state |= DrawItemState.Focus;
            OnDrawItem(new DrawItemEventArgs(e.Graphics, Font, row, index, state, ForeColor, BackColor));
        }
    }
    protected virtual void OnDrawItem(DrawItemEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var inset = UiMetrics.Scale(this, 3);
        var rect = Rectangle.Inflate(e.Bounds, -inset, -inset);
        if (rect.Width <= 0 || rect.Height <= 0) return;
        if ((e.State & DrawItemState.Selected) != 0)
        {
            using var path = Theme.RoundedRect(rect, UiMetrics.Scale(this, UiMetrics.ControlRadius));
            using var brush = new SolidBrush(Theme.SurfaceElevated); e.Graphics.FillPath(brush, path);
        }
        var padding = UiMetrics.Scale(this, 14);
        TextRenderer.DrawText(e.Graphics, GetItemText(Items[e.Index]), Font,
            new Rectangle(rect.Left + padding, rect.Top, Math.Max(1, rect.Width - padding * 2), rect.Height), Enabled ? Theme.Text : Theme.Subtle,
            TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding | TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix);
    }
    public sealed class ItemCollection(ModernListBox owner) : Collection<object>
    {
        protected override void InsertItem(int index, object item)
        {
            var selected = owner._selected.Select(i => i >= index ? i + 1 : i).ToArray();
            owner._selected.Clear(); owner._selected.UnionWith(selected);
            if (owner._focusedIndex >= index) owner._focusedIndex++;
            if (owner._anchorIndex >= index) owner._anchorIndex++;
            base.InsertItem(index, item); owner.ItemsChanged();
        }
        protected override void RemoveItem(int index)
        {
            var wasSelected = owner._selected.Contains(index);
            var selected = owner._selected.Where(i => i != index).Select(i => i > index ? i - 1 : i).ToArray();
            owner._selected.Clear(); owner._selected.UnionWith(selected);
            base.RemoveItem(index);
            owner._focusedIndex = owner._focusedIndex == index ? -1 : owner._focusedIndex > index ? owner._focusedIndex - 1 : owner._focusedIndex;
            owner._anchorIndex = Math.Min(owner._anchorIndex, Count - 1);
            owner.ItemsChanged(); if (wasSelected) owner.SelectionChanged();
        }
        protected override void SetItem(int index, object item) { base.SetItem(index, item); owner.ItemsChanged(); }
        protected override void ClearItems()
        {
            var hadSelection = owner._selected.Count > 0;
            owner._selected.Clear(); owner._focusedIndex = owner._anchorIndex = -1;
            base.ClearItems(); owner.ItemsChanged(); if (hadSelection) owner.SelectionChanged();
        }
    }
    private void ItemsChanged() { if (_updates > 0) return; ClampViewport(); Invalidate(); }
    protected override AccessibleObject CreateAccessibilityInstance() => new ListAccessibleObject(this);
    private sealed class ListAccessibleObject(ModernListBox owner) : ControlAccessibleObject(owner)
    {
        public override int GetChildCount() => owner.Items.Count;
        public override AccessibleObject? GetChild(int index) => index < 0 || index >= owner.Items.Count ? null : new RowAccessibleObject(owner, index);
    }
    private sealed class RowAccessibleObject(ModernListBox owner, int index) : AccessibleObject
    {
        public override AccessibleObject? Parent => owner.AccessibilityObject;
        public override string? Name { get => owner.GetItemText(owner.Items[index]); set { } }
        public override AccessibleRole Role => AccessibleRole.ListItem;
        public override Rectangle Bounds => owner.RectangleToScreen(owner.GetItemRectangle(index));
        public override AccessibleStates State => AccessibleStates.Selectable | (owner._selected.Contains(index) ? AccessibleStates.Selected : AccessibleStates.None);
        public override string? DefaultAction => "Select";
        public override void DoDefaultAction() { if (owner.Enabled) owner.SelectedIndex = index; }
    }
}
