package app.esenho.nativeengine;

/** Legacy preset IDs that refer to the same shipped brush. */
public final class BrushPresetAliases {
    private BrushPresetAliases() {}

    public static String canonicalPresetId(String id) {
        if ("inker".equals(id)) return "studio_inker";
        if ("airbrush".equals(id)) return "soft_airbrush";
        return id;
    }

    public static boolean isAlias(String id) {
        return id != null && !id.equals(canonicalPresetId(id));
    }

    public static String canonicalToolId(String id) {
        if (id != null && id.startsWith("preset:")) {
            return "preset:" + canonicalPresetId(id.substring("preset:".length()));
        }
        return id;
    }
}
