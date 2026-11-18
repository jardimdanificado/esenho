package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import kotlin.math.abs

/** Vector property keyframes are evaluated at render time without touching base geometry. */
fun vectorAnimationSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 200, 200)
    engine.selectPreset(engine.presetCatalog.first())
    val v = engine.vectors
    v.switchMode(true)
    val layer = engine.activeLayerIndex
    v.layers[layer] =
        mutableListOf(
            VectorObject(
                "animated",
                mutableListOf(
                    VectorNode(20f, 20f, 1f),
                    VectorNode(60f, 20f, 1f),
                    VectorNode(60f, 60f, 1f),
                    VectorNode(20f, 60f, 1f),
                ),
                engine.captureVectorStyle(),
                true,
                0xffff0000.toInt(),
            )
        )
    v.render()
    val animation = v.animation
    animation.addKeyframe("animated", 0, 20f, 20f, 0f, 1f, 1f, "linear")
    animation.addKeyframe("animated", 10, 100f, 20f, 90f, 2f, .5f, "linear")
    check(animation.duration >= 11)
    val middle = animation.valueAt(animation.track("animated"), 5)!!
    check(abs(middle.x - 60f) < .01f)
    check(abs(middle.rotation - 45f) < .01f)
    check(abs(middle.scale - 1.5f) < .01f)
    check(abs(middle.opacity - .75f) < .01f)

    animation.addKeyframe("animated", 20, 140f, 20f, 0f, 1f, 1f, "linear")
    animation.track("animated").keyframes.first { it.frame == 10 }.easing = "ease-in"
    val eased = animation.valueAt(animation.track("animated"), 15)!!
    check(abs(eased.x - 110f) < .01f) { "Ease-in interpolation ${eased.x}" }

    animation.customEasings += VectorEasingCurve("soft", .42f, 0f, .58f, 1f)
    animation.track("animated").keyframes.first { it.frame == 10 }.easing = "soft"
    val custom = animation.valueAt(animation.track("animated"), 15)!!
    check(abs(custom.x - 120f) < 1f) { "Custom easing interpolation ${custom.x}" }

    animation.addKeyframe(
        "animated", 30, 140f, 20f, 0f, 1f, 1f, "linear",
        fill = 0xff0000ff.toInt(), fontSize = 30f,
    )
    val styled = animation.valueAt(animation.track("animated"), 30)!!
    check(styled.fill == 0xff0000ff.toInt() && styled.fontSize == 30f)

    animation.currentFrame = 5
    v.render()
    val bitmap = Bitmap(200, 200)
    check(EsenhoNativeBridge.nativeLayerGetBitmap(layer, bitmap))
    check((bitmap.getPixel(80, 40) ushr 24) > 0) { "Animated object was not drawn at the keyframed position" }
    bitmap.recycle()
    check(v.layers.getValue(layer).first().nodes.first().x == 20f) { "Animation mutated base geometry" }

    animation.clips.add(VectorAnimationClip("loop", 0, 10))
    animation.activeClip = "loop"
    animation.currentFrame = 10
    animation.advance()
    check(animation.currentFrame == 0)

    val project = v.snapshot()
    v.restore(project)
    check(v.animation.tracks["animated"]!!.keyframes.size == 4)
    check(v.animation.customEasings.single().name == "soft")
    check(v.animation.clips.single().name == "loop")
    check(v.animation.currentFrame == 0)
    check(engine.undo())
    println("Vector animation: keyframes, easing, render transform, clips and archive OK")
}
