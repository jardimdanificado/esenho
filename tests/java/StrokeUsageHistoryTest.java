import app.esenho.nativeengine.StrokeUsageHistory;
import java.util.ArrayList;
import java.util.List;

public class StrokeUsageHistoryTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        var usage = new StrokeUsageHistory();
        List<String> brushes = new ArrayList<>();
        List<Integer> colors = new ArrayList<>();
        check(usage.commit(brushes, colors) == 0, "Choosing controls alone must not create history");
        usage.begin("brush:pastel", 0xff123456);
        check(brushes.isEmpty() && colors.isEmpty(), "Unfinished strokes must not be committed");
        usage.cancel();
        check(usage.commit(brushes, colors) == 0, "Canceled strokes must not enter histories");
        usage.begin("brush:pastel", 0xff123456);
        check(usage.commit(brushes, colors) == 3, "A completed paint stroke records brush and color");
        check(brushes.equals(List.of("brush:pastel")) && colors.equals(List.of(0xff123456)), "Store stroke selections");
        check(usage.commit(brushes, colors) == 0, "One completed stroke must only commit once");
        usage.begin("preset:eraser", null);
        usage.commit(brushes, colors);
        check(colors.size() == 1, "Erasing must not register an unused paint color");
        usage.begin("brush:pastel", 0xff123456);
        usage.commit(brushes, colors);
        check(brushes.equals(List.of("brush:pastel", "preset:eraser")), "Reusing a brush moves it to the front without duplicates");
        for (int i = 0; i < 40; i++) {
            usage.begin("brush:" + i, i);
            usage.commit(brushes, colors);
        }
        check(brushes.size() == 24 && colors.size() == 16, "Both histories stay bounded");
        check(brushes.get(0).equals("brush:39") && colors.get(0) == 39, "Most recently used entries lead");
        System.out.println("Stroke history: preview, completed strokes, cancellation, eraser, MRU and limits passed.");
    }
}
