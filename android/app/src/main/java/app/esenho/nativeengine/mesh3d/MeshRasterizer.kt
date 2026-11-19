package app.esenho.nativeengine.mesh3d

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.util.Base64
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

object MeshProfiler {
    var lastFrameMs: Float = 0f
    var triangles: Int = 0
    var shadedPixels: Int = 0
    var culled: Int = 0
}

/** Software triangle rasterizer with z-buffer. Runs on both Android and JVM. */
object MeshRasterizer {
    private data class Projected(
        val x: Float,
        val y: Float,
        val z: Float,
        val normal: Vec3,
        val uv: Pair<Float, Float>?,
        val world: Vec3,
    )

    fun render(scene: Scene3D, width: Int, height: Int, pixels: IntArray, zBuffer: FloatArray) {
        if (width <= 0 || height <= 0) return
        val started = System.nanoTime()
        MeshProfiler.triangles = 0
        MeshProfiler.shadedPixels = 0
        MeshProfiler.culled = 0
        pixels.fill(scene.background)
        zBuffer.fill(Float.POSITIVE_INFINITY)
        val view = scene.camera.view()
        val projection = scene.camera.projection(width.toFloat() / height.toFloat())
        val viewProjection = projection * view
        val textures = mutableMapOf<String, Bitmap?>()
        try {
            scene.objects.filter { it.visible }.forEach { obj ->
                val matrix = obj.transform.matrix()
                val modelViewProjection = viewProjection * matrix
                obj.faces.forEach { face ->
                    val count = face.vertices.size
                    if (count < 3) return@forEach
                    for (i in 1 until count - 1) {
                        val indices = intArrayOf(0, i, i + 1)
                        val projected =
                            indices.map { k ->
                                val index = face.vertices[k]
                                val world = obj.vertices.getOrNull(index) ?: return@map null
                                val clip = modelViewProjection.transform(world)
                                if (clip.w <= 1e-5f) return@map null
                                val ndc = clip.projected()
                                val normal =
                                    face.normals.getOrNull(k)?.let { obj.normals.getOrNull(it) }
                                        ?.let { matrix.transformDirection(it).normalize() }
                                        ?: faceNormal(obj, face)
                                val uv =
                                    face.texCoords.getOrNull(k)?.let { obj.uvs.getOrNull(it) }
                                Projected(
                                    (ndc.x * .5f + .5f) * width,
                                    (1f - (ndc.y * .5f + .5f)) * height,
                                    ndc.z,
                                    normal,
                                    uv,
                                    world,
                                )
                            }
                        if (projected.any { it == null }) return@forEach
                        val a = projected[0]!!
                        val b = projected[1]!!
                        val c = projected[2]!!
                        val area = edge(a.x, a.y, b.x, b.y, c.x, c.y)
                        if (abs(area) < .0001f) return@forEach
                        MeshProfiler.triangles++
                        if (scene.cullBackfaces && area > 0f) {
                            MeshProfiler.culled++
                            return@forEach
                        }
                        rasterize(
                            a, b, c, area, scene, obj, face, width, height, pixels, zBuffer, textures,
                        )
                        if (scene.wireframe) {
                            drawLine(a, b, width, height, pixels, zBuffer, 0xffffffff.toInt())
                            drawLine(b, c, width, height, pixels, zBuffer, 0xffffffff.toInt())
                            drawLine(c, a, width, height, pixels, zBuffer, 0xffffffff.toInt())
                        }
                    }
                }
            }
        } finally {
            textures.values.forEach { it?.recycle() }
            MeshProfiler.lastFrameMs = (System.nanoTime() - started) / 1_000_000f
        }
    }

    private fun faceNormal(obj: Mesh3DObject, face: MeshFace): Vec3 {
        if (face.vertices.size < 3) return Vec3.UP
        val a = obj.vertices.getOrNull(face.vertices[0]) ?: return Vec3.UP
        val b = obj.vertices.getOrNull(face.vertices[1]) ?: return Vec3.UP
        val c = obj.vertices.getOrNull(face.vertices[2]) ?: return Vec3.UP
        return (b - a).cross(c - a).normalize()
    }

    private fun edge(x0: Float, y0: Float, x1: Float, y1: Float, x: Float, y: Float) =
        (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)

