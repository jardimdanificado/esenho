/**
 * =========================================================================
 * Esenho Image I/O Module
 * Pure Node.js encoding & decoding for PNG, BMP, and PPM (P6) formats
 * without external native image dependencies.
 * =========================================================================
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/** Precomputed CRC32 table for PNG chunk validation */
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

/**
 * Computes CRC32 checksum over a buffer range for PNG chunks.
 * @param {Buffer} buf - Input buffer
 * @param {number} offset - Start offset
 * @param {number} length - Number of bytes to checksum
 * @returns {number} 32-bit unsigned CRC
 */
function calcCrc32(buf, offset, length) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < length; i++) {
    crc = crcTable[(crc ^ buf[offset + i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Constructs a binary PNG chunk [4 bytes length][4 bytes type][data][4 bytes crc32].
 * @param {string} typeStr - 4-character ASCII chunk type (e.g. 'IHDR', 'IDAT', 'IEND')
 * @param {Buffer|null} dataBuf - Payload buffer or null
 * @returns {Buffer} Formatted chunk buffer
 */
function makePngChunk(typeStr, dataBuf) {
  const typeLen = 4;
  const dataLen = dataBuf ? dataBuf.length : 0;
  const chunk = Buffer.alloc(4 + typeLen + dataLen + 4);

  chunk.writeUInt32BE(dataLen, 0);
  chunk.write(typeStr, 4, 4, 'ascii');
  if (dataBuf && dataLen > 0) {
    dataBuf.copy(chunk, 8);
  }

  const crc = calcCrc32(chunk, 4, typeLen + dataLen);
  chunk.writeUInt32BE(crc, 8 + dataLen);
  return chunk;
}

/**
 * Encodes an RGBA pixel buffer (width * height * 4) into a valid PNG binary file buffer.
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {Buffer} rgbaBuffer - Raw RGBA byte buffer
 * @returns {Buffer} Encoded PNG buffer
 */
function encodePng(width, height, rgbaBuffer) {
  const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth: 8
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression: deflate
  ihdrData[11] = 0; // filter: standard
  ihdrData[12] = 0; // interlace: none
  const ihdrChunk = makePngChunk('IHDR', ihdrData);

  // Raw Scanlines with Filter 0 (None)
  const rowBytes = width * 4;
  const rawScanlines = Buffer.alloc(height * (1 + rowBytes));

  for (let y = 0; y < height; y++) {
    const rawOffset = y * (1 + rowBytes);
    rawScanlines[rawOffset] = 0; // Filter: None
    const srcOffset = y * rowBytes;
    rgbaBuffer.copy(rawScanlines, rawOffset + 1, srcOffset, srcOffset + rowBytes);
  }

  const compressedData = zlib.deflateSync(rawScanlines, { level: 6 });
  const idatChunk = makePngChunk('IDAT', compressedData);
  const iendChunk = makePngChunk('IEND', null);

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Paeth predictor algorithm for PNG unfiltering (Filter type 4).
 * Predicts current pixel value using left (a), above (b), and upper-left (c) neighbours.
 * @param {number} a - Left byte
 * @param {number} b - Upper byte
 * @param {number} c - Upper-left byte
 * @returns {number} Selected predictor byte
 */
function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decodes a binary PNG file buffer into raw RGBA pixel data.
 * Supports Grayscale (0), RGB (2), and RGBA (6) color types with standard filters (0-4).
 * @param {Buffer} buf - PNG file buffer
 * @returns {{ width: number, height: number, data: Buffer }} Decoded RGBA image
 */
function decodePng(buf) {
  // Check PNG signature
  if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
    throw new Error('Not a valid PNG file');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idatChunks = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }

  if (!width || !height) throw new Error('Invalid PNG IHDR');

  const compressed = Buffer.concat(idatChunks);
  const decompressed = zlib.inflateSync(compressed);

  const bpp = colorType === 6 ? 4 : (colorType === 2 ? 3 : (colorType === 0 ? 1 : 4));
  const rowBytes = width * bpp;
  const outRgba = Buffer.alloc(width * height * 4);

  let inOffset = 0;
  const prevRow = Buffer.alloc(rowBytes);
  const currRow = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y++) {
    const filter = decompressed[inOffset++];
    for (let i = 0; i < rowBytes; i++) {
      const raw = decompressed[inOffset++];
      const a = i >= bpp ? currRow[i - bpp] : 0;
      const b = prevRow[i];
      const c = i >= bpp ? prevRow[i - bpp] : 0;

      let val = raw;
      if (filter === 1) val = (raw + a) & 0xFF;         // Sub
      else if (filter === 2) val = (raw + b) & 0xFF;    // Up
      else if (filter === 3) val = (raw + ((a + b) >> 1)) & 0xFF; // Average
      else if (filter === 4) val = (raw + paethPredictor(a, b, c)) & 0xFF; // Paeth

      currRow[i] = val;
    }

    // Convert row to RGBA output
    const outRowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const outPix = outRowOffset + x * 4;
      if (colorType === 6) { // RGBA
        const inPix = x * 4;
        outRgba[outPix + 0] = currRow[inPix + 0];
        outRgba[outPix + 1] = currRow[inPix + 1];
        outRgba[outPix + 2] = currRow[inPix + 2];
        outRgba[outPix + 3] = currRow[inPix + 3];
      } else if (colorType === 2) { // RGB
        const inPix = x * 3;
        outRgba[outPix + 0] = currRow[inPix + 0];
        outRgba[outPix + 1] = currRow[inPix + 1];
        outRgba[outPix + 2] = currRow[inPix + 2];
        outRgba[outPix + 3] = 0xFF;
      } else if (colorType === 0) { // Grayscale
        const g = currRow[x];
        outRgba[outPix + 0] = g;
        outRgba[outPix + 1] = g;
        outRgba[outPix + 2] = g;
        outRgba[outPix + 3] = 0xFF;
      }
    }

    currRow.copy(prevRow);
  }

  return { width, height, data: outRgba };
}

/**
 * Encodes RGBA buffer into uncompressed 32-bit BMP (BGRA bottom-up format).
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Buffer} rgbaBuffer - Raw RGBA pixel buffer
 * @returns {Buffer} Formatted BMP binary buffer
 */
function encodeBmp(width, height, rgbaBuffer) {
  const rowBytes = width * 4;
  const imageSize = rowBytes * height;
  const fileSize = 54 + imageSize;

  const buf = Buffer.alloc(fileSize);

  // BITMAPFILEHEADER
  buf.write('BM', 0, 2, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);        // reserved
  buf.writeUInt32LE(54, 10);       // pixel data offset

  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, 14);       // header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);    // positive = bottom-up
  buf.writeUInt16LE(1, 26);        // planes
  buf.writeUInt16LE(32, 28);       // bits per pixel
  buf.writeUInt32LE(0, 30);        // compression (BI_RGB)
  buf.writeUInt32LE(imageSize, 34);
  buf.writeInt32LE(2835, 38);      // 72 DPI
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  // BMP bottom-up BGRA scanlines
  let dstOffset = 54;
  for (let y = height - 1; y >= 0; y--) {
    const srcRow = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const srcPix = srcRow + x * 4;
      buf[dstOffset + 0] = rgbaBuffer[srcPix + 2]; // B
      buf[dstOffset + 1] = rgbaBuffer[srcPix + 1]; // G
      buf[dstOffset + 2] = rgbaBuffer[srcPix + 0]; // R
      buf[dstOffset + 3] = rgbaBuffer[srcPix + 3]; // A
      dstOffset += 4;
    }
  }

  return buf;
}

