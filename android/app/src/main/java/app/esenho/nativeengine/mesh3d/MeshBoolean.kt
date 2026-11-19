package app.esenho.nativeengine.mesh3d

import java.util.UUID
import kotlin.math.abs

enum class MeshBooleanOp { UNION, SUBTRACT, INTERSECT }

/** Triangle-plane CSG. Works on closed meshes; fragments are classified by ray parity. */
object MeshBoolean {
    private data class Triangle(
        val a: Vec3,
        val b: Vec3,
        val c: Vec3,
        val material: Int,
        val normal: Vec3 = (b - a).cross(c - a).normalize(),
    )

    fun combine(first: Mesh3DObject, second: Mesh3DObject, operation: MeshBooleanOp): Mesh3DObject? {
        val left = worldTriangles(first)
        val right = worldTriangles(second)
        if (left.isEmpty() || right.isEmpty()) return null
        val leftFragments = splitAgainst(left, right)
        val rightFragments = splitAgainst(right, left)
        val kept = mutableListOf<Triangle>()
        leftFragments.forEach { triangle ->
            val inside = isInside(centroid(triangle), right)
            val keep =
                when (operation) {
                    MeshBooleanOp.UNION -> !inside
                    MeshBooleanOp.SUBTRACT -> !inside
                    MeshBooleanOp.INTERSECT -> inside
                }
            if (keep) kept += triangle
        }
        rightFragments.forEach { triangle ->
            val inside = isInside(centroid(triangle), left)
            val keep =
                when (operation) {
                    MeshBooleanOp.UNION -> !inside
                    MeshBooleanOp.SUBTRACT -> inside
                    MeshBooleanOp.INTERSECT -> inside
                }
            if (keep) {
                kept +=
                    if (operation == MeshBooleanOp.SUBTRACT)
                        Triangle(triangle.c, triangle.b, triangle.a, triangle.material)
                    else triangle
            }
        }
        if (kept.isEmpty()) return null
        val vertices = mutableListOf<Vec3>()
        val normals = mutableListOf<Vec3>()
        val faces = mutableListOf<MeshFace>()
        kept.forEach { triangle ->
            val base = vertices.size
            vertices += triangle.a
            vertices += triangle.b
            vertices += triangle.c
            normals += triangle.normal
            normals += triangle.normal
            normals += triangle.normal
            faces += MeshFace(intArrayOf(base, base + 1, base + 2), intArrayOf(), intArrayOf(base, base + 1, base + 2))
        }
        return Mesh3DObject(
            UUID.randomUUID().toString(),
            vertices,
            normals,
            faces = faces,
            name = "Booleana",
            transform = MeshTransform(),
        )
    }

    private fun worldTriangles(obj: Mesh3DObject): List<Triangle> {
        val matrix = obj.transform.matrix()
        val result = mutableListOf<Triangle>()
        obj.faces.forEach { face ->
            for (i in 1 until face.vertices.size - 1) {
                val a = matrix.transform(obj.vertices.getOrNull(face.vertices[0]) ?: return@forEach).projected()
                val b = matrix.transform(obj.vertices.getOrNull(face.vertices[i]) ?: return@forEach).projected()
                val c = matrix.transform(obj.vertices.getOrNull(face.vertices[i + 1]) ?: return@forEach).projected()
                result += Triangle(a, b, c, face.material)
            }
        }
        return result
    }

    private fun centroid(triangle: Triangle) =
        Vec3(
            (triangle.a.x + triangle.b.x + triangle.c.x) / 3,
            (triangle.a.y + triangle.b.y + triangle.c.y) / 3,
            (triangle.a.z + triangle.b.z + triangle.c.z) / 3,
        )

    private fun splitAgainst(source: List<Triangle>, planes: List<Triangle>): List<Triangle> {
        var fragments = source
        planes.forEach { plane ->
            val next = mutableListOf<Triangle>()
            fragments.forEach { triangle ->
                val positive = clip(triangle.polygon(), plane.a, plane.normal, true)
                val negative = clip(triangle.polygon(), plane.a, plane.normal, false)
                triangulate(positive, triangle.material)?.let { next += it }
                triangulate(negative, triangle.material)?.let { next += it }
            }
            fragments = next
            if (fragments.size > 6000) return@forEach
        }
        return fragments
    }

    private fun Triangle.polygon() = listOf(a, b, c)

    private fun clip(polygon: List<Vec3>, planePoint: Vec3, normal: Vec3, keepPositive: Boolean): List<Vec3> {
        if (polygon.isEmpty()) return emptyList()
        val result = mutableListOf<Vec3>()
        fun value(point: Vec3) = (point - planePoint).dot(normal) * if (keepPositive) 1f else -1f
        var previous = polygon.last()
        var previousValue = value(previous)
        polygon.forEach { current ->
            val currentValue = value(current)
            val previousInside = previousValue >= 0f
            val currentInside = currentValue >= 0f
            if (currentInside != previousInside) {
                val denominator = previousValue - currentValue
                if (abs(denominator) > 1e-9f) {
                    val t = previousValue / denominator
                    result += previous + (current - previous) * t
                }
            }
            if (currentInside) result += current
            previous = current
            previousValue = currentValue
        }
        return result
    }

    private fun triangulate(polygon: List<Vec3>, material: Int): List<Triangle>? {
        if (polygon.size < 3) return null
        val result = mutableListOf<Triangle>()
        for (i in 1 until polygon.size - 1) result += Triangle(polygon[0], polygon[i], polygon[i + 1], material)
        return result
    }

    private fun isInside(point: Vec3, triangles: List<Triangle>): Boolean {
        val direction = Vec3(.577f, .577f, .577f)
        var hits = 0
        triangles.forEach { triangle ->
            val edge1 = triangle.b - triangle.a
            val edge2 = triangle.c - triangle.a
            val p = direction.cross(edge2)
            val determinant = edge1.dot(p)
            if (abs(determinant) < 1e-8f) return@forEach
            val inverse = 1f / determinant
            val offset = point - triangle.a
            val u = offset.dot(p) * inverse
            if (u < 0f || u > 1f) return@forEach
            val q = offset.cross(edge1)
            val v = direction.dot(q) * inverse
            if (v < 0f || u + v > 1f) return@forEach
            val distance = edge2.dot(q) * inverse
            if (distance > 0f) hits++
        }
        return hits % 2 == 1
    }
}
