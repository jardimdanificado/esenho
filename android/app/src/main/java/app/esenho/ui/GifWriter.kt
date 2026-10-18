package app.esenho.ui

import android.graphics.Bitmap
import java.io.OutputStream

/** Writes a standards-compliant single-frame GIF using a fixed RGB332 palette. */
internal object GifWriter {
    fun write(bitmap: Bitmap, output: OutputStream) = write(listOf(bitmap), 12, output)

    fun write(frames: List<Bitmap>, fps: Int, output: OutputStream) {
        require(frames.isNotEmpty())
        val bitmap = frames.first()
        require(frames.all { it.width == bitmap.width && it.height == bitmap.height })
        output.write("GIF89a".toByteArray(Charsets.US_ASCII))
        le16(output, bitmap.width)
        le16(output, bitmap.height)
        output.write(0xF7) // global table, 8-bit color resolution, 256 entries
        output.write(0) // background
        output.write(0) // pixel aspect ratio
        for (i in 0..255) {
            val r = ((i shr 5) and 7) * 255 / 7
            val g = ((i shr 2) and 7) * 255 / 7
            val b = (i and 3) * 255 / 3
            output.write(r); output.write(g); output.write(b)
        }
        if (frames.size > 1) {
            // NETSCAPE2.0 infinite loop extension.
            output.write(byteArrayOf(0x21, 0xFF.toByte(), 11))
            output.write("NETSCAPE2.0".toByteArray(Charsets.US_ASCII))
            output.write(byteArrayOf(3, 1, 0, 0, 0))
        }
        val delayCs = (100 / fps.coerceIn(1, 30)).coerceAtLeast(1)
        frames.forEach { frame ->
            // Restore the opaque animation frame and its frame delay.
            output.write(byteArrayOf(0x21, 0xF9.toByte(), 4, 0))
            le16(output, delayCs)
            output.write(byteArrayOf(0, 0))
            output.write(0x2C)
            le16(output, 0); le16(output, 0)
            le16(output, frame.width); le16(output, frame.height)
            output.write(0) // use global palette
            output.write(8) // LZW minimum code size

            val pixels = IntArray(frame.width * frame.height)
            frame.getPixels(pixels, 0, frame.width, 0, 0, frame.width, frame.height)
            val data = ByteArrayOutputStreamCompat()
            var bits = 0
            var bitCount = 0
            fun emit(code: Int) {
                bits = bits or (code shl bitCount)
                bitCount += 9
                while (bitCount >= 8) {
                    data.write(bits and 0xFF)
                    bits = bits ushr 8
                    bitCount -= 8
                }
            }
            // Reset before each literal. This keeps codes at 9 bits and bounds
            // memory while producing a modest, valid GIF for large canvases.
            for (pixel in pixels) {
                emit(256)
                val r = (pixel ushr 16) and 0xFF
                val g = (pixel ushr 8) and 0xFF
                val b = pixel and 0xFF
                emit(((r * 7 / 255) shl 5) or ((g * 7 / 255) shl 2) or (b * 3 / 255))
            }
            emit(257)
            if (bitCount > 0) data.write(bits and 0xFF)
            val compressed = data.toByteArray()
            var offset = 0
            while (offset < compressed.size) {
                val count = minOf(255, compressed.size - offset)
                output.write(count)
                output.write(compressed, offset, count)
                offset += count
            }
            output.write(0) // image data terminator
        }
        output.write(byteArrayOf(0x3B)) // trailer
        output.flush()
    }

    private fun le16(output: OutputStream, value: Int) {
        output.write(value and 0xFF)
        output.write((value shr 8) and 0xFF)
    }

    private class ByteArrayOutputStreamCompat {
        private val out = java.io.ByteArrayOutputStream()
        fun write(value: Int) = out.write(value)
        fun toByteArray(): ByteArray = out.toByteArray()
    }
}
