package app.esenho.desktop.graphics

import java.awt.image.BufferedImage
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.imageio.ImageIO

/** Premultiplied RGBA matches AndroidBitmap and Quadro; public pixel access uses straight ARGB. */
class Bitmap(val width: Int, val height: Int) {
    enum class Config {
        ARGB_8888
    }

    enum class CompressFormat {
        PNG,
        JPEG,
        WEBP,
        WEBP_LOSSY,
    }

    val rgbaBuffer: ByteBuffer =
        ByteBuffer.allocateDirect(Math.multiplyExact(Math.multiplyExact(width, height), 4))
            .order(ByteOrder.LITTLE_ENDIAN)
    private var cachedImage: BufferedImage? = null

    private var dirtyX0 = 0
    private var dirtyY0 = 0
    private var dirtyX1 = width - 1
    private var dirtyY1 = height - 1

    fun markDirty() = markDirty(0, 0, width - 1, height - 1)

    /** Inclusive bounds, matching the native renderer's dirty rectangle. */
    fun markDirty(x0: Int, y0: Int, x1: Int, y1: Int) {
        val left = x0.coerceAtLeast(0)
        val top = y0.coerceAtLeast(0)
        val right = x1.coerceAtMost(width - 1)
        val bottom = y1.coerceAtMost(height - 1)
        if (left > right || top > bottom) return
        dirtyX0 = minOf(dirtyX0, left)
        dirtyY0 = minOf(dirtyY0, top)
        dirtyX1 = maxOf(dirtyX1, right)
        dirtyY1 = maxOf(dirtyY1, bottom)
    }

    var isRecycled = false
        private set

    val config = Config.ARGB_8888

    fun recycle() {
        isRecycled = true
        cachedImage = null
    }

    fun getPixel(x: Int, y: Int): Int {
        check(!isRecycled)
        require(x in 0 until width && y in 0 until height)
        val p = rgbaBuffer.getInt((y * width + x) * 4)
        val alpha = p ushr 24
        if (alpha == 0) return 0
        fun straight(channel: Int) = ((channel * 255 + alpha / 2) / alpha).coerceAtMost(255)
        return (alpha shl 24) or
            (straight(p and 255) shl 16) or
            (straight(p ushr 8 and 255) shl 8) or
            straight(p ushr 16 and 255)
    }

    fun setPixel(x: Int, y: Int, color: Int) {
        check(!isRecycled)
        require(x in 0 until width && y in 0 until height)
        markDirty(x, y, x, y)
        rgbaBuffer.putInt(
            (y * width + x) * 4,
            (Color.alpha(color) shl 24) or
                ((Color.red(color) * Color.alpha(color) + 127) / 255) or
                (((Color.green(color) * Color.alpha(color) + 127) / 255) shl 8) or
                (((Color.blue(color) * Color.alpha(color) + 127) / 255) shl 16),
        )
    }

    fun getPixels(out: IntArray, offset: Int, stride: Int, x: Int, y: Int, w: Int, h: Int) {
        for (row in 0 until h) for (col in 0 until w) out[offset + row * stride + col] =
            getPixel(x + col, y + row)
    }

    fun setPixels(input: IntArray, offset: Int, stride: Int, x: Int, y: Int, w: Int, h: Int) {
        for (row in 0 until h) for (col in 0 until w) setPixel(
            x + col,
            y + row,
            input[offset + row * stride + col],
        )
    }

    fun eraseColor(color: Int) {
        for (y in 0 until height) for (x in 0 until width) setPixel(x, y, color)
    }

    fun copy(config: Config, mutable: Boolean): Bitmap =
        Bitmap(width, height).also {
            it.rgbaBuffer.put(rgbaBuffer.duplicate().clear())
            it.rgbaBuffer.clear()
        }

