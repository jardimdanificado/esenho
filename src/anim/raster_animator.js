/**
 * =========================================================================
 * Raster Frame-by-Frame Animation Engine (src/anim/raster_animator.js)
 * High-performance frame management, onion skinning, playback and export
 * for Esenho Painter raster canvas.
 * =========================================================================
 */

export class RasterAnimator {
  constructor(host) {
    this.host = host;
    this.fps = 12;
    this.currentFrameIndex = 0;
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

    // Frame list: Array of { id: string, name: string, duration: 1, layers: Map<number, Uint8Array> }
    this.frames = [];

    // Subscribers for UI updates
    this.listeners = new Set();

    // Cache of offscreen canvases for onion skin rendering
    this._onionCanvasPool = [];

    // Initialize with first frame from current canvas state if available
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
   * Captures raw pixels of all drawing layers (id >= 3)
   */
  captureCurrentFrameLayers() {
    const layerMap = new Map();
    const actor = this.host?.canvasActor;
    if (!actor || !actor.exports) return layerMap;

    const exp = actor.exports;
    const w = exp.get_canvas_width();
    const h = exp.get_canvas_height();
    const orderCount = exp.w_layer_get_order_count ? exp.w_layer_get_order_count() : 0;
    const texIds = (typeof this.host.getTextureWasmIds === 'function') ? this.host.getTextureWasmIds() : new Set();

    const layerIds = [];
    if (orderCount > 0) {
      for (let p = 0; p < orderCount; p++) {
        const id = exp.w_layer_get_order(p);
        if (id >= 3 && !texIds.has(id)) layerIds.push(id);
      }
    } else {
      layerIds.push(3);
    }

    const mem = actor.memory.buffer;
    for (const lid of layerIds) {
      const ptr = exp.w_layer_get_pixels(lid);
      const lw = exp.w_layer_get_width ? exp.w_layer_get_width(lid) : w;
      const lh = exp.w_layer_get_height ? exp.w_layer_get_height(lid) : h;
      if (ptr && lw > 0 && lh > 0) {
        const byteLen = lw * lh * 4;
        const copy = new Uint8Array(byteLen);
        copy.set(new Uint8Array(mem, ptr, byteLen));
        layerMap.set(lid, {
          width: lw,
          height: lh,
          pixels: copy,
          visible: exp.w_layer_get_visible ? exp.w_layer_get_visible(lid) : 1,
          opacity: exp.w_layer_get_opacity ? exp.w_layer_get_opacity(lid) : 255
        });
      }
    }
    return layerMap;
  }

  /**
   * Restores pixel buffers for a given frame onto the active canvas
   */
  applyFrameToCanvas(frameIndex) {
    if (frameIndex < 0 || frameIndex >= this.frames.length) return;
    const frame = this.frames[frameIndex];
    const actor = this.host?.canvasActor;
    if (!actor || !actor.exports || !frame) return;

    const exp = actor.exports;
    const mem = actor.memory.buffer;

    for (const [lid, data] of frame.layers.entries()) {
      const ptr = exp.w_layer_get_pixels(lid);
      const lw = exp.w_layer_get_width ? exp.w_layer_get_width(lid) : data.width;
      const lh = exp.w_layer_get_height ? exp.w_layer_get_height(lid) : data.height;
      if (ptr && data.pixels && data.pixels.byteLength <= lw * lh * 4) {
        new Uint8Array(mem, ptr, data.pixels.byteLength).set(data.pixels);
      }
    }

    if (typeof exp.w_force_composite === 'function') {
      exp.w_force_composite();
    }
    if (typeof this.host.render === 'function') {
      this.host.render();
    }
  }

  initFromCurrentCanvas() {
    this.frames = [{
      id: 'frame_1',
      name: 'Frame 1',
      duration: 1,
      layers: this.captureCurrentFrameLayers()
    }];
    this.currentFrameIndex = 0;
  }

  saveActiveFrame() {
    if (this.currentFrameIndex >= 0 && this.currentFrameIndex < this.frames.length) {
      this.frames[this.currentFrameIndex].layers = this.captureCurrentFrameLayers();
    }
  }

  goToFrame(index, saveActive = true) {
    if (index < 0 || index >= this.frames.length) return;
    if (index === this.currentFrameIndex) return;

    if (saveActive && !this.isPlaying) {
      this.saveActiveFrame();
    }

    this.currentFrameIndex = index;
    this.applyFrameToCanvas(index);
    this.notify('frameChange', { index, frame: this.frames[index] });
  }

  nextFrame() {
    if (this.frames.length <= 1) return;
    const nextIdx = (this.currentFrameIndex + 1) % this.frames.length;
    this.goToFrame(nextIdx);
  }

  prevFrame() {
    if (this.frames.length <= 1) return;
    const prevIdx = (this.currentFrameIndex - 1 + this.frames.length) % this.frames.length;
    this.goToFrame(prevIdx);
  }

  addFrame(duplicate = false) {
    this.saveActiveFrame();

    let newLayers = new Map();
    if (duplicate && this.frames[this.currentFrameIndex]) {
      // Clone pixel buffers
      const curLayers = this.frames[this.currentFrameIndex].layers;
      for (const [lid, data] of curLayers.entries()) {
        newLayers.set(lid, {
          width: data.width,
          height: data.height,
          pixels: new Uint8Array(data.pixels),
          visible: data.visible,
          opacity: data.opacity
        });
      }
    } else {
      // Blank frame: clear pixels on all layers
      const actor = this.host?.canvasActor;
      if (actor && actor.exports) {
        const exp = actor.exports;
        const w = exp.get_canvas_width();
        const h = exp.get_canvas_height();
        const curLayers = this.captureCurrentFrameLayers();
        for (const [lid, data] of curLayers.entries()) {
          const blank = new Uint8Array(w * h * 4);
          newLayers.set(lid, {
            width: w,
            height: h,
            pixels: blank,
            visible: 1,
            opacity: 255
          });
        }
      }
    }

    const newIndex = this.currentFrameIndex + 1;
    const newFrame = {
      id: 'frame_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name: `Frame ${newIndex + 1}`,
      duration: 1,
      layers: newLayers
    };

    this.frames.splice(newIndex, 0, newFrame);
    this.currentFrameIndex = newIndex;
    this.applyFrameToCanvas(newIndex);
    this.notify('framesUpdated', { frames: this.frames, activeIndex: this.currentFrameIndex });
    this.notify('frameChange', { index: newIndex, frame: newFrame });
  }

  deleteFrame(index = this.currentFrameIndex) {
    if (this.frames.length <= 1) {
      // Reset single frame to blank
      this.clearCurrentFrame();
      return;
    }

    this.frames.splice(index, 1);
    if (this.currentFrameIndex >= this.frames.length) {
      this.currentFrameIndex = this.frames.length - 1;
    }
    this.applyFrameToCanvas(this.currentFrameIndex);
    this.notify('framesUpdated', { frames: this.frames, activeIndex: this.currentFrameIndex });
    this.notify('frameChange', { index: this.currentFrameIndex, frame: this.frames[this.currentFrameIndex] });
  }

  clearCurrentFrame() {
    const actor = this.host?.canvasActor;
    if (actor && actor.exports) {
      const exp = actor.exports;
      const curL = (typeof exp.w_layer_get_active === 'function') ? exp.w_layer_get_active() : 3;
      if (typeof exp.w_layer_clear === 'function') {
        exp.w_layer_clear(curL);
      }
      if (typeof exp.w_force_composite === 'function') exp.w_force_composite();
      if (typeof this.host.render === 'function') this.host.render();
    }
    this.saveActiveFrame();
    this.notify('frameContentUpdated', { index: this.currentFrameIndex });
  }

  moveFrame(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.frames.length || toIndex < 0 || toIndex >= this.frames.length) return;
    this.saveActiveFrame();
    const [moved] = this.frames.splice(fromIndex, 1);
    this.frames.splice(toIndex, 0, moved);
    this.currentFrameIndex = toIndex;
    this.applyFrameToCanvas(this.currentFrameIndex);
    this.notify('framesUpdated', { frames: this.frames, activeIndex: this.currentFrameIndex });
    this.notify('frameChange', { index: this.currentFrameIndex, frame: moved });
  }