    private fun rasterize(
        a: Projected,
        b: Projected,
        c: Projected,
        area: Float,
        scene: Scene3D,
        obj: Mesh3DObject,
        face: MeshFace,
        width: Int,
        height: Int,
        pixels: IntArray,
        zBuffer: FloatArray,
        textures: MutableMap<String, Bitmap?>,
    ) {
        val minX = max(0, floor(minOf(a.x, b.x, c.x)).toInt())
        val maxX = min(width - 1, ceil(maxOf(a.x, b.x, c.x)).toInt())
        val minY = max(0, floor(minOf(a.y, b.y, c.y)).toInt())
        val maxY = min(height - 1, ceil(maxOf(a.y, b.y, c.y)).toInt())
        if (minX > maxX || minY > maxY) return
        val material = obj.materials.getOrNull(face.material) ?: obj.materials.firstOrNull() ?: MeshMaterial()
        val texture =
            material.texture?.let { data ->
                textures.getOrPut(data) {
                    try {
                        val bytes = Base64.getDecoder().decode(data)
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    } catch (_: Exception) {
                        null
                    }
                }
            }
        for (y in minY..maxY) {
            for (x in minX..maxX) {
                val px = x + .5f
                val py = y + .5f
                val wa = edge(b.x, b.y, c.x, c.y, px, py) / area
                val wb = edge(c.x, c.y, a.x, a.y, px, py) / area
                val wc = 1f - wa - wb
                if (wa < 0f || wb < 0f || wc < 0f) continue
                val z = wa * a.z + wb * b.z + wc * c.z
                val index = y * width + x
                if (z >= zBuffer[index]) continue
                zBuffer[index] = z
                MeshProfiler.shadedPixels++
                pixels[index] = shade(wa, wb, wc, a, b, c, scene, material, texture, obj.smooth)
            }
        }
    }

    private fun shade(
        wa: Float,
        wb: Float,
        wc: Float,
        a: Projected,
        b: Projected,
        c: Projected,
        scene: Scene3D,
        material: MeshMaterial,
        texture: Bitmap?,
        smooth: Boolean,
    ): Int {
        val normal =
            if (smooth) (a.normal * wa + b.normal * wb + c.normal * wc).normalize()
            else a.normal.normalize()
        var red = 0f
        var green = 0f
        var blue = 0f
        val diffuse = material.diffuse
        val baseRed = (diffuse shr 16 and 0xff) / 255f
        val baseGreen = (diffuse shr 8 and 0xff) / 255f
        val baseBlue = (diffuse and 0xff) / 255f
        var intensity = scene.ambient
        var specular = 0f
        val viewDirection = (scene.camera.position - a.world).normalize()
        scene.lights.forEach { light ->
            val towardLight = light.direction.normalize() * -1f
            intensity += max(0f, normal.dot(towardLight)) * light.intensity
            val half = (towardLight + viewDirection).normalize()
            specular += max(0f, normal.dot(half)).pow(material.shininess) * light.intensity * .35f
        }
        red = (baseRed * intensity + specular) * 255f
        green = (baseGreen * intensity + specular) * 255f
        blue = (baseBlue * intensity + specular) * 255f
        if (texture != null) {
            val uvA = a.uv
            val uvB = b.uv
            val uvC = c.uv
            if (uvA != null && uvB != null && uvC != null) {
                val u = (uvA.first * wa + uvB.first * wb + uvC.first * wc).mod(1f)
                val v = (uvA.second * wa + uvB.second * wb + uvC.second * wc).mod(1f)
                val tx = min(texture.width - 1, max(0, (u * texture.width).toInt()))
                val ty = min(texture.height - 1, max(0, ((1f - v) * texture.height).toInt()))
                val color = texture.getPixel(tx, ty)
                red *= (color shr 16 and 0xff) / 255f
                green *= (color shr 8 and 0xff) / 255f
                blue *= (color and 0xff) / 255f
            }
        }
        fun byte(value: Float) = value.toInt().coerceIn(0, 255)
        val alpha = (material.opacity * 255).toInt().coerceIn(0, 255)
        return (alpha shl 24) or (byte(red) shl 16) or (byte(green) shl 8) or byte(blue)
    }

    private fun drawLine(
        a: Projected,
        b: Projected,
        width: Int,
        height: Int,
        pixels: IntArray,
        zBuffer: FloatArray,
        color: Int,
    ) {
        val steps = max(abs(b.x - a.x), abs(b.y - a.y)).toInt() + 1
        repeat(steps + 1) { i ->
            val t = i.toFloat() / steps
            val x = (a.x + (b.x - a.x) * t).toInt()
            val y = (a.y + (b.y - a.y) * t).toInt()
            if (x !in 0 until width || y !in 0 until height) return@repeat
            val z = a.z + (b.z - a.z) * t
            val index = y * width + x
            if (z <= zBuffer[index]) pixels[index] = color
        }
    }

    private fun Float.mod(divisor: Float): Float {
        val result = this % divisor
        return if (result < 0) result + divisor else result
    }
}
