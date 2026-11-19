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

    val before = mesh.scene.camera.position
    engine.onTouchDown(40f, 40f)
    engine.onTouchMove(70f, 55f)
    engine.onTouchUp(70f, 55f)
    check(mesh.scene.camera.position != before) { "Orbit gesture did not move the camera" }

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
    println("Mesh phase 1: raster, orbit, wireframe, OBJ metadata and project OK")
}
