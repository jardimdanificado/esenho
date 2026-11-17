package app.esenho.ui

import app.esenho.desktop.graphics.Bitmap
import java.io.File
import javax.imageio.ImageIO

/** Desktop video encoding uses FFmpeg instead of Android MediaCodec. */
object WebmWriter {
    fun write(frames: List<Bitmap>, fps: Int, file: File) {
        require(frames.isNotEmpty() && fps > 0)
        val process =
            ProcessBuilder(
                    "ffmpeg",
                    "-v",
                    "error",
                    "-y",
                    "-f",
                    "image2pipe",
                    "-framerate",
                    fps.toString(),
                    "-i",
                    "pipe:0",
                    "-c:v",
                    "libvpx-vp9",
                    "-pix_fmt",
                    "yuva420p",
                    file.absolutePath,
                )
                .redirectError(ProcessBuilder.Redirect.INHERIT)
                .redirectOutput(ProcessBuilder.Redirect.INHERIT)
                .start()
        try {
            process.outputStream.use { out ->
                frames.forEach { ImageIO.write(it.toImage(), "png", out) }
            }
            check(process.waitFor() == 0) { "FFmpeg não conseguiu exportar WebM" }
        } finally {
            if (process.isAlive) process.destroyForcibly()
        }
    }
}
