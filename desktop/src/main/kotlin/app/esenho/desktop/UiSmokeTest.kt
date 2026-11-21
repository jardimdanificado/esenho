package app.esenho.desktop

import java.awt.Component
import java.awt.Container
import java.io.File
import javax.imageio.ImageIO
import org.jetbrains.skia.Image
import org.jetbrains.skiko.SkiaLayer

internal var desktopUiTestCanvas: app.esenho.ui.EsenhoCanvasView? = null

internal var desktopUiTestCommand: ((String) -> Unit)? = null

private fun children(component: Component): Sequence<Component> = sequence {
    yield(component)
    if (component is Container) component.components.forEach { yieldAll(children(it)) }
}

/** Captures this application's actual Compose framebuffer, including canvas and overlays. */
fun captureEditor(window: java.awt.Window, output: File) {
    val windows =
        java.awt.Window.getWindows().filter { candidate ->
            candidate.isShowing && generateSequence(candidate) { it.owner }.any { it === window }
        }
    val layers =
        windows
            .flatMap { children(it).filterIsInstance<SkiaLayer>().toList() }
            .filter { it.isShowing }
    check(layers.isNotEmpty())
    val bounds =
        layers
            .map { java.awt.Rectangle(it.locationOnScreen, it.size) }
            .reduce { a, b -> a.union(b) }
    val result =
        java.awt.image.BufferedImage(
            bounds.width,
            bounds.height,
            java.awt.image.BufferedImage.TYPE_INT_ARGB,
        )
    val graphics = result.createGraphics()
    try {
        for (layer in layers) {
            val point = layer.locationOnScreen
            val bitmap = layer.screenshot() ?: continue
            val chrome =
                bitmap.use {
                    Image.makeFromBitmap(it).use { image ->
                        image.encodeToData()!!.use { data ->
                            ImageIO.read(data.bytes.inputStream())
                        }
                    }
                }
            graphics.drawImage(
                chrome,
                point.x - bounds.x,
                point.y - bounds.y,
                layer.width,
                layer.height,
                null,
            )
        }
    } finally {
        graphics.dispose()
    }
    output.parentFile?.mkdirs()
    ImageIO.write(result, "png", output)
    println("Desktop UI screenshot: ${output.absolutePath} (${layers.size} render buffers)")
}

suspend fun exerciseDesktopCanvas(window: java.awt.Window) {
    val view = checkNotNull(desktopUiTestCanvas)
    check(view.width > 0 && view.height > 0)
    val engine = checkNotNull(view.engine)
    // The session may restore any color; the stroke checks need a known ink against the page.
    engine.currentColor = 0xFF102030.toInt()
    val before =
        engine
            .getRenderBitmap()!!
            .toImage()
            .getRGB(0, 0, engine.width, engine.height, null, 0, engine.width)
    val x = view.width / 2
    val y = view.height / 2
    val target = children(window).filterIsInstance<SkiaLayer>().first().canvas
    val origin =
        java.awt.Point((view.editorBounds.left + x).toInt(), (view.editorBounds.top + y).toInt())
    val time = System.currentTimeMillis()
    target.dispatchEvent(
        java.awt.event.MouseEvent(
            target,
            java.awt.event.MouseEvent.MOUSE_PRESSED,
            time,
            java.awt.event.InputEvent.BUTTON1_DOWN_MASK,
            origin.x,
            origin.y,
            1,
            false,
            1,
        )
    )
    kotlinx.coroutines.delay(100)
    target.dispatchEvent(
        java.awt.event.MouseEvent(
            target,
            java.awt.event.MouseEvent.MOUSE_DRAGGED,
            time + 20,
            java.awt.event.InputEvent.BUTTON1_DOWN_MASK,
            origin.x + 40,
            origin.y + 20,
            0,
            false,
            0,
        )
    )
    kotlinx.coroutines.delay(400)
    val during =
        engine
            .getRenderBitmap()!!
            .toImage()
            .getRGB(0, 0, engine.width, engine.height, null, 0, engine.width)
    val movedColumns = before.indices.filter { before[it] != during[it] }.map { it % engine.width }
    check(movedColumns.isNotEmpty() && movedColumns.max() - movedColumns.min() > 30) {
        captureEditor(window, File("desktop/build/ui-input-failure.png"))
        "Arraste não continuou o traço antes de soltar o botão: changed=${movedColumns.size}, " +
            "span=${if (movedColumns.isEmpty()) 0 else movedColumns.max()-movedColumns.min()}, " +
            "tool=${engine.currentTool}, vector=${engine.vectors.enabled}, stroke=${engine.isStrokeActive}, " +
            "bounds=${view.editorBounds}, view=${view.width}x${view.height}, target=${target.width}x${target.height}, " +
            "origin=$origin, activeWindow=${java.awt.KeyboardFocusManager.getCurrentKeyboardFocusManager().activeWindow?.name}"
    }
    check(engine.isStrokeActive) { "Traço terminou durante o arraste" }
    target.dispatchEvent(
        java.awt.event.MouseEvent(
            target,
            java.awt.event.MouseEvent.MOUSE_RELEASED,
            time + 40,
            0,
            origin.x + 40,
            origin.y + 20,
            1,
            false,
            1,
        )
    )
    kotlinx.coroutines.delay(400)
    val after =
        engine
            .getRenderBitmap()!!
            .toImage()
            .getRGB(0, 0, engine.width, engine.height, null, 0, engine.width)
    check(!before.contentEquals(after)) { "Mouse desktop não desenhou no documento" }
    val changedX = before.indices.filter { before[it] != after[it] }.map { it % engine.width }
    check(changedX.max() - changedX.min() > 30) {
        "Traço interrompido: apenas ${changedX.max()-changedX.min()} colunas alteradas"
    }
    check(!engine.isStrokeActive) { "Soltar o botão não terminou o traço" }
    check(engine.canUndo)
    println("Desktop UI: entrada de mouse e renderização OK")
}

