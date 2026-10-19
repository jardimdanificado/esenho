package app.esenho.nativeengine

import android.graphics.Bitmap
import java.io.InputStream
import java.io.OutputStream
import java.io.BufferedInputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/** Editable project archive: canvas metadata plus one lossless PNG per layer. */
object EsenhoProjectIO {
    data class CelSnapshot(
        val bitmap: Bitmap,
        val duration: Int,
        val visible: Boolean,
        val opacity: Int
    )
    data class LayerSnapshot(
        val name: String,
        val bitmap: Bitmap,
        val opacity: Int,
        val visible: Boolean,
        val blend: Int,
        val alphaLock: Boolean,
        val clipping: Boolean
    )
    data class TrackSnapshot(
        val layerOrder: Int,
        val activeCel: Int,
        val frames: List<CelSnapshot>
    )
    data class GroupSnapshot(
        val id: String,
        val name: String,
        val collapsed: Boolean,
        val visible: Boolean,
        val parentId: String?,
        val layerOrders: List<Int>,
        val childGroupIds: List<String>
    )
    data class GuideSnapshot(val type: DrawingGuideType, val paths: List<List<GuidePoint>>)
    data class Snapshot(
        val width: Int,
        val height: Int,
        val active: Int,
        val layers: List<LayerSnapshot>,
        val animationTracks: List<TrackSnapshot>,
        val rasterGroups: List<GroupSnapshot>,
        val rasterGroupOrder: List<String>,
        val guides: List<GuideSnapshot>,
        val fps: Int,
        val currentFrame: Int,
        val currentTick: Int,
        val loop: Boolean,
        val onionEnabled: Boolean,
        val onionPrevious: Int,
        val onionNext: Int,
        val onionOpacity: Float,
        val onionPrevTint: Int,
        val onionNextTint: Int,
        val selectionOp: SelectionOp,
        val wandTolerance: Int,
        val wandContiguous: Boolean,
        val transformMode: TransformState.Mode,
        val transformInterpolation: TransformState.Interpolation,
        val transformLockAspect: Boolean
    )

    fun capture(engine: EsenhoEngine): Snapshot {
        val activeTransform = engine.transformState
        val transformedLayerId = if (activeTransform != null) engine.activeLayerIndex else null
        if (activeTransform == null) engine.captureCurrentFrame()
        val layers = mutableListOf<LayerSnapshot>()
        val tracks = mutableListOf<TrackSnapshot>()
        val transformedLayerBitmaps = mutableMapOf<Int, Bitmap>()
        try {
            engine.layers.forEach { layer ->
                val bitmap = Bitmap.createBitmap(engine.width, engine.height, Bitmap.Config.ARGB_8888)
                check(EsenhoNativeBridge.nativeLayerGetBitmap(layer.id, bitmap)) { "Não foi possível ler a camada ${layer.name}" }
                if (layer.id == transformedLayerId) {
                    val canvas = android.graphics.Canvas(bitmap)
                    activeTransform?.drawTransformedBitmapExact(canvas)
                    transformedLayerBitmaps[layer.id] = bitmap
                }
                layers += LayerSnapshot(layer.name, bitmap, layer.opacity, layer.visible, layer.blendMode.id, layer.alphaLock, layer.clipping)
            }
            val drawingLayers = engine.layers.filter { it.id >= 3 }
            engine.animationTracks.values.forEach { track ->
                val layerOrder = drawingLayers.indexOfFirst { it.id == track.layerId }
                if (layerOrder >= 0) {
                    tracks += TrackSnapshot(
                        layerOrder,
                        track.activeCelIndex,
                        track.frames.mapIndexed { celIndex, cel ->
                            val celBitmap = if (track.layerId == transformedLayerId && celIndex == track.activeCelIndex) {
                                // Persist the visible transform preview as the active cel while leaving
                                // the in-memory source cel and floating transform untouched.
                                transformedLayerBitmaps[track.layerId]?.copy(Bitmap.Config.ARGB_8888, false)
                                    ?: cel.bitmap.copy(Bitmap.Config.ARGB_8888, false)
                            } else cel.bitmap.copy(Bitmap.Config.ARGB_8888, false)
                            CelSnapshot(celBitmap, cel.duration, cel.visible, cel.opacity)
                        }
                    )
                }
            }
            val groups = engine.rasterLayerGroups.values.map { group ->
                GroupSnapshot(
                    group.id,
                    group.name,
                    group.collapsed,
                    group.visible,
                    group.parentId,
                    group.layerIds.mapNotNull { layerId -> drawingLayers.indexOfFirst { it.id == layerId }.takeIf { it >= 0 } },
                    group.childGroupIds.toList()
                )
            }
            return Snapshot(
                engine.width,
                engine.height,
                engine.layers.indexOfFirst { it.id == engine.activeLayerIndex },
                layers,
                tracks,
                groups,
                engine.rasterGroupOrder.toList(),
                engine.canvasGuides.map { GuideSnapshot(it.type, it.paths) },
                engine.animationFps,
                engine.currentFrameIndex,
                engine.currentAnimationTick,
                engine.animationLoop,
                engine.onionSkinEnabled,
                engine.onionPrevFrames,
                engine.onionNextFrames,
                engine.onionOpacity,
                engine.onionPrevTint,
                engine.onionNextTint,
                engine.selectionOp,
                engine.wandTolerance,
                engine.wandContiguous,
                activeTransform?.mode ?: engine.transformModePreference,
                engine.transformInterpolation,
                engine.transformLockAspect
            )
        } catch (failure: Throwable) {
            layers.forEach { it.bitmap.recycle() }
            tracks.flatMap { it.frames }.forEach { it.bitmap.recycle() }
            throw failure
        }
    }

