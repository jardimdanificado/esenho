/**
 * =========================================================================
 * Client-side WebM (VP8) Video Muxer (src/anim/webm_muxer.js)
 * Generates frame-accurate .webm videos from Canvas WebP frames.
 * Guaranteed exact playback speed (NO slow-motion, NO dropped frames).
 * =========================================================================
 */

function toVint(num) {
  if (num < 0x7f) {
    return [0x80 | num];
  } else if (num < 0x3fff) {
    return [0x40 | (num >> 8), num & 0xff];
  } else if (num < 0x1fffff) {
    return [0x20 | (num >> 16), (num >> 8) & 0xff, num & 0xff];
  } else if (num < 0x0fffffff) {
    return [0x10 | (num >> 24), (num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
  }
  throw new Error('VINT too large: ' + num);
}

function makeEbmlElement(idBytes, dataBytes) {
  const lenBytes = toVint(dataBytes.length);
  const out = new Uint8Array(idBytes.length + lenBytes.length + dataBytes.length);
  out.set(idBytes, 0);
  out.set(lenBytes, idBytes.length);
  out.set(dataBytes, idBytes.length + lenBytes.length);
  return out;
}

function makeUintElement(idBytes, num) {
  let bytes = [];
  if (num === 0) {
    bytes = [0];
  } else {
    let temp = num;
    while (temp > 0) {
      bytes.unshift(temp & 0xff);
      temp = Math.floor(temp / 256);
    }
  }
  return makeEbmlElement(idBytes, new Uint8Array(bytes));
}

function makeStringElement(idBytes, str) {
  const u8 = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);
  return makeEbmlElement(idBytes, u8);
}

function makeFloatElement(idBytes, num) {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, num, false); // big-endian IEEE-754
  return makeEbmlElement(idBytes, new Uint8Array(buf));
}

function concatUint8Arrays(arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/**
 * Extracts raw VP8 payload from a Canvas WebP ArrayBuffer/Uint8Array
 */
export function extractVP8FromWebP(webpBytes) {
  const u8 = (webpBytes instanceof Uint8Array) ? webpBytes : new Uint8Array(webpBytes);
  // WebP RIFF header check: 'RIFF' .... 'WEBP'
  if (u8.length < 20) return null;
  const riff = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
  const webp = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]);
  if (riff !== 'RIFF' || webp !== 'WEBP') return null;

  let offset = 12;
  while (offset + 8 <= u8.length) {
    const chunkType = String.fromCharCode(u8[offset], u8[offset + 1], u8[offset + 2], u8[offset + 3]);
    const chunkSize = u8[offset + 4] | (u8[offset + 5] << 8) | (u8[offset + 6] << 16) | (u8[offset + 7] << 24);
    offset += 8;

    if (chunkType === 'VP8 ') {
      // Standard lossy VP8 keyframe
      return u8.slice(offset, offset + chunkSize);
    }
    // Advance to next chunk (padded to even boundary)
    offset += (chunkSize + (chunkSize & 1));
  }
  return null;
}

export class WebmMuxer {
  constructor(width, height, fps = 24) {
    this.width = Math.round(width);
    this.height = Math.round(height);
    this.fps = fps;
    this.frameDurationMs = 1000 / fps;
    this.frames = []; // Array of Uint8Array (VP8 chunks)
  }

  /**
   * Adds a VP8 frame chunk (extracted from WebP)
   */
  addVP8Frame(vp8Chunk) {
    if (!vp8Chunk || vp8Chunk.length === 0) {
      throw new Error('Invalid VP8 frame chunk');
    }
    this.frames.push(vp8Chunk);
  }