/**
 * Decodes 24-bit or 32-bit BMP buffer into raw RGBA buffer.
 * Supports top-down and standard bottom-up row ordering.
 * @param {Buffer} buf - BMP file buffer
 * @returns {{ width: number, height: number, data: Buffer }}
 */
function decodeBmp(buf) {
  if (buf.length < 54 || buf.toString('ascii', 0, 2) !== 'BM') {
    throw new Error('Not a valid BMP file');
  }

  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);

  const height = Math.abs(rawHeight);
  const isTopDown = rawHeight < 0;

  const outRgba = Buffer.alloc(width * height * 4);
  const rowStride = Math.floor((bpp * width + 31) / 32) * 4;

  for (let y = 0; y < height; y++) {
    const srcY = isTopDown ? y : (height - 1 - y);
    const srcRowOffset = offset + srcY * rowStride;
    const dstRowOffset = y * width * 4;

    for (let x = 0; x < width; x++) {
      const dstPix = dstRowOffset + x * 4;
      if (bpp === 32) {
        const srcPix = srcRowOffset + x * 4;
        outRgba[dstPix + 0] = buf[srcPix + 2]; // R
        outRgba[dstPix + 1] = buf[srcPix + 1]; // G
        outRgba[dstPix + 2] = buf[srcPix + 0]; // B
        outRgba[dstPix + 3] = buf[srcPix + 3]; // A
      } else if (bpp === 24) {
        const srcPix = srcRowOffset + x * 3;
        outRgba[dstPix + 0] = buf[srcPix + 2]; // R
        outRgba[dstPix + 1] = buf[srcPix + 1]; // G
        outRgba[dstPix + 2] = buf[srcPix + 0]; // B
        outRgba[dstPix + 3] = 0xFF;
      }
    }
  }

  return { width, height, data: outRgba };
}

