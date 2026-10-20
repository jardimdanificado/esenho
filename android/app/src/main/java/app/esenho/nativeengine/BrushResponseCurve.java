package app.esenho.nativeengine;

/** Immutable normalized response curve, shared by sliders and discrete controls. */
public final class BrushResponseCurve {
    private final float[] xs, ys, slopes;
    private final String interpolation;

    public BrushResponseCurve(float[] x, float[] y, String interpolation) {
        if (x == null || y == null || x.length != y.length || x.length < 2 || x.length > 32)
            throw new IllegalArgumentException("A curve needs 2–32 points");
        xs = x.clone(); ys = y.clone(); slopes = new float[x.length];
        this.interpolation = interpolation;
        for (int i = 0; i < xs.length; i++) {
            if (!Float.isFinite(xs[i]) || !Float.isFinite(ys[i]) || xs[i] < 0 || xs[i] > 1 || ys[i] < 0 || ys[i] > 1 ||
                    (i > 0 && xs[i] - xs[i-1] < .0001f)) throw new IllegalArgumentException("Invalid curve point");
        }
        if (xs[0] != 0 || xs[xs.length-1] != 1) throw new IllegalArgumentException("Curve endpoints must cover 0–1");
        for (int i = 0; i < xs.length; i++) {
            if (i == 0) slopes[i] = secant(0);
            else if (i == xs.length-1) slopes[i] = secant(i-1);
            else {
                float left = secant(i-1), right = secant(i);
                if (left * right <= 0) slopes[i] = 0;
                else {
                    float h0 = xs[i]-xs[i-1], h1 = xs[i+1]-xs[i];
                    float w0 = 2*h1+h0, w1 = h1+2*h0;
                    slopes[i] = (w0+w1)/(w0/left+w1/right);
                }
            }
        }
    }

    private float secant(int i) { return (ys[i+1]-ys[i])/(xs[i+1]-xs[i]); }
    public float valueAt(float input) {
        if (!Float.isFinite(input)) input = 0;
        if (input <= 0) return ys[0];
        if (input >= 1) return ys[ys.length-1];
        int i = 0;
        while (i < xs.length-2 && input >= xs[i+1]) i++;
        if ("steps".equals(interpolation)) return ys[i];
        float h = xs[i+1]-xs[i], t = (input-xs[i])/h;
        if (!"smooth".equals(interpolation)) return ys[i] + (ys[i+1]-ys[i])*t;
        float t2=t*t, t3=t2*t;
        float value = (2*t3-3*t2+1)*ys[i] + (t3-2*t2+t)*h*slopes[i] +
                (-2*t3+3*t2)*ys[i+1] + (t3-t2)*h*slopes[i+1];
        return Math.max(Math.min(ys[i], ys[i+1]), Math.min(Math.max(ys[i], ys[i+1]), value));
    }

    public static float mapOutput(float output, float low, float high, float min, float max, boolean discrete) {
        float normalized = Math.max(0, Math.min(1, low + (high-low)*output));
        float value = min + (max-min)*normalized;
        return discrete ? Math.round(value) : value;
    }
}
