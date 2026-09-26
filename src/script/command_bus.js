/**
 * =========================================================================
 * Wesenho Command & Transaction Bus (src/script/command_bus.js)
 * Atomic, reversible, interceptable command execution, macro recording,
 * and history graph management across the entire creative platform.
 * =========================================================================
 */

export class Command {
  constructor(name, payload = {}, handler = null) {
    this.name = name;
    this.payload = payload;
    this.handler = handler;
    this.id = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.timestamp = Date.now();
    this.undoData = null;
    this.executed = false;
  }

  execute(context) {
    if (this.handler && typeof this.handler.execute === 'function') {
      this.undoData = this.handler.execute(this.payload, context);
      this.executed = true;
      return this.undoData;
    }
    return null;
  }

  undo(context) {
    if (this.handler && typeof this.handler.undo === 'function' && this.executed) {
      this.handler.undo(this.undoData, this.payload, context);
      this.executed = false;
    }
  }

  toScript() {
    if (this.handler && typeof this.handler.toScript === 'function') {
      return this.handler.toScript(this.payload);
    }
    return `wesenho.commands.dispatch('${this.name}', ${JSON.stringify(this.payload)});`;
  }
}

export class CompoundCommand extends Command {
  constructor(name, commands = []) {
    super(name || 'Transaction', { count: commands.length });
    this.commands = commands;
  }

  execute(context) {
    const results = [];
    for (const cmd of this.commands) {
      results.push(cmd.execute(context));
    }
    this.executed = true;
    return results;
  }

  undo(context) {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo(context);
    }
    this.executed = false;
  }

  toScript() {
    return this.commands.map(c => c.toScript()).join('\n');
  }
}

export class CommandBus {
  constructor(contextProvider = () => ({})) {
    this.contextProvider = contextProvider;
    this.registry = new Map();
    this.interceptors = new Map(); // commandName -> Array of middleware fn(cmd, next, context)
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 100;
    this.isExecuting = false;
    this.activeTransaction = null;
    this.isRecordingMacro = false;
    this.recordedMacro = [];
    this.listeners = new Set();
  }

  get context() {
    return typeof this.contextProvider === 'function' ? this.contextProvider() : {};
  }

  register(name, definition) {
    if (!name || typeof definition !== 'object') {
      throw new Error(`Invalid command registration for "${name}"`);
    }
    this.registry.set(name, definition);
  }

  has(name) {
    return this.registry.has(name);
  }

  intercept(commandName, middlewareFn) {
    if (!this.interceptors.has(commandName)) {
      this.interceptors.set(commandName, []);
    }
    this.interceptors.get(commandName).push(middlewareFn);
    return () => {
      const list = this.interceptors.get(commandName);
      if (list) {
        const idx = list.indexOf(middlewareFn);
        if (idx !== -1) list.splice(idx, 1);
      }
    };
  }

  dispatch(name, payload = {}, options = {}) {
    const handler = this.registry.get(name);
    if (!handler) {
      throw new Error(`Command "${name}" not registered in CommandBus`);
    }

    const cmd = new Command(name, payload, handler);
    const ctx = this.context;

    // Run Interceptors
    const middlewareList = [
      ...(this.interceptors.get('*') || []),
      ...(this.interceptors.get(name) || [])
    ];

    let index = 0;
    let cancelled = false;

    const next = () => {
      if (cancelled) return;
      if (index < middlewareList.length) {
        const fn = middlewareList[index++];
        fn(cmd, next, ctx);
      } else {
        // Execute the command
        cmd.execute(ctx);
      }
    };

    if (middlewareList.length > 0) {
      next();
    } else {
      cmd.execute(ctx);
    }

    // Handle transaction grouping or standard history
    if (this.activeTransaction) {
      this.activeTransaction.commands.push(cmd);
    } else if (!options.transient) {
      // Discard future history if we were in the middle of undo stack
      if (this.historyIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyIndex + 1);
      }
      this.history.push(cmd);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      } else {
        this.historyIndex++;
      }
    }

    // Macro Recording
    if (this.isRecordingMacro && !options.noRecord) {
      this.recordedMacro.push(cmd.toScript());
    }

    this._notify(cmd);
    return cmd;
  }

  transaction(name, callback) {
    const prevTx = this.activeTransaction;
    const tx = new CompoundCommand(name, []);
    this.activeTransaction = tx;

    try {
      callback();
    } finally {
      this.activeTransaction = prevTx;
    }

    if (tx.commands.length > 0) {
      if (this.activeTransaction) {
        this.activeTransaction.commands.push(tx);
      } else {
        if (this.historyIndex < this.history.length - 1) {
          this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(tx);
        if (this.history.length > this.maxHistory) {
          this.history.shift();
        } else {
          this.historyIndex++;
        }
        this._notify(tx);
      }
    }
    return tx;
  }

  undo() {
    if (!this.canUndo) return false;
    const cmd = this.history[this.historyIndex];
    cmd.undo(this.context);
    this.historyIndex--;
    this._notify({ type: 'undo', command: cmd });
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    this.historyIndex++;
    const cmd = this.history[this.historyIndex];
    cmd.execute(this.context);
    this._notify({ type: 'redo', command: cmd });
    return true;
  }

  get canUndo() {
    return this.historyIndex >= 0;
  }

  get canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  clearHistory() {
    this.history = [];
    this.historyIndex = -1;
    this._notify({ type: 'clearHistory' });
  }

  startMacroRecording() {
    this.isRecordingMacro = true;
    this.recordedMacro = [];
  }

  stopMacroRecording() {
    this.isRecordingMacro = false;
    return this.getMacroScript();
  }

  getMacroScript() {
    return this.recordedMacro.join('\n');
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in CommandBus listener:', err);
      }
    }
  }
}