suspend fun clickEditor(window: java.awt.Window, x: Int, y: Int) {
    val target = children(window).filterIsInstance<SkiaLayer>().first().canvas
    val time = System.currentTimeMillis()
    target.dispatchEvent(
        java.awt.event.MouseEvent(
            target,
            java.awt.event.MouseEvent.MOUSE_PRESSED,
            time,
            java.awt.event.InputEvent.BUTTON1_DOWN_MASK,
            x,
            y,
            1,
            false,
            1,
        )
    )
    kotlinx.coroutines.delay(30)
    target.dispatchEvent(
        java.awt.event.MouseEvent(
            target,
            java.awt.event.MouseEvent.MOUSE_RELEASED,
            time + 30,
            0,
            x,
            y,
            1,
            false,
            1,
        )
    )
    kotlinx.coroutines.delay(400)
}

/** Clicks the second entry of the brush shelf and checks the engine actually switched brush. */
suspend fun exerciseBrushShelf(window: java.awt.Window) {
    val view = checkNotNull(desktopUiTestCanvas)
    val engine = checkNotNull(view.engine)
    checkNotNull(desktopUiTestCommand)("shelfShow")
    kotlinx.coroutines.delay(500)
    checkNotNull(desktopUiTestCommand)("shelfFill")
    kotlinx.coroutines.delay(500)
    val target = children(window).filterIsInstance<SkiaLayer>().first { it.isShowing }.canvas
    val favorites = engine.presetCatalog.take(6).map { it.id }
    check(favorites.size >= 3)
    // Flat two-row shelf is the last bottom bar: divider + colors + divider + brushes.
    val brushRowY = target.height - 18
    // Second and third entries of the preset favorites strip.
    clickEditor(window, 175, brushRowY)
    kotlinx.coroutines.delay(300)
    captureEditor(window, File("desktop/build/ui-brush-shelf.png"))
    check(engine.selectedPreset?.id == favorites[1]) {
        "Brush shelf click did not switch brush: selected=${engine.selectedPreset?.id}, expected=${favorites[1]}, y=$brushRowY"
    }
    clickEditor(window, 275, brushRowY)
    kotlinx.coroutines.delay(300)
    check(engine.selectedPreset?.id == favorites[2]) {
        "Second shelf click did not switch brush: selected=${engine.selectedPreset?.id}, expected=${favorites[2]}, y=$brushRowY"
    }
    println("Desktop UI: brush shelf switches brush OK")
}

