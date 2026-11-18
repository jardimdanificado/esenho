package app.esenho.desktop

import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import app.esenho.scripting.*
import app.esenho.ui.EsenhoCanvasView
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.swing.SwingUtilities

/** Vector commands are dispatched through the real QuickJS runtime and host bridge. */
fun vectorScriptSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 160, 160)
    engine.selectPreset(engine.presetCatalog.first())
    val done = CountDownLatch(1)
    var scriptError: String? = null
    SwingUtilities.invokeAndWait {
        val canvas = EsenhoCanvasView(context).apply { this.engine = engine }
        val api = NativeScriptApi(engine, canvas, {}, { engine.currentTool = it }, { _, _ -> })
        ScriptSession(
            context,
            api,
            {},
            {},
            {
                scriptError = it
                done.countDown()
            },
        ).run(
            """
            esenho.vector.enable(true);
            var a = esenho.vector.create({type:'rect', x:10, y:10, width:50, height:50, fill:'#ff0000'});
            var b = esenho.vector.create({type:'ellipse', x:80, y:10, width:50, height:50, fill:'#0000ff'});
            var t = esenho.vector.create({type:'text', x:10, y:100, text:'Olá', fontSize:20});
            esenho.vector.setText(t, {text:'Script'});
            esenho.vector.gradient(a, {type:'linear', stops:[[0,'#ff0000'],[1,'#00ff00']]});
            esenho.vector.simplify(b, 2);
            var list = esenho.vector.list();
            var svg = esenho.vector.toSvg();
            if (list.length < 3) throw new Error('Objetos vetoriais ausentes');
            if (svg.indexOf('<linearGradient') < 0) throw new Error('Gradiente ausente no SVG');
            if (typeof a !== 'string' || typeof t !== 'string') throw new Error('IDs inválidos');
            """.trimIndent()
        )
    }
    check(done.await(20, TimeUnit.SECONDS)) { "Script vetorial não concluiu" }
    check(scriptError == null) { "Script vetorial: $scriptError" }
    val objects = engine.vectors.layers.values.flatten()
    check(objects.size == 3)
    check(objects.any { it.text == "Script" && it.fontSize == 20f })
    check(objects.any { it.fillGradient != null && it.fillGradient!!.stops.size == 2 })
    println("Vector scripting: create/style/text/gradient/simplify/export via QuickJS OK")
}
