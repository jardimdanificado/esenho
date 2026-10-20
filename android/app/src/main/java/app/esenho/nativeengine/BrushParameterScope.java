package app.esenho.nativeengine;

/** Identity of tracked controls: shared host controls, classic controls, or one WASM kernel. */
public final class BrushParameterScope {
    private BrushParameterScope() {}
    public static boolean isCommon(int id) {
        return id == 1 || id == 2 || id == 4 || id == 5 || id == 19 || id == 20;
    }
    public static String owner(String wasmBrushId, int id) {
        if (isCommon(id)) return "";
        return id >= 10000 && wasmBrushId != null ? "wasm:" + wasmBrushId : "classic";
    }
    public static boolean matches(String storedOwner, String storedName, String wasmBrushId, int id, String currentName) {
        if (id >= 10000) {
            return wasmBrushId != null && ("wasm:" + wasmBrushId).equals(storedOwner)
                && storedName != null && !storedName.isEmpty() && storedName.equals(currentName);
        }
        if (wasmBrushId != null && !isCommon(id)) return false;
        return owner(wasmBrushId, id).equals(storedOwner);
    }
}
