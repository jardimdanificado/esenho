package app.esenho.nativeengine

import android.graphics.Path
import kotlin.math.*
import org.json.JSONObject

enum class VectorBooleanOperation(val label: String, val operation: Path.Op) {
    UNION("Unir", Path.Op.UNION),
    SUBTRACT("Subtrair", Path.Op.DIFFERENCE),
    INTERSECT("Interseção", Path.Op.INTERSECT),
    EXCLUDE("Excluir sobreposição", Path.Op.XOR),
}

/** Platform area operations preserve contour winding. Only the result is flattened, at 0.1 px. */
object VectorBoolean {
    fun eligible(objects: List<VectorObject>) =
        objects.size >= 2 &&
            objects.all { obj ->
                obj.visible && !obj.locked && obj.geometry().all { it.closed && it.nodes.size >= 3 }
            }

    fun combine(objects: List<VectorObject>, operation: VectorBooleanOperation): VectorObject? {
        require(eligible(objects)) {
            "Selecione pelo menos dois objetos fechados e desbloqueados na mesma camada."
        }
        val path = objects.first().path()
        objects.drop(1).forEach {
            check(path.op(it.path(), operation.operation)) {
                "Não foi possível calcular a operação vetorial."
            }
        }
        if (path.isEmpty) return null
        val points = path.approximate(.1f)
        val contours = mutableListOf<VectorContour>()
        var nodes = mutableListOf<VectorNode>()
        fun finish() {
            if (
                nodes.size > 1 &&
                    hypot(nodes.first().x - nodes.last().x, nodes.first().y - nodes.last().y) <
                        .0001f
            )
                nodes.removeAt(nodes.lastIndex)
            if (nodes.size >= 3) contours.add(VectorContour(nodes, true))
            nodes = mutableListOf()
        }
        var fraction = -1f
        for (i in points.indices step 3) {
            val x = points[i + 1]
            val y = points[i + 2]
            require(x.isFinite() && y.isFinite()) { "Resultado vetorial inválido." }
            val last = nodes.lastOrNull()
            if (points[i] == fraction && last != null && (last.x != x || last.y != y)) finish()
            if (nodes.lastOrNull()?.let { it.x == x && it.y == y } != true)
                nodes.add(VectorNode(x, y, 1f))
            if (nodes.size >= 4 && nodes.first().x == x && nodes.first().y == y) finish()
            fraction = points[i]
        }
        finish()
        if (contours.isEmpty()) return null
        val source = objects.first()
        return source.copy(
            id = java.util.UUID.randomUUID().toString(),
            nodes = contours.first().nodes,
            style = JSONObject(source.style.toString()),
            closed = true,
            name = operation.label,
            groupId = null,
            subPaths = contours.drop(1).toMutableList(),
            evenOdd = path.fillType == Path.FillType.EVEN_ODD,
        )
    }
}
