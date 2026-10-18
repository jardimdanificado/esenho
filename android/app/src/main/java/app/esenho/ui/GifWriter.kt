package app.esenho.ui

import android.graphics.Bitmap
import java.io.OutputStream

/** Writes animated GIFs with the same 6x6x6 palette and frame timing as the web encoder. */
internal object GifWriter {
    fun write(bitmap: Bitmap, output: OutputStream) = write(listOf(bitmap), 12, true, output)

    fun write(frames: List<Bitmap>, fps: Int, loop: Boolean, output: OutputStream) {
        require(frames.isNotEmpty())
        val bitmap = frames.first()
        require(frames.all { it.width == bitmap.width && it.height == bitmap.height })
        output.write("GIF89a".toByteArray(Charsets.US_ASCII))
        le16(output, bitmap.width)
        le16(output, bitmap.height)
        output.write(0x70) // no global color table; each frame carries its own 256-color table
        output.write(0) // background
        output.write(0) // pixel aspect ratio
        if (loop && frames.size > 1) {
            // NETSCAPE2.0 infinite loop extension. Without this extension GIF plays once.
            output.write(byteArrayOf(0x21, 0xFF.toByte(), 11))
            output.write("NETSCAPE2.0".toByteArray(Charsets.US_ASCII))
            output.write(byteArrayOf(3, 1, 0, 0, 0))
        }
        // Match the web native encoder: milliseconds are truncated to GIF centiseconds.
        val frameDelayMs = 1000 / fps.coerceIn(1, 60)
        val delayCs = (frameDelayMs / 10).coerceAtLeast(1)
        frames.forEach { frame ->
            // Restore-to-background disposal and frame delay, as in the web encoder.
            output.write(byteArrayOf(0x21, 0xF9.toByte(), 4, 4))
            le16(output, delayCs)
            output.write(byteArrayOf(0, 0))
            output.write(0x2C)
            le16(output, 0); le16(output, 0)
            le16(output, frame.width); le16(output, frame.height)
            output.write(0x87) // local color table, 256 entries
            writePalette(output)
            output.write(8) // LZW minimum code size

            val pixels = IntArray(frame.width * frame.height)
            frame.getPixels(pixels, 0, frame.width, 0, 0, frame.width, frame.height)
            val indexed = ByteArray(pixels.size)
            for (i in pixels.indices) {
                val pixel = pixels[i]
                val r = (pixel ushr 16) and 0xFF
                val g = (pixel ushr 8) and 0xFF
                val b = pixel and 0xFF
                val ri = ((r * 5 + 128) / 255).coerceIn(0, 5)
                val gi = ((g * 5 + 128) / 255).coerceIn(0, 5)
                val bi = ((b * 5 + 128) / 255).coerceIn(0, 5)
                indexed[i] = (ri * 36 + gi * 6 + bi).toByte()
            }
            val compressed = compressLzw(indexed)
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

    private fun writePalette(output: OutputStream) {
        // Web Quadro palette: 216 colors from the RGB cube, then a 32-step gray ramp.
        for (r in 0..5) for (g in 0..5) for (b in 0..5) {
            output.write(r * 51); output.write(g * 51); output.write(b * 51)
        }
        for (gray in 0..31) {
            val value = gray * 255 / 31
            output.write(value); output.write(value); output.write(value)
        }
        repeat(8) { output.write(0); output.write(0); output.write(0) }
    }

    private fun le16(output: OutputStream, value: Int) {
        output.write(value and 0xFF)
        output.write((value shr 8) and 0xFF)
    }

    private fun compressLzw(indexed: ByteArray): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val hashPrefix = IntArray(5003) { -1 }
        val hashChar = IntArray(5003)
        val hashCode = IntArray(5003)
        var accumulator = 0
        var bitCount = 0
        var codeSize = 9
        var nextCode = 258
        fun emit(code: Int) {
            accumulator = accumulator or (code shl bitCount)
            bitCount += codeSize
            while (bitCount >= 8) {
                out.write(accumulator and 0xFF)
                accumulator = accumulator ushr 8
                bitCount -= 8
            }
        }
        fun hash(prefix: Int, value: Int): Int = ((prefix shl 4) xor value) % hashPrefix.size
        fun clearDictionary() {
            hashPrefix.fill(-1)
            nextCode = 258
            codeSize = 9
        }

        require(indexed.isNotEmpty())
        emit(256)
        var prefix = indexed[0].toInt() and 0xFF
        for (index in 1 until indexed.size) {
            val value = indexed[index].toInt() and 0xFF
            var slot = hash(prefix, value)
            while (hashPrefix[slot] != -1 && !(hashPrefix[slot] == prefix && hashChar[slot] == value)) {
                slot = (slot + 1) % hashPrefix.size
            }
            if (hashPrefix[slot] != -1) {
                prefix = hashCode[slot]
            } else {
                emit(prefix)
                if (nextCode < 4096) {
                    hashPrefix[slot] = prefix
                    hashChar[slot] = value
                    hashCode[slot] = nextCode++
                    if (nextCode > (1 shl codeSize) && codeSize < 12) codeSize++
                } else {
                    emit(256)
                    clearDictionary()
                }
                prefix = value
            }
        }
        emit(prefix)
        emit(257)
        if (bitCount > 0) out.write(accumulator and 0xFF)
        return out.toByteArray()
    }
}
