/**
 * =========================================================================
 * Pure JavaScript Animated GIF89a Encoder (src/anim/gif_encoder.js)
 * Standalone client-side GIF generator with palette quantization and LZW.
 * =========================================================================
 */

export class GifEncoder {
  constructor(width, height, options = {}) {
    this.width = Math.round(width);
    this.height = Math.round(height);
    this.repeat = options.repeat !== undefined ? options.repeat : 0; // 0 = infinite loop
    this.quality = options.quality || 10; // 1-30 (lower = better quality/slower)
    this.frames = [];
    this.out = [];
    this.started = false;
  }

  start() {
    this.out = [];
    this.writeString('GIF89a');
    // Logical Screen Descriptor
    this.writeShort(this.width);
    this.writeShort(this.height);
    this.writeByte(0x70); // No global color table, 8 bits/pixel resolution
    this.writeByte(0);    // Background color index
    this.writeByte(0);    // Pixel aspect ratio

    // Netscape 2.0 Loop Extension
    if (this.repeat >= 0) {
      this.writeByte(0x21); // Extension Introducer
      this.writeByte(0xff); // Application Extension
      this.writeByte(11);   // Block Size
      this.writeString('NETSCAPE2.0');
      this.writeByte(3);    // Sub-block size
      this.writeByte(1);    // Loop sub-block ID
      this.writeShort(this.repeat); // Loop count (0 = forever)
      this.writeByte(0);    // Block Terminator
    }
    this.started = true;
  }

  addFrame(ctxOrImageData, delayMs = 40) {
    if (!this.started) this.start();

    let imgData;
    if (typeof ImageData !== 'undefined' && ctxOrImageData instanceof ImageData) {
      imgData = ctxOrImageData;
    } else if (ctxOrImageData && ctxOrImageData.data) {
      imgData = ctxOrImageData;
    } else if (ctxOrImageData && typeof ctxOrImageData.getImageData === 'function') {
      imgData = ctxOrImageData.getImageData(0, 0, this.width, this.height);
    } else {
      throw new Error('Invalid frame data: expected CanvasRenderingContext2D, ImageData, or {data}');
    }

    const { palette, indexedPixels, transparentIndex } = this.quantize(imgData.data);
    const delayHundredths = Math.max(1, Math.round(delayMs / 10));

    // Graphic Control Extension
    this.writeByte(0x21); // Extension Introducer
    this.writeByte(0xf9); // Graphic Control Label
    this.writeByte(4);    // Block Size
    let packed = 0;
    let dispose = 2; // Restore to background
    if (transparentIndex !== -1) {
      packed |= 1; // Transparency flag
    }
    packed |= (dispose & 7) << 2;
    this.writeByte(packed);
    this.writeShort(delayHundredths); // Delay Time (1/100ths sec)
    this.writeByte(transparentIndex !== -1 ? transparentIndex : 0); // Transparent Color Index
    this.writeByte(0); // Block Terminator

    // Image Descriptor
    this.writeByte(0x2c); // Image Separator ','
    this.writeShort(0);   // Left
    this.writeShort(0);   // Top
    this.writeShort(this.width);
    this.writeShort(this.height);
    
    // Local Color Table Header: 1 (Local table present) | 0 (Not interlaced) | 0 (Not sorted) | 7 (256 colors)
    this.writeByte(0x87);

    // Write Local Color Table (256 * 3 = 768 bytes)
    for (let i = 0; i < 256; i++) {
      if (i < palette.length) {
        this.writeByte(palette[i][0]);
        this.writeByte(palette[i][1]);
        this.writeByte(palette[i][2]);
      } else {
        this.writeByte(0);
        this.writeByte(0);
        this.writeByte(0);
      }
    }

    // LZW Raster Data
    this.writeLzw(indexedPixels, 8);
  }

  finish() {
    if (!this.finished) {
      this.writeByte(0x3b); // GIF File Terminator ';'
      this.finished = true;
    }
    const u8 = new Uint8Array(this.out.length);
    for (let i = 0; i < this.out.length; i++) {
      u8[i] = this.out[i];
    }
    return u8;
  }

  getBlob() {
    const data = this.finish();
    return new Blob([data], { type: 'image/gif' });
  }

  // Quantizer with palette generation and color reduction
  quantize(rgba) {
    const pixelCount = this.width * this.height;
    const colorMap = new Map();
    const uniqueColors = [];
    let transparentIndex = -1;

    // Sample colors
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const a = rgba[idx + 3];
      if (a < 128) continue; // transparent
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      // 5-bit color key for palette clustering
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      if (!colorMap.has(key)) {
        const rgb = [r, g, b];
        colorMap.set(key, rgb);
        uniqueColors.push(rgb);
      }
    }

