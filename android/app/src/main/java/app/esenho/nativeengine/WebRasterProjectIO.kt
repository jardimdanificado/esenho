package app.esenho.nativeengine

import android.graphics.Bitmap
import android.graphics.Color
import android.util.Base64
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Imports the raster subset of the web .esen JSON project format. */
internal object WebRasterProjectIO {
    private data class ImportedLayer(val json: JSONObject, val originalId: Int, val bitmap: Bitmap)

    fun load(engine: EsenhoEngine, bytes: ByteArray) {
        val project = JSONObject(bytes.toString(Charsets.UTF_8))
        require(project.optString("magic") == "ESENHO") { "Arquivo de projeto não reconhecido" }
        val width = project.getInt("width").coerceIn(1, 8192)
        val height = project.getInt("height").coerceIn(1, 8192)
        val srcLayers = project.optJSONArray("layers") ?: error("O projeto não contém camadas raster")
        val imported = mutableListOf<ImportedLayer>()
        try {
            repeat(srcLayers.length()) { i ->
                val layer = srcLayers.optJSONObject(i) ?: return@repeat
                if (layer.optBoolean("isVector")) return@repeat
                val id = layer.optInt("id", i + 3)
                imported += ImportedLayer(layer, id, decodeBitmap(layer, width, height))
            }
            require(imported.isNotEmpty()) { "O projeto não contém camadas raster" }

            engine.initEngine(width, height)
            engine.layerNames.clear()
            engine.rasterLayerGroups.clear()
            engine.rasterGroupOrder.clear()
            val drawing = { engine.layers.filter { it.id >= 3 } }
            while (drawing().size > imported.size) {
                EsenhoNativeBridge.nativeLayerDelete(drawing().last().id)
                engine.syncLayers()
            }
            while (drawing().size < imported.size) engine.addLayer()
            val nativeLayers = drawing()
            val remap = mutableMapOf<Int, Int>()
            imported.forEachIndexed { index, item ->
                val target = nativeLayers[index]
                remap[item.originalId] = target.id
                EsenhoNativeBridge.nativeLayerClear(target.id)
                EsenhoNativeBridge.nativeLayerDrawBitmap(target.id, item.bitmap, 0, 0, width, height)
                val data = item.json
                engine.layerNames[target.id] = data.optString("name", target.name)
                val opacity = data.optInt("opacity", 255).coerceIn(0, 255)
                val visible = jsonBool(data.opt("visible"), true)
                engine.layerBaseOpacities[target.id] = opacity
                engine.layerBaseVisibility[target.id] = visible
                EsenhoNativeBridge.nativeLayerSetOpacity(target.id, opacity)
                EsenhoNativeBridge.nativeLayerSetVisible(target.id, if (visible) 1 else 0)
                EsenhoNativeBridge.nativeLayerSetBlendMode(target.id, data.optInt("blendMode", 0).coerceIn(0, 5))
                EsenhoNativeBridge.nativeLayerSetAlphaLock(target.id, if (jsonBool(data.opt("alphaLock"), false)) 1 else 0)
                EsenhoNativeBridge.nativeLayerSetClipping(target.id, if (jsonBool(data.opt("clipping"), false)) 1 else 0)
            }
            engine.syncLayers()

            val settings = project.optJSONObject("settings") ?: JSONObject()
            engine.transformModePreference = when (settings.optString("transformMode", "scale").lowercase()) {
                "distort" -> TransformState.Mode.DISTORT
                "perspective" -> TransformState.Mode.PERSPECTIVE
                "skew" -> TransformState.Mode.SKEW
                else -> TransformState.Mode.SCALE
            }
            engine.transformInterpolation = if (settings.optString("transformInterpolation", "nearest").equals("bilinear", true))
                TransformState.Interpolation.BILINEAR else TransformState.Interpolation.NEAREST
            engine.transformLockAspect = jsonBool(settings.opt("transformLockAspect"), false)
            engine.wandTolerance = settings.optInt("wandTolerance", engine.wandTolerance).coerceIn(0, 255)
            engine.wandContiguous = jsonBool(settings.opt("wandAdjacent"), true)
            engine.selectionOp = when (settings.optString("selectionMode", "replace").lowercase()) {
                "add" -> SelectionOp.ADD
                "sub", "subtract" -> SelectionOp.SUB
                "intersect" -> SelectionOp.INTERSECT
                else -> SelectionOp.REPLACE
            }
            settings.opt("currentColor")?.let { raw ->
                val native = when (raw) { is Number -> raw.toLong().toInt(); is String -> raw.removePrefix("#").toLongOrNull(16)?.toInt() ?: return@let; else -> return@let }
                engine.currentColor = Color.argb(native ushr 24 and 255, native and 255, native ushr 8 and 255, native ushr 16 and 255)
            }

            loadGroups(engine, project, remap)
            engine.animationTracks.values.flatMap { it.frames }.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
            engine.animationTracks.clear()
            val animation = project.optJSONObject("rasterAnimation")
            if (animation != null) loadAnimation(engine, animation, remap, width, height)
            engine.syncAnimationTracks()
            engine.animationFps = animation?.optInt("fps", 12)?.coerceIn(1, 60) ?: 12
            engine.animationLoop = animation?.optBoolean("loop", true) ?: true
            val onion = animation?.optJSONObject("onionSkin")
            engine.onionSkinEnabled = onion?.optBoolean("enabled", false) ?: false
            engine.onionPrevFrames = onion?.optInt("prevFrames", 2)?.coerceIn(0, 5) ?: 2
            engine.onionNextFrames = onion?.optInt("nextFrames", 1)?.coerceIn(0, 5) ?: 1
            engine.onionOpacity = onion?.optDouble("opacity", 0.35)?.toFloat()?.coerceIn(0.1f, 0.85f) ?: 0.35f
            engine.onionPrevTint = readTint(onion?.optJSONArray("prevTint"), Color.rgb(255, 60, 60))
            engine.onionNextTint = readTint(onion?.optJSONArray("nextTint"), Color.rgb(60, 140, 255))
            val activeOriginal = settings.optInt("activeLayerId", imported.first().originalId)
            val activeNative = remap[activeOriginal] ?: nativeLayers.first().id
            EsenhoNativeBridge.nativeLayerSelect(activeNative)
            engine.activeLayerIndex = activeNative
            engine.currentFrameIndex = animation?.optInt("currentFrameIndex", 0)?.coerceIn(engine.animationFrames.indices) ?: 0
            engine.currentAnimationTick = animation?.optInt("currentTick", 0)?.coerceIn(0, engine.totalAnimationTicks() - 1) ?: 0
            engine.applyAnimationTick(engine.currentAnimationTick, captureActive = false)
            engine.getRenderBitmap()
        } finally {
            imported.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
        }
    }

