/**
 * Esenho Project Storage & .esen Savefile Specification v1.0
 * Provides IndexedDB persistence, base64 layer chunking, thumbnail generation,
 * and project export/import across browser and Node.js environments.
 */

(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EsenhoStore = factory();
  }
})(typeof self !== "undefined" ? self : this, function() {
  "use strict";

  const DB_NAME = "EsenhoDB";
  const DB_VERSION = 3;
  const STORE_PROJECTS = "projects";
  const STORE_PLUGINS = "plugins";
  const STORE_TEXTURES = "textures";
  const STORE_TIP_SHAPES = "tip_shapes";

  let dbPromise = null;

  function getDB() {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
            const store = db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
            store.createIndex("updatedAt", "updatedAt", { unique: false });
            store.createIndex("name", "name", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_PLUGINS)) {
            const store = db.createObjectStore(STORE_PLUGINS, { keyPath: "name" });
            store.createIndex("updatedAt", "updatedAt", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_TEXTURES)) {
            const store = db.createObjectStore(STORE_TEXTURES, { keyPath: "id" });
            store.createIndex("updatedAt", "updatedAt", { unique: false });
            store.createIndex("name", "name", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_TIP_SHAPES)) {
            const store = db.createObjectStore(STORE_TIP_SHAPES, { keyPath: "id" });
            store.createIndex("updatedAt", "updatedAt", { unique: false });
            store.createIndex("name", "name", { unique: false });
          }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
      });
    }
    return dbPromise;
  }

  /* ── Base64 ArrayBuffer helpers ── */
  function bytesToBase64(u8) {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString("base64");
    }
    if (typeof Uint8Array.prototype.toBase64 === "function") {
      try { return u8.toBase64(); } catch (_) {}
    }
    let binary = "";
    const len = u8.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = u8.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(b64, "base64");
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    if (typeof Uint8Array.fromBase64 === "function") {
      try { return Uint8Array.fromBase64(b64); } catch (_) {}
    }
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    const step = 65536;
    for (let i = 0; i < len; i += step) {
      const end = Math.min(i + step, len);
      for (let j = i; j < end; j++) {
        bytes[j] = binary.charCodeAt(j);
      }
    }
    return bytes;
  }

  /* ── 32-bit RLE Compression Helpers ── */
  function rleEncodeU32(u32Array) {
    const len = u32Array.length;
    if (len === 0) return new Uint8Array(0);
    let chunks = new Uint32Array(Math.min(len * 2, 262144));
    let chunkCount = 0;
    let curVal = u32Array[0];
    let curCount = 0;
    for (let i = 0; i < len; i++) {
      const val = u32Array[i];
      if (val === curVal && curCount < 0xFFFFFFFF) {
        curCount++;
      } else {
        if (chunkCount + 2 > chunks.length) {
          const next = new Uint32Array(chunks.length * 2);
          next.set(chunks);
          chunks = next;
        }
        chunks[chunkCount++] = curCount;
        chunks[chunkCount++] = curVal;
        curVal = val;
        curCount = 1;
      }
    }
    if (chunkCount + 2 > chunks.length) {
      const next = new Uint32Array(chunks.length + 2);
      next.set(chunks);
      chunks = next;
    }
    chunks[chunkCount++] = curCount;
    chunks[chunkCount++] = curVal;
    return new Uint8Array(chunks.buffer, chunks.byteOffset, chunkCount * 4);
  }

  function rleDecodeU32(u8Array, totalPixels) {
    if (!u8Array || u8Array.length === 0) return new Uint32Array(totalPixels);
    let in32;
    if (u8Array.byteOffset % 4 === 0) {
      in32 = new Uint32Array(u8Array.buffer, u8Array.byteOffset, Math.floor(u8Array.byteLength / 4));
    } else {
      const copy = new Uint8Array(u8Array.byteLength);
      copy.set(u8Array);
      in32 = new Uint32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4));
    }
    const out = new Uint32Array(totalPixels);
    let outIdx = 0;
    const inLen = in32.length;
    for (let i = 0; i < inLen; i += 2) {
      const count = in32[i];
      const val = in32[i + 1];
      const end = Math.min(totalPixels, outIdx + count);
      out.fill(val, outIdx, end);
      outIdx += count;
      if (outIdx >= totalPixels) break;
    }
    return out;
  }

  /* ── Fast Thumbnail Generator ── */
  function generateThumbnailDataUrl(pixelsU32, width, height, maxThumbSize = 220) {
    if (typeof document === "undefined" || !pixelsU32 || width <= 0 || height <= 0) return "";
    try {
      const scale = Math.min(1, maxThumbSize / Math.max(width, height));
      const tw = Math.max(1, Math.round(width * scale));
      const th = Math.max(1, Math.round(height * scale));

      // Source canvas
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = width;
      srcCanvas.height = height;
      const sctx = srcCanvas.getContext("2d");
      const imgData = sctx.createImageData(width, height);
      const rawU8 = (pixelsU32.byteOffset % 4 === 0)
        ? new Uint8Array(pixelsU32.buffer, pixelsU32.byteOffset, Math.min(pixelsU32.byteLength, width * height * 4))
        : new Uint8Array(pixelsU32.slice().buffer);
      imgData.data.set(rawU8);
      sctx.putImageData(imgData, 0, 0);

      // Scaled thumbnail canvas
      const dstCanvas = document.createElement("canvas");
      dstCanvas.width = tw;
      dstCanvas.height = th;
      const dctx = dstCanvas.getContext("2d");
      dctx.imageSmoothingEnabled = true;
      dctx.imageSmoothingQuality = "high";
      dctx.drawImage(srcCanvas, 0, 0, tw, th);

      return dstCanvas.toDataURL("image/png", 0.85);
    } catch (e) {
      console.warn("Thumbnail generation failed:", e);
      return "";
    }
  }

  /* ── Full Composite Renderers ── */
  function compositeRasterProjectToDataUrl(project) {
    if (!project || !project.width || !project.height || typeof document === 'undefined') return '';
    const canvas = document.createElement('canvas');
    canvas.width = project.width;
    canvas.height = project.height;
    const ctx = canvas.getContext('2d');
    const totalPixels = project.width * project.height;

    for (const layer of (project.layers || [])) {
      if (layer.visible === false || layer.visible === 0) continue;
      const lw = layer.width || project.width;
      const lh = layer.height || project.height;
      const layerPixels = lw * lh;
      let u32 = null;

      if (layer.encoding === 'empty') {
        continue;
      } else if (layer.encoding === 'solid') {
        const col = (layer.color !== undefined) ? (layer.color >>> 0) : 0;
        if (col === 0) continue;
        u32 = new Uint32Array(layerPixels);
        u32.fill(col);
      } else if (layer.encoding === 'rle32' || layer.encoding === 'rle32_b64') {
        const raw = layer.pixels || layer.pixelsBase64 || layer.data;
        if (raw && typeof raw === 'string') {
          const rawBytes = base64ToBytes(raw);
          u32 = rleDecodeU32(rawBytes, layerPixels);
        } else if (raw instanceof Uint8Array) {
          u32 = rleDecodeU32(raw, layerPixels);
        }
      } else if (layer.encoding === 'raw' || layer.pixels || layer.pixelsBase64 || layer.data) {
        const raw = layer.pixels || layer.pixelsBase64 || layer.data;
        if (typeof raw === 'string') {
          const u8 = base64ToBytes(raw);
          if (u8.byteOffset % 4 === 0) {
            u32 = new Uint32Array(u8.buffer, u8.byteOffset, Math.min(layerPixels, Math.floor(u8.byteLength / 4)));
          } else {
            const copy = new Uint8Array(u8.byteLength);
            copy.set(u8);
            u32 = new Uint32Array(copy.buffer, 0, Math.min(layerPixels, Math.floor(copy.byteLength / 4)));
          }
        } else if (raw instanceof Uint32Array) {
          u32 = raw;
        } else if (Array.isArray(raw)) {
          u32 = new Uint32Array(raw);
        }
      }

      if (u32 && u32.length > 0) {
        const lcvs = document.createElement('canvas');
        lcvs.width = lw;
        lcvs.height = lh;
        const lctx = lcvs.getContext('2d');
        const imgData = lctx.createImageData(lw, lh);
        
        const srcU8 = (u32.byteOffset % 4 === 0)
          ? new Uint8Array(u32.buffer, u32.byteOffset, Math.min(u32.byteLength, lw * lh * 4))
          : new Uint8Array(u32.slice().buffer);
        imgData.data.set(srcU8);
        lctx.putImageData(imgData, 0, 0);

        ctx.save();
        ctx.globalAlpha = (layer.opacity !== undefined ? layer.opacity : 255) / 255;
        if (lw === project.width && lh === project.height) {
          ctx.drawImage(lcvs, 0, 0);
        } else {
          ctx.drawImage(lcvs, 0, 0, project.width, project.height);
        }
        ctx.restore();
      }
    }
    return canvas.toDataURL('image/png');
  }

  async function compositeVectorProjectToDataUrl(project) {
    if (!project || typeof document === 'undefined') return '';
    let svgStr = project.svgData || '';
    if (!svgStr && project.jsonDoc && typeof SvgEngine !== 'undefined') {
      try {
        const docObj = new SvgEngine.SvgDocument(project.width || 800, project.height || 600);
        docObj.loadJSON(project.jsonDoc);
        svgStr = docObj.toSVGString();
      } catch (_) {}
    }
    if (!svgStr) return project.thumbnail || '';
    
    return new Promise((resolve) => {
      const img = new Image();
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = project.width || img.width || 800;
        canvas.height = project.height || img.height || 600;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(project.thumbnail || '');
      };
      img.src = url;
    });
  }

  /* ── Project Storage API ── */
  const EsenhoStore = {
    bytesToBase64,
    base64ToBytes,
    rleEncodeU32,
    rleDecodeU32,
    generateThumbnailDataUrl,
    compositeRasterProjectToDataUrl,
    compositeVectorProjectToDataUrl,

    async saveProject(project) {
      if (!project || !project.id) throw new Error("Invalid project structure");
      project.updatedAt = new Date().toISOString();
      if (!project.createdAt) project.createdAt = project.updatedAt;

      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          try {
            const list = JSON.parse(localStorage.getItem("esenho_projects_meta") || "[]");
            const idx = list.findIndex(p => p.id === project.id);
            const meta = {
              id: project.id,
              name: project.name,
              width: project.width,
              height: project.height,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
              thumbnail: project.thumbnail || ""
            };
            if (idx >= 0) list[idx] = meta;
            else list.unshift(meta);
            localStorage.setItem("esenho_projects_meta", JSON.stringify(list));
            localStorage.setItem("esenho_proj_" + project.id, JSON.stringify(project));
          } catch (e) {
            console.warn("LocalStorage save fallback error:", e);
          }
        }
        return project.id;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, "readwrite");
        const store = tx.objectStore(STORE_PROJECTS);
        const req = store.put(project);
        req.onsuccess = () => resolve(project.id);
        req.onerror = e => reject(e.target.error);
      });
    },

    async getProject(id) {
      if (!id) return null;
      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          const raw = localStorage.getItem("esenho_proj_" + id);
          return raw ? JSON.parse(raw) : null;
        }
        return null;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, "readonly");
        const store = tx.objectStore(STORE_PROJECTS);
        const req = store.get(id);
        req.onsuccess = e => resolve(e.target.result || null);
        req.onerror = e => reject(e.target.error);
      });
    },

    async listProjects() {
      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          try {
            return JSON.parse(localStorage.getItem("esenho_projects_meta") || "[]");
          } catch (_) {
            return [];
          }
        }
        return [];
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, "readonly");
        const store = tx.objectStore(STORE_PROJECTS);
        const list = [];
        const req = store.openCursor();
        req.onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) {
            const p = cursor.value;
            list.push({
              id: p.id,
              type: p.type || (p.layers ? "raster" : "vector"),
              name: p.name || "Untitled Project",
              width: p.width || 1280,
              height: p.height || 720,
              createdAt: p.createdAt || p.updatedAt,
              updatedAt: p.updatedAt || new Date().toISOString(),
              thumbnail: p.thumbnail || "",
              layerCount: (p.layers && p.layers.length) || (p.objects && p.objects.length) || 0
            });
            cursor.continue();
          } else {
            list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            resolve(list);
          }
        };
        req.onerror = e => reject(e.target.error);
      });
    },

    async renameProject(id, newName) {
      if (!id || !newName) return false;
      const proj = await this.getProject(id);
      if (!proj) return false;
      proj.name = newName.trim();
      proj.updatedAt = new Date().toISOString();
      await this.saveProject(proj);
      return true;
    },

    async deleteProject(id) {
      if (!id) return false;
      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem("esenho_proj_" + id);
          const list = JSON.parse(localStorage.getItem("esenho_projects_meta") || "[]").filter(p => p.id !== id);
          localStorage.setItem("esenho_projects_meta", JSON.stringify(list));
        }
        return true;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, "readwrite");
        const store = tx.objectStore(STORE_PROJECTS);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = e => reject(e.target.error);
      });
    },

    async clearAll() {
      const db = await getDB();
      if (typeof localStorage !== "undefined") {
        try {
          const meta = JSON.parse(localStorage.getItem("esenho_projects_meta") || "[]");
          for (const p of meta) {
            localStorage.removeItem("esenho_proj_" + p.id);
          }
          localStorage.removeItem("esenho_projects_meta");
          localStorage.removeItem("esenho_vector_autosave");
          localStorage.removeItem("esenho_current_vector_project_id");
          localStorage.removeItem("esenho_current_raster_project_id");
          localStorage.removeItem("esenho_custom_textures_meta");
          localStorage.removeItem("esenho_custom_tip_shapes_meta");
          localStorage.removeItem("esenho_custom_brush_presets_v1");
        } catch (_) {}
      }
      if (this._nodeProjects) this._nodeProjects.clear();
      if (this._nodePlugins) this._nodePlugins.clear();
      if (this._nodeTextures) this._nodeTextures.clear();
      if (this._nodeTipShapes) this._nodeTipShapes.clear();
      if (this._nodeBrushPresets) this._nodeBrushPresets = {};
      if (!db) return true;

      return new Promise((resolve, reject) => {
        const stores = [STORE_PROJECTS, STORE_PLUGINS, STORE_TEXTURES, STORE_TIP_SHAPES].filter(s => db.objectStoreNames.contains(s));
        if (stores.length === 0) return resolve(true);
        const tx = db.transaction(stores, "readwrite");
        stores.forEach(s => tx.objectStore(s).clear());
        tx.oncomplete = () => resolve(true);
        tx.onerror = e => reject(e.target.error);
      });
    },

    /* ── Export & Import .esen file ── */
    exportEsenFile(project, filename) {
      if (!project) throw new Error("No project provided for export");
      const jsonStr = JSON.stringify(project, null, 2);
      const safeName = (filename || project.name || "project").replace(/[/\\?%*:|"<>]/g, "_");
      const dlName = safeName.endsWith(".esen") ? safeName : (safeName + ".esen");

      if (typeof document !== "undefined") {
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = dlName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { ok: true, filename: dlName };
      }
      return { ok: true, json: jsonStr, filename: dlName };
    },

    async importEsenFile(fileOrString) {
      let jsonText = "";
      if (typeof fileOrString === "string") {
        jsonText = fileOrString;
      } else if (fileOrString && typeof fileOrString.text === "function") {
        jsonText = await fileOrString.text();
      } else {
        throw new Error("Unsupported file input for .esen import");
      }

      const parsed = JSON.parse(jsonText);
      if (parsed.magic !== "ESENHO" && parsed.magic !== "ESEN") {
        throw new Error("Invalid .esen savefile: missing ESENHO header");
      }
      if (!parsed.width || !parsed.height || !Array.isArray(parsed.layers)) {
        throw new Error("Corrupted .esen savefile structure");
      }
      return parsed;
    },

    /* ── Custom WASM Plugin Storage ── */
    async savePlugin(name, bytes) {
      if (!name) throw new Error("Plugin name required");
      const u8 = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
      const db = await getDB();
      const record = {
        name: name.toLowerCase(),
        bytes: u8,
        updatedAt: Date.now()
      };

      if (!db) {
        if (typeof localStorage !== "undefined") {
          try {
            const b64 = bytesToBase64(u8);
            localStorage.setItem("esenho_plugin_" + record.name, b64);
            const list = JSON.parse(localStorage.getItem("esenho_plugins_meta") || "[]");
            if (!list.includes(record.name)) {
              list.push(record.name);
              localStorage.setItem("esenho_plugins_meta", JSON.stringify(list));
            }
          } catch (_) {}
        } else {
          if (!this._nodePlugins) this._nodePlugins = new Map();
          this._nodePlugins.set(record.name, record);
        }
        return record;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PLUGINS, "readwrite");
        const store = tx.objectStore(STORE_PLUGINS);
        const req = store.put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = e => reject(e.target.error);
      });
    },

    async getAllPlugins() {
      const db = await getDB();
      if (!db) {
        const list = [];
        if (typeof localStorage !== "undefined") {
          try {
            const names = JSON.parse(localStorage.getItem("esenho_plugins_meta") || "[]");
            for (const name of names) {
              const b64 = localStorage.getItem("esenho_plugin_" + name);
              if (b64) {
                list.push({ name, bytes: base64ToBytes(b64), updatedAt: Date.now() });
              }
            }
          } catch (_) {}
        } else if (this._nodePlugins) {
          for (const rec of this._nodePlugins.values()) {
            list.push(rec);
          }
        }
        return list;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PLUGINS, "readonly");
        const store = tx.objectStore(STORE_PLUGINS);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = e => reject(e.target.error);
      });
    },

    async deletePlugin(name) {
      const safeName = (name || "").toLowerCase();
      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          try {
            localStorage.removeItem("esenho_plugin_" + safeName);
            const list = JSON.parse(localStorage.getItem("esenho_plugins_meta") || "[]").filter(n => n !== safeName);
            localStorage.setItem("esenho_plugins_meta", JSON.stringify(list));
          } catch (_) {}
        } else if (this._nodePlugins) {
          this._nodePlugins.delete(safeName);
        }
        return true;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PLUGINS, "readwrite");
        const store = tx.objectStore(STORE_PLUGINS);
        const req = store.delete(safeName);
        req.onsuccess = () => resolve(true);
        req.onerror = e => reject(e.target.error);
      });
    },

    /* ── Shared Brush Presets ── */
    getCustomBrushPresets() {
      if (typeof localStorage === "undefined") {
        return this._nodeBrushPresets || {};
      }
      try {
        const stored = localStorage.getItem("esenho_custom_brush_presets_v1");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === "object") return parsed;
        }
      } catch (_) {}
      return {};
    },

    saveCustomBrushPreset(name, presetData) {
      if (!name) return false;
      const key = name.trim().toLowerCase().replace(/\s+/g, "_");
      const current = this.getCustomBrushPresets();
      current[key] = {
        name: name.trim(),
        desc: presetData.desc || "Custom brush preset",
        ...JSON.parse(JSON.stringify(presetData))
      };
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem("esenho_custom_brush_presets_v1", JSON.stringify(current));
          return true;
        } catch (_) {}
      } else {
        if (!this._nodeBrushPresets) this._nodeBrushPresets = {};
        this._nodeBrushPresets[key] = current[key];
        return true;
      }
      return false;
    },

    deleteCustomBrushPreset(name) {
      if (!name) return false;
      const key = name.trim().toLowerCase().replace(/\s+/g, "_");
      const current = this.getCustomBrushPresets();
      if (current[key]) {
        delete current[key];
        if (typeof localStorage !== "undefined") {
          try {
            localStorage.setItem("esenho_custom_brush_presets_v1", JSON.stringify(current));
            return true;
          } catch (_) {}
        } else if (this._nodeBrushPresets) {
          delete this._nodeBrushPresets[key];
          return true;
        }
      }
      return false;
    },

    /* ── Custom Raster Textures ── */
    async saveCustomTexture(id, textureData) {
      if (!id || !textureData) return false;
      const safeId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const record = {
        id: safeId,
        name: textureData.name || safeId,
        width: textureData.width || 256,
        height: textureData.height || 256,
        dataUrl: textureData.dataUrl || "",
        createdAt: textureData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          try {
            localStorage.setItem("esenho_texture_" + safeId, JSON.stringify(record));
            const meta = JSON.parse(localStorage.getItem("esenho_custom_textures_meta") || "[]");
            const idx = meta.findIndex(m => m.id === safeId);
            const summary = { id: safeId, name: record.name, width: record.width, height: record.height, updatedAt: record.updatedAt };
            if (idx >= 0) meta[idx] = summary; else meta.push(summary);
            localStorage.setItem("esenho_custom_textures_meta", JSON.stringify(meta));
          } catch (_) {}
        } else {
          if (!this._nodeTextures) this._nodeTextures = new Map();
          this._nodeTextures.set(safeId, record);
        }
        return record;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TEXTURES, "readwrite");
        const store = tx.objectStore(STORE_TEXTURES);
        const req = store.put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = e => reject(e.target.error);
      });
    },

    async getCustomTexture(id) {
      if (!id) return null;
      const safeId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          try {
            const raw = localStorage.getItem("esenho_texture_" + safeId);
            return raw ? JSON.parse(raw) : null;
          } catch (_) { return null; }
        }
        return this._nodeTextures ? (this._nodeTextures.get(safeId) || null) : null;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TEXTURES, "readonly");
        const store = tx.objectStore(STORE_TEXTURES);
        const req = store.get(safeId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = e => reject(e.target.error);
      });
    },

    async listCustomTextures() {
      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          try {
            return JSON.parse(localStorage.getItem("esenho_custom_textures_meta") || "[]");
          } catch (_) { return []; }
        }
        if (this._nodeTextures) {
          return Array.from(this._nodeTextures.values()).map(t => ({
            id: t.id, name: t.name, width: t.width, height: t.height, updatedAt: t.updatedAt
          }));
        }
        return [];
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TEXTURES, "readonly");
        const store = tx.objectStore(STORE_TEXTURES);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = e => reject(e.target.error);
      });
    },

    async deleteCustomTexture(id) {
      if (!id) return false;
      const safeId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          try {
            localStorage.removeItem("esenho_texture_" + safeId);
            const list = JSON.parse(localStorage.getItem("esenho_custom_textures_meta") || "[]").filter(m => m.id !== safeId);
            localStorage.setItem("esenho_custom_textures_meta", JSON.stringify(list));
          } catch (_) {}
        } else if (this._nodeTextures) {
          this._nodeTextures.delete(safeId);
        }
        return true;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TEXTURES, "readwrite");
        const store = tx.objectStore(STORE_TEXTURES);
        const req = store.delete(safeId);
        req.onsuccess = () => resolve(true);
        req.onerror = e => reject(e.target.error);
      });
    },

    /* ── Custom Brush Tip Shapes ── */
    async saveCustomTipShape(id, tipShapeData) {
      if (!id || !tipShapeData) return false;
      const safeId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const record = {
        id: safeId,
        name: tipShapeData.name || safeId,
        width: tipShapeData.width || 64,
        height: tipShapeData.height || 64,
        dataUrl: tipShapeData.dataUrl || "",
        createdAt: tipShapeData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          try {
            localStorage.setItem("esenho_tip_shape_" + safeId, JSON.stringify(record));
            const meta = JSON.parse(localStorage.getItem("esenho_custom_tip_shapes_meta") || "[]");
            const idx = meta.findIndex(m => m.id === safeId);
            const summary = { id: safeId, name: record.name, width: record.width, height: record.height, updatedAt: record.updatedAt };
            if (idx >= 0) meta[idx] = summary; else meta.push(summary);
            localStorage.setItem("esenho_custom_tip_shapes_meta", JSON.stringify(meta));
          } catch (_) {}
        } else {
          if (!this._nodeTipShapes) this._nodeTipShapes = new Map();
          this._nodeTipShapes.set(safeId, record);
        }
        return record;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TIP_SHAPES, "readwrite");
        const store = tx.objectStore(STORE_TIP_SHAPES);
        const req = store.put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = e => reject(e.target.error);
      });
    },

    async getCustomTipShape(id) {
      if (!id) return null;
      const safeId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          try {
            const raw = localStorage.getItem("esenho_tip_shape_" + safeId);
            return raw ? JSON.parse(raw) : null;
          } catch (_) { return null; }
        }
        return this._nodeTipShapes ? (this._nodeTipShapes.get(safeId) || null) : null;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TIP_SHAPES, "readonly");
        const store = tx.objectStore(STORE_TIP_SHAPES);
        const req = store.get(safeId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = e => reject(e.target.error);
      });
    },

    async listCustomTipShapes() {
      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          try {
            return JSON.parse(localStorage.getItem("esenho_custom_tip_shapes_meta") || "[]");
          } catch (_) { return []; }
        }
        if (this._nodeTipShapes) {
          return Array.from(this._nodeTipShapes.values()).map(t => ({
            id: t.id, name: t.name, width: t.width, height: t.height, updatedAt: t.updatedAt
          }));
        }
        return [];
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TIP_SHAPES, "readonly");
        const store = tx.objectStore(STORE_TIP_SHAPES);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = e => reject(e.target.error);
      });
    },

    async deleteCustomTipShape(id) {
      if (!id) return false;
      const safeId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const db = await getDB();
      if (!db) {
        if (typeof localStorage !== "undefined") {
          try {
            localStorage.removeItem("esenho_tip_shape_" + safeId);
            const list = JSON.parse(localStorage.getItem("esenho_custom_tip_shapes_meta") || "[]").filter(m => m.id !== safeId);
            localStorage.setItem("esenho_custom_tip_shapes_meta", JSON.stringify(list));
          } catch (_) {}
        } else if (this._nodeTipShapes) {
          this._nodeTipShapes.delete(safeId);
        }
        return true;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TIP_SHAPES, "readwrite");
        const store = tx.objectStore(STORE_TIP_SHAPES);
        const req = store.delete(safeId);
        req.onsuccess = () => resolve(true);
        req.onerror = e => reject(e.target.error);
      });
    }
  };

  return EsenhoStore;
});
