using System.Collections.ObjectModel;
using System.Drawing.Drawing2D;

namespace Server_Launcher.UI.Controls;

internal sealed class ModernDropDown : Control
{
    // EASY-TO-TUNE DROPDOWN VALUES, in logical pixels.
    private const int MaximumVisibleRows = 9;
    private const int ItemHeight = 38;
    private const int PopupGap = 6;
    private const int TypeAheadTimeoutMs = 800;
    private const int OwnerClickSuppressionMs = 200;
    private int _selectedIndex = -1;
    private bool _hovered;
    private bool _expanded;
    private bool _readOnly;
    public bool ReadOnly
    {
        get => _readOnly;
        set
        {
            if (_readOnly == value) return;
            _readOnly = value; if (value) _popup?.Close();
            Cursor = value ? Cursors.Default : Cursors.Hand;
            TabStop = !value;
            AccessibleRole = value ? AccessibleRole.StaticText : AccessibleRole.ComboBox;
            Invalidate();
        }
    }
    private string _search = string.Empty;
    private long _lastTypeAhead;
    private long _lastOwnerClose;
    private ToolStripDropDown? _popup;
    private DropDownSurface? _surface;

    public sealed class ItemCollection(ModernDropDown owner) : Collection<object>
    {
        public void AddRange(IEnumerable<object> items) { foreach (var item in items) Add(item); }
        protected override void InsertItem(int index, object item) { base.InsertItem(index, item); owner.ItemsChanged(); }
        protected override void RemoveItem(int index) { base.RemoveItem(index); owner.ItemsChanged(); }
        protected override void SetItem(int index, object item) { base.SetItem(index, item); owner.ItemsChanged(); }
        protected override void ClearItems() { base.ClearItems(); owner.ItemsChanged(); }
    }

    public ItemCollection Items { get; }
    public event EventHandler? SelectedIndexChanged;
    public int SelectedIndex
    {
        get => _selectedIndex;
        set
        {
            if (value < -1 || value >= Items.Count) throw new ArgumentOutOfRangeException(nameof(value));
            if (_selectedIndex == value) return;
            _selectedIndex = value;
            Invalidate();
            SelectedIndexChanged?.Invoke(this, EventArgs.Empty);
        }
    }
    public object? SelectedItem
    {
        get => SelectedIndex >= 0 && SelectedIndex < Items.Count ? Items[SelectedIndex] : null;
        set => SelectedIndex = value is null ? -1 : Items.IndexOf(value);
    }