    fun save(engine: EsenhoEngine, output: OutputStream) {
        val snapshot = capture(engine)
        try {
            write(snapshot, output)
        } finally {
            recycle(snapshot)
        }
    }

    fun recycle(snapshot: Snapshot) {
        snapshot.layers.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
        snapshot.animationTracks.flatMap { it.frames }.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
    }

    fun write(snapshot: Snapshot, output: OutputStream) {
        val zip = ZipOutputStream(output)
        val layersJson = org.json.JSONArray()
        snapshot.layers.forEach { layer ->
            layersJson.put(org.json.JSONObject().put("name", layer.name).put("opacity", layer.opacity).put("visible", layer.visible)
                .put("blend", layer.blend).put("alphaLock", layer.alphaLock).put("clipping", layer.clipping))
        }
        val tracksJson = org.json.JSONArray()
        snapshot.animationTracks.forEach { track ->
            tracksJson.put(org.json.JSONObject()
                .put("layerOrder", track.layerOrder)
                .put("activeCel", track.activeCel)
                .put("frameCount", track.frames.size)
                .put("durations", org.json.JSONArray(track.frames.map { it.duration }))
                .put("visible", org.json.JSONArray(track.frames.map { it.visible }))
                .put("opacity", org.json.JSONArray(track.frames.map { it.opacity })))
        }
        val groupsJson = org.json.JSONArray()
        snapshot.rasterGroups.forEach { group ->
            groupsJson.put(org.json.JSONObject()
                .put("id", group.id)
                .put("name", group.name)
                .put("collapsed", group.collapsed)
                .put("visible", group.visible)
                .put("parentId", group.parentId)
                .put("layerOrders", org.json.JSONArray(group.layerOrders))
                .put("childGroupIds", org.json.JSONArray(group.childGroupIds)))
        }
        val guidesJson = org.json.JSONArray()
        snapshot.guides.forEach { guide ->
            val paths = org.json.JSONArray()
            guide.paths.forEach { path ->
                val points = org.json.JSONArray()
                path.forEach { point -> points.put(org.json.JSONArray().put(point.x).put(point.y)) }
                paths.put(points)
            }
            guidesJson.put(org.json.JSONObject().put("type", guide.type.name).put("paths", paths))
        }
        val metadata = org.json.JSONObject().put("format", 6).put("width", snapshot.width).put("height", snapshot.height)
            .put("active", snapshot.active).put("layers", layersJson).put("fps", snapshot.fps)
            .put("currentFrame", snapshot.currentFrame).put("currentTick", snapshot.currentTick)
            .put("loop", snapshot.loop).put("onionEnabled", snapshot.onionEnabled)
            .put("onionPrevious", snapshot.onionPrevious).put("onionNext", snapshot.onionNext)
            .put("onionOpacity", snapshot.onionOpacity).put("onionPrevTint", snapshot.onionPrevTint)
            .put("onionNextTint", snapshot.onionNextTint).put("animationTracks", tracksJson)
            .put("rasterGroups", groupsJson).put("rasterGroupOrder", org.json.JSONArray(snapshot.rasterGroupOrder))
            .put("guides", guidesJson)
            .put("selectionOp", snapshot.selectionOp.name)
            .put("wandTolerance", snapshot.wandTolerance)
            .put("wandContiguous", snapshot.wandContiguous)
            .put("transformMode", snapshot.transformMode.name)
            .put("transformInterpolation", snapshot.transformInterpolation.name)
            .put("transformLockAspect", snapshot.transformLockAspect)
        zip.putNextEntry(ZipEntry("project.json"))
        zip.write(metadata.toString().toByteArray(Charsets.UTF_8))
        zip.closeEntry()
        snapshot.layers.forEachIndexed { i, layer ->
            zip.putNextEntry(ZipEntry("layers/$i.png"))
            layer.bitmap.compress(Bitmap.CompressFormat.PNG, 100, zip)
            zip.closeEntry()
        }
        snapshot.animationTracks.forEachIndexed { trackIndex, track ->
            track.frames.forEachIndexed { frameIndex, frame ->
                zip.putNextEntry(ZipEntry("animation/$trackIndex/$frameIndex.png"))
                frame.bitmap.compress(Bitmap.CompressFormat.PNG, 100, zip)
                zip.closeEntry()
            }
        }
        zip.finish()
    }