  setFps(fps) {
    this.fps = Math.max(1, Math.min(60, Math.round(fps)));
    if (this.isPlaying) {
      this.stop();
      this.play();
    }
    this.notify('fpsChanged', { fps: this.fps });
  }

  setFrameDuration(duration, index = this.currentFrameIndex) {
    if (index < 0 || index >= this.frames.length) return;
    const d = Math.max(1, Math.min(12, Math.round(duration || 1)));
    this.frames[index].duration = d;
    this.notify('framesUpdated', { frames: this.frames, activeIndex: this.currentFrameIndex });
  }

  play() {
    if (this.isPlaying) return;
    this.saveActiveFrame();
    this.isPlaying = true;
    this._holdTick = 0;
    const intervalMs = Math.round(1000 / this.fps);

    this._playTimer = setInterval(() => {
      const curFrame = this.frames[this.currentFrameIndex];
      const holdTarget = Math.max(1, (curFrame && curFrame.duration) ? curFrame.duration : 1);
      this._holdTick = (this._holdTick || 0) + 1;
      if (this._holdTick < holdTarget) {
        return;
      }
      this._holdTick = 0;

      let next = this.currentFrameIndex + 1;
      if (next >= this.frames.length) {
        if (!this.loop) {
          this.stop();
          return;
        }
        next = 0;
      }
      this.currentFrameIndex = next;
      this.applyFrameToCanvas(next);
      this.notify('frameChange', { index: next, frame: this.frames[next] });
    }, intervalMs);

    this.notify('playState', { isPlaying: true });
  }

  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this._holdTick = 0;
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
   * Renders onion skin frames onto the host 2D context in document space
   */
  drawOnionSkin(ctx, cw, ch, zoom) {
    if (!this.onionSkin.enabled || this.isPlaying || this.frames.length <= 1) return;

    // Past frames
    for (let step = this.onionSkin.prevFrames; step >= 1; step--) {
      const idx = this.currentFrameIndex - step;
      if (idx >= 0 && idx < this.frames.length) {
        const falloff = (this.onionSkin.prevFrames - step + 1) / (this.onionSkin.prevFrames + 1);
        const alpha = this.onionSkin.opacity * falloff;
        this._renderTintedFrame(ctx, this.frames[idx], this.onionSkin.prevTint, alpha, cw, ch, zoom);
      }
    }

    // Future frames
    for (let step = this.onionSkin.nextFrames; step >= 1; step--) {
      const idx = this.currentFrameIndex + step;
      if (idx >= 0 && idx < this.frames.length) {
        const falloff = (this.onionSkin.nextFrames - step + 1) / (this.onionSkin.nextFrames + 1);
        const alpha = this.onionSkin.opacity * falloff;
        this._renderTintedFrame(ctx, this.frames[idx], this.onionSkin.nextTint, alpha, cw, ch, zoom);
      }
    }
  }

