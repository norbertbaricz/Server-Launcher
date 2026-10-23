using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Server_Launcher.UI.Controls;

internal static class NativeScroll
{
    // Win32 constants used only by the native text editors. Form bodies use the
    // custom viewport below and never enable Windows' automatic scrollbars.
    public const int MouseWheelMessage = 0x020A;
    public const int HorizontalMouseWheelMessage = 0x020E;
    public const int WheelDelta = 120;
    private const int ScrollStyles = 0x00200000 | 0x00100000;
    private const int EmLineScroll = 0x00B6;
    private const int StyleChangingMessage = 0x007C;
    private const int WindowStyleIndex = -16;
    private const int NewStyleOffset = 4;

    [DllImport("user32.dll", EntryPoint = "SendMessageW")]
    private static extern IntPtr SendMessage(IntPtr handle, int message, IntPtr wParam, IntPtr lParam);

    public static CreateParams WithoutBars(CreateParams parameters)
    {
        parameters.Style &= ~ScrollStyles;
        return parameters;
    }

    public static bool SuppressBarStyles(ref Message message)
    {
        if (message.Msg != StyleChangingMessage || unchecked((int)message.WParam.ToInt64()) != WindowStyleIndex || message.LParam == IntPtr.Zero)
            return false;
        var proposed = Marshal.ReadInt32(message.LParam, NewStyleOffset);
        Marshal.WriteInt32(message.LParam, NewStyleOffset, proposed & ~ScrollStyles);
        message.Result = IntPtr.Zero;
        return true;
    }

    public static int WheelDeltaFromMessage(Message message) => (short)((message.WParam.ToInt64() >> 16) & 0xffff);

    public static int ConsumeLines(int delta, ref int remainder, int pageLines)
    {
        remainder += delta;
        var notches = remainder / WheelDelta;
        remainder %= WheelDelta;
        var lines = SystemInformation.MouseWheelScrollLines;
        return notches * (lines < 0 ? Math.Max(1, pageLines) : lines);
    }

    public static bool ScrollText(Control control, ref Message message, ref int remainder)
    {
        if (message.Msg != MouseWheelMessage && message.Msg != HorizontalMouseWheelMessage) return false;
        var delta = WheelDeltaFromMessage(message);
        var lines = ConsumeLines(delta, ref remainder, control.ClientSize.Height / Math.Max(1, control.Font.Height));
        var horizontal = message.Msg == HorizontalMouseWheelMessage || (Control.ModifierKeys & Keys.Shift) != 0;
        if (!horizontal && control is TextBoxBase text && text.GetLineFromCharIndex(text.TextLength) + 1 <= Math.Max(1, control.ClientSize.Height / Math.Max(1, control.Font.Height)))
        {
            HiddenScrollPanel.ScrollAncestor(control, delta);
            message.Result = IntPtr.Zero;
            return true;
        }
        var horizontalLines = message.Msg == HorizontalMouseWheelMessage ? lines : -lines;
        SendMessage(control.Handle, EmLineScroll, horizontal ? (IntPtr)horizontalLines : IntPtr.Zero,
            horizontal ? IntPtr.Zero : (IntPtr)(-lines));
        message.Result = IntPtr.Zero;
        return true;
    }
}

internal sealed class HiddenScrollPanel : Panel
{
    // EASY-TO-TUNE VIEWPORT VALUES, in logical pixels. Padding belongs to the
    // fixed viewport; scrolling never moves content over a title bar or footer.
    private const int KeyboardPageOverlap = 32;
    private const int FocusInset = 4;
    private readonly ViewportSurface _viewport = new() { Dock = DockStyle.Fill };
    private readonly ViewportSurface _canvas = new();
    private Size _minimumContentSize;
    private Point _offset;
    private int _verticalRemainder;
    private int _horizontalRemainder;
    private int _layoutDpi = UiMetrics.BaseDpi;
    private bool _arranging;
    private bool _scrollingEnabled = true;

    public ControlCollection ContentControls => _canvas.Controls;

    // This is a manually translated canvas, not ScrollableControl.AutoScroll.
    // Even callers using a Panel/ScrollableControl reference cannot turn on bars.
    public override bool AutoScroll { get => false; set => base.AutoScroll = false; }

    [DefaultValue(true)]
    public bool ScrollingEnabled
    {
        get => _scrollingEnabled;
        set { if (_scrollingEnabled == value) return; _scrollingEnabled = value; ArrangeContent(); }
    }

    // Logical dimensions exclude the fixed outer Padding and scale with the DPI.
    [DefaultValue(typeof(Size), "0, 0")]
    public Size MinimumContentSize
    {
        get => _minimumContentSize;
        set
        {
            var size = new Size(Math.Max(0, value.Width), Math.Max(0, value.Height));
            if (_minimumContentSize == size) return;
            _minimumContentSize = size; ArrangeContent();
        }
    }

