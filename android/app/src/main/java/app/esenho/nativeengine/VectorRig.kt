package app.esenho.nativeengine

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

data class VectorBone(
    val id: String,
    var name: String = "Osso",
    var parentId: String? = null,
    var attachTo: String = "tip",
    var length: Float = 80f,
    var localAngle: Float = 0f,
    var localX: Float = 0f,
    var localY: Float = 0f,
    var worldX0: Float = 0f,
    var worldY0: Float = 0f,
    var worldX1: Float = 0f,
    var worldY1: Float = 0f,
    var worldAngle: Float = 0f,
    var constraint: String = "none",
    var aimX: Float = 0f,
    var aimY: Float = 0f,
    var physicsMode: String = "kinematic",
    var damping: Float = .98f,
    var gravity: Float = 900f,
    var mass: Float = 1f,
    var minAngle: Float = -180f,
    var maxAngle: Float = 180f,
    var stiffness: Float = .5f,
    var restAngle: Float = 0f,
    var angularVelocity: Float = 0f,
) {
    fun json() =
        JSONObject()
            .put("id", id)
            .put("name", name)
            .put("parentId", parentId)
            .put("attachTo", attachTo)
            .put("length", length.toDouble())
            .put("localAngle", localAngle.toDouble())
            .put("localX", localX.toDouble())
            .put("localY", localY.toDouble())
            .put("constraint", constraint)
            .put("aimX", aimX.toDouble())
            .put("aimY", aimY.toDouble())
            .put("physicsMode", physicsMode)
            .put("damping", damping.toDouble())
            .put("gravity", gravity.toDouble())
            .put("mass", mass.toDouble())
            .put("minAngle", minAngle.toDouble())
            .put("maxAngle", maxAngle.toDouble())
            .put("stiffness", stiffness.toDouble())
            .put("restAngle", restAngle.toDouble())

    companion object {
        fun read(j: JSONObject) =
            VectorBone(
                j.optString("id"),
                j.optString("name", "Osso"),
                if (j.isNull("parentId")) null else j.optString("parentId").takeIf { it.isNotEmpty() },
                j.optString("attachTo", "tip"),
                j.optDouble("length", 80.0).toFloat(),
                j.optDouble("localAngle", 0.0).toFloat(),
                j.optDouble("localX", 0.0).toFloat(),
                j.optDouble("localY", 0.0).toFloat(),
                constraint = j.optString("constraint", "none"),
                aimX = j.optDouble("aimX", 0.0).toFloat(),
                aimY = j.optDouble("aimY", 0.0).toFloat(),
                physicsMode = j.optString("physicsMode", "kinematic"),
                damping = j.optDouble("damping", .98).toFloat(),
                gravity = j.optDouble("gravity", 900.0).toFloat(),
                mass = j.optDouble("mass", 1.0).toFloat(),
                minAngle = j.optDouble("minAngle", -180.0).toFloat(),
                maxAngle = j.optDouble("maxAngle", 180.0).toFloat(),
                stiffness = j.optDouble("stiffness", .5).toFloat(),
                restAngle = j.optDouble("restAngle", 0.0).toFloat(),
            )
    }
}

data class VectorSkinBinding(
    val targetId: String,
    var boneId: String,
    var type: String = "cutout",
    var offsetX: Float = 0f,
    var offsetY: Float = 0f,
    var offsetAngle: Float = 0f,
    var localNodes: MutableList<VectorNode> = mutableListOf(),
    var weights: MutableMap<String, Float> = mutableMapOf(),
) {
    fun json() =
        JSONObject()
            .put("targetId", targetId)
            .put("boneId", boneId)
            .put("type", type)
            .put("offsetX", offsetX.toDouble())
            .put("offsetY", offsetY.toDouble())
            .put("offsetAngle", offsetAngle.toDouble())
            .put(
                "localNodes",
                JSONArray().also { a -> localNodes.forEach { a.put(it.json()) } },
            )
            .put("weights", JSONObject().also { j -> weights.forEach { (k, v) -> j.put(k, v) } })

    companion object {
        fun read(j: JSONObject) =
            VectorSkinBinding(
                j.optString("targetId"),
                j.optString("boneId"),
                j.optString("type", "cutout"),
                j.optDouble("offsetX", 0.0).toFloat(),
                j.optDouble("offsetY", 0.0).toFloat(),
                j.optDouble("offsetAngle", 0.0).toFloat(),
                mutableListOf<VectorNode>().also { nodes ->
                    val a = j.optJSONArray("localNodes") ?: JSONArray()
                    repeat(a.length()) { i -> nodes += VectorObject.readNode(a.getJSONArray(i)) }
                },
                mutableMapOf<String, Float>().also { map ->
                    val w = j.optJSONObject("weights") ?: JSONObject()
                    w.keys().forEach { key -> map[key] = w.optDouble(key).toFloat() }
                },
            )
    }
}

