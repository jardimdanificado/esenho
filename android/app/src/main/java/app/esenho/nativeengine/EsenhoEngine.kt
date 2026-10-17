package app.esenho.nativeengine

import android.graphics.Bitmap
import android.graphics.Color
import java.util.ArrayDeque

enum class ToolMode(val id: Int) {
    BRUSH(0),
    ERASER(0),
    SMUDGE(1),
    LINE(6),
    RECTANGLE(7),
    CIRCLE(8)
}

enum class BrushPreset(val displayName: String, val size: Float, val opacity: Float, val hardness: Int, val smooth: Int) {
    INK_PEN("Caneta Tinteiro", 4f, 1.0f, 95, 40),
    PENCIL("Lápis HB", 3f, 0.7f, 30, 20),
    MARKER("Marcador", 28f, 0.6f, 85, 25),
    BRUSH("Pincel Artístico", 18f, 0.9f, 60, 50),
    AIRBRUSH("Aerógrafo", 45f, 0.35f, 10, 10),
    ERASER("Borracha Macia", 30f, 1.0f, 50, 0)
}

class EsenhoEngine(var width: Int = 1080, var height: Int = 1920) {

    private val undoStack = ArrayDeque<Bitmap>()
    private val redoStack = ArrayDeque<Bitmap>()
    private val maxUndoSteps = 20

    var currentTool: ToolMode = ToolMode.BRUSH
    var brushSize: Float = 12f
        set(value) {
            field = value.coerceIn(1f, 300f)
            EsenhoNativeBridge.nativeBrushSetParam(1, field.toInt())
        }
    var brushOpacity: Float = 1.0f
        set(value) {
            field = value.coerceIn(0.01f, 1.0f)
            EsenhoNativeBridge.nativeBrushSetParam(2, (field * 255).toInt())
        }
    var brushHardness: Int = 75
        set(value) {
            field = value.coerceIn(0, 100)
            EsenhoNativeBridge.nativeBrushSetParam(3, field)
        }
    var brushSmooth: Int = 30
        set(value) {
            field = value.coerceIn(0, 100)
            EsenhoNativeBridge.nativeBrushSetParam(19, field)
        }

    var currentColor: Int = Color.rgb(20, 20, 20)

    private var renderBitmap: Bitmap? = null
    private var isStrokeActive = false
    private var lastX = 0f
    private var lastY = 0f

    init {
        initEngine(width, height)
    }

    fun initEngine(w: Int, h: Int) {
        width = w
        height = h
        EsenhoNativeBridge.nativeInit(width, height)
        renderBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        
        // Defaults
        EsenhoNativeBridge.nativeBrushSetParam(1, brushSize.toInt())
        EsenhoNativeBridge.nativeBrushSetParam(2, (brushOpacity * 255).toInt())
        EsenhoNativeBridge.nativeBrushSetParam(3, brushHardness)
        EsenhoNativeBridge.nativeBrushSetParam(4, 255) // Flow 100%
        EsenhoNativeBridge.nativeBrushSetParam(19, brushSmooth)
        EsenhoNativeBridge.nativeBrushSetParam(39, 1) // Pressure size
        EsenhoNativeBridge.nativeBrushSetParam(40, 1) // Pressure flow

        // Draw background white on base layer
        EsenhoNativeBridge.nativeDrawRect(0, 0, width, height, toNativeColor(Color.WHITE))
    }

    fun resize(w: Int, h: Int) {
        if (w <= 0 || h <= 0 || (w == width && h == height)) return
        width = w
        height = h
        EsenhoNativeBridge.nativeResize(w, h)
        renderBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        undoStack.clear()
        redoStack.clear()
    }

    fun applyPreset(preset: BrushPreset) {
        brushSize = preset.size
        brushOpacity = preset.opacity
        brushHardness = preset.hardness
        brushSmooth = preset.smooth
    }

    private fun toNativeColor(color: Int): Int {
        val a = (color ushr 24) and 0xFF
        val r = (color ushr 16) and 0xFF
        val g = (color ushr 8) and 0xFF
        val b = color and 0xFF
        // ABGR little-endian: (A << 24) | (B << 16) | (G << 8) | R
        return (a shl 24) or (b shl 16) or (g shl 8) or r
    }

    private fun pushUndoSnapshot() {
        renderBitmap?.let { bmp ->
            if (undoStack.size >= maxUndoSteps) {
                undoStack.removeLast()
            }
            val copy = bmp.copy(Bitmap.Config.ARGB_8888, false)
            undoStack.push(copy)
            redoStack.clear()
        }
    }

