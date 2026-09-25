/**
 * Esenho Asset Bundle Engine v1.0
 * Portable SVG-based archive format for brushes, WASM plugins, projects, and palettes.
 * Fully valid SVG containing rendered preview badge + <metadata> + embedded WASM in <defs>.
 */

(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./project_store.js"));
  } else {
    root.EsenhoBundle = factory(root.EsenhoStore);
  }
})(typeof self !== "undefined" ? self : this, function(EsenhoStore) {
  "use strict";

  function bytesToBase64(u8) {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString("base64");
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

  function escapeXml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  const EsenhoBundle = {
    /**
     * Creates a valid SVG Asset Bundle string containing selected items.
     * @param {Object} options
     * @param {string} [options.title]
     * @param {string} [options.author]
     * @param {Object} [options.brushes] - Map of { [brushKey]: brushConfig }
     * @param {Array<{name: string, bytes: Uint8Array}>} [options.plugins] - WASM plugins
     * @param {Array<Object>} [options.projects] - Array of full project objects
     * @param {Object} [options.palettes] - Map of palettes
     * @param {Object} [options.textures] - Map of { [id]: { name, width, height, dataUrl } }
     * @param {Object} [options.tipShapes] - Map of { [id]: { name, width, height, dataUrl } }
     * @returns {string} XML SVG string
     */
    createBundle(options = {}) {
      const title = options.title || "Esenho Asset Bundle";
      const author = options.author || "Wesenho User";
      const createdAt = new Date().toISOString();
      const brushes = options.brushes || {};
      const plugins = options.plugins || [];
      const projects = options.projects || [];
      const palettes = options.palettes || {};
      const textures = options.textures || {};
      const tipShapes = options.tipShapes || {};

      const brushCount = Object.keys(brushes).length;
      const pluginCount = plugins.length;
      const projectCount = projects.length;
      const paletteCount = Object.keys(palettes).length;
      const textureCount = Object.keys(textures).length;
      const tipShapeCount = Object.keys(tipShapes).length;

      // Prepare metadata payload
      const manifest = {
        format: "esenho-bundle",
        version: "1.0",
        title,
        author,
        createdAt,
        stats: {
          brushes: brushCount,
          plugins: pluginCount,
          projects: projectCount,
          palettes: paletteCount,
          textures: textureCount,
          tipShapes: tipShapeCount
        },
        brushes,
        plugins: plugins.map(p => ({ name: p.name })),
        projects,
        palettes,
        textures,
        tipShapes
      };

      // Generate <defs> with embedded WASM binaries
      let defsXml = "";
      if (pluginCount > 0) {
        defsXml += "  <defs>\n";
        for (const p of plugins) {
          if (!p.name || !p.bytes) continue;
          const b64 = bytesToBase64(p.bytes);
          defsXml += `    <script type="application/wasm" id="wasm-plugin-${escapeXml(p.name)}" data-plugin-name="${escapeXml(p.name)}">\n${b64}\n    </script>\n`;
        }
        defsXml += "  </defs>\n";
      }

      // Visual Card Layout (800x520)
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" width="800" height="520" data-esenho-bundle="1.0">
  <metadata>
    <esenho-manifest>
<![CDATA[
${JSON.stringify(manifest, null, 2)}
]]>
    </esenho-manifest>
  </metadata>
${defsXml}
  <!-- Background Card -->
  <rect width="800" height="520" rx="16" fill="#18191c" stroke="#2c2d30" stroke-width="2" />
  
  <!-- Header Bar -->
  <rect x="0" y="0" width="800" height="90" rx="16" fill="#202124" />
  <circle cx="50" cy="45" r="22" fill="#8ec07c" />
  <text x="50" y="52" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="bold" fill="#18191c" text-anchor="middle">E</text>
  <text x="88" y="42" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="bold" fill="#fbf1c7">${escapeXml(title)}</text>
  <text x="88" y="65" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" fill="#928374">Wesenho Universal Asset Bundle • ${escapeXml(createdAt.slice(0, 10))}</text>

  <!-- Statistics Badges (Row 1: 4 boxes) -->
  <g transform="translate(30, 110)">
    <!-- Brushes Box -->
    <g transform="translate(0, 0)">
      <rect width="115" height="85" rx="8" fill="#282828" stroke="#3c3836" />
      <text x="12" y="30" font-family="sans-serif" font-size="11" fill="#a89984">BRUSHES</text>
      <text x="12" y="65" font-family="sans-serif" font-size="24" font-weight="bold" fill="#fabd2f">${brushCount}</text>
    </g>
    <!-- Plugins Box -->
    <g transform="translate(125, 0)">
      <rect width="115" height="85" rx="8" fill="#282828" stroke="#3c3836" />
      <text x="12" y="30" font-family="sans-serif" font-size="11" fill="#a89984">WASM</text>
      <text x="12" y="65" font-family="sans-serif" font-size="24" font-weight="bold" fill="#8ec07c">${pluginCount}</text>
    </g>
    <!-- Textures Box -->
    <g transform="translate(250, 0)">
      <rect width="115" height="85" rx="8" fill="#282828" stroke="#3c3836" />
      <text x="12" y="30" font-family="sans-serif" font-size="11" fill="#a89984">TEXTURES</text>
      <text x="12" y="65" font-family="sans-serif" font-size="24" font-weight="bold" fill="#fe8019">${textureCount}</text>
    </g>
    <!-- Tip Shapes Box -->
    <g transform="translate(375, 0)">
      <rect width="115" height="85" rx="8" fill="#282828" stroke="#3c3836" />
      <text x="12" y="30" font-family="sans-serif" font-size="11" fill="#a89984">TIP SHAPES</text>
      <text x="12" y="65" font-family="sans-serif" font-size="24" font-weight="bold" fill="#b8bb26">${tipShapeCount}</text>
    </g>
    <!-- Projects Box -->
    <g transform="translate(500, 0)">
      <rect width="115" height="85" rx="8" fill="#282828" stroke="#3c3836" />
      <text x="12" y="30" font-family="sans-serif" font-size="11" fill="#a89984">PROJECTS</text>
      <text x="12" y="65" font-family="sans-serif" font-size="24" font-weight="bold" fill="#83a598">${projectCount}</text>
    </g>
    <!-- Palettes Box -->
    <g transform="translate(625, 0)">
      <rect width="115" height="85" rx="8" fill="#282828" stroke="#3c3836" />
      <text x="12" y="30" font-family="sans-serif" font-size="11" fill="#a89984">PALETTES</text>
      <text x="12" y="65" font-family="sans-serif" font-size="24" font-weight="bold" fill="#d3869b">${paletteCount}</text>
    </g>
  </g>

  <!-- Item Summary Lists -->
  <g transform="translate(30, 215)">
    <rect width="740" height="240" rx="10" fill="#202124" stroke="#2c2d30" />
    <text x="24" y="34" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ebdbb2">Package Manifest</text>
    <text x="24" y="62" font-family="monospace" font-size="11" fill="#a89984">Brushes: ${escapeXml(Object.keys(brushes).join(', ') || '(none)')}</text>
    <text x="24" y="86" font-family="monospace" font-size="11" fill="#a89984">Plugins: ${escapeXml(plugins.map(p => p.name).join(', ') || '(none)')}</text>
    <text x="24" y="110" font-family="monospace" font-size="11" fill="#a89984">Textures: ${escapeXml(Object.keys(textures).join(', ') || '(none)')}</text>
    <text x="24" y="134" font-family="monospace" font-size="11" fill="#a89984">Tip Shapes: ${escapeXml(Object.keys(tipShapes).join(', ') || '(none)')}</text>
    <text x="24" y="158" font-family="monospace" font-size="11" fill="#a89984">Projects: ${escapeXml(projects.map(p => p.name || p.id).join(', ') || '(none)')}</text>
    <text x="24" y="195" font-family="monospace" font-size="11" fill="#665c54">Drag &amp; drop this SVG into Wesenho Studio or Painter to unpack.</text>
  </g>

  <!-- Footer -->
  <text x="400" y="495" font-family="sans-serif" font-size="11" fill="#504945" text-anchor="middle">Wesenho Universal Vector &amp; Raster Graphics Environment</text>
</svg>`;

      return svg;
    },

    /**
     * Parses an SVG bundle string and extracts manifest and binaries.
     * @param {string} svgContent
     * @returns {Object|null} Parsed bundle data or null if invalid
     */
    parseBundle(svgContent) {
      if (!svgContent || typeof svgContent !== "string") return null;

      // Extract metadata JSON
      let manifest = null;
      const cdataMatch = svgContent.match(/<metadata>[\s\S]*?<esenho-manifest>[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]>[\s\S]*?<\/esenho-manifest>[\s\S]*?<\/metadata>/i);
      if (cdataMatch && cdataMatch[1]) {
        try {
          manifest = JSON.parse(cdataMatch[1].trim());
        } catch (_) {}
      } else {
        // Fallback search for JSON inside metadata
        const metaMatch = svgContent.match(/<metadata>([\s\S]*?)<\/metadata>/i);
        if (metaMatch && metaMatch[1]) {
          try {
            const raw = metaMatch[1].replace(/<[^>]+>/g, "").trim();
            manifest = JSON.parse(raw);
          } catch (_) {}
        }
      }

      if (!manifest || manifest.format !== "esenho-bundle") {
        return null;
      }

      // Extract embedded WASM plugins from <script type="application/wasm">
      const plugins = [];
      const scriptRegex = /<script\s+[^>]*type=["']application\/wasm["'][^>]*data-plugin-name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      while ((match = scriptRegex.exec(svgContent)) !== null) {
        const name = match[1].trim().toLowerCase();
        const b64 = match[2].trim();
        try {
          const bytes = base64ToBytes(b64);
          plugins.push({ name, bytes });
        } catch (e) {
          console.warn(`Failed to decode WASM plugin "${name}":`, e);
        }
      }

      return {
        format: manifest.format,
        version: manifest.version,
        title: manifest.title || "Esenho Asset Bundle",
        author: manifest.author || "Unknown",
        createdAt: manifest.createdAt || new Date().toISOString(),
        stats: manifest.stats || {},
        brushes: manifest.brushes || {},
        plugins,
        projects: manifest.projects || [],
        palettes: manifest.palettes || {},
        textures: manifest.textures || {},
        tipShapes: manifest.tipShapes || {}
      };
    },

    /**
     * Imports selected items from a parsed bundle into local storage and IndexedDB.
     * @param {Object} bundleData - Parsed bundle object
     * @param {Object} [selection] - { brushes, plugins, projects, palettes, textures, tipShapes }
     * @returns {Promise<{brushes: number, plugins: number, projects: number, palettes: number, textures: number, tipShapes: number}>}
     */
    async importBundle(bundleData, selection = {}) {
      if (!bundleData) throw new Error("Invalid bundle data");
      const store = EsenhoStore || (typeof window !== "undefined" ? window.EsenhoStore : null);
      const results = { brushes: 0, plugins: 0, projects: 0, palettes: 0, textures: 0, tipShapes: 0 };

      // 1. Import Brushes
      if (bundleData.brushes && selection.brushes !== false) {
        const allowed = Array.isArray(selection.brushes) ? new Set(selection.brushes) : null;
        for (const [key, bConfig] of Object.entries(bundleData.brushes)) {
          if (allowed && !allowed.has(key)) continue;
          const name = bConfig.name || key;
          if (store && store.saveCustomBrushPreset) {
            store.saveCustomBrushPreset(name, bConfig);
            results.brushes++;
          }
        }
      }

      // 2. Import WASM Plugins
      if (bundleData.plugins && selection.plugins !== false) {
        const allowed = Array.isArray(selection.plugins) ? new Set(selection.plugins) : null;
        for (const p of bundleData.plugins) {
          if (allowed && !allowed.has(p.name)) continue;
          if (store && store.savePlugin) {
            await store.savePlugin(p.name, p.bytes);
            results.plugins++;
          }
        }
      }

      // 3. Import Custom Textures
      if (bundleData.textures && selection.textures !== false) {
        const allowed = Array.isArray(selection.textures) ? new Set(selection.textures) : null;
        for (const [id, tex] of Object.entries(bundleData.textures)) {
          if (allowed && !allowed.has(id)) continue;
          if (store && store.saveCustomTexture) {
            await store.saveCustomTexture(id, tex);
            results.textures++;
          }
        }
      }

      // 4. Import Custom Tip Shapes
      if (bundleData.tipShapes && selection.tipShapes !== false) {
        const allowed = Array.isArray(selection.tipShapes) ? new Set(selection.tipShapes) : null;
        for (const [id, shape] of Object.entries(bundleData.tipShapes)) {
          if (allowed && !allowed.has(id)) continue;
          if (store && store.saveCustomTipShape) {
            await store.saveCustomTipShape(id, shape);
            results.tipShapes++;
          }
        }
      }

      // 5. Import Projects
      if (bundleData.projects && selection.projects !== false) {
        const allowed = Array.isArray(selection.projects) ? new Set(selection.projects) : null;
        for (const proj of bundleData.projects) {
          const id = proj.id || proj.name;
          if (allowed && !allowed.has(id)) continue;
          if (store && store.saveProject) {
            await store.saveProject(proj);
            results.projects++;
          }
        }
      }

      // 6. Import Palettes
      if (bundleData.palettes && selection.palettes !== false) {
        const allowed = Array.isArray(selection.palettes) ? new Set(selection.palettes) : null;
        if (typeof localStorage !== "undefined") {
          try {
            const currentPalettes = JSON.parse(localStorage.getItem("esenho_custom_palettes_v1") || "{}");
            for (const [palName, colors] of Object.entries(bundleData.palettes)) {
              if (allowed && !allowed.has(palName)) continue;
              currentPalettes[palName] = colors;
              results.palettes++;
            }
            localStorage.setItem("esenho_custom_palettes_v1", JSON.stringify(currentPalettes));
          } catch (_) {}
        }
      }

      return results;
    }
  };

  return EsenhoBundle;
});
