package app.esenho.nativeengine.mesh3d

import org.json.JSONObject
import java.util.Base64

/** Reads the editable OBJ subset. Unsupported constructs fail before any scene is changed. */
object ObjReader {
    private const val METADATA_PREFIX = "# esenho3d "

    fun read(text: String, fallbackName: String = "Modelo"): Scene3D {
        val lines = text.lineSequence().toList()
        lines.firstOrNull { it.trimStart().startsWith(METADATA_PREFIX) }?.let { line ->
            val encoded = line.trimStart().removePrefix(METADATA_PREFIX).trim()
            val json = String(Base64.getDecoder().decode(encoded), Charsets.UTF_8)
            return Scene3D.read(JSONObject(json))
        }
        val positions = mutableListOf<Vec3>()
        val normals = mutableListOf<Vec3>()
        val uvs = mutableListOf<Pair<Float, Float>>()
        data class RawFace(val tokens: List<String>, val objectName: String, val material: String)
        val faces = mutableListOf<RawFace>()
        var objectName = fallbackName
        var currentMaterial = "default"
        lines.forEachIndexed { index, raw ->
            val line = raw.substringBefore('#').trim()
            if (line.isEmpty()) return@forEachIndexed
            val parts = line.split(Regex("\\s+"))
            when (parts[0]) {
                "v" -> {
                    require(parts.size >= 4) { "OBJ: vértice incompleto na linha ${index + 1}" }
                    val v = Vec3(parts[1].toFloat(), parts[2].toFloat(), parts[3].toFloat())
                    require(v.isFinite()) { "OBJ: vértice inválido na linha ${index + 1}" }
                    positions += v
                }
                "vn" -> {
                    require(parts.size >= 4) { "OBJ: normal incompleta na linha ${index + 1}" }
                    normals += Vec3(parts[1].toFloat(), parts[2].toFloat(), parts[3].toFloat()).normalize()
                }
                "vt" -> {
                    require(parts.size >= 3) { "OBJ: UV incompleta na linha ${index + 1}" }
                    uvs += parts[1].toFloat() to parts[2].toFloat()
                }
                "o", "g" -> if (parts.size > 1) objectName = parts.drop(1).joinToString(" ")
                "usemtl" -> if (parts.size > 1) currentMaterial = parts.drop(1).joinToString(" ")
                "mtllib" -> Unit // Material libraries are carried by metadata; plain files use names.
                "s" -> Unit
                "f" -> {
                    require(parts.size >= 4) { "OBJ: face com menos de três vértices na linha ${index + 1}" }
                    faces += RawFace(parts.drop(1), objectName, currentMaterial)
                }
                "cstype", "deg", "bparam", "surf", "curv", "p" ->
                    error("OBJ: curvas e superfícies não são suportadas (linha ${index + 1})")
                else -> Unit
            }
            require(positions.size <= 200_000 && faces.size <= 400_000) { "OBJ excede o limite de geometria" }
        }
        require(positions.isNotEmpty() && faces.isNotEmpty()) { "OBJ não contém geometria" }
        val scene = Scene3D()
        faces.groupBy { it.objectName }.forEach { (name, group) ->
            val obj =
                Mesh3DObject(
                    java.util.UUID.randomUUID().toString(),
                    positions.toMutableList(),
                    normals.toMutableList(),
                    uvs.toMutableList(),
                    name = name,
                )
            group.forEach { face ->
                val indices = face.tokens.map { token -> parseIndex(token, positions.size, uvs.size, normals.size) }
                val verts = IntArray(indices.size) { indices[it].first }
                val tex = IntArray(indices.size) { indices[it].second }
                val norm = IntArray(indices.size) { indices[it].third }
                val materialName = face.material
                val material =
                    obj.materials.firstOrNull { it.name == materialName }
                        ?: MeshMaterial(name = materialName).also { obj.materials += it }
                val materialIndex = obj.materials.indexOf(material).coerceAtLeast(0)
                for (i in 0 until verts.size - 2) {
                    obj.faces +=
                        MeshFace(
                            intArrayOf(verts[0], verts[i + 1], verts[i + 2]),
                            if (tex.all { it >= 0 }) intArrayOf(tex[0], tex[i + 1], tex[i + 2]) else intArrayOf(),
                            if (norm.all { it >= 0 }) intArrayOf(norm[0], norm[i + 1], norm[i + 2]) else intArrayOf(),
                            materialIndex,
                        )
                }
            }
            scene.objects += obj
        }
        return scene
    }

    private fun parseIndex(token: String, vertexCount: Int, uvCount: Int, normalCount: Int): Triple<Int, Int, Int> {
        val parts = token.split('/')
        fun value(raw: String, count: Int) =
            when {
                raw.isEmpty() -> -1
                raw.startsWith("-") -> count + raw.toInt()
                else -> raw.toInt() - 1
            }
        val v = value(parts.getOrElse(0) { "1" }, vertexCount)
        require(v in 0 until vertexCount) { "OBJ: índice de vértice fora do intervalo" }
        val vt = if (parts.size > 1) value(parts[1], uvCount) else -1
        val vn = if (parts.size > 2) value(parts[2], normalCount) else -1
        return Triple(v, vt, vn)
    }
}

/** Writes a plain OBJ plus an optional metadata comment for lossless reopen. */
object ObjIO {
    fun write(scene: Scene3D, withMetadata: Boolean = true): String =
        buildString {
            append("# Esenho 3D\n")
            if (withMetadata) {
                val json = scene.json().toString().toByteArray(Charsets.UTF_8)
                append("# ${ObjReaderMetadataPrefix}${Base64.getEncoder().encodeToString(json)}\n")
            }
            scene.objects.filter { it.visible }.forEach { obj ->
                append("o ${obj.name.ifBlank { obj.id }}\n")
                obj.materials.forEachIndexed { i, material ->
                    if (i == 0) append("usemtl ${material.name}\n")
                }
                obj.vertices.forEach { append("v ${fmt(it.x)} ${fmt(it.y)} ${fmt(it.z)}\n") }
                obj.normals.forEach { append("vn ${fmt(it.x)} ${fmt(it.y)} ${fmt(it.z)}\n") }
                obj.uvs.forEach { append("vt ${fmt(it.first)} ${fmt(it.second)}\n") }
                obj.faces.forEach { face ->
                    append("f ")
                    append(
                        face.vertices.indices.joinToString(" ") { i ->
                            val v = face.vertices[i] + 1
                            val vt = face.texCoords.getOrNull(i)?.let { it + 1 } ?: 0
                            val vn = face.normals.getOrNull(i)?.let { it + 1 } ?: 0
                            if (vt > 0 && vn > 0) "$v/$vt/$vn" else if (vt > 0) "$v/$vt" else if (vn > 0) "$v//$vn" else "$v"
                        },
                    )
                    append("\n")
                }
            }
        }

    private const val ObjReaderMetadataPrefix = "esenho3d "

    private fun fmt(value: Float) = String.format(java.util.Locale.ROOT, "%.6f", value)
}
