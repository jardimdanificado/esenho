/**
 * =========================================================================
 * Wesenho Memory Bridge (src/script/memory_bridge.js)
 * Zero-copy typed buffer accessors to WASM linear memory, raster framebuffers,
 * selection alpha masks, audio PCM streams, and mesh vertex skinning arrays.
 * =========================================================================
 */

export class MemoryBridge {
  constructor(wasmModuleProvider = () => null) {
    this.wasmModuleProvider = wasmModuleProvider;
  }

  get module() {
    return typeof this.wasmModuleProvider === 'function' ? this.wasmModuleProvider() : null;
  }

  get memory() {
    const mod = this.module;
    return mod ? (mod.memory || (mod.instance && mod.instance.exports && mod.instance.exports.memory)) : null;
  }

  get buffer() {
    const mem = this.memory;
    return mem ? mem.buffer : null;
  }

  /**
   * Get direct Uint32Array RGBA pixel view of a layer.
   */
  getLayerPixels(layerIdx, width = 800, height = 600) {
    const mod = this.module;
    if (!mod || !this.buffer) return null;
    let ptr = 0;
    if (typeof mod.exports.w_get_layer_pixels === 'function') {
      ptr = mod.exports.w_get_layer_pixels(layerIdx);
    }
    if (!ptr) return null;
    return new Uint32Array(this.buffer, ptr, width * height);
  }

  /**
   * Get direct Uint8Array view of selection clipping mask.
   */
  getSelectionMask(width = 800, height = 600) {
    const mod = this.module;
    if (!mod || !this.buffer) return null;
    let ptr = 0;
    if (typeof mod.exports.w_get_clip_mask_buffer === 'function') {
      ptr = mod.exports.w_get_clip_mask_buffer(width * height);
    }
    if (!ptr) return null;
    return new Uint8Array(this.buffer, ptr, width * height);
  }

  /**
   * Fast pixel accessors (Color format: 0xAABBGGRR / 0xAARRGGBB according to Quadro endianness)
   */
  getPixel(layerPixels, x, y, width) {
    if (!layerPixels || x < 0 || y < 0 || x >= width) return 0;
    return layerPixels[y * width + x];
  }

  setPixel(layerPixels, x, y, width, color) {
    if (!layerPixels || x < 0 || y < 0 || x >= width) return;
    layerPixels[y * width + x] = color;
  }

  /**
   * Fast memory block fill / clear.
   */
  fillPixels(layerPixels, color) {
    if (layerPixels) layerPixels.fill(color);
  }

  /**
   * Get direct Float32Array PCM view from Audio Buffer / AudioWorklet SharedArrayBuffer.
   */
  createAudioView(sharedBuffer, byteOffset = 0, length = 128) {
    if (!sharedBuffer) return null;
    return new Float32Array(sharedBuffer, byteOffset, length);
  }
}
