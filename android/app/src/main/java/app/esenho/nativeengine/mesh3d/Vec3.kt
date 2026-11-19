package app.esenho.nativeengine.mesh3d

import kotlin.math.sqrt

data class Vec3(val x: Float, val y: Float, val z: Float) {
    operator fun plus(other: Vec3) = Vec3(x + other.x, y + other.y, z + other.z)
    operator fun minus(other: Vec3) = Vec3(x - other.x, y - other.y, z - other.z)
    operator fun times(scale: Float) = Vec3(x * scale, y * scale, z * scale)
    operator fun div(scale: Float) = Vec3(x / scale, y / scale, z / scale)
    fun dot(other: Vec3) = x * other.x + y * other.y + z * other.z
    fun cross(other: Vec3) =
        Vec3(
            y * other.z - z * other.y,
            z * other.x - x * other.z,
            x * other.y - y * other.x,
        )
    fun length() = sqrt(dot(this))
    fun normalize(): Vec3 {
        val size = length()
        return if (size < 1e-8f) Vec3(0f, 0f, 0f) else this / size
    }
    fun isFinite() = x.isFinite() && y.isFinite() && z.isFinite()

    companion object {
        val ZERO = Vec3(0f, 0f, 0f)
        val UP = Vec3(0f, 1f, 0f)
    }
}

data class Vec4(val x: Float, val y: Float, val z: Float, val w: Float) {
    fun projected(): Vec3 = Vec3(x / w, y / w, z / w)
}
