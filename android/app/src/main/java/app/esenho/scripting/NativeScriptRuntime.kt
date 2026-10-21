package app.esenho.scripting

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.annotation.Keep
import app.esenho.R
import org.json.JSONObject
import java.util.concurrent.Callable
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean

@Keep
object NativeScriptRuntime {
    init { System.loadLibrary("esenho_script") }
    external fun execute(bootstrap: ByteArray, source: ByteArray, host: ScriptSession): ByteArray?
}

/** One isolated VM per execution; only the worker thread enters QuickJS. */
@Keep
class ScriptSession(
    private val context: Context,
    private val api: NativeScriptApi,
    private val onStatus: (String) -> Unit,
    private val onLog: (String) -> Unit,
    private val onFinished: (String?) -> Unit,
    private val onRequest: (String, JSONObject, (Any?) -> Unit) -> Unit = { _, _, _ -> error("Interação não disponível") },
) {
    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor { task -> Thread(task, "Esenho-JavaScript") }
    private val stopped = AtomicBoolean(false)
    private val closed = AtomicBoolean(false)
    private val started = AtomicBoolean(false)
    private val finished = AtomicBoolean(false)
    private val pending = java.util.concurrent.ConcurrentLinkedQueue<CompletableFuture<*>>()

    @Keep fun shouldStop(): Boolean = stopped.get()

    fun run(source: String) {
        check(started.compareAndSet(false, true))
        api.canvas.scripting.running = true
        api.engine.isAnimationPlaying = false
        api.engine.cancelActiveStroke()
        api.engine.cancelTransform()
        onStatus("Executando script…")
        worker.execute {
            val error = runCatching {
                val bootstrap = context.resources.openRawResource(R.raw.esenho_script_api).use { it.readBytes() }
                NativeScriptRuntime.execute(bootstrap, source.toByteArray(Charsets.UTF_8), this)?.toString(Charsets.UTF_8)
            }.fold({ it }, { it.message ?: "Falha ao executar script" })
            main.post {
                if (!closed.get()) api.finish()
                finished.set(true)
                if (!closed.get()) onFinished(if (stopped.get()) "Execução cancelada" else error)
            }
            worker.shutdown()
        }
    }

    @Keep fun invoke(operation: String, input: ByteArray): ByteArray {
        val response = try {
            checkRunning()
            val args = JSONObject(input.toString(Charsets.UTF_8))
            val result: Any? = when (operation) {
                "log" -> {
                    val message = args.getString("message").take(4000)
                    onUi { onLog(message) }
                    null
                }
                "pivots.pick" -> pick(args)
                "files.pick", "ui.prompt" -> {
                    val future = CompletableFuture<Any?>()
                    pending.add(future)
                    try {
                        onUi { onRequest(operation, args) { future.complete(it) } }
                        await(future)
                    } finally { pending.remove(future) }
                }
                "wait" -> {
                    val ms = args.getDouble("ms")
                    require(ms.isFinite() && ms in 0.0..3_600_000.0)
                    val until = android.os.SystemClock.elapsedRealtime() + ms.toLong()
                    while (android.os.SystemClock.elapsedRealtime() < until) {
                        checkRunning()
                        Thread.sleep(minOf(50L, (until-android.os.SystemClock.elapsedRealtime()).coerceAtLeast(1)))
                    }
                    null
                }
                "project.save", "export.image", "export.animation", "files.readText", "files.writeText", "files.list", "files.remove" -> {
                    val job = onUi { api.prepareIo(operation,args) }
                    job.execute()
                }
                else -> onUi { api.invoke(operation, args) }
            }
            JSONObject().put("value", result ?: JSONObject.NULL)
        } catch (failure: Exception) {
            JSONObject().put("error", failure.cause?.message ?: failure.message ?: "Falha no comando")
        }
        return response.toString().toByteArray(Charsets.UTF_8)
    }

    private fun pick(args: JSONObject): JSONObject {
        require(args.optString("anchor", "document") in listOf("document", "screen")) { "Âncora deve ser document ou screen" }
        val future = CompletableFuture<JSONObject>()
        pending.add(future)
        try {
            onUi {
                onStatus(args.optString("message", "Toque e arraste para orientar o pivot"))
                api.canvas.scripting.pick(args) { future.complete(it) }
            }
            return await(future).also { onUi { onStatus("Executando script…") } }
        } finally { pending.remove(future) }
    }

    private fun checkRunning() {
        if (stopped.get()) throw CancellationException("Execução cancelada")
    }

    private fun <T> onUi(action: () -> T): T {
        val task = FutureTask(Callable { checkRunning(); action() })
        main.post(task)
        try { return await(task) }
        catch (failure: Exception) { task.cancel(false); throw failure }
    }

    private fun <T> await(future: java.util.concurrent.Future<T>): T {
        while (true) {
            checkRunning()
            try { return future.get(50, TimeUnit.MILLISECONDS) }
            catch (_: TimeoutException) { }
        }
    }

    fun cancel() {
        if (finished.get()) return
        stopped.set(true)
        pending.forEach { it.cancel(false) }
        main.post { if (!finished.get()) api.canvas.scripting.cancelPick() }
    }

    fun close() {
        closed.set(true)
        cancel()
        api.finish()
        worker.shutdown()
    }
}
