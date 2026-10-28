import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.Graphics
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.awt.image.BufferedImage
import java.awt.image.DataBufferInt
import javax.swing.*
import kotlin.math.sin

/** Bancada desktop para o motor Quadro compartilhado com o Android. */
object EsenhoDesktop {
    init { System.loadLibrary("esenho_desktop") }
    @JvmStatic external fun init(width: Int, height: Int)
    @JvmStatic external fun size(size: Int)
    @JvmStatic external fun stroke(state: Int, x: Float, y: Float, previousX: Float, previousY: Float, color: Int, erase: Boolean)
    @JvmStatic external fun render(pixels: IntArray, width: Int, height: Int, full: Boolean): Boolean
    @JvmStatic external fun initDynamic()
    @JvmStatic external fun strokeDynamic(x: Float, y: Float, full: Boolean)
    private const val COLOR = -14671840
    private var width = 4096
    private var height = 4096

    private fun benchmark(w: Int, h: Int, count: Int, fullCopy: Boolean, dynamic: Boolean) {
        require(w > 160 && h > 160 && count > 0)
        init(w, h)
        val pixels = IntArray(Math.multiplyExact(w, h))
        check(render(pixels, w, h, true))
        val before = pixels[80 * w + 80]
        if (dynamic) initDynamic()
        val start = System.nanoTime()
        var px = 80f; var py = 80f
        if (dynamic) strokeDynamic(px, py, fullCopy) else stroke(0, px, py, px, py, COLOR, false)
        for (i in 1..count) {
            val x = 80f + i % (w - 160)
            val y = 80f + (sin(i * 0.025) * 50).toFloat()
            if (dynamic) strokeDynamic(x, y, fullCopy) else stroke(1, x, y, px, py, COLOR, false)
            check(render(pixels, w, h, if (dynamic) false else fullCopy))
            px = x; py = y
        }
        if (!dynamic) stroke(2, px, py, px, py, COLOR, false)
        val ms = (System.nanoTime() - start) / 1_000_000.0
        check(pixels[80 * w + 80] != before) { "O traço não alterou a imagem" }
        val partial = pixels.clone()
        check(render(pixels, w, h, true))
        check(partial.contentEquals(pixels)) { "Renderização parcial difere da imagem completa" }
        println("${w}x$h: $count amostras, %.1f ms, %.3f ms/amostra (traço + cópia ${if (fullCopy) "completa" else "parcial"}; sem GPU)".format(ms, ms / count))
    }
    private fun show() {
        init(width, height)
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)
        val pixels = (image.raster.dataBuffer as DataBufferInt).data
        check(render(pixels, width, height, true))
        val frame = JFrame("Esenho — bancada desktop")
        val canvas = object : JPanel() {
            var lastX = 0f; var lastY = 0f; var drawing = false; var erase = false
            init {
                val panel = this
                val input = object : MouseAdapter() {
                    fun x(e: MouseEvent) = e.x * EsenhoDesktop.width.toFloat() / panel.width
                    fun y(e: MouseEvent) = e.y * EsenhoDesktop.height.toFloat() / panel.height
                    fun update(state: Int, e: MouseEvent) {
                        val x = x(e); val y = y(e)
                        stroke(state, x, y, lastX, lastY, COLOR, erase)
                        lastX = x; lastY = y
                        check(render(pixels, EsenhoDesktop.width, EsenhoDesktop.height, false)); repaint()
                    }
                    override fun mousePressed(e: MouseEvent) { drawing = true; erase = SwingUtilities.isRightMouseButton(e); lastX = x(e); lastY = y(e); update(0, e) }
                    override fun mouseDragged(e: MouseEvent) { if (drawing) update(1, e) }
                    override fun mouseReleased(e: MouseEvent) { if (drawing) { update(2, e); drawing = false } }
                }
                addMouseListener(input); addMouseMotionListener(input)
            }
            override fun paintComponent(g: Graphics) { super.paintComponent(g); g.drawImage(image, 0, 0, getWidth(), getHeight(), null) }
            override fun getPreferredSize() = Dimension(900, 900 * EsenhoDesktop.height / EsenhoDesktop.width)
        }
        val slider = JSlider(1, 300, 24).apply { addChangeListener { size(value) } }
        val bar = JPanel(BorderLayout()).apply {
            add(JLabel("Tamanho"), BorderLayout.WEST); add(slider)
            add(JLabel("Arraste para desenhar. Botão direito apaga."), BorderLayout.SOUTH)
        }
        frame.add(canvas); frame.add(bar, BorderLayout.SOUTH)
        frame.defaultCloseOperation = JFrame.EXIT_ON_CLOSE; frame.pack(); frame.setLocationRelativeTo(null); frame.isVisible = true
    }
    @JvmStatic fun main(args: Array<String>) {
        if (args.firstOrNull() == "--benchmark") {
            benchmark(args.getOrNull(1)?.toInt() ?: 4096, args.getOrNull(2)?.toInt() ?: 4096, args.getOrNull(3)?.toInt() ?: 1000, args.getOrNull(4) == "full", args.getOrNull(5) == "dynamic"); return
        }
        if (args.size >= 2) { width = args[0].toInt(); height = args[1].toInt() }
        require(width > 0 && height > 0)
        SwingUtilities.invokeLater(::show)
    }
}
