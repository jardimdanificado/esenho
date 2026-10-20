import app.esenho.nativeengine.BrushPresetAliases;
import java.util.LinkedHashSet;
import java.util.List;

public class BrushPresetAliasesTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        var favorites = new LinkedHashSet<String>();
        for (String id : List.of("preset:inker", "preset:studio_inker", "preset:airbrush",
                "preset:soft_airbrush", "brush:airbrush", "preset:custom_airbrush")) {
            favorites.add(BrushPresetAliases.canonicalToolId(id));
        }
        check(favorites.equals(new LinkedHashSet<>(List.of("preset:studio_inker",
                "preset:soft_airbrush", "brush:airbrush", "preset:custom_airbrush"))),
                "Legacy and current favorites must converge without merging procedural or custom brushes");
        check(BrushPresetAliases.canonicalPresetId("airbrush").equals("soft_airbrush"),
                "An old session must restore the same airbrush");
        check(BrushPresetAliases.canonicalPresetId("inker").equals("studio_inker"),
                "An old session must restore the same inker");
        for (String id : List.of("studio_inker", "soft_airbrush", "hard_airbrush", "custom_airbrush")) {
            check(!BrushPresetAliases.isAlias(id), "Distinct presets must remain in the catalog: " + id);
            check(BrushPresetAliases.canonicalPresetId(id).equals(id), "Canonical IDs must be stable");
        }
        check(BrushPresetAliases.isAlias("inker") && BrushPresetAliases.isAlias("airbrush"),
                "Only the legacy duplicate entries are hidden");
        System.out.println("Preset aliases: unique favorites, legacy sessions and brush isolation passed.");
    }
}