/** One editable skeleton; geometry is deformed at render time, never mutated. */
class VectorSkeleton(var name: String = "Rig") {
    var rootX: Float = 0f
    var rootY: Float = 0f
    var rotation: Float = 0f
    val bones = mutableListOf<VectorBone>()
    val bindings = mutableListOf<VectorSkinBinding>()

    fun bone(id: String) = bones.firstOrNull { it.id == id }

    fun updateFk() {
        bones.forEach { bone ->
            val parent = bone.parentId?.let(::bone)
            val baseX: Float
            val baseY: Float
            if (parent == null) {
                baseX = rootX + bone.localX
                baseY = rootY + bone.localY
                bone.worldAngle = rotation + bone.localAngle
            } else {
                updateBone(parent)
                if (bone.attachTo == "base") {
                    baseX = parent.worldX0 + bone.localX
                    baseY = parent.worldY0 + bone.localY
                } else {
                    baseX = parent.worldX1 + bone.localX
                    baseY = parent.worldY1 + bone.localY
                }
                bone.worldAngle = parent.worldAngle + bone.localAngle
            }
            bone.worldX0 = baseX
            bone.worldY0 = baseY
            applyAim(bone)
            bone.worldX1 = baseX + cos(bone.worldAngle * Math.PI.toFloat() / 180f) * bone.length
            bone.worldY1 = baseY + sin(bone.worldAngle * Math.PI.toFloat() / 180f) * bone.length
        }
    }

    private fun updateBone(bone: VectorBone) {
        val index = bones.indexOf(bone)
        if (index <= 0) {
            bone.worldX0 = rootX + bone.localX
            bone.worldY0 = rootY + bone.localY
            bone.worldAngle = rotation + bone.localAngle
        } else {
            val parent = bone.parentId?.let(::bone)
            if (parent != null && parent !== bone) updateBone(parent)
        }
        applyAim(bone)
        bone.worldX1 = bone.worldX0 + cos(bone.worldAngle * Math.PI.toFloat() / 180f) * bone.length
        bone.worldY1 = bone.worldY0 + sin(bone.worldAngle * Math.PI.toFloat() / 180f) * bone.length
    }

    private fun applyAim(bone: VectorBone) {
        if (bone.constraint != "aim") return
        val angle = atan2(bone.aimY - bone.worldY0, bone.aimX - bone.worldX0) * 180f / Math.PI.toFloat()
        bone.worldAngle = angle
    }