    let palette = [];
    if (uniqueColors.length === 0) {
      palette = [[0, 0, 0], [255, 255, 255]];
    } else if (uniqueColors.length <= 255) {
      palette = uniqueColors;
    } else {
      // Median cut / uniform step down to 255 colors
      const step = uniqueColors.length / 255;
      for (let i = 0; i < 255; i++) {
        palette.push(uniqueColors[Math.floor(i * step)]);
      }
    }

    // Add transparent entry if needed
    let hasAlpha = false;
    for (let i = 0; i < pixelCount; i++) {
      if (rgba[i * 4 + 3] < 128) {
        hasAlpha = true;
        break;
      }
    }

    if (hasAlpha) {
      transparentIndex = palette.length;
      palette.push([0, 0, 0]); // dummy color for transparent slot
    }

    // Map pixels to closest palette index
    const indexedPixels = new Uint8Array(pixelCount);
    const lookupCache = new Map();

    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      if (rgba[idx + 3] < 128) {
        indexedPixels[i] = transparentIndex;
        continue;
      }
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const cacheKey = (r << 16) | (g << 8) | b;
      let bestIndex = lookupCache.get(cacheKey);
      if (bestIndex === undefined) {
        let minDist = Infinity;
        bestIndex = 0;
        const searchLen = hasAlpha ? palette.length - 1 : palette.length;
        for (let p = 0; p < searchLen; p++) {
          const pr = palette[p][0];
          const pg = palette[p][1];
          const pb = palette[p][2];
          const dr = r - pr;
          const dg = g - pg;
          const db = b - pb;
          // Euclidean squared distance with perceptual weighting
          const dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
          if (dist < minDist) {
            minDist = dist;
            bestIndex = p;
            if (dist === 0) break;
          }
        }
        lookupCache.set(cacheKey, bestIndex);
      }
      indexedPixels[i] = bestIndex;
    }

    return { palette, indexedPixels, transparentIndex };
  }

  // Standard GIF LZW compression algorithm
  writeLzw(pixels, minCodeSize) {
    this.writeByte(minCodeSize);
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let maxCode = 1 << codeSize;

    let dict = new Map();
    const resetDict = () => {
      dict.clear();
      for (let i = 0; i < clearCode; i++) {
        dict.set(String.fromCharCode(i), i);
      }
      codeSize = minCodeSize + 1;
      maxCode = 1 << codeSize;
    };

    resetDict();

    let curBits = 0;
    let curVal = 0;
    const packet = [];

    const emitBits = (code) => {
      curVal |= code << curBits;
      curBits += codeSize;
      while (curBits >= 8) {
        packet.push(curVal & 0xff);
        curVal >>= 8;
        curBits -= 8;
        if (packet.length === 254) {
          this.writeByte(254);
          for (let b = 0; b < packet.length; b++) this.writeByte(packet[b]);
          packet.length = 0;
        }
      }
    };

    const flushBits = () => {
      if (curBits > 0) {
        packet.push(curVal & 0xff);
      }
      if (packet.length > 0) {
        this.writeByte(packet.length);
        for (let b = 0; b < packet.length; b++) this.writeByte(packet[b]);
        packet.length = 0;
      }
      this.writeByte(0); // Block terminator
    };

    emitBits(clearCode);

    let prefix = '';
    let nextAvailableCode = eoiCode + 1;

    for (let i = 0; i < pixels.length; i++) {
      const c = String.fromCharCode(pixels[i]);
      const combined = prefix + c;
      if (dict.has(combined)) {
        prefix = combined;
      } else {
        emitBits(dict.get(prefix));
        if (nextAvailableCode < 4096) {
          dict.set(combined, nextAvailableCode++);
          if (nextAvailableCode > maxCode && codeSize < 12) {
            codeSize++;
            maxCode = 1 << codeSize;
          }
        } else {
          emitBits(clearCode);
          resetDict();
          nextAvailableCode = eoiCode + 1;
        }
        prefix = c;
      }
    }

    if (prefix.length > 0) {
      emitBits(dict.get(prefix));
    }
    emitBits(eoiCode);
    flushBits();
  }

  writeByte(b) {
    this.out.push(b & 0xff);
  }

  writeShort(s) {
    this.out.push(s & 0xff);
    this.out.push((s >> 8) & 0xff);
  }

  writeString(str) {
    for (let i = 0; i < str.length; i++) {
      this.out.push(str.charCodeAt(i) & 0xff);
    }
  }
}
