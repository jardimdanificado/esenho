/**
 * =========================================================================
 * Wesenho UI Scripting Domain (src/script/domains/ui_domain.js)
 * Scriptable keymaps, custom dockable panels, HUD overlays, and tool extensions.
 * =========================================================================
 */

export class UIDomain {
  constructor(sdk) {
    this.sdk = sdk;
    this.customTools = new Map();
    this.customPanels = new Map();
    this.keymap = new Map();
  }

  registerTool(toolDef = { name: '', icon: '', onDrag: null }) {
    if (!toolDef || !toolDef.name) return;
    this.customTools.set(toolDef.name, toolDef);
    this.sdk.hooks.trigger('onToolRegistered', { tool: toolDef });
  }

  registerPanel(panelId, title, renderFn) {
    this.customPanels.set(panelId, { id: panelId, title, renderFn, visible: true });
    this.sdk.hooks.trigger('onPanelRegistered', { panelId, title });
  }

  bindKey(combo, commandNameOrFn) {
    this.keymap.set(combo.toLowerCase(), commandNameOrFn);
  }

  unbindKey(combo) {
    this.keymap.delete(combo.toLowerCase());
  }

  handleKeyEvent(keyCombo) {
    const handler = this.keymap.get(keyCombo.toLowerCase());
    if (typeof handler === 'string') {
      return this.sdk.commands.dispatch(handler, {});
    } else if (typeof handler === 'function') {
      return handler(this.sdk);
    }
    return false;
  }
}
