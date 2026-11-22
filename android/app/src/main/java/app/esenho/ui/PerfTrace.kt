package app.esenho.ui

import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.FrameMetrics
import android.view.Window
import java.util.Locale

/**
 * Lightweight, allocation-free frame/input timing collector.
 *
 * It stays dormant unless the log tag is enabled:
 * `adb shell setprop log.tag.EsenhoPerf DEBUG`
 * and prints one line per second while drawing.
 *
 * `draw`/`render` come from the UI thread. `frame` reports what the render
 * thread spent the same frames on, which is where bitmap texture uploads show
 * up when the UI thread looks cheap but the stroke still stutters.
 */
object PerfTrace {
    private const val TAG = "EsenhoPerf"
    private val enabled = Log.isLoggable(TAG, Log.DEBUG)

    private var windowStartNs = 0L
    private var draws = 0
    private var drawNs = 0L
    private var renderNs = 0L
    private var uploadNs = 0L
    private var touches = 0
    private var touchNs = 0L
    private var lastTouchNs = 0L
    private var gapNs = 0L

    private var frames = 0
    private var totalFrameNs = 0L
    private var drawFrameNs = 0L
    private var syncFrameNs = 0L
    private var issueFrameNs = 0L
    private var swapFrameNs = 0L
    private var jankyFrames = 0

    fun attach(window: Window) {
        if (!enabled) return
        val handler = Handler(Looper.getMainLooper())
        window.addOnFrameMetricsAvailableListener({ _, metrics, _ ->
            frames++
            val total = metrics.getMetric(FrameMetrics.TOTAL_DURATION)
            totalFrameNs += total
            drawFrameNs += metrics.getMetric(FrameMetrics.DRAW_DURATION)
            syncFrameNs += metrics.getMetric(FrameMetrics.SYNC_DURATION)
            issueFrameNs += metrics.getMetric(FrameMetrics.COMMAND_ISSUE_DURATION)
            swapFrameNs += metrics.getMetric(FrameMetrics.SWAP_BUFFERS_DURATION)
            if (total > 16_666_666L) jankyFrames++
        }, handler)
    }

    fun draw(totalNs: Long, nativeRenderNs: Long, bitmapUploadNs: Long) {
        if (!enabled) return
        draws++
        drawNs += totalNs
        renderNs += nativeRenderNs
        uploadNs += bitmapUploadNs
        flushIfDue()
    }

    fun touch(ns: Long) {
        if (!enabled) return
        touches++
        touchNs += ns
        if (lastTouchNs != 0L) gapNs += System.nanoTime() - lastTouchNs
        lastTouchNs = System.nanoTime()
    }

    private fun flushIfDue() {
        val now = System.nanoTime()
        if (windowStartNs == 0L) {
            windowStartNs = now
            return
        }
        val elapsed = now - windowStartNs
        if (elapsed < 1_000_000_000L) return
        val per = 1_000_000f
        val seconds = elapsed / 1_000_000_000f
        Log.d(
            TAG,
            String.format(
                Locale.ROOT,
                "fps=%d draws=%d draw=%.2fms render=%.2fms upload=%.2fms " +
                    "touch=%d touchAvg=%.2fms gapAvg=%.2fms | " +
                    "frames=%d janky=%d total=%.2fms drawThr=%.2fms sync=%.2fms " +
                    "issue=%.2fms swap=%.2fms",
                (draws / seconds).toInt(),
                draws,
                if (draws > 0) drawNs / per / draws else 0f,
                if (draws > 0) renderNs / per / draws else 0f,
                if (draws > 0) uploadNs / per / draws else 0f,
                touches,
                if (touches > 0) touchNs / per / touches else 0f,
                if (touches > 1) gapNs / per / (touches - 1) else 0f,
                frames,
                jankyFrames,
                if (frames > 0) totalFrameNs / per / frames else 0f,
                if (frames > 0) drawFrameNs / per / frames else 0f,
                if (frames > 0) syncFrameNs / per / frames else 0f,
                if (frames > 0) issueFrameNs / per / frames else 0f,
                if (frames > 0) swapFrameNs / per / frames else 0f,
            ),
        )
        windowStartNs = now
        draws = 0
        drawNs = 0
        renderNs = 0
        uploadNs = 0
        touches = 0
        touchNs = 0
        gapNs = 0
        lastTouchNs = 0L
        frames = 0
        totalFrameNs = 0
        drawFrameNs = 0
        syncFrameNs = 0
        issueFrameNs = 0
        swapFrameNs = 0
        jankyFrames = 0
    }
}
