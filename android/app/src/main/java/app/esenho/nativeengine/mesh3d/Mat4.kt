package app.esenho.nativeengine.mesh3d

import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.tan

/** Column-major 4x4 matrix, OpenGL convention. */
class Mat4(private val values: FloatArray = identityValues()) {
    companion object {
        private fun identityValues() =
            floatArrayOf(
                1f, 0f, 0f, 0f,
                0f, 1f, 0f, 0f,
                0f, 0f, 1f, 0f,
                0f, 0f, 0f, 1f,
            )

        fun identity() = Mat4()
        fun translation(x: Float, y: Float, z: Float) =
            Mat4(
                floatArrayOf(
                    1f, 0f, 0f, 0f,
                    0f, 1f, 0f, 0f,
                    0f, 0f, 1f, 0f,
                    x, y, z, 1f,
                )
            )

        fun scaling(x: Float, y: Float, z: Float) =
            Mat4(
                floatArrayOf(
                    x, 0f, 0f, 0f,
                    0f, y, 0f, 0f,
                    0f, 0f, z, 0f,
                    0f, 0f, 0f, 1f,
                )
            )

        fun rotationX(degrees: Float): Mat4 {
            val c = cos(degrees * Math.PI.toFloat() / 180f)
            val s = sin(degrees * Math.PI.toFloat() / 180f)
            return Mat4(
                floatArrayOf(
                    1f, 0f, 0f, 0f,
                    0f, c, s, 0f,
                    0f, -s, c, 0f,
                    0f, 0f, 0f, 1f,
                )
            )
        }

        fun rotationY(degrees: Float): Mat4 {
            val c = cos(degrees * Math.PI.toFloat() / 180f)
            val s = sin(degrees * Math.PI.toFloat() / 180f)
            return Mat4(
                floatArrayOf(
                    c, 0f, -s, 0f,
                    0f, 1f, 0f, 0f,
                    s, 0f, c, 0f,
                    0f, 0f, 0f, 1f,
                )
            )
        }

        fun rotationZ(degrees: Float): Mat4 {
            val c = cos(degrees * Math.PI.toFloat() / 180f)
            val s = sin(degrees * Math.PI.toFloat() / 180f)
            return Mat4(
                floatArrayOf(
                    c, s, 0f, 0f,
                    -s, c, 0f, 0f,
                    0f, 0f, 1f, 0f,
                    0f, 0f, 0f, 1f,
                )
            )
        }

        fun lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
            val z = (eye - target).normalize()
            val x = up.cross(z).normalize()
            val y = z.cross(x)
            return Mat4(
                floatArrayOf(
                    x.x, y.x, z.x, 0f,
                    x.y, y.y, z.y, 0f,
                    x.z, y.z, z.z, 0f,
                    -x.dot(eye), -y.dot(eye), -z.dot(eye), 1f,
                )
            )
        }

        fun perspective(fovDegrees: Float, aspect: Float, near: Float, far: Float): Mat4 {
            val f = 1f / tan(fovDegrees * Math.PI.toFloat() / 360f)
            val range = 1f / (near - far)
            return Mat4(
                floatArrayOf(
                    f / aspect, 0f, 0f, 0f,
                    0f, f, 0f, 0f,
                    0f, 0f, (far + near) * range, -1f,
                    0f, 0f, 2f * far * near * range, 0f,
                )
            )
        }

        fun orthographic(size: Float, aspect: Float, near: Float, far: Float): Mat4 {
            val halfHeight = size / 2
            val halfWidth = halfHeight * aspect
            return Mat4(
                floatArrayOf(
                    1f / halfWidth, 0f, 0f, 0f,
                    0f, 1f / halfHeight, 0f, 0f,
                    0f, 0f, -2f / (far - near), 0f,
                    0f, 0f, -(far + near) / (far - near), 1f,
                )
            )
        }
    }

    operator fun times(other: Mat4): Mat4 {
        val out = FloatArray(16)
        for (column in 0 until 4) {
            for (row in 0 until 4) {
                out[column * 4 + row] =
                    values[row] * other.values[column * 4] +
                        values[4 + row] * other.values[column * 4 + 1] +
                        values[8 + row] * other.values[column * 4 + 2] +
                        values[12 + row] * other.values[column * 4 + 3]
            }
        }
        return Mat4(out)
    }

    fun transform(point: Vec3) =
        Vec4(
            values[0] * point.x + values[4] * point.y + values[8] * point.z + values[12],
            values[1] * point.x + values[5] * point.y + values[9] * point.z + values[13],
            values[2] * point.x + values[6] * point.y + values[10] * point.z + values[14],
            values[3] * point.x + values[7] * point.y + values[11] * point.z + values[15],
        )

    fun transformDirection(vector: Vec3) =
        Vec3(
            values[0] * vector.x + values[4] * vector.y + values[8] * vector.z,
            values[1] * vector.x + values[5] * vector.y + values[9] * vector.z,
            values[2] * vector.x + values[6] * vector.y + values[10] * vector.z,
        )
}