    /** Verlet integration with bone-length constraints; roots stay pinned. */
    fun stepRagdoll(gravityScale: Float = 1f, damping: Float = .98f, steps: Int = 1) {
        updateFk()
        data class Particle(var x: Float, var y: Float, var px: Float, var py: Float, var mass: Float)
        val particles =
            bones.associate { bone ->
                bone.id to Particle(bone.worldX1, bone.worldY1, bone.worldX1, bone.worldY1, bone.mass)
            }.toMutableMap()
        repeat(steps.coerceIn(1, 60)) {
            val dt = 1f / 60f
            particles.values.forEach { p ->
                val vx = (p.x - p.px) * damping.coerceIn(.5f, 1f)
                val vy = (p.y - p.py) * damping.coerceIn(.5f, 1f)
                p.px = p.x
                p.py = p.y
                p.x += vx
                p.y += vy + 900f * gravityScale / p.mass.coerceAtLeast(.1f) * dt * dt
            }
            repeat(6) {
                bones.forEach { bone ->
                    val parent = bone.parentId?.let(::bone)
                    val anchorX = parent?.worldX1 ?: rootX
                    val anchorY = parent?.worldY1 ?: rootY
                    val tip = particles[bone.id] ?: return@forEach
                    val dx = tip.x - anchorX
                    val dy = tip.y - anchorY
                    val distance = hypot(dx, dy)
                    if (distance < .0001f) return@forEach
                    val scale = bone.length / distance
                    tip.x = anchorX + dx * scale
                    tip.y = anchorY + dy * scale
                }
            }
            bones.forEach { bone ->
                val tip = particles[bone.id] ?: return@forEach
                val parent = bone.parentId?.let(::bone)
                val baseX = parent?.worldX1 ?: rootX
                val baseY = parent?.worldY1 ?: rootY
                val world = atan2(tip.y - baseY, tip.x - baseX) * 180f / Math.PI.toFloat()
                val parentAngle = parent?.worldAngle ?: rotation
                val target = (world - parentAngle).coerceIn(-180f, 180f)
                if (bone.physicsMode == "secondary") {
                    val rest = bone.restAngle + (parentAngle - bone.restAngle) * .2f
                    bone.angularVelocity += (rest - bone.localAngle) * bone.stiffness * dt
                    bone.angularVelocity *= damping.coerceIn(.5f, 1f)
                    bone.localAngle += bone.angularVelocity
                } else {
                    bone.localAngle = target
                }
                bone.localAngle =
                    bone.localAngle.coerceIn(bone.minAngle, bone.maxAngle)
                updateFk()
            }
        }
        updateFk()
    }

    /** Bakes current ragdoll motion into per-object transform keyframes. */
    fun bakeToAnimation(
        animation: VectorAnimation,
        objects: List<VectorObject>,
        frames: Int,
        stepsPerFrame: Int,
    ) {
        val count = frames.coerceIn(1, 600)
        repeat(count) { frame ->
            stepRagdoll(steps = stepsPerFrame.coerceIn(1, 20))
            updateFk()
            objects.forEach { obj ->
                val binding = bindings.firstOrNull { it.targetId == obj.id } ?: return@forEach
                val deformed = apply(obj)
                val bounds = VectorSelection.VectorBounds.of(listOf(deformed)) ?: return@forEach
                val bone = bone(binding.boneId)
                animation.addKeyframe(
                    obj.id,
                    frame,
                    bounds.left,
                    bounds.top,
                    bone?.worldAngle ?: 0f,
                    1f,
                    1f,
                    "linear",
                )
            }
        }
        animation.currentFrame = 0
    }

    /** CCD inverse kinematics: rotates ancestors until the effector tip reaches the target. */
    fun solveIk(effectorId: String, targetX: Float, targetY: Float, iterations: Int = 30): Float {
        val effector = bone(effectorId) ?: return Float.MAX_VALUE
        repeat(iterations.coerceIn(1, 200)) {
            updateFk()
            if (hypot(effector.worldX1 - targetX, effector.worldY1 - targetY) <= .5f) return@repeat
            var current: VectorBone? = effector
            var guard = 0
            while (current != null && guard++ < 128) {
                val angleNow = atan2(effector.worldY1 - current.worldY0, effector.worldX1 - current.worldX0)
                val angleTarget = atan2(targetY - current.worldY0, targetX - current.worldX0)
                var delta = (angleTarget - angleNow) * 180f / Math.PI.toFloat()
                while (delta > 180f) delta -= 360f
                while (delta < -180f) delta += 360f
                current.localAngle += delta.coerceIn(-45f, 45f)
                updateFk()
                current = current.parentId?.let(::bone)
            }
        }
        updateFk()
        return hypot(effector.worldX1 - targetX, effector.worldY1 - targetY)
    }

    fun localPoint(point: VectorNode, bone: VectorBone, binding: VectorSkinBinding): VectorNode {
        val angle = -(bone.worldAngle + binding.offsetAngle) * Math.PI.toFloat() / 180f
        val dx = point.x - bone.worldX0 - binding.offsetX
        val dy = point.y - bone.worldY0 - binding.offsetY
        return VectorNode(
            dx * cos(angle) - dy * sin(angle),
            dx * sin(angle) + dy * cos(angle),
            point.pressure,
            point.tiltX,
            point.tiltY,
        )
    }