    fun onTouchDown(x: Float, y: Float, pressure: Float = 0.5f, tiltX: Int = 0, tiltY: Int = 0) {
        pushUndoSnapshot()
        isStrokeActive = true
        lastX = x
        lastY = y

        val isEraser = if (currentTool == ToolMode.ERASER) 1 else 0
        val nativeCol = toNativeColor(currentColor)
        val pInt = (pressure.coerceIn(0f, 1f) * 255).toInt()

        when (currentTool) {
            ToolMode.BRUSH, ToolMode.ERASER -> {
                // state = 0 (stroke start)
                EsenhoNativeBridge.nativeStrokeExt(0, x, y, x, y, nativeCol, isEraser, pInt, tiltX, tiltY)
            }
            else -> {}
        }
    }

    fun onTouchMove(x: Float, y: Float, pressure: Float = 0.5f, tiltX: Int = 0, tiltY: Int = 0) {
        if (!isStrokeActive) return

        val isEraser = if (currentTool == ToolMode.ERASER) 1 else 0
        val nativeCol = toNativeColor(currentColor)
        val pInt = (pressure.coerceIn(0f, 1f) * 255).toInt()

        when (currentTool) {
            ToolMode.BRUSH, ToolMode.ERASER -> {
                // state = 1 (stroke intermediate)
                EsenhoNativeBridge.nativeStrokeExt(1, lastX, lastY, x, y, nativeCol, isEraser, pInt, tiltX, tiltY)
                lastX = x
                lastY = y
            }
            else -> {}
        }
    }

    fun onTouchUp(x: Float, y: Float, pressure: Float = 0f, tiltX: Int = 0, tiltY: Int = 0) {
        if (!isStrokeActive) return
        isStrokeActive = false

        val isEraser = if (currentTool == ToolMode.ERASER) 1 else 0
        val nativeCol = toNativeColor(currentColor)
        val pInt = (pressure.coerceIn(0f, 1f) * 255).toInt()

        when (currentTool) {
            ToolMode.BRUSH, ToolMode.ERASER -> {
                // state = 2 (stroke end)
                EsenhoNativeBridge.nativeStrokeExt(2, lastX, lastY, x, y, nativeCol, isEraser, pInt, tiltX, tiltY)
            }
            ToolMode.LINE -> {
                EsenhoNativeBridge.nativeDrawLine(lastX.toInt(), lastY.toInt(), x.toInt(), y.toInt(), nativeCol)
            }
            ToolMode.RECTANGLE -> {
                val rx = Math.min(lastX, x).toInt()
                val ry = Math.min(lastY, y).toInt()
                val rw = Math.abs(x - lastX).toInt()
                val rh = Math.abs(y - lastY).toInt()
                EsenhoNativeBridge.nativeDrawRect(rx, ry, rw, rh, nativeCol)
            }
            ToolMode.CIRCLE -> {
                val cx = ((lastX + x) / 2f).toInt()
                val cy = ((lastY + y) / 2f).toInt()
                val dx = x - lastX
                val dy = y - lastY
                val r = (Math.sqrt((dx * dx + dy * dy).toDouble()) / 2.0).toInt()
                EsenhoNativeBridge.nativeDrawCircle(cx, cy, r, nativeCol)
            }
            else -> {}
        }
    }

    fun undo(): Boolean {
        if (undoStack.isEmpty()) return false
        renderBitmap?.let { bmp ->
            redoStack.push(bmp.copy(Bitmap.Config.ARGB_8888, false))
        }
        val prev = undoStack.pop()
        // Clear active layer and draw previous state
        val activeLayer = EsenhoNativeBridge.nativeLayerGetActive()
        EsenhoNativeBridge.nativeLayerClear(activeLayer)
        // Redraw into current
        renderBitmap?.let { bmp ->
            val canvas = android.graphics.Canvas(bmp)
            canvas.drawBitmap(prev, 0f, 0f, null)
        }
        return true
    }

    fun redo(): Boolean {
        if (redoStack.isEmpty()) return false
        renderBitmap?.let { bmp ->
            undoStack.push(bmp.copy(Bitmap.Config.ARGB_8888, false))
        }
        val next = redoStack.pop()
        renderBitmap?.let { bmp ->
            val canvas = android.graphics.Canvas(bmp)
            canvas.drawBitmap(next, 0f, 0f, null)
        }
        return true
    }

    fun clearCanvas() {
        pushUndoSnapshot()
        val active = EsenhoNativeBridge.nativeLayerGetActive()
        EsenhoNativeBridge.nativeLayerClear(active)
        EsenhoNativeBridge.nativeDrawRect(0, 0, width, height, toNativeColor(Color.WHITE))
    }

    fun render(targetBitmap: Bitmap): Boolean {
        return EsenhoNativeBridge.nativeRenderToBitmap(targetBitmap)
    }

    fun getRenderBitmap(): Bitmap? {
        renderBitmap?.let { bmp ->
            EsenhoNativeBridge.nativeRenderToBitmap(bmp)
        }
        return renderBitmap
    }

    val canUndo: Boolean get() = undoStack.isNotEmpty()
    val canRedo: Boolean get() = redoStack.isNotEmpty()
}