/**
 * Encodes RGBA buffer into standard binary PPM (P6) format.
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Buffer} rgbaBuffer - Raw RGBA byte buffer
 * @returns {Buffer} Formatted PPM buffer
 */
function encodePpm(width, height, rgbaBuffer) {
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii');
  const rgbData = Buffer.alloc(width * height * 3);

  let rgbOffset = 0;
  for (let i = 0; i < width * height; i++) {
    const rgbaOffset = i * 4;
    rgbData[rgbOffset++] = rgbaBuffer[rgbaOffset + 0];
    rgbData[rgbOffset++] = rgbaBuffer[rgbaOffset + 1];
    rgbData[rgbOffset++] = rgbaBuffer[rgbaOffset + 2];
  }

  return Buffer.concat([header, rgbData]);
}

/**
 * Decodes binary PPM (P6) buffer into raw RGBA buffer.
 * @param {Buffer} buf - PPM file buffer
 * @returns {{ width: number, height: number, data: Buffer }}
 */
function decodePpm(buf) {
  let pos = 0;
  function readToken() {
    while (pos < buf.length && (buf[pos] === 32 || buf[pos] === 10 || buf[pos] === 13 || buf[pos] === 9)) pos++;
    if (pos >= buf.length) return null;
    if (buf[pos] === 35) { // Comment '#'
      while (pos < buf.length && buf[pos] !== 10) pos++;
      return readToken();
    }
    const start = pos;
    while (pos < buf.length && buf[pos] > 32) pos++;
    return buf.toString('ascii', start, pos);
  }

  const magic = readToken();
  if (magic !== 'P6') throw new Error('Unsupported PPM format: ' + magic);

  const width = parseInt(readToken(), 10);
  const height = parseInt(readToken(), 10);
  const maxVal = parseInt(readToken(), 10);
  pos++; // skip single whitespace delimiter

  const outRgba = Buffer.alloc(width * height * 4);
  let srcOffset = pos;
  for (let i = 0; i < width * height; i++) {
    const dstPix = i * 4;
    outRgba[dstPix + 0] = buf[srcOffset++];
    outRgba[dstPix + 1] = buf[srcOffset++];
    outRgba[dstPix + 2] = buf[srcOffset++];
    outRgba[dstPix + 3] = 0xFF;
  }

  return { width, height, data: outRgba };
}

/**
 * Universal image export: determines format from extension (.png, .bmp, .ppm)
 * and writes the file to filesystem.
 * @param {string} filePath - Output path
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Buffer} rgbaBuffer - Raw RGBA buffer
 * @returns {{ width: number, height: number, bytes: number, format: string }}
 */
function saveImage(filePath, width, height, rgbaBuffer) {
  const ext = path.extname(filePath).toLowerCase();
  let encoded;
  if (ext === '.bmp') {
    encoded = encodeBmp(width, height, rgbaBuffer);
  } else if (ext === '.ppm') {
    encoded = encodePpm(width, height, rgbaBuffer);
  } else {
    // Default to PNG
    encoded = encodePng(width, height, rgbaBuffer);
  }

  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, encoded);
  return { width, height, bytes: encoded.length, format: ext || '.png' };
}

/**
 * Universal image loader: reads file from disk and parses PNG, BMP, or PPM format.
 * @param {string} filePath - Input path
 * @returns {{ width: number, height: number, data: Buffer }}
 */
function loadImage(filePath) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const buf = fs.readFileSync(fullPath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.bmp' || (buf[0] === 0x42 && buf[1] === 0x4D)) {
    return decodeBmp(buf);
  }
  if (ext === '.ppm' || (buf[0] === 0x50 && buf[1] === 0x36)) {
    return decodePpm(buf);
  }
  // Default attempt PNG
  return decodePng(buf);
}

module.exports = {
  encodePng,
  decodePng,
  encodeBmp,
  decodeBmp,
  encodePpm,
  decodePpm,
  saveImage,
  loadImage
};
