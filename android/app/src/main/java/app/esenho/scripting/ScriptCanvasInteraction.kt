package app.esenho.scripting

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.view.MotionEvent
import app.esenho.ui.EsenhoCanvasView
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.*

/** Touch references and overlays. All access belongs to the Android UI thread. */
class ScriptCanvasInteraction(private val view: EsenhoCanvasView) {
    var running = false
    val pivots = linkedMapOf<String, JSONObject>()
    private var request: JSONObject? = null
    private var completion: ((JSONObject) -> Unit)? = null
    private var start: Pair<Float, Float>? = null
    private var end: Pair<Float, Float>? = null
    private var nextPivotId = 1
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(255, 209, 102)
        strokeWidth = 2.5f
        textSize = 13f * view.resources.displayMetrics.scaledDensity
    }

    fun inverseView(): Matrix = Matrix().also {
        check(view.transformMatrix.invert(it)) { "Visualização não invertível" }
    }

    fun affine(matrix: Matrix): JSONArray {
        val v = FloatArray(9)
        matrix.getValues(v)
        return JSONArray(listOf(v[0], v[3], v[1], v[4], v[2], v[5]))
    }

    fun resolve(space: JSONObject): Matrix {
        val values = space.getJSONArray("matrix")
        require(values.length() == 6) { "Referência precisa de seis componentes" }
        val a = FloatArray(6) { index ->
            values.getDouble(index).toFloat().also { require(it.isFinite()) { "Referência inválida" } }
        }
        val local = Matrix().apply { setValues(floatArrayOf(a[0], a[2], a[4], a[1], a[3], a[5], 0f, 0f, 1f)) }
        return when (space.getString("kind")) {
            "document" -> local
            "screen" -> Matrix().apply { setConcat(inverseView(), local) }
            else -> error("Espaço de coordenadas desconhecido")
        }
    }

    fun reference(matrix: Matrix, kind: String = "document", name: String? = null) =
        JSONObject().put("kind", kind).put("matrix", affine(matrix)).apply {
            if (name != null) put("name", name)
        }

    fun update(options: JSONObject, create: Boolean = false): JSONObject {
        val oldName = options.getString("name")
        val old = pivots[oldName]
        require(create || old != null) { "Pivot inexistente" }
        require(!create || old == null) { "Nome de pivot já usado" }
        require(old != null || pivots.size < 128) { "Máximo de 128 pivots" }
        val name = options.optString("newName", oldName).trim()
        require(name.isNotEmpty() && name.length <= 100 && (name == oldName || name !in pivots)) { "Nome de pivot inválido ou já usado" }
        val kind = options.optString("anchor", old?.optString("kind") ?: "document")
        require(kind in listOf("document", "screen"))
        val matrix = if (old == null) Matrix() else {
            val doc = resolve(old)
            if (kind == "screen") Matrix().apply { setConcat(view.transformMatrix, doc) } else doc
        }
        val values = FloatArray(9).also { matrix.getValues(it) }
        if (options.has("rotation")) {
            val angle = options.getDouble("rotation"); require(angle.isFinite())
            val scale = hypot(values[0], values[3]).coerceAtLeast(0.0001f)
            matrix.setRotate(angle.toFloat()); matrix.postScale(scale, scale)
            val next = FloatArray(9).also { matrix.getValues(it) }; next[2] = values[2]; next[5] = values[5]; matrix.setValues(next)
        }
        matrix.getValues(values)
        if (options.has("x")) values[2] = options.getDouble("x").toFloat()
        if (options.has("y")) values[5] = options.getDouble("y").toFloat()
        require(values.all { it.isFinite() })
        matrix.setValues(values)
        val result = reference(matrix, kind, name)
        pivots.remove(oldName); pivots[name] = result
        view.invalidate()
        return result
    }

    fun pick(options: JSONObject, onPicked: (JSONObject) -> Unit) {
        check(completion == null) { "Já existe uma marcação pendente" }
        request = options
        completion = onPicked
        start = null
        end = null
        view.invalidate()
    }

    fun cancelPick() {
        request = null
        completion = null
        start = null
        end = null
        view.invalidate()
    }

    fun onTouch(event: MotionEvent): Boolean {
        val options = request ?: return running
        if (event.pointerCount > 1 || event.actionMasked == MotionEvent.ACTION_CANCEL) {
            start = null
            end = null
            view.invalidate()
            return true
        }
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                start = event.x to event.y
                end = start
            }
            MotionEvent.ACTION_MOVE -> end = event.x to event.y
            MotionEvent.ACTION_UP -> {
                val origin = start ?: return true
                val screenLocked = options.optString("anchor", "document") == "screen"
                val point = floatArrayOf(origin.first, origin.second)
                inverseView().mapPoints(point)
                if (options.optBoolean("pointOnly")) {
                    finish(JSONObject().put("x", point[0]).put("y", point[1]))
                    return true
                }
                val direction = floatArrayOf(event.x - origin.first, event.y - origin.second)
                if (hypot(direction[0], direction[1]) < 12f * view.resources.displayMetrics.density) {
                    direction[0] = 1f
                    direction[1] = 0f
                }
                if (!screenLocked) inverseView().mapVectors(direction)
                val angle = Math.toDegrees(atan2(direction[1].toDouble(), direction[0].toDouble())).toFloat()
                val matrix = Matrix().apply {
                    setRotate(angle)
                    postTranslate(if (screenLocked) origin.first else point[0], if (screenLocked) origin.second else point[1])
                }
                while (pivots.containsKey("pivot$nextPivotId")) nextPivotId++
                val name = options.optString("name").ifBlank { "pivot${nextPivotId++}" }.take(100)
                val pivot = reference(matrix, if (screenLocked) "screen" else "document", name)
                pivots[name] = pivot
                finish(pivot)
                return true
            }
        }
        view.invalidate()
        return true
    }

    private fun finish(value: JSONObject) {
        val callback = completion
        cancelPick()
        callback?.invoke(value)
    }

    fun draw(canvas: Canvas) {
        pivots.forEach { (name, pivot) ->
            val matrix = resolve(pivot)
            val points = floatArrayOf(0f, 0f, 30f, 0f)
            matrix.mapPoints(points)
            view.transformMatrix.mapPoints(points)
            val x = points[0]; val y = points[1]
            val dx = points[2] - x; val dy = points[3] - y
            val length = hypot(dx, dy).coerceAtLeast(0.001f)
            paint.style = Paint.Style.STROKE
            canvas.drawCircle(x, y, 9f, paint)
            canvas.drawLine(x - 14f, y, x + 14f, y, paint)
            canvas.drawLine(x, y - 14f, x, y + 14f, paint)
            canvas.drawLine(x, y, x + dx / length * 38f, y + dy / length * 38f, paint)
            paint.style = Paint.Style.FILL
            canvas.drawText(name, x + 13f, y - 13f, paint)
        }
        val a = start
        val b = end
        if (a != null && b != null) {
            canvas.drawLine(a.first, a.second, b.first, b.second, paint)
            paint.style = Paint.Style.STROKE
            canvas.drawCircle(a.first, a.second, 10f, paint)
            paint.style = Paint.Style.FILL
        }
    }
}
