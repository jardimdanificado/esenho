package app.esenho.nativeengine;

/** Cel exposures are half-open intervals; no cel is held after its end. */
public final class AnimationExposure {
    private AnimationExposure() {}

    public static int indexAt(int[] durations, int tick) {
        if (tick < 0) return -1;
        long remaining = tick;
        for (int index = 0; index < durations.length; index++) {
            int duration = Math.max(1, durations[index]);
            if (remaining < duration) return index;
            remaining -= duration;
        }
        return -1;
    }
}
