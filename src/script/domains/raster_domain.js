/**
 * =========================================================================
 * Wesenho Raster Scripting Domain (src/script/domains/raster_domain.js)
 * Deep programmatic control over Quadro C/WASM pixel engine, brush dynamics,
 * layer stack, selections, transforms, and procedural filters.
 * =========================================================================
 */

export class RasterDomain {
  constructor(sdk) {
    this.sdk = sdk;
  }

  get host() {
    return this.sdk.context.host || null;
  }

  get actor() {
    return this.sdk.context.actor || (this.host ? this.host.canvasActor : null);
  }

  /* ── Brush API ── */
  get brush() {
    const host = this.host;
    const bp = host ? host.brushParams : {};
    const sdk = this.sdk;

    return {
      get size() { return bp.size || 20; },
      set size(val) { sdk.commands.dispatch('raster.setBrushParam', { key: 'size', value: val }); },

      get opacity() { return bp.opacity || 100; },
      set opacity(val) { sdk.commands.dispatch('raster.setBrushParam', { key: 'opacity', value: val }); },

      get hardness() { return bp.hardness || 100; },
      set hardness(val) { sdk.commands.dispatch('raster.setBrushParam', { key: 'hardness', value: val }); },

      get flow() { return bp.flow || 100; },
      set flow(val) { sdk.commands.dispatch('raster.setBrushParam', { key: 'flow', value: val }); },

      get spacing() { return bp.spacing || 15; },
      set spacing(val) { sdk.commands.dispatch('raster.setBrushParam', { key: 'spacing', value: val }); },

      get angle() { return bp.angle || 0; },
      set angle(val) { sdk.commands.dispatch('raster.setBrushParam', { key: 'angle', value: val }); },

      get roundness() { return bp.roundness || 100; },
      set roundness(val) { sdk.commands.dispatch('raster.setBrushParam', { key: 'roundness', value: val }); },

      get color() { return host ? host.brushColor : 0xffffffff; },
      set color(hexOrVal) { sdk.commands.dispatch('raster.setColor', { color: hexOrVal }); },

      setParam(key, value) {
        return sdk.commands.dispatch('raster.setBrushParam', { key, value });
      },

      setPreset(presetName) {
        return sdk.commands.dispatch('raster.setPreset', { presetName });
      },

      stroke(points = [], options = {}) {
        return sdk.commands.dispatch('raster.stroke', { points, options });
      }
    };
  }

  /* ── Layer Stack API ── */
  get layers() {
    const host = this.host;
    const sdk = this.sdk;

    return {
      get activeIndex() {
        return host ? host.activeLayerIndex : 0;
      },

      get count() {
        return host && host.layers ? host.layers.length : 1;
      },

      get list() {
        return host && host.layers ? host.layers.slice() : [];
      },

      get(index) {
        return host && host.layers ? host.layers[index] || null : null;
      },

      create(name = 'New Layer', options = {}) {
        return sdk.commands.dispatch('raster.createLayer', { name, options });
      },

      remove(index) {
        return sdk.commands.dispatch('raster.removeLayer', { index });
      },

      select(index) {
        return sdk.commands.dispatch('raster.selectLayer', { index });
      },

      setOpacity(index, opacityPct) {
        return sdk.commands.dispatch('raster.setLayerOpacity', { index, opacityPct });
      },

      setBlendMode(index, blendMode) {
        return sdk.commands.dispatch('raster.setLayerBlendMode', { index, blendMode });
      },

      setAlphaLock(index, locked) {
        return sdk.commands.dispatch('raster.setLayerAlphaLock', { index, locked });
      },

      clear(index) {
        return sdk.commands.dispatch('raster.clearLayer', { index });
      },

      duplicate(index) {
        return sdk.commands.dispatch('raster.duplicateLayer', { index });
      },

      mergeDown(index) {
        return sdk.commands.dispatch('raster.mergeDownLayer', { index });
      }
    };
  }

  /* ── Selection Engine API ── */
  get selection() {
    const sdk = this.sdk;
    const actor = this.actor;

    return {
      rect(x, y, w, h, mode = 0) {
        return sdk.commands.dispatch('raster.selectRect', { x, y, w, h, mode });
      },

      wand(x, y, tolerance = 30, contiguous = true, mode = 0) {
        return sdk.commands.dispatch('raster.selectWand', { x, y, tolerance, contiguous, mode });
      },

      lasso(points = [], mode = 0) {
        return sdk.commands.dispatch('raster.selectLasso', { points, mode });
      },

      clear() {
        return sdk.commands.dispatch('raster.selectClear', {});
      },

      invert() {
        return sdk.commands.dispatch('raster.selectInvert', {});
      },

      feather(radius = 4) {
        return sdk.commands.dispatch('raster.selectFeather', { radius });
      },

      getInfo() {
        return actor && typeof actor.selectGetInfo === 'function' ? actor.selectGetInfo() : null;
      }
    };
  }

  /* ── Transform API ── */
  transform(options = {}) {
    return this.sdk.commands.dispatch('raster.transform', options);
  }

  flipH(layerIndex = -1) {
    return this.sdk.commands.dispatch('raster.flipH', { layerIndex });
  }

  flipV(layerIndex = -1) {
    return this.sdk.commands.dispatch('raster.flipV', { layerIndex });
  }

  /* ── Filters API ── */
  applyFilter(name, params = {}) {
    return this.sdk.commands.dispatch('raster.applyFilter', { name, params });
  }
}
