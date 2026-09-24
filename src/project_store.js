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
  const DB_VERSION = 1;
  const STORE_PROJECTS = "projects";

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
    const in32 = new Uint32Array(u8Array.buffer, u8Array.byteOffset, Math.floor(u8Array.byteLength / 4));
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
      const rawU8 = new Uint8Array(pixelsU32.buffer, pixelsU32.byteOffset, width * height * 4);
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

  /* ── Project Storage API ── */
  const EsenhoStore = {
    bytesToBase64,
    base64ToBytes,
    rleEncodeU32,
    rleDecodeU32,
    generateThumbnailDataUrl,

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
        } catch (_) {}
      }
      if (!db) return true;

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, "readwrite");
        const store = tx.objectStore(STORE_PROJECTS);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = e => reject(e.target.error);
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
    }
  };

  return EsenhoStore;
});
