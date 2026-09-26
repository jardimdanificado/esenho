/**
 * =========================================================================
 * Wesenho Hook & Pipeline Interceptor Registry (src/script/hook_registry.js)
 * Low-level execution hooks per-dab, per-audio-block, per-node, and per-frame.
 * =========================================================================
 */

export class HookRegistry {
  constructor() {
    this.hooks = new Map();
  }

  /**
   * Register a hook listener with optional priority (higher executes first).
   */
  register(hookName, callback, priority = 0) {
    if (typeof callback !== 'function') {
      throw new Error(`Callback for hook "${hookName}" must be a function`);
    }
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    const entry = { callback, priority };
    const list = this.hooks.get(hookName);
    list.push(entry);
    list.sort((a, b) => b.priority - a.priority);

    return () => this.unregister(hookName, callback);
  }

  unregister(hookName, callback) {
    const list = this.hooks.get(hookName);
    if (!list) return;
    const idx = list.findIndex(e => e.callback === callback);
    if (idx !== -1) list.splice(idx, 1);
  }

  has(hookName) {
    const list = this.hooks.get(hookName);
    return list && list.length > 0;
  }

  /**
   * Trigger all listeners for a hook in order of priority.
   */
  trigger(hookName, context = {}) {
    const list = this.hooks.get(hookName);
    if (!list || list.length === 0) return context;
    for (const entry of list) {
      try {
        const res = entry.callback(context);
        if (res === false) break; // Allow cancelling remaining hooks
      } catch (err) {
        console.error(`Error in hook "${hookName}":`, err);
      }
    }
    return context;
  }

  /**
   * Run a waterfall pipeline: each hook takes the output of the previous hook.
   */
  pipe(hookName, initialValue, context = {}) {
    const list = this.hooks.get(hookName);
    if (!list || list.length === 0) return initialValue;
    let current = initialValue;
    for (const entry of list) {
      try {
        current = entry.callback(current, context);
      } catch (err) {
        console.error(`Error in pipeline hook "${hookName}":`, err);
      }
    }
    return current;
  }

  clear() {
    this.hooks.clear();
  }
}
