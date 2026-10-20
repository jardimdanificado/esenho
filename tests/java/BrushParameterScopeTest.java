import app.esenho.nativeengine.BrushParameterScope;
public class BrushParameterScopeTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        String pastel = BrushParameterScope.owner("pastel", 10000);
        check(BrushParameterScope.matches(pastel, "Paper Tooth", "pastel", 10000, "Paper Tooth"), "A tracked WASM control belongs to its original kernel and property");
        check(!BrushParameterScope.matches(pastel, "Paper Tooth", "smoke", 10000, "Density"), "Equal indices in different WASM brushes must not leak");
        check(!BrushParameterScope.matches(pastel, "Paper Tooth", "smoke", 10000, "Paper Tooth"), "Even identically named properties have separate tracking per brush");
        check(!BrushParameterScope.matches(pastel, "Paper Tooth", null, 10000, "Paper Tooth"), "WASM controls must disappear for classic brushes");
        check(!BrushParameterScope.matches(pastel, "Paper Tooth", "pastel", 10000, "Pressure Depth"), "Changed kernel metadata must not map a pin to a different property");
        check(!BrushParameterScope.matches("legacy-unscoped", "", "pastel", 10000, "Paper Tooth"), "Unsafe old unscoped indices must not become tracked properties");
        for (int id : new int[]{1,2,4,5,19,20}) {
            check(BrushParameterScope.matches("", "", null, id, ""), "Host controls work with classic brushes");
            check(BrushParameterScope.matches("", "", "pastel", id, ""), "Host controls work with WASM brushes");
        }
        for (int id : new int[]{3,32,39,54,-3001,-3002,-2003}) {
            check(BrushParameterScope.matches("classic", "", null, id, ""), "Classic sliders, switches and selectors can be tracked");
            check(!BrushParameterScope.matches("classic", "", "pastel", id, ""), "Classic controls must not appear on WASM brushes");
        }
        System.out.println("Tracked parameter isolation: common controls, per-WASM identity, metadata changes, switches and selectors passed.");
    }
}
