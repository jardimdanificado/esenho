/**
 * =========================================================================
 * Raster Per-Layer Frame-by-Frame Animation Engine (src/anim/raster_animator.js)
 * Supports independent frame timelines per layer and arbitrary (unlimited)
 * frame hold durations (in ticks/frames).
 * =========================================================================
 */

export class RasterAnimator {
  constructor(host) {
    this.host = host;
    this.fps = 12;
    this.currentTick = 0;
    this.isPlaying = false;
    this.loop = true;
    this._playTimer = null;

    // Onion Skin settings
    this.onionSkin = {
      enabled: false,
      prevFrames: 2,
      nextFrames: 1,
      opacity: 0.35,
      prevTint: [255, 60, 60],   // Red tint for past frames
      nextTint: [60, 140, 255]   // Blue tint for future frames
    };

    // Per-layer timeline tracks: Map<layerId, { frames: Array<Cel>, activeCelIndex: number }>
    this.layerTracks = new Map();

    // Subscribers for UI updates
    this.listeners = new Set();

    // Cache of offscreen canvases for onion skin rendering
    this._onionCanvasPool = [];

    // Initialize tracks from current canvas state
    this.initFromCurrentCanvas();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(event, data) {
    for (const fn of this.listeners) {
      try { fn(event, data); } catch (e) { console.error('[RasterAnimator]', e); }
    }
  }

  get docWidth() {
    if (!this.host || !this.host.canvasActor || !this.host.canvasActor.exports) return 800;
    return this.host.canvasActor.exports.get_canvas_width() || 800;
  }

  get docHeight() {
    if (!this.host || !this.host.canvasActor || !this.host.canvasActor.exports) return 600;
    return this.host.canvasActor.exports.get_canvas_height() || 600;
  }

  /**
   * Returns ordered drawing layer IDs (bottom-to-top in WASM order, id >= 3)
   */
  getDrawingLayerIds() {
    const actor = this.host?.canvasActor;
    if (!actor || !actor.exports) return [3];
    const exp = actor.exports;
    const orderCount = exp.w_layer_get_order_count ? exp.w_layer_get_order_count() : 0;
    const texIds = (typeof this.host.getTextureWasmIds === 'function') ? this.host.getTextureWasmIds() : new Set();

    const layerIds = [];
    if (orderCount > 0) {
      for (let p = 0; p < orderCount; p++) {
        const id = exp.w_layer_get_order(p);
        if (id >= 3 && !texIds.has(id)) layerIds.push(id);
      }
    }
    if (layerIds.length === 0) {
      layerIds.push(3);
    }
    return layerIds;
  }

  getActiveLayerId() {
    const exp = this.host?.canvasActor?.exports;
    if (!exp) return 3;
    const activeFn = exp.get_active_layer || exp.w_layer_get_active;
    const id = typeof activeFn === 'function' ? activeFn() : 3;
    return id >= 3 ? id : 3;
  }

  getLayerName(lid) {
    return this.host?.layerNames?.get(lid) || (lid === 3 ? 'Background' : `Layer ${lid}`);
  }

  _attachCelCompat(cel, lid) {
    cel.layerId = lid;
    const selfMap = new Map([[lid, cel]]);
    cel.layers = selfMap;
    return cel;
  }

  /**
   * Captures raw pixel buffer of a single layer `lid`
   */
  captureSingleLayerData(lid) {
    const actor = this.host?.canvasActor;
    const w = this.docWidth;
    const h = this.docHeight;
    if (!actor || !actor.exports) {
      return {
        width: w,
        height: h,
        pixels: new Uint8Array(w * h * 4),
        visible: 1,
        opacity: 255
      };
    }
    const exp = actor.exports;
    const ptr = exp.w_layer_get_pixels ? exp.w_layer_get_pixels(lid) : 0;
    const lw = exp.w_layer_get_width ? exp.w_layer_get_width(lid) : w;
    const lh = exp.w_layer_get_height ? exp.w_layer_get_height(lid) : h;
    const byteLen = Math.max(0, lw * lh * 4);
    const copy = new Uint8Array(byteLen);
    if (ptr && lw > 0 && lh > 0 && actor.memory?.buffer && ptr + byteLen <= actor.memory.buffer.byteLength) {
      copy.set(new Uint8Array(actor.memory.buffer, ptr, byteLen));
    }
    return {
      width: lw || w,
      height: lh || h,
      pixels: copy,
      visible: exp.w_layer_get_visible ? exp.w_layer_get_visible(lid) : 1,
      opacity: exp.w_layer_get_opacity ? exp.w_layer_get_opacity(lid) : 255
    };
  }

  createCelFromCanvas(lid, name = 'Frame 1', duration = 1) {
    const data = this.captureSingleLayerData(lid);
    const cel = {
      id: `cel_${lid}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      layerId: lid,
      name,
      duration: Math.max(1, Math.round(Number(duration) || 1)),
      width: data.width,
      height: data.height,
      pixels: data.pixels,
      visible: data.visible,
      opacity: data.opacity
    };
    return this._attachCelCompat(cel, lid);
  }

  createBlankCel(lid, name = 'Frame', duration = 1) {
    const w = this.docWidth;
    const h = this.docHeight;
    const exp = this.host?.canvasActor?.exports;
    const cel = {
      id: `cel_${lid}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      layerId: lid,
      name,
      duration: Math.max(1, Math.round(Number(duration) || 1)),
      width: w,
      height: h,
      pixels: new Uint8Array(w * h * 4),
      visible: exp?.w_layer_get_visible ? exp.w_layer_get_visible(lid) : 1,
      opacity: exp?.w_layer_get_opacity ? exp.w_layer_get_opacity(lid) : 255
    };
    return this._attachCelCompat(cel, lid);
  }

  /**
   * Ensures every canvas drawing layer has a track in `this.layerTracks`
   */
  syncLayersWithCanvas() {
    const layerIds = this.getDrawingLayerIds();
    const activeSet = new Set(layerIds);

    for (const lid of layerIds) {
      if (!this.layerTracks.has(lid)) {
        const cel = this.createCelFromCanvas(lid, 'Frame 1', 1);
        this.layerTracks.set(lid, {
          layerId: lid,
          frames: [cel],
          activeCelIndex: 0
        });
      } else {
        const track = this.layerTracks.get(lid);
        if (!Array.isArray(track.frames) || track.frames.length === 0) {
          track.frames = [this.createCelFromCanvas(lid, 'Frame 1', 1)];
          track.activeCelIndex = 0;
        }
        if (track.activeCelIndex < 0 || track.activeCelIndex >= track.frames.length) {
          track.activeCelIndex = Math.max(0, track.frames.length - 1);
        }
      }
    }

    // Prune tracks for layers that no longer exist on canvas (only when WASM order is populated)
    const exp = this.host?.canvasActor?.exports;
    const orderCount = exp?.w_layer_get_order_count ? exp.w_layer_get_order_count() : 0;
    if (orderCount > 0) {
      for (const lid of Array.from(this.layerTracks.keys())) {
        if (!activeSet.has(lid)) {
          this.layerTracks.delete(lid);
        }
      }
    }
  }

  getLayerTrack(lid = this.getActiveLayerId()) {
    this.syncLayersWithCanvas();
    if (!this.layerTracks.has(lid)) {
      const fallbackId = this.getDrawingLayerIds()[0] ?? 3;
      return this.layerTracks.get(fallbackId);
    }
    return this.layerTracks.get(lid);
  }

  /**
   * Compatibility getters/setters: `this.frames` and `this.currentFrameIndex`
   * refer to the active layer's track.
   */
  get frames() {
    const track = this.getLayerTrack(this.getActiveLayerId());
    return track ? track.frames : [];
  }

  set frames(newFrames) {
    const lid = this.getActiveLayerId();
    this.syncLayersWithCanvas();
    const track = this.layerTracks.get(lid);
    if (track && Array.isArray(newFrames)) {
      track.frames = newFrames.map(f => this._attachCelCompat(f, lid));
      track.activeCelIndex = Math.min(track.activeCelIndex, Math.max(0, track.frames.length - 1));
    }
  }

  get currentFrameIndex() {
    const track = this.getLayerTrack(this.getActiveLayerId());
    return track ? track.activeCelIndex : 0;
  }

  set currentFrameIndex(idx) {
    const track = this.getLayerTrack(this.getActiveLayerId());
    if (track) {
      track.activeCelIndex = Math.max(0, Math.min(idx, Math.max(0, track.frames.length - 1)));
    }
  }

  /**
   * Total duration in ticks of a single layer's timeline
   */
  getLayerDurationTicks(lid) {
    const track = this.getLayerTrack(lid);
    if (!track || !track.frames.length) return 1;
    let total = 0;
    for (const f of track.frames) {
      total += Math.max(1, Math.round(Number(f.duration) || 1));
    }
    return Math.max(1, total);
  }

  /**
   * Total duration in ticks across all layers
   */
  getTotalDurationTicks() {
    this.syncLayersWithCanvas();
    let maxTicks = 1;
    for (const lid of this.layerTracks.keys()) {
      const d = this.getLayerDurationTicks(lid);
      if (d > maxTicks) maxTicks = d;
    }
    return maxTicks;
  }

  /**
   * Start tick (0-indexed) of `celIndex` on layer `lid`
   */
  getCelStartTick(lid, celIndex) {
    const track = this.getLayerTrack(lid);
    if (!track || !track.frames.length) return 0;
    let tick = 0;
    const limit = Math.max(0, Math.min(celIndex, track.frames.length - 1));
    for (let i = 0; i < limit; i++) {
      tick += Math.max(1, Math.round(Number(track.frames[i].duration) || 1));
    }
    return tick;
  }

  /**
   * Resolves which cel in layer `lid` is active at global `tick`
   */
  getCelAtTick(lid, tick) {
    const track = this.getLayerTrack(lid);
    if (!track || !track.frames.length) return { celIndex: 0, cel: null, startTick: 0, offsetInCel: 0 };
    const t = Math.max(0, Math.round(tick || 0));
    let acc = 0;
    for (let i = 0; i < track.frames.length; i++) {
      const cel = track.frames[i];
      const dur = Math.max(1, Math.round(Number(cel.duration) || 1));
      if (t < acc + dur) {
        return { celIndex: i, cel, startTick: acc, offsetInCel: t - acc };
      }
      acc += dur;
    }
    const lastIdx = track.frames.length - 1;
    const lastCel = track.frames[lastIdx];
    const lastDur = Math.max(1, Math.round(Number(lastCel.duration) || 1));
    return {
      celIndex: lastIdx,
      cel: lastCel,
      startTick: Math.max(0, acc - lastDur),
      offsetInCel: t - Math.max(0, acc - lastDur)
    };
  }

  /**
   * Captures raw pixels of all drawing layers (id >= 3)
   */
  captureCurrentFrameLayers() {
    const layerMap = new Map();
    const layerIds = this.getDrawingLayerIds();
    for (const lid of layerIds) {
      layerMap.set(lid, this.captureSingleLayerData(lid));
    }
    return layerMap;
  }

  /**
   * Writes a single layer's cel buffer into the WASM canvas
   */
  _writeCelToWasmLayer(lid, cel) {
    const actor = this.host?.canvasActor;
    if (!actor || !actor.exports || !cel) return;
    const exp = actor.exports;
    const ptr = exp.w_layer_get_pixels ? exp.w_layer_get_pixels(lid) : 0;
    const lw = exp.w_layer_get_width ? exp.w_layer_get_width(lid) : cel.width;
    const lh = exp.w_layer_get_height ? exp.w_layer_get_height(lid) : cel.height;
    if (ptr && cel.pixels && actor.memory?.buffer && cel.pixels.byteLength <= lw * lh * 4) {
      new Uint8Array(actor.memory.buffer, ptr, cel.pixels.byteLength).set(cel.pixels);
    }
  }

  /**
   * Applies all layers' cels at global `tick` onto the active WASM canvas
   */
  applyTickToCanvas(tick) {
    this.syncLayersWithCanvas();
    const actor = this.host?.canvasActor;
    if (!actor || !actor.exports) return;

    this.currentTick = Math.max(0, Math.round(tick || 0));
    for (const [lid, track] of this.layerTracks.entries()) {
      const { celIndex, cel } = this.getCelAtTick(lid, this.currentTick);
      track.activeCelIndex = celIndex;
      if (cel) {
        this._writeCelToWasmLayer(lid, cel);
      }
    }

    const exp = actor.exports;
    if (typeof exp.w_force_composite === 'function') {
      exp.w_force_composite();
    }
    if (typeof this.host.render === 'function') {
      this.host.render();
    }
  }

  /**
   * Restores pixel buffers for a given cel index on `layerId` (and syncs other layers to that cel's start tick)
   */
  applyFrameToCanvas(frameIndex, layerId = this.getActiveLayerId()) {
    const track = this.getLayerTrack(layerId);
    if (!track || frameIndex < 0 || frameIndex >= track.frames.length) return;
    track.activeCelIndex = frameIndex;
    const startTick = this.getCelStartTick(layerId, frameIndex);
    this.currentTick = startTick;

    for (const [lid, tr] of this.layerTracks.entries()) {
      if (lid === layerId) {
        this._writeCelToWasmLayer(lid, tr.frames[frameIndex]);
      } else {
        const { celIndex, cel } = this.getCelAtTick(lid, startTick);
        tr.activeCelIndex = celIndex;
        if (cel) this._writeCelToWasmLayer(lid, cel);
      }
    }

    const exp = this.host?.canvasActor?.exports;
    if (exp && typeof exp.w_force_composite === 'function') {
      exp.w_force_composite();
    }
    if (typeof this.host?.render === 'function') {
      this.host.render();
    }
  }

  initFromCurrentCanvas() {
    this.layerTracks.clear();
    const layerIds = this.getDrawingLayerIds();
    for (const lid of layerIds) {
      const cel = this.createCelFromCanvas(lid, 'Frame 1', 1);
      this.layerTracks.set(lid, {
        layerId: lid,
        frames: [cel],
        activeCelIndex: 0
      });
    }
    this.currentTick = 0;
  }

  /**
   * Saves the current canvas pixels of each layer into its currently active cel
   */
  saveActiveFrame(onlyLayerId = null) {
    this.syncLayersWithCanvas();
    for (const [lid, track] of this.layerTracks.entries()) {
      if (onlyLayerId !== null && lid !== onlyLayerId) continue;
      const idx = track.activeCelIndex;
      if (idx >= 0 && idx < track.frames.length) {
        const data = this.captureSingleLayerData(lid);
        const existing = track.frames[idx];
        existing.width = data.width;
        existing.height = data.height;
        existing.pixels = data.pixels;
        existing.visible = data.visible;
        existing.opacity = data.opacity;
        this._attachCelCompat(existing, lid);
      }
    }
  }

  /**
   * Navigates to a specific cel `index` on `layerId` (defaults to active layer)
   */
  goToFrame(index, saveActive = true, layerId = this.getActiveLayerId()) {
    const track = this.getLayerTrack(layerId);
    if (!track || index < 0 || index >= track.frames.length) return;

    if (saveActive && !this.isPlaying) {
      this.saveActiveFrame();
    }

    track.activeCelIndex = index;
    this.applyFrameToCanvas(index, layerId);
    this.notify('frameChange', {
      index,
      layerId,
      tick: this.currentTick,
      frame: track.frames[index]
    });
  }

  /**
   * Scrubs global timeline to `tick` (0 .. totalDurationTicks - 1)
   */
  goToTick(tick, saveActive = true) {
    const total = this.getTotalDurationTicks();
    const clamped = Math.max(0, Math.min(total - 1, Math.round(tick || 0)));
    if (saveActive && !this.isPlaying) {
      this.saveActiveFrame();
    }
    this.applyTickToCanvas(clamped);
    const activeLid = this.getActiveLayerId();
    const track = this.getLayerTrack(activeLid);
    const activeIdx = track ? track.activeCelIndex : 0;
    this.notify('frameChange', {
      index: activeIdx,
      layerId: activeLid,
      tick: this.currentTick,
      frame: track?.frames?.[activeIdx] || null
    });
  }

  /**
   * Selects a specific layer and jumps to `celIndex` on that layer's track
   */
  selectLayerCel(layerId, celIndex, saveActive = true) {
    if (saveActive && !this.isPlaying) {
      this.saveActiveFrame();
    }
    const exp = this.host?.canvasActor?.exports;
    if (exp && typeof exp.w_layer_select === 'function') {
      exp.w_layer_select(layerId);
    }
    this.goToFrame(celIndex, false, layerId);
    this.notify('framesUpdated', {
      frames: this.frames,
      activeIndex: this.currentFrameIndex,
      layerId,
      tick: this.currentTick
    });
  }

  nextFrame(layerId = this.getActiveLayerId()) {
    const track = this.getLayerTrack(layerId);
    if (!track || track.frames.length <= 1) return;
    const nextIdx = (track.activeCelIndex + 1) % track.frames.length;
    this.goToFrame(nextIdx, true, layerId);
  }

  prevFrame(layerId = this.getActiveLayerId()) {
    const track = this.getLayerTrack(layerId);
    if (!track || track.frames.length <= 1) return;
    const prevIdx = (track.activeCelIndex - 1 + track.frames.length) % track.frames.length;
    this.goToFrame(prevIdx, true, layerId);
  }

  /**
   * Adds a new blank or duplicated frame to `layerId`'s timeline track
   */
  addFrame(duplicate = false, layerId = this.getActiveLayerId()) {
    this.saveActiveFrame();
    const track = this.getLayerTrack(layerId);
    if (!track) return;

    const curCel = track.frames[track.activeCelIndex];
    const newIndex = track.activeCelIndex + 1;
    let newCel;

    if (duplicate && curCel) {
      newCel = this._attachCelCompat({
        id: `cel_${layerId}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        layerId,
        name: `Frame ${newIndex + 1}`,
        duration: curCel.duration || 1,
        width: curCel.width,
        height: curCel.height,
        pixels: new Uint8Array(curCel.pixels),
        visible: curCel.visible,
        opacity: curCel.opacity
      }, layerId);
    } else {
      newCel = this.createBlankCel(layerId, `Frame ${newIndex + 1}`, 1);
    }

    track.frames.splice(newIndex, 0, newCel);
    track.activeCelIndex = newIndex;
    this.applyFrameToCanvas(newIndex, layerId);
    this.notify('framesUpdated', {
      frames: track.frames,
      activeIndex: newIndex,
      layerId,
      tick: this.currentTick
    });
    this.notify('frameChange', {
      index: newIndex,
      layerId,
      tick: this.currentTick,
      frame: newCel
    });
  }

  duplicateFrame(layerId = this.getActiveLayerId()) {
    this.addFrame(true, layerId);
  }

  deleteFrame(index = null, layerId = this.getActiveLayerId()) {
    const track = this.getLayerTrack(layerId);
    if (!track) return;
    const targetIdx = (index !== null && index !== undefined) ? index : track.activeCelIndex;

    if (track.frames.length <= 1) {
      this.clearCurrentFrame(layerId);
      return;
    }

    if (targetIdx < 0 || targetIdx >= track.frames.length) return;
    track.frames.splice(targetIdx, 1);
    if (track.activeCelIndex >= track.frames.length) {
      track.activeCelIndex = track.frames.length - 1;
    }
    this.applyFrameToCanvas(track.activeCelIndex, layerId);
    this.notify('framesUpdated', {
      frames: track.frames,
      activeIndex: track.activeCelIndex,
      layerId,
      tick: this.currentTick
    });
    this.notify('frameChange', {
      index: track.activeCelIndex,
      layerId,
      tick: this.currentTick,
      frame: track.frames[track.activeCelIndex]
    });
  }

  clearCurrentFrame(layerId = this.getActiveLayerId()) {
    const actor = this.host?.canvasActor;
    if (actor && actor.exports) {
      const exp = actor.exports;
      if (typeof exp.w_layer_clear === 'function') {
        exp.w_layer_clear(layerId);
      }
      if (typeof exp.w_force_composite === 'function') exp.w_force_composite();
      if (typeof this.host.render === 'function') this.host.render();
    }
    this.saveActiveFrame(layerId);
    const track = this.getLayerTrack(layerId);
    this.notify('frameContentUpdated', {
      index: track ? track.activeCelIndex : 0,
      layerId
    });
  }

  clearFrame(layerId = this.getActiveLayerId()) {
    this.clearCurrentFrame(layerId);
  }

  moveFrame(fromIndex, toIndex, layerId = this.getActiveLayerId()) {
    const track = this.getLayerTrack(layerId);
    if (!track) return;
    if (fromIndex < 0 || fromIndex >= track.frames.length || toIndex < 0 || toIndex >= track.frames.length) return;
    this.saveActiveFrame();
    const [moved] = track.frames.splice(fromIndex, 1);
    track.frames.splice(toIndex, 0, moved);
    track.activeCelIndex = toIndex;
    this.applyFrameToCanvas(track.activeCelIndex, layerId);
    this.notify('framesUpdated', {
      frames: track.frames,
      activeIndex: track.activeCelIndex,
      layerId,
      tick: this.currentTick
    });
    this.notify('frameChange', {
      index: track.activeCelIndex,
      layerId,
      tick: this.currentTick,
      frame: moved
    });
  }

  setFps(fps) {
    this.fps = Math.max(1, Math.min(60, Math.round(fps)));
    if (this.isPlaying) {
      this.stop();
      this.play();
    }
    this.notify('fpsChanged', { fps: this.fps });
  }

  /**
   * Sets frame hold duration (in ticks/frames) with NO upper cap (1 .. infinity)
   */
  setFrameDuration(duration, index = null, layerId = this.getActiveLayerId()) {
    const track = this.getLayerTrack(layerId);
    if (!track) return;
    const targetIdx = (index !== null && index !== undefined) ? index : track.activeCelIndex;
    if (targetIdx < 0 || targetIdx >= track.frames.length) return;
    const d = Math.max(1, Math.round(Number(duration) || 1));
    track.frames[targetIdx].duration = d;
    this.notify('framesUpdated', {
      frames: track.frames,
      activeIndex: track.activeCelIndex,
      layerId,
      tick: this.currentTick
    });
  }

  play() {
    if (this.isPlaying) return;
    this.saveActiveFrame();
    this.isPlaying = true;
    const intervalMs = Math.round(1000 / this.fps);

    this._playTimer = setInterval(() => {
      const totalTicks = this.getTotalDurationTicks();
      let nextTick = this.currentTick + 1;
      if (nextTick >= totalTicks) {
        if (!this.loop) {
          this.stop();
          return;
        }
        nextTick = 0;
      }
      this.applyTickToCanvas(nextTick);
      const activeLid = this.getActiveLayerId();
      const track = this.getLayerTrack(activeLid);
      const activeIdx = track ? track.activeCelIndex : 0;
      this.notify('frameChange', {
        index: activeIdx,
        layerId: activeLid,
        tick: nextTick,
        frame: track?.frames?.[activeIdx] || null
      });
    }, intervalMs);

    this.notify('playState', { isPlaying: true });
  }

  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this._playTimer) {
      clearInterval(this._playTimer);
      this._playTimer = null;
    }
    this.notify('playState', { isPlaying: false });
  }

  togglePlay() {
    if (this.isPlaying) this.stop();
    else this.play();
  }

  toggleOnionSkin(val = null) {
    this.onionSkin.enabled = (val !== null) ? !!val : !this.onionSkin.enabled;
    this.notify('onionSkinChanged', { ...this.onionSkin });
    if (typeof this.host?.render === 'function') {
      this.host.render();
    }
  }

  /**
   * Renders onion skin frames for the active layer onto the host 2D context in document space
   */
  drawOnionSkin(ctx, cw, ch, zoom) {
    if (!this.onionSkin.enabled || this.isPlaying) return;
    const activeLid = this.getActiveLayerId();
    const track = this.getLayerTrack(activeLid);
    if (!track || track.frames.length <= 1) return;

    const curIdx = track.activeCelIndex;

    // Past cels on the active layer
    for (let step = this.onionSkin.prevFrames; step >= 1; step--) {
      const idx = curIdx - step;
      if (idx >= 0 && idx < track.frames.length) {
        const falloff = (this.onionSkin.prevFrames - step + 1) / (this.onionSkin.prevFrames + 1);
        const alpha = this.onionSkin.opacity * falloff;
        this._renderTintedCel(ctx, track.frames[idx], this.onionSkin.prevTint, alpha, cw, ch, zoom);
      }
    }

    // Future cels on the active layer
    for (let step = this.onionSkin.nextFrames; step >= 1; step--) {
      const idx = curIdx + step;
      if (idx >= 0 && idx < track.frames.length) {
        const falloff = (this.onionSkin.nextFrames - step + 1) / (this.onionSkin.nextFrames + 1);
        const alpha = this.onionSkin.opacity * falloff;
        this._renderTintedCel(ctx, track.frames[idx], this.onionSkin.nextTint, alpha, cw, ch, zoom);
      }
    }
  }

  _renderTintedCel(ctx, cel, tintRgb, alpha, cw, ch, zoom) {
    if (!cel || !cel.pixels) return;
    const lw = cel.width;
    const lh = cel.height;
    if (lw !== cw || lh !== ch) return;

    let off = this._onionCanvasPool.pop();
    if (!off || off.width !== cw || off.height !== ch) {
      off = document.createElement('canvas');
      off.width = cw;
      off.height = ch;
    }
    const octx = off.getContext('2d');
    octx.clearRect(0, 0, cw, ch);

    const imgData = octx.createImageData(cw, ch);
    const dst32 = new Uint32Array(imgData.data.buffer);
    dst32.fill(0);

    const [tr, tg, tb] = tintRgb;
    const src32 = new Uint32Array(cel.pixels.buffer, cel.pixels.byteOffset, lw * lh);
    for (let i = 0; i < src32.length; i++) {
      const p = src32[i];
      const a = (p >>> 24) & 0xFF;
      if (a > 10) {
        dst32[i] = (a << 24) | (tb << 16) | (tg << 8) | tr;
      }
    }

    octx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1.0, alpha));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, -(cw * zoom) / 2, -(ch * zoom) / 2, cw * zoom, ch * zoom);
    ctx.restore();

    this._onionCanvasPool.push(off);
  }

  /**
   * Encodes all timeline ticks into an Animated GIF89a
   */
  async exportGif(delayMs = Math.round(1000 / this.fps)) {
    this.saveActiveFrame();
    const actor = this.host?.canvasActor;
    const w = this.docWidth;
    const h = this.docHeight;
    const totalTicks = this.getTotalDurationTicks();
    const origTick = this.currentTick;

    // Attempt Native WASM GIF export if exports available
    if (actor && actor.exports && typeof actor.exports.w_gif_start === 'function') {
      const exp = actor.exports;
      exp.w_gif_start(w, h, this.loop ? 0 : 1);

      for (let t = 0; t < totalTicks; t++) {
        this.applyTickToCanvas(t);
        exp.w_gif_append_composite_frame(delayMs);
      }
      this.applyTickToCanvas(origTick);

      const byteSize = exp.w_gif_finalize();
      if (byteSize > 0) {
        const bufPtr = exp.w_gif_get_buffer(0);
        const u8 = new Uint8Array(actor.memory.buffer, bufPtr, byteSize).slice();
        return new Blob([u8], { type: 'image/gif' });
      }
    }

    // Fallback: JS GifEncoder
    const { GifEncoder } = await import('./gif_encoder.js');
    const encoder = new GifEncoder(w, h, { repeat: this.loop ? 0 : -1 });
    encoder.start();

    for (let t = 0; t < totalTicks; t++) {
      this.applyTickToCanvas(t);
      const pixPtr = actor?.exports?.get_composite_pixels ? actor.exports.get_composite_pixels() : 0;
      let rawBytes;
      if (pixPtr && actor?.memory) {
        rawBytes = new Uint8Array(actor.memory.buffer, pixPtr, w * h * 4);
      } else {
        rawBytes = new Uint8Array(w * h * 4);
        for (const [lid] of this.layerTracks.entries()) {
          const { cel } = this.getCelAtTick(lid, t);
          if (cel && cel.pixels && cel.visible && cel.opacity > 0) {
            rawBytes.set(cel.pixels.subarray(0, rawBytes.length));
          }
        }
      }
      encoder.addFrame({ data: rawBytes }, delayMs);
    }
    this.applyTickToCanvas(origTick);

    return encoder.getBlob();
  }

  /**
   * Encodes all timeline ticks into WebM Video using VP8 muxer
   */
  async exportWebM() {
    this.saveActiveFrame();
    const { WebmMuxer } = await import('./webm_muxer.js');
    const w = this.docWidth;
    const h = this.docHeight;
    const muxer = new WebmMuxer(w, h, this.fps);

    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d');
    const actor = this.host?.canvasActor;

    const totalTicks = this.getTotalDurationTicks();
    const origTick = this.currentTick;
    for (let t = 0; t < totalTicks; t++) {
      this.applyTickToCanvas(t);
      ctx.clearRect(0, 0, w, h);
      const pixPtr = actor?.exports?.get_composite_pixels ? actor.exports.get_composite_pixels() : 0;
      if (pixPtr) {
        const idata = ctx.createImageData(w, h);
        idata.data.set(new Uint8Array(actor.memory.buffer, pixPtr, w * h * 4));
        ctx.putImageData(idata, 0, 0);
      }

      const dataUrl = cvs.toDataURL('image/webp', 0.92);
      const b64 = dataUrl.split(',')[1];
      const binary = atob(b64);
      const u8 = new Uint8Array(binary.length);
      for (let b = 0; b < binary.length; b++) u8[b] = binary.charCodeAt(b);

      let vp8Offset = -1;
      for (let p = 0; p < u8.length - 4; p++) {
        if (u8[p] === 0x56 && u8[p + 1] === 0x50 && u8[p + 2] === 0x38 && u8[p + 3] === 0x20) {
          vp8Offset = p + 8;
          break;
        }
      }
      if (vp8Offset >= 0) {
        const vp8Chunk = u8.subarray(vp8Offset);
        muxer.addVP8Frame(vp8Chunk);
      }
    }
    this.applyTickToCanvas(origTick);

    return muxer.getBlob();
  }

  /**
   * Serializes per-layer raster animation state for inclusion in .esen project JSON
   * (Also includes backwards-compatible `frames` array for active layer)
   */
  toJSON() {
    this.saveActiveFrame();
    const encodeB64 = (pixels) => {
      if (!pixels) return '';
      let binary = '';
      const len = pixels.byteLength;
      const chunkSize = 0x8000;
      for (let i = 0; i < len; i += chunkSize) {
        const chunk = pixels.subarray(i, Math.min(i + chunkSize, len));
        binary += String.fromCharCode.apply(null, chunk);
      }
      return btoa(binary);
    };

    const layerTracksObj = {};
    for (const [lid, track] of this.layerTracks.entries()) {
      layerTracksObj[lid] = {
        layerId: lid,
        activeCelIndex: track.activeCelIndex || 0,
        frames: track.frames.map(cel => ({
          id: cel.id,
          name: cel.name,
          duration: Math.max(1, Math.round(Number(cel.duration) || 1)),
          width: cel.width,
          height: cel.height,
          pixels: encodeB64(cel.pixels),
          visible: cel.visible,
          opacity: cel.opacity
        }))
      };
    }

    // Backwards-compatible `frames` snapshot of active layer
    const activeLid = this.getActiveLayerId();
    const activeTrack = this.getLayerTrack(activeLid);
    const compatFrames = (activeTrack ? activeTrack.frames : []).map(cel => ({
      id: cel.id,
      name: cel.name,
      duration: Math.max(1, Math.round(Number(cel.duration) || 1)),
      layers: {
        [activeLid]: {
          width: cel.width,
          height: cel.height,
          pixels: encodeB64(cel.pixels),
          visible: cel.visible,
          opacity: cel.opacity
        }
      }
    }));

    return {
      fps: this.fps,
      loop: this.loop,
      onionSkin: { ...this.onionSkin },
      currentTick: this.currentTick,
      currentFrameIndex: this.currentFrameIndex,
      layerTracks: layerTracksObj,
      frames: compatFrames
    };
  }

  /**
   * Restores per-layer (or legacy multi-layer frame) raster animation state from .esen project JSON
   */
  fromJSON(data) {
    if (!data) return;
    this.fps = data.fps || 12;
    this.loop = data.loop !== undefined ? data.loop : true;
    if (data.onionSkin) {
      this.onionSkin = { ...this.onionSkin, ...data.onionSkin };
    }

    const decodeB64 = (str) => {
      if (!str) return new Uint8Array(0);
      const binary = atob(str);
      const u8 = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
      return u8;
    };

    if (data.layerTracks && typeof data.layerTracks === 'object' && Object.keys(data.layerTracks).length > 0) {
      this.layerTracks.clear();
      for (const [lidStr, trackData] of Object.entries(data.layerTracks)) {
        const lid = Number(lidStr);
        if (!Array.isArray(trackData.frames) || trackData.frames.length === 0) continue;
        const frames = trackData.frames.map((f, idx) => this._attachCelCompat({
          id: f.id || `cel_${lid}_${idx + 1}`,
          layerId: lid,
          name: f.name || `Frame ${idx + 1}`,
          duration: Math.max(1, Math.round(Number(f.duration) || 1)),
          width: f.width || this.docWidth,
          height: f.height || this.docHeight,
          pixels: decodeB64(f.pixels),
          visible: f.visible !== undefined ? f.visible : 1,
          opacity: f.opacity !== undefined ? f.opacity : 255
        }, lid));
        this.layerTracks.set(lid, {
          layerId: lid,
          frames,
          activeCelIndex: Math.max(0, Math.min(trackData.activeCelIndex || 0, frames.length - 1))
        });
      }
      this.syncLayersWithCanvas();
      this.currentTick = Math.max(0, data.currentTick || 0);
      this.applyTickToCanvas(this.currentTick);
    } else if (Array.isArray(data.frames) && data.frames.length > 0) {
      // Legacy format: convert global `data.frames` into per-layer tracks
      this.layerTracks.clear();
      const layerIdsSet = new Set(this.getDrawingLayerIds());
      for (const f of data.frames) {
        if (f.layers) {
          for (const lidStr of Object.keys(f.layers)) layerIdsSet.add(Number(lidStr));
        }
      }
      for (const lid of layerIdsSet) {
        const frames = data.frames.map((f, idx) => {
          const ldata = f.layers ? (f.layers[lid] || f.layers[String(lid)]) : null;
          return this._attachCelCompat({
            id: f.id ? `${f.id}_L${lid}` : `cel_${lid}_${idx + 1}`,
            layerId: lid,
            name: f.name || `Frame ${idx + 1}`,
            duration: Math.max(1, Math.round(Number(f.duration) || 1)),
            width: ldata?.width || this.docWidth,
            height: ldata?.height || this.docHeight,
            pixels: ldata?.pixels ? decodeB64(ldata.pixels) : new Uint8Array(this.docWidth * this.docHeight * 4),
            visible: ldata?.visible !== undefined ? ldata.visible : 1,
            opacity: ldata?.opacity !== undefined ? ldata.opacity : 255
          }, lid);
        });
        this.layerTracks.set(lid, {
          layerId: lid,
          frames,
          activeCelIndex: Math.min(data.currentFrameIndex || 0, Math.max(0, frames.length - 1))
        });
      }
      this.applyFrameToCanvas(this.currentFrameIndex, this.getActiveLayerId());
    }

    this.notify('framesUpdated', {
      frames: this.frames,
      activeIndex: this.currentFrameIndex,
      layerId: this.getActiveLayerId(),
      tick: this.currentTick
    });
    this.notify('frameChange', {
      index: this.currentFrameIndex,
      layerId: this.getActiveLayerId(),
      tick: this.currentTick,
      frame: this.frames[this.currentFrameIndex]
    });
  }
}
