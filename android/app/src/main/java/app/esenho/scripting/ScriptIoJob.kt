package app.esenho.scripting

/** Owns immutable export snapshots until the worker has finished using them. */
class ScriptIoJob(private val action: () -> Any?, private val cleanup: () -> Unit = {}) {
    private var running = false
    private var released = false
    fun execute(): Any? {
        synchronized(this) { check(!released) { "Operação cancelada" }; running = true }
        try { return action() }
        finally { synchronized(this) { if(!released) { released=true; cleanup() } } }
    }
    fun isReleased(): Boolean = synchronized(this) { released }
    fun cancel() { synchronized(this) { if(!running && !released) { released=true; cleanup() } } }
}
