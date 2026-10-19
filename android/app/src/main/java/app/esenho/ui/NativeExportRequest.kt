package app.esenho.ui

import android.graphics.Bitmap

/** Shared payload for every native export path. */
data class NativeExportRequest(
    val format: Format,
    val bitmap: Bitmap? = null,
    val frames: List<Bitmap> = emptyList(),
    val fps: Int = 12,
    val loop: Boolean = true
) {
    enum class Format { PNG, JPEG, WEBP, GIF, WEBM }
}