    fun worldPoint(local: VectorNode, bone: VectorBone, binding: VectorSkinBinding): Pair<Float, Float> {
        val angle = (bone.worldAngle + binding.offsetAngle) * Math.PI.toFloat() / 180f
        return (bone.worldX0 + binding.offsetX + local.x * cos(angle) - local.y * sin(angle)) to
            (bone.worldY0 + binding.offsetY + local.x * sin(angle) + local.y * cos(angle))
    }

    private fun worldOf(local: VectorNode, binding: VectorSkinBinding): Pair<Float, Float> {
        if (binding.type == "smooth_path" && binding.weights.isNotEmpty()) {
            var x = 0f
            var y = 0f
            var total = 0f
            binding.weights.forEach { (id, weight) ->
                val bone = bone(id) ?: return@forEach
                val point = worldPoint(local, bone, binding)
                x += point.first * weight
                y += point.second * weight
                total += weight
            }
            if (total > 0f) return x / total to y / total
        }
        val bone = bone(binding.boneId) ?: return local.x to local.y
        return worldPoint(local, bone, binding)
    }

    fun bind(obj: VectorObject, boneId: String, type: String, weights: Map<String, Float> = emptyMap()) {
        val bone = bone(boneId) ?: return
        bindings.removeAll { it.targetId == obj.id }
        val binding = VectorSkinBinding(obj.id, boneId, type)
        binding.weights.putAll(weights)
        obj.allNodes().forEach { node ->
            binding.localNodes +=
                VectorNode(
                    localPoint(VectorNode(node.x, node.y), bone, binding).x,
                    localPoint(VectorNode(node.x, node.y), bone, binding).y,
                    node.pressure,
                    node.tiltX,
                    node.tiltY,
                    localPoint(VectorNode(node.inX, node.inY), bone, binding).x,
                    localPoint(VectorNode(node.inX, node.inY), bone, binding).y,
                    localPoint(VectorNode(node.outX, node.outY), bone, binding).x,
                    localPoint(VectorNode(node.outX, node.outY), bone, binding).y,
                )
        }
        bindings += binding
    }

    fun apply(obj: VectorObject): VectorObject {
        val binding = bindings.firstOrNull { it.targetId == obj.id } ?: return obj
        if (binding.localNodes.isEmpty()) return obj
        val copy =
            obj.copy(
                nodes = obj.nodes.map { it.copy() }.toMutableList(),
                subPaths =
                    obj.subPaths
                        .map { VectorContour(it.nodes.map { n -> n.copy() }.toMutableList(), it.closed) }
                        .toMutableList(),
            )
        val contours = listOf(copy.nodes) + copy.subPaths.map { it.nodes }
        var index = 0
        contours.forEach { contour ->
            contour.indices.forEach { i ->
                val local = binding.localNodes.getOrNull(index + i) ?: return@forEach
                val anchor = worldOf(VectorNode(local.x, local.y), binding)
                val incoming = worldOf(VectorNode(local.inX, local.inY), binding)
                val outgoing = worldOf(VectorNode(local.outX, local.outY), binding)
                contour[i].x = anchor.first
                contour[i].y = anchor.second
                contour[i].inX = incoming.first
                contour[i].inY = incoming.second
                contour[i].outX = outgoing.first
                contour[i].outY = outgoing.second
            }
            index += contour.size
        }
        return copy
    }

    fun json() =
        JSONObject()
            .put("name", name)
            .put("rootX", rootX.toDouble())
            .put("rootY", rootY.toDouble())
            .put("rotation", rotation.toDouble())
            .put("bones", JSONArray().also { a -> bones.forEach { a.put(it.json()) } })
            .put("bindings", JSONArray().also { a -> bindings.forEach { a.put(it.json()) } })

    companion object {
        fun read(j: JSONObject) =
            VectorSkeleton(j.optString("name", "Rig")).apply {
                rootX = j.optDouble("rootX", 0.0).toFloat()
                rootY = j.optDouble("rootY", 0.0).toFloat()
                rotation = j.optDouble("rotation", 0.0).toFloat()
                val savedBones = j.optJSONArray("bones") ?: JSONArray()
                repeat(savedBones.length()) { i -> bones += VectorBone.read(savedBones.getJSONObject(i)) }
                val savedBindings = j.optJSONArray("bindings") ?: JSONArray()
                repeat(savedBindings.length()) { i ->
                    bindings += VectorSkinBinding.read(savedBindings.getJSONObject(i))
                }
                updateFk()
            }
    }
}