    fun toImage(): BufferedImage {
        check(!isRecycled)
        val image = cachedImage ?: BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB_PRE)
            .also { cachedImage = it }
        if (dirtyX0 > dirtyX1 || dirtyY0 > dirtyY1) return image
        val pixels = (image.raster.dataBuffer as java.awt.image.DataBufferInt).data
        val source = rgbaBuffer.asIntBuffer()
        for (y in dirtyY0..dirtyY1) {
            for (i in y * width + dirtyX0..y * width + dirtyX1) {
                val p = source.get(i)
                pixels[i] = (p and -0xff0100) or ((p and 255) shl 16) or ((p ushr 16) and 255)
            }
        }
        dirtyX0 = width
        dirtyY0 = height
        dirtyX1 = -1
        dirtyY1 = -1
        return image
    }

    fun replace(image: BufferedImage) {
        setPixels(image.getRGB(0, 0, width, height, null, 0, width), 0, width, 0, 0, width, height)
    }

    fun compress(format: CompressFormat, quality: Int, out: OutputStream): Boolean {
        if (format == CompressFormat.WEBP || format == CompressFormat.WEBP_LOSSY) {
            val process =
                ProcessBuilder(
                        "ffmpeg",
                        "-v",
                        "error",
                        "-f",
                        "image2pipe",
                        "-i",
                        "pipe:0",
                        "-f",
                        "webp",
                        "-quality",
                        quality.toString(),
                        "pipe:1",
                    )
                    .redirectError(ProcessBuilder.Redirect.INHERIT)
                    .start()
            val writer =
                Thread { process.outputStream.use { ImageIO.write(toImage(), "png", it) } }
                    .apply { start() }
            process.inputStream.use { it.copyTo(out) }
            writer.join()
            return process.waitFor() == 0
        }
        var image = toImage()
        if (format == CompressFormat.JPEG) {
            image =
                BufferedImage(width, height, BufferedImage.TYPE_INT_RGB).also { rgb ->
                    rgb.createGraphics().let { g ->
                        g.color = java.awt.Color.WHITE
                        g.fillRect(0, 0, width, height)
                        g.drawImage(image, 0, 0, null)
                        g.dispose()
                    }
                }
        }
        if (format == CompressFormat.JPEG) {
            val writer = ImageIO.getImageWritersByFormatName("jpg").next()
            try {
                ImageIO.createImageOutputStream(out).use { stream ->
                    writer.output = stream
                    val params =
                        writer.defaultWriteParam.apply {
                            compressionMode = javax.imageio.ImageWriteParam.MODE_EXPLICIT
                            compressionQuality = quality.coerceIn(0, 100) / 100f
                        }
                    writer.write(null, javax.imageio.IIOImage(image, null, null), params)
                }
            } finally {
                writer.dispose()
            }
            return true
        }
        return ImageIO.write(image, "png", out)
    }

    companion object {
        fun createBitmap(w: Int, h: Int, config: Config) = Bitmap(w, h)

        fun createBitmap(source: Bitmap, x: Int, y: Int, w: Int, h: Int): Bitmap =
            Bitmap(w, h).also { out ->
                val pixels = IntArray(w * h)
                source.getPixels(pixels, 0, w, x, y, w, h)
                out.setPixels(pixels, 0, w, 0, 0, w, h)
            }

        fun createScaledBitmap(source: Bitmap, w: Int, h: Int, filter: Boolean): Bitmap =
            Bitmap(w, h).also { out ->
                val image = BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB)
                image.createGraphics().let { g ->
                    g.setRenderingHint(
                        java.awt.RenderingHints.KEY_INTERPOLATION,
                        if (filter) java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR
                        else java.awt.RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR,
                    )
                    g.drawImage(source.toImage(), 0, 0, w, h, null)
                    g.dispose()
                }
                out.replace(image)
            }
    }
}

object BitmapFactory {
    class Options {
        var inPreferredConfig = Bitmap.Config.ARGB_8888
        var inJustDecodeBounds = false
        var outWidth = 0
        var outHeight = 0
    }

    fun decodeStream(input: InputStream, padding: Rect?, options: Options): Bitmap? {
        val stream = ImageIO.createImageInputStream(input)
        stream.use {
            val readers = ImageIO.getImageReaders(stream)
            if (!readers.hasNext()) return null
            val reader = readers.next()
            try {
                reader.input = stream
                options.outWidth = reader.getWidth(0)
                options.outHeight = reader.getHeight(0)
                if (options.inJustDecodeBounds) return null
                val image = reader.read(0)
                return Bitmap(image.width, image.height).also { it.replace(image) }
            } finally {
                reader.dispose()
            }
        }
    }

    fun decodeStream(input: InputStream): Bitmap? =
        ImageIO.read(input)?.let { image ->
            Bitmap(image.width, image.height).also { it.replace(image) }
        }

    fun decodeFile(path: String): Bitmap? = java.io.File(path).inputStream().use(::decodeStream)

    fun decodeByteArray(data: ByteArray, offset: Int, length: Int): Bitmap? =
        decodeStream(data.copyOfRange(offset, offset + length).inputStream())
}