    public ModernDropDown()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
        Items = new ItemCollection(this);
        Height = UiMetrics.ControlHeight;
        Font = UiMetrics.Font();
        ForeColor = Theme.Text;
        Cursor = Cursors.Hand;
        TabStop = true;
        AccessibleRole = AccessibleRole.ComboBox;
    }

    private void ItemsChanged()
    {
        _popup?.Close();
        if (_selectedIndex >= Items.Count) SelectedIndex = -1;
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(Parent?.BackColor ?? Theme.Background);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var path = Theme.RoundedRect(new Rectangle(0, 0, Math.Max(1, Width - 1), Math.Max(1, Height - 1)),
            UiMetrics.Scale(this, UiMetrics.ControlRadius));
        using var fill = new SolidBrush(_hovered && Enabled ? Theme.Blend(Theme.SurfaceElevated, Theme.SurfaceHover, .5f) : Theme.SurfaceElevated);
        e.Graphics.FillPath(fill, path);
        using var border = new Pen(Enabled && (Focused || _expanded) ? Theme.Accent : Theme.Border);
        e.Graphics.DrawPath(border, path);
        var padding = UiMetrics.Scale(this, 12);
        var arrowSpace = UiMetrics.Scale(this, ReadOnly ? 12 : 30);
        TextRenderer.DrawText(e.Graphics, SelectedItem?.ToString() ?? "Select...", Font,
            new Rectangle(padding, 0, Math.Max(1, Width - padding - arrowSpace), Height),
            Enabled ? ForeColor : Theme.Subtle, TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis |
            TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding | TextFormatFlags.SingleLine);
        if (ReadOnly) return;
        var x = Width - UiMetrics.Scale(this, 18);
        var y = Height / 2;
        var half = UiMetrics.Scale(this, 4);
        var direction = _expanded ? -1 : 1;
        using var pen = new Pen(Enabled ? Theme.Muted : Theme.Subtle, Math.Max(1.5f, DeviceDpi / 96f * 1.6f))
            { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        e.Graphics.DrawLines(pen, new[] { new Point(x - half, y - direction * 2),
            new Point(x, y + direction * 2), new Point(x + half, y - direction * 2) });
    }

    private void OpenPopup()
    {
        if (!Enabled || ReadOnly || Items.Count == 0 || _expanded) return;
        _popup?.Dispose();
        var area = Screen.FromControl(this).WorkingArea;
        var origin = PointToScreen(Point.Empty);
        var gap = UiMetrics.Scale(this, PopupGap);
        var rowHeight = UiMetrics.Scale(this, ItemHeight);
        var below = area.Bottom - origin.Y - Height - gap;
        var above = origin.Y - area.Top - gap;
        var rows = Math.Min(Items.Count, Math.Min(MaximumVisibleRows, Math.Max(1, Math.Max(below, above) / Math.Max(1, rowHeight))));
        var width = Math.Min(Width, area.Width);
        var height = Math.Min(area.Height, rows * rowHeight + 2);
        _surface = new DropDownSurface(this, rowHeight) { Size = new Size(Math.Max(1, width - 2), Math.Max(1, height - 2)) };
        var host = new ToolStripControlHost(_surface)
        {
            AutoSize = false, Size = _surface.Size, Margin = Padding.Empty, Padding = Padding.Empty
        };
        _popup = new ToolStripDropDown
        {
            AutoSize = false, Size = new Size(width, height), Padding = new Padding(1),
            Margin = Padding.Empty, BackColor = Theme.Surface, DropShadowEnabled = true,
            Renderer = new PopupRenderer(), AutoClose = true
        };
        _popup.Items.Add(host);
        _popup.Closed += (_, e) =>
        {
            _expanded = false; Invalidate();
            if (e.CloseReason == ToolStripDropDownCloseReason.AppClicked &&
                ClientRectangle.Contains(PointToClient(Cursor.Position))) _lastOwnerClose = Environment.TickCount64;
            if (Enabled && !IsDisposed && CanFocus && e.CloseReason is
                ToolStripDropDownCloseReason.Keyboard or ToolStripDropDownCloseReason.ItemClicked) Focus();
        };
        var x = Math.Clamp(origin.X, area.Left, area.Right - width);
        var y = below >= height || below >= above ? origin.Y + Height + gap : origin.Y - height - gap;
        y = Math.Clamp(y, area.Top, area.Bottom - height);
        _expanded = true;
        _popup.Show(this, PointToClient(new Point(x, y)), ToolStripDropDownDirection.BelowRight);
        _surface.SetHighlight(Math.Max(0, SelectedIndex));
        _surface.Focus();
        Invalidate();
    }

    private void Choose(int index)
    {
        if (index < 0 || index >= Items.Count) return;
        SelectedIndex = index;
        _popup?.Close(ToolStripDropDownCloseReason.ItemClicked);
    }
    private int FindTypedIndex(char character)
    {
        var now = Environment.TickCount64;
        _search = now - _lastTypeAhead > TypeAheadTimeoutMs ? character.ToString() : _search + character;
        _lastTypeAhead = now;
        for (var i = 0; i < Items.Count; i++)
            if ((Items[i].ToString() ?? string.Empty).StartsWith(_search, StringComparison.CurrentCultureIgnoreCase)) return i;
        _search = character.ToString();
        for (var i = 1; i <= Items.Count; i++)
        {
            var index = (Math.Max(-1, SelectedIndex) + i) % Items.Count;
            if ((Items[index].ToString() ?? string.Empty).StartsWith(_search, StringComparison.CurrentCultureIgnoreCase)) return index;
        }
        return -1;
    }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left || !Enabled || ReadOnly) return;
        Focus();
        if (Environment.TickCount64 - _lastOwnerClose < OwnerClickSuppressionMs) return;
        if (_expanded) _popup?.Close(); else OpenPopup();
    }
    protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); _hovered = true; Invalidate(); }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); _hovered = false; Invalidate(); }
    protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
    protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); Invalidate(); }
    protected override void OnEnabledChanged(EventArgs e) { base.OnEnabledChanged(e); if (!Enabled) _popup?.Close(); Invalidate(); }
    protected override void OnMouseWheel(MouseEventArgs e) => HiddenScrollPanel.ForwardMouseWheel(this, e);
    protected override bool IsInputKey(Keys keyData) => (keyData & Keys.KeyCode) is
        Keys.Down or Keys.Up or Keys.Space or Keys.Enter or Keys.Home or Keys.End or Keys.F4 || base.IsInputKey(keyData);
    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (ReadOnly) return;
        switch (e.KeyCode)
        {
            case Keys.F4: if (_expanded) _popup?.Close(); else OpenPopup(); break;
            case Keys.Down: case Keys.Up: case Keys.Space: case Keys.Enter: OpenPopup(); break;
            case Keys.Home: if (Items.Count > 0) SelectedIndex = 0; break;
            case Keys.End: if (Items.Count > 0) SelectedIndex = Items.Count - 1; break;
            default: return;
        }
        e.Handled = true; e.SuppressKeyPress = true;
    }
    protected override void OnKeyPress(KeyPressEventArgs e)
    {
        base.OnKeyPress(e);
        if (ReadOnly || char.IsControl(e.KeyChar) || Items.Count == 0) return;
        var index = FindTypedIndex(e.KeyChar);
        if (index >= 0) SelectedIndex = index;
        e.Handled = true;
    }
    protected override void Dispose(bool disposing) { if (disposing) _popup?.Dispose(); base.Dispose(disposing); }

    private sealed class PopupRenderer : ToolStripProfessionalRenderer
    {
        protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e) => e.Graphics.Clear(Theme.Surface);
        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
            using var border = new Pen(Theme.Border);
            e.Graphics.DrawRectangle(border, 0, 0, Math.Max(1, e.ToolStrip.Width - 1), Math.Max(1, e.ToolStrip.Height - 1));
        }
    }

    private sealed class DropDownSurface : Control
    {
        private readonly ModernDropDown _owner;
        private readonly int _rowHeight;
        private int _topIndex;
        private int _highlight;
        private int _wheelRemainder;
        private int VisibleRows => Math.Max(1, ClientSize.Height / Math.Max(1, _rowHeight));
        public DropDownSurface(ModernDropDown owner, int rowHeight)
        {
            _owner = owner; _rowHeight = rowHeight;
            Font = owner.Font; BackColor = Theme.Surface; TabStop = true;
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                ControlStyles.OptimizedDoubleBuffer | ControlStyles.Selectable, true);
        }
        public void SetHighlight(int index)
        {
            _highlight = Math.Clamp(index, 0, Math.Max(0, _owner.Items.Count - 1));
            if (_highlight < _topIndex) _topIndex = _highlight;
            if (_highlight >= _topIndex + VisibleRows) _topIndex = _highlight - VisibleRows + 1;
            Invalidate();
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.Clear(Theme.Surface);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            for (var row = 0; row < VisibleRows; row++)
            {
                var index = _topIndex + row;
                if (index >= _owner.Items.Count) break;
                var inset = UiMetrics.Scale(this, 4);
                var rect = new Rectangle(inset, row * _rowHeight + inset, Math.Max(1, Width - inset * 2), Math.Max(1, _rowHeight - inset * 2));
                if (index == _highlight || index == _owner.SelectedIndex)
                {
                    using var path = Theme.RoundedRect(rect, UiMetrics.Scale(this, 6));
                    using var fill = new SolidBrush(index == _owner.SelectedIndex ? Theme.AccentFill : Theme.SurfaceHover);
                    e.Graphics.FillPath(fill, path);
                }
                rect.Inflate(-UiMetrics.Scale(this, 10), 0);
                TextRenderer.DrawText(e.Graphics, _owner.Items[index].ToString(), Font, rect, Theme.Text,
                    TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding |
                    TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine);
            }
        }
        protected override void OnMouseMove(MouseEventArgs e) { base.OnMouseMove(e); var index = _topIndex + e.Y / Math.Max(1, _rowHeight); if (index >= 0 && index < _owner.Items.Count && _highlight != index) { var previous = _highlight; _highlight = index; Invalidate(new Rectangle(0, (previous - _topIndex) * _rowHeight, Width, _rowHeight)); Invalidate(new Rectangle(0, (index - _topIndex) * _rowHeight, Width, _rowHeight)); } }
        protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); if (e.Button == MouseButtons.Left) _owner.Choose(_topIndex + e.Y / Math.Max(1, _rowHeight)); }
        protected override void OnMouseWheel(MouseEventArgs e)
        {
            var lines = NativeScroll.ConsumeLines(e.Delta, ref _wheelRemainder, VisibleRows);
            _topIndex = Math.Clamp(_topIndex - lines, 0, Math.Max(0, _owner.Items.Count - VisibleRows));
            Invalidate();
            if (e is HandledMouseEventArgs handled) handled.Handled = true;
        }
        protected override bool IsInputKey(Keys keyData) => (keyData & Keys.KeyCode) is
            Keys.Down or Keys.Up or Keys.Home or Keys.End or Keys.PageDown or Keys.PageUp or Keys.Enter or Keys.Space or Keys.Escape or Keys.Tab or Keys.F4 || base.IsInputKey(keyData);
        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            switch (e.KeyCode)
            {
                case Keys.Down: SetHighlight(_highlight + 1); break;
                case Keys.Up: SetHighlight(_highlight - 1); break;
                case Keys.Home: SetHighlight(0); break;
                case Keys.End: SetHighlight(_owner.Items.Count - 1); break;
                case Keys.PageDown: SetHighlight(_highlight + VisibleRows); break;
                case Keys.PageUp: SetHighlight(_highlight - VisibleRows); break;
                case Keys.Space: case Keys.Enter: _owner.Choose(_highlight); break;
                case Keys.Escape: case Keys.F4: _owner._popup?.Close(ToolStripDropDownCloseReason.Keyboard); break;
                case Keys.Tab:
                    _owner._popup?.Close(ToolStripDropDownCloseReason.Keyboard);
                    _owner.FindForm()?.SelectNextControl(_owner, !e.Shift, true, true, true);
                    break;
                default: return;
            }
            e.Handled = true; e.SuppressKeyPress = true;
        }
        protected override void OnKeyPress(KeyPressEventArgs e)
        {
            base.OnKeyPress(e);
            if (char.IsControl(e.KeyChar)) return;
            var index = _owner.FindTypedIndex(e.KeyChar);
            if (index >= 0) SetHighlight(index);
            e.Handled = true;
        }
    }
}