  /**
   * Encodes all frames into a valid standalone WebM binary Blob
   */
  getBlob() {
    const totalFrames = this.frames.length;
    const durationMs = totalFrames * this.frameDurationMs;

    // 1. EBML Header
    const ebmlHeader = makeEbmlElement([0x1a, 0x45, 0xdf, 0xa3], concatUint8Arrays([
      makeUintElement([0x42, 0x86], 1),             // EBMLVersion: 1
      makeUintElement([0x42, 0xf7], 1),             // EBMLReadVersion: 1
      makeUintElement([0x42, 0xf2], 4),             // EBMLMaxIDLength: 4
      makeUintElement([0x42, 0xf3], 8),             // EBMLMaxSizeLength: 8
      makeStringElement([0x42, 0x82], 'webm'),       // DocType: 'webm'
      makeUintElement([0x42, 0x87], 2),             // DocTypeVersion: 2
      makeUintElement([0x42, 0x85], 2)              // DocTypeReadVersion: 2
    ]));

    // 2. Segment Info
    const info = makeEbmlElement([0x15, 0x49, 0xa9, 0x66], concatUint8Arrays([
      makeUintElement([0x2a, 0xd7, 0xb1], 1000000), // TimecodeScale: 1,000,000 ns = 1 ms
      makeStringElement([0x4d, 0x80], 'Esenho WebM Muxer'), // MuxingApp
      makeStringElement([0x57, 0x41], 'Esenho Studio'),     // WritingApp
      makeFloatElement([0x44, 0x89], durationMs)             // Duration in ms
    ]));

    // 3. Tracks
    const videoSettings = makeEbmlElement([0xe0], concatUint8Arrays([
      makeUintElement([0xb0], this.width),  // PixelWidth
      makeUintElement([0xba], this.height) // PixelHeight
    ]));

    const trackEntry = makeEbmlElement([0xae], concatUint8Arrays([
      makeUintElement([0xd7], 1),              // TrackNumber: 1
      makeUintElement([0x73, 0xc5], 1),        // TrackUID: 1
      makeUintElement([0x83], 1),              // TrackType: 1 (Video)
      makeUintElement([0x9c], 0),              // FlagLacing: 0
      makeStringElement([0x86], 'V_VP8'),      // CodecID: 'V_VP8'
      videoSettings
    ]));

    const tracks = makeEbmlElement([0x16, 0x54, 0xae, 0x6b], trackEntry);

    // 4. Clusters & SimpleBlocks
    const clusters = [];
    const framesPerCluster = Math.max(1, Math.round(this.fps * 2)); // 2-second clusters
    let frameIndex = 0;

    while (frameIndex < totalFrames) {
      const clusterStartFrame = frameIndex;
      const clusterTimecodeMs = Math.round(clusterStartFrame * this.frameDurationMs);
      const clusterElements = [
        makeUintElement([0xe7], clusterTimecodeMs) // Cluster Timecode
      ];

      const end = Math.min(totalFrames, clusterStartFrame + framesPerCluster);
      for (let i = clusterStartFrame; i < end; i++) {
        const frameTimecodeRel = Math.round((i * this.frameDurationMs) - clusterTimecodeMs);
        const vp8Data = this.frames[i];

        // SimpleBlock Header: TrackNumber (0x81), Timecode (int16), Flags (0x80 = Keyframe)
        const blockHeader = new Uint8Array([
          0x81,
          (frameTimecodeRel >> 8) & 0xff,
          frameTimecodeRel & 0xff,
          0x80
        ]);

        const simpleBlockPayload = new Uint8Array(blockHeader.length + vp8Data.length);
        simpleBlockPayload.set(blockHeader, 0);
        simpleBlockPayload.set(vp8Data, blockHeader.length);

        clusterElements.push(makeEbmlElement([0xa3], simpleBlockPayload));
      }

      clusters.push(makeEbmlElement([0x1f, 0x43, 0xb6, 0x75], concatUint8Arrays(clusterElements)));
      frameIndex = end;
    }

    // 5. Build Final Segment
    const segmentPayload = concatUint8Arrays([info, tracks, ...clusters]);
    const segment = makeEbmlElement([0x18, 0x53, 0x80, 0x67], segmentPayload);

    const fullWebm = concatUint8Arrays([ebmlHeader, segment]);
    return new Blob([fullWebm], { type: 'video/webm' });
  }
}
