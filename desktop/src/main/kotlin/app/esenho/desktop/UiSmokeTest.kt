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
    kotlinx.coroutines.delay(100)
    val during =
        engine
            .getRenderBitmap()!!
            .toImage()
            .getRGB(0, 0, engine.width, engine.height, null, 0, engine.width)
    val movedColumns = before.indices.filter { before[it] != during[it] }.map { it % engine.width }
    check(movedColumns.isNotEmpty() && movedColumns.max() - movedColumns.min() > 30) {
        "Arraste não continuou o traço antes de soltar o botão"
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
    kotlinx.coroutines.delay(100)
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