    public HiddenScrollPanel()
    {
        DoubleBuffered = true;
        TabStop = false;
        base.AutoScroll = false;
        _viewport.Controls.Add(_canvas);
        Controls.Add(_viewport);
        _viewport.SizeChanged += (_, _) => ArrangeContent();
        _canvas.Layout += (_, _) => ArrangeContent();
        _canvas.ControlAdded += ContentAdded;
        _canvas.ControlRemoved += ContentRemoved;
        SynchronizeBackground();
    }

    protected override CreateParams CreateParams => NativeScroll.WithoutBars(base.CreateParams);
    protected override void OnLayout(LayoutEventArgs e) { base.OnLayout(e); ArrangeContent(); }
    protected override void OnBackColorChanged(EventArgs e) { base.OnBackColorChanged(e); SynchronizeBackground(); }
    protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); _layoutDpi = DeviceDpi; ArrangeContent(); }
    protected override void OnDpiChangedAfterParent(EventArgs e)
    {
        base.OnDpiChangedAfterParent(e);
        var factor = DeviceDpi / (double)Math.Max(1, _layoutDpi);
        _offset = new Point((int)Math.Round(_offset.X * factor), (int)Math.Round(_offset.Y * factor));
        _layoutDpi = DeviceDpi;
        ArrangeContent();
    }

    private void SynchronizeBackground()
    {
        if (_viewport is null || _canvas is null) return;
        _viewport.BackColor = _canvas.BackColor = BackColor;
    }

    private void ArrangeContent()
    {
        if (_arranging || IsDisposed || Disposing || _viewport is null || _canvas is null) return;
        _arranging = true;
        try
        {
            var viewport = _viewport.ClientSize;
            var width = ScrollingEnabled ? UiMetrics.Scale(this, MinimumContentSize.Width) : 0;
            var height = ScrollingEnabled ? UiMetrics.Scale(this, MinimumContentSize.Height) : 0;
            if (ScrollingEnabled)
            {
                var dockedHeight = 0;
                var dockedWidth = 0;
                foreach (Control child in _canvas.Controls)
                {
                    if (child.IsDisposed) continue;
                    switch (child.Dock)
                    {
                        case DockStyle.Top: case DockStyle.Bottom: dockedHeight += child.Height; break;
                        case DockStyle.Left: case DockStyle.Right: dockedWidth += child.Width; break;
                        case DockStyle.None:
                            width = Math.Max(width, child.Right);
                            height = Math.Max(height, child.Bottom);
                            break;
                    }
                }
                width = Math.Max(width, dockedWidth);
                height = Math.Max(height, dockedHeight);
            }
            var size = new Size(Math.Max(1, Math.Max(viewport.Width, width)), Math.Max(1, Math.Max(viewport.Height, height)));
            _canvas.SuspendLayout();
            try
            {
                if (_canvas.Size != size) _canvas.Size = size;
                _offset = ClampOffset(_offset);
                var location = new Point(-_offset.X, -_offset.Y);
                if (_canvas.Location != location) _canvas.Location = location;
            }
            finally { _canvas.ResumeLayout(true); }
        }
        finally { _arranging = false; }
    }

    private Point ClampOffset(Point value) => ScrollingEnabled
        ? new Point(Math.Clamp(value.X, 0, Math.Max(0, _canvas.Width - _viewport.ClientSize.Width)),
            Math.Clamp(value.Y, 0, Math.Max(0, _canvas.Height - _viewport.ClientSize.Height)))
        : Point.Empty;

    private bool MoveTo(Point value)
    {
        var next = ClampOffset(value);
        if (next == _offset) return false;
        _offset = next;
        _canvas.Location = new Point(-next.X, -next.Y);
        return true;
    }

    public bool ScrollWheel(int delta, bool horizontal = false)
    {
        horizontal |= (ModifierKeys & Keys.Shift) != 0;
        if (!ScrollingEnabled) return false;
        var maximum = horizontal ? _canvas.Width - _viewport.ClientSize.Width : _canvas.Height - _viewport.ClientSize.Height;
        if (maximum <= 0) return false;
        var page = horizontal ? _viewport.ClientSize.Width : _viewport.ClientSize.Height;
        var lines = horizontal
            ? NativeScroll.ConsumeLines(delta, ref _horizontalRemainder, page / Math.Max(1, Font.Height))
            : NativeScroll.ConsumeLines(delta, ref _verticalRemainder, page / Math.Max(1, Font.Height));
        var distance = lines * Font.Height;
        MoveTo(horizontal ? new Point(_offset.X - distance, _offset.Y) : new Point(_offset.X, _offset.Y - distance));
        return true;
    }

    public static void ScrollAncestor(Control source, int delta, bool horizontal = false)
    {
        for (Control? parent = source.Parent; parent is not null; parent = parent.Parent)
            if (parent is HiddenScrollPanel panel && panel.ScrollWheel(delta, horizontal)) return;
    }

    public static void ForwardMouseWheel(Control source, MouseEventArgs e)
    {
        ScrollAncestor(source, e.Delta);
        if (e is HandledMouseEventArgs handled) handled.Handled = true;
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if (!ScrollWheel(e.Delta)) ScrollAncestor(this, e.Delta);
        if (e is HandledMouseEventArgs handled) handled.Handled = true;
    }

    protected override bool ProcessCmdKey(ref Message message, Keys keyData)
    {
        if (keyData is Keys.PageDown or Keys.PageUp)
        {
            var page = Math.Max(1, _viewport.ClientSize.Height - UiMetrics.Scale(this, KeyboardPageOverlap));
            if (MoveTo(new Point(_offset.X, _offset.Y + (keyData == Keys.PageDown ? page : -page)))) return true;
        }
        return base.ProcessCmdKey(ref message, keyData);
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == NativeScroll.HorizontalMouseWheelMessage)
        {
            if (!ScrollWheel(-NativeScroll.WheelDeltaFromMessage(message), horizontal: true))
                ScrollAncestor(this, -NativeScroll.WheelDeltaFromMessage(message), horizontal: true);
            message.Result = IntPtr.Zero;
            return;
        }
        base.WndProc(ref message);
    }

    private void ContentAdded(object? sender, ControlEventArgs e)
    {
        if (e.Control is null) return;
        ObserveTree(e.Control);
        e.Control.SizeChanged += ContentSizeChanged;
        ArrangeContent();
    }
    private void ContentRemoved(object? sender, ControlEventArgs e)
    {
        if (e.Control is null) return;
        UnobserveTree(e.Control);
        e.Control.SizeChanged -= ContentSizeChanged;
        ArrangeContent();
    }
    private void ContentSizeChanged(object? sender, EventArgs e) => ArrangeContent();
    private void DescendantAdded(object? sender, ControlEventArgs e) { if (e.Control is not null) ObserveTree(e.Control); }
    private void DescendantRemoved(object? sender, ControlEventArgs e) { if (e.Control is not null) UnobserveTree(e.Control); }
    private void ObserveTree(Control control)
    {
        control.GotFocus += RevealKeyboardFocus;
        control.ControlAdded += DescendantAdded;
        control.ControlRemoved += DescendantRemoved;
        foreach (Control child in control.Controls) ObserveTree(child);
    }
    private void UnobserveTree(Control control)
    {
        control.GotFocus -= RevealKeyboardFocus;
        control.ControlAdded -= DescendantAdded;
        control.ControlRemoved -= DescendantRemoved;
        foreach (Control child in control.Controls) UnobserveTree(child);
    }
    private void RevealKeyboardFocus(object? sender, EventArgs e)
    {
        // A mouse press must not move the button before its matching MouseUp.
        if (sender is not Control control || !control.Focused || MouseButtons != MouseButtons.None || !ScrollingEnabled || IsDisposed || Disposing) return;
        var bounds = _canvas.RectangleToClient(control.RectangleToScreen(control.ClientRectangle));
        var inset = UiMetrics.Scale(this, FocusInset);
        var x = _offset.X;
        var y = _offset.Y;
        if (bounds.Left < x) x = bounds.Left - inset;
        else if (bounds.Right > x + _viewport.ClientSize.Width) x = bounds.Width > _viewport.ClientSize.Width ? bounds.Left : bounds.Right - _viewport.ClientSize.Width + inset;
        if (bounds.Top < y) y = bounds.Top - inset;
        else if (bounds.Bottom > y + _viewport.ClientSize.Height) y = bounds.Height > _viewport.ClientSize.Height ? bounds.Top : bounds.Bottom - _viewport.ClientSize.Height + inset;
        MoveTo(new Point(x, y));
    }

    private sealed class ViewportSurface : Panel
    {
        public override bool AutoScroll { get => false; set => base.AutoScroll = false; }
        public ViewportSurface()
        {
            DoubleBuffered = true;
            TabStop = false;
            Margin = Padding.Empty;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        }
        protected override CreateParams CreateParams => NativeScroll.WithoutBars(base.CreateParams);
    }
}

internal sealed class HiddenScrollTextBox : TextBox
{
    private int _wheelRemainder;
    public HiddenScrollTextBox() { BorderStyle = BorderStyle.None; ScrollBars = ScrollBars.None; }
    protected override CreateParams CreateParams => NativeScroll.WithoutBars(base.CreateParams);
    protected override void WndProc(ref Message message)
    {
        if (message.Msg is NativeScroll.MouseWheelMessage or NativeScroll.HorizontalMouseWheelMessage)
        {
            if (Multiline) NativeScroll.ScrollText(this, ref message, ref _wheelRemainder);
            else
            {
                var horizontal = message.Msg == NativeScroll.HorizontalMouseWheelMessage;
                var delta = NativeScroll.WheelDeltaFromMessage(message);
                HiddenScrollPanel.ScrollAncestor(this, horizontal ? -delta : delta, horizontal);
            }
            message.Result = IntPtr.Zero;
            return;
        }
        if (NativeScroll.SuppressBarStyles(ref message)) return;
        base.WndProc(ref message);
    }
}
