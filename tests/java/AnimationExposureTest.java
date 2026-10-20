import app.esenho.nativeengine.AnimationExposure;

public class AnimationExposureTest {
    private static void expect(int[] durations, int tick, int expected) {
        int actual = AnimationExposure.indexAt(durations, tick);
        if (actual != expected) {
            throw new AssertionError("Tick " + tick + ": expected " + expected + ", got " + actual);
        }
    }

    public static void main(String[] args) {
        int[] track = {2, 3};
        expect(track, 0, 0);
        expect(track, 1, 0);
        expect(track, 2, 1);
        expect(track, 4, 1);
        expect(track, 5, -1);
        expect(track, 500, -1);
        expect(track, -1, -1);
        expect(new int[0], 0, -1);
        expect(new int[]{1}, 0, 0);
        expect(new int[]{1}, 1, -1);

        // A shorter layer must disappear while another layer still has cels.
        int[] longer = {8};
        for (int tick = 5; tick < 8; tick++) {
            expect(track, tick, -1);
            expect(longer, tick, 0);
        }
        expect(new int[]{0, -2, 2}, 0, 0);
        expect(new int[]{0, -2, 2}, 1, 1);
        expect(new int[]{0, -2, 2}, 2, 2);
        expect(new int[]{0, -2, 2}, 4, -1);
        expect(new int[]{Integer.MAX_VALUE, 2}, Integer.MAX_VALUE, 1);

        // Resizing a cel changes its exposure and the start of following cels.
        track[0] = 4;
        expect(track, 3, 0);
        expect(track, 4, 1);
        expect(track, 6, 1);
        expect(track, 7, -1);
        System.out.println("Animation exposures: boundaries, expired tracks, duration edits and empty tracks passed.");
    }
}