    private fun loadAnimation(engine: EsenhoEngine, data: JSONObject, remap: Map<Int, Int>, w: Int, h: Int) {
        val tracks = data.optJSONObject("layerTracks") ?: return
        val keys = tracks.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val originalId = key.toIntOrNull() ?: continue
            val layerId = remap[originalId] ?: continue
            val trackJson = tracks.optJSONObject(key) ?: continue
            val frameJson = trackJson.optJSONArray("frames") ?: continue
            val frames = mutableListOf<AnimationCel>()
            repeat(frameJson.length()) { i ->
                val frame = frameJson.optJSONObject(i) ?: return@repeat
                frames += AnimationCel(
                    frame.optString("name", "Frame ${i + 1}"), decodeBitmap(frame, w, h),
                    frame.optInt("duration", 1).coerceAtLeast(1), jsonBool(frame.opt("visible"), true),
                    frame.optInt("opacity", 255).coerceIn(0, 255)
                )
            }
            if (frames.isNotEmpty()) engine.animationTracks[layerId] = AnimationTrack(layerId, frames, trackJson.optInt("activeCelIndex", 0).coerceIn(frames.indices))
        }
    }

    private fun loadGroups(engine: EsenhoEngine, project: JSONObject, remap: Map<Int, Int>) {
        val groups = project.optJSONArray("layerGroups") ?: return
        repeat(groups.length()) { i ->
            val item = groups.optJSONObject(i) ?: return@repeat
            val id = item.optString("id", "web_group_$i")
            engine.rasterLayerGroups[id] = RasterLayerGroup(id, item.optString("name", "Grupo"), collapsed = item.optBoolean("collapsed"), visible = item.optBoolean("visible", true), parentId = item.optString("parentId").takeIf { it.isNotBlank() && it != "null" })
        }
        repeat(groups.length()) { i ->
            val item = groups.optJSONObject(i) ?: return@repeat
            val group = engine.rasterLayerGroups[item.optString("id", "web_group_$i")] ?: return@repeat
            val ids = item.optJSONArray("layerIds") ?: return@repeat
            repeat(ids.length()) { j -> remap[ids.optInt(j, -1)]?.let { group.layerIds.add(it) } }
            val children = item.optJSONArray("children") ?: return@repeat
            repeat(children.length()) { j -> children.optJSONObject(j)?.let { child ->
                if (child.optString("type") == "group") child.optString("id").takeIf { it in engine.rasterLayerGroups }?.let { group.childGroupIds.add(it) }
            } }
        }
        // The web group array is ordered; derive root order from tree when available.
        val tree = project.optJSONArray("layerTree")
        if (tree != null) repeat(tree.length()) { i -> tree.optJSONObject(i)?.takeIf { it.optString("type") == "group" }?.optString("id")?.takeIf { it in engine.rasterLayerGroups }?.let { engine.rasterGroupOrder.add(it) } }
        if (engine.rasterGroupOrder.isEmpty()) engine.rasterLayerGroups.values.filter { it.parentId == null }.forEach { engine.rasterGroupOrder.add(it.id) }
    }

    private fun decodeBitmap(item: JSONObject, targetWidth: Int, targetHeight: Int, preserveSourceSize: Boolean = false): Bitmap {
        val width = item.optInt("width", targetWidth).coerceIn(1, 8192)
        val height = item.optInt("height", targetHeight).coerceIn(1, 8192)
        val count = Math.multiplyExact(width, height)
        val pixels = IntArray(count)
        when (item.optString("encoding", "empty").lowercase()) {
            "empty" -> Unit
            "solid" -> pixels.fill(nativeColor(item.optLong("color", 0).toInt()))
            "raw" -> {
                val raw = Base64.decode(item.optString("pixels", ""), Base64.DEFAULT)
                require(raw.size >= count * 4) { "Dados de pixels incompletos" }
                for (i in 0 until count) pixels[i] = Color.argb(raw[i * 4 + 3].toInt() and 255, raw[i * 4].toInt() and 255, raw[i * 4 + 1].toInt() and 255, raw[i * 4 + 2].toInt() and 255)
            }
            "rle32" -> {
                val raw = Base64.decode(item.optString("pixels", ""), Base64.DEFAULT)
                val buffer = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN)
                var out = 0
                while (buffer.remaining() >= 8 && out < count) {
                    val run = buffer.int.toLong().coerceAtMost((count - out).toLong()).toInt()
                    val color = nativeColor(buffer.int)
                    repeat(run) { pixels[out++] = color }
                }
                require(out == count) { "Dados RLE incompletos" }
            }
            "qoi" -> decodeQoi(Base64.decode(item.optString("pixels", ""), Base64.DEFAULT), pixels, width, height)
            else -> error("Codificação de imagem não suportada: ${item.optString("encoding")}")
        }
        val bitmapWidth = if (preserveSourceSize) width else targetWidth
        val bitmapHeight = if (preserveSourceSize) height else targetHeight
        val bitmap = Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888)
        val copyWidth = minOf(width, bitmapWidth)
        val copyHeight = minOf(height, bitmapHeight)
        if (copyWidth > 0 && copyHeight > 0) {
            if (copyWidth == width) bitmap.setPixels(pixels, 0, width, 0, 0, copyWidth, copyHeight)
            else {
                val cropped = IntArray(copyWidth * height)
                for (y in 0 until height) System.arraycopy(pixels, y * width, cropped, y * copyWidth, copyWidth)
                bitmap.setPixels(cropped, 0, copyWidth, 0, 0, copyWidth, copyHeight)
            }
        }
        return bitmap
    }

    private fun decodeQoi(data: ByteArray, out: IntArray, width: Int, height: Int) {
        require(data.size >= 22) { "Arquivo QOI inválido" }
        var pos = 14
        val end = data.size - 8
        val index = IntArray(64)
        var r = 0; var g = 0; var b = 0; var a = 255
        var written = 0
        while (written < width * height && pos < end) {
            val op = data[pos++].toInt() and 255
            when {
                op == 0xfe -> { require(pos + 3 <= end); r = data[pos++].toInt() and 255; g = data[pos++].toInt() and 255; b = data[pos++].toInt() and 255 }
                op == 0xff -> { require(pos + 4 <= end); r = data[pos++].toInt() and 255; g = data[pos++].toInt() and 255; b = data[pos++].toInt() and 255; a = data[pos++].toInt() and 255 }
                op and 0xc0 == 0x00 -> { val px = index[op and 63]; r = px ushr 24; g = px ushr 16 and 255; b = px ushr 8 and 255; a = px and 255 }
                op and 0xc0 == 0x40 -> { r = (r + ((op ushr 4 and 3) - 2)) and 255; g = (g + ((op ushr 2 and 3) - 2)) and 255; b = (b + ((op and 3) - 2)) and 255 }
                op and 0xc0 == 0x80 -> { require(pos < end); val second = data[pos++].toInt() and 255; val dg = (op and 63) - 32; r = (r + dg + (second ushr 4) - 8) and 255; g = (g + dg) and 255; b = (b + dg + (second and 15) - 8) and 255 }
                else -> {
                    val run = op and 63
                    val color = Color.argb(a, r, g, b)
                    repeat(run + 1) { if (written < out.size) out[written++] = color }
                    continue
                }
            }
            index[(r * 3 + g * 5 + b * 7 + a * 11) and 63] = (r shl 24) or (g shl 16) or (b shl 8) or a
            out[written++] = Color.argb(a, r, g, b)
        }
        require(written == out.size) { "Dados QOI incompletos" }
    }

    private fun nativeColor(value: Int): Int = Color.argb(value ushr 24 and 255, value and 255, value ushr 8 and 255, value ushr 16 and 255)
    private fun readTint(values: org.json.JSONArray?, fallback: Int): Int = if (values != null && values.length() >= 3)
        Color.rgb(values.optInt(0).coerceIn(0, 255), values.optInt(1).coerceIn(0, 255), values.optInt(2).coerceIn(0, 255)) else fallback
    private fun jsonBool(value: Any?, fallback: Boolean): Boolean = when (value) { is Boolean -> value; is Number -> value.toInt() != 0; else -> fallback }
}
