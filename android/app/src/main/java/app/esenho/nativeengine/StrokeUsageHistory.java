package app.esenho.nativeengine;

import java.util.List;

/** A selection is only a preview; completed canvas strokes commit their usage. */
public final class StrokeUsageHistory {
    public static final int BRUSH_CHANGED = 1;
    public static final int COLOR_CHANGED = 2;
    private String brush;
    private Integer color;

    public void begin(String brushId, Integer strokeColor) {
        brush = brushId;
        color = strokeColor;
    }

    public void cancel() {
        brush = null;
        color = null;
    }

    public int commit(List<String> brushes, List<Integer> colors) {
        int changed = 0;
        if (markUsed(brushes, brush, 24)) changed |= BRUSH_CHANGED;
        if (markUsed(colors, color, 16)) changed |= COLOR_CHANGED;
        cancel();
        return changed;
    }

    private static <T> boolean markUsed(List<T> values, T value, int limit) {
        if (value == null || (!values.isEmpty() && value.equals(values.get(0)))) return false;
        values.remove(value);
        values.add(0, value);
        while (values.size() > limit) values.remove(values.size() - 1);
        return true;
    }
}
