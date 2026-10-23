using System.Drawing.Drawing2D;

namespace Server_Launcher.UI.Controls;

internal static class ModernIconPainter
{
    // Every navigation/action glyph shares one centered 20 x 20 coordinate system.
    public const int ViewBox = 20;
    private const float StrokeWidth = 1.5f;
    private const int GearTeeth = 8;
    private const float GearOuterRadius = 8f;
    private const float GearRootRadius = 6.3f;
    public static bool IsCaption(ModernIcon icon) => icon is ModernIcon.Minimize or ModernIcon.Maximize or ModernIcon.Restore or ModernIcon.Close;

    public static void DrawCaption(Graphics graphics, Rectangle bounds, ModernIcon icon, Color color, int dpi)
    {
        var size = Math.Max(8, (int)Math.Round(UiMetrics.WindowGlyphSize * dpi / (double)UiMetrics.BaseDpi));
        var stroke = Math.Max(1, (int)Math.Round(dpi / (double)UiMetrics.BaseDpi));
        var left = bounds.Left + (bounds.Width - size) / 2;
        var top = bounds.Top + (bounds.Height - size) / 2;
        var right = left + size - 1;
        var bottom = top + size - 1;
        var state = graphics.Save();
        graphics.SmoothingMode = SmoothingMode.None;
        graphics.PixelOffsetMode = PixelOffsetMode.Default;
        using var pen = new Pen(color, stroke) { Alignment = PenAlignment.Center };
        switch (icon)
        {
            case ModernIcon.Minimize:
                graphics.DrawLine(pen, left, top + size / 2, right, top + size / 2);
                break;
            case ModernIcon.Maximize:
                graphics.DrawRectangle(pen, left, top, size - 1, size - 1);
                break;
            case ModernIcon.Restore:
                var offset = Math.Max(2, (int)Math.Round(2 * dpi / (double)UiMetrics.BaseDpi));
                graphics.DrawLines(pen, new[] { new Point(left + offset, top + offset), new Point(left + offset, top),
                    new Point(right, top), new Point(right, bottom - offset), new Point(right - offset, bottom - offset) });
                graphics.DrawRectangle(pen, left, top + offset, size - offset - 1, size - offset - 1);
                break;
            case ModernIcon.Close:
                graphics.DrawLine(pen, left, top, right, bottom);
                graphics.DrawLine(pen, right, top, left, bottom);
                break;
        }
        graphics.Restore(state);
    }

    public static void DrawCentered(Graphics graphics, Rectangle bounds, ModernIcon icon, Color color, int pixelSize)
    {
        var size = Math.Min(pixelSize, Math.Min(bounds.Width, bounds.Height));
        if (size <= 0) return;
        var left = bounds.Left + (bounds.Width - size) / 2;
        var top = bounds.Top + (bounds.Height - size) / 2;
        var state = graphics.Save();
        graphics.TranslateTransform(left, top);
        graphics.ScaleTransform(size / (float)ViewBox, size / (float)ViewBox);
        Draw(graphics, icon, color);
        graphics.Restore(state);
    }

