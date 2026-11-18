// Run after desktop build:
// java --class-path 'desktop/build/install/esenho-desktop/lib/*' scripts/BenchmarkDesktopCanvas.java
// Exercise the real document display overload, including idle pan frames.
import app.esenho.desktop.graphics.Bitmap;
import app.esenho.desktop.graphics.Canvas;
import app.esenho.desktop.graphics.Paint;
import app.esenho.desktop.graphics.Rect;
import app.esenho.desktop.graphics.RectF;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;

public class BenchmarkDesktopCanvas {
    public static void main(String[] args) {
        for (float zoom : new float[] {0.125f, 1f, 4f}) {
            int size = zoom < 0.5f ? 1024 : 4096;
            Bitmap bitmap = new Bitmap(size, size);
            bitmap.toImage();
            BufferedImage target = new BufferedImage(1000, 800, BufferedImage.TYPE_INT_ARGB_PRE);
            Graphics2D graphics = target.createGraphics();
            try {
                graphics.scale(zoom, zoom);
                Canvas canvas = new Canvas(graphics, 1000, 800);
                Paint paint = new Paint();
                RectF documentBounds = new RectF(0, 0, 4096, 4096);
                long start = System.nanoTime();
                for (int frame = 0; frame < 3; frame++) {
                    canvas.drawBitmap(bitmap, (Rect) null, documentBounds, paint);
                }
                System.out.printf("zoom %.3f: %.1f ms/draw%n", zoom, (System.nanoTime() - start) / 3e6);
            } finally {
                graphics.dispose();
            }
        }
    }
}
