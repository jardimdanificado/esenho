package app.esenho.desktop

import app.esenho.desktop.graphics.Bitmap
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.EsenhoNativeBridge
import app.esenho.nativeengine.EsenhoProjectIO
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.mesh3d.ObjReader
import app.esenho.nativeengine.mesh3d.Vec3
import java.io.ByteArrayOutputStream

/** Phase 1: triangle rasterization, camera, OBJ roundtrip and project persistence. */
fun meshSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 128, 128)
    val mesh = engine.meshes
    mesh.switchMode(true)
    mesh.addCube(2f)
    check(mesh.enabled && mesh.scene.objects.size == 1)
    check(mesh.selected!!.faces.size == 12 && mesh.selected!!.triangleCount() == 12)

    fun opaquePixels(): Int {
        val bitmap = Bitmap(128, 128)
        check(EsenhoNativeBridge.nativeLayerGetBitmap(mesh.layerId, bitmap))
        val pixels = IntArray(128 * 128)
        bitmap.getPixels(pixels, 0, 128, 0, 0, 128, 128)
        bitmap.recycle()
        return pixels.count { it ushr 24 > 0 }
    }
    mesh.render()
    val painted = opaquePixels()
    check(painted > 200) { "Cube did not render: $painted pixels" }
    check(painted < 128 * 128 / 2) { "Cube covered too much of the canvas: $painted" }

    mesh.setRenderSettings(wireframe = true)
    check(opaquePixels() > painted)
    mesh.setRenderSettings(wireframe = false)

    val center = mesh.projectPoint(Vec3.ZERO)!!
    val hit = mesh.pick(center.first, center.second)
    check(hit != null && hit.objectId == mesh.selected!!.id) { "Ray pick missed the cube" }

    val cameraBefore = mesh.scene.camera.position
    val targetBefore = mesh.scene.camera.target
    mesh.tool = app.esenho.nativeengine.mesh3d.MeshTool.PAN
    engine.onTouchDown(40f, 40f)
    engine.onTouchMove(70f, 40f)
    engine.onTouchUp(70f, 40f)
    check(mesh.scene.camera.position != cameraBefore && mesh.scene.camera.target != targetBefore)
    mesh.tool = app.esenho.nativeengine.mesh3d.MeshTool.ORBIT

    val positionBefore = mesh.selected!!.transform.position
    mesh.tool = app.esenho.nativeengine.mesh3d.MeshTool.MOVE
    val origin = mesh.projectPoint(positionBefore)!!
    engine.onTouchDown(origin.first, origin.second)
    engine.onTouchMove(origin.first + 20f, origin.second)
    engine.onTouchUp(origin.first + 20f, origin.second)
    check(mesh.selected!!.transform.position != positionBefore) { "Move gizmo did not transform the object" }
    mesh.tool = app.esenho.nativeengine.mesh3d.MeshTool.SELECT

    val obj = mesh.exportObj(withMetadata = false)
    val parsed = ObjReader.read(obj)
    check(parsed.objects.size == 1 && parsed.objects.single().faces.size == 12)
    check(parsed.objects.single().vertices.size == 8)

    mesh.scene.camera.position = Vec3(1f, 2f, 3f)
    val withMetadata = ObjReader.read(mesh.exportObj(withMetadata = true))
    check(withMetadata.camera.position == Vec3(1f, 2f, 3f))
    check(withMetadata.objects.single().transform == mesh.scene.objects.single().transform)

    val archive = ByteArrayOutputStream()
    EsenhoProjectIO.save(engine, archive)
    EsenhoProjectIO.load(engine, archive.toByteArray().inputStream())
    check(engine.meshes.scene.objects.size == 1)
    check(engine.meshes.scene.camera.position == Vec3(1f, 2f, 3f))
    check(engine.undo())
    check(engine.redo())

    mesh.addCylinder(1f, 2f, 8)
    check(mesh.selected!!.name == "Cilindro" && mesh.selected!!.faces.size == 32)
    mesh.addSphere(1f, 8, 6)
    check(mesh.selected!!.name == "Esfera" && mesh.selected!!.smooth)

    mesh.tool = app.esenho.nativeengine.mesh3d.MeshTool.SELECT
    mesh.selectedId = mesh.scene.objects.first { it.name == "Cubo" }.id
    val cube = mesh.selected!!
    val faceCount = cube.faces.size
    val vertexCount = cube.vertices.size
    mesh.extrudeFace(0, .5f)
    check(cube.faces.size > faceCount && cube.vertices.size > vertexCount)
    val originalVertex = cube.vertices[0]
    mesh.setVertex(0, Vec3(originalVertex.x + .5f, originalVertex.y, originalVertex.z))
    check(cube.vertices[0] == Vec3(originalVertex.x + .5f, originalVertex.y, originalVertex.z))
    mesh.setMaterial(color = 0xff00ff00.toInt(), opacity = .5f)
    check(cube.materials.first().diffuse == 0xff00ff00.toInt())
    mesh.setSmooth(true)
    check(cube.smooth)
    check(ObjReader.read(mesh.exportObj()).objects.size == mesh.scene.objects.size)

    mesh.previewScale = .5f
    val started = System.nanoTime()
    repeat(30) { mesh.orbit(2f, 1f) }
    val elapsed = (System.nanoTime() - started) / 1_000_000
    mesh.previewScale = 1f
    mesh.render()
    println("Mesh preview: 30 orbit frames in ${elapsed.toInt()} ms")
    println("Mesh phases 1-3: raster, camera, picking, gizmos, primitives, editing and OBJ OK")
}