    public static void Draw(Graphics graphics, ModernIcon icon, Color color)
    {
        using var pen = new Pen(color, StrokeWidth) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        using var brush = new SolidBrush(color);
        switch (icon)
        {
            case ModernIcon.Edit:
                graphics.DrawPolygon(pen, new[] { new Point(4, 12), new Point(13, 3), new Point(17, 7), new Point(8, 16), new Point(3, 17) });
                graphics.DrawLine(pen, 11, 5, 15, 9);
                break;
            case ModernIcon.Plus:
                graphics.DrawLine(pen, 10, 4, 10, 16); graphics.DrawLine(pen, 4, 10, 16, 10);
                break;
            case ModernIcon.Console:
                graphics.DrawRectangle(pen, 2, 3, 16, 14);
                graphics.DrawLines(pen, new[] { new Point(5, 7), new Point(8, 10), new Point(5, 13) });
                graphics.DrawLine(pen, 11, 13, 15, 13);
                break;
            case ModernIcon.Content:
                graphics.DrawPolygon(pen, new[] { new Point(10, 2), new Point(18, 6), new Point(10, 10), new Point(2, 6) });
                graphics.DrawLines(pen, new[] { new Point(2, 10), new Point(10, 14), new Point(18, 10) });
                graphics.DrawLines(pen, new[] { new Point(2, 14), new Point(10, 18), new Point(18, 14) });
                break;
            case ModernIcon.Plugins:
                using (var puzzle = new GraphicsPath())
                {
                    puzzle.AddLines(new[] { new PointF(3, 6), new PointF(8, 6), new PointF(8, 4) });
                    puzzle.AddArc(8, 2, 4, 4, 180, 180);
                    puzzle.AddLines(new[] { new PointF(12, 4), new PointF(12, 6), new PointF(17, 6), new PointF(17, 10), new PointF(15.5f, 10) });
                    puzzle.AddArc(13.5f, 10, 4, 4, 270, -180);
                    puzzle.AddLines(new[] { new PointF(15.5f, 14), new PointF(17, 14), new PointF(17, 18), new PointF(3, 18), new PointF(3, 14), new PointF(4.5f, 14) });
                    puzzle.AddArc(2.5f, 10, 4, 4, 90, -180);
                    puzzle.AddLine(4.5f, 10, 3, 10); puzzle.CloseFigure();
                    graphics.DrawPath(pen, puzzle);
                }
                break;
            case ModernIcon.World:
                graphics.DrawEllipse(pen, 2, 2, 16, 16);
                graphics.DrawEllipse(pen, 6, 2, 8, 16);
                graphics.DrawLine(pen, 2, 10, 18, 10);
                break;
            case ModernIcon.Play:
                graphics.FillPolygon(brush, new[] { new Point(7, 4), new Point(16, 10), new Point(7, 16) });
                break;
            case ModernIcon.Stop:
                graphics.FillRectangle(brush, 5, 5, 10, 10);
                break;
            case ModernIcon.Restart:
            case ModernIcon.Refresh:
                graphics.DrawArc(pen, 3, 3, 14, 14, 35, 285);
                graphics.DrawLines(pen, new[] { new Point(17, 3), new Point(17, 8), new Point(12, 8) });
                break;
            case ModernIcon.Send:
                graphics.DrawPolygon(pen, new[] { new Point(2, 3), new Point(18, 10), new Point(2, 17), new Point(6, 10) });
                graphics.DrawLine(pen, 6, 10, 18, 10);
                break;
            case ModernIcon.Folder:
                graphics.DrawPolygon(pen, new[] { new Point(2, 4), new Point(8, 4), new Point(10, 7),
                    new Point(18, 7), new Point(18, 16), new Point(2, 16) });
                break;
            case ModernIcon.Trash:
                graphics.DrawRectangle(pen, 5, 6, 10, 11);
                graphics.DrawLine(pen, 3, 5, 17, 5); graphics.DrawLine(pen, 7, 3, 13, 3);
                graphics.DrawLine(pen, 8, 9, 8, 14); graphics.DrawLine(pen, 12, 9, 12, 14);
                break;
            case ModernIcon.Settings:
                var gear = new PointF[GearTeeth * 4];
                for (var i = 0; i < gear.Length; i++)
                {
                    var angle = (i - 1.5) * Math.PI * 2 / gear.Length - Math.PI / 2;
                    var radius = i % 4 is 1 or 2 ? GearOuterRadius : GearRootRadius;
                    gear[i] = new PointF(10 + (float)Math.Cos(angle) * radius, 10 + (float)Math.Sin(angle) * radius);
                }
                graphics.DrawPolygon(pen, gear);
                graphics.DrawEllipse(pen, 6.8f, 6.8f, 6.4f, 6.4f);
                break;
            case ModernIcon.Clear:
                graphics.DrawPolygon(pen, new[] { new Point(3, 12), new Point(11, 3), new Point(18, 10), new Point(11, 17), new Point(7, 17) });
                graphics.DrawLine(pen, 8, 7, 15, 14);
                graphics.DrawLine(pen, 10, 17, 18, 17);
                break;
            case ModernIcon.Save:
                graphics.DrawPolygon(pen, new[] { new Point(3, 2), new Point(14, 2), new Point(17, 5), new Point(17, 18), new Point(3, 18) });
                graphics.DrawRectangle(pen, 6, 2, 7, 5); graphics.DrawRectangle(pen, 6, 11, 8, 7);
                break;
        }
    }
}
