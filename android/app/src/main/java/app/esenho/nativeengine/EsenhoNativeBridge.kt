package app.esenho.nativeengine

import android.graphics.Bitmap

/**
 * Direct JNI bindings for the C Quadro drawing and raster engine.
 */
object EsenhoNativeBridge {
    init {
        System.loadLibrary("esenho_core")
    }

    external fun nativeInit(width: Int, height: Int)
    external fun nativeResize(width: Int, height: Int)
    external fun nativeStrokeExt(
        state: Int,
        x0: Float,
        y0: Float,
        x1: Float,
        y1: Float,
        color: Int,
        eraser: Int,
        pressure: Int,
        tiltX: Int,
        tiltY: Int
    )
    external fun nativeBrushSetParam(paramId: Int, value: Int)
    external fun nativeBrushSetType(type: Int)
    external fun nativeBrushSetShape(shape: Int)
    external fun nativeBrushReset()
    external fun nativeRenderToBitmap(bitmap: Bitmap): Boolean

    external fun nativeLayerAdd(): Int
    external fun nativeLayerSelect(idx: Int)
    external fun nativeLayerGetActive(): Int
    external fun nativeLayerClear(idx: Int)
    external fun nativeLayerDelete(idx: Int)
    external fun nativeLayerSetOpacity(idx: Int, opacity: Int)
    external fun nativeLayerSetVisible(idx: Int, visible: Int)
    external fun nativeLayerGetCount(): Int

    external fun nativeDrawLine(x0: Int, y0: Int, x1: Int, y1: Int, color: Int)
    external fun nativeDrawRect(x: Int, y: Int, w: Int, h: Int, color: Int)
    external fun nativeDrawCircle(cx: Int, cy: Int, r: Int, color: Int)
    external fun nativeDrawGrid(step: Int, color: Int)

    external fun nativeHasDirtyRect(): Int
    external fun nativeClearDirtyBounds()
}
