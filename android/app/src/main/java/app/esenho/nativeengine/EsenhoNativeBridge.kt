package app.esenho.nativeengine

import android.graphics.Bitmap

/**
 * Direct JNI bindings for the C Quadro drawing, layers, filters, and procedural brushes.
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

    // Native C Memory Undo / Redo
    external fun nativePushUndo()
    external fun nativeUndo(): Boolean
    external fun nativeRedo(): Boolean
    external fun nativeCanUndo(): Boolean
    external fun nativeCanRedo(): Boolean
    external fun nativeCancelStroke()

    // Brush Selection & Dynamic Parameters
    external fun nativeGetBrushCount(): Int
    external fun nativeGetBrushInfo(idx: Int): String
    external fun nativeSelectBrush(brushId: String?): Boolean
    external fun nativeSetBrushParam(paramIdx: Int, value: Int)
    external fun nativeBrushSetSize(size: Float)

    // Classic brush params
    external fun nativeBrushSetParam(paramId: Int, value: Int)
    external fun nativeBrushSetType(type: Int)
    external fun nativeBrushSetShape(shape: Int)
    external fun nativeSelectShape(shapeName: String?): Int
    external fun nativeSelectTexture(textureName: String?): Int
    external fun nativeBrushReset()

    // Filters Suite
    external fun nativeGetFilterCount(): Int
    external fun nativeGetFilterInfo(idx: Int): String
    external fun nativeApplyFilter(filterId: String, p1: Int, p2: Int): Boolean

    // Eyedropper
    external fun nativePickColor(x: Int, y: Int, sampleComposite: Int): Int

    // Layer Operations (Full Stack)
    external fun nativeLayerAdd(): Int
    external fun nativeLayerDuplicate(idx: Int): Int
    external fun nativeLayerSelect(idx: Int)
    external fun nativeLayerGetActive(): Int
    external fun nativeLayerClear(idx: Int)
    external fun nativeLayerDelete(idx: Int)
    external fun nativeLayerSetOpacity(idx: Int, opacity: Int)
    external fun nativeLayerGetOpacity(idx: Int): Int
    external fun nativeLayerSetVisible(idx: Int, visible: Int)
    external fun nativeLayerGetVisible(idx: Int): Int
    external fun nativeLayerSetBlendMode(idx: Int, mode: Int)
    external fun nativeLayerGetBlendMode(idx: Int): Int
    external fun nativeLayerSetAlphaLock(idx: Int, lock: Int)
    external fun nativeLayerGetAlphaLock(idx: Int): Int
    external fun nativeLayerSetClipping(idx: Int, clip: Int)
    external fun nativeLayerGetClipping(idx: Int): Int
    external fun nativeLayerMoveUp(idx: Int): Int
    external fun nativeLayerMoveDown(idx: Int): Int
    external fun nativeLayerMergeDown(idx: Int): Int
    external fun nativeLayerGetCount(): Int
    external fun nativeLayerGetOrder(pos: Int): Int

    // Shapes & Buffers
    external fun nativeRenderToBitmap(bitmap: Bitmap): Boolean
    external fun nativeLayerGetBitmap(layerIdx: Int, bitmap: Bitmap): Boolean
    external fun nativeDrawLine(x0: Int, y0: Int, x1: Int, y1: Int, color: Int)
    external fun nativeDrawRect(x: Int, y: Int, w: Int, h: Int, color: Int)
    external fun nativeDrawCircle(cx: Int, cy: Int, r: Int, color: Int)
    external fun nativeDrawGrid(step: Int, color: Int)

    external fun nativeHasDirtyRect(): Int
    external fun nativeClearDirtyBounds()

    // Selection
    external fun nativeSelectRect(x: Int, y: Int, w: Int, h: Int, opMode: Int)
    external fun nativeSelectLasso(pointsXy: IntArray, pointCount: Int, opMode: Int)
    external fun nativeSelectWand(layerIdx: Int, seedX: Int, seedY: Int, tolerance: Int, contiguous: Int, opMode: Int): Int
    external fun nativeSelectAll(opMode: Int)
    external fun nativeSelectClear()
    external fun nativeSelectInvert()
    external fun nativeSelectGetInfo(outWords: IntArray): Boolean
    external fun nativeSelectGetMask(outBuffer: ByteArray): Boolean
    external fun nativeClearSelectedPixels()

    // Flip & Transform
    external fun nativeLayerFlipH(layerIdx: Int)
    external fun nativeLayerFlipV(layerIdx: Int)
    external fun nativeCanvasFlipH()
    external fun nativeCanvasFlipV()
    external fun nativeLayerDrawBitmap(layerIdx: Int, bitmap: Bitmap, dstX: Int, dstY: Int, dstW: Int, dstH: Int)
}
