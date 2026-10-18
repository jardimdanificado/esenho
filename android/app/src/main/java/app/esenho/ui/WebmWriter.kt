package app.esenho.ui

import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteBuffer

/** Encodes raster animation bitmaps as VP8 in a WebM container. */
object WebmWriter {
    private const val MIME = "video/x-vnd.on2.vp8"

    fun write(frames: List<Bitmap>, fps: Int, output: File) {
        require(frames.isNotEmpty()) { "A animação não tem quadros" }
        val width = (frames.first().width + 1) and -2
        val height = (frames.first().height + 1) and -2
        val rate = fps.coerceIn(1, 60)
        val baseFormat = MediaFormat.createVideoFormat(MIME, width, height).apply {
            setInteger(MediaFormat.KEY_FRAME_RATE, rate)
            setInteger(MediaFormat.KEY_BIT_RATE, (width.toLong() * height * rate / 4L).coerceIn(500_000L, 20_000_000L).toInt())
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
        }
        val codecName = MediaCodecList(MediaCodecList.REGULAR_CODECS).findEncoderForFormat(baseFormat)
            ?: error("Este dispositivo não oferece codificação VP8 para WebM")
        val codecInfo = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.first { it.name == codecName }
        val caps = codecInfo.getCapabilitiesForType(MIME)
        val colorFormat = when {
            caps.colorFormats.contains(MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar) -> MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar
            caps.colorFormats.contains(MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar) -> MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar
            else -> error("O codificador VP8 não aceita entrada YUV 4:2:0 compatível")
        }
        baseFormat.setInteger(MediaFormat.KEY_COLOR_FORMAT, colorFormat)

        var codec: MediaCodec? = null
        var muxer: MediaMuxer? = null
        var muxerStarted = false
        var trackIndex = -1
        try {
            output.parentFile?.mkdirs()
            output.delete()
            codec = MediaCodec.createByCodecName(codecName)
            muxer = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM)
            codec.configure(baseFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            codec.start()

            val info = MediaCodec.BufferInfo()
            var inputIndex = 0
            var inputEosQueued = false
            var outputEosSeen = false
            var idleDrains = 0

            while (!outputEosSeen) {
                if (!inputEosQueued && inputIndex < frames.size) {
                    val inIndex = codec.dequeueInputBuffer(10_000)
                    if (inIndex >= 0) {
                        val input = codec.getInputBuffer(inIndex) ?: error("Buffer de entrada VP8 indisponível")
                        input.clear()
                        val bytes = toYuv420(frames[inputIndex], width, height, colorFormat == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar)
                        require(bytes.size <= input.remaining()) { "O quadro excede o buffer do codificador" }
                        input.put(bytes)
                        val pts = inputIndex.toLong() * 1_000_000L / rate
                        codec.queueInputBuffer(inIndex, 0, bytes.size, pts, 0)
                        inputIndex++
                    }
                } else if (!inputEosQueued && inputIndex >= frames.size) {
                    val inIndex = codec.dequeueInputBuffer(10_000)
                    if (inIndex >= 0) {
                        val pts = frames.size.toLong() * 1_000_000L / rate
                        codec.queueInputBuffer(inIndex, 0, 0, pts, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                        inputEosQueued = true
                    }
                }

                when (val outIndex = codec.dequeueOutputBuffer(info, 10_000)) {
                    MediaCodec.INFO_TRY_AGAIN_LATER -> {
                        idleDrains++
                        check(idleDrains < 100) { "Tempo esgotado ao codificar WebM" }
                    }
                    MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        check(!muxerStarted) { "O formato do vídeo mudou durante a codificação" }
                        trackIndex = muxer.addTrack(codec.outputFormat)
                        muxer.start()
                        muxerStarted = true
                        idleDrains = 0
                    }
                    else -> if (outIndex >= 0) {
                        val encoded = codec.getOutputBuffer(outIndex)
                        if (encoded != null && info.size > 0 && muxerStarted && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
                            encoded.position(info.offset)
                            encoded.limit(info.offset + info.size)
                            muxer.writeSampleData(trackIndex, encoded, info)
                        }
                        outputEosSeen = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                        codec.releaseOutputBuffer(outIndex, false)
                        idleDrains = 0
                    }
                }
            }
            check(muxerStarted) { "O codificador não produziu a faixa de vídeo WebM" }
        } catch (failure: Throwable) {
            output.delete()
            throw failure
        } finally {
            runCatching { codec?.stop() }
            runCatching { codec?.release() }
            if (muxerStarted) runCatching { muxer?.stop() }
            runCatching { muxer?.release() }
        }
        check(output.exists() && output.length() > 0L) { "O codificador não produziu um arquivo WebM" }
    }

    private fun toYuv420(bitmap: Bitmap, width: Int, height: Int, semiPlanar: Boolean): ByteArray {
        val src = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(src, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        val ySize = width * height
        val out = ByteArray(ySize + ySize / 2)
        var yIndex = 0
        var chromaIndex = ySize
        val uPlane = if (semiPlanar) -1 else ySize
        val vPlane = if (semiPlanar) -1 else ySize + ySize / 4
        for (y in 0 until height) {
            val sy = y.coerceAtMost(bitmap.height - 1)
            for (x in 0 until width) {
                val sx = x.coerceAtMost(bitmap.width - 1)
                val color = src[sy * bitmap.width + sx]
                val r = (color shr 16) and 0xFF
                val g = (color shr 8) and 0xFF
                val b = color and 0xFF
                out[yIndex++] = clampByte(((66 * r + 129 * g + 25 * b + 128) shr 8) + 16)
                if (y % 2 == 0 && x % 2 == 0) {
                    val u = clampByte(((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128)
                    val v = clampByte(((112 * r - 94 * g - 18 * b + 128) shr 8) + 128)
                    if (semiPlanar) {
                        out[chromaIndex++] = u
                        out[chromaIndex++] = v
                    } else {
                        val chromaPos = (y / 2) * (width / 2) + x / 2
                        out[uPlane + chromaPos] = u
                        out[vPlane + chromaPos] = v
                    }
                }
            }
        }
        return out
    }

    private fun clampByte(value: Int): Byte = value.coerceIn(0, 255).toByte()
}