suspend fun exerciseProjectMenu(window: java.awt.Window) {
    val before =
        checkNotNull(desktopUiTestCanvas)
            .engine!!
            .getRenderBitmap()!!
            .copy(app.esenho.desktop.graphics.Bitmap.Config.ARGB_8888, false)
    clickEditor(window, 20, 20)
    val output = File("desktop/build/ui-project-menu.png")
    captureEditor(window, output)
    val image = ImageIO.read(output)
    check((image.getRGB(image.width / 2, image.height / 2) ushr 24) == 255) {
        "Canvas deixou um furo na camada Compose"
    }
    clickEditor(window, 20, 60)
    val after = checkNotNull(desktopUiTestCanvas).engine!!.getRenderBitmap()!!
    check(
        before
            .toImage()
            .getRGB(0, 0, before.width, before.height, null, 0, before.width)
            .contentEquals(
                after.toImage().getRGB(0, 0, after.width, after.height, null, 0, after.width)
            )
    ) {
        "Interagir com menu desenhou no canvas"
    }
    before.recycle()
    // Repeat focus transitions between the document canvas and an overlay.
    repeat(3) {
        clickEditor(window, 20, 20)
        clickEditor(window, 20, 60)
    }
    println("Desktop UI: menu de projeto e troca de foco OK")
}

