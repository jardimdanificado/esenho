package app.esenho.nativeengine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import org.json.JSONObject
import java.util.ArrayDeque
import kotlin.math.hypot

enum class ToolMode(val id: Int, val displayName: String) {
    BRUSH(0, "Pincel"),
    ERASER(0, "Borracha"),
    FILL(3, "Preenchimento"),
    LINE(6, "Linha"),
    RECTANGLE(7, "Retângulo"),
    CIRCLE(8, "Círculo"),
    EYEDROPPER(5, "Conta-gotas")
}

enum class LayerBlendMode(val id: Int, val displayName: String) {
    NORMAL(0, "Normal"),
    MULTIPLY(1, "Multiplicação"),
    SCREEN(2, "Divisão (Screen)"),
    OVERLAY(3, "Sobreposição"),
    DODGE(4, "Subexposição (Dodge)"),
    ADD(5, "Adição (Add)")
}

data class BrushParamModel(
    val name: String,
    val min: Int,
    val max: Int,
    val defaultVal: Int,
    val unit: String,
    var currentVal: Int
)

data class BrushModel(
    val id: String,
    val title: String,
    val category: String,
    val spacing: Float,
    val minRadius: Float,
    val maxRadius: Float,
    val params: List<BrushParamModel>
)

data class FilterParamModel(
    val name: String,
    val min: Int,
    val max: Int,
    val defaultVal: Int,
    val unit: String,
    var currentVal: Int
)

data class FilterModel(
    val id: String,
    val title: String,
    val params: List<FilterParamModel>
)

data class LayerModel(
    val id: Int,
    var name: String,
    var opacity: Int = 255,
    var visible: Boolean = true,
    var blendMode: LayerBlendMode = LayerBlendMode.NORMAL,
    var alphaLock: Boolean = false,
    var clipping: Boolean = false
)

data class AnimationCel(
    val id: String,
    var bitmap: Bitmap
)