  _renderTintedFrame(ctx, frame, tintRgb, alpha, cw, ch, zoom) {
    if (!frame || !frame.layers || frame.layers.size === 0) return;

    // Find or create an offscreen canvas
    let off = this._onionCanvasPool.pop();
    if (!off || off.width !== cw || off.height !== ch) {
      off = document.createElement('canvas');
      off.width = cw;
      off.height = ch;
    }
    const octx = off.getContext('2d');
    octx.clearRect(0, 0, cw, ch);

    // Composite frame layers onto offscreen canvas
    const imgData = octx.createImageData(cw, ch);
    const dst32 = new Uint32Array(imgData.data.buffer);
    dst32.fill(0);

    const [tr, tg, tb] = tintRgb;

    for (const [lid, ldata] of frame.layers.entries()) {
      if (!ldata.visible || ldata.opacity === 0) continue;
      const lw = ldata.width;
      const lh = ldata.height;
      if (lw !== cw || lh !== ch || !ldata.pixels) continue;

      const src32 = new Uint32Array(ldata.pixels.buffer, ldata.pixels.byteOffset, lw * lh);
      for (let i = 0; i < src32.length; i++) {
        const p = src32[i];
        const a = (p >>> 24) & 0xFF;
        if (a > 10) {
          // Tinted RGBA with preserved shape alpha
          dst32[i] = (a << 24) | (tb << 16) | (tg << 8) | tr;
        }
      }
    }

    octx.putImageData(imgData, 0, 0);

    // Draw tinted offscreen onto target canvas with alpha
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1.0, alpha));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, -(cw * zoom) / 2, -(ch * zoom) / 2, cw * zoom, ch * zoom);
    ctx.restore();

    this._onionCanvasPool.push(off);
  }

  /**
   * Encodes all frames into an Animated GIF89a using the native WASM or JS encoder
   */
  async exportGif(delayMs = Math.round(1000 / this.fps)) {
    this.saveActiveFrame();
    const actor = this.host?.canvasActor;
    const w = this.docWidth;
    const h = this.docHeight;

    // Attempt Native WASM GIF export if exports available
    if (actor && actor.exports && typeof actor.exports.w_gif_start === 'function') {
      const exp = actor.exports;
      exp.w_gif_start(w, h, this.loop ? 0 : 1);

      // Render each frame and append composite
      const origFrame = this.currentFrameIndex;
      for (let i = 0; i < this.frames.length; i++) {
        this.applyFrameToCanvas(i);
        exp.w_gif_append_composite_frame(delayMs);
      }
      this.applyFrameToCanvas(origFrame);

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

    const origFrame = this.currentFrameIndex;
    for (let i = 0; i < this.frames.length; i++) {
      this.applyFrameToCanvas(i);
      const pixPtr = actor?.exports?.get_composite_pixels ? actor.exports.get_composite_pixels() : 0;
      let rawBytes;
      if (pixPtr && actor?.memory) {
        rawBytes = new Uint8Array(actor.memory.buffer, pixPtr, w * h * 4);
      } else {
        // Compose active frame layers into raw buffer
        rawBytes = new Uint8Array(w * h * 4);
        const curFrame = this.frames[i];
        if (curFrame && curFrame.layers) {
          for (const [, ldata] of curFrame.layers.entries()) {
            if (ldata.pixels && ldata.visible && ldata.opacity > 0) {
              rawBytes.set(ldata.pixels.subarray(0, rawBytes.length));
            }
          }
        }
      }

      encoder.addFrame({ data: rawBytes }, delayMs);
    }
    this.applyFrameToCanvas(origFrame);

    return encoder.getBlob();
  }

  /**
   * Encodes frames into WebM Video using VP8 muxer
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

    const origFrame = this.currentFrameIndex;
    for (let i = 0; i < this.frames.length; i++) {
      this.applyFrameToCanvas(i);
      ctx.clearRect(0, 0, w, h);
      const pixPtr = actor?.exports?.get_composite_pixels ? actor.exports.get_composite_pixels() : 0;
      if (pixPtr) {
        const idata = ctx.createImageData(w, h);
        idata.data.set(new Uint8Array(actor.memory.buffer, pixPtr, w * h * 4));
        ctx.putImageData(idata, 0, 0);
      }

      // Convert canvas to WebP data url and extract VP8 payload
      const dataUrl = cvs.toDataURL('image/webp', 0.92);
      const b64 = dataUrl.split(',')[1];
      const binary = atob(b64);
      const u8 = new Uint8Array(binary.length);
      for (let b = 0; b < binary.length; b++) u8[b] = binary.charCodeAt(b);

      // Find VP8 header chunk
      let vp8Offset = -1;
      for (let p = 0; p < u8.length - 4; p++) {
        if (u8[p] === 0x56 && u8[p+1] === 0x50 && u8[p+2] === 0x38 && u8[p+3] === 0x20) {
          vp8Offset = p + 8; // skip FourCC + 4-byte size
          break;
        }
      }
      if (vp8Offset >= 0) {
        const vp8Chunk = u8.subarray(vp8Offset);
        muxer.addVP8Frame(vp8Chunk);
      }
    }
    this.applyFrameToCanvas(origFrame);

    return muxer.getBlob();
  }

  /**
   * Serializes raster animation state for inclusion in .esen project JSON
   */
  toJSON() {
    this.saveActiveFrame();
    const serializeFrame = (frame) => {
      const layersObj = {};
      for (const [lid, ldata] of frame.layers.entries()) {
        let b64 = '';
        if (ldata.pixels) {
          let binary = '';
          const len = ldata.pixels.byteLength;
          const chunkSize = 0x8000;
          for (let i = 0; i < len; i += chunkSize) {
            const chunk = ldata.pixels.subarray(i, Math.min(i + chunkSize, len));
            binary += String.fromCharCode.apply(null, chunk);
          }
          b64 = btoa(binary);
        }
        layersObj[lid] = {
          width: ldata.width,
          height: ldata.height,
          pixels: b64,
          visible: ldata.visible,
          opacity: ldata.opacity
        };
      }
      return {
        id: frame.id,
        name: frame.name,
        duration: frame.duration || 1,
        layers: layersObj
      };
    };

    return {
      fps: this.fps,
      loop: this.loop,
      onionSkin: { ...this.onionSkin },
      currentFrameIndex: this.currentFrameIndex,
      frames: this.frames.map(f => serializeFrame(f))
    };
  }

  /**
   * Restores raster animation state from .esen project JSON
   */
  fromJSON(data) {
    if (!data || !Array.isArray(data.frames) || data.frames.length === 0) return;
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

    this.frames = data.frames.map((f, idx) => {
      const layerMap = new Map();
      if (f.layers) {
        for (const [lid, ldata] of Object.entries(f.layers)) {
          layerMap.set(Number(lid), {
            width: ldata.width || this.docWidth,
            height: ldata.height || this.docHeight,
            pixels: decodeB64(ldata.pixels),
            visible: ldata.visible !== undefined ? ldata.visible : 1,
            opacity: ldata.opacity !== undefined ? ldata.opacity : 255
          });
        }
      }
      return {
        id: f.id || ('frame_' + (idx + 1)),
        name: f.name || `Frame ${idx + 1}`,
        duration: f.duration || 1,
        layers: layerMap
      };
    });

    this.currentFrameIndex = Math.min(data.currentFrameIndex || 0, this.frames.length - 1);
    this.applyFrameToCanvas(this.currentFrameIndex);
    this.notify('framesUpdated', { frames: this.frames, activeIndex: this.currentFrameIndex });
    this.notify('frameChange', { index: this.currentFrameIndex, frame: this.frames[this.currentFrameIndex] });
  }
}