    fun load(engine: EsenhoEngine, input: InputStream) {
        val buffered = if (input is BufferedInputStream) input else BufferedInputStream(input)
        buffered.mark(4)
        val signature = ByteArray(2)
        val signatureLength = buffered.read(signature)
        buffered.reset()
        if (signatureLength != 2 || signature[0] != 'P'.code.toByte() || signature[1] != 'K'.code.toByte()) {
            WebRasterProjectIO.load(engine, buffered.readBytes())
            return
        }
        val entries = mutableMapOf<String, ByteArray>()
        ZipInputStream(buffered).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                if (!entry.isDirectory) entries[entry.name] = zip.readBytes()
                zip.closeEntry()
            }
        }
        val meta = entries["project.json"] ?: error("Arquivo de projeto inválido")
        val json = org.json.JSONObject(meta.toString(Charsets.UTF_8))
        val format = json.optInt("format", 1)
        require(format in 1..6) { "Versão de projeto não suportada" }
        val width = json.getInt("width").coerceIn(1, 8192)
        val height = json.getInt("height").coerceIn(1, 8192)
        val savedLayers = json.getJSONArray("layers")
        require(savedLayers.length() > 0) { "O projeto não contém camadas" }

        engine.initEngine(width, height)
        engine.canvasGuides.clear()
        if (format >= 5) {
            val guides = json.optJSONArray("guides") ?: org.json.JSONArray()
            repeat(guides.length()) guideLoop@ { index ->
                val guide = guides.optJSONObject(index) ?: return@guideLoop
                if (format >= 6) {
                    val type = runCatching { DrawingGuideType.valueOf(guide.optString("type")) }.getOrNull() ?: return@guideLoop
                    val pathsJson = guide.optJSONArray("paths") ?: return@guideLoop
                    val paths = mutableListOf<List<GuidePoint>>()
                    repeat(pathsJson.length()) pathLoop@ { pathIndex ->
                        val pointJson = pathsJson.optJSONArray(pathIndex) ?: return@pathLoop
                        val points = mutableListOf<GuidePoint>()
                        repeat(pointJson.length()) pointLoop@ { pointIndex ->
                            val pair = pointJson.optJSONArray(pointIndex) ?: return@pointLoop
                            if (pair.length() >= 2) {
                                val x = pair.optDouble(0, -1.0).toFloat()
                                val y = pair.optDouble(1, -1.0).toFloat()
                                if (x in 0f..width.toFloat() && y in 0f..height.toFloat()) points += GuidePoint(x, y)
                            }
                        }
                        if (points.size >= 2) paths += points
                    }
                    if (paths.isNotEmpty()) engine.canvasGuides += CanvasGuide(type, paths)
                } else {
                    val vertical = guide.optString("orientation") == "VERTICAL"
                    val position = guide.optDouble("position", -1.0).toFloat()
                    val limit = if (vertical) width else height
                    if (position in 0f..limit.toFloat()) {
                        val points = if (vertical) listOf(GuidePoint(position, 0f), GuidePoint(position, height.toFloat()))
                            else listOf(GuidePoint(0f, position), GuidePoint(width.toFloat(), position))
                        engine.canvasGuides += CanvasGuide(DrawingGuideType.LINE, listOf(points))
                    }
                }
            }
            engine.activeCanvasGuideIndex = engine.canvasGuides.lastIndex
        }
        engine.layerNames.clear()
        engine.transformInterpolation = runCatching {
            TransformState.Interpolation.valueOf(json.optString("transformInterpolation", "NEAREST"))
        }.getOrDefault(TransformState.Interpolation.NEAREST)
        engine.transformModePreference = runCatching {
            TransformState.Mode.valueOf(json.optString("transformMode", "SCALE"))
        }.getOrDefault(TransformState.Mode.SCALE)
        engine.transformLockAspect = json.optBoolean("transformLockAspect", false)
        while (engine.layers.size > savedLayers.length() && engine.layers.size > 1) {
            EsenhoNativeBridge.nativeLayerDelete(engine.layers.last().id)
            engine.syncLayers()
        }
        while (engine.layers.size < savedLayers.length()) engine.addLayer()
        val layerList = engine.layers.toList()
        layerList.forEachIndexed { index, layer ->
            EsenhoNativeBridge.nativeLayerClear(layer.id)
            entries["layers/$index.png"]?.let { bytes ->
                val bitmap = BitmapFactoryCompat.decode(bytes) ?: error("Imagem da camada ${index + 1} inválida")
                EsenhoNativeBridge.nativeLayerDrawBitmap(layer.id, bitmap, 0, 0, width, height)
                bitmap.recycle()
            }
            if (index < savedLayers.length()) {
                val item = savedLayers.getJSONObject(index)
                engine.layerNames[layer.id] = item.optString("name", layer.name)
                val opacity = item.optInt("opacity", 255).coerceIn(0, 255)
                val visible = item.optBoolean("visible", true)
                engine.layerBaseOpacities[layer.id] = opacity
                engine.layerBaseVisibility[layer.id] = visible
                EsenhoNativeBridge.nativeLayerSetOpacity(layer.id, opacity)
                EsenhoNativeBridge.nativeLayerSetVisible(layer.id, if (visible) 1 else 0)
                EsenhoNativeBridge.nativeLayerSetBlendMode(layer.id, item.optInt("blend", LayerBlendMode.NORMAL.id))
                EsenhoNativeBridge.nativeLayerSetAlphaLock(layer.id, if (item.optBoolean("alphaLock")) 1 else 0)
                EsenhoNativeBridge.nativeLayerSetClipping(layer.id, if (item.optBoolean("clipping")) 1 else 0)
            }
        }
        layerList.getOrNull(json.optInt("active", 0).coerceIn(layerList.indices))?.let { EsenhoNativeBridge.nativeLayerSelect(it.id) }
        engine.syncLayers()
        engine.animationTracks.values.flatMap { it.frames }.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
        engine.animationTracks.clear()
        val drawingLayers = engine.layers.filter { it.id >= 3 }
        engine.rasterLayerGroups.clear()
        val groupsJson = json.optJSONArray("rasterGroups") ?: org.json.JSONArray()
        repeat(groupsJson.length()) { groupIndex ->
            val groupJson = groupsJson.optJSONObject(groupIndex) ?: return@repeat
            val id = groupJson.optString("id", "raster_group_${groupIndex + 1}")
            val group = RasterLayerGroup(
                id,
                groupJson.optString("name", "Grupo ${groupIndex + 1}"),
                collapsed = groupJson.optBoolean("collapsed", false),
                visible = groupJson.optBoolean("visible", true)
            )
            val orders = groupJson.optJSONArray("layerOrders") ?: org.json.JSONArray()
            repeat(orders.length()) { orderIndex ->
                drawingLayers.getOrNull(orders.optInt(orderIndex, -1))?.let { layer -> group.layerIds.add(layer.id) }
            }
            engine.rasterLayerGroups[id] = group
        }
        repeat(groupsJson.length()) { groupIndex ->
            val groupJson = groupsJson.optJSONObject(groupIndex) ?: return@repeat
            val id = groupJson.optString("id", "raster_group_${groupIndex + 1}")
            val group = engine.rasterLayerGroups[id] ?: return@repeat
            group.parentId = groupJson.optString("parentId").takeIf { it.isNotEmpty() && it != "null" }
            val childIds = groupJson.optJSONArray("childGroupIds") ?: org.json.JSONArray()
            repeat(childIds.length()) { childIndex ->
                childIds.optString(childIndex).takeIf { it in engine.rasterLayerGroups }?.let { group.childGroupIds.add(it) }
            }
        }
        val rootOrder = json.optJSONArray("rasterGroupOrder")
        if (rootOrder != null) {
            repeat(rootOrder.length()) { index -> rootOrder.optString(index).takeIf { it in engine.rasterLayerGroups }?.let { engine.rasterGroupOrder.add(it) } }
        } else {
            engine.rasterLayerGroups.values.filter { it.parentId == null }.forEach { engine.rasterGroupOrder.add(it.id) }
        }
        if (format >= 2) {
            val tracksJson = json.optJSONArray("animationTracks") ?: org.json.JSONArray()
            repeat(tracksJson.length()) { trackIndex ->
                val trackJson = tracksJson.getJSONObject(trackIndex)
                val layer = drawingLayers.getOrNull(trackJson.optInt("layerOrder", trackIndex)) ?: return@repeat
                val durations = trackJson.optJSONArray("durations")
                val visibility = trackJson.optJSONArray("visible")
                val opacities = trackJson.optJSONArray("opacity")
                val frames = mutableListOf<AnimationCel>()
                repeat(trackJson.optInt("frameCount", 0).coerceIn(0, 10000)) { frameIndex ->
                    val bytes = entries["animation/$trackIndex/$frameIndex.png"] ?: error("Cel ${frameIndex + 1} da camada ${layer.name} ausente")
                    val decoded = BitmapFactoryCompat.decode(bytes) ?: error("Cel ${frameIndex + 1} inválido")
                    val bitmap = normalizeCel(decoded, width, height)
                    decoded.recycle()
                    frames += AnimationCel(
                        "Frame ${frameIndex + 1}", bitmap,
                        durations?.optInt(frameIndex, 1)?.coerceAtLeast(1) ?: 1,
                        // Base layer visibility/opacity are applied separately;
                        // missing per-cel values must be neutral to avoid
                        // multiplying the layer opacity twice on legacy files.
                        visibility?.optBoolean(frameIndex, true) ?: true,
                        opacities?.optInt(frameIndex, 255)?.coerceIn(0, 255) ?: 255
                    )
                }
                if (frames.isNotEmpty()) {
                    engine.animationTracks[layer.id] = AnimationTrack(layer.id, frames, trackJson.optInt("activeCel", 0).coerceIn(frames.indices))
                }
            }
        } else {
            val activeLayer = layerList.getOrNull(json.optInt("active", 0).coerceIn(layerList.indices))
            val layer = activeLayer?.takeIf { it.id >= 3 } ?: drawingLayers.firstOrNull()
            if (layer != null) {
                val frames = mutableListOf<AnimationCel>()
                val frameCount = json.optInt("frameCount", 0).coerceIn(0, 10000)
                val durations = json.optJSONArray("frameDurations")
                repeat(frameCount) { index ->
                    val bytes = entries["animation/$index.png"] ?: error("Quadro de animação ${index + 1} ausente")
                    val decoded = BitmapFactoryCompat.decode(bytes) ?: error("Quadro de animação ${index + 1} inválido")
                    val bitmap = normalizeCel(decoded, width, height)
                    decoded.recycle()
                    frames += AnimationCel("Frame ${index + 1}", bitmap, durations?.optInt(index, 1)?.coerceAtLeast(1) ?: 1)
                }
                engine.animationTracks[layer.id]?.frames?.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
                if (frames.isNotEmpty()) engine.animationTracks[layer.id] = AnimationTrack(layer.id, frames)
            }
        }
        engine.syncAnimationTracks()
        engine.animationFps = json.optInt("fps", 12).coerceIn(1, 60)
        engine.animationLoop = json.optBoolean("loop", true)
        engine.onionSkinEnabled = json.optBoolean("onionEnabled", false)
        engine.onionPrevFrames = json.optInt("onionPrevious", 2).coerceIn(0, 5)
        engine.onionNextFrames = json.optInt("onionNext", 1).coerceIn(0, 5)
        engine.onionOpacity = json.optDouble("onionOpacity", 0.35).toFloat().coerceIn(0.1f, 0.85f)
        engine.onionPrevTint = json.optInt("onionPrevTint", android.graphics.Color.rgb(255, 60, 60))
        engine.onionNextTint = json.optInt("onionNextTint", android.graphics.Color.rgb(60, 140, 255))
        engine.selectionOp = runCatching {
            SelectionOp.valueOf(json.optString("selectionOp", SelectionOp.REPLACE.name))
        }.getOrDefault(SelectionOp.REPLACE)
        engine.wandTolerance = json.optInt("wandTolerance", engine.wandTolerance).coerceIn(0, 255)
        engine.wandContiguous = json.optBoolean("wandContiguous", engine.wandContiguous)
        layerList.getOrNull(json.optInt("active", 0).coerceIn(layerList.indices))?.let {
            EsenhoNativeBridge.nativeLayerSelect(it.id)
            engine.activeLayerIndex = it.id
        }
        engine.currentFrameIndex = json.optInt("currentFrame", 0).coerceIn(engine.animationFrames.indices)
        engine.currentAnimationTick = json.optInt("currentTick", 0).coerceIn(0, engine.totalAnimationTicks() - 1)
        engine.applyAnimationTick(engine.currentAnimationTick, captureActive = false)
        engine.getRenderBitmap()
    }
}

private fun normalizeCel(source: Bitmap, width: Int, height: Int): Bitmap =
    if (source.width == width && source.height == height) source.copy(Bitmap.Config.ARGB_8888, true)
    else Bitmap.createScaledBitmap(source, width, height, true)

private object BitmapFactoryCompat {
    fun decode(bytes: ByteArray): Bitmap? = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
}