/** Checks vector gestures reach the shared editor through the actual Compose surface. */
suspend fun exerciseDesktopVectors(window: java.awt.Window) {
    val target = children(window).filterIsInstance<SkiaLayer>().first { it.isShowing }.canvas
    clickEditor(window, 20, 20)
    checkNotNull(desktopUiTestCommand)("vector")
    kotlinx.coroutines.delay(400)
    clickEditor(window, 20, 20)
    val view = checkNotNull(desktopUiTestCanvas)
    val engine = checkNotNull(view.engine)
    check(engine.vectors.enabled) { "The document menu did not switch to the vector workspace" }
    val origin =
        java.awt.Point(
            (view.editorBounds.left + view.width / 2).toInt(),
            (view.editorBounds.top + view.height / 2).toInt(),
        )
    fun event(id: Int, x: Int, y: Int, down: Boolean, shift: Boolean = false) {
        target.dispatchEvent(
            java.awt.event.MouseEvent(
                target,
                id,
                System.currentTimeMillis(),
                (if (down) java.awt.event.InputEvent.BUTTON1_DOWN_MASK else 0) or (if (shift) java.awt.event.InputEvent.SHIFT_DOWN_MASK else 0),
                x,
                y,
                1,
                false,
                if (id == java.awt.event.MouseEvent.MOUSE_DRAGGED) 0 else 1,
            )
        )
    }
    event(java.awt.event.MouseEvent.MOUSE_PRESSED, origin.x - 60, origin.y, true)
    event(java.awt.event.MouseEvent.MOUSE_DRAGGED, origin.x, origin.y - 45, true)
    event(java.awt.event.MouseEvent.MOUSE_DRAGGED, origin.x + 60, origin.y + 15, true)
    event(java.awt.event.MouseEvent.MOUSE_RELEASED, origin.x + 60, origin.y + 15, false)
    kotlinx.coroutines.delay(500)
    check(engine.vectors.layers.values.flatten().isNotEmpty()) {
        "Compose gesture did not create a vector object"
    }
    checkNotNull(desktopUiTestCommand)("vectorNodes")
    kotlinx.coroutines.delay(500)
    captureEditor(window, File("desktop/build/ui-vector.png"))
    check(view.editorBounds.top <= 48f) { "A permanent mode bar still occupies the canvas top" }
    checkNotNull(desktopUiTestCommand)("vectorObjects")
    kotlinx.coroutines.delay(500)
    captureEditor(window, File("desktop/build/ui-vector-objects.png"))
    checkNotNull(desktopUiTestCommand)("vectorColor")
    kotlinx.coroutines.delay(500)
    captureEditor(window, File("desktop/build/ui-vector-color.png"))
    val colorBefore = engine.vectors.selected!!.style.getInt("color")
    // Classic palette swatch inside the color studio dock (red, not the restored white).
    clickEditor(window, target.width - 198, 223)
    kotlinx.coroutines.delay(200)
    check(engine.currentColor != colorBefore) { "The color studio did not accept the pointer" }
    check(engine.vectors.selected!!.style.getInt("color") == engine.currentColor) {
        "The color studio did not update the selected vector"
    }
    val toolY = view.editorBounds.bottom.toInt() + 60
    clickEditor(window, 60, toolY)
    check(engine.vectors.tool == app.esenho.nativeengine.VectorTool.PEN) {
        "The pen button did not select the pen (got ${engine.vectors.tool})"
    }
    clickEditor(window, 295, toolY)
    check(engine.vectors.tool == app.esenho.nativeengine.VectorTool.RECT) {
        "The rectangle button did not select the shape tool: ${engine.vectors.tool}"
    }
    val sx = (view.editorBounds.left + view.width / 2).toInt()
    val sy = (view.editorBounds.top + view.height / 2).toInt()
    event(java.awt.event.MouseEvent.MOUSE_PRESSED, sx, sy, true)
    kotlinx.coroutines.delay(100)
    event(java.awt.event.MouseEvent.MOUSE_DRAGGED, sx + 60, sy + 60, true)
    kotlinx.coroutines.delay(100)
    event(java.awt.event.MouseEvent.MOUSE_RELEASED, sx + 60, sy + 60, false)
    kotlinx.coroutines.delay(200)
    check(engine.vectors.selected!!.closed && engine.vectors.selected!!.nodes.size == 4) {
        "The shape tool did not draw a rectangle"
    }
    // Capture the pen before release, including its anchor and two handles.
    clickEditor(window, 60, view.editorBounds.bottom.toInt() + 60)
    event(java.awt.event.MouseEvent.MOUSE_PRESSED, sx, sy, true)
    kotlinx.coroutines.delay(50)
    event(java.awt.event.MouseEvent.MOUSE_DRAGGED, sx + 35, sy - 25, true)
    kotlinx.coroutines.delay(100)
    captureEditor(window, File("desktop/build/ui-vector-pen.png"))
    event(java.awt.event.MouseEvent.MOUSE_RELEASED, sx + 35, sy - 25, false)
    kotlinx.coroutines.delay(200)
    // Use the real selection tool, marquee and resize handle through Compose pointer events.
    clickEditor(window, 136, view.editorBounds.bottom.toInt() + 60)
    check(engine.vectors.tool == app.esenho.nativeengine.VectorTool.SELECT)
    checkNotNull(desktopUiTestCommand)("vectorObjects")
    checkNotNull(desktopUiTestCommand)("vectorClear")
    kotlinx.coroutines.delay(300)
    val objects = engine.vectors.layers.getValue(engine.activeLayerIndex)
    val bounds = checkNotNull(app.esenho.nativeengine.VectorSelection.VectorBounds.of(objects))
    fun screenPoint(x: Float,y: Float): Pair<Int,Int> {
        val p=floatArrayOf(x,y);view.transformMatrix.mapPoints(p)
        return (p[0]+view.editorBounds.left).toInt() to (p[1]+view.editorBounds.top).toInt()
    }
    val boxStart=screenPoint(bounds.left-35,bounds.top-35)
    val boxEnd=screenPoint(bounds.right+35,bounds.bottom+35)
    event(java.awt.event.MouseEvent.MOUSE_PRESSED,boxStart.first,boxStart.second,true)
    kotlinx.coroutines.delay(50)
    event(java.awt.event.MouseEvent.MOUSE_DRAGGED,boxEnd.first,boxEnd.second,true)
    kotlinx.coroutines.delay(50)
    event(java.awt.event.MouseEvent.MOUSE_RELEASED,boxEnd.first,boxEnd.second,false)
    kotlinx.coroutines.delay(200)
    check(engine.vectors.selection.objects.size==objects.size) { "Marquee did not select every enclosed vector" }
    val anchor=objects.first().nodes.first()
    val shiftPoint=screenPoint(anchor.x,anchor.y)
    event(java.awt.event.MouseEvent.MOUSE_PRESSED,shiftPoint.first,shiftPoint.second,true,true)
    kotlinx.coroutines.delay(50)
    event(java.awt.event.MouseEvent.MOUSE_RELEASED,shiftPoint.first,shiftPoint.second,false,true)
    kotlinx.coroutines.delay(100)
    check(engine.vectors.selection.objects.size==objects.size-1) { "Shift-click did not remove an object from selection" }
    event(java.awt.event.MouseEvent.MOUSE_PRESSED,shiftPoint.first,shiftPoint.second,true,true)
    kotlinx.coroutines.delay(50)
    event(java.awt.event.MouseEvent.MOUSE_RELEASED,shiftPoint.first,shiftPoint.second,false,true)
    kotlinx.coroutines.delay(100)
    check(engine.vectors.selection.objects.size==objects.size) { "Shift-click did not add the object back" }
    captureEditor(window, File("desktop/build/ui-vector-selection.png"))
    val resizeStart=screenPoint(bounds.right,bounds.bottom)
    event(java.awt.event.MouseEvent.MOUSE_PRESSED,resizeStart.first,resizeStart.second,true)
    kotlinx.coroutines.delay(50)
    event(java.awt.event.MouseEvent.MOUSE_DRAGGED,resizeStart.first+30,resizeStart.second+25,true)
    kotlinx.coroutines.delay(50)
    event(java.awt.event.MouseEvent.MOUSE_RELEASED,resizeStart.first+30,resizeStart.second+25,false)
    kotlinx.coroutines.delay(200)
    check(engine.vectors.selection.bounds()!!.width>bounds.width+20) { "Selection handle did not scale the geometry" }
    checkNotNull(desktopUiTestCommand)("undo")
    kotlinx.coroutines.delay(200)
    val vectorBottom = view.editorBounds.bottom
    checkNotNull(desktopUiTestCommand)("toggleTools")
    kotlinx.coroutines.delay(300)
    check(view.editorBounds.bottom >= vectorBottom + 35f) { "Vector tools did not hide" }
    val prefs = app.esenho.desktop.platform.Context().getSharedPreferences("esenho_workspace", 0)
    check(!prefs.getBoolean("vector_tools_visible", true))
    checkNotNull(desktopUiTestCommand)("raster")
    kotlinx.coroutines.delay(300)
    captureEditor(window, File("desktop/build/ui-raster-tools.png"))
    check(prefs.getBoolean("raster_tools_visible", true)) {
        "Hiding vector tools also hid raster tools"
    }
    clickEditor(window, 60, view.editorBounds.bottom.toInt() + 60)
    check(engine.currentTool == app.esenho.nativeengine.ToolMode.ERASER) {
        "Raster tool buttons do not choose raster tools"
    }
    val rasterBottom = view.editorBounds.bottom
    checkNotNull(desktopUiTestCommand)("toggleTools")
    kotlinx.coroutines.delay(300)
    check(view.editorBounds.bottom >= rasterBottom + 35f) { "Raster tools did not hide" }
    captureEditor(window, File("desktop/build/ui-raster-tools-hidden.png"))
    checkNotNull(desktopUiTestCommand)("vector")
    kotlinx.coroutines.delay(300)
    check(view.editorBounds.bottom >= vectorBottom + 35f) { "Vector visibility was not remembered" }
    checkNotNull(desktopUiTestCommand)("toggleTools")
    kotlinx.coroutines.delay(300)
    check(kotlin.math.abs(view.editorBounds.bottom - vectorBottom) < 2f) {
        "Vector tools could not be restored"
    }
    checkNotNull(desktopUiTestCommand)("raster")
    kotlinx.coroutines.delay(300)
    check(view.editorBounds.bottom >= rasterBottom + 35f) { "Raster visibility was not remembered" }
    checkNotNull(desktopUiTestCommand)("toggleTools")
    kotlinx.coroutines.delay(300)
    check(kotlin.math.abs(view.editorBounds.bottom - rasterBottom) < 2f) {
        "Raster tools could not be restored"
    }
    checkNotNull(desktopUiTestCommand)("vector")
    engine.vectors.layers.getValue(engine.activeLayerIndex).clear()
    engine.vectors.importSvg("""<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
        <rect x="260" y="640" width="560" height="640" fill="#cb702e"/>
        <ellipse cx="540" cy="960" rx="140" ry="180" fill="#304050"/>
    </svg>""")
    checkNotNull(desktopUiTestCommand)("vectorSelect")
    checkNotNull(desktopUiTestCommand)("vectorObjects")
    checkNotNull(desktopUiTestCommand)("vectorAll")
    kotlinx.coroutines.delay(300)
    captureEditor(window, File("desktop/build/ui-vector-boolean-ready.png"))
    engine.vectors.selection.all()
    engine.vectors.selection.boolean(app.esenho.nativeengine.VectorBooleanOperation.SUBTRACT)
    kotlinx.coroutines.delay(200)
    val compound=engine.vectors.layers.getValue(engine.activeLayerIndex).single()
    check(compound.subPaths.isNotEmpty()) { "Subtraction button did not create an editable hole" }
    val bitmap=app.esenho.desktop.graphics.Bitmap(engine.width,engine.height)
    check(app.esenho.nativeengine.EsenhoNativeBridge.nativeLayerGetBitmap(engine.activeLayerIndex,bitmap))
    check(bitmap.getPixel(540,960) ushr 24==0 && bitmap.getPixel(300,700) ushr 24>0)
    bitmap.recycle()
    captureEditor(window, File("desktop/build/ui-vector-boolean.png"))
    println(
        "Desktop UI: raster/vector tools, independent visibility, pen anchors, shapes and color editing OK"
    )
}