class EsenhoEngine(
    val context: Context,
    var width: Int = 1080,
    var height: Int = 1920
) {

    // Catalogs
    val brushCatalog = mutableListOf<BrushModel>()
    val filterCatalog = mutableListOf<FilterModel>()
    var selectedBrush: BrushModel? = null

    // Layer Stack
    val layers = mutableListOf<LayerModel>()
    var activeLayerIndex: Int = 3

    // History / Undo / Redo
    private val undoStack = ArrayDeque<Bitmap>()
    private val redoStack = ArrayDeque<Bitmap>()
    private val maxUndoSteps = 25

    // Animation / Raster Animator
    val animationFrames = mutableListOf<AnimationCel>()
    var currentFrameIndex: Int = 0
    var isAnimationPlaying: Boolean = false
    var animationFps: Int = 12
    var onionSkinEnabled: Boolean = false

    // State
    var currentTool: ToolMode = ToolMode.BRUSH
    var brushSize: Float = 14f
        set(value) {
            field = value.coerceIn(1f, 300f)
            EsenhoNativeBridge.nativeBrushSetSize(field)
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

    var currentColor: Int = Color.rgb(24, 24, 24)
        set(value) {
            field = value
            if (!recentColors.contains(value)) {
                recentColors.add(0, value)
                if (recentColors.size > 16) recentColors.removeLast()
            }
        }

    val recentColors = mutableListOf<Int>().apply {
        addAll(listOf(
            Color.rgb(20, 20, 20),
            Color.WHITE,
            Color.rgb(230, 57, 70),
            Color.rgb(244, 162, 97),
            Color.rgb(233, 196, 106),
            Color.rgb(42, 157, 143),
            Color.rgb(38, 70, 83),
            Color.rgb(69, 123, 157)
        ))
    }

    private var renderBitmap: Bitmap? = null
    private var isStrokeActive = false
    private var lastX = 0f
    private var lastY = 0f

    init {
        loadCatalogs()
        initEngine(width, height)
    }

    private fun loadCatalogs() {
        try {
            val jsonStr = context.assets.open("esenho_native_metadata.json").bufferedReader().use { it.readText() }
            val root = JSONObject(jsonStr)

            // 1. Brushes
            val brushesArr = root.optJSONArray("brushes")
            if (brushesArr != null) {
                for (i in 0 until brushesArr.length()) {
                    val obj = brushesArr.getJSONObject(i)
                    val id = obj.getString("id")
                    val title = obj.optString("title", id)
                    val category = obj.optString("category", "Geral")
                    val spacing = obj.optDouble("spacing", 0.08).toFloat()
                    val minR = obj.optDouble("minRadius", 2.0).toFloat()
                    val maxR = obj.optDouble("maxRadius", 150.0).toFloat()

                    val paramsList = mutableListOf<BrushParamModel>()
                    val paramsArr = obj.optJSONArray("params")
                    if (paramsArr != null) {
                        for (p in 0 until paramsArr.length()) {
                            val pObj = paramsArr.getJSONObject(p)
                            val pName = pObj.getString("name")
                            val pMin = pObj.optInt("min", 0)
                            val pMax = pObj.optInt("max", 100)
                            val pDef = pObj.optInt("default", 50)
                            val pUnit = pObj.optString("unit", "%")
                            paramsList.add(BrushParamModel(pName, pMin, pMax, pDef, pUnit, pDef))
                        }
                    }
                    brushCatalog.add(BrushModel(id, title, category, spacing, minR, maxR, paramsList))
                }
            }

            // 2. Filters
            val filtersArr = root.optJSONArray("filters")
            if (filtersArr != null) {
                for (i in 0 until filtersArr.length()) {
                    val obj = filtersArr.getJSONObject(i)
                    val id = obj.getString("id")
                    val title = obj.optString("title", id)
                    val paramsList = mutableListOf<FilterParamModel>()
                    val paramsArr = obj.optJSONArray("params")
                    if (paramsArr != null) {
                        for (p in 0 until paramsArr.length()) {
                            val pObj = paramsArr.getJSONObject(p)
                            val pName = pObj.getString("name")
                            val pMin = pObj.optInt("min", 0)
                            val pMax = pObj.optInt("max", 100)
                            val pDef = pObj.optInt("default", 50)
                            val pUnit = pObj.optString("unit", "")
                            paramsList.add(FilterParamModel(pName, pMin, pMax, pDef, pUnit, pDef))
                        }
                    }
                    filterCatalog.add(FilterModel(id, title, paramsList))
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun initEngine(w: Int, h: Int) {
        width = w
        height = h
        EsenhoNativeBridge.nativeInit(width, height)
        renderBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

        // Reset brush params
        EsenhoNativeBridge.nativeBrushSetSize(brushSize)
        EsenhoNativeBridge.nativeBrushSetParam(1, brushSize.toInt())
        EsenhoNativeBridge.nativeBrushSetParam(2, (brushOpacity * 255).toInt())
        EsenhoNativeBridge.nativeBrushSetParam(3, brushHardness)
        EsenhoNativeBridge.nativeBrushSetParam(4, 255) // Flow 100%
        EsenhoNativeBridge.nativeBrushSetParam(19, brushSmooth)

        // Draw background canvas layer white
        EsenhoNativeBridge.nativeDrawRect(0, 0, width, height, toNativeColor(Color.WHITE))

        syncLayers()

        // Init initial animation frame
        animationFrames.clear()
        val firstFrame = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        render(firstFrame)
        animationFrames.add(AnimationCel("Frame 1", firstFrame))
        currentFrameIndex = 0
    }

    fun resize(w: Int, h: Int) {
        if (w <= 0 || h <= 0 || (w == width && h == height)) return
        width = w
        height = h
        EsenhoNativeBridge.nativeResize(w, h)
        renderBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        undoStack.clear()
        redoStack.clear()
        syncLayers()
    }

    // ── Brush Selection & Tuning ──

    fun selectBrush(brush: BrushModel?) {
        selectedBrush = brush
        if (brush == null) {
            EsenhoNativeBridge.nativeSelectBrush("classic")
        } else {
            EsenhoNativeBridge.nativeSelectBrush(brush.id)
            // Apply current values of parameters
            brush.params.forEachIndexed { idx, p ->
                EsenhoNativeBridge.nativeSetBrushParam(idx, p.currentVal)
            }
        }
        currentTool = ToolMode.BRUSH
    }

    fun setBrushCustomParam(paramIdx: Int, value: Int) {
        val b = selectedBrush ?: return
        if (paramIdx in b.params.indices) {
            b.params[paramIdx].currentVal = value
            EsenhoNativeBridge.nativeSetBrushParam(paramIdx, value)
        }
    }

    // ── Filter Application ──

    fun applyFilter(filter: FilterModel, p1: Int = 0, p2: Int = 0): Boolean {
        pushUndoSnapshot()
        val ok = EsenhoNativeBridge.nativeApplyFilter(filter.id, p1, p2)
        return ok
    }

    // ── Layer Operations ──

    fun syncLayers() {
        layers.clear()
        val count = EsenhoNativeBridge.nativeLayerGetCount()
        activeLayerIndex = EsenhoNativeBridge.nativeLayerGetActive()

        for (pos in 0 until count) {
            val layerIdx = EsenhoNativeBridge.nativeLayerGetOrder(pos)
            val opacity = EsenhoNativeBridge.nativeLayerGetOpacity(layerIdx)
            val visible = EsenhoNativeBridge.nativeLayerGetVisible(layerIdx) == 1
            val blendModeInt = EsenhoNativeBridge.nativeLayerGetBlendMode(layerIdx)
            val blendMode = LayerBlendMode.values().find { it.id == blendModeInt } ?: LayerBlendMode.NORMAL
            val alphaLock = EsenhoNativeBridge.nativeLayerGetAlphaLock(layerIdx) == 1
            val clipping = EsenhoNativeBridge.nativeLayerGetClipping(layerIdx) == 1

            val name = if (layerIdx <= 2) "Plano de Fundo" else "Camada ${layerIdx - 2}"
            layers.add(LayerModel(layerIdx, name, opacity, visible, blendMode, alphaLock, clipping))
        }
    }

    fun addLayer(): Int {
        pushUndoSnapshot()
        val idx = EsenhoNativeBridge.nativeLayerAdd()
        syncLayers()
        return idx
    }

    fun duplicateLayer(idx: Int): Int {
        pushUndoSnapshot()
        val newIdx = EsenhoNativeBridge.nativeLayerDuplicate(idx)
        syncLayers()
        return newIdx
    }

    fun selectLayer(idx: Int) {
        EsenhoNativeBridge.nativeLayerSelect(idx)
        activeLayerIndex = idx
    }

    fun deleteLayer(idx: Int) {
        if (layers.size <= 1) return
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerDelete(idx)
        syncLayers()
    }

    fun setLayerOpacity(idx: Int, opacity: Int) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerSetOpacity(idx, opacity.coerceIn(0, 255))
        syncLayers()
    }

    fun setLayerVisible(idx: Int, visible: Boolean) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerSetVisible(idx, if (visible) 1 else 0)
        syncLayers()
    }

    fun setLayerBlendMode(idx: Int, mode: LayerBlendMode) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerSetBlendMode(idx, mode.id)
        syncLayers()
    }

    fun setLayerAlphaLock(idx: Int, locked: Boolean) {
        EsenhoNativeBridge.nativeLayerSetAlphaLock(idx, if (locked) 1 else 0)
        syncLayers()
    }

    fun setLayerClipping(idx: Int, clipping: Boolean) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerSetClipping(idx, if (clipping) 1 else 0)
        syncLayers()
    }

    fun moveLayerUp(idx: Int) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerMoveUp(idx)
        syncLayers()
    }

    fun moveLayerDown(idx: Int) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerMoveDown(idx)
        syncLayers()
    }

    fun mergeDown(idx: Int) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerMergeDown(idx)
        syncLayers()
    }

    fun clearActiveLayer() {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
    }

    // ── Animation Frame-by-Frame (Raster Animator) ──

    fun captureCurrentFrame() {
        if (currentFrameIndex in animationFrames.indices) {
            val bmp = animationFrames[currentFrameIndex].bitmap
            render(bmp)
        }
    }

    fun restoreFrame(index: Int) {
        if (index !in animationFrames.indices) return
        captureCurrentFrame()
        currentFrameIndex = index
        val bmp = animationFrames[index].bitmap
        // Clear active layer and draw frame bitmap
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
        // Draw bitmap into canvas
        renderBitmap?.let { compBmp ->
            val canvas = android.graphics.Canvas(compBmp)
            canvas.drawBitmap(bmp, 0f, 0f, null)
        }
    }

    fun addAnimationFrame(): Int {
        captureCurrentFrame()
        val newBmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val newIndex = currentFrameIndex + 1
        val cel = AnimationCel("Frame ${animationFrames.size + 1}", newBmp)
        animationFrames.add(newIndex, cel)
        // Clear active layer for new blank drawing
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
        currentFrameIndex = newIndex
        return newIndex
    }

    fun duplicateAnimationFrame(): Int {
        captureCurrentFrame()
        val currBmp = animationFrames[currentFrameIndex].bitmap
        val copyBmp = currBmp.copy(Bitmap.Config.ARGB_8888, true)
        val newIndex = currentFrameIndex + 1
        val cel = AnimationCel("Frame ${animationFrames.size + 1}", copyBmp)
        animationFrames.add(newIndex, cel)
        currentFrameIndex = newIndex
        return newIndex
    }

    fun deleteAnimationFrame() {
        if (animationFrames.size <= 1) return
        animationFrames.removeAt(currentFrameIndex)
        currentFrameIndex = currentFrameIndex.coerceIn(0, animationFrames.size - 1)
        restoreFrame(currentFrameIndex)
    }

    fun getOnionSkinPrevBitmap(): Bitmap? {
        if (!onionSkinEnabled || currentFrameIndex <= 0) return null
        return animationFrames[currentFrameIndex - 1].bitmap
    }

    fun getOnionSkinNextBitmap(): Bitmap? {
        if (!onionSkinEnabled || currentFrameIndex >= animationFrames.size - 1) return null
        return animationFrames[currentFrameIndex + 1].bitmap
    }

    // ── Drawing & Touch Execution ──

    private fun toNativeColor(color: Int): Int {
        val a = (color ushr 24) and 0xFF
        val r = (color ushr 16) and 0xFF
        val g = (color ushr 8) and 0xFF
        val b = color and 0xFF
        // ABGR little-endian: (A << 24) | (B << 16) | (G << 8) | R
        return (a shl 24) or (b shl 16) or (g shl 8) or r
    }

    fun pickColorAt(x: Float, y: Float): Int {
        val picked = EsenhoNativeBridge.nativePickColor(x.toInt(), y.toInt(), 1)
        if ((picked ushr 24) > 0) {
            currentColor = picked
        }
        return currentColor
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
        if (currentTool == ToolMode.EYEDROPPER) {
            pickColorAt(x, y)
            return
        }

        pushUndoSnapshot()
        isStrokeActive = true
        lastX = x
        lastY = y

        val isEraser = if (currentTool == ToolMode.ERASER) 1 else 0
        val nativeCol = toNativeColor(currentColor)
        val pInt = (pressure.coerceIn(0f, 1f) * 255).toInt()

        when (currentTool) {
            ToolMode.BRUSH, ToolMode.ERASER -> {
                EsenhoNativeBridge.nativeBrushSetType(0) // Draw mode
                EsenhoNativeBridge.nativeStrokeExt(0, x, y, x, y, nativeCol, isEraser, pInt, tiltX, tiltY)
            }
            ToolMode.FILL -> {
                EsenhoNativeBridge.nativeBrushSetType(3) // W_MODE_FILL
                EsenhoNativeBridge.nativeStrokeExt(0, x, y, x, y, nativeCol, 0, 255, 0, 0)
                isStrokeActive = false
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
                val r = (hypot(dx.toDouble(), dy.toDouble()) / 2.0).toInt()
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
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
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
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
        if (activeLayerIndex <= 3) {
            EsenhoNativeBridge.nativeDrawRect(0, 0, width, height, toNativeColor(Color.WHITE))
        }
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
