/**
 * =========================================================================
 * Universal Wesenho Scripting Platform SDK (src/script/wesenho_sdk.js)
 * Complete, inspectable, zero-copy JavaScript API controlling Painter,
 * SVG Studio, Animator, and Audio DAW.
 * =========================================================================
 */

import { CommandBus } from './command_bus.js';
import { MemoryBridge } from './memory_bridge.js';
import { HookRegistry } from './hook_registry.js';
import { RasterDomain } from './domains/raster_domain.js';
import { VectorDomain } from './domains/vector_domain.js';
import { AnimDomain } from './domains/anim_domain.js';
import { AudioDomain } from './domains/audio_domain.js';
import { UIDomain } from './domains/ui_domain.js';

export class WesenhoSDK {
  constructor(options = {}) {
    this.context = options.context || {};

    // 1. Core Platform Engines
    this.commands = new CommandBus(() => this.context);
    this.memory = new MemoryBridge(() => this.context.actor || (this.context.host ? this.context.host.canvasActor : null));
    this.hooks = new HookRegistry();

    // 2. Domain APIs
    this.raster = new RasterDomain(this);
    this.vector = new VectorDomain(this);
    this.anim = new AnimDomain(this);
    this.audio = new AudioDomain(this);
    this.ui = new UIDomain(this);

    // 3. Register Core Commands
    this._registerDefaultCommands();
  }

  setContext(ctx) {
    Object.assign(this.context, ctx);
  }

  /**
   * Execute arbitrary JavaScript script with 'wesenho' in scope.
   */
  eval(scriptCode) {
    const fn = new Function('wesenho', 'commands', 'raster', 'vector', 'anim', 'audio', 'ui', 'memory', 'hooks', `
      ${scriptCode}
    `);
    return fn.call(
      this,
      this,
      this.commands,
      this.raster,
      this.vector,
      this.anim,
      this.audio,
      this.ui,
      this.memory,
      this.hooks
    );
  }

  _registerDefaultCommands() {
    // ── Raster Commands ──
    this.commands.register('raster.setBrushParam', {
      execute: (payload, ctx) => {
        const host = ctx.host;
        if (host && host.brushParams) {
          const oldVal = host.brushParams[payload.key];
          host.brushParams[payload.key] = payload.value;
          if (host.canvasActor && typeof host.canvasActor.setBrushParam === 'function') {
            host.canvasActor.setBrushParam(payload.key, payload.value);
          }
          return { key: payload.key, prevValue: oldVal };
        }
        return null;
      },
      undo: (undoData, payload, ctx) => {
        if (undoData && ctx.host) {
          ctx.host.brushParams[undoData.key] = undoData.prevValue;
          if (ctx.host.canvasActor && typeof ctx.host.canvasActor.setBrushParam === 'function') {
            ctx.host.canvasActor.setBrushParam(undoData.key, undoData.prevValue);
          }
        }
      },
      toScript: p => `wesenho.raster.brush.${p.key} = ${JSON.stringify(p.value)};`
    });

    this.commands.register('raster.setColor', {
      execute: (payload, ctx) => {
        const host = ctx.host;
        if (host) {
          const oldColor = host.brushColor;
          host.brushColor = payload.color;
          return { prevColor: oldColor };
        }
        return null;
      },
      undo: (undoData, payload, ctx) => {
        if (undoData && ctx.host) {
          ctx.host.brushColor = undoData.prevColor;
        }
      },
      toScript: p => `wesenho.raster.brush.color = ${JSON.stringify(p.color)};`
    });

    this.commands.register('raster.createLayer', {
      execute: (payload, ctx) => {
        const host = ctx.host;
        if (host && typeof host.addLayer === 'function') {
          const layer = host.addLayer(payload.name, payload.options);
          return { layerId: layer ? layer.id : null };
        }
        return null;
      },
      undo: (undoData, payload, ctx) => {
        if (undoData && undoData.layerId && ctx.host && typeof ctx.host.removeLayer === 'function') {
          ctx.host.removeLayer(undoData.layerId);
        }
      },
      toScript: p => `wesenho.raster.layers.create(${JSON.stringify(p.name)}, ${JSON.stringify(p.options || {})});`
    });

    // ── Vector Commands ──
    this.commands.register('vector.createShape', {
      execute: (payload, ctx) => {
        const doc = ctx.vectorDoc;
        if (doc && typeof doc.createShape === 'function') {
          return doc.createShape(payload.type, payload);
        }
        return null;
      },
      undo: (undoData, payload, ctx) => {
        const doc = ctx.vectorDoc;
        if (doc && undoData && typeof doc.removeObject === 'function') {
          doc.removeObject(undoData.id);
        }
      },
      toScript: p => `wesenho.vector.create${p.type.charAt(0).toUpperCase() + p.type.slice(1)}(${p.x}, ${p.y}, ${p.width || p.rx}, ${p.height || p.ry});`
    });

    // ── Animation Commands ──
    this.commands.register('anim.setFrame', {
      execute: (payload, ctx) => {
        const stage = ctx.animStage;
        if (stage) {
          const prev = stage.currentFrame;
          stage.currentFrame = payload.frame;
          return { prevFrame: prev };
        }
        return null;
      },
      undo: (undoData, payload, ctx) => {
        if (undoData && ctx.animStage) {
          ctx.animStage.currentFrame = undoData.prevFrame;
        }
      },
      toScript: p => `wesenho.anim.gotoAndStop(${p.frame});`
    });
  }
}

// Global Singleton creation
export const wesenho = new WesenhoSDK();
if (typeof globalThis !== 'undefined') {
  globalThis.wesenho = wesenho;
}
