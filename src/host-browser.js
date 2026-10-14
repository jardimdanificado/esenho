/**
 * src/host-browser.js — Esenho browser host
 * Reuses all engine logic from src/esenho.js unchanged.
 * Handles: fetch WASM, canvas events, touch (draw/pan/zoom/rotate), REPL.
 */
if (typeof globalThis.process === 'undefined') {
  globalThis.process = { stdout: { write: (s) => console.log(String(s)) } };
}

const canvasEl   = document.getElementById('wcanvas');
const uiCanvasEl = document.getElementById('uicanvas');
const uiCtx      = uiCanvasEl ? uiCanvasEl.getContext('2d') : null;
let gpuRenderer  = null;
try {
  if (typeof EsenhoGPURenderer !== 'undefined' && canvasEl) {
    gpuRenderer = new EsenhoGPURenderer(canvasEl);
    if (!gpuRenderer.init()) {
      gpuRenderer = null;
    }
  }
} catch (e) {
  console.warn('[EsenhoGPU] Initialization failed, falling back to 2D canvas:', e);
  gpuRenderer = null;
}
const ctx        = (gpuRenderer && uiCtx) ? uiCtx : (canvasEl ? canvasEl.getContext('2d', { desynchronized: true }) : null);
const termEl      = document.getElementById('wterm');
const inputEl     = document.getElementById('wcmd');
const statusEl    = document.getElementById('wstatus');
const toggleBtn   = document.getElementById('toggle-panel');

/* ── Helpers ── */
function log(msg, cls = '') {
  const str = String(msg).replace(/\x1b\[[^m]*m/g, '');
  let effCls = cls;
  if (!effCls) {
    if (str.startsWith('> ')) effCls = 'cmd';
    else if (str.includes('[ok]') || str.startsWith('ok:') || str.startsWith('Ready') || str.startsWith('SUCCESS') || str.includes('loaded successfully')) effCls = 'ok';
    else if (str.startsWith('err') || str.startsWith('BOOT ERROR') || str.includes('failed') || str.includes('error')) effCls = 'err';
    else if (str.startsWith('warn')) effCls = 'warn';
    else if (str.startsWith('info:') || str.startsWith('---')) effCls = 'info';
  }

  [termEl, document.getElementById('wterm-ip')].forEach(tEl => {
    if (!tEl) return;
    const el = document.createElement('div');
    el.className = 'wterm-line';
    if (effCls) el.classList.add(effCls);
    el.textContent = str;
    tEl.appendChild(el);
    tEl.scrollTop = tEl.scrollHeight;
  });
}

let _lastStatusUpdate = 0;
let _cachedStatusText = '';

function updateStatus(hostOrX, docX, docY, force = false) {
  let host = (typeof window !== 'undefined') ? window.host : null;
  let x = 0;
  let y = 0;
  let forced = false;

  if (hostOrX && typeof hostOrX === 'object' && ('canvasActor' in hostOrX || 'zoom' in hostOrX)) {
    host = hostOrX;
    x = (typeof docX === 'number') ? docX : (host?.lastDocX ?? 0);
    y = (typeof docY === 'number') ? docY : (host?.lastDocY ?? 0);
    forced = !!force;
  } else if (typeof hostOrX === 'number') {
    x = hostOrX;
    y = (typeof docX === 'number') ? docX : 0;
    forced = (typeof docY === 'boolean') ? docY : !!force;
  } else {
    x = host?.lastDocX ?? 0;
    y = host?.lastDocY ?? 0;
    forced = (typeof hostOrX === 'boolean') ? hostOrX : ((typeof docX === 'boolean') ? docX : !!force);
  }

  if (host && typeof x === 'number' && typeof y === 'number') {
    host.lastDocX = x;
    host.lastDocY = y;
  }
  if (!forced && host && (host.isDrawingOnCanvas || host.isPanning)) return;
  const now = performance.now();
  if (!forced && now - _lastStatusUpdate < 80) return; // Max 12 updates/sec
  _lastStatusUpdate = now;

  const ver = (typeof globalThis.ESENHO_VERSION !== 'undefined' && globalThis.ESENHO_VERSION) ? `v${globalThis.ESENHO_VERSION}` : 'v0.13.81';
  const cw = host?.canvasActor?.exports?.get_canvas_width?.() ?? 0;
  const ch = host?.canvasActor?.exports?.get_canvas_height?.() ?? 0;
  const rawDeg = host ? ((host.canvasRotation * 180 / Math.PI) % 360) : 0;
  const deg = rawDeg.toFixed(1);
  const zoom = host ? (host.zoom * 100).toFixed(0) : 100;
  const proj = (host?.currentProjectName && host.currentProjectName !== 'Untitled Project') ? `${host.currentProjectName} · ` : '';
  const newText =
    `${proj}${ver}  ${cw}x${ch}  ${Math.round(x || 0)},${Math.round(y || 0)}  ` +
    `zoom ${zoom}%  rot ${deg}°`;
  if (_cachedStatusText !== newText) {
    _cachedStatusText = newText;
    if (statusEl) statusEl.textContent = newText;
  }
}



/* ── Color math helpers ── */
function hexToRgb(hex) {
  let clean = (hex || '').replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const m = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(clean);
  const r = m ? parseInt(m[1], 16) : 0;
  const g = m ? parseInt(m[2], 16) : 0;
  const b = m ? parseInt(m[3], 16) : 0;
  return {
    r, g, b,
    0: r, 1: g, 2: b,
    length: 3,
    [Symbol.iterator]: function* () { yield r; yield g; yield b; }
  };
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/* ── Boot ── */
async function main() {
  log('Loading canvas.wasm…');
  const host = new EsenhoScreenHost();
  /* canvasRotation: radians, stored on host */
  host.canvasRotation = 0;
  host.gpuRenderer = gpuRenderer;
  host.viewportFiltering = localStorage.getItem('esenho_viewport_filter') === '1';
  if (canvasEl) canvasEl.style.imageRendering = host.viewportFiltering ? 'auto' : 'pixelated';
  if (uiCanvasEl) uiCanvasEl.style.imageRendering = host.viewportFiltering ? 'auto' : 'pixelated';
  if (gpuRenderer) gpuRenderer.setFilterMode(host.viewportFiltering);
  host.renderMode = localStorage.getItem('esenho_render_mode') || 'gpu';
  host.powerSaveMode = localStorage.getItem('esenho_power_save_v2') === '1';
  host._forceNextFrame = true;
  host.render = () => {
    if (host.canvasActor && host.canvasActor.exports && typeof host.canvasActor.exports.w_render === 'function') {
      host.canvasActor.exports.w_render();
    }
    host._forceNextFrame = true;
  };
  host.sendConsoleLog = (text, color = 0xFF00FF88) =>
    log(text, color === 0xFFFF5555 ? 'err' : 'ok');

  host.canvasActor = await EsenhoModule.fromURL('plugins/canvas.wasm', { name: 'canvas' });
  const urlParams = new URLSearchParams(window.location.search);
  const isNewProjectReq = urlParams.get('new') === '1';
  const isEmbeddedMode = urlParams.get('embedded') === 'true';
  const explicitProjectId = urlParams.get('project') || urlParams.get('p') || urlParams.get('id');
  const candidateProjectId = explicitProjectId || ((!isNewProjectReq && !isEmbeddedMode) ? localStorage.getItem('esenho_last_project_id') : null);
  let projectLoaded = false;
  let hasRestoredUserPreferences = false;

  if (candidateProjectId && typeof EsenhoStore !== 'undefined') {
    try {
      const savedProj = await EsenhoStore.getProject(candidateProjectId);
      if (savedProj) {
        const isVecProj = savedProj.type === 'vector' || (!savedProj.layers && (savedProj.jsonDoc || savedProj.svgData));
        if (isVecProj) {
          if (explicitProjectId) {
            window.location.replace(`studio.html?project=${explicitProjectId}`);
            return;
          }
        } else {
          host.loadProject(savedProj);
          projectLoaded = true;
          host.currentProjectId = savedProj.id;
          host.currentProjectName = savedProj.name || 'Untitled Project';
          localStorage.setItem('esenho_last_project_id', savedProj.id);
          log(`Loaded project '${savedProj.name}' (${savedProj.width}x${savedProj.height}) [ok]`);
        }
      }
    } catch (e) {
      console.warn('Failed loading project from IndexedDB:', e);
    }
  }

  if (!projectLoaded) {
    const initW = parseInt(urlParams.get('w') || urlParams.get('width'), 10) || 1280;
    const initH = parseInt(urlParams.get('h') || urlParams.get('height'), 10) || 720;
    let bgParam = urlParams.get('bg') || urlParams.get('bgcolor') || '#fbf1c7';
    if (bgParam && !bgParam.startsWith('#')) bgParam = '#' + bgParam;

    host.canvasActor.exports.w_init(initW, initH);
    host.currentProjectId = 'proj_' + Date.now();
    host.currentProjectName = urlParams.get('name') || 'Untitled Project';

    // 1. Fill Background layer (slot 3) with chosen background color (default antique paper #fbf1c7)
    const bgColInt = parseColorString(bgParam, 0xFFC7F1FB);
    const bgPtr = host.canvasActor.exports.w_layer_get_pixels(3);
    if (bgPtr) {
      const bgPix = new Uint32Array(host.canvasActor.memory.buffer, bgPtr, initW * initH);
      bgPix.fill(bgColInt);
    }
    if (!host.layerNames) host.layerNames = new Map();
    host.layerNames.set(3, 'Background');

    // 2. Create blank drawing layer directly above Background and set it as active
    const drawLayerId = host.canvasActor.exports.w_layer_create(initW, initH);
    if (drawLayerId >= 0) {
      host.layerNames.set(drawLayerId, 'Layer 1');
      if (typeof host.canvasActor.exports.w_layer_set_visible === 'function') {
        host.canvasActor.exports.w_layer_set_visible(drawLayerId, 1);
      }
      if (typeof host.canvasActor.exports.w_layer_select === 'function') {
        host.canvasActor.exports.w_layer_select(drawLayerId);
      } else if (typeof host.canvasActor.exports.w_set_active_layer === 'function') {
        host.canvasActor.exports.w_set_active_layer(drawLayerId);
      }
    }
  }

  // Restore user preferences across sessions (both for new canvas and existing projects)
  try {
    const savedPreset = localStorage.getItem('esenho_last_brush_preset');
    if (savedPreset) host.activeBrush = savedPreset;
    const savedTex = localStorage.getItem('esenho_last_texture');
    if (savedTex) host.activeTexture = savedTex;
    const savedTool = localStorage.getItem('esenho_last_tool');
    if (savedTool !== null && savedTool !== '') {
      if (savedTool === '0') host.currentTool = 'brush';
      else if (savedTool === '1') host.currentTool = 'eraser';
      else host.currentTool = savedTool;
    }
    const savedAction = localStorage.getItem('esenho_last_action_mode');
    if (savedAction) {
      host.actionMode = savedAction;
      host.strokeIsEraser = (savedAction === 'erase') ? 1 : 0;
    }
    const savedCol = localStorage.getItem('esenho_last_color');
    if (savedCol !== null && savedCol !== '') {
      const parsedCol = parseInt(savedCol, 10) >>> 0;
      if (!isNaN(parsedCol)) {
        host.currentColor = parsedCol;
        if (host.canvasActor?.exports?.w_set_color) {
          host.canvasActor.exports.w_set_color(parsedCol);
        }
      }
    }
    const savedBP = localStorage.getItem('esenho_saved_brush_params');
    if (savedBP) {
      const parsedBP = JSON.parse(savedBP);
      if (parsedBP && typeof parsedBP === 'object') {
        for (const [k, v] of Object.entries(parsedBP)) {
          if (k === 'texture') {
            if (typeof v === 'string') host.activeTexture = v;
          } else {
            host.setBrushParam(k, v);
          }
        }
      }
    }
    const savedWandTol = localStorage.getItem('esenho_wand_tolerance');
    if (savedWandTol !== null) {
      const wt = parseInt(savedWandTol, 10);
      if (!isNaN(wt)) host.wandTolerance = wt;
    }
    const savedWandAdj = localStorage.getItem('esenho_wand_adjacent');
    if (savedWandAdj !== null) host.wandAdjacent = savedWandAdj !== '0';
    const savedSelMode = localStorage.getItem('esenho_selection_mode');
    if (savedSelMode) host.selectionMode = savedSelMode;
    const savedVecSub = localStorage.getItem('esenho_vector_sub_tool');
    if (savedVecSub) host.vectorSubTool = savedVecSub;
    const savedVecCurve = localStorage.getItem('esenho_vector_curve_mode');
    if (savedVecCurve) host.vectorCurveMode = savedVecCurve;
    const savedVecTol = localStorage.getItem('esenho_vector_fit_tol');
    if (savedVecTol !== null) {
      const vt = parseFloat(savedVecTol);
      if (!isNaN(vt)) host.vectorFitTolerance = vt;
    }
    const savedVecAdd = localStorage.getItem('esenho_vector_marquee_add');
    if (savedVecAdd !== null) host.vecMarqueeAdditive = savedVecAdd === '1';
    const savedXMode = localStorage.getItem('esenho_transform_mode');
    if (savedXMode) host.transformMode = savedXMode;
    const savedXLock = localStorage.getItem('esenho_transform_lock_aspect');
    if (savedXLock !== null) host.transformLockAspect = savedXLock === '1';
    const savedXInterp = localStorage.getItem('esenho_transform_interp');
    if (savedXInterp) host.transformInterpolation = savedXInterp;
  } catch (_) {}

  host.syncBrushParams(host.canvasActor);
  if (host.activeTexture && host.activeTexture !== 'none') {
    host.setTexture(host.activeTexture);
  }
  host.canvasActor.exports.force_composite();
  hasRestoredUserPreferences = true;
  updateStatus(host, 0, 0, true);
  log('canvas.wasm ready [ok]');

  // Initialize Frame-by-Frame Raster Animator
  try {
    const { RasterAnimator } = await import('./anim/raster_animator.js?v=2');
    const { RasterAnimatorUI } = await import('./anim/raster_animator_ui.js?v=5');
    host.rasterAnimator = new RasterAnimator(host);
    const timelineDock = document.getElementById('raster-anim-timeline-dock');
    if (timelineDock) {
      host.rasterAnimatorUI = new RasterAnimatorUI(timelineDock, host.rasterAnimator);
    }
    if (host.rasterAnimation) {
      host.rasterAnimator.fromJSON(host.rasterAnimation);
    } else {
      const savedFps = parseInt(localStorage.getItem('esenho_anim_fps'), 10);
      if (!isNaN(savedFps) && savedFps >= 1 && savedFps <= 60) host.rasterAnimator.setFps(savedFps);
      const savedLoop = localStorage.getItem('esenho_anim_loop');
      if (savedLoop !== null) host.rasterAnimator.loop = savedLoop !== '0';
      const savedOnion = localStorage.getItem('esenho_anim_onion');
      if (savedOnion !== null) host.rasterAnimator.toggleOnionSkin(savedOnion === '1');
    }
    if (host.rasterAnimatorUI && localStorage.getItem('esenho_anim_dock_visible') === '1') {
      host.rasterAnimatorUI.show();
    }
  } catch (err) {
    console.warn('[RasterAnimator] Init failed:', err);
  }

  // Asynchronously load filter plugins in parallel without blocking UI boot
  const loadPluginsAsync = async () => {
    try {
      const res = await fetch('plugins/manifest.json');
      if (res.ok) {
        const list = await res.json();
        const tasks = list.map(async (item) => {
          const file = typeof item === 'string' ? item : item.file || item.name;
          if (!file || !file.endsWith('.wasm')) return;
          const name = file.replace(/\.wasm$/i, '');
          try {
            const mod = await EsenhoModule.fromURL(`plugins/${file}`, { name });
            host.plugins.set(name, { type: 'filter', module: mod, actor: mod });
          } catch (e) {
            console.warn(`[Plugin] ${file} — ${e.message}`);
          }
        });
        await Promise.allSettled(tasks);
      }
    } catch (e) {
      console.warn('[Plugins] dynamic discovery:', e.message);
    }

    // Load custom plugins stored in shared EsenhoStore (IndexedDB)
    if (typeof EsenhoStore !== 'undefined' && EsenhoStore.getAllPlugins) {
      try {
        const customPlugins = await EsenhoStore.getAllPlugins();
        const storeTasks = customPlugins.map(async (cp) => {
          if (!cp.name || !cp.bytes || host.plugins.has(cp.name)) return;
          try {
            const mod = await EsenhoModule.fromBytes(cp.bytes, { name: cp.name });
            host.plugins.set(cp.name, { type: 'filter', module: mod, actor: mod });
          } catch (err) {
            console.warn(`[Plugin] stored ${cp.name} — ${err.message}`);
          }
        });
        await Promise.allSettled(storeTasks);
      } catch (_) {}
    }
    log(`${host.plugins.size} plugins loaded [ok]`);
    if (typeof populateFilterSelect === 'function') {
      populateFilterSelect();
    }
  };

  host.loadPluginsPromise = loadPluginsAsync();



  /* ── Canvas sizing + pan management ── */
  const isMobile = () => window.innerWidth <= 768;
  let initializedPan = false;

  let isCanvasDirty = false;
  let autosaveDebounceTimer = null;
  let _lastAutosaveBadgeText = '';
  let _cachedCanvasRect = null;

  function setAutosaveBadges(text, color) {
    if (_lastAutosaveBadgeText === text) return;
    _lastAutosaveBadgeText = text;
    ['ui-autosave-badge', 'ip-menu-autosave-badge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = text;
        el.style.color = color;
      }
    });
  }

  function scheduleAutosave(delayMs = 1500) {
    if (isEmbeddedMode) return;
    if (autosaveDebounceTimer) clearTimeout(autosaveDebounceTimer);
    autosaveDebounceTimer = setTimeout(() => {
      autosaveDebounceTimer = null;
      performAutosave(false);
    }, delayMs);
  }

  function markCanvasDirty() {
    isCanvasDirty = true;
    host._forceNextFrame = true;
    if (typeof host.requestRender === 'function') host.requestRender();
    setAutosaveBadges('Unsaved', '#fabd2f');
    scheduleAutosave(1500);
    updateStatus(host, host.lastDocX || 0, host.lastDocY || 0, false);
  }

  function markCanvasClean() {
    isCanvasDirty = false;
    setAutosaveBadges('Saved', '#b8bb26');
  }

  function saveUserPreferences() {
    if (!hasRestoredUserPreferences) return;
    try {
      if (host.currentTool !== undefined) localStorage.setItem('esenho_last_tool', String(host.currentTool));
      if (host.actionMode) localStorage.setItem('esenho_last_action_mode', host.actionMode);
      if (host.activeBrush) localStorage.setItem('esenho_last_brush_preset', String(host.activeBrush));
      if (host.activeTexture) localStorage.setItem('esenho_last_texture', String(host.activeTexture));
      if (host.currentColor !== undefined) localStorage.setItem('esenho_last_color', String(host.currentColor >>> 0));
      if (host.brushParams) localStorage.setItem('esenho_saved_brush_params', JSON.stringify(host.brushParams));
      if (host.wandTolerance !== undefined) localStorage.setItem('esenho_wand_tolerance', String(host.wandTolerance));
      if (host.wandAdjacent !== undefined) localStorage.setItem('esenho_wand_adjacent', host.wandAdjacent ? '1' : '0');
      if (host.selectionMode) localStorage.setItem('esenho_selection_mode', String(host.selectionMode));
      if (host.vectorSubTool) localStorage.setItem('esenho_vector_sub_tool', String(host.vectorSubTool));
      if (host.vectorCurveMode) localStorage.setItem('esenho_vector_curve_mode', String(host.vectorCurveMode));
      if (host.vectorFitTolerance !== undefined) localStorage.setItem('esenho_vector_fit_tol', String(host.vectorFitTolerance));
      if (host.vecMarqueeAdditive !== undefined) localStorage.setItem('esenho_vector_marquee_add', host.vecMarqueeAdditive ? '1' : '0');
      if (host.transformMode) localStorage.setItem('esenho_transform_mode', String(host.transformMode));
      if (host.transformLockAspect !== undefined) localStorage.setItem('esenho_transform_lock_aspect', host.transformLockAspect ? '1' : '0');
      if (host.transformInterpolation) localStorage.setItem('esenho_transform_interp', String(host.transformInterpolation));
      if (host.rasterAnimator) {
        localStorage.setItem('esenho_anim_fps', String(host.rasterAnimator.fps || 12));
        localStorage.setItem('esenho_anim_loop', host.rasterAnimator.loop ? '1' : '0');
        localStorage.setItem('esenho_anim_onion', host.rasterAnimator.onionSkin?.enabled ? '1' : '0');
      }
      if (host.rasterAnimatorUI) {
        localStorage.setItem('esenho_anim_dock_visible', host.rasterAnimatorUI.visible ? '1' : '0');
      }
    } catch (_) {}
  }

  async function performAutosave(force = false) {
    if (isEmbeddedMode) return;
    if (!force && !isCanvasDirty) return;
    if (!force && (host.isDrawingOnCanvas || host.isPanning || (typeof touch !== 'undefined' && touch.drawing))) {
      scheduleAutosave(1500);
      return;
    }
    if (typeof EsenhoStore === 'undefined' || typeof host.exportProject !== 'function') return;

    saveUserPreferences();
    setAutosaveBadges('Saving...', '#fabd2f');

    try {
      const projName = host.currentProjectName || 'Untitled Project';
      const projData = host.exportProject(projName);
      if (!projData) return;
      projData.id = host.currentProjectId || ('proj_' + Date.now());
      host.currentProjectId = projData.id;
      await EsenhoStore.saveProject(projData);
      localStorage.setItem('esenho_last_project_id', projData.id);
      markCanvasClean();
    } catch (e) {
      console.warn('Autosave failed:', e);
      setAutosaveBadges('Save Error', '#fb4934');
    }
  }

  // Periodic autosave every 30s + save on page hide / unload
  setInterval(() => {
    performAutosave(false);
  }, 30000);

  window.addEventListener('beforeunload', () => {
    saveUserPreferences();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveUserPreferences();
      performAutosave(false);
    }
  });


  function resize() {
    const parent = canvasEl.parentElement;
    if (!parent) return;
    const r = canvasEl.getBoundingClientRect();
    _cachedCanvasRect = r;
    const parentW = Math.round(parent.clientWidth || r.width || window.innerWidth);
    const parentH = Math.round(parent.clientHeight || r.height || window.innerHeight);
    if (parentW <= 0 || parentH <= 0) return;

    const prevW = canvasEl.width;
    const prevH = canvasEl.height;

    if (canvasEl.width !== parentW || canvasEl.height !== parentH) {
      canvasEl.width  = parentW;
      canvasEl.height = parentH;
      if (uiCanvasEl) {
        uiCanvasEl.width  = parentW;
        uiCanvasEl.height = parentH;
      }
      host.windowWidth  = parentW;
      host.windowHeight = parentH;
      _cachedCanvasRect = canvasEl.getBoundingClientRect();
    }

    const cw = host.canvasActor?.exports?.get_canvas_width ? host.canvasActor.exports.get_canvas_width() : 0;
    const ch = host.canvasActor?.exports?.get_canvas_height ? host.canvasActor.exports.get_canvas_height() : 0;

    if (!initializedPan && cw > 0 && ch > 0) {
      host.panX = (canvasEl.width  - cw * host.zoom) / 2;
      host.panY = (canvasEl.height - ch * host.zoom) / 2;
      initializedPan = true;
    } else if (prevW > 0 && prevH > 0 && (canvasEl.width !== prevW || canvasEl.height !== prevH)) {
      host.panX += (canvasEl.width - prevW) / 2;
      host.panY += (canvasEl.height - prevH) / 2;
    }

    if ((canvasEl.width !== prevW || canvasEl.height !== prevH) && typeof host.render === 'function') {
      host.render();
    }
    updateStatus(host, host.lastDocX || 0, host.lastDocY || 0, true);
  }
  host.resize = resize;
  resize();
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined' && canvasEl.parentElement) {
    new ResizeObserver(() => resize()).observe(canvasEl.parentElement);
  }

  host.zoomToFit = function() {
    const cw = host.canvasActor?.exports?.get_canvas_width ? host.canvasActor.exports.get_canvas_width() : 0;
    const ch = host.canvasActor?.exports?.get_canvas_height ? host.canvasActor.exports.get_canvas_height() : 0;
    if (cw <= 0 || ch <= 0) return;
    const margin = 32;
    const availW = Math.max(100, canvasEl.width - margin * 2);
    const availH = Math.max(100, canvasEl.height - margin * 2);
    const fitZoom = Math.min(availW / cw, availH / ch);
    host.zoom = Math.max(0.02, Math.min(32, fitZoom));
    host.panX = (canvasEl.width - cw * host.zoom) / 2;
    host.panY = (canvasEl.height - ch * host.zoom) / 2;
    if (typeof host.render === 'function') host.render();
    updateStatus(host, host.lastDocX || 0, host.lastDocY || 0, true);
  };

  host.zoomTo100 = function() {
    const cw = host.canvasActor?.exports?.get_canvas_width ? host.canvasActor.exports.get_canvas_width() : 0;
    const ch = host.canvasActor?.exports?.get_canvas_height ? host.canvasActor.exports.get_canvas_height() : 0;
    host.zoom = 1;
    if (cw > 0 && ch > 0) {
      host.panX = (canvasEl.width - cw) / 2;
      host.panY = (canvasEl.height - ch) / 2;
    }
    if (typeof host.render === 'function') host.render();
    updateStatus(host, host.lastDocX || 0, host.lastDocY || 0, true);
  };

  host.centerCanvas = function() {
    const cw = host.canvasActor?.exports?.get_canvas_width ? host.canvasActor.exports.get_canvas_width() : 0;
    const ch = host.canvasActor?.exports?.get_canvas_height ? host.canvasActor.exports.get_canvas_height() : 0;
    if (cw > 0 && ch > 0) {
      host.panX = (canvasEl.width - cw * host.zoom) / 2;
      host.panY = (canvasEl.height - ch * host.zoom) / 2;
    }
    if (typeof host.render === 'function') host.render();
    updateStatus(host, host.lastDocX || 0, host.lastDocY || 0, true);
  };

  host.resetRotation = function() {
    host.canvasRotation = 0;
    if (typeof host.render === 'function') host.render();
    updateStatus(host, host.lastDocX || 0, host.lastDocY || 0, true);
  };

  host.toggleFlipH = function() {
    host.flipH = !host.flipH;
    if (typeof host.render === 'function') host.render();
  };

  host.toggleFlipV = function() {
    host.flipV = !host.flipV;
    if (typeof host.render === 'function') host.render();
  };

  host.resizeCanvas = function(w, h) {
    imgData = null;
    offscreen = null;
    offscreenCtx = null;
    if (typeof host.zoomToFit === 'function') {
      host.zoomToFit();
    } else if (typeof host.render === 'function') {
      host.render();
    }
  };

  host.onRenderScaleChange = function(newW, newH, scale) {
    imgData = null;
    offscreen = null;
    offscreenCtx = null;
    if (typeof markCanvasDirty === 'function') markCanvasDirty();
    if (typeof syncUiFromHost === 'function') syncUiFromHost();
    if (typeof host.render === 'function') host.render();
  };

  host.createTipFromLayer = function(name = 'Custom Tip') {
    if (!host.canvasActor || !host.canvasActor.exports) return;
    const cw = host.canvasActor.exports.get_canvas_width();
    const ch = host.canvasActor.exports.get_canvas_height();
    const pixPtr = host.canvasActor.exports.get_active_layer_pixels ? host.canvasActor.exports.get_active_layer_pixels() : 0;
    if (!pixPtr || cw <= 0 || ch <= 0) return;

    const tid = (typeof host.canvasActor.exports.w_texture_create === 'function')
      ? host.canvasActor.exports.w_texture_create(cw, ch)
      : -1;
    if (tid < 0) return;

    const byteLen = cw * ch * 4;
    const src = new Uint8Array(host.canvasActor.memory.buffer, pixPtr, byteLen);
    const dstPtr = host.canvasActor.exports.w_texture_get_pixels(tid);
    if (dstPtr) {
      new Uint8Array(host.canvasActor.memory.buffer, dstPtr, byteLen).set(src);
    }

    const texName = `tip_${Date.now()}`;
    if (!host.textures) host.textures = new Map();
    host.textures.set(texName, {
      name: name,
      width: cw,
      height: ch,
      wasmId: tid,
      category: 'shape'
    });

    if (typeof EsenhoStore !== 'undefined' && EsenhoStore.saveCustomTipShape && typeof document !== 'undefined') {
      try {
        const off = document.createElement('canvas');
        off.width = cw;
        off.height = ch;
        const ctx = off.getContext('2d');
        const imgData = ctx.createImageData(cw, ch);
        imgData.data.set(src);
        ctx.putImageData(imgData, 0, 0);
        const dataUrl = off.toDataURL('image/png');
        EsenhoStore.saveCustomTipShape(texName, {
          id: texName,
          name: name,
          width: cw,
          height: ch,
          dataUrl: dataUrl
        });
      } catch (_) {}
    }

    host.setBrushParam('shape', tid);
    if (typeof syncInfinitePainterUI === 'function') syncInfinitePainterUI();
    if (typeof host.sendConsoleLog === 'function') host.sendConsoleLog(`Created custom tip from layer [ID ${tid}]`);
    return tid;
  };

  host.createTipFromSelection = function(name = 'Selection Tip') {
    if (!host.canvasActor || !host.canvasActor.exports) return;
    const cw = host.canvasActor.exports.get_canvas_width();
    const ch = host.canvasActor.exports.get_canvas_height();
    const pixPtr = host.canvasActor.exports.get_active_layer_pixels ? host.canvasActor.exports.get_active_layer_pixels() : 0;
    if (!pixPtr || cw <= 0 || ch <= 0) return;

    let sx = 0, sy = 0, sw = cw, sh = ch;
    if (host.selection && host.selection.w > 0 && host.selection.h > 0) {
      sx = Math.max(0, Math.min(cw - 1, host.selection.x));
      sy = Math.max(0, Math.min(ch - 1, host.selection.y));
      sw = Math.max(1, Math.min(cw - sx, host.selection.w));
      sh = Math.max(1, Math.min(ch - sy, host.selection.h));
    }

    const tid = (typeof host.canvasActor.exports.w_texture_create === 'function')
      ? host.canvasActor.exports.w_texture_create(sw, sh)
      : -1;
    if (tid < 0) return;

    const srcU32 = new Uint32Array(host.canvasActor.memory.buffer, pixPtr, cw * ch);
    const dstPtr = host.canvasActor.exports.w_texture_get_pixels(tid);
    if (dstPtr) {
      const dstU32 = new Uint32Array(host.canvasActor.memory.buffer, dstPtr, sw * sh);
      for (let dy = 0; dy < sh; dy++) {
        for (let dx = 0; dx < sw; dx++) {
          dstU32[dy * sw + dx] = srcU32[(sy + dy) * cw + (sx + dx)];
        }
      }
    }

    const texName = `tip_sel_${Date.now()}`;
    if (!host.textures) host.textures = new Map();
    host.textures.set(texName, {
      name: name,
      width: sw,
      height: sh,
      wasmId: tid,
      category: 'shape'
    });

    if (typeof EsenhoStore !== 'undefined' && EsenhoStore.saveCustomTipShape && typeof document !== 'undefined' && dstPtr) {
      try {
        const off = document.createElement('canvas');
        off.width = sw;
        off.height = sh;
        const ctx = off.getContext('2d');
        const imgData = ctx.createImageData(sw, sh);
        imgData.data.set(new Uint8Array(host.canvasActor.memory.buffer, dstPtr, sw * sh * 4));
        ctx.putImageData(imgData, 0, 0);
        const dataUrl = off.toDataURL('image/png');
        EsenhoStore.saveCustomTipShape(texName, {
          id: texName,
          name: name,
          width: sw,
          height: sh,
          dataUrl: dataUrl
        });
      } catch (_) {}
    }

    host.setBrushParam('shape', tid);
    if (typeof syncInfinitePainterUI === 'function') syncInfinitePainterUI();
    if (typeof host.sendConsoleLog === 'function') host.sendConsoleLog(`Created custom tip from selection [${sw}x${sh}, ID ${tid}]`);
    return tid;
  };

  host.createGrainFromLayer = function(name = 'Custom Grain') {
    if (!host.canvasActor || !host.canvasActor.exports) return;
    const cw = host.canvasActor.exports.get_canvas_width();
    const ch = host.canvasActor.exports.get_canvas_height();
    const pixPtr = host.canvasActor.exports.get_active_layer_pixels ? host.canvasActor.exports.get_active_layer_pixels() : 0;
    if (!pixPtr || cw <= 0 || ch <= 0) return;

    const tid = (typeof host.canvasActor.exports.w_texture_create === 'function')
      ? host.canvasActor.exports.w_texture_create(cw, ch)
      : -1;
    if (tid < 0) return;

    const byteLen = cw * ch * 4;
    const src = new Uint8Array(host.canvasActor.memory.buffer, pixPtr, byteLen);
    const dstPtr = host.canvasActor.exports.w_texture_get_pixels(tid);
    if (dstPtr) {
      new Uint8Array(host.canvasActor.memory.buffer, dstPtr, byteLen).set(src);
    }

    const texName = `grain_${Date.now()}`;
    if (!host.textures) host.textures = new Map();
    host.textures.set(texName, {
      name: name,
      width: cw,
      height: ch,
      wasmId: tid,
      category: 'texture'
    });

    if (typeof EsenhoStore !== 'undefined' && EsenhoStore.saveCustomTexture && typeof document !== 'undefined') {
      try {
        const off = document.createElement('canvas');
        off.width = cw;
        off.height = ch;
        const ctx = off.getContext('2d');
        const imgData = ctx.createImageData(cw, ch);
        imgData.data.set(src);
        ctx.putImageData(imgData, 0, 0);
        const dataUrl = off.toDataURL('image/png');
        EsenhoStore.saveCustomTexture(texName, {
          id: texName,
          name: name,
          width: cw,
          height: ch,
          dataUrl: dataUrl
        });
      } catch (_) {}
    }

    if (typeof host.canvasActor.exports.w_brush_set_param === 'function') {
      host.canvasActor.exports.w_brush_set_param(18 /* W_PARAM_TEX_LAYER */, tid);
    }
    host.activeTexture = texName;
    if (typeof syncInfinitePainterUI === 'function') syncInfinitePainterUI();
    if (typeof host.sendConsoleLog === 'function') host.sendConsoleLog(`Created custom grain texture from layer [ID ${tid}]`);
    return tid;
  };

  host.createGrainFromSelection = function(name = 'Selection Grain') {
    if (!host.canvasActor || !host.canvasActor.exports) return;
    const cw = host.canvasActor.exports.get_canvas_width();
    const ch = host.canvasActor.exports.get_canvas_height();
    const pixPtr = host.canvasActor.exports.get_active_layer_pixels ? host.canvasActor.exports.get_active_layer_pixels() : 0;
    if (!pixPtr || cw <= 0 || ch <= 0) return;

    let sx = 0, sy = 0, sw = cw, sh = ch;
    if (host.selection && host.selection.w > 0 && host.selection.h > 0) {
      sx = Math.max(0, Math.min(cw - 1, host.selection.x));
      sy = Math.max(0, Math.min(ch - 1, host.selection.y));
      sw = Math.max(1, Math.min(cw - sx, host.selection.w));
      sh = Math.max(1, Math.min(ch - sy, host.selection.h));
    }

    const tid = (typeof host.canvasActor.exports.w_texture_create === 'function')
      ? host.canvasActor.exports.w_texture_create(sw, sh)
      : -1;
    if (tid < 0) return;

    const srcU32 = new Uint32Array(host.canvasActor.memory.buffer, pixPtr, cw * ch);
    const dstPtr = host.canvasActor.exports.w_texture_get_pixels(tid);
    if (dstPtr) {
      const dstU32 = new Uint32Array(host.canvasActor.memory.buffer, dstPtr, sw * sh);
      for (let dy = 0; dy < sh; dy++) {
        for (let dx = 0; dx < sw; dx++) {
          dstU32[dy * sw + dx] = srcU32[(sy + dy) * cw + (sx + dx)];
        }
      }
    }

    const texName = `grain_sel_${Date.now()}`;
    if (!host.textures) host.textures = new Map();
    host.textures.set(texName, {
      name: name,
      width: sw,
      height: sh,
      wasmId: tid,
      category: 'texture'
    });

    if (typeof EsenhoStore !== 'undefined' && EsenhoStore.saveCustomTexture && typeof document !== 'undefined' && dstPtr) {
      try {
        const off = document.createElement('canvas');
        off.width = sw;
        off.height = sh;
        const ctx = off.getContext('2d');
        const imgData = ctx.createImageData(sw, sh);
        imgData.data.set(new Uint8Array(host.canvasActor.memory.buffer, dstPtr, sw * sh * 4));
        ctx.putImageData(imgData, 0, 0);
        const dataUrl = off.toDataURL('image/png');
        EsenhoStore.saveCustomTexture(texName, {
          id: texName,
          name: name,
          width: sw,
          height: sh,
          dataUrl: dataUrl
        });
      } catch (_) {}
    }

    if (typeof host.canvasActor.exports.w_brush_set_param === 'function') {
      host.canvasActor.exports.w_brush_set_param(18 /* W_PARAM_TEX_LAYER */, tid);
    }
    host.activeTexture = texName;
    if (typeof syncInfinitePainterUI === 'function') syncInfinitePainterUI();
    if (typeof host.sendConsoleLog === 'function') host.sendConsoleLog(`Created custom grain from selection [${sw}x${sh}, ID ${tid}]`);
    return tid;
  };

  

  
  /* ── Sheet Modal Helpers (Non-blocking Side-Docked & Draggable Panels) ── */
  const LEFT_SIDE_SHEETS = new Set([
    'sheet-brushes', 'sheet-tools', 'sheet-pixelart',
    'sheet-recents', 'sheet-new-proj', 'touch-color-modal'
  ]);
  const RIGHT_SIDE_SHEETS = new Set([
    'sheet-layers', 'sheet-lab', 'sheet-hud-customizer'
  ]);
  const DOCKVIEW_SHEET_MAP = {
    'sheet-brushes': 'lab',
    'sheet-layers': 'layers',
    'sheet-tools': 'tools',
    'sheet-lab': 'lab',
    'sheet-pixelart': 'pixelart',
    'touch-color-modal': 'color',
    'sheet-hud-customizer': 'hud',
    'sheet-recents': 'recents',
    'sheet-new-proj': 'newproj',
    'sheet-filters': 'filters'
  };

  function closeAllSheets(onlySide = null) {
    if (window.isDockviewPainter && !onlySide && window.contextMenuService) {
      window.contextMenuService.hideContextMenu();
    }
    document.querySelectorAll('.ip-sheet-modal, #touch-color-modal').forEach(m => {
      if (m.closest('.dock-panel-content')) return;
      if (!onlySide) {
        m.classList.remove('active');
        return;
      }
      const box = m.querySelector('.ip-sheet, .touch-color-box');
      if (box && box.dataset.userDragged === 'true') return; // Keep custom-placed floating panels open
      if (onlySide === 'left' && LEFT_SIDE_SHEETS.has(m.id)) m.classList.remove('active');
      if (onlySide === 'right' && RIGHT_SIDE_SHEETS.has(m.id)) m.classList.remove('active');
    });
  }

  function openSheet(id) {
    if (window.isDockviewPainter && DOCKVIEW_SHEET_MAP[id] && typeof window.openPainterDockPanel === 'function') {
      window.openPainterDockPanel(DOCKVIEW_SHEET_MAP[id]);
      if (typeof syncUiFromHost === 'function') syncUiFromHost();
      return;
    }
    closeAllSheets();
    document.getElementById(id)?.classList.add('active');
  }

  function toggleSheet(id) {
    if (window.isDockviewPainter && DOCKVIEW_SHEET_MAP[id] && typeof window.togglePainterDockPanel === 'function') {
      window.togglePainterDockPanel(DOCKVIEW_SHEET_MAP[id]);
      if (id === 'sheet-layers' && typeof lastLayerTreeSig !== 'undefined') {
        lastLayerTreeSig = '';
      }
      if (typeof syncUiFromHost === 'function') syncUiFromHost();
      if (typeof triggerHaptic === 'function') triggerHaptic(12);
      return;
    }
    const el = document.getElementById(id);
    if (!el) return;
    const wasActive = el.classList.contains('active');
    const side = LEFT_SIDE_SHEETS.has(id) ? 'left' : (RIGHT_SIDE_SHEETS.has(id) ? 'right' : null);
    if (wasActive) {
      el.classList.remove('active');
    } else {
      if (side) closeAllSheets(side);
      el.classList.add('active');
      if (id === 'sheet-layers') {
        if (typeof lastLayerTreeSig !== 'undefined') lastLayerTreeSig = '';
      }
      if (typeof syncUiFromHost === 'function') syncUiFromHost();
    }
    if (typeof triggerHaptic === 'function') triggerHaptic(12);
  }

  /* ── Export Helpers (Browser PNG, JPEG, .ESEN) ── */
  function exportImage(mimeType = 'image/png', quality = 0.92) {
    if (!host.canvasActor || !host.canvasActor.exports) return;
    if (typeof host.canvasActor.exports.force_composite === 'function') {
      host.canvasActor.exports.force_composite();
    }
    const w = host.canvasActor.exports.get_canvas_width();
    const h = host.canvasActor.exports.get_canvas_height();
    const pixPtr = host.canvasActor.exports.get_composite_pixels();
    if (!pixPtr || w <= 0 || h <= 0) return;

    const rawBytes = new Uint8Array(host.canvasActor.memory.buffer, pixPtr, w * h * 4);
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');
    const idata = octx.createImageData(w, h);
    idata.data.set(rawBytes);
    octx.putImageData(idata, 0, 0);

    const ext = mimeType === 'image/jpeg' ? 'jpg' : (mimeType === 'image/webp' ? 'webp' : 'png');
    const projName = host.currentProjectName || 'drawing';
    const safeName = projName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'drawing';
    const filename = `${safeName}.${ext}`;

    const dataUrl = off.toDataURL(mimeType, quality);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    log(`Exported image as ${filename} [ok]`);
  }

  function exportEsenProject() {
    if (typeof host.exportProject !== 'function') return;
    const projName = host.currentProjectName || 'Untitled Artwork';
    const proj = host.exportProject(projName);
    if (!proj) {
      log('err: failed exporting project', 'err');
      return;
    }
    const safeName = projName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'project';
    const filename = `${safeName}.esen`;
    if (typeof EsenhoStore !== 'undefined' && typeof EsenhoStore.exportEsenFile === 'function') {
      const res = EsenhoStore.exportEsenFile(proj, filename);
      if (res && res.ok) {
        log(`Project exported to '${res.filename}' [ok]`);
        return;
      }
    }
    const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log(`Project exported to '${filename}' [ok]`);
  }

  async function exportAnimatedGif() {
    if (!host.rasterAnimator) {
      log('err: No animation available to export', 'warn');
      return;
    }
    try {
      log('Exporting animated GIF…');
      const blob = await host.rasterAnimator.exportGif();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const projName = host.currentProjectName || 'animation';
        const safeName = projName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'animation';
        a.download = `${safeName}.gif`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        log(`Animated GIF exported as ${a.download} [ok]`);
      }
    } catch (err) {
      log(`err: GIF export failed: ${err.message}`, 'err');
      alert('GIF export failed: ' + err.message);
    }
  }

  async function exportWebmVideo() {
    if (!host.rasterAnimator) {
      log('err: No animation available to export', 'warn');
      return;
    }
    try {
      log('Exporting WebM video…');
      const blob = await host.rasterAnimator.exportWebM();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const projName = host.currentProjectName || 'animation';
        const safeName = projName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'animation';
        a.download = `${safeName}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        log(`WebM video exported as ${a.download} [ok]`);
      }
    } catch (err) {
      log(`err: WebM export failed: ${err.message}`, 'err');
      alert('WebM export failed: ' + err.message);
    }
  }

  host.exportAnimatedGif = exportAnimatedGif;
  host.exportWebmVideo = exportWebmVideo;

  /* ── Mobile-First Unified Bottom Dock & Drawer ── */
  function toggleUi() {
    toggleSheet('sheet-hud-customizer');
  }

  resize();

  window.addEventListener('keydown', e => {
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      exportEsenProject();
    } else if ((e.key === 'b' || e.key === 'B' || e.key === 'u' || e.key === 'U') && (e.ctrlKey || e.altKey)) {
      toggleUi();
      e.preventDefault();
    } else if (e.ctrlKey && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      host.undo();
      e.preventDefault();
    } else if ((e.ctrlKey && (e.key === 'y' || e.key === 'Y')) || (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      host.redo();
      e.preventDefault();
    } else if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      host.copySelection();
      log('copied selection [ok]');
      e.preventDefault();
    } else if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      host.cutSelection();
      log('cut selection [ok]');
      e.preventDefault();
    } else if (e.ctrlKey && (e.key === 't' || e.key === 'T')) {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      runCmd('transform');
      e.preventDefault();
    } else if (e.key === 'Escape') {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        document.activeElement.blur();
        e.preventDefault();
        return;
      }
      if (host.floatingTransform) {
        runCmd('transform cancel');
        markCanvasDirty();
        syncUiFromHost();
        e.preventDefault();
        return;
      }
      let closedSomething = false;
      const activeSheet = document.querySelector('.ip-sheet-modal.active');
      if (activeSheet && !activeSheet.closest('.dock-panel-content')) {
        activeSheet.classList.remove('active');
        closedSomething = true;
      }
      const touchModal = document.getElementById('touch-color-modal');
      if (touchModal && touchModal.classList.contains('active') && !touchModal.closest('.dock-panel-content')) {
        touchModal.classList.remove('active');
        closedSomething = true;
      }
      const arcDial = document.getElementById('arc-dial-modal');
      if (arcDial && arcDial.classList.contains('active')) {
        arcDial.classList.remove('active');
        closedSomething = true;
      }
      if (vecPenActivePathId) {
        vecPenActivePathId = null;
        markCanvasDirty();
        syncUiFromHost();
        e.preventDefault();
        return;
      }
      if (closedSomething) {
        e.preventDefault();
        return;
      }
      host.clearSelection();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      if (vecPenActivePathId) {
        vecPenActivePathId = null;
        markCanvasDirty();
        syncUiFromHost();
        e.preventDefault();
      } else if (host.floatingTransform) {
        host.applyFloatTransform();
        markCanvasDirty();
        syncUiFromHost();
        e.preventDefault();
      }
    } else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      host.clearSelection();
      e.preventDefault();
    } else if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      if (host.actionMode === 'vector' && host.isVectorLayer && host.isVectorLayer()) {
        const selPath = host.getSelectedVectorPath();
        if (selPath && Array.isArray(selPath.nodes)) {
          host.selectVectorNodes(selPath.id, selPath.nodes.map((_, idx) => idx), false);
          markCanvasDirty();
          syncUiFromHost();
          e.preventDefault();
          return;
        }
      }
      host.selectAll();
      e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      if (host.actionMode === 'vector' && host.isVectorLayer && host.isVectorLayer()) {
        const vl = host.getVectorLayer();
        const selPath = host.getSelectedVectorPath();
        if (vl && selPath) {
          const selIndices = (vl.selectedNodeIndices instanceof Set && vl.selectedNodeIndices.size > 0)
            ? Array.from(vl.selectedNodeIndices).sort((a, b) => b - a)
            : (vl.selectedNodeIdx >= 0 ? [vl.selectedNodeIdx] : []);
          if (selIndices.length > 0 && (selPath.nodes.length - selIndices.length) >= 2) {
            host.pushUndoSnapshot('delete vector nodes');
            if (typeof selPath.removeNodes === 'function') {
              selPath.removeNodes(selIndices);
            } else {
              for (const idx of selIndices) selPath.removeNode(idx);
            }
            const nextIdx = Math.min(selIndices[selIndices.length - 1], selPath.nodes.length - 1);
            host.selectVectorPath(selPath.id, nextIdx);
            host.renderVectorLayer();
            markCanvasDirty();
            syncUiFromHost();
          } else {
            host.pushUndoSnapshot('delete vector path');
            vl.paths = vl.paths.filter(p => p.id !== selPath.id);
            vl.selectedPathId = vl.paths.length > 0 ? vl.paths[vl.paths.length - 1].id : null;
            vl.selectedNodeIdx = -1;
            if (vl.selectedNodeIndices instanceof Set) vl.selectedNodeIndices.clear();
            if (vecPenActivePathId === selPath.id) vecPenActivePathId = null;
            host.renderVectorLayer();
            markCanvasDirty();
            syncUiFromHost();
          }
          e.preventDefault();
        }
      }
    }
  });

  /* ── Render loop ── */
  let imgData = null;
  let offscreen = null;
  let offscreenCtx = null;
  let lassoPoints = [];
  let vectorRawStrokePoints = [];
  let vecDragging = null;
  let vecWidthDragging = false;
  let vecLastClickTime = 0;
  let vecLastClickPos = null;
  let vecPenActivePathId = null;

  function vecStartInteraction(x, y, isTouch = false, ev = null) {
    if (!host.isVectorLayer) return false;
    if (!host.isVectorLayer() && host.enableVectorLayer) {
      host.enableVectorLayer();
    }
    const vl = host.getVectorLayer();
    if (!vl) return false;
    const hitRad = (isTouch ? 15 : 9) / Math.max(0.1, host.zoom || 1);
    const selPath = host.getSelectedVectorPath();
    const isAdditive = !!(ev?.shiftKey || host.vecMarqueeAdditive);

    // 0. Pen Tool Mode: Click to place corner points, drag to pull Bézier handles, click start node to close
    if (host.vectorSubTool === 'pen') {
      const SvgEngineRef = (typeof window !== 'undefined' && window.SvgEngine) ? window.SvgEngine : null;
      if (!SvgEngineRef || !SvgEngineRef.SvgPath || !SvgEngineRef.PathNode) return false;

      // Check if continuing an active open Pen path
      if (selPath && selPath.id === vecPenActivePathId && !selPath.closed && Array.isArray(selPath.nodes) && selPath.nodes.length > 0) {
        // Clicking first node closes the loop if >= 2 nodes
        if (selPath.nodes.length >= 2) {
          const firstNode = selPath.nodes[0];
          if (Math.hypot(x - firstNode.x, y - firstNode.y) <= hitRad * 1.45) {
            host.pushUndoSnapshot('close pen path');
            selPath.closed = true;
            vecPenActivePathId = null;
            host.selectVectorPath(selPath.id, 0);
            vecDragging = { type: 'penCloseNode', path: selPath, nodeIdx: 0, startX: firstNode.x, startY: firstNode.y, moved: false };
            host.renderVectorLayer();
            markCanvasDirty();
            syncUiFromHost();
            return true;
          }
        }
        // Append new node to active Pen path
        host.pushUndoSnapshot('add pen node');
        const newNode = new SvgEngineRef.PathNode(x, y, 0, 0, 0, 0, 'corner');
        newNode.pressure = 1.0;
        newNode.widthScale = 1.0;
        selPath.nodes.push(newNode);
        const newIdx = selPath.nodes.length - 1;
        host.selectVectorPath(selPath.id, newIdx);
        vecDragging = { type: 'penNewNode', path: selPath, nodeIdx: newIdx, startX: x, startY: y, moved: false };
        host.renderVectorLayer();
        markCanvasDirty();
        syncUiFromHost();
        return true;
      }

      // Start a brand new Pen path
      host.pushUndoSnapshot('new pen path');
      const colInt = host.currentColor !== undefined ? host.currentColor : 0xFFebdbb2;
      const strokeHex = rgbToHex(colInt & 0xFF, (colInt >> 8) & 0xFF, (colInt >> 16) & 0xFF);
      const strokeW = Math.max(1, (host.brushParams?.size || 6) * 2);
      const strokeOp = Math.max(0.05, Math.min(1.0, (host.brushParams?.opacity ?? 100) / 100));
      const newPath = new SvgEngineRef.SvgPath({
        name: `Pen Curve ${vl.paths.length + 1}`,
        stroke: strokeHex,
        fill: 'none',
        strokeWidth: strokeW,
        opacity: strokeOp,
        closed: false,
        brushParams: host.brushParams ? { ...host.brushParams } : null
      });
      const firstNode = new SvgEngineRef.PathNode(x, y, 0, 0, 0, 0, 'corner');
      firstNode.pressure = 1.0;
      firstNode.widthScale = 1.0;
      newPath.nodes.push(firstNode);
      vl.paths.push(newPath);
      vecPenActivePathId = newPath.id;
      host.selectVectorPath(newPath.id, 0);
      vecDragging = { type: 'penNewNode', path: newPath, nodeIdx: 0, startX: x, startY: y, moved: false };
      host.renderVectorLayer();
      markCanvasDirty();
      syncUiFromHost();
      return true;
    }

    // 1. Check tangent handles (cpIn / cpOut) on selected path (unless in width or marquee sub-tool)
    if (selPath && host.vectorSubTool !== 'width' && host.vectorSubTool !== 'marquee' && Array.isArray(selPath.nodes)) {
      const checkOrder = [];
      if (vl.selectedNodeIdx >= 0 && vl.selectedNodeIdx < selPath.nodes.length) {
        checkOrder.push(vl.selectedNodeIdx);
      }
      for (let i = 0; i < selPath.nodes.length; i++) {
        if (i !== vl.selectedNodeIdx) checkOrder.push(i);
      }
      for (const i of checkOrder) {
        const n = selPath.nodes[i];
        if (!n) continue;
        const absOut = typeof n.getAbsCpOut === 'function' ? n.getAbsCpOut() : { x: n.x + (n.cpOut?.x || 0), y: n.y + (n.cpOut?.y || 0) };
        const absIn = typeof n.getAbsCpIn === 'function' ? n.getAbsCpIn() : { x: n.x + (n.cpIn?.x || 0), y: n.y + (n.cpIn?.y || 0) };
        if (Math.hypot(absOut.x - n.x, absOut.y - n.y) > 0.5 && Math.hypot(x - absOut.x, y - absOut.y) <= hitRad) {
          host.pushUndoSnapshot('edit vector handle');
          host.selectVectorPath(selPath.id, i);
          vecDragging = { type: 'cpOut', path: selPath, nodeIdx: i, startX: x, startY: y, moved: false };
          markCanvasDirty();
          syncUiFromHost();
          return true;
        }
        if (Math.hypot(absIn.x - n.x, absIn.y - n.y) > 0.5 && Math.hypot(x - absIn.x, y - absIn.y) <= hitRad) {
          host.pushUndoSnapshot('edit vector handle');
          host.selectVectorPath(selPath.id, i);
          vecDragging = { type: 'cpIn', path: selPath, nodeIdx: i, startX: x, startY: y, moved: false };
          markCanvasDirty();
          syncUiFromHost();
          return true;
        }
      }
    }

    // 2. Check anchor nodes on selected path
    if (selPath && typeof selPath.hitTestNode === 'function') {
      const nIdx = selPath.hitTestNode(x, y, hitRad * 1.15);
      if (nIdx >= 0) {
        const n = selPath.nodes[nIdx];
        const rawSel = host.getSelectedVectorNodeIndices ? host.getSelectedVectorNodeIndices() : [];
        const selSet = rawSel instanceof Set ? rawSel : new Set(Array.isArray(rawSel) ? rawSel : []);

        if (isAdditive) {
          const nextSet = new Set(selSet);
          if (nextSet.has(nIdx)) nextSet.delete(nIdx);
          else nextSet.add(nIdx);
          host.selectVectorNodes(selPath.id, Array.from(nextSet), false);
          markCanvasDirty();
          syncUiFromHost();
          return true;
        }

        if (!selSet.has(nIdx)) {
          host.selectVectorPath(selPath.id, nIdx);
        } else {
          vl.selectedNodeIdx = nIdx;
        }

        const activeIndices = (vl.selectedNodeIndices instanceof Set && vl.selectedNodeIndices.size > 1 && vl.selectedNodeIndices.has(nIdx))
          ? Array.from(vl.selectedNodeIndices)
          : [nIdx];

        if (host.vectorSubTool === 'width') {
          host.pushUndoSnapshot('edit vector width');
          vecDragging = {
            type: 'width',
            path: selPath,
            nodeIdx: nIdx,
            nodeIndices: activeIndices,
            startX: x,
            startY: y,
            startWidthScale: n.widthScale !== undefined ? n.widthScale : 1.0,
            startScales: activeIndices.map(idx => selPath.nodes[idx]?.widthScale ?? 1.0),
            startPressure: n.pressure !== undefined ? n.pressure : 1.0,
            moved: false
          };
        } else if (activeIndices.length > 1) {
          host.pushUndoSnapshot('move vector nodes');
          vecDragging = {
            type: 'multiNode',
            path: selPath,
            nodeIdx: nIdx,
            nodeIndices: activeIndices,
            startX: x,
            startY: y,
            lastX: x,
            lastY: y,
            moved: false
          };
        } else {
          host.pushUndoSnapshot('move vector node');
          vecDragging = { type: 'node', path: selPath, nodeIdx: nIdx, startX: x, startY: y, lastX: x, lastY: y, moved: false };
        }
        markCanvasDirty();
        syncUiFromHost();
        return true;
      }
    }

    // If in Marquee Box sub-tool and didn't hit an anchor node directly, start marquee box selection immediately
    if (host.vectorSubTool === 'marquee') {
      vecDragging = {
        type: 'marquee',
        path: selPath,
        startX: x,
        startY: y,
        curX: x,
        curY: y,
        additive: isAdditive,
        moved: false
      };
      markCanvasDirty();
      return true;
    }

    // 3. Check curve segment on selected path (double-click splits/inserts node, drag bends segment)
    if (selPath && typeof selPath.hitTestStroke === 'function') {
      const segHit = selPath.hitTestStroke(x, y, hitRad);
      if (segHit) {
        const now = Date.now();
        const isDblClick = (now - vecLastClickTime < 340) && vecLastClickPos &&
          (Math.hypot(x - vecLastClickPos.x, y - vecLastClickPos.y) <= hitRad * 1.5);
        vecLastClickTime = now;
        vecLastClickPos = { x, y };

        if (isDblClick && typeof selPath.splitSegment === 'function') {
          host.pushUndoSnapshot('add vector node');
          const splitRes = selPath.splitSegment(segHit.segIndex, segHit.t);
          const newIdx = (splitRes && typeof splitRes === 'object') ? splitRes.index : splitRes;
          host.selectVectorPath(selPath.id, newIdx);
          vecDragging = { type: 'node', path: selPath, nodeIdx: newIdx, startX: x, startY: y, lastX: x, lastY: y, moved: false, splitInserted: true };
          markCanvasDirty();
          syncUiFromHost();
          return true;
        }

        if (host.vectorSubTool === 'width') {
          let nearestIdx = 0, bestD = Infinity;
          selPath.nodes.forEach((nd, idx) => {
            const d = Math.hypot(x - nd.x, y - nd.y);
            if (d < bestD) { bestD = d; nearestIdx = idx; }
          });
          const n = selPath.nodes[nearestIdx];
          host.pushUndoSnapshot('edit vector width');
          host.selectVectorPath(selPath.id, nearestIdx);
          vecDragging = {
            type: 'width',
            path: selPath,
            nodeIdx: nearestIdx,
            nodeIndices: [nearestIdx],
            startX: x,
            startY: y,
            startWidthScale: n.widthScale !== undefined ? n.widthScale : 1.0,
            startScales: [n.widthScale !== undefined ? n.widthScale : 1.0],
            startPressure: n.pressure !== undefined ? n.pressure : 1.0,
            moved: false
          };
        } else {
          host.pushUndoSnapshot('bend vector curve');
          vecDragging = {
            type: 'segment',
            path: selPath,
            segIndex: segHit.segIndex,
            t: Math.max(0.08, Math.min(0.92, segHit.t)),
            startX: x,
            startY: y,
            moved: false
          };
        }
        markCanvasDirty();
        syncUiFromHost();
        return true;
      }
    }

    // 4. Hit-test any other path on the active vector layer
    const layerHit = host.hitTestVectorLayer ? host.hitTestVectorLayer(x, y, hitRad) : null;
    if (layerHit && layerHit.path) {
      const p = layerHit.path;
      const nIdx = (typeof p.hitTestNode === 'function') ? p.hitTestNode(x, y, hitRad * 1.15) : -1;
      host.selectVectorPath(p.id, nIdx >= 0 ? nIdx : -1);
      if (nIdx >= 0) {
        const n = p.nodes[nIdx];
        if (host.vectorSubTool === 'width') {
          host.pushUndoSnapshot('edit vector width');
          vecDragging = {
            type: 'width',
            path: p,
            nodeIdx: nIdx,
            nodeIndices: [nIdx],
            startX: x,
            startY: y,
            startWidthScale: n.widthScale !== undefined ? n.widthScale : 1.0,
            startScales: [n.widthScale !== undefined ? n.widthScale : 1.0],
            startPressure: n.pressure !== undefined ? n.pressure : 1.0,
            moved: false
          };
        } else {
          host.pushUndoSnapshot('move vector node');
          vecDragging = { type: 'node', path: p, nodeIdx: nIdx, startX: x, startY: y, lastX: x, lastY: y, moved: false };
        }
      } else if (layerHit.hitInfo) {
        host.pushUndoSnapshot('bend vector curve');
        vecDragging = {
          type: 'segment',
          path: p,
          segIndex: layerHit.hitInfo.segIndex,
          t: Math.max(0.08, Math.min(0.92, layerHit.hitInfo.t)),
          startX: x,
          startY: y,
          moved: false
        };
      }
      vecLastClickTime = Date.now();
      vecLastClickPos = { x, y };
      markCanvasDirty();
      syncUiFromHost();
      return true;
    }

    // 5. Empty space: start a marquee selection box (if clicked without dragging, it will deselect on release)
    vecDragging = {
      type: 'marquee',
      path: selPath,
      startX: x,
      startY: y,
      curX: x,
      curY: y,
      additive: isAdditive,
      moved: false
    };
    markCanvasDirty();
    syncUiFromHost();
    return true;
  }

  function vecMoveInteraction(x, y) {
    if (!vecDragging) return false;
    const d = vecDragging;
    if (d.type === 'marquee') {
      if (Math.hypot(x - d.startX, y - d.startY) > 2 / Math.max(0.1, host.zoom || 1)) {
        d.moved = true;
      }
      d.curX = x;
      d.curY = y;
      if (typeof markCanvasDirty === 'function') markCanvasDirty();
      return true;
    }
    if (!d.path) return false;
    d.moved = true;
    if (d.type === 'penNewNode') {
      const n = d.path.nodes[d.nodeIdx];
      if (n) {
        const dx = x - d.startX;
        const dy = y - d.startY;
        if (Math.hypot(dx, dy) > 2 / Math.max(0.1, host.zoom || 1)) {
          n.type = 'symmetric';
          n.cpOut = { x: dx, y: dy };
          n.cpIn = { x: -dx, y: -dy };
        }
      }
    } else if (d.type === 'penCloseNode') {
      const n = d.path.nodes[0];
      if (n) {
        const dx = x - d.startX;
        const dy = y - d.startY;
        if (Math.hypot(dx, dy) > 2 / Math.max(0.1, host.zoom || 1)) {
          n.type = 'symmetric';
          n.cpOut = { x: dx, y: dy };
          n.cpIn = { x: -dx, y: -dy };
        }
      }
    } else if (d.type === 'multiNode' && Array.isArray(d.nodeIndices)) {
      const dx = x - d.lastX;
      const dy = y - d.lastY;
      for (const idx of d.nodeIndices) {
        d.path.moveNode(idx, dx, dy);
      }
      d.lastX = x;
      d.lastY = y;
    } else if (d.type === 'node') {
      const dx = x - d.lastX;
      const dy = y - d.lastY;
      d.path.moveNode(d.nodeIdx, dx, dy);
      d.lastX = x;
      d.lastY = y;
    } else if (d.type === 'cpIn') {
      d.path.moveControlPoint(d.nodeIdx, 'in', x, y);
    } else if (d.type === 'cpOut') {
      d.path.moveControlPoint(d.nodeIdx, 'out', x, y);
    } else if (d.type === 'segment') {
      if (typeof d.path.bendSegment === 'function') {
        d.path.bendSegment(d.segIndex, d.t, x, y);
      }
    } else if (d.type === 'width') {
      const delta = ((x - d.startX) - (y - d.startY)) * 0.015 * Math.max(0.5, 1 / (host.zoom || 1));
      if (Array.isArray(d.nodeIndices) && d.nodeIndices.length > 1) {
        d.nodeIndices.forEach((idx, i) => {
          const nd = d.path.nodes[idx];
          if (nd) {
            const baseS = d.startScales && d.startScales[i] !== undefined ? d.startScales[i] : 1.0;
            nd.widthScale = Math.max(0.1, Math.min(3.0, baseS + delta));
          }
        });
      }
      const n = d.path.nodes[d.nodeIdx];
      if (n) {
        const newScale = Math.max(0.1, Math.min(3.0, d.startWidthScale + delta));
        n.widthScale = newScale;
        const wSlider = document.getElementById('ip-vecbar-width-slider');
        const wVal = document.getElementById('ip-vecbar-width-val');
        const pct = Math.round(newScale * 100);
        if (wSlider) wSlider.value = pct;
        if (wVal) wVal.textContent = `${pct}%`;
      }
    }
    // Deferred WASM rasterization: only update the 60fps overlay preview during drag!
    if (typeof markCanvasDirty === 'function') markCanvasDirty();
    return true;
  }

  function vecEndInteraction() {
    if (!vecDragging) return false;
    const d = vecDragging;
    vecDragging = null;
    if (d.type === 'marquee') {
      const vl = host.getVectorLayer ? host.getVectorLayer() : null;
      if (d.moved && vl && Array.isArray(vl.paths)) {
        const minX = Math.min(d.startX, d.curX);
        const maxX = Math.max(d.startX, d.curX);
        const minY = Math.min(d.startY, d.curY);
        const maxY = Math.max(d.startY, d.curY);
        let targetPath = host.getSelectedVectorPath();
        let hitIndices = [];
        if (targetPath && Array.isArray(targetPath.nodes)) {
          targetPath.nodes.forEach((n, idx) => {
            if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) {
              hitIndices.push(idx);
            }
          });
        }
        // If no nodes hit on current selected path, check other paths on the layer
        if (hitIndices.length === 0) {
          for (let i = vl.paths.length - 1; i >= 0; i--) {
            const p = vl.paths[i];
            if (!p || p.visible === false || !Array.isArray(p.nodes)) continue;
            const pHits = [];
            p.nodes.forEach((n, idx) => {
              if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) pHits.push(idx);
            });
            if (pHits.length > 0) {
              targetPath = p;
              hitIndices = pHits;
              break;
            }
          }
        }
        if (targetPath && hitIndices.length > 0) {
          host.selectVectorNodes(targetPath.id, hitIndices, d.additive);
        } else if (!d.additive && targetPath) {
          host.selectVectorNodes(targetPath.id, [], false);
        }
      } else if (!d.moved && !d.additive) {
        host.selectVectorPath(null, -1);
      }
      if (typeof markCanvasDirty === 'function') markCanvasDirty();
      syncUiFromHost();
      return true;
    }
    if (d.type === 'penNewNode' || d.type === 'penCloseNode' || d.moved || d.splitInserted) {
      host.renderVectorLayer();
    } else if (Array.isArray(host.undoStack) && host.undoStack.length > 0) {
      host.undoStack.pop();
    }
    if (typeof markCanvasDirty === 'function') markCanvasDirty();
    syncUiFromHost();
    return true;
  }

  let isDraggingShape = false;
  let shapeStartDoc = null;
  let shapeCurDoc = null;
  let isSelecting = false;
  let selStartDoc = null;
  let selCurDoc = null;
  let isLassoSelecting = false;   // mode 10: freehand polygon selection
  let lassoSelPoints = [];         // polygon points for lasso selection
  // Float transform drag state
  let ftDragging = false;          // dragging the floating layer
  let ftHandle = null;             // 'move' | 'tl'|'tr'|'bl'|'br'|'ml'|'mr'|'tm'|'bm'|'rot'
  let ftDragStart = null;          // { sx, sy, x, y } screen+doc start
  let ftDragOrigin = null;         // snapshot of floatingTransform at drag start

  let selectScratchSavedActive = null;
  let selectScratchLayerId = -1;
  let selectPreviewCanvas = null;
  let selectPreviewCtx = null;
  let selectPreviewImg = null;

  function beginBrushSelect() {
    if (!host.canvasActor?.exports?.w_layer_get_pixels) return;
    const getScratch = host.canvasActor.exports.w_get_selection_scratch_layer;
    if (!getScratch) return;
    selectScratchLayerId = getScratch();
    if (selectScratchLayerId < 0) return;

    selectScratchSavedActive = host.canvasActor.exports.get_active_layer ? host.canvasActor.exports.get_active_layer() : 3;

    if (host.canvasActor.exports.w_layer_clear) {
      host.canvasActor.exports.w_layer_clear(selectScratchLayerId);
    }
    if (host.canvasActor.exports.w_set_clip) {
      host.canvasActor.exports.w_set_clip(0, 0, 0, 0, 0, 0);
    }
    if (host.canvasActor.exports.w_layer_select) {
      host.canvasActor.exports.w_layer_select(selectScratchLayerId);
    }
  }

  function endBrushSelect() {
    if (selectScratchLayerId < 0 || !host.canvasActor?.exports?.w_layer_get_pixels) {
      selectScratchSavedActive = null;
      return;
    }
    const ptr = host.canvasActor.exports.w_layer_get_pixels(selectScratchLayerId);
    const lw = host.canvasActor.exports.w_layer_get_width(selectScratchLayerId);
    const lh = host.canvasActor.exports.w_layer_get_height(selectScratchLayerId);
    if (!ptr || lw <= 0 || lh <= 0) {
      if (selectScratchSavedActive !== null && host.canvasActor.exports.w_layer_select) {
        host.canvasActor.exports.w_layer_select(selectScratchSavedActive);
      }
      selectScratchSavedActive = null;
      selectScratchLayerId = -1;
      return;
    }

    const u32 = new Uint32Array(host.canvasActor.memory.buffer, ptr, lw * lh);
    let minX = lw, minY = lh, maxX = -1, maxY = -1;
    let count = 0;

    for (let py = 0; py < lh; py++) {
      const row = py * lw;
      for (let px = 0; px < lw; px++) {
        if ((u32[row + px] >>> 24) > 0) {
          count++;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
    }

    if (count > 0 && maxX >= minX && maxY >= minY) {
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const mask = new Uint8Array(bw * bh);
      for (let py = minY; py <= maxY; py++) {
        const row = py * lw;
        const maskRow = (py - minY) * bw;
        for (let px = minX; px <= maxX; px++) {
          if ((u32[row + px] >>> 24) > 0) {
            mask[maskRow + (px - minX)] = 1;
          }
        }
      }

      if (host.canvasActor.exports.w_layer_clear) {
        host.canvasActor.exports.w_layer_clear(selectScratchLayerId);
      }
      if (selectScratchSavedActive !== null && host.canvasActor.exports.w_layer_select) {
        host.canvasActor.exports.w_layer_select(selectScratchSavedActive);
      }
      selectScratchSavedActive = null;
      selectScratchLayerId = -1;

      const newSel = { active: true, type: 'lasso', x: minX, y: minY, w: bw, h: bh, mask, points: null };
      host.applySelectionOp(newSel, host.selectionMode);
      host.syncSelectionClip();
      if (host.canvasActor.exports.force_composite) host.canvasActor.exports.force_composite();
    } else {
      if (host.canvasActor.exports.w_layer_clear) {
        host.canvasActor.exports.w_layer_clear(selectScratchLayerId);
      }
      if (selectScratchSavedActive !== null && host.canvasActor.exports.w_layer_select) {
        host.canvasActor.exports.w_layer_select(selectScratchSavedActive);
      }
      selectScratchSavedActive = null;
      selectScratchLayerId = -1;
      host.syncSelectionClip();
      if (host.canvasActor.exports.force_composite) host.canvasActor.exports.force_composite();
    }
  }

  function rasterizeShape(start, end, mode) {
    if (!start || !end) return;
    const isErase = host.actionMode === 'erase';
    const isSelect = host.actionMode === 'select';
    const col = host.currentColor;

    if (!isErase && !isSelect && host.isVectorLayer && host.isVectorLayer()) {
      const shapeName = mode === 6 ? 'line' : (mode === 7 ? 'rect' : 'ellipse');
      host.pushUndoSnapshot('vector ' + shapeName);
      host.addVectorShapePath(shapeName, start.x, start.y, end.x, end.y);
      syncUiFromHost();
      return;
    }

    if (mode === 6) { // Line
      if (isSelect) {
        beginBrushSelect();
        host.sendStroke(start.x, start.y, start.x, start.y, 0, 0, 0xFF83A598);
        host.sendStroke(end.x, end.y, start.x, start.y, 1, 0, 0xFF83A598);
        host.sendStroke(end.x, end.y, end.x, end.y, 2, 0, 0xFF83A598);
        endBrushSelect();
      } else {
        host.pushUndoSnapshot(isErase ? 'erase line' : 'shape line');
        host.sendStroke(start.x, start.y, start.x, start.y, 0, isErase ? 1 : 0, col);
        host.sendStroke(end.x, end.y, start.x, start.y, 1, isErase ? 1 : 0, col);
        host.sendStroke(end.x, end.y, end.x, end.y, 2, isErase ? 1 : 0, col);
      }
    } else if (mode === 7) { // Filled Rect
      const rx = Math.min(start.x, end.x);
      const ry = Math.min(start.y, end.y);
      const rw = Math.abs(end.x - start.x);
      const rh = Math.abs(end.y - start.y);
      if (rw <= 0 || rh <= 0) return;

      if (isSelect) {
        host.setSelection(rx, ry, rw, rh);
      } else if (isErase) {
        host.pushUndoSnapshot('erase rect');
        const cw = host.canvasActor.exports.get_canvas_width();
        const ch = host.canvasActor.exports.get_canvas_height();
        const pixPtr = host.canvasActor.exports.get_active_layer_pixels ? host.canvasActor.exports.get_active_layer_pixels() : 0;
        if (pixPtr && cw > 0 && ch > 0) {
          const pixels = new Uint32Array(host.canvasActor.memory.buffer, pixPtr, cw * ch);
          const x0 = Math.max(0, Math.min(cw, rx));
          const y0 = Math.max(0, Math.min(ch, ry));
          const x1 = Math.max(0, Math.min(cw, rx + rw));
          const y1 = Math.max(0, Math.min(ch, ry + rh));
          for (let y = y0; y < y1; y++) {
            const rowOffset = y * cw;
            for (let x = x0; x < x1; x++) {
              if (typeof host.isPixelClipped === 'function' && host.isPixelClipped(x, y)) continue;
              pixels[rowOffset + x] = 0;
            }
          }
          if (host.canvasActor.exports.force_composite) host.canvasActor.exports.force_composite();
        }
      } else {
        host.pushUndoSnapshot('shape rect');
        host.canvasActor.exports.w_draw_rect(rx, ry, rw, rh, col);
        if (host.canvasActor.exports.force_composite) host.canvasActor.exports.force_composite();
      }
    } else if (mode === 8) { // Filled Ellipse
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      if (rx <= 0 || ry <= 0) return;

      if (isSelect) {
        host.setEllipseSelection(cx, cy, rx, ry);
      } else if (isErase) {
        host.pushUndoSnapshot('erase ellipse');
        const cw = host.canvasActor.exports.get_canvas_width();
        const ch = host.canvasActor.exports.get_canvas_height();
        const pixPtr = host.canvasActor.exports.get_active_layer_pixels ? host.canvasActor.exports.get_active_layer_pixels() : 0;
        if (pixPtr && cw > 0 && ch > 0) {
          const pixels = new Uint32Array(host.canvasActor.memory.buffer, pixPtr, cw * ch);
          const x0 = Math.max(0, Math.floor(cx - rx));
          const y0 = Math.max(0, Math.floor(cy - ry));
          const x1 = Math.min(cw, Math.ceil(cx + rx));
          const y1 = Math.min(ch, Math.ceil(cy + ry));
          const rx2 = rx * rx;
          const ry2 = ry * ry;
          const limit = rx2 * ry2;
          for (let y = y0; y < y1; y++) {
            const dy = y - cy;
            const dy2_rx2 = dy * dy * rx2;
            const rowOffset = y * cw;
            for (let x = x0; x < x1; x++) {
              const dx = x - cx;
              if (dx * dx * ry2 + dy2_rx2 <= limit) {
                if (typeof host.isPixelClipped === 'function' && host.isPixelClipped(x, y)) continue;
                pixels[rowOffset + x] = 0;
              }
            }
          }
          if (host.canvasActor.exports.force_composite) host.canvasActor.exports.force_composite();
        }
      } else {
        host.pushUndoSnapshot('shape ellipse');
        host.canvasActor.exports.w_draw_ellipse(Math.round(cx), Math.round(cy), Math.round(rx), Math.round(ry), col);
        if (host.canvasActor.exports.force_composite) host.canvasActor.exports.force_composite();
      }
    }
  }

  let _lastEcoRenderTime = 0;
  let _lastSizeCheckTime = 0;
  let _lastEcoEpoch = -1;
  let _lastEcoPanX = NaN;
  let _lastEcoPanY = NaN;
  let _lastEcoZoom = NaN;
  let _lastEcoRot = NaN;
  let _lastHoverSx = NaN;
  let _lastHoverSy = NaN;

  function frame(now = performance.now()) {
    if (document.visibilityState === 'hidden') {
      requestAnimationFrame(frame);
      return;
    }
    if (host.powerSaveMode && now - _lastEcoRenderTime < 32) {
      requestAnimationFrame(frame);
      return;
    }

    const hoverMoved = Boolean(
      host.showBrushOutline !== false &&
      host.mouseHover &&
      host.mouseHover.inside &&
      (host.mouseHover.sx !== _lastHoverSx || host.mouseHover.sy !== _lastHoverSy)
    );

    const isBusy = Boolean(
      host.isDrawingOnCanvas ||
      (typeof touch !== 'undefined' && touch && (touch.drawing || touch.pending)) ||
      host.isPanning ||
      isDraggingShape ||
      isSelecting ||
      isLassoSelecting ||
      (typeof lassoPoints !== 'undefined' && lassoPoints.length > 1) ||
      ftDragging ||
      vecDragging ||
      vecWidthDragging ||
      selectScratchLayerId >= 0 ||
      (host.rasterAnimator && host.rasterAnimator.isPlaying) ||
      (host.selection && host.selection.active) ||
      hoverMoved
    );

    const curEpoch = (typeof host.canvasActor.exports.w_get_layer_epoch === 'function')
      ? host.canvasActor.exports.w_get_layer_epoch()
      : -2;

    if (
      !isBusy &&
      !host._forceNextFrame &&
      curEpoch === _lastEcoEpoch &&
      host.panX === _lastEcoPanX &&
      host.panY === _lastEcoPanY &&
      host.zoom === _lastEcoZoom &&
      (host.canvasRotation || 0) === _lastEcoRot
    ) {
      requestAnimationFrame(frame);
      return;
    }

    host._forceNextFrame = false;
    _lastEcoRenderTime = now;
    _lastEcoEpoch = curEpoch;
    _lastEcoPanX = host.panX;
    _lastEcoPanY = host.panY;
    _lastEcoZoom = host.zoom;
    _lastEcoRot = host.canvasRotation || 0;
    if (host.mouseHover && host.mouseHover.inside) {
      _lastHoverSx = host.mouseHover.sx;
      _lastHoverSy = host.mouseHover.sy;
    } else {
      _lastHoverSx = NaN;
      _lastHoverSy = NaN;
    }

    if (!host.isDrawingOnCanvas && (!touch || !touch.drawing) && now - _lastSizeCheckTime > 500 && canvasEl.parentElement) {
      _lastSizeCheckTime = now;
      const pw = canvasEl.parentElement.clientWidth;
      const ph = canvasEl.parentElement.clientHeight;
      if (pw > 0 && ph > 0 && (canvasEl.width !== pw || canvasEl.height !== ph)) {
        resize();
      }
    }
    if (host.canvasActor.exports.w_render) host.canvasActor.exports.w_render();
    const cw = host.canvasActor.exports.get_canvas_width();
    const ch = host.canvasActor.exports.get_canvas_height();
    const ptr = host.canvasActor.exports.get_composite_pixels();
    const dashOff = (Date.now() / 60) % 8;

    const useGPU = Boolean(gpuRenderer && gpuRenderer.isSupported && host.renderMode !== 'cpu' && host.renderMode !== 'software');

    if (useGPU) {
      if (uiCtx && uiCanvasEl) {
        uiCtx.clearRect(0, 0, uiCanvasEl.width, uiCanvasEl.height);
      }
      if (cw > 0 && ch > 0) {
        let finalTex = null;
        if (gpuRenderer.useLayerCompositor && gpuRenderer.compositeProgram) {
          finalTex = gpuRenderer.compositeLayersGPU(host, cw, ch);
        } else if (ptr) {
          const hasDirty = (typeof host.canvasActor.exports.w_has_dirty_rect === 'function')
            ? host.canvasActor.exports.w_has_dirty_rect()
            : 1;
          if (hasDirty || !imgData || imgData.width !== cw || imgData.height !== ch) {
            const dx0 = (typeof host.canvasActor.exports.w_get_dirty_x0 === 'function') ? host.canvasActor.exports.w_get_dirty_x0() : 0;
            const dy0 = (typeof host.canvasActor.exports.w_get_dirty_y0 === 'function') ? host.canvasActor.exports.w_get_dirty_y0() : 0;
            const dx1 = (typeof host.canvasActor.exports.w_get_dirty_x1 === 'function') ? host.canvasActor.exports.w_get_dirty_x1() : cw - 1;
            const dy1 = (typeof host.canvasActor.exports.w_get_dirty_y1 === 'function') ? host.canvasActor.exports.w_get_dirty_y1() : ch - 1;
            const dw = (!imgData || imgData.width !== cw || imgData.height !== ch) ? cw : (dx1 - dx0 + 1);
            const dh = (!imgData || imgData.width !== cw || imgData.height !== ch) ? ch : (dy1 - dy0 + 1);
            const ux0 = (!imgData || imgData.width !== cw || imgData.height !== ch) ? 0 : dx0;
            const uy0 = (!imgData || imgData.width !== cw || imgData.height !== ch) ? 0 : dy0;

            if (!imgData || imgData.width !== cw || imgData.height !== ch) {
              imgData = { width: cw, height: ch };
            }
            const wasmU8 = new Uint8Array(host.canvasActor.memory.buffer, ptr, cw * ch * 4);
            gpuRenderer.syncTexture(wasmU8, cw, ch, ux0, uy0, dw, dh);
            if (typeof host.canvasActor.exports.w_clear_dirty_bounds === 'function') {
              host.canvasActor.exports.w_clear_dirty_bounds();
            }
          }
        }
        gpuRenderer.render({
          cw,
          ch,
          panX: host.panX,
          panY: host.panY,
          zoom: host.zoom,
          canvasRotation: host.canvasRotation || 0,
          flipH: host.flipH,
          flipV: host.flipV,
          symmetry: 0
        }, finalTex);
      }
    } else if (ctx) {
      if (gpuRenderer && gpuRenderer.gl) {
        const gl = gpuRenderer.gl;
        gl.viewport(0, 0, canvasEl.width, canvasEl.height);
        gl.clearColor(29 / 255, 32 / 255, 33 / 255, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      ctx.fillStyle = '#1d2021';
      ctx.fillRect(0, 0, (uiCanvasEl || canvasEl).width, (uiCanvasEl || canvasEl).height);

      if (ptr && cw > 0 && ch > 0) {
        if (!imgData || imgData.width !== cw || imgData.height !== ch) {
          imgData = ctx.createImageData(cw, ch);
          offscreen = new OffscreenCanvas(cw, ch);
          offscreenCtx = offscreen.getContext('2d');
          new Uint32Array(imgData.data.buffer).set(new Uint32Array(host.canvasActor.memory.buffer, ptr, cw * ch));
          offscreenCtx.putImageData(imgData, 0, 0);
          if (host.canvasActor.exports.w_clear_dirty_bounds) host.canvasActor.exports.w_clear_dirty_bounds();
        } else {
          const hasDirty = (typeof host.canvasActor.exports.w_has_dirty_rect === 'function')
            ? host.canvasActor.exports.w_has_dirty_rect()
            : 1;
          if (hasDirty) {
            const dx0 = host.canvasActor.exports.w_get_dirty_x0();
            const dy0 = host.canvasActor.exports.w_get_dirty_y0();
            const dx1 = host.canvasActor.exports.w_get_dirty_x1();
            const dy1 = host.canvasActor.exports.w_get_dirty_y1();
            const dw = dx1 - dx0 + 1;
            const dh = dy1 - dy0 + 1;
            if (dw > 0 && dh > 0 && dx0 >= 0 && dy0 >= 0 && dx0 + dw <= cw && dy0 + dh <= ch) {
              const wasmU32 = new Uint32Array(host.canvasActor.memory.buffer, ptr, cw * ch);
              const imgU32 = new Uint32Array(imgData.data.buffer);
              if (dw === cw && dh === ch) {
                imgU32.set(wasmU32);
                offscreenCtx.putImageData(imgData, 0, 0);
              } else {
                for (let y = dy0; y <= dy1; y++) {
                  const rowOffset = y * cw + dx0;
                  imgU32.set(wasmU32.subarray(rowOffset, rowOffset + dw), rowOffset);
                }
                offscreenCtx.putImageData(imgData, 0, 0, dx0, dy0, dw, dh);
              }
            }
            if (typeof host.canvasActor.exports.w_clear_dirty_bounds === 'function') {
              host.canvasActor.exports.w_clear_dirty_bounds();
            }
          }
        }
      }
    }

    if (ctx && ptr && cw > 0 && ch > 0) {
      /* Draw with pan + zoom + rotation around doc center */
      const cx = host.panX + (cw * host.zoom) / 2;
      const cy = host.panY + (ch * host.zoom) / 2;
      ctx.save();
      ctx.translate(cx, cy);
      if (host.flipH) ctx.scale(-1, 1);
      if (host.flipV) ctx.scale(1, -1);
      ctx.rotate(host.canvasRotation);
      if (!useGPU && offscreen) {
        ctx.imageSmoothingEnabled = !!host.viewportFiltering;
        if (ctx.imageSmoothingEnabled) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(offscreen, -(cw * host.zoom) / 2, -(ch * host.zoom) / 2, cw * host.zoom, ch * host.zoom);
      }

      /* Live Onion Skin Frame Overlay */
      if (host.rasterAnimator && typeof host.rasterAnimator.drawOnionSkin === 'function') {
        host.rasterAnimator.drawOnionSkin(ctx, cw, ch, host.zoom);
      }

      /* Real-Time Symmetry Mirror Axis Guide Overlay */
      if (host.brushParams && host.brushParams.symmetry > 0) {
        ctx.save();
        ctx.translate(-(cw * host.zoom) / 2, -(ch * host.zoom) / 2);
        ctx.strokeStyle = 'rgba(254, 128, 25, 0.7)';
        ctx.lineWidth = 1.5 / (window.devicePixelRatio || 1);
        ctx.setLineDash([4, 4]);
        const sym = host.brushParams.symmetry;
        if (sym === 1 || sym === 3) {
          // Vertical axis
          const midX = (cw * host.zoom) / 2;
          ctx.beginPath();
          ctx.moveTo(midX, 0);
          ctx.lineTo(midX, ch * host.zoom);
          ctx.stroke();
        }
        if (sym === 2 || sym === 3) {
          // Horizontal axis
          const midY = (ch * host.zoom) / 2;
          ctx.beginPath();
          ctx.moveTo(0, midY);
          ctx.lineTo(cw * host.zoom, midY);
          ctx.stroke();
        }
        ctx.restore();
      }

      /* Real-Time Pulled String (Lazy Nezumi) Visual Leash Guide */
      if (host.isDrawingOnCanvas && host.pulledAnchor && host.pulledCursor) {
        ctx.save();
        ctx.translate(-(cw * host.zoom) / 2, -(ch * host.zoom) / 2);
        const ax = host.pulledAnchor.x * host.zoom;
        const ay = host.pulledAnchor.y * host.zoom;
        const px = host.pulledCursor.x * host.zoom;
        const py = host.pulledCursor.y * host.zoom;
        const smoothVal = host.brushParams?.smoothing || 0;
        const sRad = ((smoothVal > 0)
          ? Math.max(5, smoothVal * 1.5)
          : ((host.brushParams?.string_length !== undefined && host.brushParams.string_length > 0)
              ? host.brushParams.string_length
              : 30)) * host.zoom;

        // 1. Leash Line
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(px, py);
        ctx.strokeStyle = '#fabd2f';
        ctx.lineWidth = 1.5 / (window.devicePixelRatio || 1);
        ctx.setLineDash([3, 3]);
        ctx.stroke();

        // 2. Dab Anchor Point
        ctx.beginPath();
        ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fabd2f';
        ctx.fill();

        // 3. Radius Leash Ring
        ctx.beginPath();
        ctx.arc(ax, ay, sRad, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(254, 128, 25, 0.4)';
        ctx.lineWidth = 1.0 / (window.devicePixelRatio || 1);
        ctx.setLineDash([]);
        ctx.stroke();

        ctx.restore();
      }

      /* Optional Pixel Grid Overlay (when zoomed) */
      if (host.showPixelGrid && host.zoom >= 4) {
        ctx.save();
        ctx.translate(-(cw * host.zoom) / 2, -(ch * host.zoom) / 2);
        ctx.strokeStyle = 'rgba(235, 219, 178, 0.18)';
        ctx.lineWidth = 1 / (window.devicePixelRatio || 1);
        ctx.beginPath();
        const step = host.zoom;
        const totalW = cw * step;
        const totalH = ch * step;
        for (let x = 0; x <= totalW; x += step) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, totalH);
        }
        for (let y = 0; y <= totalH; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(totalW, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      /* Live Brush Selection Scratch Preview Overlay */
      if (selectScratchLayerId >= 0 && host.isDrawingOnCanvas && host.actionMode === 'select') {
        const sPtr = host.canvasActor.exports.w_layer_get_pixels(selectScratchLayerId);
        const sW = host.canvasActor.exports.w_layer_get_width(selectScratchLayerId);
        const sH = host.canvasActor.exports.w_layer_get_height(selectScratchLayerId);
        if (sPtr && sW > 0 && sH > 0) {
          if (!selectPreviewCanvas || selectPreviewCanvas.width !== sW || selectPreviewCanvas.height !== sH) {
            selectPreviewCanvas = document.createElement('canvas');
            selectPreviewCanvas.width = sW;
            selectPreviewCanvas.height = sH;
            selectPreviewCtx = selectPreviewCanvas.getContext('2d');
            selectPreviewImg = selectPreviewCtx.createImageData(sW, sH);
          }
          const src32 = new Uint32Array(host.canvasActor.memory.buffer, sPtr, sW * sH);
          const dst32 = new Uint32Array(selectPreviewImg.data.buffer);
          for (let i = 0; i < src32.length; i++) {
            dst32[i] = (src32[i] >>> 24) > 0 ? 0x8098A583 : 0;
          }
          selectPreviewCtx.putImageData(selectPreviewImg, 0, 0);
          ctx.save();
          ctx.translate(-(cw * host.zoom) / 2, -(ch * host.zoom) / 2);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(selectPreviewCanvas, 0, 0, cw * host.zoom, ch * host.zoom);
          ctx.restore();
        }
      }

      /* Live Lasso Polygon Preview Overlay */
      if (lassoPoints.length > 1) {
        ctx.save();
        ctx.translate(-(cw * host.zoom) / 2, -(ch * host.zoom) / 2);

        ctx.beginPath();
        ctx.moveTo(lassoPoints[0].x * host.zoom, lassoPoints[0].y * host.zoom);
        for (let i = 1; i < lassoPoints.length; i++) {
          ctx.lineTo(lassoPoints[i].x * host.zoom, lassoPoints[i].y * host.zoom);
        }
        ctx.closePath();

        if (host.actionMode === 'select') {
          ctx.fillStyle = 'rgba(131, 165, 152, 0.15)';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = '#000000'; ctx.lineDashOffset = dashOff; ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineDashOffset = dashOff + 4; ctx.stroke();
        } else {
          const c = host.currentColor !== undefined ? host.currentColor : 0xFFEBDBB2;
          const r = c & 0xFF, g = (c >> 8) & 0xFF, b = (c >> 16) & 0xFF;
          ctx.fillStyle = host.actionMode === 'erase'
            ? 'rgba(251, 73, 52, 0.35)'
            : `rgba(${r}, ${g}, ${b}, 0.28)`;
          ctx.fill();
          ctx.strokeStyle = host.actionMode === 'erase' ? '#fb4934' : '#fabd2f';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.lineDashOffset = (Date.now() / 40) % 10;
          ctx.stroke();
        }

        ctx.restore();
      }

      /* Live Shape Preview Overlay (Line, Rect, Ellipse) */
      if (isDraggingShape && shapeStartDoc && shapeCurDoc) {
        ctx.save();
        ctx.translate(-(cw * host.zoom) / 2, -(ch * host.zoom) / 2);

        const c = host.currentColor !== undefined ? host.currentColor : 0xFFEBDBB2;
        const r = c & 0xFF, g = (c >> 8) & 0xFF, b = (c >> 16) & 0xFF;
        const a = ((c >> 24) & 0xFF) / 255;
        ctx.strokeStyle = host.actionMode === 'erase' ? 'rgba(251, 73, 52, 0.8)' : `rgba(${r}, ${g}, ${b}, ${Math.max(0.4, a)})`;
        ctx.lineWidth = Math.max(1, (host.brushParams?.size || 1) * host.zoom);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const sx = shapeStartDoc.x * host.zoom;
        const sy = shapeStartDoc.y * host.zoom;
        const ex = shapeCurDoc.x * host.zoom;
        const ey = shapeCurDoc.y * host.zoom;

        const curMode = host.brushParams ? host.brushParams.mode : 0;
        if (curMode === 6) { // Line
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        } else if (curMode === 7) { // Filled Rect
          const rx = Math.min(sx, ex);
          const ry = Math.min(sy, ey);
          const rw = Math.abs(ex - sx);
          const rh = Math.abs(ey - sy);
          if (host.actionMode === 'select') {
            ctx.fillStyle = 'rgba(131, 165, 152, 0.15)';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = '#000000'; ctx.lineDashOffset = dashOff;
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.strokeStyle = '#ffffff'; ctx.lineDashOffset = dashOff + 4;
            ctx.strokeRect(rx, ry, rw, rh);
          } else {
            ctx.fillStyle = host.actionMode === 'erase'
              ? 'rgba(251, 73, 52, 0.35)'
              : `rgba(${r}, ${g}, ${b}, ${Math.max(0.35, a * 0.5)})`;
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeRect(rx, ry, rw, rh);
          }
        } else if (curMode === 8) { // Filled Ellipse
          const cx_e = (sx + ex) / 2;
          const cy_e = (sy + ey) / 2;
          const radX = Math.abs(ex - sx) / 2;
          const radY = Math.abs(ey - sy) / 2;
          if (radX > 0 && radY > 0) {
            ctx.beginPath();
            ctx.ellipse(cx_e, cy_e, radX, radY, 0, 0, Math.PI * 2);
            if (host.actionMode === 'select') {
              ctx.fillStyle = 'rgba(131, 165, 152, 0.15)';
              ctx.fill();
              ctx.lineWidth = 1.5;
              ctx.setLineDash([4, 4]);
              ctx.strokeStyle = '#000000'; ctx.lineDashOffset = dashOff;
              ctx.stroke();
              ctx.strokeStyle = '#ffffff'; ctx.lineDashOffset = dashOff + 4;
              ctx.stroke();
            } else {
              ctx.fillStyle = host.actionMode === 'erase'
                ? 'rgba(251, 73, 52, 0.35)'
                : `rgba(${r}, ${g}, ${b}, ${Math.max(0.35, a * 0.5)})`;
              ctx.fill();
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      /* Live Selection / Marching Ants Overlay */
      if (host.selection && host.selection.active && host.selection.w > 0 && host.selection.h > 0) {
        ctx.save();
        ctx.translate(-(cw * host.zoom) / 2, -(ch * host.zoom) / 2);

        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        if (host.selection.mask) {
          // Custom selection (lasso/wand mask): extract continuous boundary loops for identical visual style
          const sel = host.selection;
          const z = host.zoom;
          if (!sel._maskLoops || sel._maskVer !== sel.mask) {
            const mw = sel.w, mh = sel.h, m = sel.mask;
            const adj = new Map();
            const addEdge = (x0, y0, x1, y1) => {
              const u = (y0 << 16) | x0;
              const v = (y1 << 16) | x1;
              let list = adj.get(u);
              if (!list) { list = []; adj.set(u, list); }
              list.push(v);
            };

            for (let my = 0; my < mh; my++) {
              const row = my * mw;
              for (let mx = 0; mx < mw; mx++) {
                if (!m[row + mx]) continue;
                // Clockwise oriented perimeter edges
                if (my === 0 || !m[row - mw + mx]) addEdge(mx, my, mx + 1, my); // top: right
                if (mx === mw - 1 || !m[row + mx + 1]) addEdge(mx + 1, my, mx + 1, my + 1); // right: down
                if (my === mh - 1 || !m[row + mw + mx]) addEdge(mx + 1, my + 1, mx, my + 1); // bottom: left
                if (mx === 0 || !m[row + mx - 1]) addEdge(mx, my + 1, mx, my); // left: up
              }
            }

            const loops = [];
            const maxIter = mw * mh * 4 + 10;
            for (const [startU, targets] of adj) {
              while (targets.length > 0) {
                const loop = [];
                let cur = startU;
                let iter = 0;
                while (iter++ < maxIter) {
                  loop.push({ x: cur & 0xFFFF, y: cur >> 16 });
                  const list = adj.get(cur);
                  if (!list || list.length === 0) break;
                  const nxt = list.pop();
                  if (nxt === startU) break;
                  cur = nxt;
                }
                if (loop.length >= 3) loops.push(loop);
              }
            }
            sel._maskLoops = loops;
            sel._maskVer = sel.mask;
          }

          const loops = sel._maskLoops;
          if (loops && loops.length > 0) {
            // Identical style: 1. Semi-transparent cyan fill
            ctx.fillStyle = 'rgba(131, 165, 152, 0.15)';
            ctx.beginPath();
            for (const loop of loops) {
              ctx.moveTo((sel.x + loop[0].x) * z, (sel.y + loop[0].y) * z);
              for (let i = 1; i < loop.length; i++) {
                ctx.lineTo((sel.x + loop[i].x) * z, (sel.y + loop[i].y) * z);
              }
              ctx.closePath();
            }
            ctx.fill('evenodd');

            // Identical style: 2. Two-pass marching ants (black & white dashed stroke)
            ctx.strokeStyle = '#000000';
            ctx.lineDashOffset = dashOff;
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineDashOffset = dashOff + 4;
            ctx.stroke();
          }
        } else {
          // Rectangular selection: draw exact rectangle marching ants
          const selX = host.selection.x * host.zoom;
          const selY = host.selection.y * host.zoom;
          const selW = host.selection.w * host.zoom;
          const selH = host.selection.h * host.zoom;
          ctx.fillStyle = 'rgba(131, 165, 152, 0.15)';
          ctx.fillRect(selX, selY, selW, selH);
          ctx.strokeStyle = '#000000'; ctx.lineDashOffset = dashOff; ctx.strokeRect(selX, selY, selW, selH);
          ctx.strokeStyle = '#ffffff'; ctx.lineDashOffset = dashOff + 4; ctx.strokeRect(selX, selY, selW, selH);
        }

        ctx.restore();
      }

      /* Live Lasso Selection Polygon preview (while dragging in mode 10) */
      if (isLassoSelecting && lassoSelPoints.length > 1) {
        ctx.save();
        ctx.translate(-(cw * host.zoom) / 2, -(ch * host.zoom) / 2);
        ctx.beginPath();
        ctx.moveTo(lassoSelPoints[0].x * host.zoom, lassoSelPoints[0].y * host.zoom);
        for (let i = 1; i < lassoSelPoints.length; i++) {
          ctx.lineTo(lassoSelPoints[i].x * host.zoom, lassoSelPoints[i].y * host.zoom);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(131, 165, 152, 0.15)';
        ctx.fill();

        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#000000';
        ctx.lineDashOffset = dashOff;
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineDashOffset = dashOff + 4;
        ctx.stroke();
        ctx.restore();
      }

      /* Live Rect Selection Preview (when dragging in mode 9 and mode is not replace) */
      if (isSelecting && selStartDoc && selCurDoc && host.selectionMode !== 'replace') {
        ctx.save();
        ctx.translate(-(cw * host.zoom) / 2, -(ch * host.zoom) / 2);
        const z = host.zoom;
        const rx = Math.min(selStartDoc.x, selCurDoc.x) * z;
        const ry = Math.min(selStartDoc.y, selCurDoc.y) * z;
        const rw = Math.abs(selCurDoc.x - selStartDoc.x) * z;
        const rh = Math.abs(selCurDoc.y - selStartDoc.y) * z;
        ctx.fillStyle = 'rgba(131, 165, 152, 0.15)';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#000000';
        ctx.lineDashOffset = dashOff;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.strokeStyle = '#ffffff';
        ctx.lineDashOffset = dashOff + 4;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.restore();
      }

      /* Float Transform Overlay — perspective quad outline + handles */
      if (host.floatingTransform && host.floatingTransform.corners) {
        const ft = host.floatingTransform;
        const c = ft.corners;
        const z = host.zoom;
        ctx.save();
        ctx.translate(-(cw * host.zoom) / 2, -(ch * host.zoom) / 2);

        // Hardware-accelerated live transform preview during active drag
        if (ftDragging && ft.pixels) {
          const pcvs = getFtPreviewCanvas(ft);
          if (pcvs) {
            ctx.save();
            ctx.imageSmoothingEnabled = (host.transformInterpolation === 'bilinear');
            const tMode = host.transformMode || 'scale';
            if (tMode !== 'distort' && tMode !== 'perspective') {
              const m00 = (c[1].x - c[0].x) * z / ft.width;
              const m10 = (c[1].y - c[0].y) * z / ft.width;
              const m01 = (c[3].x - c[0].x) * z / ft.height;
              const m11 = (c[3].y - c[0].y) * z / ft.height;
              ctx.transform(m00, m10, m01, m11, c[0].x * z, c[0].y * z);
              ctx.drawImage(pcvs, 0, 0);
            } else {
              drawWarpedQuad(ctx, pcvs, c, z, ft.width, ft.height);
            }
            ctx.restore();
          }
        }

        // Draw quad outline
        ctx.beginPath();
        ctx.moveTo(c[0].x * z, c[0].y * z);
        ctx.lineTo(c[1].x * z, c[1].y * z);
        ctx.lineTo(c[2].x * z, c[2].y * z);
        ctx.lineTo(c[3].x * z, c[3].y * z);
        ctx.closePath();
        ctx.fillStyle = 'rgba(250, 189, 47, 0.08)';
        ctx.fill();
        ctx.strokeStyle = '#fabd2f';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();

        // Center move crosshair
        const cxDoc = (c[0].x + c[1].x + c[2].x + c[3].x) / 4;
        const cyDoc = (c[0].y + c[1].y + c[2].y + c[3].y) / 4;
        const cx = cxDoc * z;
        const cy = cyDoc * z;
        ctx.setLineDash([]);
        ctx.strokeStyle = '#ebdbb2';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
        ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
        ctx.stroke();

        // Rotation Stem & Knob above top edge midpoint
        const topMid = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 };
        let vx = topMid.x - cxDoc;
        let vy = topMid.y - cyDoc;
        let len = Math.hypot(vx, vy);
        let nx = 0, ny = -1;
        if (len > 1e-4) { nx = vx / len; ny = vy / len; }
        const rotDistDoc = 24 / z;
        const rxDoc = topMid.x + nx * rotDistDoc;
        const ryDoc = topMid.y + ny * rotDistDoc;

        // Stem line
        ctx.beginPath();
        ctx.moveTo(topMid.x * z, topMid.y * z);
        ctx.lineTo(rxDoc * z, ryDoc * z);
        ctx.strokeStyle = '#fabd2f';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Rotation handle circular knob
        const rotPx = rxDoc * z;
        const rotPy = ryDoc * z;
        ctx.beginPath();
        ctx.arc(rotPx, rotPy, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fabd2f';
        ctx.fill();
        ctx.strokeStyle = '#1d2021';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(rotPx, rotPy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#1d2021';
        ctx.fill();

        // Edge midpoint handles (cyan diamond) — skew: moves adjacent pair
        const edgeMids = [
          [(c[0].x + c[1].x)/2 * z, (c[0].y + c[1].y)/2 * z],
          [(c[1].x + c[2].x)/2 * z, (c[1].y + c[2].y)/2 * z],
          [(c[2].x + c[3].x)/2 * z, (c[2].y + c[3].y)/2 * z],
          [(c[3].x + c[0].x)/2 * z, (c[3].y + c[0].y)/2 * z],
        ];
        const ds = 7; // diamond half-size
        for (const [mx, my] of edgeMids) {
          ctx.beginPath();
          ctx.moveTo(mx, my - ds);
          ctx.lineTo(mx + ds, my);
          ctx.lineTo(mx, my + ds);
          ctx.lineTo(mx - ds, my);
          ctx.closePath();
          ctx.fillStyle = '#83a598';
          ctx.fill();
          ctx.strokeStyle = '#1d2021';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Corner handles (gold boxes) — perspective control, each moves independently
        const hs = 12;
        for (let i = 0; i < 4; i++) {
          const px = c[i].x * z, py = c[i].y * z;
          ctx.fillStyle = '#fabd2f';
          ctx.fillRect(px - hs/2, py - hs/2, hs, hs);
          ctx.strokeStyle = '#1d2021';
          ctx.lineWidth = 2;
          ctx.strokeRect(px - hs/2, py - hs/2, hs, hs);
          ctx.fillStyle = '#1d2021';
          ctx.fillRect(px - 2, py - 2, 4, 4);
        }

        ctx.restore();
      }

      /* ── Vector Painter Bézier Node & Handle Overlay ── */
      if (host.isVectorLayer && host.isVectorLayer() && (host.actionMode === 'vector' || vecDragging)) {
        const vl = host.getVectorLayer();
        if (vl && ((Array.isArray(vl.paths) && vl.paths.length > 0) || (vecDragging && vecDragging.type === 'marquee'))) {
          ctx.save();
          ctx.translate(-(cw * host.zoom) / 2, -(ch * host.zoom) / 2);
          const z = host.zoom;
          const selPath = host.getSelectedVectorPath();
          const rawSelNodes = host.getSelectedVectorNodeIndices ? host.getSelectedVectorNodeIndices() : [];
          const selNodeSet = rawSelNodes instanceof Set ? rawSelNodes : new Set(Array.isArray(rawSelNodes) ? rawSelNodes : []);

          // 1. Subtle spine outline for unselected vector paths on this layer
          for (const p of (vl.paths || [])) {
            if (!p || p.visible === false || !Array.isArray(p.nodes) || p.nodes.length === 0) continue;
            if (selPath && p.id === selPath.id) continue;
            ctx.beginPath();
            ctx.moveTo(p.nodes[0].x * z, p.nodes[0].y * z);
            const segCount = p.closed ? p.nodes.length : p.nodes.length - 1;
            for (let i = 0; i < segCount; i++) {
              const n0 = p.nodes[i];
              const n1 = p.nodes[(i + 1) % p.nodes.length];
              const cp1 = typeof n0.getAbsCpOut === 'function' ? n0.getAbsCpOut() : { x: n0.x + (n0.cpOut?.x || 0), y: n0.y + (n0.cpOut?.y || 0) };
              const cp2 = typeof n1.getAbsCpIn === 'function' ? n1.getAbsCpIn() : { x: n1.x + (n1.cpIn?.x || 0), y: n1.y + (n1.cpIn?.y || 0) };
              ctx.bezierCurveTo(cp1.x * z, cp1.y * z, cp2.x * z, cp2.y * z, n1.x * z, n1.y * z);
            }
            ctx.strokeStyle = 'rgba(131, 165, 152, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
          }

          // 2. Full interactive spine, width rings, tangent handles, and anchor nodes for selected path
          if (selPath && Array.isArray(selPath.nodes) && selPath.nodes.length > 0) {
            const baseW = Math.max(2, selPath.strokeWidth || 8);
            const isWidthTool = (host.vectorSubTool === 'width');
            const segCount = selPath.closed ? selPath.nodes.length : selPath.nodes.length - 1;

            // Live 60fps 2D variable-width preview while dragging nodes/handles/curves/width (deferred WASM render)
            if ((vecDragging && vecDragging.moved && vecDragging.type !== 'marquee') || vecWidthDragging) {
              ctx.save();
              ctx.setLineDash([]);
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.strokeStyle = selPath.stroke || '#ebdbb2';
              ctx.globalAlpha = Math.max(0.45, Math.min(0.85, (selPath.opacity ?? 1.0) * 0.78));
              const steps = 12;
              for (let i = 0; i < segCount; i++) {
                const n0 = selPath.nodes[i];
                const n1 = selPath.nodes[(i + 1) % selPath.nodes.length];
                const cp1 = typeof n0.getAbsCpOut === 'function' ? n0.getAbsCpOut() : { x: n0.x + (n0.cpOut?.x || 0), y: n0.y + (n0.cpOut?.y || 0) };
                const cp2 = typeof n1.getAbsCpIn === 'function' ? n1.getAbsCpIn() : { x: n1.x + (n1.cpIn?.x || 0), y: n1.y + (n1.cpIn?.y || 0) };
                const w0 = baseW * (n0.widthScale ?? 1.0) * (0.2 + 0.8 * (n0.pressure ?? 1.0));
                const w1 = baseW * (n1.widthScale ?? 1.0) * (0.2 + 0.8 * (n1.pressure ?? 1.0));
                let prevX = n0.x, prevY = n0.y;
                for (let s = 1; s <= steps; s++) {
                  const t = s / steps;
                  const mt = 1 - t;
                  const bx = mt * mt * mt * n0.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * n1.x;
                  const by = mt * mt * mt * n0.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * n1.y;
                  const bw = w0 + (w1 - w0) * t;
                  ctx.beginPath();
                  ctx.moveTo(prevX * z, prevY * z);
                  ctx.lineTo(bx * z, by * z);
                  ctx.lineWidth = Math.max(1, bw * z);
                  ctx.stroke();
                  prevX = bx;
                  prevY = by;
                }
              }
              ctx.restore();
            }

            ctx.setLineDash([]);
            if (segCount > 0) {
              ctx.beginPath();
              ctx.moveTo(selPath.nodes[0].x * z, selPath.nodes[0].y * z);
              for (let i = 0; i < segCount; i++) {
                const n0 = selPath.nodes[i];
                const n1 = selPath.nodes[(i + 1) % selPath.nodes.length];
                const cp1 = typeof n0.getAbsCpOut === 'function' ? n0.getAbsCpOut() : { x: n0.x + (n0.cpOut?.x || 0), y: n0.y + (n0.cpOut?.y || 0) };
                const cp2 = typeof n1.getAbsCpIn === 'function' ? n1.getAbsCpIn() : { x: n1.x + (n1.cpIn?.x || 0), y: n1.y + (n1.cpIn?.y || 0) };
                ctx.bezierCurveTo(cp1.x * z, cp1.y * z, cp2.x * z, cp2.y * z, n1.x * z, n1.y * z);
              }
              ctx.strokeStyle = 'rgba(29, 32, 33, 0.85)';
              ctx.lineWidth = 3.5;
              ctx.stroke();
              ctx.strokeStyle = '#8ec07c';
              ctx.lineWidth = 1.75;
              ctx.stroke();
            }

            // Pen Tool Rubber-Band Preview to Cursor
            if (host.vectorSubTool === 'pen' && selPath.id === vecPenActivePathId && !selPath.closed && host.mouseHover && host.mouseHover.inside && !vecDragging) {
              const lastNode = selPath.nodes[selPath.nodes.length - 1];
              const cp1 = typeof lastNode.getAbsCpOut === 'function'
                ? lastNode.getAbsCpOut()
                : { x: lastNode.x + (lastNode.cpOut?.x || 0), y: lastNode.y + (lastNode.cpOut?.y || 0) };
              const hx = host.mouseHover.x, hy = host.mouseHover.y;
              ctx.save();
              ctx.beginPath();
              ctx.moveTo(lastNode.x * z, lastNode.y * z);
              ctx.bezierCurveTo(cp1.x * z, cp1.y * z, hx * z, hy * z, hx * z, hy * z);
              ctx.strokeStyle = 'rgba(250, 189, 47, 0.85)';
              ctx.lineWidth = 1.75;
              ctx.setLineDash([5, 4]);
              ctx.stroke();
              ctx.setLineDash([]);

              // If hovering near start node (and >= 2 nodes), show close-loop indicator ring
              if (selPath.nodes.length >= 2) {
                const firstNode = selPath.nodes[0];
                const hitRad = 13 / Math.max(0.1, z);
                if (Math.hypot(hx - firstNode.x, hy - firstNode.y) <= hitRad) {
                  ctx.beginPath();
                  ctx.arc(firstNode.x * z, firstNode.y * z, 11, 0, Math.PI * 2);
                  ctx.strokeStyle = '#b8bb26';
                  ctx.lineWidth = 2.2;
                  ctx.stroke();
                }
              }
              ctx.restore();
            }

            // Check marquee preview bounds if dragging marquee box
            const mq = (vecDragging && vecDragging.type === 'marquee' && vecDragging.moved) ? {
              minX: Math.min(vecDragging.startX, vecDragging.curX),
              maxX: Math.max(vecDragging.startX, vecDragging.curX),
              minY: Math.min(vecDragging.startY, vecDragging.curY),
              maxY: Math.max(vecDragging.startY, vecDragging.curY)
            } : null;

            selPath.nodes.forEach((n, idx) => {
              const nx = n.x * z, ny = n.y * z;
              const inMarquee = mq && (n.x >= mq.minX && n.x <= mq.maxX && n.y >= mq.minY && n.y <= mq.maxY);
              const isSelNode = (idx === vl.selectedNodeIdx) || selNodeSet.has(idx) || inMarquee;
              const isPrimaryNode = (idx === vl.selectedNodeIdx);

              // Width / Pressure visualization ring
              if (isWidthTool || isSelNode) {
                const effR = Math.max(3, (baseW * (n.widthScale ?? 1.0) * (0.2 + 0.8 * (n.pressure ?? 1.0)))) * z;
                ctx.beginPath();
                ctx.arc(nx, ny, effR, 0, Math.PI * 2);
                ctx.strokeStyle = isSelNode ? 'rgba(211, 134, 155, 0.9)' : 'rgba(211, 134, 155, 0.45)';
                ctx.lineWidth = isSelNode ? 1.8 : 1.1;
                ctx.setLineDash([3, 3]);
                ctx.stroke();
                ctx.setLineDash([]);
              }

              // Tangent handles (cpIn / cpOut) when not in width sub-tool
              if (!isWidthTool) {
                const absIn = typeof n.getAbsCpIn === 'function' ? n.getAbsCpIn() : { x: n.x + (n.cpIn?.x || 0), y: n.y + (n.cpIn?.y || 0) };
                const absOut = typeof n.getAbsCpOut === 'function' ? n.getAbsCpOut() : { x: n.x + (n.cpOut?.x || 0), y: n.y + (n.cpOut?.y || 0) };
                const hasIn = Math.hypot(absIn.x - n.x, absIn.y - n.y) > 0.5;
                const hasOut = Math.hypot(absOut.x - n.x, absOut.y - n.y) > 0.5;
                if (hasIn) {
                  const ix = absIn.x * z, iy = absIn.y * z;
                  ctx.beginPath();
                  ctx.moveTo(nx, ny);
                  ctx.lineTo(ix, iy);
                  ctx.strokeStyle = isSelNode ? '#fe8019' : 'rgba(254, 128, 25, 0.65)';
                  ctx.lineWidth = 1.25;
                  ctx.stroke();

                  ctx.beginPath();
                  ctx.arc(ix, iy, isSelNode ? 4.5 : 3.5, 0, Math.PI * 2);
                  ctx.fillStyle = '#fe8019';
                  ctx.fill();
                  ctx.strokeStyle = '#1d2021';
                  ctx.lineWidth = 1.2;
                  ctx.stroke();
                }
                if (hasOut) {
                  const ox = absOut.x * z, oy = absOut.y * z;
                  ctx.beginPath();
                  ctx.moveTo(nx, ny);
                  ctx.lineTo(ox, oy);
                  ctx.strokeStyle = isSelNode ? '#fabd2f' : 'rgba(250, 189, 47, 0.65)';
                  ctx.lineWidth = 1.25;
                  ctx.stroke();

                  ctx.beginPath();
                  ctx.arc(ox, oy, isSelNode ? 4.5 : 3.5, 0, Math.PI * 2);
                  ctx.fillStyle = '#fabd2f';
                  ctx.fill();
                  ctx.strokeStyle = '#1d2021';
                  ctx.lineWidth = 1.2;
                  ctx.stroke();
                }
              }

              // Multi-select outer halo ring
              if (isSelNode && selNodeSet.size > 1) {
                ctx.beginPath();
                ctx.arc(nx, ny, 9.5, 0, Math.PI * 2);
                ctx.strokeStyle = isPrimaryNode ? '#fe8019' : 'rgba(250, 189, 47, 0.75)';
                ctx.lineWidth = 1.6;
                ctx.stroke();
              }

              // Anchor Node (Square for corner, Diamond for cusp, Circle for smooth/symmetric)
              const rNode = isSelNode ? 6.5 : 5.0;
              ctx.fillStyle = isSelNode ? '#fabd2f' : (isWidthTool ? '#d3869b' : '#ebdbb2');
              ctx.strokeStyle = '#1d2021';
              ctx.lineWidth = 1.75;
              if (n.type === 'corner') {
                ctx.fillRect(nx - rNode, ny - rNode, rNode * 2, rNode * 2);
                ctx.strokeRect(nx - rNode, ny - rNode, rNode * 2, rNode * 2);
              } else if (n.type === 'cusp') {
                ctx.beginPath();
                ctx.moveTo(nx, ny - rNode * 1.2);
                ctx.lineTo(nx + rNode * 1.2, ny);
                ctx.lineTo(nx, ny + rNode * 1.2);
                ctx.lineTo(nx - rNode * 1.2, ny);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
              } else {
                ctx.beginPath();
                ctx.arc(nx, ny, rNode, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
              }
            });
          }

          // 3. Vector Node Marquee Selection Box
          if (vecDragging && vecDragging.type === 'marquee' && vecDragging.moved) {
            const rx = Math.min(vecDragging.startX, vecDragging.curX) * z;
            const ry = Math.min(vecDragging.startY, vecDragging.curY) * z;
            const rw = Math.abs(vecDragging.curX - vecDragging.startX) * z;
            const rh = Math.abs(vecDragging.curY - vecDragging.startY) * z;
            ctx.save();
            ctx.fillStyle = 'rgba(142, 192, 124, 0.14)';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = '#8ec07c';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.restore();
          }

          ctx.restore();
        }
      }

      /* Live Brush Cursor Outline (Photoshop-style Delimiter) */
      if (host.showBrushOutline !== false && host.mouseHover && host.mouseHover.inside && !host.isPanning) {
        const bp = host.brushParams;
        if (bp && (host.actionMode === 'draw' || host.actionMode === 'erase' || host.actionMode === 'smudge' || host.actionMode === 'select')) {
          const curMode = bp.mode || 0;
          if (curMode <= 2 || curMode === 6 || (host.actionMode === 'select' && (curMode === 0 || curMode === 1 || curMode === 2))) {
            const size = Math.max(1, bp.size || 1);
            const r = size;
            const roundness = (bp.roundness !== undefined ? bp.roundness : 100) / 100;
            const angleRad = ((bp.angle || 0) * Math.PI) / 180;
            const radX = r * host.zoom;
            const radY = Math.max(1, r * roundness * host.zoom);
            const shape = bp.shape || 0;

            const drawOutlineAt = (docX, docY, alpha = 1.0) => {
              ctx.save();
              ctx.translate(-(cw * host.zoom) / 2, -(ch * host.zoom) / 2);
              ctx.translate(docX * host.zoom, docY * host.zoom);
              ctx.rotate(angleRad);

              ctx.beginPath();
              if (shape === 1) { // Square
                const sw = Math.max(2, radX * 2);
                const sh = Math.max(2, radY * 2);
                ctx.rect(-sw / 2, -sh / 2, sw, sh);
              } else if (shape === 2) { // Chisel
                const cw_b = Math.max(2, radX * 2);
                const ch_b = Math.max(2, radY * 2);
                ctx.rect(-cw_b / 2, -ch_b / 2, cw_b, ch_b);
              } else { // Circle / Ellipse / Texture Stamp
                ctx.ellipse(0, 0, Math.max(1, radX), Math.max(1, radY), 0, 0, Math.PI * 2);
              }

              // Dual-pass stroke for maximum contrast on any background
              ctx.setLineDash([]);
              ctx.lineWidth = 2.5 / (window.devicePixelRatio || 1);
              ctx.strokeStyle = `rgba(0, 0, 0, ${0.7 * alpha})`;
              ctx.stroke();

              ctx.lineWidth = 1.0 / (window.devicePixelRatio || 1);
              ctx.strokeStyle = `rgba(255, 255, 255, ${0.95 * alpha})`;
              ctx.stroke();

              // Center crosshair / dot
              if (alpha > 0.5) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(-1, -1, 2, 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.fillRect(-0.5, -0.5, 1, 1);
              }

              ctx.restore();
            };

            // Main cursor outline
            const mx = host.mouseHover.x;
            const my = host.mouseHover.y;
            drawOutlineAt(mx, my, 1.0);

            // Symmetrical ghost outlines if symmetry is active
            if (bp.symmetry > 0) {
              if (bp.symmetry === 1 || bp.symmetry === 3) {
                drawOutlineAt(cw - mx, my, 0.65);
              }
              if (bp.symmetry === 2 || bp.symmetry === 3) {
                drawOutlineAt(mx, ch - my, 0.65);
              }
              if (bp.symmetry === 3) {
                drawOutlineAt(cw - mx, ch - my, 0.65);
              }
            }
          }
        }
      }

      ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ── Coordinate helpers ── */
  const _scratchPoint = { sx: 0, sy: 0, x: 0, y: 0 };
  const _scratchDoc = { x: 0, y: 0 };

  /* Screen → document space, accounting for pan/zoom/rotation/flip */
  function screenToDoc(sx, sy) {
    const cw = host.canvasActor.exports.get_canvas_width();
    const ch = host.canvasActor.exports.get_canvas_height();
    const ocx = host.panX + (cw * host.zoom) / 2; /* rotation origin on screen */
    const ocy = host.panY + (ch * host.zoom) / 2;
    /* unflip */
    let dx = sx - ocx;
    let dy = sy - ocy;
    if (host.flipH) dx = -dx;
    if (host.flipV) dy = -dy;
    /* unrotate around origin */
    const cosA = Math.cos(-host.canvasRotation);
    const sinA = Math.sin(-host.canvasRotation);
    const rx = dx * cosA - dy * sinA;
    const ry = dx * sinA + dy * cosA;
    /* unzoom + unpan */
    _scratchDoc.x = (rx + (cw * host.zoom) / 2) / host.zoom;
    _scratchDoc.y = (ry + (ch * host.zoom) / 2) / host.zoom;
    return _scratchDoc;
  }

  function clientPos(e) {
    const r = _cachedCanvasRect || (_cachedCanvasRect = canvasEl.getBoundingClientRect());
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const doc = screenToDoc(sx, sy);
    _scratchPoint.sx = sx;
    _scratchPoint.sy = sy;
    _scratchPoint.x = doc.x;
    _scratchPoint.y = doc.y;
    return _scratchPoint;
  }

  /* ── Eyedropper / Color Picker Ring ── */
  const ringEl = document.getElementById('eyedropper-ring');
  const ringInnerEl = document.getElementById('eyedropper-inner');
  let isTouchPicker = false;

  function showEyedropper(cx, cy, hex) {
    if (ringEl) {
      ringEl.style.display = 'flex';
      ringEl.style.left = `${cx}px`;
      ringEl.style.top = `${cy}px`;
    }
    if (ringInnerEl) ringInnerEl.style.background = hex;
  }

  function hideEyedropper() {
    if (ringEl) ringEl.style.display = 'none';
  }

  function sampleEyedropperColor(x, y, cx, cy) {
    const hex = host.pickColor(x, y, true);
    updateColorControlsFromHex(hex);
    showEyedropper(cx, cy, hex);
    return hex;
  }

  /* ── VS Code / Monaco Context Menu Architecture (with Inline Widgets & Embedded DOM Panels) ── */
  class MonacoMenu {
    constructor(container, actions, options = {}) {
      this.container = container;
      this.actions = actions || [];
      this.options = options;
      this.parentMenu = options.parentMenu || null;
      this.parentItem = options.parentItem || null;
      this.service = options.service || window.contextMenuService;
      this.activeSubmenu = null;
      this.focusedIndex = -1;
      this.items = [];
      this.showTimer = null;
      this.hideTimer = null;
      this.mountedPanels = [];
      this.pendingMounts = [];
      this.lastAnchor = null;
      this.resizeObserver = null;
      this.render();
    }

    render() {
      this.domNode = document.createElement('div');
      this.domNode.className = 'monaco-menu-container';
      this.domNode.setAttribute('tabindex', '-1');

      if (this.parentMenu) {
        this.domNode.addEventListener('mouseenter', () => {
          clearTimeout(this.parentMenu.hideTimer);
          clearTimeout(this.parentMenu.showTimer);
        });
      }

      this.menuElement = document.createElement('div');
      this.menuElement.className = 'monaco-menu';
      this.menuElement.setAttribute('role', 'presentation');

      this.actionsList = document.createElement('ul');
      this.actionsList.className = 'actions-container';
      this.actionsList.setAttribute('role', 'menu');

      this.menuElement.appendChild(this.actionsList);
      this.domNode.appendChild(this.menuElement);

      for (let i = 0; i < this.actions.length; i++) {
        const action = this.actions[i];
        const itemObj = { action, index: i, element: null, isSelectable: false, isSubmenu: false };

        if (action.type === 'header') {
          const li = document.createElement('li');
          li.className = 'action-item header';
          li.setAttribute('role', 'presentation');
          const label = document.createElement('span');
          label.className = 'action-label';
          label.textContent = action.title || action.label || '';
          li.appendChild(label);
          this.actionsList.appendChild(li);
          itemObj.element = li;
        } else if (action.type === 'sep' || action.type === 'separator') {
          const li = document.createElement('li');
          li.className = 'action-item separator';
          li.setAttribute('role', 'separator');
          this.actionsList.appendChild(li);
          itemObj.element = li;
        } else if (action.type === 'dom_panel') {
          this.domNode.classList.add('has-dom-panel');
          if (action.panelId === 'timeline') {
            this.domNode.classList.add('has-timeline-panel');
          }
          const li = document.createElement('li');
          li.className = 'action-item dom-panel-item';
          li.setAttribute('role', 'presentation');
          const panelEl = document.getElementById('dock-panel-' + action.panelId);
          if (panelEl) {
            this.mountedPanels.push(panelEl);
            li.appendChild(panelEl);
          }
          li.addEventListener('click', (ev) => ev.stopPropagation());
          li.addEventListener('pointerdown', (ev) => ev.stopPropagation());
          li.addEventListener('mouseenter', () => {
            clearTimeout(this.hideTimer);
            if (this.parentMenu) clearTimeout(this.parentMenu.hideTimer);
          });
          this.actionsList.appendChild(li);
          itemObj.element = li;
          if (typeof action.onMount === 'function') {
            this.pendingMounts.push(action.onMount);
          }
        } else if (action.type === 'slider') {
          const li = document.createElement('li');
          li.className = 'action-item slider-item';
          li.setAttribute('role', 'presentation');

          const topRow = document.createElement('div');
          topRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;font-size:10.5px;color:var(--text-muted);font-weight:600;';
          const lbl = document.createElement('span');
          lbl.textContent = action.label || '';
          const valSpan = document.createElement('span');
          valSpan.style.cssText = 'color:var(--primary);font-family:var(--font-mono);font-weight:700;';
          const unit = action.unit || '';
          valSpan.textContent = `${action.value ?? 0}${unit}`;
          topRow.appendChild(lbl);
          topRow.appendChild(valSpan);

          const slider = document.createElement('input');
          slider.type = 'range';
          slider.className = 'ip-touch-slider';
          slider.min = String(action.min ?? 0);
          slider.max = String(action.max ?? 100);
          slider.step = String(action.step ?? 1);
          slider.value = String(action.value ?? 0);
          slider.style.cssText = 'width:100%;height:5px;accent-color:var(--primary);cursor:pointer;';
          slider.addEventListener('input', (ev) => {
            ev.stopPropagation();
            const v = parseFloat(slider.value);
            valSpan.textContent = `${v}${unit}`;
            if (typeof action.onInput === 'function') action.onInput(v, valSpan);
          });
          slider.addEventListener('change', (ev) => {
            ev.stopPropagation();
            const v = parseFloat(slider.value);
            if (typeof action.onChange === 'function') action.onChange(v, valSpan);
          });

          li.appendChild(topRow);
          li.appendChild(slider);
          li.addEventListener('click', (ev) => ev.stopPropagation());
          li.addEventListener('pointerdown', (ev) => ev.stopPropagation());
          li.addEventListener('mouseenter', () => {
            clearTimeout(this.showTimer);
            if (this.activeSubmenu) {
              this.hideTimer = setTimeout(() => this.closeSubmenu(), 180);
            }
          });
          this.actionsList.appendChild(li);
          itemObj.element = li;
        } else if (action.type === 'custom' && typeof action.render === 'function') {
          const li = document.createElement('li');
          li.className = 'action-item custom-widget-item';
          li.setAttribute('role', 'presentation');
          const el = action.render(this);
          if (el) li.appendChild(el);
          li.addEventListener('click', (ev) => ev.stopPropagation());
          li.addEventListener('pointerdown', (ev) => ev.stopPropagation());
          li.addEventListener('mouseenter', () => {
            clearTimeout(this.showTimer);
            if (this.activeSubmenu) {
              this.hideTimer = setTimeout(() => this.closeSubmenu(), 180);
            }
          });
          this.actionsList.appendChild(li);
          itemObj.element = li;
        } else {
          const subItems = action.items || action.submenu || action.children;
          const hasSubmenu = action.type === 'submenu' || (Array.isArray(subItems) && subItems.length > 0);
          itemObj.isSelectable = !action.disabled;
          itemObj.isSubmenu = hasSubmenu;

          const li = document.createElement('li');
          li.className = 'action-item';
          li.setAttribute('role', 'menuitem');
          if (action.danger) li.classList.add('danger');
          if (action.disabled) li.classList.add('disabled');
          if (hasSubmenu) {
            li.classList.add('has-submenu');
            li.setAttribute('aria-haspopup', 'true');
          }

          const anchor = document.createElement('a');
          anchor.className = 'action-menu-item';
          anchor.setAttribute('tabindex', '-1');

          let rawLabel = action.label || '';
          if (hasSubmenu && rawLabel.endsWith(' ▸')) {
            rawLabel = rawLabel.slice(0, -2);
          }
          let isChecked = !!action.checked;
          if (rawLabel.startsWith('✓ ')) {
            isChecked = true;
            rawLabel = rawLabel.substring(2);
          }

          const checkSpan = document.createElement('span');
          checkSpan.className = 'menu-item-check';
          checkSpan.textContent = isChecked ? '✓' : '';
          anchor.appendChild(checkSpan);

          const labelSpan = document.createElement('span');
          labelSpan.className = 'action-label';
          labelSpan.textContent = rawLabel;
          anchor.appendChild(labelSpan);

          const hotkeyText = action.hotkey || action.keybinding;
          if (hotkeyText) {
            const hkSpan = document.createElement('span');
            hkSpan.className = 'keybinding';
            hkSpan.textContent = hotkeyText;
            anchor.appendChild(hkSpan);
          }

          if (hasSubmenu) {
            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'submenu-indicator';
            arrowSpan.textContent = '▶';
            anchor.appendChild(arrowSpan);
          }

          li.appendChild(anchor);

          li.addEventListener('mouseenter', () => this.onItemMouseEnter(i));
          li.addEventListener('mouseleave', () => this.onItemMouseLeave(i));
          li.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (action.disabled) return;
            if (hasSubmenu) {
              this.openSubmenu(i, false);
            } else {
              this.trigger(i);
            }
          });

          this.actionsList.appendChild(li);
          itemObj.element = li;
          itemObj.checkSpan = checkSpan;
        }

        this.items.push(itemObj);
      }

      this.container.appendChild(this.domNode);

      if (this.pendingMounts.length > 0) {
        for (const fn of this.pendingMounts) {
          try { fn(); } catch (_) {}
        }
        this.pendingMounts = [];
      }

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          if (this.lastAnchor) this.layout(this.lastAnchor);
        });
        this.resizeObserver.observe(this.domNode);
      }
    }

    onItemMouseEnter(index) {
      clearTimeout(this.hideTimer);
      this.focus(index);
      const item = this.items[index];
      if (!item) return;
      if (item.isSubmenu) {
        clearTimeout(this.showTimer);
        this.showTimer = setTimeout(() => this.openSubmenu(index, false), 45);
      } else {
        clearTimeout(this.showTimer);
        if (this.activeSubmenu) {
          this.hideTimer = setTimeout(() => this.closeSubmenu(), 180);
        }
      }
    }

    onItemMouseLeave() {
      clearTimeout(this.showTimer);
    }

    focus(index) {
      if (this.focusedIndex >= 0 && this.focusedIndex < this.items.length) {
        const prev = this.items[this.focusedIndex];
        if (prev && prev.element) prev.element.classList.remove('focused');
      }
      this.focusedIndex = index;
      if (index >= 0 && index < this.items.length) {
        const cur = this.items[index];
        if (cur && cur.element) {
          cur.element.classList.add('focused');
          cur.element.scrollIntoView?.({ block: 'nearest' });
        }
      }
    }

    focusNext() {
      const count = this.items.length;
      if (count === 0) return;
      let idx = this.focusedIndex;
      for (let step = 0; step < count; step++) {
        idx = (idx + 1) % count;
        if (this.items[idx].isSelectable) {
          this.focus(idx);
          break;
        }
      }
    }

    focusPrevious() {
      const count = this.items.length;
      if (count === 0) return;
      let idx = this.focusedIndex;
      if (idx === -1) idx = count;
      for (let step = 0; step < count; step++) {
        idx = (idx - 1 + count) % count;
        if (this.items[idx].isSelectable) {
          this.focus(idx);
          break;
        }
      }
    }

    focusFirst() {
      for (let i = 0; i < this.items.length; i++) {
        if (this.items[i].isSelectable) {
          this.focus(i);
          break;
        }
      }
    }

    focusLast() {
      for (let i = 0; i < this.items.length; i++) {
        if (this.items[i].isSelectable) {
          this.focus(i);
          break;
        }
      }
    }

    trigger(index) {
      const item = this.items[index];
      if (!item || !item.isSelectable) return;
      const action = item.action;
      if (!action.keepOpen && this.service) this.service.hideContextMenu();
      if (typeof action.action === 'function') action.action(action, item);
      else if (typeof action.run === 'function') action.run(action, item);
      if (action.keepOpen && item.checkSpan && typeof action.checked === 'boolean') {
        item.checkSpan.textContent = action.checked ? '✓' : '';
      }
    }

    openSubmenu(index, focusFirst = false) {
      const item = this.items[index];
      if (!item || !item.isSubmenu) return;
      if (this.activeSubmenu && this.activeSubmenu.parentItem === item.element) {
        if (focusFirst) this.activeSubmenu.focusFirst();
        return;
      }
      this.closeSubmenu();
      const subActions = item.action.items || item.action.submenu || item.action.children || [];
      this.activeSubmenu = new MonacoMenu(this.container, subActions, {
        parentMenu: this,
        parentItem: item.element,
        service: this.service
      });
      this.activeSubmenu.layout(item.element);
      if (focusFirst) this.activeSubmenu.focusFirst();
    }

    closeSubmenu() {
      if (this.activeSubmenu) {
        this.activeSubmenu.dispose();
        this.activeSubmenu = null;
      }
    }

    layout(anchor) {
      if (!this.domNode) return;
      this.lastAnchor = anchor;
      const rect = this.domNode.getBoundingClientRect();
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;

      if (anchor instanceof HTMLElement) {
        const parentRect = anchor.getBoundingClientRect();
        const parentMenuRect = this.parentMenu ? this.parentMenu.domNode.getBoundingClientRect() : parentRect;
        let left = parentRect.right - 2;
        const preferLeft = (parentMenuRect.left > viewW * 0.55) || (left + rect.width > viewW - 8);
        if (preferLeft) left = parentRect.left - rect.width + 2;
        left = Math.max(8, Math.min(left, viewW - rect.width - 8));
        let top = parentRect.top - 3;
        if (top + rect.height > viewH - 8) top = Math.max(8, viewH - rect.height - 8);
        top = Math.max(8, top);
        this.domNode.style.left = `${Math.round(left)}px`;
        this.domNode.style.top = `${Math.round(top)}px`;
      } else if (anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number') {
        let left = anchor.x;
        let top = anchor.y;
        if (left + rect.width > viewW - 8) left = viewW - rect.width - 8;
        if (top + rect.height > viewH - 8) top = viewH - rect.height - 8;
        left = Math.max(8, left);
        top = Math.max(8, top);
        this.domNode.style.left = `${Math.round(left)}px`;
        this.domNode.style.top = `${Math.round(top)}px`;
      }
    }

    onKeyDown(e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') && e.key !== 'Escape') {
        return false;
      }
      if (this.activeSubmenu && this.activeSubmenu.onKeyDown(e)) return true;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault(); e.stopPropagation(); this.focusNext(); return true;
        case 'ArrowUp':
          e.preventDefault(); e.stopPropagation(); this.focusPrevious(); return true;
        case 'ArrowRight':
          if (this.focusedIndex >= 0 && this.items[this.focusedIndex]?.isSubmenu) {
            e.preventDefault(); e.stopPropagation(); this.openSubmenu(this.focusedIndex, true); return true;
          }
          break;
        case 'ArrowLeft':
          if (this.parentMenu) {
            e.preventDefault(); e.stopPropagation(); this.parentMenu.closeSubmenu(); return true;
          }
          break;
        case 'Enter':
        case ' ':
          if (this.focusedIndex >= 0) {
            e.preventDefault(); e.stopPropagation();
            const cur = this.items[this.focusedIndex];
            if (cur && cur.isSubmenu) this.openSubmenu(this.focusedIndex, true);
            else if (cur) this.trigger(this.focusedIndex);
            return true;
          }
          break;
        case 'Escape':
          e.preventDefault(); e.stopPropagation();
          if (this.parentMenu) this.parentMenu.closeSubmenu();
          else if (this.service) this.service.hideContextMenu();
          return true;
        case 'Home':
          e.preventDefault(); e.stopPropagation(); this.focusFirst(); return true;
        case 'End':
          e.preventDefault(); e.stopPropagation(); this.focusLast(); return true;
      }
      return false;
    }

    dispose() {
      clearTimeout(this.showTimer);
      clearTimeout(this.hideTimer);
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.activeSubmenu) {
        this.activeSubmenu.dispose();
        this.activeSubmenu = null;
      }
      if (this.mountedPanels && this.mountedPanels.length > 0) {
        const pool = document.getElementById('dock-panel-pool');
        for (const panelEl of this.mountedPanels) {
          if (pool && panelEl && panelEl.parentNode !== pool) {
            pool.appendChild(panelEl);
          }
        }
        this.mountedPanels = [];
      }
      if (this.domNode && this.domNode.parentNode) {
        this.domNode.parentNode.removeChild(this.domNode);
      }
    }
  }

  class MonacoContextMenuService {
    constructor() {
      this.container = document.getElementById('monaco-context-view');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'monaco-context-view';
        this.container.className = 'monaco-context-view';
        document.body.appendChild(this.container);
      }
      this.activeMenu = null;
      this.activeDelegate = null;
      this.openedAt = 0;
      this.registerListeners();
    }

    registerListeners() {
      const onOutsideDown = (e) => {
        if (!this.activeMenu) return;
        if (performance.now() - (this.openedAt || 0) < 350) return;
        if (e.target && typeof e.target.closest === 'function' && !e.target.closest('.monaco-menu-container')) {
          this.hideContextMenu();
        }
      };
      window.addEventListener('pointerdown', onOutsideDown, true);
      window.addEventListener('touchstart', onOutsideDown, { capture: true, passive: true });
      window.addEventListener('keydown', (e) => {
        if (this.activeMenu && this.activeMenu.onKeyDown(e)) {
          e.preventDefault();
        }
      }, true);
      window.addEventListener('blur', () => {
        if (!this.activeMenu) return;
        if (document.activeElement && typeof document.activeElement.closest === 'function' && document.activeElement.closest('.monaco-menu-container')) {
          return;
        }
        this.hideContextMenu();
      });
      window.addEventListener('resize', () => {
        if (this.activeMenu) this.hideContextMenu();
      });
      window.addEventListener('wheel', (e) => {
        if (this.activeMenu && (!e.target || typeof e.target.closest !== 'function' || !e.target.closest('.monaco-menu-container'))) {
          this.hideContextMenu();
        }
      }, { passive: true });
    }

    showContextMenu(delegate) {
      this.hideContextMenu();
      if (!delegate) return;
      this.openedAt = performance.now();
      this.activeDelegate = delegate;
      const actions = typeof delegate.getActions === 'function' ? delegate.getActions() : (delegate.actions || []);
      if (!actions || actions.length === 0) return;
      const anchor = typeof delegate.getAnchor === 'function' ? delegate.getAnchor() : delegate.anchor;
      this.activeMenu = new MonacoMenu(this.container, actions, { service: this });
      this.activeMenu.layout(anchor);
      if (delegate.autoSelectFirstItem) this.activeMenu.focusFirst();
    }

    hideContextMenu() {
      if (this.activeMenu) {
        this.activeMenu.dispose();
        this.activeMenu = null;
      }
      if (this.activeDelegate && typeof this.activeDelegate.onHide === 'function') {
        this.activeDelegate.onHide();
      }
      this.activeDelegate = null;
    }
  }

  window.contextMenuService = new MonacoContextMenuService();
  host.contextMenu = window.contextMenuService;

  function buildDomPanelAction(panelId) {
    if (panelId === 'brushes') panelId = 'lab';
    return {
      type: 'dom_panel',
      panelId,
      onMount: () => {
        if (typeof syncUiFromHost === 'function') syncUiFromHost();
        if (typeof syncInfinitePainterUI === 'function') syncInfinitePainterUI();
        if (panelId === 'color' && typeof window.refreshTouchColorStudio === 'function') {
          window.refreshTouchColorStudio();
        }
        if (panelId === 'recents' && typeof window.loadPainterRecents === 'function') {
          window.loadPainterRecents();
        }
        if (panelId === 'hud' && typeof window.renderHudCustomizerOptions === 'function') {
          window.renderHudCustomizerOptions();
        }
        if (panelId === 'timeline' && host.rasterAnimatorUI) {
          host.rasterAnimatorUI.visible = true;
          if (host.rasterAnimatorUI.container) host.rasterAnimatorUI.container.style.display = 'flex';
          host.rasterAnimatorUI.updateTimeline();
        }
      }
    };
  }

  const CONTEXT_MENU_SLIDERS_STORAGE_KEY = 'esenho_context_menu_sliders_v1';
  const CONTEXT_MENU_SLIDERS_DEF = [
    { id: 'size', label: 'Brush Size', key: 'size', min: 1, max: 300, unit: 'px', defaultVal: 12 },
    { id: 'opacity', label: 'Opacity', key: 'opacity', min: 1, max: 100, unit: '%', defaultVal: 100 },
    { id: 'flow', label: 'Flow', key: 'flow', min: 1, max: 100, unit: '%', defaultVal: 100 },
    { id: 'hardness', label: 'Hardness', key: 'hardness', min: 0, max: 100, unit: '%', defaultVal: 80 },
    { id: 'smoothing', label: 'Smoothing', key: 'stabilization', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'spacing', label: 'Spacing', key: 'spacing', min: 1, max: 200, unit: '%', defaultVal: 12 },
    { id: 'roundness', label: 'Roundness', key: 'roundness', min: 1, max: 100, unit: '%', defaultVal: 100 },
    { id: 'angle', label: 'Tip Angle', key: 'angle', min: 0, max: 360, unit: '°', defaultVal: 0 },
    { id: 'string_length', label: 'Lazy String', key: 'string_length', min: 0, max: 200, unit: 'px', defaultVal: 0 },
    { id: 'midpoint', label: 'Pressure Curve', key: 'midpoint', min: 0, max: 100, unit: '%', defaultVal: 50 },
    { id: 'velocity', label: 'Velocity Size', key: 'velocity', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'taper_in', label: 'Taper Start', key: 'taper_in', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'taper_out', label: 'Taper End', key: 'taper_out', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'fade', label: 'Stroke Fade', key: 'fade', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'wetness', label: 'Wetness', key: 'wetness', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'smudge', label: 'Smudge Pull', key: 'smudge', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'pickup', label: 'Color Pickup', key: 'color_pickup', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'depletion', label: 'Paint Depletion', key: 'depletion', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'scatter', label: 'Scatter', key: 'scatter', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'size_jitter', label: 'Size Jitter', key: 'size_jitter', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'angle_jitter', label: 'Angle Jitter', key: 'angle_jitter', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'opacity_jitter', label: 'Opacity Jitter', key: 'opacity_jitter', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'color_jitter', label: 'Color Jitter', key: 'color_jitter', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'grain', label: 'Paper Grain', key: 'grain', min: 0, max: 100, unit: '%', defaultVal: 0 },
    { id: 'tex_scale', label: 'Grain Scale', key: 'texture_scale', min: 10, max: 400, unit: '%', defaultVal: 100 },
    { id: 'tex_contrast', label: 'Grain Contrast', key: 'texture_contrast', min: 0, max: 200, unit: '%', defaultVal: 100 },
    { id: 'tex_rotate', label: 'Grain Angle', key: 'texture_rotate', min: 0, max: 360, unit: '°', defaultVal: 0 },
    { id: 'dual_size', label: 'Dual Brush Size', key: 'dual_size', min: 10, max: 300, unit: '%', defaultVal: 100 },
    { id: 'dual_spacing', label: 'Dual Spacing', key: 'dual_spacing', min: 1, max: 100, unit: '%', defaultVal: 15 }
  ];

  if (!Array.isArray(host.contextMenuSliders)) {
    let initialSliders = ['size', 'opacity', 'smoothing'];
    try {
      const saved = localStorage.getItem(CONTEXT_MENU_SLIDERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) initialSliders = parsed;
      }
    } catch (_) {}
    host.contextMenuSliders = initialSliders;
  }

  const DOCKVIEW_TAB_PANELS = new Set(['canvas', 'layers', 'tools', 'timeline', 'color', 'lab']);

  function buildContextMenuSlidersActions() {
    return CONTEXT_MENU_SLIDERS_DEF.map(s => {
      const isOn = Array.isArray(host.contextMenuSliders) && host.contextMenuSliders.includes(s.id);
      return {
        type: 'item',
        checked: isOn,
        keepOpen: true,
        label: s.label,
        action: (act) => {
          const cur = Array.isArray(host.contextMenuSliders) ? [...host.contextMenuSliders] : ['size', 'opacity', 'smoothing'];
          const next = cur.includes(s.id) ? cur.filter(x => x !== s.id) : [...cur, s.id];
          host.contextMenuSliders = next;
          act.checked = next.includes(s.id);
          try {
            localStorage.setItem(CONTEXT_MENU_SLIDERS_STORAGE_KEY, JSON.stringify(next));
          } catch (_) {}
          if (typeof window.renderHudCustomizerOptions === 'function') {
            window.renderHudCustomizerOptions();
          }
        }
      };
    });
  }

  function openPanelInContextMenu(panelId, anchor) {
    if (panelId === 'brushes') panelId = 'lab';
    if (window.isDockviewPainter && DOCKVIEW_TAB_PANELS.has(panelId) && typeof window.openPainterDockPanel === 'function') {
      window.openPainterDockPanel(panelId);
      return;
    }
    if (!window.contextMenuService) return;
    const defaultAnchor = () => {
      if (anchor && typeof anchor.x === 'number') return anchor;
      if (host.mouseHover && host.mouseHover.inside && canvasEl) {
        const r = canvasEl.getBoundingClientRect();
        return { x: r.left + host.mouseHover.sx, y: r.top + host.mouseHover.sy };
      }
      return { x: Math.round(window.innerWidth * 0.35), y: Math.round(window.innerHeight * 0.18) };
    };
    window.contextMenuService.showContextMenu({
      getAnchor: defaultAnchor,
      getActions: () => panelId === 'hud' ? buildContextMenuSlidersActions() : [buildDomPanelAction(panelId)]
    });
  }
  window.openPanelInContextMenu = openPanelInContextMenu;

  function buildPainterContextMenuItems(e, { isTopBar = false } = {}) {
    const r = canvasEl?.getBoundingClientRect();
    const evt = (e && e.clientX !== undefined && (r ? e.clientY >= r.top : true))
      ? e
      : {
          clientX: r ? (r.left + r.width / 2) : (window.innerWidth / 2),
          clientY: r ? (r.top + r.height / 2) : (window.innerHeight / 2)
        };
    const p = clientPos(evt);
    const items = [];
    const addItem = (label, hotkey, action, opts = {}) => {
      items.push({ type: 'item', label, hotkey, action, danger: opts.danger, disabled: opts.disabled, checked: opts.checked, keepOpen: opts.keepOpen });
    };
    const addSubmenu = (label, subitems) => {
      if (subitems && subitems.length > 0) items.push({ type: 'submenu', label, items: subitems });
    };
    const addHeader = (title) => items.push({ type: 'header', title });
    const addSep = () => {
      if (items.length > 0 && items[items.length - 1].type !== 'sep' && items[items.length - 1].type !== 'header') {
        items.push({ type: 'sep' });
      }
    };

    const isVecApp = !!window.ESENHO_VECTOR_PAINTER_MODE;
    const isVecMode = isVecApp && host.actionMode === 'vector';
    const isVecLayer = isVecApp && host.isVectorLayer && host.isVectorLayer();

    const isFloatingTransform = !isVecLayer && !!(host.floatingTransform && host.floatingTransform.corners);
    const hitFtHandle = isFloatingTransform ? ftHitTest(p.x, p.y, false) : null;
    const isOverTransform = isFloatingTransform && !!hitFtHandle;

    const hasSel = !isVecLayer && typeof host.hasSelection === 'function' && host.hasSelection();
    const isInsideSel = hasSel && typeof host.isPointInSelection === 'function' && host.isPointInSelection(p.x, p.y);

    // ── CASE 1: FLOATING TRANSFORM CONTEXT ──
    if (isFloatingTransform) {
      addHeader('Transform Quad');
      addItem('✓ Apply Transform', 'Enter', () => { runCmd('transform apply'); markCanvasDirty(); syncUiFromHost(); });
      addItem('✕ Cancel Transform', 'Esc', () => { runCmd('transform cancel'); markCanvasDirty(); syncUiFromHost(); }, { danger: true });
      addSep();

      const curXMode = host.transformMode || 'scale';
      const curXInterp = host.transformInterpolation || 'nearest';
      addSubmenu(`Transform Mode: ${curXMode === 'scale' ? 'Scale & Rotate' : (curXMode === 'distort' ? 'Free Distort' : 'Perspective')}`, [
        { type: 'item', label: (curXMode === 'scale' ? '✓ ' : '') + 'Scale & Rotate (Standard)', action: () => { host.transformMode = 'scale'; syncUiFromHost(); } },
        { type: 'item', label: (curXMode === 'distort' ? '✓ ' : '') + 'Free Corner Distort', action: () => { host.transformMode = 'distort'; syncUiFromHost(); } },
        { type: 'item', label: (curXMode === 'perspective' ? '✓ ' : '') + 'Perspective Homography', action: () => { host.transformMode = 'perspective'; syncUiFromHost(); } },
        { type: 'sep' },
        { type: 'item', label: (host.transformLockAspect ? '✓ ' : '') + 'Lock Aspect Ratio', action: () => { host.transformLockAspect = !host.transformLockAspect; syncUiFromHost(); } },
        { type: 'item', label: (curXInterp === 'nearest' ? '✓ ' : '') + 'Crisp (Nearest Neighbor)', action: () => { host.transformInterpolation = 'nearest'; bakeFtPreview(); syncUiFromHost(); } },
        { type: 'item', label: (curXInterp === 'bilinear' ? '✓ ' : '') + 'Smooth (Bilinear Sampling)', action: () => { host.transformInterpolation = 'bilinear'; bakeFtPreview(); syncUiFromHost(); } }
      ]);

      addSubmenu('Quick Transform Actions', [
        { type: 'item', label: 'Rotate 90° CW', action: () => { runCmd('transform rotate 90'); } },
        { type: 'item', label: 'Rotate 90° CCW', action: () => { runCmd('transform rotate -90'); } },
        { type: 'item', label: 'Rotate 180°', action: () => { runCmd('transform rotate 90'); runCmd('transform rotate 90'); } },
        { type: 'sep' },
        { type: 'item', label: 'Flip Horizontal', action: () => { runCmd('transform flip h'); } },
        { type: 'item', label: 'Flip Vertical', action: () => { runCmd('transform flip v'); } },
        { type: 'sep' },
        { type: 'item', label: 'Center on Canvas', action: () => { if (host.centerFloatTransform) host.centerFloatTransform(); bakeFtPreview(); syncUiFromHost(); } },
        { type: 'item', label: 'Fit Proportionally to Canvas', action: () => { if (host.fitFloatTransformToCanvas) host.fitFloatTransformToCanvas(); bakeFtPreview(); syncUiFromHost(); } },
        { type: 'sep' },
        { type: 'item', label: 'Reset to Original Box', action: () => { runCmd('transform reset'); } }
      ]);
      addSep();
    }

    // ── CASE 2: CLICK DIRECTLY INSIDE AN ACTIVE SELECTION ──
    else if (isInsideSel) {
      addHeader('Selection Area');
      addItem('Free Transform (Scale/Rotate/Distort)', 'Ctrl+T', () => { runCmd('transform'); });
      addItem('Invert Selection', 'Ctrl+Shift+I', () => { runCmd('select invert'); });
      addItem('Deselect', 'Ctrl+D', () => { runCmd('deselect'); if (typeof syncUiFromHost === 'function') syncUiFromHost(); });
      addSep();
      addItem('Copy Selection', 'Ctrl+C', () => { runCmd('copy'); });
      addItem('Cut Selection', 'Ctrl+X', () => { runCmd('cut'); });
      addItem('Clear / Erase Pixels in Selection', 'Del', () => { runCmd('clear selection'); markCanvasDirty(); });
      addItem('Fill Selection with Current Color', 'Alt+Del', () => {
        const curC = host.currentColor ?? 0xFFEBDBB2;
        if (host.fillSelection) host.fillSelection(curC);
        else {
          const prevTool = host.currentTool;
          host.currentTool = 'fill';
          host.executeWithSelectionClip?.(() => {
            if (host.canvasActor?.exports?.w_flood_fill) host.canvasActor.exports.w_flood_fill(p.x, p.y, curC, 100);
          });
          host.currentTool = prevTool;
        }
        markCanvasDirty();
      });
      addSep();
      addSubmenu('Selection Mask Actions', [
        { type: 'item', label: '🖌 Paint Inside (Lock Mask)', action: () => { host.setActionMode('draw'); host.currentTool = 'brush'; host.setBrushParam('mode', 0); syncUiFromHost(); } },
        { type: 'item', label: '🧹 Erase Inside (Lock Mask)', action: () => { host.setActionMode('erase'); host.currentTool = 'brush'; host.setBrushParam('mode', 0); syncUiFromHost(); } },
        { type: 'sep' },
        { type: 'item', label: 'Capture as Custom Brush Tip', action: () => { if (host.createBrushFromSelection) host.createBrushFromSelection(); } },
        { type: 'item', label: 'Capture as Paper Texture', action: () => { if (host.createGrainFromSelection) host.createGrainFromSelection(); } },
        { type: 'sep' },
        { type: 'item', label: 'Crop Canvas to Selection', action: () => { runCmd('crop'); } }
      ]);
      addSep();
    }

    // ── CASE 3: VECTOR PAINTER CONTEXT ──
    else if (isVecApp && (isVecMode || isVecLayer)) {
      const vl = host.getVectorLayer ? host.getVectorLayer() : null;
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      const selNodeArr = host.getSelectedVectorNodeIndices ? host.getSelectedVectorNodeIndices() : [];
      const selNodeSet = new Set(Array.isArray(selNodeArr) ? selNodeArr : []);
      addHeader('◆ Vector Painter Studio');

      const curVecSub = (host.actionMode === 'erase')
        ? 'erase'
        : (host.actionMode === 'draw' ? (host.currentTool === 'line' || host.currentTool === 'rect' || host.currentTool === 'ellipse' ? host.currentTool : 'draw') : (host.vectorSubTool || 'nodes'));

      addSubmenu('Vector Tool Mode', [
        { type: 'item', label: (curVecSub === 'pen' ? '✓ ' : '') + 'Pen Tool (Bézier Curve Creator)', hotkey: 'P', action: () => {
          host.vectorSubTool = 'pen'; host.setActionMode('vector'); if (host.enableVectorLayer) host.enableVectorLayer();
          vecPenActivePathId = null; markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
        }},
        { type: 'item', label: (curVecSub === 'nodes' ? '✓ ' : '') + 'Node & Handle Editor', hotkey: 'V', action: () => {
          host.vectorSubTool = 'nodes'; host.setActionMode('vector'); if (host.enableVectorLayer) host.enableVectorLayer();
          vecPenActivePathId = null; markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
        }},
        { type: 'item', label: (curVecSub === 'marquee' ? '✓ ' : '') + 'Marquee Box Multi-Node Select', action: () => {
          host.vectorSubTool = 'marquee'; host.setActionMode('vector'); if (host.enableVectorLayer) host.enableVectorLayer();
          vecPenActivePathId = null; markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
        }},
        { type: 'item', label: (curVecSub === 'width' ? '✓ ' : '') + 'Stroke Width & Pressure Tool', action: () => {
          host.vectorSubTool = 'width'; host.setActionMode('vector'); if (host.enableVectorLayer) host.enableVectorLayer();
          vecPenActivePathId = null; markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
        }},
        { type: 'sep' },
        { type: 'item', label: (curVecSub === 'draw' ? '✓ ' : '') + 'Freehand Vector Brush', hotkey: 'B', action: () => {
          vecPenActivePathId = null; host.vectorSubTool = 'draw'; host.setActionMode('draw'); host.currentTool = 'brush'; host.setBrushParam('mode', 0);
          if (host.enableVectorLayer) host.enableVectorLayer(); markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
        }},
        { type: 'item', label: (curVecSub === 'line' ? '✓ ' : '') + 'Vector Line Shape', action: () => {
          vecPenActivePathId = null; host.vectorSubTool = 'line'; host.setActionMode('draw'); host.currentTool = 'line'; host.setBrushParam('mode', 6);
          if (host.enableVectorLayer) host.enableVectorLayer(); markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
        }},
        { type: 'item', label: (curVecSub === 'rect' ? '✓ ' : '') + 'Vector Rectangle Shape', action: () => {
          vecPenActivePathId = null; host.vectorSubTool = 'rect'; host.setActionMode('draw'); host.currentTool = 'rect'; host.setBrushParam('mode', 7);
          if (host.enableVectorLayer) host.enableVectorLayer(); markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
        }},
        { type: 'item', label: (curVecSub === 'ellipse' ? '✓ ' : '') + 'Vector Ellipse Shape', action: () => {
          vecPenActivePathId = null; host.vectorSubTool = 'ellipse'; host.setActionMode('draw'); host.currentTool = 'ellipse'; host.setBrushParam('mode', 8);
          if (host.enableVectorLayer) host.enableVectorLayer(); markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
        }},
        { type: 'item', label: (curVecSub === 'erase' ? '✓ ' : '') + 'Vector Stroke Eraser', hotkey: 'E', action: () => {
          vecPenActivePathId = null; host.vectorSubTool = 'erase'; host.setActionMode('erase');
          if (host.enableVectorLayer) host.enableVectorLayer(); markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
        }}
      ]);

      if (vecPenActivePathId) {
        addItem('✓ Finish Open Pen Curve', 'Enter', () => {
          vecPenActivePathId = null;
          markCanvasDirty();
          if (typeof syncUiFromHost === 'function') syncUiFromHost();
        });
      }

      if (selPath) {
        addItem('Insert Node Here', '+', () => {
          host.pushUndoSnapshot('insert vector node');
          const segHit = typeof selPath.hitTestStroke === 'function' ? selPath.hitTestStroke(p.x, p.y, 60 / (host.zoom || 1)) : null;
          if (segHit && typeof selPath.splitSegment === 'function') {
            const splitRes = selPath.splitSegment(segHit.segIndex, segHit.t);
            const newIdx = (splitRes && typeof splitRes === 'object') ? splitRes.index : splitRes;
            host.selectVectorPath(selPath.id, newIdx);
          } else if (typeof selPath.splitSegment === 'function' && selPath.nodes.length >= 2) {
            const segIdx = Math.max(0, Math.min(selPath.nodes.length - 2, vl.selectedNodeIdx >= 0 ? vl.selectedNodeIdx : 0));
            const splitRes = selPath.splitSegment(segIdx, 0.5);
            const newIdx = (splitRes && typeof splitRes === 'object') ? splitRes.index : splitRes;
            host.selectVectorPath(selPath.id, newIdx);
          }
          host.renderVectorLayer();
          markCanvasDirty();
          if (typeof syncUiFromHost === 'function') syncUiFromHost();
        });

        addItem('Select All Nodes in Curve', 'Ctrl+A', () => {
          host.selectVectorNodes(selPath.id, selPath.nodes.map((_, i) => i), false);
          markCanvasDirty();
          if (typeof syncUiFromHost === 'function') syncUiFromHost();
        });

        const delIndices = selNodeSet.size > 0
          ? Array.from(selNodeSet).sort((a, b) => b - a)
          : (vl && vl.selectedNodeIdx >= 0 ? [vl.selectedNodeIdx] : []);
        if (delIndices.length > 0 && (selPath.nodes.length - delIndices.length) >= 2) {
          addItem(delIndices.length > 1 ? `Delete ${delIndices.length} Selected Nodes` : 'Delete Selected Node', 'Del', () => {
            host.pushUndoSnapshot('delete vector nodes');
            if (typeof selPath.removeNodes === 'function') {
              selPath.removeNodes(delIndices);
            } else {
              for (const idx of delIndices) selPath.removeNode(idx);
            }
            host.selectVectorPath(selPath.id, Math.min(delIndices[delIndices.length - 1], selPath.nodes.length - 1));
            host.renderVectorLayer();
            markCanvasDirty();
            if (typeof syncUiFromHost === 'function') syncUiFromHost();
          }, { danger: true });
        }

        addSubmenu('Convert Node Type', [
          { type: 'item', label: 'Smooth Node', action: () => {
            host.pushUndoSnapshot('set vector node type');
            const targets = selNodeSet.size > 0 ? Array.from(selNodeSet) : (vl.selectedNodeIdx >= 0 ? [vl.selectedNodeIdx] : selPath.nodes.map((_, i) => i));
            targets.forEach(idx => selPath.setNodeType(idx, 'smooth'));
            host.renderVectorLayer(); markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
          }},
          { type: 'item', label: 'Symmetric Node', action: () => {
            host.pushUndoSnapshot('set vector node type');
            const targets = selNodeSet.size > 0 ? Array.from(selNodeSet) : (vl.selectedNodeIdx >= 0 ? [vl.selectedNodeIdx] : selPath.nodes.map((_, i) => i));
            targets.forEach(idx => selPath.setNodeType(idx, 'symmetric'));
            host.renderVectorLayer(); markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
          }},
          { type: 'item', label: 'Cusp (Free Handles) Node', action: () => {
            host.pushUndoSnapshot('set vector node type');
            const targets = selNodeSet.size > 0 ? Array.from(selNodeSet) : (vl.selectedNodeIdx >= 0 ? [vl.selectedNodeIdx] : selPath.nodes.map((_, i) => i));
            targets.forEach(idx => selPath.setNodeType(idx, 'cusp'));
            host.renderVectorLayer(); markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
          }},
          { type: 'item', label: 'Corner / Sharp Node', action: () => {
            host.pushUndoSnapshot('set vector node type');
            const targets = selNodeSet.size > 0 ? Array.from(selNodeSet) : (vl.selectedNodeIdx >= 0 ? [vl.selectedNodeIdx] : selPath.nodes.map((_, i) => i));
            targets.forEach(idx => selPath.setNodeType(idx, 'corner'));
            host.renderVectorLayer(); markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
          }}
        ]);

        addItem((selPath.closed ? '✓ ' : '') + 'Toggle Closed Loop', '', () => {
          host.pushUndoSnapshot('toggle vector closed');
          selPath.closed = !selPath.closed;
          host.renderVectorLayer(); markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
        });

        addItem((selPath.fill ? '✓ ' : '') + 'Toggle Solid Fill', '', () => {
          document.getElementById('btn-ip-vecbar-fill-toggle')?.click();
        });

        addItem('Duplicate Vector Path', '', () => {
          document.getElementById('btn-ip-vecbar-dup-path')?.click();
        });

        addItem('Simplify / Fit Selected Curve', '', () => {
          if (typeof selPath.simplify === 'function') {
            host.pushUndoSnapshot('simplify vector path');
            selPath.simplify((host.vectorFitTolerance || 2.5) * 1.4, host.vectorCurveMode !== 'raw');
            host.renderVectorLayer(); markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
          }
        });

        addItem('Delete Vector Stroke', 'Shift+Del', () => {
          host.pushUndoSnapshot('delete vector path');
          vl.paths = vl.paths.filter(pt => pt.id !== selPath.id);
          vl.selectedPathId = vl.paths.length > 0 ? vl.paths[vl.paths.length - 1].id : null;
          vl.selectedNodeIdx = -1;
          if (vl.selectedNodeIndices instanceof Set) vl.selectedNodeIndices.clear();
          if (vecPenActivePathId === selPath.id) vecPenActivePathId = null;
          host.renderVectorLayer(); markCanvasDirty(); if (typeof syncUiFromHost === 'function') syncUiFromHost();
        }, { danger: true });
      }

      if (isVecLayer) {
        addItem('Export Vector Layer (.svg)', '', () => {
          document.getElementById('btn-ip-vecbar-export-svg')?.click();
        });
      }
      addSep();
    }

    // ── CASE 4: ACTIVE SELECTION EXISTS BUT CLICK WAS OUTSIDE ──
    else if (hasSel) {
      addHeader('Active Selection');
      addItem('Free Transform Selection', 'Ctrl+T', () => { runCmd('transform'); });
      addItem('Deselect', 'Ctrl+D', () => { runCmd('deselect'); if (typeof syncUiFromHost === 'function') syncUiFromHost(); });
      addItem('Invert Selection', 'Ctrl+Shift+I', () => { runCmd('select invert'); });
      addItem('Copy Selection', 'Ctrl+C', () => { runCmd('copy'); });
      addItem('Cut Selection', 'Ctrl+X', () => { runCmd('cut'); });
      addSubmenu('Selection Actions', [
        { type: 'item', label: 'Clear / Erase Pixels in Selection', action: () => { runCmd('clear selection'); markCanvasDirty(); } },
        { type: 'item', label: 'Capture as Brush Tip', action: () => { if (host.createBrushFromSelection) host.createBrushFromSelection(); } },
        { type: 'item', label: 'Capture as Paper Texture', action: () => { if (host.createGrainFromSelection) host.createGrainFromSelection(); } },
        { type: 'sep' },
        { type: 'item', label: 'Crop Canvas to Selection', action: () => { runCmd('crop'); } }
      ]);
      addSep();
    }

    // 4. Inline Quick Tools & Color Bar + Brush Sliders (Mobile & Desktop)
    items.push({
      type: 'custom',
      render: (menuInst) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;padding:2px 0;min-width:210px;';

        // Row 1: Quick Tools Strip (5x2 grid matching Studio)
        const toolRow = document.createElement('div');
        toolRow.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:3px;';

        const isVecContext = isVecApp && (isVecMode || isVecLayer);
        const quickTools = isVecContext ? [
          { id: 'pen', label: '✒ Pen', title: 'Bézier Pen Tool (P)', act: () => {
            host.vectorSubTool = 'pen'; host.setActionMode('vector'); if (host.enableVectorLayer) host.enableVectorLayer();
            vecPenActivePathId = null; markCanvasDirty();
          }, check: () => host.vectorSubTool === 'pen' },
          { id: 'nodes', label: '◈ Node', title: 'Bézier Node Editor (V)', act: () => {
            host.vectorSubTool = 'nodes'; host.setActionMode('vector'); if (host.enableVectorLayer) host.enableVectorLayer();
            vecPenActivePathId = null; markCanvasDirty();
          }, check: () => host.vectorSubTool === 'nodes' },
          { id: 'marquee', label: '⬚ Marq', title: 'Multi-Node Marquee Selection', act: () => {
            host.vectorSubTool = 'marquee'; host.setActionMode('vector'); if (host.enableVectorLayer) host.enableVectorLayer();
            vecPenActivePathId = null; markCanvasDirty();
          }, check: () => host.vectorSubTool === 'marquee' },
          { id: 'width', label: '↔ Width', title: 'Stroke Width & Pressure', act: () => {
            host.vectorSubTool = 'width'; host.setActionMode('vector'); if (host.enableVectorLayer) host.enableVectorLayer();
            vecPenActivePathId = null; markCanvasDirty();
          }, check: () => host.vectorSubTool === 'width' },
          { id: 'brush', label: '🖌 Brsh', title: 'Vector Brush (B)', act: () => {
            vecPenActivePathId = null; host.vectorSubTool = 'draw'; host.setActionMode('draw'); host.currentTool = 'brush'; host.setBrushParam('mode', 0);
            if (host.enableVectorLayer) host.enableVectorLayer(); markCanvasDirty();
          }, check: () => host.actionMode === 'draw' && (host.currentTool === 'brush' || host.vectorSubTool === 'draw') },
          { id: 'line', label: '╱ Line', title: 'Vector Line Shape', act: () => {
            vecPenActivePathId = null; host.vectorSubTool = 'line'; host.setActionMode('draw'); host.currentTool = 'line'; host.setBrushParam('mode', 6);
            if (host.enableVectorLayer) host.enableVectorLayer(); markCanvasDirty();
          }, check: () => host.vectorSubTool === 'line' || (host.currentTool === 'line' && host.actionMode === 'draw') },
          { id: 'rect', label: '▭ Rect', title: 'Vector Rectangle', act: () => {
            vecPenActivePathId = null; host.vectorSubTool = 'rect'; host.setActionMode('draw'); host.currentTool = 'rect'; host.setBrushParam('mode', 7);
            if (host.enableVectorLayer) host.enableVectorLayer(); markCanvasDirty();
          }, check: () => host.vectorSubTool === 'rect' || (host.currentTool === 'rect' && host.actionMode === 'draw') },
          { id: 'ellipse', label: '○ Ellip', title: 'Vector Ellipse', act: () => {
            vecPenActivePathId = null; host.vectorSubTool = 'ellipse'; host.setActionMode('draw'); host.currentTool = 'ellipse'; host.setBrushParam('mode', 8);
            if (host.enableVectorLayer) host.enableVectorLayer(); markCanvasDirty();
          }, check: () => host.vectorSubTool === 'ellipse' || (host.currentTool === 'ellipse' && host.actionMode === 'draw') },
          { id: 'erase', label: '🧹 Erase', title: 'Vector Eraser (E)', act: () => {
            vecPenActivePathId = null; host.vectorSubTool = 'erase'; host.setActionMode('erase');
            if (host.enableVectorLayer) host.enableVectorLayer(); markCanvasDirty();
          }, check: () => host.actionMode === 'erase' || host.vectorSubTool === 'erase' },
          { id: 'fit', label: '⊡ Fit', title: 'Fit View to Screen (0)', act: () => {
            runCmd('zoom fit');
            if (menuInst && menuInst.service) menuInst.service.hideContextMenu();
          }, check: () => false }
        ] : [
          { id: 'brush', label: '🖌 Brsh', title: 'Brush Tool / Draw Mode (B)', act: () => {
            host.setActionMode('draw'); host.currentTool = 'brush'; host.setBrushParam('mode', 0);
          }, check: () => (host.actionMode === 'draw' || !host.actionMode) && (host.currentTool === 'brush' || !host.currentTool) },
          { id: 'erase', label: '🧹 Erase', title: 'Eraser Mode (E)', act: () => {
            host.setActionMode('erase');
          }, check: () => host.actionMode === 'erase' },
          { id: 'blend', label: '💧 Blend', title: 'Smudge / Blend Mode', act: () => {
            host.setActionMode('blend');
          }, check: () => host.actionMode === 'blend' },
          { id: 'clone', label: '⧉ Clone', title: 'Clone Stamp Mode', act: () => {
            host.setActionMode('clone');
          }, check: () => host.actionMode === 'clone' },
          { id: 'fill', label: '🪣 Bucket', title: 'Flood Fill Bucket (G)', act: () => {
            host.setActionMode('draw'); host.currentTool = 'fill'; host.setBrushParam('mode', 3);
          }, check: () => host.currentTool === 'fill' },
          { id: 'line', label: '╱ Line', title: 'Line Tool', act: () => {
            host.setActionMode('draw'); host.currentTool = 'line'; host.setBrushParam('mode', 6);
          }, check: () => host.currentTool === 'line' },
          { id: 'rect', label: '▭ Rect', title: 'Rectangle Shape Tool', act: () => {
            host.setActionMode('draw'); host.currentTool = 'rect'; host.setBrushParam('mode', 7);
          }, check: () => host.currentTool === 'rect' },
          { id: 'ellipse', label: '○ Ellip', title: 'Ellipse / Circle Tool', act: () => {
            host.setActionMode('draw'); host.currentTool = 'ellipse'; host.setBrushParam('mode', 8);
          }, check: () => host.currentTool === 'ellipse' },
          { id: 'select', label: '⬚ Select', title: 'Rectangle Selection Marquee (M)', act: () => {
            host.setActionMode('select'); host.currentTool = 'select_rect'; host.setBrushParam('mode', 9);
          }, check: () => host.actionMode === 'select' },
          { id: 'fit', label: '⊡ Fit', title: 'Fit View to Screen (0)', act: () => {
            runCmd('zoom fit');
            if (menuInst && menuInst.service) menuInst.service.hideContextMenu();
          }, check: () => false }
        ];

        const toolBtns = [];
        const updateToolHighlight = () => {
          toolBtns.forEach(({ btn, check }) => {
            btn.classList.toggle('active', !!check());
          });
        };

        quickTools.forEach(t => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ip-mini-btn' + (t.check() ? ' active' : '');
          btn.style.cssText = 'height:22px;font-size:9.5px;padding:0 2px;';
          btn.textContent = t.label;
          btn.title = t.title || t.label;
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            t.act();
            if (typeof syncUiFromHost === 'function') syncUiFromHost();
            updateToolHighlight();
          });
          toolBtns.push({ btn, check: t.check });
          toolRow.appendChild(btn);
        });
        updateToolHighlight();
        wrap.appendChild(toolRow);

        // Row 2: Active Color + Quick Swatches
        const colorRow = document.createElement('div');
        colorRow.style.cssText = 'display:flex;align-items:center;gap:4px;';
        const curC = host.currentColor ?? 0xFFEBDBB2;
        const curHex = rgbToHex(curC & 0xFF, (curC >> 8) & 0xFF, (curC >> 16) & 0xFF);
        const curChip = document.createElement('button');
        curChip.type = 'button';
        curChip.className = 'touch-swatch-slot';
        curChip.title = `Current Color (${curHex}) — Click to sample here`;
        curChip.style.cssText = `width:22px;height:20px;border-radius:3px;background:${curHex};border:1.5px solid var(--text-bright);flex-shrink:0;padding:0;cursor:pointer;`;
        curChip.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const sampled = sampleEyedropperColor(p.x, p.y, evt.clientX, evt.clientY);
          if (sampled) {
            updateColorControlsFromHex(sampled);
            runCmd(`set color ${sampled}`);
            curChip.style.background = sampled;
          }
          setTimeout(hideEyedropper, 500);
        });
        colorRow.appendChild(curChip);

        const swatches = (typeof getActivePaletteColors === 'function' ? getActivePaletteColors() : PALETTE_PRESETS.gruvbox).slice(0, 9);
        const swatchWrap = document.createElement('div');
        swatchWrap.style.cssText = 'display:grid;grid-template-columns:repeat(9,1fr);gap:2px;flex:1;';
        swatches.forEach(hex => {
          const sw = document.createElement('button');
          sw.type = 'button';
          sw.className = 'touch-swatch-slot';
          sw.title = hex;
          sw.style.cssText = `height:18px;border-radius:2px;background:${hex};border:1px solid rgba(255,255,255,0.2);padding:0;cursor:pointer;`;
          sw.addEventListener('click', (ev) => {
            ev.stopPropagation();
            updateColorControlsFromHex(hex);
            runCmd(`set color ${hex}`);
            curChip.style.background = hex;
          });
          swatchWrap.appendChild(sw);
        });
        colorRow.appendChild(swatchWrap);
        wrap.appendChild(colorRow);

        return wrap;
      }
    });

    const bp = host.brushParams || {};
    const activeSlidersList = Array.isArray(host.contextMenuSliders) ? host.contextMenuSliders : ['size', 'opacity', 'smoothing'];
    for (const sid of activeSlidersList) {
      const sDef = CONTEXT_MENU_SLIDERS_DEF.find(s => s.id === sid);
      if (!sDef) continue;
      const rawVal = sid === 'smoothing'
        ? (bp.stabilization ?? bp.smoothing ?? sDef.defaultVal)
        : (bp[sDef.key] ?? sDef.defaultVal);
      items.push({
        type: 'slider',
        label: sDef.label,
        min: sDef.min,
        max: sDef.max,
        value: Math.round(rawVal),
        unit: sDef.unit,
        onInput: (val) => {
          host.setBrushParam(sDef.key, val);
          if (sid === 'smoothing' && host.brushParams) host.brushParams.smoothing = val;
          if (typeof syncUiFromHost === 'function') syncUiFromHost();
        },
        onChange: (val) => {
          if (sid === 'size') runCmd(`brush size ${val}`);
          else if (sid === 'opacity') runCmd(`brush opacity ${val}`);
          else if (sid === 'smoothing') runCmd(`brush stabilize ${val}`);
          else runCmd(`set ${sDef.key} ${val}`);
        }
      });
    }

    addSep();

    // 5. Brush Library Submenu
    const activeBrushKey = host.activeBrush || 'ink_pen';
    const activeBrushObj = BRUSH_PRESETS[activeBrushKey] || (host.customBrushPresets && host.customBrushPresets[activeBrushKey]);
    const activeBrushTitle = activeBrushObj ? activeBrushObj.name : activeBrushKey;

    const CAT_LABELS = {
      sketch: 'Sketch & Pencil',
      ink: 'Inking',
      paint: 'Painting',
      marker: 'Markers',
      charcoal: 'Charcoal & Pastel',
      airbrush: 'Airbrush',
      texture: 'Textured',
      blend: 'Blenders & Smudge',
      eraser: 'Erasers',
      fx: 'FX & Pixel Art'
    };
    const brushCatMap = new Map();
    for (const [k, preset] of Object.entries(BRUSH_PRESETS)) {
      const cat = preset.category || 'sketch';
      if (!brushCatMap.has(cat)) brushCatMap.set(cat, []);
      brushCatMap.get(cat).push([k, preset]);
    }
    const brushLibraryItems = [];
    if (host.customBrushPresets && Object.keys(host.customBrushPresets).length > 0) {
      brushLibraryItems.push({
        type: 'submenu',
        label: '★ Custom Presets',
        items: Object.entries(host.customBrushPresets).map(([k, preset]) => ({
          type: 'item',
          label: (host.activeBrush === k ? '✓ ' : '') + (preset.name || k),
          action: () => { host.selectBrushPreset(k); syncUiFromHost(); populateBrushPresetsUI(); }
        }))
      });
    }
    for (const [cat, list] of brushCatMap.entries()) {
      brushLibraryItems.push({
        type: 'submenu',
        label: CAT_LABELS[cat] || cat,
        items: list.map(([k, preset]) => ({
          type: 'item',
          label: (host.activeBrush === k ? '✓ ' : '') + `${preset.name} (${preset.size || 10}px)`,
          action: () => { host.selectBrushPreset(k); syncUiFromHost(); populateBrushPresetsUI(); }
        }))
      });
    }
    brushLibraryItems.push(
      { type: 'sep' },
      { type: 'item', label: '+ Save Current Brush Preset...', action: () => document.getElementById('ui-btn-save-preset')?.click() },
      { type: 'item', label: 'Reset Brush to Default', action: () => { runCmd('reset tool'); syncUiFromHost(); } }
    );

    addSubmenu(`Brush: ${activeBrushTitle}`, brushLibraryItems);

    // 6. Tools, Shapes & Guides Submenu
    const curMode = host.actionMode || 'draw';
    const curSym = host.brushParams?.symmetry || 0;
    addSubmenu('Tools, Shapes & Guides', [
      { type: 'item', label: (curMode === 'draw' && host.currentTool === 'brush' ? '✓ ' : '') + 'Freehand Brush', hotkey: 'B', action: () => { host.setActionMode('draw'); host.currentTool = 'brush'; host.setBrushParam('mode', 0); syncUiFromHost(); } },
      { type: 'item', label: (curMode === 'erase' ? '✓ ' : '') + 'Eraser Mode', hotkey: 'E', action: () => { host.setActionMode('erase'); syncUiFromHost(); } },
      { type: 'item', label: (curMode === 'blend' ? '✓ ' : '') + 'Blend / Smudge Mode', action: () => { host.setActionMode('blend'); syncUiFromHost(); } },
      { type: 'item', label: (curMode === 'clone' ? '✓ ' : '') + 'Clone Stamp Mode', action: () => { host.setActionMode('clone'); syncUiFromHost(); } },
      { type: 'item', label: (host.currentTool === 'fill' ? '✓ ' : '') + 'Flood Fill (Bucket)', hotkey: 'G', action: () => { host.setActionMode('draw'); host.currentTool = 'fill'; host.setBrushParam('mode', 3); syncUiFromHost(); } },
      { type: 'item', label: (host.currentTool === 'lasso_fill' ? '✓ ' : '') + 'Lasso Fill', action: () => { host.setActionMode('draw'); host.currentTool = 'lasso_fill'; host.setBrushParam('mode', 4); syncUiFromHost(); } },
      { type: 'sep' },
      {
        type: 'submenu',
        label: 'Geometric Shapes',
        items: [
          { type: 'item', label: (host.currentTool === 'line' ? '✓ ' : '') + 'Line Tool', action: () => { host.setActionMode('draw'); host.currentTool = 'line'; host.setBrushParam('mode', 6); syncUiFromHost(); } },
          { type: 'item', label: (host.currentTool === 'rect' ? '✓ ' : '') + 'Rectangle Tool', action: () => { host.setActionMode('draw'); host.currentTool = 'rect'; host.setBrushParam('mode', 7); syncUiFromHost(); } },
          { type: 'item', label: (host.currentTool === 'ellipse' ? '✓ ' : '') + 'Ellipse / Circle Tool', action: () => { host.setActionMode('draw'); host.currentTool = 'ellipse'; host.setBrushParam('mode', 8); syncUiFromHost(); } }
        ]
      },
      {
        type: 'submenu',
        label: 'Selection Tools',
        items: [
          { type: 'item', label: (curMode === 'select' && host.currentTool === 'select_rect' ? '✓ ' : '') + 'Rectangle Marquee', hotkey: 'M', action: () => { host.setActionMode('select'); host.currentTool = 'select_rect'; host.setBrushParam('mode', 9); syncUiFromHost(); } },
          { type: 'item', label: (curMode === 'select' && host.currentTool === 'lasso_select' ? '✓ ' : '') + 'Freehand Lasso Select', action: () => { host.setActionMode('select'); host.currentTool = 'lasso_select'; host.setBrushParam('mode', 10); syncUiFromHost(); } },
          { type: 'item', label: (curMode === 'select' && host.currentTool === 'magic_wand' ? '✓ ' : '') + 'Magic Wand Select', action: () => { host.setActionMode('select'); host.currentTool = 'magic_wand'; host.setBrushParam('mode', 11); syncUiFromHost(); } },
          { type: 'item', label: (curMode === 'select' && host.currentTool === 'brush' ? '✓ ' : '') + 'Selection Brush Mask', action: () => { host.setActionMode('select'); host.currentTool = 'brush'; host.setBrushParam('mode', 0); syncUiFromHost(); } },
          { type: 'sep' },
          { type: 'item', label: '🖌 Paint Inside Selection (Keep Mask)', action: () => { host.setActionMode('draw'); host.currentTool = 'brush'; host.setBrushParam('mode', 0); syncUiFromHost(); } },
          { type: 'item', label: '🧹 Erase Inside Selection (Keep Mask)', action: () => { host.setActionMode('erase'); host.currentTool = 'brush'; host.setBrushParam('mode', 0); syncUiFromHost(); } },
          { type: 'sep' },
          { type: 'item', label: 'Select All', hotkey: 'Ctrl+A', action: () => runCmd('select all') },
          { type: 'item', label: 'Invert Selection', hotkey: 'Ctrl+Shift+I', action: () => runCmd('select invert') },
          { type: 'item', label: 'Deselect', hotkey: 'Ctrl+D', action: () => runCmd('deselect') }
        ]
      },
      {
        type: 'submenu',
        label: 'Symmetry Guides',
        items: [
          { type: 'item', label: (curSym === 0 ? '✓ ' : '') + 'Symmetry Off', action: () => runCmd('set symmetry 0') },
          { type: 'item', label: (curSym === 1 ? '✓ ' : '') + 'Horizontal Mirror (X)', action: () => runCmd('set symmetry 1') },
          { type: 'item', label: (curSym === 2 ? '✓ ' : '') + 'Vertical Mirror (Y)', action: () => runCmd('set symmetry 2') },
          { type: 'item', label: (curSym === 3 ? '✓ ' : '') + 'Quad Mirror (X + Y)', action: () => runCmd('set symmetry 3') },
          { type: 'item', label: (curSym === 4 ? '✓ ' : '') + 'Radial / Mandala', action: () => runCmd('set symmetry 4') }
        ]
      },
      { type: 'item', label: 'Free Transform Layer', hotkey: 'Ctrl+T', action: () => runCmd('transform') },
      { type: 'sep' },
      { type: 'item', label: 'Open Tools Tab...', action: () => window.openPainterDockPanel?.('tools') }
    ]);

    // 7. Active Layer Submenu
    const activeLayerIdx = host.canvasActor?.exports?.get_active_layer ? host.canvasActor.exports.get_active_layer() : 0;
    const activeLayerVis = host.canvasActor?.exports?.get_layer_visible ? host.canvasActor.exports.get_layer_visible(activeLayerIdx) : 1;
    const activeLayerOp255 = host.canvasActor?.exports?.get_layer_opacity ? host.canvasActor.exports.get_layer_opacity(activeLayerIdx) : 255;
    const activeLayerOpPct = Math.round((activeLayerOp255 / 255) * 100);
    const activeAlphaLock = host.getLayerAlphaLock ? host.getLayerAlphaLock(activeLayerIdx) : 0;
    const activeClipping = host.getLayerClipping ? host.getLayerClipping(activeLayerIdx) : 0;
    const activeBlend = host.getLayerBlendMode ? host.getLayerBlendMode(activeLayerIdx) : 0;
    const blendModesList = [
      { val: 0, label: 'Normal' },
      { val: 1, label: 'Multiply' },
      { val: 2, label: 'Screen' },
      { val: 3, label: 'Overlay' },
      { val: 4, label: 'Color Dodge' },
      { val: 5, label: 'Linear Dodge (Add)' }
    ];
    const activeLayerItems = [
      {
        type: 'slider',
        label: `Layer #${activeLayerIdx} Opacity`,
        min: 0,
        max: 100,
        value: activeLayerOpPct,
        unit: '%',
        onInput: (val) => {
          const alpha = Math.min(255, Math.max(0, Math.round((val / 100) * 255)));
          if (host.canvasActor?.exports?.w_layer_opacity) {
            host.canvasActor.exports.w_layer_opacity(activeLayerIdx, alpha);
            host.render();
          }
          const opTxt = document.getElementById(`layer-op-text-${activeLayerIdx}`);
          if (opTxt) opTxt.textContent = `${Math.round(val)}%`;
        }
      },
      {
        type: 'submenu',
        label: `Blend Mode (${(blendModesList.find(b => b.val === activeBlend) || blendModesList[0]).label})`,
        items: blendModesList.map(b => ({
          type: 'item',
          label: (b.val === activeBlend ? '✓ ' : '') + b.label,
          action: () => runCmd(`layer blend ${activeLayerIdx} ${b.val}`)
        }))
      },
      { type: 'item', label: (activeLayerVis ? '✓ ' : '') + 'Visible', action: () => runCmd(`toggle layer ${activeLayerIdx}`) },
      { type: 'item', label: (activeAlphaLock ? '✓ ' : '') + 'Alpha Lock (⚿)', action: () => runCmd(`layer alpha_lock ${activeLayerIdx} ${activeAlphaLock ? 'off' : 'on'}`) },
      { type: 'item', label: (activeClipping ? '✓ ' : '') + 'Clipping Mask (⮑)', action: () => runCmd(`layer clipping ${activeLayerIdx} ${activeClipping ? 'off' : 'on'}`) },
      { type: 'sep' },
      { type: 'item', label: '+ New Raster Layer', action: () => runCmd('add layer') },
      { type: 'item', label: '+ New Folder / Group', action: () => runCmd('new group') },
      { type: 'item', label: 'Import Image as Layer...', action: () => fileInput?.click() },
      { type: 'sep' },
      { type: 'item', label: 'Duplicate Layer', action: () => runCmd('layer duplicate') },
      { type: 'item', label: 'Merge Down', action: () => runCmd('layer merge_down') },
      { type: 'item', label: 'Invert Layer Colors', action: () => runCmd(`layer invert ${activeLayerIdx}`) },
      { type: 'sep' },
      { type: 'item', label: isVecLayer ? 'Clear Vector Layer' : 'Clear Layer', action: () => runCmd('clear'), danger: true },
      { type: 'item', label: 'Delete Active Layer', action: () => runCmd(`delete layer ${activeLayerIdx}`), danger: true }
    ];
    addSubmenu(`Active Layer (#${activeLayerIdx})`, activeLayerItems);

    // 8. Filters, Pixel Art & Animation Submenus
    addSubmenu('Filters', [buildDomPanelAction('filters')]);
    if (!isVecLayer) {
      addSubmenu('Pixel Art Studio', [buildDomPanelAction('pixelart')]);
    }
    addSubmenu('Animation Timeline', [
      { type: 'item', label: host.rasterAnimator?.isPlaying ? '⏸ Pause Playback' : '▶ Play Animation', hotkey: 'Space', action: () => { host.rasterAnimator?.togglePlay(); syncUiFromHost(); } },
      { type: 'item', label: (host.rasterAnimator?.loop ? '✓ ' : '') + 'Loop Playback', action: () => { if (host.rasterAnimator) { host.rasterAnimator.loop = !host.rasterAnimator.loop; host.rasterAnimatorUI?.syncUI(); } } },
      { type: 'item', label: '+ Add Blank Frame', action: () => { host.rasterAnimator?.addFrame(false); host.rasterAnimatorUI?.syncUI(); syncUiFromHost(); } },
      { type: 'item', label: 'Duplicate Frame', action: () => { host.rasterAnimator?.addFrame(true); host.rasterAnimatorUI?.syncUI(); syncUiFromHost(); } },
      { type: 'item', label: 'Delete Frame', danger: true, action: () => { host.rasterAnimator?.deleteFrame(); host.rasterAnimatorUI?.syncUI(); syncUiFromHost(); } },
      { type: 'item', label: (host.rasterAnimator?.onionSkin?.enabled ? '✓ ' : '') + 'Onion Skin', hotkey: 'O', action: () => { host.rasterAnimator?.toggleOnionSkin(); host.render(); } },
      {
        type: 'slider',
        label: 'Frame Rate (FPS)',
        min: 1,
        max: 60,
        value: host.rasterAnimator?.fps || 12,
        unit: ' fps',
        onInput: (val) => { host.rasterAnimator?.setFps(val); host.rasterAnimatorUI?.syncUI(); }
      }
    ]);

    addSep();
    addItem('Undo', 'Ctrl+Z', () => runCmd('undo'));
    addItem('Redo', 'Ctrl+Y', () => runCmd('redo'));
    if (host.clipboardBuffer) addItem('Paste', 'Ctrl+V', () => runCmd('paste'));

    if (isTopBar) {
      addSep();

      const dockApi = window.painterDockviewApi;
      const isTabOpen = (id) => !!(dockApi && dockApi.getPanel(id));
      const curW = host.canvasActor?.exports?.get_canvas_width ? host.canvasActor.exports.get_canvas_width() : (host.docWidth || 1280);
      const curH = host.canvasActor?.exports?.get_canvas_height ? host.canvasActor.exports.get_canvas_height() : (host.docHeight || 720);
      const uiScaleOpts = [
        { val: 'auto', label: 'Auto (Responsive)' },
        { val: '0.75', label: '75% (Small)' },
        { val: '0.85', label: '85%' },
        { val: '1.0', label: '100% (Default)' },
        { val: '1.15', label: '115%' },
        { val: '1.25', label: '125%' },
        { val: '1.5', label: '150% (Large)' }
      ];

      // Canvas & View Submenu
      addSubmenu('Canvas & View', [
        { type: 'item', label: 'Zoom to Fit (Reset View)', hotkey: 'Ctrl+0', action: () => { host.zoom = 1.0; host.panX = 0; host.panY = 0; host.canvasRotation = 0; host.render(); } },
        { type: 'item', label: '100% Zoom (1:1)', action: () => { if (host.zoomTo100) host.zoomTo100(); } },
        { type: 'item', label: 'Reset Rotation (0°)', action: () => { if (host.resetRotation) host.resetRotation(); else { host.canvasRotation = 0; host.render(); } } },
        { type: 'item', label: 'Center Canvas', action: () => { if (host.centerCanvas) host.centerCanvas(); else { host.panX = 0; host.panY = 0; host.render(); } } },
        { type: 'item', label: (host.flipH ? '✓ ' : '') + 'Flip View Horizontal', action: () => { host.flipH = !host.flipH; host.render(); syncUiFromHost(); } },
        { type: 'item', label: (host.flipV ? '✓ ' : '') + 'Flip View Vertical', action: () => { host.flipV = !host.flipV; host.render(); syncUiFromHost(); } },
        { type: 'item', label: (host.showPixelGrid ? '✓ ' : '') + 'Show Pixel Grid', action: () => { syncPixelGrid(!host.showPixelGrid); } },
        { type: 'sep' },
        {
          type: 'submenu',
          label: 'Workspace Tabs',
          items: [
            { type: 'item', label: (isTabOpen('layers') ? '✓ ' : '') + 'Layers Tab', action: () => window.togglePainterDockPanel?.('layers') },
            { type: 'item', label: (isTabOpen('tools') ? '✓ ' : '') + 'Tools Tab', action: () => window.togglePainterDockPanel?.('tools') },
            { type: 'item', label: (isTabOpen('color') ? '✓ ' : '') + 'Color Studio Tab', action: () => window.togglePainterDockPanel?.('color') },
            { type: 'item', label: (isTabOpen('lab') ? '✓ ' : '') + 'Brush Lab Tab', action: () => window.togglePainterDockPanel?.('lab') },
            { type: 'item', label: (isTabOpen('timeline') ? '✓ ' : '') + 'Timeline Tab', action: () => window.togglePainterDockPanel?.('timeline') },
            { type: 'sep' },
            { type: 'item', label: 'Reset Workspace Layout', action: () => window.resetPainterDockLayout?.() }
          ]
        },
        {
          type: 'submenu',
          label: `Canvas Size & Transform (${curW}×${curH})`,
          items: [
            {
              type: 'custom',
              render: () => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 4px;';
                const wInp = document.createElement('input');
                wInp.type = 'number';
                wInp.className = 'ui-input-num';
                wInp.value = String(curW);
                wInp.min = '16';
                wInp.max = '16384';
                wInp.style.cssText = 'width:58px;height:24px;font-size:11px;text-align:center;';
                const sep = document.createElement('span');
                sep.textContent = '×';
                sep.style.cssText = 'color:var(--text-muted);font-weight:bold;';
                const hInp = document.createElement('input');
                hInp.type = 'number';
                hInp.className = 'ui-input-num';
                hInp.value = String(curH);
                hInp.min = '16';
                hInp.max = '16384';
                hInp.style.cssText = 'width:58px;height:24px;font-size:11px;text-align:center;';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ip-btn ip-mini-btn active';
                btn.textContent = 'Resize';
                btn.style.cssText = 'flex:1;height:24px;padding:0 8px;font-size:10.5px;';
                btn.addEventListener('click', (ev) => {
                  ev.stopPropagation();
                  const nw = parseInt(wInp.value, 10);
                  const nh = parseInt(hInp.value, 10);
                  if (nw >= 16 && nh >= 16) {
                    runCmd(`canvas resize ${nw} ${nh}`);
                    window.contextMenuService?.hideContextMenu();
                  }
                });
                [wInp, hInp].forEach(inp => inp.addEventListener('keydown', (ke) => {
                  ke.stopPropagation();
                  if (ke.key === 'Enter') btn.click();
                }));
                row.appendChild(wInp);
                row.appendChild(sep);
                row.appendChild(hInp);
                row.appendChild(btn);
                return row;
              }
            },
            { type: 'item', label: '640×480 (VGA)', action: () => runCmd('canvas resize 640 480') },
            { type: 'item', label: '1280×720 (720p HD)', action: () => runCmd('canvas resize 1280 720') },
            { type: 'item', label: '1920×1080 (1080p FHD)', action: () => runCmd('canvas resize 1920 1080') },
            { type: 'item', label: '1080×1080 (1:1 Square)', action: () => runCmd('canvas resize 1080 1080') },
            { type: 'sep' },
            { type: 'item', label: 'Rotate Canvas 90° CW', action: () => runCmd('canvas rotate 90') },
            { type: 'item', label: 'Rotate Canvas 90° CCW', action: () => runCmd('canvas rotate -90') },
            { type: 'item', label: 'Flip Canvas Horizontal', action: () => runCmd('canvas flip h') },
            { type: 'item', label: 'Flip Canvas Vertical', action: () => runCmd('canvas flip v') },
            { type: 'item', label: 'Crop Canvas to Selection', action: () => runCmd('crop') }
          ]
        },
        {
          type: 'submenu',
          label: 'Renderer & Performance',
          items: [
            { type: 'item', label: (host.powerSaveMode ? '✓ ' : '') + 'Power Saving Mode (Battery & Thermal Saver)', action: () => host.setPowerSaveMode?.(!host.powerSaveMode) },
            { type: 'sep' },
            { type: 'item', label: (host.renderMode !== 'cpu' ? '✓ ' : '') + 'WebGL 2 (GPU)', action: () => document.querySelector('.render-engine-opt[data-engine="gpu"]')?.click() },
            { type: 'item', label: (host.renderMode === 'cpu' ? '✓ ' : '') + 'Software (2D CPU)', action: () => document.querySelector('.render-engine-opt[data-engine="software"]')?.click() },
            { type: 'sep' },
            { type: 'item', label: (!host.viewportFiltering ? '✓ ' : '') + 'Nearest (Crisp / Pixel Art)', action: () => document.querySelector('.view-filter-opt[data-vfilter="nearest"]')?.click() },
            { type: 'item', label: (host.viewportFiltering ? '✓ ' : '') + 'Bilinear (Smooth)', action: () => document.querySelector('.view-filter-opt[data-vfilter="bilinear"]')?.click() },
            { type: 'sep' },
            {
              type: 'slider',
              label: 'Undo History Limit',
              min: 0,
              max: 100,
              value: host.maxUndoSteps !== undefined ? host.maxUndoSteps : 25,
              unit: ' steps',
              onInput: (val) => { syncMaxUndo(Math.round(val / 5) * 5); }
            }
          ]
        },
        {
          type: 'submenu',
          label: 'Input, Cursor & UI',
          items: [
            { type: 'item', label: (host.showBrushOutline ? '✓ ' : '') + 'Brush Cursor Outline', action: () => syncBrushOutline(!host.showBrushOutline) },
            { type: 'item', label: (host.enableTouchUndoRedo ? '✓ ' : '') + 'Touch Gestures (2-Finger Undo / 3-Finger Redo)', action: () => syncTouchUndoRedo(!host.enableTouchUndoRedo) },
            {
              type: 'submenu',
              label: 'Theme',
              items: [
                {
                  type: 'item',
                  label: ((localStorage.getItem('esenho_theme') || 'dark') === 'dark' ? '✓ ' : '') + 'Gruvbox Dark',
                  action: () => { window.setPainterTheme?.('dark'); }
                },
                {
                  type: 'item',
                  label: ((localStorage.getItem('esenho_theme') || 'dark') === 'gray' ? '✓ ' : '') + 'Gray (Modern Neutral)',
                  action: () => { window.setPainterTheme?.('gray'); }
                },
                {
                  type: 'item',
                  label: ((localStorage.getItem('esenho_theme') || 'dark') === 'skeuo' ? '✓ ' : '') + 'Skeuomorphic (Hardware)',
                  action: () => { window.setPainterTheme?.('skeuo'); }
                }
              ]
            },
            { type: 'sep' },
            {
              type: 'submenu',
              label: `UI Scale (${host.uiScale || 'auto'})`,
              items: uiScaleOpts.map(o => ({
                type: 'item',
                label: (String(host.uiScale || 'auto') === o.val ? '✓ ' : '') + o.label,
                action: () => host.setUiScale(o.val)
              }))
            },
            {
              type: 'submenu',
              label: 'Context Menu Sliders',
              items: buildContextMenuSlidersActions()
            }
          ]
        }
      ]);

      // Project & File Submenu
      addSubmenu('Project & File', [
        {
          type: 'submenu',
          label: 'New Project',
          items: [buildDomPanelAction('newproj')]
        },
        {
          type: 'submenu',
          label: 'Recent Projects',
          items: [buildDomPanelAction('recents')]
        },
        { type: 'item', label: 'Open / Import (.esen, Image)...', hotkey: 'Ctrl+O', action: () => fileInput?.click() },
        { type: 'item', label: 'Save Project Snapshot', hotkey: 'Ctrl+S', action: () => document.getElementById('btn-ip-save-proj')?.click() },
        {
          type: 'submenu',
          label: 'Export',
          items: [
            { type: 'item', label: 'Export PNG (.png)', action: () => exportImage('image/png') },
            { type: 'item', label: 'Export JPEG (.jpg)', action: () => exportImage('image/jpeg') },
            { type: 'item', label: 'Export Animated GIF (.gif)', action: () => exportAnimatedGif() },
            { type: 'item', label: 'Export WebM Video (.webm)', action: () => exportWebmVideo() },
            { type: 'item', label: 'Export Project (.esen)', action: () => exportEsenProject() }
          ]
        },
        { type: 'sep' },
        { type: 'item', label: 'Clear Project Storage...', danger: true, action: () => document.getElementById('btn-ip-recents-clear')?.click() }
      ]);

      // Version & About
      addSep();
      const pVersion = (typeof window !== 'undefined' && window.ESENHO_VERSION) ? window.ESENHO_VERSION : '0.13.54';
      addItem(`v${pVersion}`, '', async () => {
        if (typeof performAutosave === 'function') {
          saveUserPreferences();
          await performAutosave(true);
        } else {
          document.getElementById('btn-ip-save-proj')?.click();
        }
        log(`esenho v${pVersion} — Project saved [ok]`);
        if (typeof showNotification === 'function') {
          showNotification(`v${pVersion} · Saved`);
        }
      });
    }

    return items;
  }

  function showPainterContextMenu(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    const items = buildPainterContextMenuItems(e, { isTopBar: false });
    window.contextMenuService.showContextMenu({
      getAnchor: () => ({ x: e ? e.clientX : 10, y: e ? e.clientY : 10 }),
      getActions: () => items
    });
  }
  window.showPainterContextMenu = showPainterContextMenu;

  function showPainterTitleBarContextMenu(e) {
    if (!window.contextMenuService) return;
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
      e.stopPropagation();
    }
    const items = buildPainterContextMenuItems(e, { isTopBar: true });
    window.contextMenuService.showContextMenu({
      getAnchor: () => {
        const rect = document.getElementById('btn-menu-logo')?.getBoundingClientRect();
        if (rect) return { x: rect.left, y: rect.bottom + 2 };
        if (e && e.clientX !== undefined && e.clientY !== undefined) {
          return { x: e.clientX, y: e.clientY };
        }
        return { x: 10, y: 30 };
      },
      getActions: () => items
    });
  }
  window.showPainterTitleBarContextMenu = showPainterTitleBarContextMenu;

  const topBarEl = document.getElementById('ip-top-bar');
  if (topBarEl) {
    topBarEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showPainterTitleBarContextMenu(e);
    });
  }

  /* ── Mouse events ── */
  canvasEl.addEventListener('contextmenu', showPainterContextMenu);

  /* Helper: hit-test float transform handles. Returns handle id string or null. */
  /* Maps doc-space handle positions to screen-space, returns handle id or null */
  function ftHitTest(x, y, isTouch = false) {
    const ft = host.floatingTransform;
    if (!ft || !ft.corners) return null;
    const z = host.zoom;
    const hs = isTouch ? 30 : 16; // hit radius px in screen space
    const c = ft.corners;

    // Centroid
    const cxDoc = (c[0].x + c[1].x + c[2].x + c[3].x) / 4;
    const cyDoc = (c[0].y + c[1].y + c[2].y + c[3].y) / 4;

    // Rotation handle above top edge midpoint
    const topMid = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 };
    let vx = topMid.x - cxDoc;
    let vy = topMid.y - cyDoc;
    let len = Math.hypot(vx, vy);
    let nx = 0, ny = -1;
    if (len > 1e-4) { nx = vx / len; ny = vy / len; }
    const rotDistDoc = 24 / z;
    const rotHandle = { id: 'rot', x: topMid.x + nx * rotDistDoc, y: topMid.y + ny * rotDistDoc };

    // Corner handles: c0=tl, c1=tr, c2=br, c3=bl
    const cornerHandles = [
      { id: 'c0', x: c[0].x, y: c[0].y },
      { id: 'c1', x: c[1].x, y: c[1].y },
      { id: 'c2', x: c[2].x, y: c[2].y },
      { id: 'c3', x: c[3].x, y: c[3].y },
    ];
    // Edge midpoint handles (skew): e01=top, e12=right, e23=bottom, e30=left
    const edgeHandles = [
      { id: 'e01', x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 }, // top
      { id: 'e12', x: (c[1].x + c[2].x) / 2, y: (c[1].y + c[2].y) / 2 }, // right
      { id: 'e23', x: (c[2].x + c[3].x) / 2, y: (c[2].y + c[3].y) / 2 }, // bottom
      { id: 'e30', x: (c[3].x + c[0].x) / 2, y: (c[3].y + c[0].y) / 2 }, // left
    ];

    // Priority: rot handle -> corner handles -> edge handles
    for (const h of [rotHandle, ...cornerHandles, ...edgeHandles]) {
      const dx = (h.x - x) * z, dy = (h.y - y) * z;
      if (Math.abs(dx) < hs && Math.abs(dy) < hs) return h.id;
    }

    // Inside quad check (winding-number / ray casting or consistent sign cross product)
    function pointInPolygon(px, py, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > py) !== (yj > py)) &&
                          (px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-12) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }
    if (pointInPolygon(x, y, c)) return 'move';
    return null;
  }

  function getFtPreviewCanvas(ft) {
    if (ft._previewCanvas && ft._previewCanvasWidth === ft.width && ft._previewCanvasHeight === ft.height) {
      return ft._previewCanvas;
    }
    const cvs = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(ft.width, ft.height)
      : document.createElement('canvas');
    cvs.width = ft.width;
    cvs.height = ft.height;
    const pctx = cvs.getContext('2d');
    const img = pctx.createImageData(ft.width, ft.height);
    new Uint32Array(img.data.buffer).set(ft.pixels);
    pctx.putImageData(img, 0, 0);
    ft._previewCanvas = cvs;
    ft._previewCanvasWidth = ft.width;
    ft._previewCanvasHeight = ft.height;
    return cvs;
  }

  function drawWarpedQuad(targetCtx, img, c, z, fw, fh) {
    // Triangle 1: (0,0), (fw,0), (0,fh) -> c[0], c[1], c[3]
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.moveTo(c[0].x * z, c[0].y * z);
    targetCtx.lineTo(c[1].x * z, c[1].y * z);
    targetCtx.lineTo(c[3].x * z, c[3].y * z);
    targetCtx.closePath();
    targetCtx.clip();
    const m00_1 = (c[1].x - c[0].x) * z / fw;
    const m10_1 = (c[1].y - c[0].y) * z / fw;
    const m01_1 = (c[3].x - c[0].x) * z / fh;
    const m11_1 = (c[3].y - c[0].y) * z / fh;
    targetCtx.transform(m00_1, m10_1, m01_1, m11_1, c[0].x * z, c[0].y * z);
    targetCtx.drawImage(img, 0, 0);
    targetCtx.restore();

    // Triangle 2: (fw,fh), (0,fh), (fw,0) -> c[2], c[3], c[1]
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.moveTo(c[2].x * z, c[2].y * z);
    targetCtx.lineTo(c[3].x * z, c[3].y * z);
    targetCtx.lineTo(c[1].x * z, c[1].y * z);
    targetCtx.closePath();
    targetCtx.clip();
    const m00_2 = (c[3].x - c[2].x) * z / fw;
    const m10_2 = (c[3].y - c[2].y) * z / fw;
    const m01_2 = (c[1].x - c[2].x) * z / fh;
    const m11_2 = (c[1].y - c[2].y) * z / fh;
    targetCtx.transform(-m00_2, -m10_2, -m01_2, -m11_2, c[2].x * z, c[2].y * z);
    targetCtx.drawImage(img, 0, 0);
    targetCtx.restore();
  }

  function updateFtCorners(sx, sy) {
    if (!ftDragging || !ftHandle || !ftDragStart || !ftDragOrigin) return;
    const ft = host.floatingTransform;
    if (!ft || !ftDragOrigin.corners) return;

    // Use document coordinates: respects canvasRotation, zoom, pan, and flip!
    const curDoc = screenToDoc(sx, sy);
    const ddx = curDoc.x - ftDragStart.x;
    const ddy = curDoc.y - ftDragStart.y;
    const oc = ftDragOrigin.corners;
    const tMode = host.transformMode || 'scale';
    const lockAspect = !!(host.transformLockAspect || host.shiftKey || (typeof window !== 'undefined' && window.event && window.event.shiftKey));
    const freeCorner = (tMode === 'distort') || !!(typeof window !== 'undefined' && window.event && (window.event.ctrlKey || window.event.metaKey));

    if (ftHandle === 'rot') {
      const cx = ftDragOrigin.cx;
      const cy = ftDragOrigin.cy;
      let angle = Math.atan2(curDoc.y - cy, curDoc.x - cx) - ftDragOrigin.startAngle;
      if (host.shiftKey || (typeof window !== 'undefined' && window.event && window.event.shiftKey)) {
        const step = Math.PI / 12; // 15-degree snap
        angle = Math.round(angle / step) * step;
      }
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      for (let i = 0; i < 4; i++) {
        const dx = oc[i].x - cx;
        const dy = oc[i].y - cy;
        ft.corners[i].x = cx + dx * cosA - dy * sinA;
        ft.corners[i].y = cy + dx * sinA + dy * cosA;
      }
    } else if (ftHandle === 'move') {
      for (let i = 0; i < 4; i++) {
        ft.corners[i].x = oc[i].x + ddx;
        ft.corners[i].y = oc[i].y + ddy;
      }
    } else if (ftHandle === 'c0' || ftHandle === 'c1' || ftHandle === 'c2' || ftHandle === 'c3') {
      const idx = parseInt(ftHandle.slice(1), 10);
      if (freeCorner) {
        ft.corners[idx].x = oc[idx].x + ddx;
        ft.corners[idx].y = oc[idx].y + ddy;
      } else {
        // Scale relative to opposite corner along quad's local axes
        const oppIdx = (idx + 2) % 4;
        const opp = oc[oppIdx];
        const uAxis = { x: oc[1].x - oc[0].x, y: oc[1].y - oc[0].y };
        const vAxis = { x: oc[3].x - oc[0].x, y: oc[3].y - oc[0].y };
        const uLen = Math.max(1e-4, Math.hypot(uAxis.x, uAxis.y));
        const vLen = Math.max(1e-4, Math.hypot(vAxis.x, vAxis.y));
        const ux = uAxis.x / uLen, uy = uAxis.y / uLen;
        const vx = vAxis.x / vLen, vy = vAxis.y / vLen;

        const origRelX = oc[idx].x - opp.x;
        const origRelY = oc[idx].y - opp.y;
        const newRelX = origRelX + ddx;
        const newRelY = origRelY + ddy;

        const origU = origRelX * ux + origRelY * uy;
        const origV = origRelX * vx + origRelY * vy;
        const newU = newRelX * ux + newRelY * uy;
        const newV = newRelX * vx + newRelY * vy;

        let sU = Math.abs(origU) > 1e-3 ? (newU / origU) : 1;
        let sV = Math.abs(origV) > 1e-3 ? (newV / origV) : 1;
        if (lockAspect) {
          const signU = sU < 0 ? -1 : 1;
          const signV = sV < 0 ? -1 : 1;
          const mag = (Math.abs(sU) + Math.abs(sV)) * 0.5;
          sU = signU * mag;
          sV = signV * mag;
        }
        for (let i = 0; i < 4; i++) {
          const rx = oc[i].x - opp.x;
          const ry = oc[i].y - opp.y;
          const cu = (rx * ux + ry * uy) * sU;
          const cv = (rx * vx + ry * vy) * sV;
          ft.corners[i].x = opp.x + cu * ux + cv * vx;
          ft.corners[i].y = opp.y + cu * uy + cv * vy;
        }
      }
    } else if (ftHandle === 'e01' || ftHandle === 'e23' || ftHandle === 'e30' || ftHandle === 'e12') {
      const edgeMap = { e01: [0, 1, 3, 2], e23: [2, 3, 1, 0], e30: [3, 0, 2, 1], e12: [1, 2, 0, 3] };
      const [aIdx, bIdx, oppA, oppB] = edgeMap[ftHandle];
      if (tMode === 'skew' || tMode === 'distort') {
        ft.corners[aIdx].x = oc[aIdx].x + ddx; ft.corners[aIdx].y = oc[aIdx].y + ddy;
        ft.corners[bIdx].x = oc[bIdx].x + ddx; ft.corners[bIdx].y = oc[bIdx].y + ddy;
      } else {
        // Scale along axis perpendicular to the opposite edge
        const axisX = oc[aIdx].x - oc[oppA].x;
        const axisY = oc[aIdx].y - oc[oppA].y;
        const axisLen = Math.max(1e-4, Math.hypot(axisX, axisY));
        const ax = axisX / axisLen, ay = axisY / axisLen;
        const proj = ddx * ax + ddy * ay;
        ft.corners[aIdx].x = oc[aIdx].x + proj * ax; ft.corners[aIdx].y = oc[aIdx].y + proj * ay;
        ft.corners[bIdx].x = oc[bIdx].x + proj * ax; ft.corners[bIdx].y = oc[bIdx].y + proj * ay;
      }
    }
    host._forceNextFrame = true;
    if (typeof host.requestRender === 'function') host.requestRender();
  }

  function bakeFtPreview() {
    const ft = host.floatingTransform;
    if (!ft || !host.canvasActor?.exports?.w_layer_get_pixels) return;
    const ptr = host.canvasActor.exports.w_layer_get_pixels(ft.layerId);
    if (!ptr) return;
    const lw = host.canvasActor.exports.w_layer_get_width(ft.layerId);
    const lh = host.canvasActor.exports.w_layer_get_height(ft.layerId);
    const tgtU32 = new Uint32Array(host.canvasActor.memory.buffer, ptr, lw * lh);
    tgtU32.fill(0);
    const srcPts = [
      { x: 0, y: 0 }, { x: ft.width, y: 0 },
      { x: ft.width, y: ft.height }, { x: 0, y: ft.height }
    ];
    const H_inv = host._computeHomography(ft.corners, srcPts);
    const useSmooth = (host.transformInterpolation === 'bilinear');
    if (H_inv) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of ft.corners) {
        if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
      }
      const x0 = Math.max(0, Math.floor(minX)), y0 = Math.max(0, Math.floor(minY));
      const x1 = Math.min(lw - 1, Math.ceil(maxX)), y1 = Math.min(lh - 1, Math.ceil(maxY));
      const fw = ft.width, fh = ft.height;
      const srcPixels = ft.pixels;
      const isAffine = Math.abs(H_inv[6]) < 1e-7 && Math.abs(H_inv[7]) < 1e-7;

      if (isAffine) {
        const invW = 1 / (H_inv[8] || 1);
        const a = H_inv[0] * invW, b = H_inv[1] * invW, c = H_inv[2] * invW;
        const d = H_inv[3] * invW, e = H_inv[4] * invW, f = H_inv[5] * invW;

        for (let oy = y0; oy <= y1; oy++) {
          const cy = oy + 0.5;
          let sxExact = a * (x0 + 0.5) + b * cy + c - 0.5;
          let syExact = d * (x0 + 0.5) + e * cy + f - 0.5;
          const rowOffset = oy * lw;

          for (let ox = x0; ox <= x1; ox++) {
            if (!useSmooth) {
              const srcX = Math.round(sxExact);
              const srcY = Math.round(syExact);
              if (srcX >= 0 && srcX < fw && srcY >= 0 && srcY < fh) {
                const sp = srcPixels[srcY * fw + srcX];
                if (((sp >> 24) & 0xFF) !== 0) {
                  tgtU32[rowOffset + ox] = sp;
                }
              }
            } else {
              if (sxExact >= -0.5 && sxExact < fw - 0.5 && syExact >= -0.5 && syExact < fh - 0.5) {
                const ix0 = Math.max(0, Math.min(fw - 1, Math.floor(sxExact)));
                const iy0 = Math.max(0, Math.min(fh - 1, Math.floor(syExact)));
                const ix1 = Math.max(0, Math.min(fw - 1, ix0 + 1));
                const iy1 = Math.max(0, Math.min(fh - 1, iy0 + 1));
                const fx = Math.max(0, Math.min(1, sxExact - ix0));
                const fy = Math.max(0, Math.min(1, syExact - iy0));
                const p00 = srcPixels[iy0 * fw + ix0];
                const p10 = srcPixels[iy0 * fw + ix1];
                const p01 = srcPixels[iy1 * fw + ix0];
                const p11 = srcPixels[iy1 * fw + ix1];
                const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
                const alpha = Math.round(((p00 >>> 24) * w00) + ((p10 >>> 24) * w10) + ((p01 >>> 24) * w01) + ((p11 >>> 24) * w11));
                if (alpha !== 0) {
                  const r = Math.round(((p00 & 0xFF) * w00) + ((p10 & 0xFF) * w10) + ((p01 & 0xFF) * w01) + ((p11 & 0xFF) * w11));
                  const g = Math.round((((p00 >> 8) & 0xFF) * w00) + (((p10 >> 8) & 0xFF) * w10) + (((p01 >> 8) & 0xFF) * w01) + (((p11 >> 8) & 0xFF) * w11));
                  const b = Math.round((((p00 >> 16) & 0xFF) * w00) + (((p10 >> 16) & 0xFF) * w10) + (((p01 >> 16) & 0xFF) * w01) + (((p11 >> 16) & 0xFF) * w11));
                  tgtU32[rowOffset + ox] = ((alpha & 0xFF) << 24) | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
                }
              }
            }
            sxExact += a;
            syExact += d;
          }
        }
      } else {
        for (let oy = y0; oy <= y1; oy++) {
          const rowOffset = oy * lw;
          for (let ox = x0; ox <= x1; ox++) {
            const W = H_inv[6] * (ox + 0.5) + H_inv[7] * (oy + 0.5) + H_inv[8];
            const sxExact = (H_inv[0] * (ox + 0.5) + H_inv[1] * (oy + 0.5) + H_inv[2]) / W - 0.5;
            const syExact = (H_inv[3] * (ox + 0.5) + H_inv[4] * (oy + 0.5) + H_inv[5]) / W - 0.5;
            if (!useSmooth) {
              const srcX = Math.round(sxExact);
              const srcY = Math.round(syExact);
              if (srcX >= 0 && srcX < fw && srcY >= 0 && srcY < fh) {
                const sp = srcPixels[srcY * fw + srcX];
                if (((sp >> 24) & 0xFF) !== 0) {
                  tgtU32[rowOffset + ox] = sp;
                }
              }
            } else {
              if (sxExact >= -0.5 && sxExact < fw - 0.5 && syExact >= -0.5 && syExact < fh - 0.5) {
                const ix0 = Math.max(0, Math.min(fw - 1, Math.floor(sxExact)));
                const iy0 = Math.max(0, Math.min(fh - 1, Math.floor(syExact)));
                const ix1 = Math.max(0, Math.min(fw - 1, ix0 + 1));
                const iy1 = Math.max(0, Math.min(fh - 1, iy0 + 1));
                const fx = Math.max(0, Math.min(1, sxExact - ix0));
                const fy = Math.max(0, Math.min(1, syExact - iy0));
                const p00 = srcPixels[iy0 * fw + ix0];
                const p10 = srcPixels[iy0 * fw + ix1];
                const p01 = srcPixels[iy1 * fw + ix0];
                const p11 = srcPixels[iy1 * fw + ix1];
                const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
                const alpha = Math.round(((p00 >>> 24) * w00) + ((p10 >>> 24) * w10) + ((p01 >>> 24) * w01) + ((p11 >>> 24) * w11));
                if (alpha !== 0) {
                  const r = Math.round(((p00 & 0xFF) * w00) + ((p10 & 0xFF) * w10) + ((p01 & 0xFF) * w01) + ((p11 & 0xFF) * w11));
                  const g = Math.round((((p00 >> 8) & 0xFF) * w00) + (((p10 >> 8) & 0xFF) * w10) + (((p01 >> 8) & 0xFF) * w01) + (((p11 >> 8) & 0xFF) * w11));
                  const b = Math.round((((p00 >> 16) & 0xFF) * w00) + (((p10 >> 16) & 0xFF) * w10) + (((p01 >> 16) & 0xFF) * w01) + (((p11 >> 16) & 0xFF) * w11));
                  tgtU32[rowOffset + ox] = ((alpha & 0xFF) << 24) | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
                }
              }
            }
          }
        }
      }
    }
    if (host.canvasActor.exports.force_composite) host.canvasActor.exports.force_composite();
    markCanvasDirty();
  }
  window.bakeFtPreview = bakeFtPreview;
  window.markCanvasDirty = markCanvasDirty;

  let penActive = false;
  host.mouseHover = { x: 0, y: 0, sx: 0, sy: 0, inside: false };

  canvasEl.addEventListener('pointerenter', e => {
    if (e.pointerType === 'touch') return;
    const { sx, sy, x, y } = clientPos(e);
    host.mouseHover = { x, y, sx, sy, inside: true };
  });

  canvasEl.addEventListener('pointerleave', () => {
    if (host.mouseHover) host.mouseHover.inside = false;
  });

  canvasEl.addEventListener('pointerdown', e => {
    _cachedCanvasRect = canvasEl.getBoundingClientRect();
    if (e.pointerType === 'touch') return; // Handled by touch events (gestures/taps)
    if (e.button === 2) return; // Right-click strictly opens context menu, never draws/erases
    if (e.pointerType === 'pen') penActive = true;
    try { canvasEl.setPointerCapture(e.pointerId); } catch (_) {}

    const { sx, sy, x, y } = clientPos(e);
    host.mouseHover = { x, y, sx, sy, inside: true };
    host.mouseState.x = sx; host.mouseState.y = sy;
    if (e.button === 1) {
      host.isPanning = true; host.panStartX = sx; host.panStartY = sy;
    } else {
      host.mouseState.buttons |= 1;
      const curMode = host.brushParams ? host.brushParams.mode : 0;

      // Float transform takes priority
      if (host.floatingTransform) {
        const handle = ftHitTest(x, y, false);
        if (handle) {
          ftDragging = true;
          ftHandle = handle;
          ftDragStart = { sx, sy, x, y };
          const ft = host.floatingTransform;
          const oc = ft.corners.map(c => ({ x: c.x, y: c.y }));
          const cx = (oc[0].x + oc[1].x + oc[2].x + oc[3].x) / 4;
          const cy = (oc[0].y + oc[1].y + oc[2].y + oc[3].y) / 4;
          ftDragOrigin = {
            corners: oc,
            cornersOrig: oc,
            cx,
            cy,
            startAngle: Math.atan2(y - cy, x - cx)
          };
          const ptr = host.canvasActor?.exports?.w_layer_get_pixels ? host.canvasActor.exports.w_layer_get_pixels(ft.layerId) : 0;
          if (ptr) {
            const lw = host.canvasActor.exports.w_layer_get_width(ft.layerId);
            const lh = host.canvasActor.exports.w_layer_get_height(ft.layerId);
            new Uint32Array(host.canvasActor.memory.buffer, ptr, lw * lh).fill(0);
            if (host.canvasActor.exports.force_composite) host.canvasActor.exports.force_composite();
          }
          host._forceNextFrame = true;
          e.preventDefault();
          return;
        }
        // Click outside float → apply transform and end interaction without creating a new selection/stroke
        host.applyFloatTransform();
        markCanvasDirty();
        syncUiFromHost();
        e.preventDefault();
        return;
      }

      if (curMode === 5 || host.actionMode === 'color_picker') {
        sampleEyedropperColor(x, y, e.clientX, e.clientY);
        e.preventDefault();
        return;
      }
      if (host.actionMode === 'vector') {
        vecStartInteraction(x, y, false, e);
        e.preventDefault();
        return;
      }
      if (curMode >= 6 && curMode <= 8 && host.actionMode !== 'select') {
        isDraggingShape = true;
        shapeStartDoc = { x, y };
        shapeCurDoc = { x, y };
        e.preventDefault();
        return;
      }
      if (host.actionMode === 'select') {
        const selTool = host.currentTool;
        if (curMode === 9 || selTool === 'select_rect' || selTool === 'select') {
          isSelecting = true;
          selStartDoc = { x, y };
          selCurDoc = { x, y };
          if (host.selectionMode === 'replace') {
            host.clearSelection();
          }
          e.preventDefault();
          return;
        }
        if (curMode === 10 || curMode === 4 || selTool === 'lasso_select') {
          isLassoSelecting = true;
          lassoSelPoints = [{ x, y }];
          if (host.selectionMode === 'replace') {
            host.clearSelection();
          }
          e.preventDefault();
          return;
        }
        if (curMode === 11 || curMode === 3 || selTool === 'magic_wand') {
          host.wandSelect(x, y, host.wandTolerance, host.wandAdjacent);
          syncUiFromHost();
          e.preventDefault();
          return;
        }
        // Brush, smudge, blend in select mode = brush stroke selection
        beginBrushSelect();
        host.isDrawingOnCanvas = true;
        host.strokePrevX = x; host.strokePrevY = y;
        host.strokeIsEraser = 0;
        const press = (e.pointerType === 'pen' && e.pressure !== undefined && e.pressure > 0) ? e.pressure : 1.0;
        host.sendStroke(x, y, x, y, 0, 0, 0xFF83A598, press, e.tiltX || 0, e.tiltY || 0);
        e.preventDefault();
        return;
      }
      if (curMode === 9) {
        isSelecting = true;
        selStartDoc = { x, y };
        selCurDoc = { x, y };
        if (host.selectionMode === 'replace') {
          host.clearSelection();
        }
        e.preventDefault();
        return;
      }
      if (curMode === 10) {
        isLassoSelecting = true;
        lassoSelPoints = [{ x, y }];
        if (host.selectionMode === 'replace') {
          host.clearSelection();
        }
        e.preventDefault();
        return;
      }
      if (curMode === 11) {
        host.wandSelect(x, y, host.wandTolerance, host.wandAdjacent);
        syncUiFromHost();
        e.preventDefault();
        return;
      }
      host.isDrawingOnCanvas = true;
      host.strokePrevX = x; host.strokePrevY = y;

      // Check for hardware stylus eraser tip: button 5, buttons & 32
      const isEraserTip = (e.pointerType === 'pen') && (e.button === 5 || ((e.buttons & 32) !== 0));
      const isEraseMode = host.actionMode === 'erase' || isEraserTip;
      host.strokeIsEraser = isEraserTip ? 1 : (isEraseMode || host.currentTool === 1 ? 1 : 0);
      const strokeCol = isEraseMode && curMode === 3 ? 0x00000000 : host.currentColor;
      if (host.brushParams && host.brushParams.mode === 4) {
        lassoPoints = [{ x, y }];
      }
      const press = (e.pointerType === 'pen' && e.pressure !== undefined && e.pressure > 0) ? e.pressure : 1.0;
      if (host.isVectorLayer && host.isVectorLayer()) {
        if (host.strokeIsEraser) {
          host.pushUndoSnapshot('erase vector');
          host.eraseVectorAtPoint(x, y, Math.max(6, (host.brushParams?.size || 10)));
          e.preventDefault();
          return;
        } else if (curMode <= 2) {
          vectorRawStrokePoints = [{ x, y, pressure: press, widthScale: 1.0, tiltX: e.tiltX || 0, tiltY: e.tiltY || 0 }];
        }
      }
      host.sendStroke(x, y, x, y, 0, host.strokeIsEraser, strokeCol, press, e.tiltX || 0, e.tiltY || 0);
    }
    e.preventDefault();
  });

  const handlePointerMove = e => {
    if (e.pointerType === 'touch') {
      if (touch && touch.drawing && !touch.tapGesture && typeof e.getCoalescedEvents === 'function') {
        const coal = e.getCoalescedEvents();
        if (coal && coal.length > 1) {
          for (let i = 0; i < coal.length; i++) {
            touch.coalescedQueue.push({ clientX: coal[i].clientX, clientY: coal[i].clientY });
          }
        }
      }
      return;
    }
    const { sx, sy, x, y } = clientPos(e);
    host.mouseHover = { x, y, sx, sy, inside: true };
    host.mouseState.x = sx; host.mouseState.y = sy;
    if (host.isPanning) {
      host.panX += sx - host.panStartX; host.panY += sy - host.panStartY;
      host.panStartX = sx; host.panStartY = sy;
    } else if (ftDragging && ftHandle && ftDragStart && ftDragOrigin) {
      updateFtCorners(sx, sy);
    } else if (vecDragging) {
      vecMoveInteraction(x, y);
    } else if (isDraggingShape) {
      shapeCurDoc = { x, y };
    } else if (isSelecting && selStartDoc) {
      selCurDoc = { x, y };
      if (host.selectionMode === 'replace') {
        host.setSelection(selStartDoc.x, selStartDoc.y, x - selStartDoc.x, y - selStartDoc.y);
      }
    } else if (isLassoSelecting) {
      lassoSelPoints.push({ x, y });
    } else if (host.brushParams && host.brushParams.mode === 5 && (host.mouseState.buttons & 3)) {
      sampleEyedropperColor(x, y, e.clientX, e.clientY);
    } else if (host.isDrawingOnCanvas && (host.mouseState.buttons & 3 || e.buttons !== 0)) {
      const coalesced = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [e];
      const curMode = host.brushParams ? host.brushParams.mode : 0;
      const isVecLayer = host.isVectorLayer && host.isVectorLayer() && host.actionMode !== 'select';
      for (const ev of coalesced) {
        const pt = clientPos(ev);
        if (isVecLayer && host.strokeIsEraser) {
          host.eraseVectorAtPoint(pt.x, pt.y, Math.max(6, (host.brushParams?.size || 10)));
          host.strokePrevX = pt.x; host.strokePrevY = pt.y;
          continue;
        }
        if (host.brushParams && host.brushParams.mode === 4) {
          lassoPoints.push({ x: pt.x, y: pt.y });
        }
        const strokeCol = host.actionMode === 'select' ? 0xFF83A598 : host.currentColor;
        const press = (ev.pointerType === 'pen' && ev.pressure !== undefined && ev.pressure > 0) ? ev.pressure : 1.0;
        if (isVecLayer && curMode <= 2) {
          vectorRawStrokePoints.push({ x: pt.x, y: pt.y, pressure: press, widthScale: 1.0, tiltX: ev.tiltX || 0, tiltY: ev.tiltY || 0 });
        }
        host.sendStroke(pt.x, pt.y, host.strokePrevX, host.strokePrevY, 1, host.strokeIsEraser, strokeCol, press, ev.tiltX || 0, ev.tiltY || 0);
        host.strokePrevX = pt.x; host.strokePrevY = pt.y;
      }
    }
    updateStatus(host, x, y);
  };

  canvasEl.addEventListener('pointermove', handlePointerMove, { passive: false });

  const handlePointerUp = e => {
    if (e.pointerType === 'touch') return;
    if (e.button === 2) return;
    if (e.pointerType === 'pen') penActive = false;
    try { canvasEl.releasePointerCapture(e.pointerId); } catch (_) {}
    if (e.button === 1) { host.isPanning = false; }
    else {
      host.mouseState.buttons &= ~1;
      if (ftDragging) {
        ftDragging = false; ftHandle = null; ftDragStart = null; ftDragOrigin = null;
        bakeFtPreview();
        return;
      }
      if (vecDragging) {
        vecEndInteraction();
        return;
      }
      if (host.brushParams && host.brushParams.mode === 5) {
        hideEyedropper();
        return;
      }
      if (isDraggingShape && shapeStartDoc && shapeCurDoc) {
        const curMode = host.brushParams ? host.brushParams.mode : 0;
        rasterizeShape(shapeStartDoc, shapeCurDoc, curMode);
        isDraggingShape = false;
        shapeStartDoc = null;
        shapeCurDoc = null;
        return;
      }
      if (isSelecting && selStartDoc) {
        const { x, y } = clientPos(e);
        const finalX = selCurDoc ? selCurDoc.x : x;
        const finalY = selCurDoc ? selCurDoc.y : y;
        host.setSelection(selStartDoc.x, selStartDoc.y, finalX - selStartDoc.x, finalY - selStartDoc.y);
        isSelecting = false;
        selStartDoc = null;
        selCurDoc = null;
        return;
      }
      if (isLassoSelecting) {
        isLassoSelecting = false;
        if (lassoSelPoints.length >= 3) {
          host.setLassoSelection(lassoSelPoints);
        }
        lassoSelPoints = [];
        return;
      }
      if (!(host.mouseState.buttons & 3) && host.isDrawingOnCanvas) {
        const isVecLayer = host.isVectorLayer && host.isVectorLayer() && host.actionMode !== 'select';
        if (isVecLayer && host.strokeIsEraser) {
          host.isDrawingOnCanvas = false;
          vectorRawStrokePoints = [];
          markCanvasDirty();
          syncUiFromHost();
        } else {
          const strokeCol = host.actionMode === 'select' ? 0xFF83A598 : host.currentColor;
          const press = (e.pointerType === 'pen' && e.pressure !== undefined && e.pressure > 0) ? e.pressure : 1.0;
          host.sendStroke(host.strokePrevX, host.strokePrevY,
                          host.strokePrevX, host.strokePrevY,
                          2, host.strokeIsEraser, strokeCol, press, e.tiltX || 0, e.tiltY || 0);
          host.isDrawingOnCanvas = false;
          lassoPoints = [];
          if (isVecLayer && vectorRawStrokePoints.length > 0) {
            host.addVectorPathFromRawPoints(vectorRawStrokePoints);
            vectorRawStrokePoints = [];
            syncUiFromHost();
          }
          if (selectScratchLayerId >= 0) {
            endBrushSelect();
          }
          markCanvasDirty();
          if (host.rasterAnimator && !host.rasterAnimator.isPlaying) {
            host.rasterAnimator.saveActiveFrame();
          }
        }
      }
      if (e.pointerType !== 'touch') {
        const p = clientPos(e);
        host.mouseHover = { x: p.x, y: p.y, sx: p.sx, sy: p.sy, inside: true };
      }
    }
  };

  canvasEl.addEventListener('pointerup', handlePointerUp);
  canvasEl.addEventListener('pointercancel', handlePointerUp);

  /* ── Zoom & Pan Controls (Touchpad & Wheel — matching studio.html) ── */
  canvasEl.addEventListener('wheel', e => {
    if (e.target.closest('.monaco-menu-container')) return;
    e.preventDefault();

    const r = canvasEl.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;

    if (e.ctrlKey || e.metaKey) {
      /* Touchpad pinch-to-zoom or Ctrl+Wheel: smooth exponential scaling centered at cursor */
      const clampedDelta = Math.max(-50, Math.min(50, e.deltaY));
      const old = host.zoom;
      const newZoom = Math.max(0.05, Math.min(20.0, old * Math.pow(0.992, clampedDelta)));
      host.panX = sx - (sx - host.panX) * (newZoom / old);
      host.panY = sy - (sy - host.panY) * (newZoom / old);
      host.zoom = newZoom;
      markCanvasDirty();
      return;
    }

    if (e.altKey) {
      /* Alt+Wheel: discrete step zoom centered at cursor */
      const f = e.deltaY < 0 ? 1.12 : 0.89;
      const old = host.zoom;
      const newZoom = Math.max(0.05, Math.min(20.0, old * f));
      host.panX = sx - (sx - host.panX) * (newZoom / old);
      host.panY = sy - (sy - host.panY) * (newZoom / old);
      host.zoom = newZoom;
      markCanvasDirty();
      return;
    }

    if (e.shiftKey) {
      /* Shift+Wheel for horizontal scroll/pan */
      host.panX -= (e.deltaY || e.deltaX);
      markCanvasDirty();
      return;
    }

    /* Two-finger swipe on touchpad or mouse wheel: Pan viewport vertically and horizontally */
    host.panX -= e.deltaX;
    host.panY -= e.deltaY;
    markCanvasDirty();
  }, { passive: false });

  /* ── Touch support — 1 finger: draw / 2 finger: pan + pinch-zoom + rotate / 2-finger tap: undo / 3-finger tap: redo ── */
  const touch = {
    prevTouches: null,   /* TouchList snapshot from last event */
    drawing: false,
    pending: null,       /* Pending touch: { sx, sy, x, y } */
    timer: null,
    longPressTimer: null,
    longPressTriggered: false,
    tapGesture: null,    /* Multi-finger tap: { time, maxFingers, moved, startPositions } */
    coalescedQueue: []
  };

  function commitPendingTouch() {
    if (touch.pending && !touch.drawing) {
      const p = touch.pending;
      touch.drawing = true;
      touch.coalescedQueue.length = 0;
      host.strokePrevX = p.x; host.strokePrevY = p.y;
      const curMode = host.brushParams ? host.brushParams.mode : 0;
      if (host.actionMode === 'select') {
        beginBrushSelect();
        host.strokeIsEraser = 0;
        host.sendStroke(p.x, p.y, p.x, p.y, 0, 0, 0xFF83A598);
      } else {
        const isEraseMode = host.actionMode === 'erase';
        host.strokeIsEraser = isEraseMode || host.currentTool === 1 ? 1 : 0;
        const strokeCol = isEraseMode && curMode === 3 ? 0x00000000 : host.currentColor;
        if (host.isVectorLayer && host.isVectorLayer()) {
          if (host.strokeIsEraser) {
            host.pushUndoSnapshot('erase vector');
            host.eraseVectorAtPoint(p.x, p.y, Math.max(6, (host.brushParams?.size || 10)));
            return;
          } else if (curMode <= 2) {
            vectorRawStrokePoints = [{ x: p.x, y: p.y, pressure: estimatedFingerPressure || 0.8, widthScale: 1.0, tiltX: 0, tiltY: 0 }];
          }
        }
        if (curMode === 4) {
          lassoPoints = [{ x: p.x, y: p.y }];
        }
        host.sendStroke(p.x, p.y, p.x, p.y, 0, host.strokeIsEraser, strokeCol);
      }
    }
  }

  function clearPendingTouch() {
    if (touch.timer) {
      clearTimeout(touch.timer);
      touch.timer = null;
    }
    if (touch.longPressTimer) {
      clearTimeout(touch.longPressTimer);
      touch.longPressTimer = null;
    }
    touch.pending = null;
    touch.coalescedQueue.length = 0;
  }

  const _scratchTouch = { sx: 0, sy: 0, x: 0, y: 0 };
  function touchDocPos(t) {
    const r = _cachedCanvasRect || (_cachedCanvasRect = canvasEl.getBoundingClientRect());
    const sx = t.clientX - r.left, sy = t.clientY - r.top;
    const doc = screenToDoc(sx, sy);
    _scratchTouch.sx = sx;
    _scratchTouch.sy = sy;
    _scratchTouch.x = doc.x;
    _scratchTouch.y = doc.y;
    return _scratchTouch;
  }

  function touchMidpoint(a, b) {
    const r = _cachedCanvasRect || (_cachedCanvasRect = canvasEl.getBoundingClientRect());
    return {
      sx: (a.clientX + b.clientX) / 2 - r.left,
      sy: (a.clientY + b.clientY) / 2 - r.top
    };
  }

  /* ── Haptic feedback utility ── */
  function triggerHaptic(pattern = 10) {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch (_) {}
  }

  /* ── Finger velocity / dynamic pressure tracker ── */
  let lastTouchPoint = null;
  let lastTouchTime = 0;
  let estimatedFingerPressure = 0.5;

  canvasEl.addEventListener('touchstart', e => {
    e.preventDefault();
    _cachedCanvasRect = canvasEl.getBoundingClientRect();
    touch.coalescedQueue.length = 0;

    if (e.touches.length === 1) {
      const t = e.touches[0];
      lastTouchPoint = { x: t.clientX, y: t.clientY };
      lastTouchTime = performance.now();
    }

    if (penActive && e.touches.length === 1) {
      // Palm rejection: ignore single finger touch when stylus is touching screen
      return;
    }
    if (e.touches.length === 1 && !touch.tapGesture) {
      const t0 = e.touches[0];
      const startClientX = t0.clientX;
      const startClientY = t0.clientY;
      const { sx, sy, x, y } = touchDocPos(t0);
      host.mouseHover = { x, y, sx, sy, inside: true };
      touch.startClient = { x: startClientX, y: startClientY };
      touch.pending = { sx, sy, x, y };
      touch.longPressTriggered = false;
      if (touch.timer) clearTimeout(touch.timer);
      if (touch.longPressTimer) clearTimeout(touch.longPressTimer);

      // Arm 1-finger Long-Press (450ms stationary) to open Contextual Menu in any mode
      touch.longPressTimer = setTimeout(() => {
        touch.longPressTimer = null;
        touch.longPressTriggered = true;
        clearPendingTouch();
        if (ftDragging) {
          if (host.floatingTransform && ftDragOrigin && ftDragOrigin.corners) {
            host.floatingTransform.corners = ftDragOrigin.corners.map(c => ({ x: c.x, y: c.y }));
            bakeFtPreview();
          }
          ftDragging = false;
          ftHandle = null;
          ftDragStart = null;
          ftDragOrigin = null;
        }
        if (vecDragging) {
          if (!vecDragging.moved) {
            if ((vecDragging.type === 'penNewNode' || vecDragging.type === 'penCloseNode') && typeof host.undo === 'function') {
              vecDragging = null;
              host.undo();
            } else if (Array.isArray(host.undoStack) && host.undoStack.length > 0 && vecDragging.type !== 'marquee') {
              host.undoStack.pop();
            }
          }
          vecDragging = null;
          markCanvasDirty();
        }
        if (isTouchPicker) {
          isTouchPicker = false;
          hideEyedropper();
        }
        if (isDraggingShape) {
          isDraggingShape = false;
          shapeStartDoc = null;
          shapeCurDoc = null;
          markCanvasDirty();
        }
        if (isSelecting) {
          isSelecting = false;
          selStartDoc = null;
          selCurDoc = null;
          markCanvasDirty();
        }
        if (isLassoSelecting) {
          isLassoSelecting = false;
          lassoSelPoints = [];
          markCanvasDirty();
        }
        triggerHaptic(20);
        showPainterContextMenu({
          clientX: startClientX,
          clientY: startClientY,
          preventDefault() {},
          stopPropagation() {}
        });
      }, 450);

      if (host.floatingTransform) {
        const handle = ftHitTest(x, y, true);
        if (handle) {
          ftDragging = true;
          ftHandle = handle;
          ftDragStart = { sx, sy, x, y };
          const ft = host.floatingTransform;
          const oc = ft.corners.map(c => ({ x: c.x, y: c.y }));
          const cx = (oc[0].x + oc[1].x + oc[2].x + oc[3].x) / 4;
          const cy = (oc[0].y + oc[1].y + oc[2].y + oc[3].y) / 4;
          ftDragOrigin = {
            corners: oc,
            cx,
            cy,
            startAngle: Math.atan2(y - cy, x - cx)
          };
          const ptr = host.canvasActor?.exports?.w_layer_get_pixels ? host.canvasActor.exports.w_layer_get_pixels(ft.layerId) : 0;
          if (ptr) {
            const lw = host.canvasActor.exports.w_layer_get_width(ft.layerId);
            const lh = host.canvasActor.exports.w_layer_get_height(ft.layerId);
            new Uint32Array(host.canvasActor.memory.buffer, ptr, lw * lh).fill(0);
            if (host.canvasActor.exports.force_composite) host.canvasActor.exports.force_composite();
          }
          host._forceNextFrame = true;
          touch.pending = null;
          triggerHaptic(12);
          return;
        }
        // Tap outside float → apply transform and end interaction cleanly
        host.applyFloatTransform();
        markCanvasDirty();
        syncUiFromHost();
        touch.pending = null;
        return;
      }

      if (host.actionMode === 'vector') {
        touch.pending = null;
        vecStartInteraction(x, y, true, e);
        triggerHaptic(10);
        return;
      }

      if ((host.brushParams && host.brushParams.mode === 5) || host.actionMode === 'color_picker') {
        touch.pending = null;
        isTouchPicker = true;
        sampleEyedropperColor(x, y, startClientX, startClientY - 60);
        triggerHaptic(12);
        return;
      }

      const curMode = host.brushParams ? host.brushParams.mode : 0;
      if (curMode >= 6 && curMode <= 8 && host.actionMode !== 'select') {
        isDraggingShape = true;
        shapeStartDoc = { x, y };
        shapeCurDoc = { x, y };
        touch.pending = null;
        return;
      }
      if (host.actionMode === 'select') {
        const selTool = host.currentTool;
        if (curMode === 9 || selTool === 'select_rect' || selTool === 'select') {
          isSelecting = true;
          selStartDoc = { x, y };
          selCurDoc = { x, y };
          if (host.selectionMode === 'replace') host.clearSelection();
          touch.pending = null;
          return;
        }
        if (curMode === 10 || curMode === 4 || selTool === 'lasso_select') {
          isLassoSelecting = true;
          lassoSelPoints = [{ x, y }];
          if (host.selectionMode === 'replace') host.clearSelection();
          touch.pending = null;
          return;
        }
        if (curMode === 11 || curMode === 3 || selTool === 'magic_wand') {
          host.wandSelect(x, y, host.wandTolerance, host.wandAdjacent);
          syncUiFromHost();
          touch.pending = null;
          return;
        }
      }
      if (curMode === 9) {
        isSelecting = true;
        selStartDoc = { x, y };
        selCurDoc = { x, y };
        if (host.selectionMode === 'replace') host.clearSelection();
        touch.pending = null;
        return;
      }
      if (curMode === 10) {
        isLassoSelecting = true;
        lassoSelPoints = [{ x, y }];
        if (host.selectionMode === 'replace') host.clearSelection();
        touch.pending = null;
        return;
      }
      if (curMode === 11) {
        host.wandSelect(x, y, host.wandTolerance, host.wandAdjacent);
        syncUiFromHost();
        touch.pending = null;
        return;
      }
    } else {
      /* 2+ fingers landed: cancel pending dab and end any drawing stroke */
      if (vecDragging) {
        vecEndInteraction();
      }
      if (isTouchPicker) {
        isTouchPicker = false;
        hideEyedropper();
      }
      if (isDraggingShape) {
        isDraggingShape = false;
        shapeStartDoc = null;
        shapeCurDoc = null;
      }
      if (isSelecting) {
        isSelecting = false;
        selStartDoc = null;
        selCurDoc = null;
      }
      if (isLassoSelecting) {
        isLassoSelecting = false;
        lassoSelPoints = [];
      }
      clearPendingTouch();
      if (touch.drawing) {
        host.sendStroke(host.strokePrevX, host.strokePrevY,
                        host.strokePrevX, host.strokePrevY,
                        2, host.strokeIsEraser, host.currentColor);
        touch.drawing = false;
        lassoPoints = [];
        vectorRawStrokePoints = [];
        if (selectStrokeBackup) {
          commitBrushSelectBackup();
        }
      }
      if (e.touches.length >= 2) {
        if (!touch.tapGesture || (Date.now() - touch.tapGesture.time > 400)) {
          touch.tapGesture = {
            time: Date.now(),
            maxFingers: e.touches.length,
            moved: false,
            startPositions: new Map()
          };
        } else if (e.touches.length > touch.tapGesture.maxFingers) {
          touch.tapGesture.maxFingers = e.touches.length;
        }
        for (let i = 0; i < e.touches.length; i++) {
          const t = e.touches[i];
          if (!touch.tapGesture.startPositions.has(t.identifier)) {
            touch.tapGesture.startPositions.set(t.identifier, { x: t.clientX, y: t.clientY });
          }
        }
      }
    }
    touch.prevTouches = e.touches;
  }, { passive: false });

  canvasEl.addEventListener('touchmove', e => {
    e.preventDefault();

    if (e.touches.length === 1 && !touch.tapGesture) {
      if (touch.longPressTriggered) return;
      const t0 = e.touches[0];
      if (touch.longPressTimer && touch.startClient) {
        if (Math.hypot(t0.clientX - touch.startClient.x, t0.clientY - touch.startClient.y) > 8) {
          clearTimeout(touch.longPressTimer);
          touch.longPressTimer = null;
        }
      }
      const { sx, sy, x, y } = touchDocPos(t0);
      host.mouseHover = { x, y, sx, sy, inside: true };

      // Estimate finger dynamic pressure based on velocity & contact radius
      if (lastTouchPoint) {
        const now = performance.now();
        const dt = Math.max(1, now - lastTouchTime);
        const speed = Math.hypot(t0.clientX - lastTouchPoint.x, t0.clientY - lastTouchPoint.y) / dt;
        const force = t0.force || ((t0.radiusX || 12) / 25);
        estimatedFingerPressure = Math.max(0.1, Math.min(1.0, 0.3 + (force * 0.4) + Math.min(0.3, speed * 0.08)));
        lastTouchPoint = { x: t0.clientX, y: t0.clientY };
        lastTouchTime = now;
      }

      if (ftDragging && ftHandle && ftDragStart && ftDragOrigin) {
        updateFtCorners(sx, sy);
        return;
      }
      if (vecDragging) {
        vecMoveInteraction(x, y);
        return;
      }
      if (isTouchPicker) {
        sampleEyedropperColor(x, y, t0.clientX, t0.clientY - 60);
        return;
      }
      if (isDraggingShape) {
        shapeCurDoc = { x, y };
        return;
      }
      if (isSelecting && selStartDoc) {
        selCurDoc = { x, y };
        if (host.selectionMode === 'replace') {
          host.setSelection(selStartDoc.x, selStartDoc.y, x - selStartDoc.x, y - selStartDoc.y);
        }
        return;
      }
      if (isLassoSelecting) {
        lassoSelPoints.push({ x, y });
        return;
      }
      if (touch.pending) {
        const dist = Math.hypot(sx - touch.pending.sx, sy - touch.pending.sy);
        if (dist > 5) {
          if (touch.longPressTimer) {
            clearTimeout(touch.longPressTimer);
            touch.longPressTimer = null;
          }
          commitPendingTouch();
        }
      }
      if (touch.drawing) {
        const isVecLayer = host.isVectorLayer && host.isVectorLayer() && host.actionMode !== 'select';
        const curMode = host.brushParams ? host.brushParams.mode : 0;
        const strokeCol = host.actionMode === 'select' ? 0xFF83A598 : host.currentColor;
        const samples = touch.coalescedQueue.length > 0 ? touch.coalescedQueue : [t0];
        for (let i = 0; i < samples.length; i++) {
          const pt = (samples[i] === t0) ? { x, y } : touchDocPos(samples[i]);
          if (isVecLayer && host.strokeIsEraser) {
            host.eraseVectorAtPoint(pt.x, pt.y, Math.max(6, (host.brushParams?.size || 10)));
            host.strokePrevX = pt.x; host.strokePrevY = pt.y;
            continue;
          }
          if (host.brushParams && host.brushParams.mode === 4) {
            lassoPoints.push({ x: pt.x, y: pt.y });
          }
          if (isVecLayer && curMode <= 2) {
            vectorRawStrokePoints.push({ x: pt.x, y: pt.y, pressure: estimatedFingerPressure || 0.8, widthScale: 1.0, tiltX: 0, tiltY: 0 });
          }
          host.sendStroke(pt.x, pt.y, host.strokePrevX, host.strokePrevY,
                          1, host.strokeIsEraser, strokeCol);
          host.strokePrevX = pt.x; host.strokePrevY = pt.y;
        }
        touch.coalescedQueue.length = 0;
      }

    } else if (e.touches.length >= 2) {
      if (vecDragging) {
        vecEndInteraction();
      }
      if (isDraggingShape) {
        isDraggingShape = false;
        shapeStartDoc = null;
        shapeCurDoc = null;
      }
      if (isSelecting) {
        isSelecting = false;
        selStartDoc = null;
      }
      clearPendingTouch();
      if (touch.drawing) {
        const strokeCol = host.actionMode === 'select' ? 0xFF83A598 : host.currentColor;
        host.sendStroke(host.strokePrevX, host.strokePrevY,
                        host.strokePrevX, host.strokePrevY,
                        2, host.strokeIsEraser, strokeCol);
        touch.drawing = false;
        lassoPoints = [];
        vectorRawStrokePoints = [];
        if (selectScratchLayerId >= 0) {
          endBrushSelect();
        }
      }

      if (touch.tapGesture && !touch.tapGesture.moved) {
        for (let i = 0; i < e.touches.length; i++) {
          const t = e.touches[i];
          const sp = touch.tapGesture.startPositions.get(t.identifier);
          if (sp && Math.hypot(t.clientX - sp.x, t.clientY - sp.y) > 12) {
            touch.tapGesture.moved = true;
            break;
          }
        }
      }

      if (e.touches.length === 2 && touch.prevTouches && touch.prevTouches.length >= 2) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        let pa = null, pb = null;

        // Match previous touches by identifier to prevent 180° rotation flips and jumpy deltas
        for (let i = 0; i < touch.prevTouches.length; i++) {
          const pt = touch.prevTouches[i];
          if (pt.identifier === t0.identifier) pa = pt;
          else if (pt.identifier === t1.identifier) pb = pt;
        }

        if (pa && pb) {
          const [a, b] = [t0, t1];

          const mid  = touchMidpoint(a, b);
          const pmid = touchMidpoint(pa, pb);

          const curDist  = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          const prevDist = Math.hypot(pa.clientX - pb.clientX, pa.clientY - pb.clientY);

          // Rotation angle delta with direct 1:1 tracking
          let dTheta = 0;
          if (curDist > 15 && prevDist > 15) {
            const curAngle  = Math.atan2(b.clientY  - a.clientY,  b.clientX  - a.clientX);
            const prevAngle = Math.atan2(pb.clientY - pa.clientY, pb.clientX - pa.clientX);
            let rawDelta = curAngle - prevAngle;
            while (rawDelta > Math.PI) rawDelta -= 2 * Math.PI;
            while (rawDelta < -Math.PI) rawDelta += 2 * Math.PI;
            dTheta = rawDelta;
          }

          // Zoom scale factor
          const oldZoom = host.zoom;
          let scaleFactor = 1;
          if (prevDist > 1 && curDist > 1) {
            scaleFactor = curDist / prevDist;
          }
          const newZoom = Math.max(0.05, Math.min(20, oldZoom * scaleFactor));
          const effectiveScale = newZoom / oldZoom;
          host.zoom = newZoom;

          // Anchor pan, zoom, and rotation around touch midpoint
          const cw = (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.get_canvas_width)
            ? host.canvasActor.exports.get_canvas_width() : 640;
          const ch = (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.get_canvas_height)
            ? host.canvasActor.exports.get_canvas_height() : 480;

          let cx = host.panX + (cw * oldZoom) / 2;
          let cy = host.panY + (ch * oldZoom) / 2;

          // Midpoint translation
          cx += (mid.sx - pmid.sx);
          cy += (mid.sy - pmid.sy);

          // Rotate & scale vector from mid to center
          if (dTheta !== 0 || effectiveScale !== 1) {
            const cosT = Math.cos(dTheta);
            const sinT = Math.sin(dTheta);
            const vx = cx - mid.sx;
            const vy = cy - mid.sy;
            const nvx = (vx * cosT - vy * sinT) * effectiveScale;
            const nvy = (vx * sinT + vy * cosT) * effectiveScale;
            cx = mid.sx + nvx;
            cy = mid.sy + nvy;
          }

          host.panX = cx - (cw * host.zoom) / 2;
          host.panY = cy - (ch * host.zoom) / 2;
          host.canvasRotation += dTheta;

          // Keep rotation normalized in (-PI, PI] and snap gently near 0°
          while (host.canvasRotation > Math.PI) host.canvasRotation -= 2 * Math.PI;
          while (host.canvasRotation <= -Math.PI) host.canvasRotation += 2 * Math.PI;
          if (Math.abs(host.canvasRotation) < 0.035 && Math.abs(dTheta) < 0.012) {
            host.canvasRotation = 0;
          }
          markCanvasDirty();
        }
      }
    }

    touch.prevTouches = e.touches;
  }, { passive: false });

  canvasEl.addEventListener('touchend', e => {
    e.preventDefault();

    if (ftDragging) {
      ftDragging = false;
      ftHandle = null;
      ftDragStart = null;
      ftDragOrigin = null;
      bakeFtPreview();
      clearPendingTouch();
      touch.prevTouches = e.touches;
      return;
    }

    if (vecDragging) {
      vecEndInteraction();
      clearPendingTouch();
      touch.prevTouches = e.touches;
      return;
    }

    if (touch.longPressTimer) {
      clearTimeout(touch.longPressTimer);
      touch.longPressTimer = null;
    }
    if (isTouchPicker) {
      isTouchPicker = false;
      hideEyedropper();
      return;
    }
    if (isDraggingShape && shapeStartDoc && shapeCurDoc) {
      const curMode = host.brushParams ? host.brushParams.mode : 0;
      rasterizeShape(shapeStartDoc, shapeCurDoc, curMode);
      isDraggingShape = false;
      shapeStartDoc = null;
      shapeCurDoc = null;
      clearPendingTouch();
      touch.prevTouches = e.touches;
      return;
    }
    if (isSelecting && selStartDoc) {
      if (selCurDoc) {
        host.setSelection(selStartDoc.x, selStartDoc.y, selCurDoc.x - selStartDoc.x, selCurDoc.y - selStartDoc.y);
      }
      isSelecting = false;
      selStartDoc = null;
      selCurDoc = null;
      clearPendingTouch();
      touch.prevTouches = e.touches;
      return;
    }
    if (isLassoSelecting) {
      isLassoSelecting = false;
      if (lassoSelPoints.length >= 3) {
        host.setLassoSelection(lassoSelPoints);
      }
      lassoSelPoints = [];
      clearPendingTouch();
      touch.prevTouches = e.touches;
      return;
    }
    if (touch.pending && !touch.longPressTriggered) {
      /* Single-tap tap dab */
      commitPendingTouch();
      const isVecLayer = host.isVectorLayer && host.isVectorLayer() && host.actionMode !== 'select';
      if (isVecLayer && host.strokeIsEraser) {
        touch.drawing = false;
        vectorRawStrokePoints = [];
        syncUiFromHost();
      } else {
        const strokeCol = host.actionMode === 'select' ? 0xFF83A598 : host.currentColor;
        host.sendStroke(host.strokePrevX, host.strokePrevY,
                        host.strokePrevX, host.strokePrevY,
                        2, host.strokeIsEraser, strokeCol);
        touch.drawing = false;
        lassoPoints = [];
        if (isVecLayer && vectorRawStrokePoints.length > 0) {
          host.addVectorPathFromRawPoints(vectorRawStrokePoints);
          vectorRawStrokePoints = [];
          syncUiFromHost();
        }
        if (selectScratchLayerId >= 0) {
          endBrushSelect();
        }
      }
    } else if (e.touches.length === 0 && touch.drawing) {
      const isVecLayer = host.isVectorLayer && host.isVectorLayer() && host.actionMode !== 'select';
      if (isVecLayer && host.strokeIsEraser) {
        touch.drawing = false;
        vectorRawStrokePoints = [];
        syncUiFromHost();
      } else {
        const strokeCol = host.actionMode === 'select' ? 0xFF83A598 : host.currentColor;
        host.sendStroke(host.strokePrevX, host.strokePrevY,
                        host.strokePrevX, host.strokePrevY,
                        2, host.strokeIsEraser, strokeCol);
        touch.drawing = false;
        lassoPoints = [];
        if (isVecLayer && vectorRawStrokePoints.length > 0) {
          host.addVectorPathFromRawPoints(vectorRawStrokePoints);
          vectorRawStrokePoints = [];
          syncUiFromHost();
        }
        if (selectScratchLayerId >= 0) {
          endBrushSelect();
        }
        if (host.rasterAnimator && !host.rasterAnimator.isPlaying) {
          host.rasterAnimator.saveActiveFrame();
        }
      }
    }

    if (touch.tapGesture && host.enableTouchUndoRedo !== false) {
      if (e.touches.length === 0) {
        const elapsed = Date.now() - touch.tapGesture.time;
        if (!touch.tapGesture.moved && elapsed < 400) {
          if (touch.tapGesture.maxFingers === 3) {
            host.redo();
            triggerHaptic(15);
            log('Redo (3-finger tap)');
          } else if (touch.tapGesture.maxFingers === 2) {
            host.undo();
            triggerHaptic(15);
            log('Undo (2-finger tap)');
          }
        }
        touch.tapGesture = null;
      }
    } else {
      touch.tapGesture = null;
    }

    if (touch.prevTouches && touch.prevTouches.length >= 2 && e.touches.length < 2) {
      // Snap to upright 0° on gesture release if within alignment threshold (~2.3° / 0.04 rad)
      if (Math.abs(host.canvasRotation) < 0.04 && host.canvasRotation !== 0) {
        host.canvasRotation = 0;
        triggerHaptic(8);
        host.render();
        updateStatus(host, 0, 0, true);
      }
    }

    if (e.touches.length === 0 && host.mouseHover) {
      host.mouseHover.inside = false;
    }

    clearPendingTouch();
    touch.prevTouches = e.touches;
  }, { passive: false });

  canvasEl.addEventListener('touchcancel', () => {
    if (host.mouseHover) {
      host.mouseHover.inside = false;
    }
    if (touch.longPressTimer) {
      clearTimeout(touch.longPressTimer);
      touch.longPressTimer = null;
    }
    if (isTouchPicker) {
      isTouchPicker = false;
      hideEyedropper();
    }
    if (isDraggingShape) {
      isDraggingShape = false;
      shapeStartDoc = null;
      shapeCurDoc = null;
    }
    if (isSelecting) {
      isSelecting = false;
      selStartDoc = null;
    }
    clearPendingTouch();
    if (touch.drawing) {
      host.sendStroke(host.strokePrevX, host.strokePrevY,
                      host.strokePrevX, host.strokePrevY,
                      2, host.strokeIsEraser, host.currentColor);
      touch.drawing = false;
      lassoPoints = [];
    }
    touch.tapGesture = null;
    touch.prevTouches = null;
  });

  /* ── REPL ── */
  const history = [], hl = { i: -1 };

  function runCmd(raw) {
    raw = raw.trim();
    if (!raw) return;
    history.push(raw); hl.i = -1;
    log(`> ${raw}`, 'cmd');

    const isJS = window.esenho && (
      /^((esenho|raster|vector|anim|audio|commands)\s*[.(\[])/.test(raw) ||
      raw.startsWith('let ') ||
      raw.startsWith('const ') ||
      raw.startsWith('var ') ||
      raw.startsWith('function') ||
      raw.startsWith('console.') ||
      raw.includes('=>') ||
      (raw.includes('.') && !/^[a-z_]+\s+/i.test(raw)) ||
      raw.includes('(') ||
      raw.includes(';')
    );

    if (isJS) {
      try {
        const result = window.esenho.eval(raw);
        if (result !== undefined) {
          log(typeof result === 'object' ? JSON.stringify(result) : String(result), 'ok');
        } else {
          log('[ok]', 'ok');
        }
        markCanvasDirty();
        syncUiFromHost();
        return;
      } catch (jsErr) {
        console.warn('JS eval note:', jsErr.message);
      }
    }

    const lines = [];
    const origLog = console.log;
    console.log = (...a) => lines.push(a.map(String).join(' '));
    const origWrite = (typeof process !== 'undefined' && process.stdout) ? process.stdout.write : null;
    if (origWrite) process.stdout.write = s => lines.push(String(s));
    try {
      host.executeCommand(raw);
      markCanvasDirty();
    } catch (err) {
      log(`err: ${err.message}`, 'err');
    } finally {
      console.log = origLog;
      if (origWrite) process.stdout.write = origWrite;
      syncUiFromHost();
    }
    lines.forEach(l => {
      const parts = String(l).split('\n');
      for (const part of parts) {
        const c = part.trimEnd().replace(/\x1b\[[^m]*m/g, '');
        if (c) log(c);
      }
    });
  }

  const cmdForm = document.getElementById('inputrow');
  let lastSubmitTime = 0;

  const submitCommand = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!inputEl) return;
    const now = Date.now();
    const val = inputEl.value;
    if (now - lastSubmitTime < 60 && val === '') return;
    lastSubmitTime = now;
    inputEl.value = '';
    runCmd(val);
  };

  if (cmdForm && cmdForm.tagName === 'FORM') {
    cmdForm.addEventListener('submit', submitCommand);
  }

  if (inputEl) {
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.keyCode === 13 || e.which === 13) {
        submitCommand(e);
      } else if (e.key === 'ArrowUp') {
        hl.i = Math.min(hl.i + 1, history.length - 1);
        inputEl.value = history[history.length - 1 - hl.i] || ''; e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        hl.i = Math.max(hl.i - 1, -1);
        inputEl.value = hl.i < 0 ? '' : history[history.length - 1 - hl.i] || ''; e.preventDefault();
      }
    });

    inputEl.addEventListener('keyup', e => {
      if ((e.key === 'Enter' || e.keyCode === 13 || e.which === 13) && inputEl.value) {
        submitCommand(e);
      }
    });
  }

  const btnClearConsole = document.getElementById('ui-btn-clear-console');
  if (btnClearConsole) {
    btnClearConsole.addEventListener('click', (e) => {
      e.stopPropagation();
      if (termEl) termEl.innerHTML = '';
      triggerHaptic(10);
    });
  }

  const btnHelpConsole = document.getElementById('ui-btn-help-console');
  if (btnHelpConsole) {
    btnHelpConsole.addEventListener('click', (e) => {
      e.stopPropagation();
      runCmd('help');
      triggerHaptic(10);
    });
  }



  // 0. Action Modes (Draw, Erase, Select)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.actionmode;
      runCmd(`set action_mode ${mode}`);
    });
  });

  // 1. Tools
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      runCmd(`set mode ${tool}`);
    });
  });

  const btnCopy = document.getElementById('ui-btn-copy');
  if (btnCopy) btnCopy.addEventListener('click', () => runCmd('copy'));
  const btnCut = document.getElementById('ui-btn-cut');
  if (btnCut) btnCut.addEventListener('click', () => runCmd('cut'));
  const btnPaste = document.getElementById('ui-btn-paste');
  if (btnPaste) btnPaste.addEventListener('click', () => runCmd('paste'));
  const btnDeselect = document.getElementById('ui-btn-deselect');
  if (btnDeselect) btnDeselect.addEventListener('click', () => runCmd('deselect'));

  const btnXformApply = document.getElementById('ui-btn-transform-apply');
  if (btnXformApply) btnXformApply.addEventListener('click', () => runCmd('transform apply'));
  const btnXformCancel = document.getElementById('ui-btn-transform-cancel');
  if (btnXformCancel) btnXformCancel.addEventListener('click', () => runCmd('transform cancel'));

  const sliderWandTol = document.getElementById('ui-slider-wand-tol');
  const wandTolVal = document.getElementById('ui-wand-tol-val');
  if (sliderWandTol) {
    sliderWandTol.addEventListener('input', () => {
      const v = parseInt(sliderWandTol.value, 10);
      host.wandTolerance = v;
      if (wandTolVal) wandTolVal.textContent = v;
    });
  }

  const selModeBtns = document.querySelectorAll('.sel-mode-btn');
  selModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.getAttribute('data-selmode');
      host.setSelectionMode(mode);
      host.sendConsoleLog(`selection mode set to ${host.selectionMode}`);
    });
  });

  const chkAdjacent = document.getElementById('ui-chk-adjacent');
  if (chkAdjacent) {
    chkAdjacent.addEventListener('change', () => {
      host.wandAdjacent = chkAdjacent.checked;
      host.sendConsoleLog(`wand adjacent set to ${host.wandAdjacent ? 'on' : 'off'}`);
    });
  }

  /* ── User Scripts Manager & Runner (Pure REPL Commands) ── */
  const DEFAULT_SCRIPTS = [
    // 1. Tool Demonstrations
    {
      name: 'tool_brush_showcase',
      code: `# Tool Showcase: Inking & Dynamic Brush\nreset tool\nset mode draw\nset tool brush\nset color #fabd2f\nset size 18\nset opacity 100\nset hardness 95\nset flow 100\nset smooth 30\ndraw line 100 120 400 120 #fabd2f\nset size 8\nset color #fe8019\ndraw line 100 160 400 160 #fe8019\nset size 35\nset hardness 20\nset color #fb4934\ndraw line 100 220 400 220 #fb4934`
    },
    {
      name: 'tool_line_guide',
      code: `# Tool Showcase: Line Guide Tool\nreset tool\nset mode draw\nset tool line\nset size 4\ndraw line 100 300 500 300 #83a598\ndraw line 300 100 300 500 #83a598\ndraw line 150 150 450 450 #b8bb26\ndraw line 150 450 450 150 #b8bb26\ndraw line 100 100 500 100 #d3869b\ndraw line 500 100 500 500 #d3869b\ndraw line 500 500 100 500 #d3869b\ndraw line 100 500 100 100 #d3869b`
    },
    {
      name: 'tool_rect_guide',
      code: `# Tool Showcase: Rectangle Guide & UI Cards\nreset tool\nset mode draw\nset tool rect\ndraw rect 80 80 480 320 #282828\ndraw rect 100 100 200 120 #458588\ndraw rect 340 100 200 120 #d79921\ndraw rect 100 260 440 100 #689d6a\ndraw rect 120 280 120 60 #fabd2f\ndraw rect 260 280 120 60 #fe8019\ndraw rect 400 280 120 60 #fb4934`
    },
    {
      name: 'tool_ellipse_orbits',
      code: `# Tool Showcase: Ellipse Guide & Celestial Orbits\nreset tool\nset mode draw\nset tool ellipse\ndraw circle 320 240 180 #3c3836\ndraw ellipse 320 240 220 90 #504945\ndraw ellipse 320 240 140 60 #665c54\ndraw circle 320 240 45 #fabd2f\ndraw circle 460 210 18 #83a598\ndraw circle 200 270 24 #fe8019\ndraw circle 150 200 12 #8ec07c`
    },
    {
      name: 'tool_fill_bucket',
      code: `# Tool Showcase: Flood Fill Bucket\nreset tool\nset mode draw\nset tool rect\ndraw rect 100 100 300 200 #ebdbb2\ndraw rect 120 120 120 70 #ebdbb2\ndraw rect 260 120 120 70 #ebdbb2\ndraw rect 120 210 260 70 #ebdbb2\nset tool fill\nset color #83a598\nfill 150 150 #83a598\nset color #fe8019\nfill 300 150 #fe8019\nset color #b8bb26\nfill 200 240 #b8bb26`
    },
    {
      name: 'tool_magic_wand_select',
      code: `# Tool Showcase: Magic Wand Selection\nreset tool\nset mode draw\nset tool rect\ndraw rect 100 100 150 150 #fb4934\ndraw rect 300 100 150 150 #fb4934\ndraw rect 200 280 200 100 #83a598\nset mode select\nset tool wand\nwand tolerance 30\nselect wand 30\nfilter brightness 40\nfilter sepia 80\nselect clear`
    },
    {
      name: 'tool_lasso_cutout',
      code: `# Tool Showcase: Lasso Selection & Transform\nreset tool\nset mode draw\nset tool ellipse\ndraw circle 250 200 60 #fabd2f\ndraw circle 230 185 10 #282828\ndraw circle 270 185 10 #282828\ndraw ellipse 250 225 25 12 #fb4934\nset mode select\nset tool lasso\nselect rect 180 130 140 140\ncut\npaste 420 200\ntransform apply\nselect clear`
    },
    {
      name: 'tool_eyedropper_picker',
      code: `# Tool Showcase: Eyedropper / Color Picker\nreset tool\nset mode draw\nset tool rect\ndraw rect 80 100 60 60 #fb4934\ndraw rect 160 100 60 60 #fabd2f\ndraw rect 240 100 60 60 #b8bb26\ndraw rect 320 100 60 60 #83a598\ndraw rect 400 100 60 60 #d3869b\npick 100 120\ndraw circle 110 220 25\npick 180 120\ndraw circle 190 220 25\npick 260 120\ndraw circle 270 220 25\npick 340 120\ndraw circle 350 220 25\npick 420 120\ndraw circle 430 220 25`
    },
    {
      name: 'tool_blend_wetmedia',
      code: `# Tool Showcase: Painterly Blend & Wet Media\nreset tool\nset mode draw\nset tool brush\nset size 45\nset hardness 60\nset opacity 100\ndraw rect 100 150 80 120 #fb4934\ndraw rect 180 150 80 120 #fabd2f\ndraw rect 260 150 80 120 #83a598\nset tool blend\nset mode smudge\nset size 50\nset hardness 30\nset smudge 60\nset wetness 75\nset color_pickup 50\nset depletion 30\nstroke 120 210 320 210`
    },
    {
      name: 'tool_smudge_fire',
      code: `# Tool Showcase: Smudge Fire Flames\nreset tool\nset mode draw\nset tool rect\ndraw rect 150 300 200 40 #fb4934\ndraw rect 180 290 140 30 #fe8019\ndraw rect 210 280 80 20 #fabd2f\nset mode smudge\nset tool brush\nset size 35\nset hardness 25\nset smudge 85\nstroke 200 300 190 180\nstroke 250 290 250 150\nstroke 280 300 300 170\nstroke 230 280 220 160`
    },
    {
      name: 'tool_eraser_types',
      code: `# Tool Showcase: Eraser Modes & Textures\nreset tool\nset mode draw\ndraw rect 80 80 400 240 #83a598\nset mode erase\nset tool brush\nset size 30\nset hardness 100\ndraw line 100 120 450 120\nset hardness 0\nset opacity 60\ndraw line 100 180 450 180\nset hardness 80\nset texture paper\nset grain 60\ndraw line 100 240 450 240`
    },
    {
      name: 'tool_select_booleans',
      code: `# Tool Showcase: Boolean Selection Modes\nreset tool\nset mode draw\nset tool rect\ndraw rect 50 50 400 300 #3c3836\nset mode select\nset select_mode replace\nselect rect 100 100 200 180\nset select_mode add\nselect rect 220 160 180 140\nset select_mode sub\nselect rect 160 140 120 100\nset mode draw\nset tool fill\nfill #fabd2f\nselect clear`
    },

    // 2. Brush Engine & Dynamics
    {
      name: 'brush_dual_texture',
      code: `# Brush Engine: Dual Brush & Texture Dab\nreset tool\nset mode draw\nset tool brush\nset size 45\nset color #8ec07c\nset hardness 80\nset dual_shape chisel\nset dual_size 120\nset dual_spacing 25\nset texture grunge\nset grain 40\ndraw line 80 150 480 150\nset dual_shape square\nset color #d3869b\ndraw line 80 250 480 250`
    },
    {
      name: 'brush_dynamics_jitters',
      code: `# Brush Engine: Dynamics & Jitters (Foliage)\nreset tool\nset mode draw\nset tool brush\nset size 28\nset color #b8bb26\nset size_jitter 50\nset angle_jitter 180\nset opacity_jitter 40\nset color_jitter 35\nset spacing 20\ndraw line 100 180 450 180\nset color #83a598\nset size 40\nset size_jitter 70\ndraw line 100 260 450 260`
    },
    {
      name: 'brush_calligraphy_taper',
      code: `# Brush Engine: Calligraphy & Stroke Taper\nreset tool\nset mode draw\nset tool brush\nset size 22\nset hardness 90\nset color #ebdbb2\nset shape chisel\nset angle 45\nset roundness 35\nset taper_in 30\nset taper_out 40\nset smooth 45\ndraw line 100 150 400 150\ndraw line 120 220 420 220\ndraw line 140 290 440 290`
    },
    {
      name: 'brush_textures_gallery',
      code: `# Brush Engine: Texture & Grain Showcase\nreset tool\nset mode draw\nset tool brush\nset size 35\nset hardness 90\nset grain 65\nset color #fabd2f\nset texture paper\ndraw line 80 100 480 100\nset texture canvas\nset color #fe8019\ndraw line 80 150 480 150\nset texture noise\nset color #fb4934\ndraw line 80 200 480 200\nset texture dots\nset color #b8bb26\ndraw line 80 250 480 250\nset texture grid\nset color #83a598\ndraw line 80 300 480 300\nset texture grunge\nset color #d3869b\ndraw line 80 350 480 350\nset texture hatch\nset color #8ec07c\ndraw line 80 400 480 400`
    },
    {
      name: 'brush_dab_blend_modes',
      code: `# Brush Engine: Dab Blend Modes Showcase\nreset tool\nset mode draw\nset tool rect\ndraw rect 60 60 460 280 #504945\nset tool brush\nset size 40\nset hardness 70\nset opacity 80\nset color #fabd2f\nset dab_blend normal\ndraw line 80 100 480 100\nset dab_blend multiply\nset color #fb4934\ndraw line 80 150 480 150\nset dab_blend screen\nset color #8ec07c\ndraw line 80 200 480 200\nset dab_blend overlay\nset color #fe8019\ndraw line 80 250 480 250\nset dab_blend dodge\nset color #83a598\ndraw line 80 300 480 300`
    },
    {
      name: 'brush_symmetry_mandala',
      code: `# Brush Engine: Symmetry & Mandala Art\nreset tool\nset mode draw\nset tool brush\nset size 14\nset hardness 85\nset color #fabd2f\nset symmetry quad\ndraw circle 320 240 80\ndraw line 320 160 400 240\ndraw line 400 240 320 320\ndraw line 320 320 240 240\ndraw line 240 240 320 160\nset color #fe8019\ndraw circle 320 240 130\nset color #83a598\ndraw circle 320 240 35\nset symmetry off`
    },

    // 3. Layers & Compositing
    {
      name: 'layers_clipping_mask',
      code: `# Layers: Clipping Mask Shading Workflow\nreset tool\nclear\nset mode draw\nset tool ellipse\ndraw circle 300 220 90 #d79921\nnew layer\nlayer clip on\nlayer blend multiply\nset mode draw\nset tool rect\ndraw rect 210 220 180 90 #00000088\nnew layer\nlayer clip on\nlayer blend screen\ndraw circle 260 180 35 #ffffffaa`
    },
    {
      name: 'layers_alpha_lock',
      code: `# Layers: Alpha Lock Painting\nreset tool\nclear\nset mode draw\nset tool rect\ndraw rect 150 120 250 180 #458588\nlayer alock on\nset tool brush\nset size 45\nset hardness 30\nset color #83a598\ndraw line 150 130 400 130\nset color #076678\ndraw line 150 280 400 280\nlayer alock off`
    },
    {
      name: 'layers_multi_comp',
      code: `# Layers: Multi-Layer Compositing Hierarchy\nreset tool\nclear\ndraw rect 0 0 640 480 #1d2021\ngroup create Background\ngroup create Characters\ngroup create FX\nnew layer\ndraw rect 50 50 540 380 #282828\nnew layer\ndraw circle 320 240 120 #b16286\nlayer blend overlay\nnew layer\ndraw line 100 100 540 380 #fabd2f\nlayer blend add`
    },

    // 4. Filters & Post-Processing
    {
      name: 'filters_full_suite',
      code: `# Filters: Complete WASM Plugin Suite Test\nreset tool\nclear\ndraw rect 80 80 480 320 #458588\ndraw circle 320 240 80 #fabd2f\nfilter blur 4 2\nfilter brightness 20\nfilter contrast 25\nfilter noise 15 0\nfilter pixelate 4\nfilter sepia 50\nfilter threshold 110 0\nfilter invert 30 0\nfilter grayscale 40 0\nfilter edge 35 1\nfilter dither 15 0`
    },
    {
      name: 'filters_retro_gameboy',
      code: `# Filters: Retro 1-Bit GameBoy Look\nreset tool\nclear\ndraw rect 0 0 640 480 #8ec07c\ndraw circle 320 200 90 #1d2021\ndraw rect 220 280 200 120 #1d2021\nfilter pixelate 6\nfilter grayscale 100 0\nfilter contrast 50\nfilter dither 20 0\nadjust hsv 75 40 -10`
    },
    {
      name: 'filters_bloom_glow',
      code: `# Filters: Neon Bloom & Glow Effect\nreset tool\nclear\ndraw rect 0 0 640 480 #181818\nset tool brush\nset size 8\nset color #83a598\ndraw circle 320 220 80 #83a598\ndraw line 200 340 440 340 #83a598\nnew layer\ndraw circle 320 220 80 #83a598\ndraw line 200 340 440 340 #83a598\nfilter blur 18 3\nlayer blend screen\nfilter brightness 60`
    },

    // 5. Generative & Procedural Art (Bonus)
    {
      name: 'art_synthwave_sunset',
      code: `# Generative Art: Synthwave 80s Sunset\nreset tool\nclear\ndraw rect 0 0 640 260 #1d2021\ndraw rect 0 260 640 220 #0f1012\ndraw circle 320 260 110 #fb4934\ndraw circle 320 260 95 #fabd2f\ndraw line 0 260 640 260 #fe8019\ndraw line 320 260 50 480 #d3869b\ndraw line 320 260 150 480 #d3869b\ndraw line 320 260 250 480 #d3869b\ndraw line 320 260 320 480 #d3869b\ndraw line 320 260 390 480 #d3869b\ndraw line 320 260 490 480 #d3869b\ndraw line 320 260 590 480 #d3869b\ndraw line 0 285 640 285 #b16286\ndraw line 0 320 640 320 #b16286\ndraw line 0 370 640 370 #b16286\ndraw line 0 435 640 435 #b16286`
    },
    {
      name: 'art_pixel_rpg_hero',
      code: `# Generative Art: Retro 16-Bit RPG Sprite\nreset tool\nclear\ndraw rect 0 0 640 480 #282828\ndraw rect 280 120 80 40 #928374\ndraw rect 270 160 100 80 #d5c4a1\ndraw rect 290 180 20 20 #282828\ndraw rect 330 180 20 20 #282828\ndraw rect 260 240 120 100 #458588\ndraw rect 290 260 60 60 #fabd2f\ndraw rect 230 250 30 90 #83a598\ndraw rect 380 230 20 110 #ebdbb2\ndraw rect 370 280 40 15 #d79921\ndraw rect 270 340 40 90 #504945\ndraw rect 330 340 40 90 #504945\ndraw rect 260 420 50 30 #3c3836\ndraw rect 330 420 50 30 #3c3836`
    },
    {
      name: 'art_botanical_bonsai',
      code: `# Generative Art: Botanical Bonsai Tree\nreset tool\nclear\ndraw rect 0 0 640 480 #1d2021\nset tool rect\ndraw rect 220 400 200 40 #d65d0e\ndraw rect 200 390 240 15 #af3a03\nset tool brush\nset size 28\nset color #7c6f64\nset hardness 85\ndraw line 320 390 320 280\ndraw line 320 280 240 220\ndraw line 320 280 390 210\ndraw line 240 220 190 180\ndraw line 390 210 440 170\nset size 35\nset hardness 20\nset color #689d6a\nset size_jitter 40\nset color_jitter 25\nset angle_jitter 180\ndraw circle 180 170 45 #689d6a\ndraw circle 240 190 40 #b8bb26\ndraw circle 380 190 45 #689d6a\ndraw circle 450 160 50 #b8bb26\ndraw circle 320 210 45 #8ec07c`
    },
    {
      name: 'art_scifi_hud',
      code: `# Generative Art: Sci-Fi Tactical HUD\nreset tool\nclear\ndraw rect 0 0 640 480 #0a0e14\ndraw circle 320 240 160 #00ffff44\ndraw circle 320 240 120 #00ffff88\ndraw circle 320 240 60 #00ffffff\ndraw line 320 60 320 420 #00ffff66\ndraw line 140 240 500 240 #00ffff66\ndraw rect 80 80 120 40 #00ffff33\ndraw rect 440 80 120 40 #00ffff33\ndraw rect 80 360 140 50 #00ffff33\ndraw rect 420 360 140 50 #00ffff33\ndraw line 80 100 200 100 #00ffffff\ndraw line 440 100 560 100 #00ffffff`
    },
    {
      name: 'art_comic_panel',
      code: `# Generative Art: Comic Strip 3-Panel Layout\nreset tool\nclear\ndraw rect 0 0 640 480 #ebdbb2\ndraw rect 40 40 560 400 #282828\ndraw rect 55 55 160 370 #fbf1c7\ndraw rect 235 55 160 370 #fbf1c7\ndraw rect 415 55 160 370 #fbf1c7\ndraw circle 135 180 40 #fabd2f\ndraw circle 315 250 50 #fb4934\ndraw rect 440 120 110 180 #83a598\ndraw ellipse 140 95 35 20 #ffffff\ndraw ellipse 320 140 45 25 #ffffff\ndraw ellipse 470 95 40 22 #ffffff`
    },
    {
      name: 'art_stained_glass',
      code: `# Generative Art: Stained Glass Rosette\nreset tool\nclear\ndraw rect 0 0 640 480 #1d2021\ndraw circle 320 240 170 #282828\ndraw circle 320 240 150 #cc241d\ndraw circle 320 240 120 #d79921\ndraw circle 320 240 90 #98971a\ndraw circle 320 240 60 #458588\ndraw circle 320 240 30 #b16286\ndraw line 320 70 320 410 #282828\ndraw line 150 240 490 240 #282828\ndraw line 200 120 440 360 #282828\ndraw line 200 360 440 120 #282828\nfilter brightness 25\nfilter contrast 35`
    }
  ];

  /* ── Custom Brush Presets Manager ── */
  function getCustomBrushPresets() {
    try {
      const stored = localStorage.getItem('esenho_custom_brush_presets_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_) {}
    return {};
  }

  function saveCustomBrushPresets(obj) {
    try {
      localStorage.setItem('esenho_custom_brush_presets_v1', JSON.stringify(obj));
    } catch (_) {}
  }

  host.customBrushPresets = getCustomBrushPresets();

  function populateBrushPresetsUI() {
    const mainSel = document.getElementById('ui-select-brush-preset');
    const dockSel = document.getElementById('dock-select-brush-preset');
    const delBtn  = document.getElementById('ui-btn-del-preset');

    const CATEGORY_LABELS = {
      sketch: 'Sketch & Pencil',
      ink: 'Inking',
      paint: 'Painting',
      marker: 'Markers',
      charcoal: 'Charcoal & Pastel',
      airbrush: 'Airbrush',
      texture: 'Textured',
      blend: 'Blenders & Smudge',
      eraser: 'Erasers',
      fx: 'FX & Pixel Art'
    };

    const fillSelect = (sel) => {
      if (!sel) return;
      sel.innerHTML = '';

      const custom = host.customBrushPresets || {};
      if (Object.keys(custom).length > 0) {
        const grpCustom = document.createElement('optgroup');
        grpCustom.label = '★ Custom Presets';
        for (const [k, p] of Object.entries(custom)) {
          const opt = document.createElement('option');
          opt.value = k;
          opt.textContent = p.name || k;
          if (host.activeBrush === k) opt.selected = true;
          grpCustom.appendChild(opt);
        }
        sel.appendChild(grpCustom);
      }

      const byCat = new Map();
      for (const [k, p] of Object.entries(BRUSH_PRESETS)) {
        if (!p.name) continue;
        const cat = p.category || 'paint';
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat).push([k, p]);
      }

      for (const [cat, items] of byCat.entries()) {
        const grp = document.createElement('optgroup');
        grp.label = CATEGORY_LABELS[cat] || cat;
        for (const [k, p] of items) {
          const opt = document.createElement('option');
          opt.value = k;
          opt.textContent = p.size ? `${p.name} (${p.size}px)` : p.name;
          if (host.activeBrush === k) opt.selected = true;
          grp.appendChild(opt);
        }
        sel.appendChild(grp);
      }
    };

    fillSelect(mainSel);
    fillSelect(dockSel);

    const isCustomActive = host.customBrushPresets && host.customBrushPresets[host.activeBrush];
    if (delBtn) delBtn.style.display = isCustomActive ? 'inline-flex' : 'none';
  }

  const mainPresetSel = document.getElementById('ui-select-brush-preset');
  if (mainPresetSel) {
    mainPresetSel.addEventListener('change', () => {
      if (mainPresetSel.value) {
        host.selectBrushPreset(mainPresetSel.value);
        syncUiFromHost();
        populateBrushPresetsUI();
        triggerHaptic(10);
      }
    });
  }

  const dockPresetSel = document.getElementById('dock-select-brush-preset');
  if (dockPresetSel) {
    dockPresetSel.addEventListener('change', () => {
      if (dockPresetSel.value) {
        host.selectBrushPreset(dockPresetSel.value);
        syncUiFromHost();
        populateBrushPresetsUI();
        triggerHaptic(10);
      }
    });
  }

  const btnSavePreset = document.getElementById('ui-btn-save-preset');
  if (btnSavePreset) {
    btnSavePreset.addEventListener('click', () => {
      const name = window.prompt('Enter name for custom brush preset:');
      if (name && name.trim()) {
        const key = name.trim().toLowerCase().replace(/\s+/g, '_');
        if (!host.customBrushPresets) host.customBrushPresets = {};
        host.customBrushPresets[key] = {
          name: name.trim(),
          desc: 'Custom user brush preset',
          ...JSON.parse(JSON.stringify(host.brushParams || {})),
          texture: host.activeTexture || (host.brushParams && host.brushParams.texture) || 'none',
          eraser: host.strokeIsEraser ? 1 : 0
        };
        saveCustomBrushPresets(host.customBrushPresets);
        host.activeBrush = key;
        populateBrushPresetsUI();
        log(`Saved custom brush preset: ${name.trim()}`);
        triggerHaptic(20);
      }
    });
  }

  const btnDelPreset = document.getElementById('ui-btn-del-preset');
  if (btnDelPreset) {
    btnDelPreset.addEventListener('click', () => {
      const cur = host.activeBrush;
      if (cur && host.customBrushPresets && host.customBrushPresets[cur]) {
        if (window.confirm(`Delete custom preset "${host.customBrushPresets[cur].name || cur}"?`)) {
          delete host.customBrushPresets[cur];
          saveCustomBrushPresets(host.customBrushPresets);
          host.selectBrushPreset('pencil');
          populateBrushPresetsUI();
          syncUiFromHost();
          log(`Deleted custom preset: ${cur}`);
          triggerHaptic(20);
        }
      }
    });
  }

  function getSavedScripts() {
    try {
      const stored = localStorage.getItem('esenho_user_scripts_v3');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge user custom scripts that aren't in defaults
          const defaultNames = new Set(DEFAULT_SCRIPTS.map(s => s.name));
          const userCustom = parsed.filter(s => !defaultNames.has(s.name));
          return [...DEFAULT_SCRIPTS, ...userCustom];
        }
      }
    } catch (_) {}
    return DEFAULT_SCRIPTS.slice();
  }

  function saveScriptsList(list) {
    localStorage.setItem('esenho_user_scripts_v3', JSON.stringify(list));
  }

  function populateScriptSelect() {
    const sel = document.getElementById('ui-script-select');
    if (!sel) return;
    const curVal = sel.value;
    sel.innerHTML = '<option value="">-- Choose Script --</option>';
    const list = getSavedScripts();
    list.forEach((s, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = s.name || `script_${idx + 1}`;
      sel.appendChild(opt);
    });
    if (curVal !== '' && parseInt(curVal, 10) < list.length) sel.value = curVal;
  }

  function runScriptCode(code) {
    code = code.trim();
    if (!code) return;
    log('--- Running Script ---', 'cmd');

    if (window.esenho) {
      try {
        const result = window.esenho.eval(code);
        if (result !== undefined) {
          log(`Result: ${typeof result === 'object' ? JSON.stringify(result) : String(result)}`, 'ok');
        }
        log('Script finished [ok]', 'ok');
        markCanvasDirty();
        syncUiFromHost();
        return;
      } catch (jsErr) {
        console.warn('JS script execution note:', jsErr.message);
      }
    }

    const lines = code.split('\n');
    let ran = 0;
    let errors = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith(';')) continue;
      try {
        runCmd(line);
        ran++;
      } catch (err) {
        errors++;
        log(`line ${i + 1} err: ${err.message || err}`, 'err');
      }
    }
    if (errors === 0) {
      log(`Script finished: ${ran} commands run [ok]`, 'ok');
    } else {
      log(`Script finished with ${errors} errors (${ran} executed)`, 'err');
    }
    syncUiFromHost();
  }

  const scriptSel = document.getElementById('ui-script-select');
  const scriptNameInp = document.getElementById('ui-script-name');
  const scriptEditor = document.getElementById('ui-script-editor');
  const btnRunScript = document.getElementById('ui-btn-run-script');
  const btnSaveScript = document.getElementById('ui-btn-save-script');
  const btnNewScript = document.getElementById('ui-btn-new-script');
  const btnDelScript = document.getElementById('ui-btn-del-script');
  const btnClearScript = document.getElementById('ui-btn-clear-script-editor');

  if (scriptSel) {
    scriptSel.addEventListener('change', () => {
      const idx = parseInt(scriptSel.value, 10);
      if (isNaN(idx)) return;
      const list = getSavedScripts();
      const s = list[idx];
      if (s) {
        if (scriptNameInp) scriptNameInp.value = s.name || '';
        if (scriptEditor) scriptEditor.value = s.code || '';
      }
    });
  }

  if (btnNewScript) {
    btnNewScript.addEventListener('click', () => {
      if (scriptSel) scriptSel.value = '';
      if (scriptNameInp) scriptNameInp.value = 'untitled.js';
      if (scriptEditor) {
        scriptEditor.value = `// Esenho JavaScript Script\nraster.brush.size = 25;\nraster.brush.color = 0xfffabd2f;\nraster.brush.hardness = 100;\n`;
        scriptEditor.focus();
      }
    });
  }

  if (btnSaveScript) {
    btnSaveScript.addEventListener('click', () => {
      const name = (scriptNameInp ? scriptNameInp.value.trim() : '') || 'script';
      const code = scriptEditor ? scriptEditor.value : '';
      const list = getSavedScripts();
      const existingIdx = list.findIndex(s => s.name === name);
      if (existingIdx >= 0) {
        list[existingIdx].code = code;
      } else {
        list.push({ name, code });
      }
      saveScriptsList(list);
      populateScriptSelect();
      log(`Script '${name}' saved [ok]`, 'ok');
    });
  }

  if (btnDelScript) {
    btnDelScript.addEventListener('click', () => {
      const name = scriptNameInp ? scriptNameInp.value.trim() : '';
      if (!name) return;
      if (confirm(`Delete script '${name}'?`)) {
        let list = getSavedScripts().filter(s => s.name !== name);
        if (list.length === 0) list = DEFAULT_SCRIPTS.slice();
        saveScriptsList(list);
        populateScriptSelect();
        if (scriptNameInp) scriptNameInp.value = '';
        if (scriptEditor) scriptEditor.value = '';
        log(`Script '${name}' deleted [ok]`, 'ok');
      }
    });
  }

  if (btnRunScript) {
    btnRunScript.addEventListener('click', () => {
      if (scriptEditor) runScriptCode(scriptEditor.value);
    });
  }

  if (btnClearScript) {
    btnClearScript.addEventListener('click', () => {
      if (scriptEditor) scriptEditor.value = '';
    });
  }

  // 2. Wire All Sliders
  function bindSlider(id, badgeId, cmdPrefix, suffix = '') {
    const el = document.getElementById(id);
    const badge = document.getElementById(badgeId);
    if (!el) return;
    el._currentVal = String(el.value);
    el.addEventListener('input', () => {
      if (badge) badge.textContent = el.value + suffix;
      const num = parseFloat(el.value);
      if (!isNaN(num)) {
        const pKey = cmdPrefix.replace(/^(brush|set)\s+/, '').trim();
        host.setBrushParam(pKey, num);
      }
    });
    el.addEventListener('change', () => {
      el._currentVal = String(el.value);
      runCmd(`${cmdPrefix} ${el.value}`);
    });
  }

  bindSlider('ui-slider-size', 'ui-val-size', 'brush size');
  bindSlider('ui-slider-opacity', 'ui-val-opacity', 'brush opacity', '%');
  bindSlider('ui-slider-hardness', 'ui-val-hardness', 'brush hardness', '%');
  bindSlider('ui-slider-flow', 'ui-val-flow', 'brush flow', '%');
  bindSlider('ui-slider-spacing', 'ui-val-spacing', 'set spacing', '%');
  bindSlider('ui-slider-smoothing', 'ui-val-smoothing', 'brush stabilize', '%');
  const stabModeSelect = document.getElementById('ui-select-stabilizer-mode');
  if (stabModeSelect) {
    stabModeSelect.addEventListener('change', () => {
      host.brushParams.stabilizer_mode = stabModeSelect.value;
      log(`Stabilizer mode: ${stabModeSelect.value === 'pulled' ? 'Pulled String (Lazy Nezumi)' : 'EMA Smoothing'}`);
    });
  }
  bindSlider('ui-slider-midpoint', 'ui-val-midpoint', 'set midpoint', '%');
  bindSlider('ui-slider-angle', 'ui-val-angle', 'set angle', '°');
  bindSlider('ui-slider-roundness', 'ui-val-roundness', 'set roundness', '%');
  bindSlider('ui-slider-scatter', 'ui-val-scatter', 'set scatter', '%');
  bindSlider('ui-slider-grain', 'ui-val-grain', 'set grain', '%');
  bindSlider('ui-slider-smudge', 'ui-val-smudge', 'set smudge', '%');
  bindSlider('ui-slider-wetness', 'ui-val-wetness', 'set wetness', '%');
  bindSlider('ui-slider-tolerance', 'ui-val-tolerance', 'set tolerance');
  bindSlider('ui-slider-tex-scale', 'ui-val-tex-scale', 'set texture_scale', '%');
  bindSlider('ui-slider-tex-rotate', 'ui-val-tex-rotate', 'set texture_rotate', '°');
  bindSlider('ui-slider-tex-contrast', 'ui-val-tex-contrast', 'set texture_contrast', '%');
  bindSlider('ui-slider-velocity', 'ui-val-velocity', 'set velocity', '%');
  bindSlider('ui-slider-taper-in', 'ui-val-taper-in', 'set taper_in', 'px');
  bindSlider('ui-slider-fade', 'ui-val-fade', 'set fade', 'px');
  bindSlider('ui-slider-size-jitter', 'ui-val-size-jitter', 'set size_jitter', '%');
  bindSlider('ui-slider-angle-jitter', 'ui-val-angle-jitter', 'set angle_jitter', '°');
  bindSlider('ui-slider-opacity-jitter', 'ui-val-opacity-jitter', 'set opacity_jitter', '%');
  bindSlider('ui-slider-color-jitter', 'ui-val-color-jitter', 'set color_jitter', '%');
  bindSlider('ui-slider-depletion', 'ui-val-depletion', 'set depletion', '%');
  bindSlider('ui-slider-color-pickup', 'ui-val-color-pickup', 'set color_pickup', '%');
  bindSlider('ui-slider-dual-size', 'ui-val-dual-size', 'set dual_size', '%');
  bindSlider('ui-slider-dual-spacing', 'ui-val-dual-spacing', 'set dual_spacing', '%');
  bindSlider('ui-slider-pressure-min', 'ui-val-pressure-min', 'set pressure_min', '%');
  const pressCurveSelect = document.getElementById('ui-select-pressure-curve');
  if (pressCurveSelect) {
    pressCurveSelect.addEventListener('change', () => {
      host.brushParams.pressure_curve = pressCurveSelect.value;
      log(`Pressure curve set to: ${pressCurveSelect.value}`);
    });
  }

  // Mobile slider scroll protection: prevent accidental slider movement when scrolling vertically
  function initSliderTouchScrollProtection() {
    let activeSlider = null;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let origVal = null;
    let state = 'idle'; // 'idle' | 'pending' | 'scrolling' | 'sliding'
    let hasCaptured = false;

    function calcSliderValue(slider, clientX) {
      const rect = slider.getBoundingClientRect();
      if (!rect.width) return origVal;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const min = parseFloat(slider.min) || 0;
      const max = parseFloat(slider.max) !== undefined && !isNaN(parseFloat(slider.max)) ? parseFloat(slider.max) : 100;
      const step = parseFloat(slider.step) || 1;
      let val = min + ratio * (max - min);
      val = Math.round((val - min) / step) * step + min;
      if (val < min) val = min;
      if (val > max) val = max;
      if (step < 1) {
        const decimals = (String(step).split('.')[1] || '').length;
        val = parseFloat(val.toFixed(decimals));
      }
      return val;
    }

    // 1. Intercept pointerdown in CAPTURE phase before browser default action jumps the thumb
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const slider = e.target.closest('input[type="range"]');
      if (!slider) return;

      activeSlider = slider;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      origVal = slider._currentVal !== undefined ? slider._currentVal : String(slider.value);
      state = 'pending';
      hasCaptured = false;
    }, true);

    // 2. Intercept native 'input' events in CAPTURE phase
    document.addEventListener('input', (e) => {
      if (!activeSlider || e.target !== activeSlider) return;
      if (state === 'pending' || state === 'scrolling') {
        if (origVal !== null) {
          activeSlider.value = origVal;
        }
        e.stopImmediatePropagation();
        e.preventDefault();
        return false;
      }
    }, true);

    // 3. Track movement on pointermove
    document.addEventListener('pointermove', (e) => {
      if (!activeSlider || e.pointerId !== pointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (state === 'pending') {
        if (absDy > 5 && absDy >= absDx) {
          state = 'scrolling';
          if (origVal !== null) activeSlider.value = origVal;
        } else if (absDx > 7 && absDx > absDy) {
          state = 'sliding';
          if (!hasCaptured) {
            try {
              activeSlider.setPointerCapture(pointerId);
              hasCaptured = true;
            } catch (_) {}
          }
        }
      }

      if (state === 'scrolling') {
        if (origVal !== null && activeSlider.value !== origVal) {
          activeSlider.value = origVal;
        }
      } else if (state === 'sliding') {
        const newVal = calcSliderValue(activeSlider, e.clientX);
        if (activeSlider.value !== String(newVal)) {
          activeSlider.value = newVal;
          activeSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }, { passive: true });

    // 4. Intercept 'change' event in CAPTURE phase
    document.addEventListener('change', (e) => {
      if (!activeSlider || e.target !== activeSlider) return;
      if (state === 'scrolling') {
        if (origVal !== null) activeSlider.value = origVal;
        e.stopImmediatePropagation();
        e.preventDefault();
        return false;
      }
    }, true);

    // 5. Handle release on pointerup
    const handlePointerEnd = (e) => {
      if (!activeSlider || (pointerId !== null && e.pointerId !== pointerId)) return;

      const slider = activeSlider;
      const curState = state;
      const savedOrigVal = origVal;
      const finalX = e.clientX;
      const finalY = e.clientY;

      if (hasCaptured) {
        try {
          slider.releasePointerCapture(pointerId);
        } catch (_) {}
      }

      if (curState === 'scrolling') {
        if (savedOrigVal !== null) {
          slider.value = savedOrigVal;
          slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (curState === 'sliding') {
        slider._currentVal = String(slider.value);
        let changeFired = false;
        const onNativeChange = () => { changeFired = true; };
        slider.addEventListener('change', onNativeChange, { once: true });
        setTimeout(() => {
          slider.removeEventListener('change', onNativeChange);
          if (!changeFired) {
            slider.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, 10);
      } else if (curState === 'pending') {
        const absDx = Math.abs(finalX - startX);
        const absDy = Math.abs(finalY - startY);
        if (absDx < 6 && absDy < 6) {
          const tapVal = calcSliderValue(slider, finalX);
          slider.value = tapVal;
          slider._currentVal = String(tapVal);
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          slider.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          if (savedOrigVal !== null) {
            slider.value = savedOrigVal;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }

      activeSlider = null;
      pointerId = null;
      origVal = null;
      state = 'idle';
      hasCaptured = false;
    };

    document.addEventListener('pointerup', handlePointerEnd, true);
    document.addEventListener('pointercancel', handlePointerEnd, true);
  }
  initSliderTouchScrollProtection();

  // Touch tooltips removed per request

  const dabBlendSel = document.getElementById('ui-select-dab-blend');
  if (dabBlendSel) {
    dabBlendSel.addEventListener('change', () => {
      runCmd(`set dab_blend ${dabBlendSel.value}`);
    });
  }

  const symmetrySel = document.getElementById('ui-select-symmetry');
  if (symmetrySel) {
    symmetrySel.addEventListener('change', () => {
      runCmd(`set symmetry ${symmetrySel.value}`);
    });
  }

  const chkAutoRotate = document.getElementById('ui-chk-auto-rotate');
  if (chkAutoRotate) {
    chkAutoRotate.addEventListener('change', () => {
      runCmd(`set auto_rotate ${chkAutoRotate.checked ? 1 : 0}`);
    });
  }

  const chkPressureSize = document.getElementById('ui-chk-pressure-size');
  if (chkPressureSize) {
    chkPressureSize.addEventListener('change', () => {
      runCmd(`set pressure_size ${chkPressureSize.checked ? 1 : 0}`);
    });
  }

  const chkPressureFlow = document.getElementById('ui-chk-pressure-flow');
  if (chkPressureFlow) {
    chkPressureFlow.addEventListener('change', () => {
      runCmd(`set pressure_flow ${chkPressureFlow.checked ? 1 : 0}`);
    });
  }

  const chkTiltAngle = document.getElementById('ui-chk-tilt-angle');
  if (chkTiltAngle) {
    chkTiltAngle.addEventListener('change', () => {
      runCmd(`set tilt_angle ${chkTiltAngle.checked ? 1 : 0}`);
    });
  }

  // Undo / Redo buttons
  const handleUndo = () => host.undo();
  const handleRedo = () => host.redo();

  const btnUndo = document.getElementById('ui-btn-undo');
  if (btnUndo) btnUndo.addEventListener('click', handleUndo);
  const btnRedo = document.getElementById('ui-btn-redo');
  if (btnRedo) btnRedo.addEventListener('click', handleRedo);

  const dockUndo = document.getElementById('tab-dock-undo');
  if (dockUndo) dockUndo.addEventListener('click', handleUndo);
  const dockRedo = document.getElementById('tab-dock-redo');
  if (dockRedo) dockRedo.addEventListener('click', handleRedo);

  /* ── Color Studio Modal & Multi-Model Color Picker ── */
  const touchToolbar = document.getElementById('touch-toolbar');
  const touchColorModal = document.getElementById('touch-color-modal');
  const btnCloseTouchColor = document.getElementById('btn-close-touch-color');
  const touchColorPrevChip = document.getElementById('touch-color-prev-chip');
  const touchColorCurrChip = document.getElementById('touch-color-curr-chip');

  // Mode Tabs
  const touchColorTabBtns = document.querySelectorAll('#touch-color-modal .touch-color-tab-btn');
  const touchColorPanels = {
    wheel: document.getElementById('touch-panel-wheel'),
    box: document.getElementById('touch-panel-box'),
    sliders: document.getElementById('touch-panel-sliders'),
    palettes: document.getElementById('touch-panel-palettes')
  };

  // Tab 1: Wheel elements
  const touchColorCanvas = document.getElementById('touch-color-canvas');
  const touchWheelValSlider = document.getElementById('touch-wheel-val-slider');
  const touchValReadout = document.getElementById('touch-val-readout');

  // Tab 2: SV Box elements
  const touchSvboxCanvas = document.getElementById('touch-svbox-canvas');
  const touchSvboxCursor = document.getElementById('touch-svbox-cursor');
  const touchBoxHueSlider = document.getElementById('touch-box-hue-slider');
  const touchBoxHueReadout = document.getElementById('touch-box-hue-readout');

  // Tab 3: Sliders elements
  const touchSliderR = document.getElementById('touch-slider-r');
  const touchSliderG = document.getElementById('touch-slider-g');
  const touchSliderB = document.getElementById('touch-slider-b');
  const touchNumR = document.getElementById('touch-num-r');
  const touchNumG = document.getElementById('touch-num-g');
  const touchNumB = document.getElementById('touch-num-b');
  const touchSliderH = document.getElementById('touch-slider-h');
  const touchSliderS = document.getElementById('touch-slider-s');
  const touchSliderV = document.getElementById('touch-slider-v');
  const touchValH = document.getElementById('touch-val-h');
  const touchValS = document.getElementById('touch-val-s');
  const touchValV = document.getElementById('touch-val-v');

  // Tab 4: Palettes & Swatches elements
  const touchPaletteSelect = document.getElementById('touch-palette-select');
  const touchModalSwatches = document.getElementById('touch-modal-swatches');

  // Persistent Hex & Actions
  const touchColorHexInput = document.getElementById('touch-color-hex-input');
  const btnTouchCopyHex = document.getElementById('btn-touch-copy-hex');
  const btnTouchAddSwatch = document.getElementById('btn-touch-add-swatch');
  const btnTouchDelSwatch = document.getElementById('btn-touch-del-swatch');
  const touchQuickSwatchesRow = document.getElementById('touch-quick-swatches-row');

  // Studio State
  let studioPrevHex = '#EBDBB2';
  let studioHue = 43;
  let studioSat = 0.6;
  let studioVal = 0.92;
  let studioActiveMode = 'wheel';
  let studioDelMode = false;

  const PALETTE_PRESETS = {
    gruvbox: [
      '#282828', '#3c3836', '#504945', '#7c6f64', '#928374', '#a89984',
      '#ebdbb2', '#fbf1c7', '#fb4934', '#fe8019', '#fabd2f', '#b8bb26',
      '#8ec07c', '#83a598', '#d3869b', '#b16286', '#458588', '#d65d0e'
    ],
    vibrant: [
      '#ff0055', '#ff5500', '#ffcc00', '#00ee77', '#00ccff', '#7700ff',
      '#ff00aa', '#ffffff', '#888888', '#000000', '#00ffff', '#ffff00'
    ],
    pastels: [
      '#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff', '#e8c5ff',
      '#ffd1dc', '#d4f0f0', '#ffe4e1', '#f0fff0', '#f5f5dc', '#faf0e6'
    ],
    shades: [
      '#000000', '#1c1c1c', '#383838', '#545454', '#707070', '#8c8c8c',
      '#a8a8a8', '#c4c4c4', '#e0e0e0', '#f0f0f0', '#f8f8f8', '#ffffff'
    ],
    cyberpunk: [
      '#05d9e8', '#005670', '#01012b', '#d1f7ff', '#ff2a6d', '#010a43',
      '#ffc2c2', '#ffe600', '#7122fa', '#f50057', '#00e5ff', '#18ffff'
    ],
    retro_gameboy: [
      '#0f380f', '#306230', '#8bac0f', '#9bbc0f'
    ]
  };

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [Math.round(h * 360) % 360, s, v];
  }

  function hsvToRgb(h, s, v) {
    h = (h % 360 + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    v = Math.max(0, Math.min(1, v));
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r1 = 0, g1 = 0, b1 = 0;
    if (h < 60) { r1 = c; g1 = x; }
    else if (h < 120) { r1 = x; g1 = c; }
    else if (h < 180) { g1 = c; b1 = x; }
    else if (h < 240) { g1 = x; b1 = c; }
    else if (h < 300) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    return [
      Math.max(0, Math.min(255, Math.round((r1 + m) * 255))),
      Math.max(0, Math.min(255, Math.round((g1 + m) * 255))),
      Math.max(0, Math.min(255, Math.round((b1 + m) * 255)))
    ];
  }

  function drawTouchHsvWheel() {
    if (!touchColorCanvas) return;
    const ctx = touchColorCanvas.getContext('2d');
    const w = touchColorCanvas.width, h = touchColorCanvas.height;
    const cx = w / 2, cy = h / 2, r = Math.min(cx, cy) - 4;
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const dx = px - cx, dy = py - cy;
        const dist = Math.hypot(dx, dy);
        const idx = (py * w + px) * 4;
        if (dist <= r) {
          const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
          const sat = Math.min(1.0, dist / r);
          const [red, green, blue] = hsvToRgb(angle, sat, studioVal);
          data[idx]     = red;
          data[idx + 1] = green;
          data[idx + 2] = blue;
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function drawTouchSvBox() {
    if (!touchSvboxCanvas) return;
    const ctx = touchSvboxCanvas.getContext('2d');
    const w = touchSvboxCanvas.width, h = touchSvboxCanvas.height;

    const [r0, g0, b0] = hsvToRgb(studioHue, 1.0, 1.0);
    ctx.fillStyle = `rgb(${r0}, ${g0}, ${b0})`;
    ctx.fillRect(0, 0, w, h);

    const gradWhite = ctx.createLinearGradient(0, 0, w, 0);
    gradWhite.addColorStop(0, 'rgba(255,255,255,1)');
    gradWhite.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradWhite;
    ctx.fillRect(0, 0, w, h);

    const gradBlack = ctx.createLinearGradient(0, 0, 0, h);
    gradBlack.addColorStop(0, 'rgba(0,0,0,0)');
    gradBlack.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradBlack;
    ctx.fillRect(0, 0, w, h);

    updateSvBoxCursor();
  }

  function updateSvBoxCursor() {
    if (!touchSvboxCursor || !touchSvboxCanvas) return;
    const x = Math.max(0, Math.min(100, studioSat * 100));
    const y = Math.max(0, Math.min(100, (1 - studioVal) * 100));
    touchSvboxCursor.style.left = `${x}%`;
    touchSvboxCursor.style.top = `${y}%`;
  }

  // Swatches functions & persistence
  const DEFAULT_SWATCHES = [
    '#fb4934', '#fe8019', '#fabd2f', '#b8bb26', '#8ec07c', '#83a598',
    '#d3869b', '#fbf1c7', '#ebdbb2', '#928374', '#282828', '#000000'
  ];

  let activePaletteName = localStorage.getItem('esenho_active_palette') || 'gruvbox';

  function getActivePaletteName() {
    return activePaletteName;
  }

  function getPaletteColors(name) {
    if (name === 'custom') {
      return getCustomSwatches();
    }
    return PALETTE_PRESETS[name] || PALETTE_PRESETS.gruvbox;
  }

  function getActivePaletteColors() {
    return getPaletteColors(activePaletteName);
  }

  function setActivePalette(name) {
    if (name !== 'custom' && !PALETTE_PRESETS[name]) name = 'gruvbox';
    activePaletteName = name;
    localStorage.setItem('esenho_active_palette', name);
    if (touchPaletteSelect && touchPaletteSelect.value !== name) {
      touchPaletteSelect.value = name;
    }
    broadcastSwatchesChanged();
  }

  function getCustomSwatches() {
    try {
      return JSON.parse(localStorage.getItem('esenho_custom_swatches') || '[]');
    } catch (_) { return []; }
  }

  function addCustomSwatch(color) {
    color = (color || '').trim().toUpperCase();
    if (!color.startsWith('#')) color = '#' + color;
    const swatches = getCustomSwatches();
    if (!swatches.includes(color)) {
      swatches.push(color);
      localStorage.setItem('esenho_custom_swatches', JSON.stringify(swatches));
    }
    setActivePalette('custom');
  }

  function removeCustomSwatch(index) {
    const swatches = getCustomSwatches();
    swatches.splice(index, 1);
    localStorage.setItem('esenho_custom_swatches', JSON.stringify(swatches));
    broadcastSwatchesChanged();
  }

  let swatchDeleteMode = false;

  function renderSwatches() {
    const grid = document.getElementById('ui-swatches-grid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.classList.toggle('delete-mode', swatchDeleteMode);

    const colors = getActivePaletteColors();
    const isCustom = activePaletteName === 'custom';
    const curHex = (host.currentColor !== undefined)
      ? rgbToHex(host.currentColor & 0xFF, (host.currentColor >> 8) & 0xFF, (host.currentColor >> 16) & 0xFF).toUpperCase()
      : '';

    if (colors.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1 / -1; color: #928374; font-size: 11px; font-style: italic; padding: 6px; text-align: center;">No swatches in custom palette.<br>Click "+ Swatch" to save current color.</div>';
      return;
    }

    colors.forEach((col, idx) => {
      const el = document.createElement('div');
      el.className = 'swatch-item';
      el.style.background = col;
      if (curHex && col.toUpperCase() === curHex) el.classList.add('active');
      el.title = swatchDeleteMode && isCustom
        ? `Click to delete ${col}`
        : `${col} (${activePaletteName})`;

      el.addEventListener('click', () => {
        if (swatchDeleteMode && isCustom) {
          removeCustomSwatch(idx);
          log(`Swatch ${col} removed [ok]`);
        } else {
          updateColorControlsFromHex(col);
          runCmd(`set color ${col}`);
        }
      });

      if (isCustom) {
        // Touch long-press to delete on mobile
        let longPressTimer = null;
        el.addEventListener('touchstart', () => {
          longPressTimer = setTimeout(() => {
            removeCustomSwatch(idx);
            log(`Swatch ${col} removed [ok]`);
          }, 450);
        }, { passive: true });
        el.addEventListener('touchend', () => { if (longPressTimer) clearTimeout(longPressTimer); });
        el.addEventListener('touchmove', () => { if (longPressTimer) clearTimeout(longPressTimer); });

        el.addEventListener('contextmenu', e => {
          e.preventDefault();
          removeCustomSwatch(idx);
          log(`Swatch ${col} removed [ok]`);
        });

        const del = document.createElement('span');
        del.className = 'swatch-del';
        del.textContent = '✕';
        del.title = 'Delete swatch';
        del.addEventListener('click', e => {
          e.stopPropagation();
          removeCustomSwatch(idx);
          log(`Swatch ${col} removed [ok]`);
        });
        el.appendChild(del);
      }

      grid.appendChild(el);
    });
  }

  function broadcastSwatchesChanged() {
    renderSwatches();
    renderTouchModalSwatches();
    renderTouchQuickSwatches();
    syncModularToolbars();
  }

  function renderTouchQuickSwatches() {
    if (!touchQuickSwatchesRow) return;
    touchQuickSwatchesRow.innerHTML = '';
    const currentHex = (host.currentColor !== undefined)
      ? rgbToHex(host.currentColor & 0xFF, (host.currentColor >> 8) & 0xFF, (host.currentColor >> 16) & 0xFF).toUpperCase()
      : '';

    const listToShow = getActivePaletteColors().slice(0, 16);
    listToShow.forEach(hex => {
      const slot = document.createElement('div');
      slot.className = 'touch-swatch-slot';
      slot.style.width = '24px';
      slot.style.height = '20px';
      slot.style.flexShrink = '0';
      slot.style.background = hex;
      if (currentHex && hex.toUpperCase() === currentHex) {
        slot.classList.add('active');
        slot.style.border = '2px solid var(--primary)';
      }
      slot.title = hex;
      slot.addEventListener('click', () => {
        applyColorFromStudio(hex);
        triggerHaptic(10);
      });
      touchQuickSwatchesRow.appendChild(slot);
    });
  }

  function renderTouchModalSwatches() {
    if (!touchModalSwatches) return;
    touchModalSwatches.innerHTML = '';

    const selectedPal = touchPaletteSelect ? touchPaletteSelect.value : activePaletteName;
    const colors = getPaletteColors(selectedPal);
    const isCustom = selectedPal === 'custom';

    if (colors.length === 0) {
      touchModalSwatches.innerHTML = '<div style="grid-column: 1 / -1; color: var(--text-muted); font-size: 10px; font-style: italic; padding: 8px; text-align: center;">No custom swatches saved yet.<br>Click <strong>"+ Swatch"</strong> to add current color.</div>';
      return;
    }

    const currentHex = (host.currentColor !== undefined)
      ? rgbToHex(host.currentColor & 0xFF, (host.currentColor >> 8) & 0xFF, (host.currentColor >> 16) & 0xFF).toUpperCase()
      : '';

    colors.forEach((hex, idx) => {
      const slot = document.createElement('div');
      slot.className = 'touch-swatch-slot';
      if (studioDelMode && isCustom) slot.classList.add('del-mode');
      slot.style.background = hex;
      if (currentHex && hex.toUpperCase() === currentHex) {
        slot.classList.add('active');
        slot.style.borderColor = 'var(--primary)';
      }
      slot.title = studioDelMode && isCustom ? `Click to delete ${hex}` : hex;

      slot.addEventListener('click', () => {
        if (studioDelMode && isCustom) {
          removeCustomSwatch(idx);
          triggerHaptic(15);
        } else {
          applyColorFromStudio(hex);
          triggerHaptic(12);
        }
      });

      touchModalSwatches.appendChild(slot);
    });
  }

  function applyColorFromStudio(hex, skipHostCmd = false) {
    hex = (hex || '').trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;

    hex = hex.toUpperCase();
    const [r, g, b] = hexToRgb(hex);
    const [h, s, v] = rgbToHsv(r, g, b);

    studioHue = h;
    studioSat = s;
    studioVal = v;

    if (!skipHostCmd) {
      runCmd(`color ${hex}`);
    }

    if (touchColorCurrChip) touchColorCurrChip.style.background = hex;
    if (touchColorHexInput && document.activeElement !== touchColorHexInput) {
      touchColorHexInput.value = hex;
    }

    if (touchWheelValSlider) touchWheelValSlider.value = Math.round(v * 100);
    if (touchValReadout) touchValReadout.textContent = `${Math.round(v * 100)}%`;
    if (touchBoxHueSlider) touchBoxHueSlider.value = h;
    if (touchBoxHueReadout) touchBoxHueReadout.textContent = `${h}°`;

    if (touchSliderR) touchSliderR.value = r;
    if (touchSliderG) touchSliderG.value = g;
    if (touchSliderB) touchSliderB.value = b;
    if (touchNumR) touchNumR.value = r;
    if (touchNumG) touchNumG.value = g;
    if (touchNumB) touchNumB.value = b;

    if (touchSliderH) touchSliderH.value = h;
    if (touchSliderS) touchSliderS.value = Math.round(s * 100);
    if (touchSliderV) touchSliderV.value = Math.round(v * 100);
    if (touchValH) touchValH.textContent = `${h}°`;
    if (touchValS) touchValS.textContent = `${Math.round(s * 100)}%`;
    if (touchValV) touchValV.textContent = `${Math.round(v * 100)}%`;

    if (studioActiveMode === 'wheel') drawTouchHsvWheel();
    if (studioActiveMode === 'box') drawTouchSvBox();

    updateSvBoxCursor();
    renderTouchQuickSwatches();
    if (typeof updateColorControlsFromHex === 'function') {
      updateColorControlsFromHex(hex);
    }
  }

  function switchStudioMode(mode) {
    studioActiveMode = mode;
    touchColorTabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.touchmode === mode);
    });
    Object.entries(touchColorPanels).forEach(([k, el]) => {
      if (el) el.style.display = (k === mode) ? 'flex' : 'none';
    });

    if (mode === 'wheel') drawTouchHsvWheel();
    if (mode === 'box') drawTouchSvBox();
    if (mode === 'palettes') renderTouchModalSwatches();
  }

  touchColorTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchStudioMode(btn.dataset.touchmode);
      triggerHaptic(10);
    });
  });

  if (touchPaletteSelect) {
    touchPaletteSelect.value = activePaletteName;
    touchPaletteSelect.addEventListener('change', () => {
      setActivePalette(touchPaletteSelect.value);
      triggerHaptic(10);
    });
  }

  // Wheel interaction
  if (touchColorCanvas) {
    let wheelTracking = false;
    const pickWheel = (clientX, clientY) => {
      const rect = touchColorCanvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = x - cx, dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const r = Math.min(cx, cy) - 4;
      if (dist <= r) {
        studioHue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        studioSat = Math.min(1.0, dist / r);
        const [red, green, blue] = hsvToRgb(studioHue, studioSat, studioVal);
        const hex = rgbToHex(red, green, blue);
        applyColorFromStudio(hex);
        triggerHaptic(8);
      }
    };
    touchColorCanvas.addEventListener('pointerdown', (e) => {
      wheelTracking = true;
      pickWheel(e.clientX, e.clientY);
    });
    touchColorCanvas.addEventListener('pointermove', (e) => {
      if (wheelTracking) pickWheel(e.clientX, e.clientY);
    });
    touchColorCanvas.addEventListener('pointerup', () => { wheelTracking = false; });
    touchColorCanvas.addEventListener('pointercancel', () => { wheelTracking = false; });
  }

  if (touchWheelValSlider) {
    touchWheelValSlider.addEventListener('input', () => {
      studioVal = parseInt(touchWheelValSlider.value, 10) / 100;
      if (touchValReadout) touchValReadout.textContent = `${Math.round(studioVal * 100)}%`;
      drawTouchHsvWheel();
      const [r, g, b] = hsvToRgb(studioHue, studioSat, studioVal);
      applyColorFromStudio(rgbToHex(r, g, b));
    });
  }

  // SV Box interaction
  if (touchSvboxCanvas) {
    let boxTracking = false;
    const pickBox = (clientX, clientY) => {
      const rect = touchSvboxCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      studioSat = Math.max(0, Math.min(1, x / rect.width));
      studioVal = Math.max(0, Math.min(1, 1 - (y / rect.height)));
      const [r, g, b] = hsvToRgb(studioHue, studioSat, studioVal);
      applyColorFromStudio(rgbToHex(r, g, b));
      updateSvBoxCursor();
      triggerHaptic(8);
    };
    touchSvboxCanvas.addEventListener('pointerdown', (e) => {
      boxTracking = true;
      pickBox(e.clientX, e.clientY);
    });
    touchSvboxCanvas.addEventListener('pointermove', (e) => {
      if (boxTracking) pickBox(e.clientX, e.clientY);
    });
    touchSvboxCanvas.addEventListener('pointerup', () => { boxTracking = false; });
    touchSvboxCanvas.addEventListener('pointercancel', () => { boxTracking = false; });
  }

  if (touchBoxHueSlider) {
    touchBoxHueSlider.addEventListener('input', () => {
      studioHue = parseInt(touchBoxHueSlider.value, 10);
      if (touchBoxHueReadout) touchBoxHueReadout.textContent = `${studioHue}°`;
      drawTouchSvBox();
      const [r, g, b] = hsvToRgb(studioHue, studioSat, studioVal);
      applyColorFromStudio(rgbToHex(r, g, b));
    });
  }

  // Sliders interaction
  function syncFromRgbSliders() {
    const r = parseInt(touchSliderR?.value || 0, 10);
    const g = parseInt(touchSliderG?.value || 0, 10);
    const b = parseInt(touchSliderB?.value || 0, 10);
    applyColorFromStudio(rgbToHex(r, g, b));
  }

  [touchSliderR, touchSliderG, touchSliderB].forEach(sl => {
    if (sl) sl.addEventListener('input', syncFromRgbSliders);
  });

  [touchNumR, touchNumG, touchNumB].forEach((num, idx) => {
    if (num) {
      num.addEventListener('change', () => {
        let val = Math.max(0, Math.min(255, parseInt(num.value, 10) || 0));
        num.value = val;
        if (idx === 0 && touchSliderR) touchSliderR.value = val;
        if (idx === 1 && touchSliderG) touchSliderG.value = val;
        if (idx === 2 && touchSliderB) touchSliderB.value = val;
        syncFromRgbSliders();
      });
    }
  });

  function syncFromHsvSliders() {
    const h = parseInt(touchSliderH?.value || 0, 10);
    const s = (parseInt(touchSliderS?.value || 0, 10)) / 100;
    const v = (parseInt(touchSliderV?.value || 0, 10)) / 100;
    studioHue = h; studioSat = s; studioVal = v;
    const [r, g, b] = hsvToRgb(h, s, v);
    applyColorFromStudio(rgbToHex(r, g, b));
  }

  [touchSliderH, touchSliderS, touchSliderV].forEach(sl => {
    if (sl) sl.addEventListener('input', syncFromHsvSliders);
  });

  // Direct Hex Input
  if (touchColorHexInput) {
    touchColorHexInput.addEventListener('input', () => {
      let val = touchColorHexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        applyColorFromStudio(val);
      }
    });
    touchColorHexInput.addEventListener('change', () => {
      let val = touchColorHexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        applyColorFromStudio(val);
      } else {
        if (host.currentColor !== undefined) {
          const c = host.currentColor;
          touchColorHexInput.value = rgbToHex(c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF).toUpperCase();
        }
      }
    });
  }

  if (btnTouchCopyHex) {
    btnTouchCopyHex.addEventListener('click', () => {
      const hex = touchColorHexInput ? touchColorHexInput.value : '';
      if (hex) {
        navigator.clipboard.writeText(hex).then(() => {
          log(`copied ${hex} to clipboard [ok]`);
          triggerHaptic(10);
        }).catch(() => {
          window.prompt('Color Hex:', hex);
        });
      }
    });
  }

  if (btnTouchAddSwatch) {
    btnTouchAddSwatch.addEventListener('click', () => {
      const hex = touchColorHexInput ? touchColorHexInput.value : '';
      if (hex && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
        addCustomSwatch(hex.toUpperCase());
        broadcastSwatchesChanged();
        log(`saved color ${hex} to swatches [ok]`);
        triggerHaptic(15);
      }
    });
  }

  if (btnTouchDelSwatch) {
    btnTouchDelSwatch.addEventListener('click', () => {
      studioDelMode = !studioDelMode;
      btnTouchDelSwatch.style.background = studioDelMode ? '#fb4934' : '';
      btnTouchDelSwatch.style.color = studioDelMode ? '#fff' : '#fb4934';
      btnTouchDelSwatch.style.fontWeight = studioDelMode ? 'bold' : 'normal';
      renderTouchModalSwatches();
      triggerHaptic(10);
    });
  }

  function refreshTouchColorStudio(forceMode) {
    if (!touchColorModal) return;
    if (host.currentColor !== undefined) {
      const c = host.currentColor;
      studioPrevHex = rgbToHex(c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF).toUpperCase();
    } else {
      studioPrevHex = '#EBDBB2';
    }

    if (touchColorPrevChip) touchColorPrevChip.style.background = studioPrevHex;
    applyColorFromStudio(studioPrevHex, true);
    switchStudioMode((typeof forceMode === 'string' && forceMode) ? forceMode : (studioActiveMode || 'wheel'));
    renderTouchModalSwatches();
    renderTouchQuickSwatches();
  }
  window.refreshTouchColorStudio = refreshTouchColorStudio;

  function openTouchColorModal(forceMode) {
    if (!touchColorModal) return;
    if (window.isDockviewPainter && typeof window.openPainterDockPanel === 'function') {
      window.openPainterDockPanel('color');
      refreshTouchColorStudio(forceMode);
      triggerHaptic(10);
      return;
    }
    const wasActive = touchColorModal.classList.contains('active');
    if (wasActive && typeof forceMode !== 'string') {
      touchColorModal.classList.remove('active');
      triggerHaptic(10);
      return;
    }
    closeAllSheets('left');
    touchColorModal.classList.add('active');
    refreshTouchColorStudio(forceMode);
    triggerHaptic(10);
  }

  function closeTouchColorModal() {
    if (window.isDockviewPainter && typeof window.closePainterDockPanel === 'function') {
      window.closePainterDockPanel('color');
      return;
    }
    if (touchColorModal) touchColorModal.classList.remove('active');
  }

  if (btnCloseTouchColor) btnCloseTouchColor.addEventListener('click', closeTouchColorModal);
  if (touchColorModal) {
    touchColorModal.addEventListener('click', (e) => {
      if (e.target === touchColorModal) closeTouchColorModal();
    });
  }

  // Bottom dock script selector dropdown
  const dockScriptSelect = document.getElementById('dock-script-select');
  if (dockScriptSelect) {
    function populateDockScriptDropdown() {
      dockScriptSelect.innerHTML = '<option value="" disabled selected>Script</option>';
      const scripts = getSavedScripts();
      scripts.forEach((s, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = s.name;
        dockScriptSelect.appendChild(opt);
      });
    }

    dockScriptSelect.addEventListener('focus', populateDockScriptDropdown);
    dockScriptSelect.addEventListener('pointerdown', populateDockScriptDropdown);
    dockScriptSelect.addEventListener('mousedown', populateDockScriptDropdown);
    dockScriptSelect.addEventListener('change', () => {
      const idx = parseInt(dockScriptSelect.value, 10);
      const scripts = getSavedScripts();
      if (!isNaN(idx) && scripts[idx]) {
        runScriptCode(scripts[idx].code);
        triggerHaptic(15);
      }
      dockScriptSelect.value = '';
      populateDockScriptDropdown();
    });
    populateDockScriptDropdown();
  }



  function enableDragToScroll(el) {
    if (!el || el._dragToScrollInit) return;
    el._dragToScrollInit = true;

    // Mouse wheel horizontal scroll conversion
    el.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });

    let isDown = false;
    let startX = 0;
    let scrollStart = 0;
    let moved = false;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('input[type="range"], input[type="text"], input[type="number"], select')) {
        return;
      }
      isDown = true;
      moved = false;
      startX = e.clientX;
      scrollStart = el.scrollLeft;
    });

    const onPointerMove = (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) {
        moved = true;
        el.scrollLeft = scrollStart - dx;
      }
    };

    const endDrag = () => {
      if (isDown) {
        isDown = false;
        if (moved) {
          const captureClick = (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
          };
          window.addEventListener('click', captureClick, { capture: true, once: true });
          setTimeout(() => {
            window.removeEventListener('click', captureClick, { capture: true });
          }, 80);
        }
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  ['bottom-dock-nav', 'bottom-dock-paramstrip', 'bottom-dock-quickstrip', 'bottom-dock-toolstrip', 'ui-drawer-tabs', 'touch-quick-swatches-row'].forEach(id => {
    const el = document.getElementById(id);
    if (el) enableDragToScroll(el);
  });
  document.querySelectorAll('.dock-panel').forEach(p => enableDragToScroll(p));

  function dumpCurrentToolScript(name) {
    const bp = host.brushParams || {};
    const lines = [
      `# Tool Preset: ${name}`,
      `set action_mode ${host.actionMode || 'draw'}`,
      `set mode ${host.activeToolName || 'brush'}`,
    ];
    if (host.currentColor !== undefined) {
      const c = host.currentColor;
      const hex = rgbToHex(c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF);
      lines.push(`set color ${hex}`);
    }
    if (bp.size !== undefined) lines.push(`brush size ${bp.size}`);
    if (bp.opacity !== undefined) lines.push(`brush opacity ${bp.opacity}`);
    if (bp.flow !== undefined) lines.push(`brush flow ${bp.flow}`);
    if (bp.hardness !== undefined) lines.push(`brush hardness ${bp.hardness}`);
    if (bp.spacing !== undefined) lines.push(`set spacing ${bp.spacing}`);
    if (bp.smoothing !== undefined || bp.stabilization !== undefined) lines.push(`brush stabilize ${bp.stabilization !== undefined ? bp.stabilization : bp.smoothing}`);
    if (bp.midpoint !== undefined) lines.push(`set midpoint ${bp.midpoint}`);
    if (bp.angle !== undefined) lines.push(`set angle ${bp.angle}`);
    if (bp.roundness !== undefined) lines.push(`set roundness ${bp.roundness}`);
    if (bp.scatter !== undefined) lines.push(`set scatter ${bp.scatter}`);
    if (bp.smudge !== undefined) lines.push(`set smudge ${bp.smudge}`);
    if (bp.wetness !== undefined) lines.push(`set wetness ${bp.wetness}`);
    if (bp.depletion !== undefined) lines.push(`set depletion ${bp.depletion}`);
    if (bp.color_pickup !== undefined) lines.push(`set color_pickup ${bp.color_pickup}`);
    if (bp.velocity !== undefined) lines.push(`set velocity ${bp.velocity}`);
    if (bp.taper_in !== undefined) lines.push(`set taper_in ${bp.taper_in}`);
    if (bp.fade !== undefined) lines.push(`set fade ${bp.fade}`);
    if (bp.tolerance !== undefined) lines.push(`set tolerance ${bp.tolerance}`);
    if (bp.size_jitter !== undefined) lines.push(`set size_jitter ${bp.size_jitter}`);
    if (bp.angle_jitter !== undefined) lines.push(`set angle_jitter ${bp.angle_jitter}`);
    if (bp.opacity_jitter !== undefined) lines.push(`set opacity_jitter ${bp.opacity_jitter}`);
    if (bp.color_jitter !== undefined) lines.push(`set color_jitter ${bp.color_jitter}`);
    if (bp.grain !== undefined) lines.push(`set grain ${bp.grain}`);
    if (bp.texture_scale !== undefined) lines.push(`set texture_scale ${bp.texture_scale}`);
    if (bp.texture_rotate !== undefined) lines.push(`set texture_rotate ${bp.texture_rotate}`);
    if (bp.texture_contrast !== undefined) lines.push(`set texture_contrast ${bp.texture_contrast}`);
    if (bp.dual_size !== undefined) lines.push(`set dual_size ${bp.dual_size}`);
    if (bp.dual_spacing !== undefined) lines.push(`set dual_spacing ${bp.dual_spacing}`);
    if (bp.auto_rotate !== undefined) lines.push(`set auto_rotate ${bp.auto_rotate ? 1 : 0}`);
    if (bp.subpixel !== undefined) lines.push(`set subpixel ${bp.subpixel ? 1 : 0}`);
    if (bp.pressure_size !== undefined) lines.push(`set pressure_size ${bp.pressure_size ? 1 : 0}`);
    if (bp.pressure_flow !== undefined) lines.push(`set pressure_flow ${bp.pressure_flow ? 1 : 0}`);
    if (bp.tilt_angle !== undefined) lines.push(`set tilt_angle ${bp.tilt_angle ? 1 : 0}`);
    if (bp.dab_blend !== undefined) {
      const blendNames = ['normal', 'multiply', 'screen', 'overlay', 'dodge', 'add'];
      lines.push(`set dab_blend ${blendNames[bp.dab_blend] || 'normal'}`);
    }
    if (bp.symmetry !== undefined) lines.push(`set symmetry ${bp.symmetry}`);
    if (bp.texture || host.activeTexture) lines.push(`set texture ${bp.texture || host.activeTexture}`);
    if (bp.texture_mode !== undefined) lines.push(`set texture_mode ${bp.texture_mode}`);
    return lines.join('\n');
  }

  // ── Modular User-Customizable Dock Toolbar System & Arc Dial HUD ──

  // Polar & Arc SVG math helpers for Arc Dial
  function polarToCartesian(cx, cy, r, angleInDegrees) {
    const angleInRadians = (angleInDegrees) * Math.PI / 180.0;
    return {
      x: cx + (r * Math.cos(angleInRadians)),
      y: cy + (r * Math.sin(angleInRadians))
    };
  }

  function describeArc(x, y, radius, startAngle, endAngle) {
    if (endAngle - startAngle >= 359.99) {
      endAngle = startAngle + 359.99;
    }
    const start = polarToCartesian(x, y, radius, startAngle);
    const end = polarToCartesian(x, y, radius, endAngle);
    const largeArcFlag = (endAngle - startAngle <= 180) ? "0" : "1";
    return [
      "M", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y
    ].join(" ");
  }

  // Parameter Configs for Numerical Parameters and Dials
  const TB_PARAM_CONFIGS = {
    size: { type: 'dial', name: 'Brush Size', min: 1, max: 150, step: 1, suffix: 'px', cmd: 'brush size', getter: bp => bp.size, chips: [1, 3, 6, 12, 24, 48, 80, 120] },
    opacity: { type: 'dial', name: 'Opacity', min: 1, max: 100, step: 1, suffix: '%', cmd: 'brush opacity', getter: bp => bp.opacity, chips: [10, 25, 50, 75, 100] },
    flow: { type: 'dial', name: 'Flow', min: 1, max: 100, step: 1, suffix: '%', cmd: 'brush flow', getter: bp => bp.flow, chips: [10, 25, 50, 75, 100] },
    hardness: { type: 'dial', name: 'Hardness', min: 0, max: 100, step: 1, suffix: '%', cmd: 'brush hardness', getter: bp => bp.hardness, chips: [0, 25, 50, 75, 100] },
    spacing: { type: 'dial', name: 'Spacing', min: 1, max: 200, step: 1, suffix: '%', cmd: 'set spacing', getter: bp => bp.spacing, chips: [1, 5, 10, 25, 50, 100] },
    stabilization: { type: 'dial', name: 'Stabilization', min: 0, max: 100, step: 1, suffix: '%', cmd: 'brush stabilize', getter: bp => (bp.stabilization !== undefined ? bp.stabilization : (bp.smoothing || 0)), chips: [0, 15, 30, 50, 80] },
    smoothing: { type: 'dial', name: 'Stabilization', min: 0, max: 100, step: 1, suffix: '%', cmd: 'brush stabilize', getter: bp => (bp.stabilization !== undefined ? bp.stabilization : (bp.smoothing || 0)), chips: [0, 15, 30, 50, 80] },
    midpoint: { type: 'dial', name: 'Midpoint', min: 0, max: 100, step: 1, suffix: '%', cmd: 'set midpoint', getter: bp => (bp.midpoint !== undefined ? bp.midpoint : 50), chips: [10, 25, 50, 75, 90] },
    angle: { type: 'dial', name: 'Angle', min: 0, max: 359, step: 1, suffix: '°', cmd: 'set angle', getter: bp => bp.angle || 0, chips: [0, 45, 90, 135, 180, 270] },
    roundness: { type: 'dial', name: 'Roundness', min: 1, max: 100, step: 1, suffix: '%', cmd: 'set roundness', getter: bp => bp.roundness || 100, chips: [20, 35, 50, 75, 100] },
    scatter: { type: 'dial', name: 'Scatter', min: 0, max: 200, step: 1, suffix: '%', cmd: 'set scatter', getter: bp => bp.scatter || 0, chips: [0, 10, 25, 50, 100] },
    smudge: { type: 'dial', name: 'Smudge', min: 0, max: 100, step: 1, suffix: '%', cmd: 'set smudge', getter: bp => bp.smudge || 0, chips: [0, 25, 50, 75, 100] },
    wetness: { type: 'dial', name: 'Wetness', min: 0, max: 100, step: 1, suffix: '%', cmd: 'set wetness', getter: bp => bp.wetness || 0, chips: [0, 25, 50, 75, 100] },
    depletion: { type: 'dial', name: 'Depletion', min: 0, max: 100, step: 1, suffix: '%', cmd: 'set depletion', getter: bp => bp.depletion || 0, chips: [0, 20, 40, 60, 80] },
    color_pickup: { type: 'dial', name: 'Color Pickup', min: 0, max: 100, step: 1, suffix: '%', cmd: 'set color_pickup', getter: bp => bp.color_pickup || 0, chips: [0, 25, 50, 75, 100] },
    velocity: { type: 'dial', name: 'Velocity', min: 0, max: 100, step: 1, suffix: '%', cmd: 'set velocity', getter: bp => bp.velocity || 0, chips: [0, 25, 50, 75, 100] },
    taper_in: { type: 'dial', name: 'Taper In', min: 0, max: 500, step: 5, suffix: 'px', cmd: 'set taper_in', getter: bp => bp.taper_in || 0, chips: [0, 20, 50, 100, 200] },
    taper_out: { type: 'dial', name: 'Taper Out', min: 0, max: 500, step: 5, suffix: 'px', cmd: 'set taper_out', getter: bp => bp.taper_out || 0, chips: [0, 20, 50, 100, 200] },
    string_length: { type: 'dial', name: 'Pulled String', min: 0, max: 200, step: 2, suffix: 'px', cmd: 'set string_length', getter: bp => bp.string_length || 0, chips: [0, 15, 30, 60, 100] },
    fade: { type: 'dial', name: 'Fade', min: 0, max: 2000, step: 20, suffix: 'px', cmd: 'set fade', getter: bp => bp.fade || 0, chips: [0, 100, 300, 600, 1200] },
    tolerance: { type: 'dial', name: 'Tolerance', min: 0, max: 255, step: 1, suffix: '', cmd: 'set tolerance', getter: bp => (bp.tolerance !== undefined ? bp.tolerance : 32), chips: [0, 16, 32, 64, 128] },
    size_jitter: { type: 'dial', name: 'Size Jitter', min: 0, max: 100, step: 1, suffix: '%', cmd: 'set size_jitter', getter: bp => bp.size_jitter || 0, chips: [0, 15, 30, 50, 80] },
    angle_jitter: { type: 'dial', name: 'Angle Jitter', min: 0, max: 360, step: 1, suffix: '°', cmd: 'set angle_jitter', getter: bp => bp.angle_jitter || 0, chips: [0, 45, 90, 180, 360] },
    opacity_jitter: { type: 'dial', name: 'Opacity Jitter', min: 0, max: 100, step: 1, suffix: '%', cmd: 'set opacity_jitter', getter: bp => bp.opacity_jitter || 0, chips: [0, 15, 30, 50, 80] },
    color_jitter: { type: 'dial', name: 'Color Jitter', min: 0, max: 100, step: 1, suffix: '%', cmd: 'set color_jitter', getter: bp => bp.color_jitter || 0, chips: [0, 15, 30, 50, 80] },
    grain: { type: 'dial', name: 'Grain Noise', min: 0, max: 100, step: 1, suffix: '%', cmd: 'set grain', getter: bp => bp.grain || 0, chips: [0, 20, 40, 60, 80] },
    texture_scale: { type: 'dial', name: 'Tex Scale', min: 10, max: 400, step: 5, suffix: '%', cmd: 'set texture_scale', getter: bp => bp.texture_scale || 100, chips: [50, 75, 100, 150, 200] },
    texture_rotate: { type: 'dial', name: 'Tex Rotate', min: 0, max: 359, step: 1, suffix: '°', cmd: 'set texture_rotate', getter: bp => (bp.texture_rotate !== undefined ? bp.texture_rotate : (bp.texture_angle || 0)), chips: [0, 45, 90, 180, 270] },
    texture_contrast: { type: 'dial', name: 'Tex Contrast', min: 0, max: 200, step: 5, suffix: '%', cmd: 'set texture_contrast', getter: bp => (bp.texture_contrast !== undefined ? bp.texture_contrast : 100), chips: [50, 80, 100, 120, 150] },
    dual_size: { type: 'dial', name: 'Dual Size', min: 10, max: 300, step: 5, suffix: '%', cmd: 'set dual_size', getter: bp => (bp.dual_size !== undefined ? bp.dual_size : 100), chips: [50, 75, 100, 150, 200] },
    dual_spacing: { type: 'dial', name: 'Dual Spacing', min: 1, max: 200, step: 1, suffix: '%', cmd: 'set dual_spacing', getter: bp => (bp.dual_spacing !== undefined ? bp.dual_spacing : 10), chips: [5, 10, 25, 50, 100] },

    // Switches
    auto_rotate: { type: 'switch', name: 'Auto-Rotate', cmd: 'set auto_rotate', getter: bp => !!bp.auto_rotate },
    subpixel: { type: 'switch', name: 'Subpixel', cmd: 'set subpixel', getter: bp => !!bp.subpixel },
    pressure_size: { type: 'switch', name: 'Pressure Size', cmd: 'set pressure_size', getter: bp => (bp.pressure_size !== undefined ? !!bp.pressure_size : true) },
    pressure_flow: { type: 'switch', name: 'Pressure Flow', cmd: 'set pressure_flow', getter: bp => (bp.pressure_flow !== undefined ? !!bp.pressure_flow : true) },
    tilt_angle: { type: 'switch', name: 'Tilt Angle', cmd: 'set tilt_angle', getter: bp => (bp.tilt_angle !== undefined ? !!bp.tilt_angle : true) },

    // Special Selectors
    preset: { type: 'select_preset', name: 'Brush Presets' },
    tip: { type: 'select_tip', name: 'Brush Tip Shape' },
    grain_tex: { type: 'select_grain', name: 'Grain Texture' },
    script: { type: 'select_script', name: 'Run Script' },
    dab_blend: { type: 'select_dab_blend', name: 'Dab Blend Mode' },
    symmetry: { type: 'select_symmetry', name: 'Symmetry' },
    dual_shape: { type: 'select_dual_shape', name: 'Dual Brush Mask' },
    save_tool: { type: 'save_tool', name: 'Save Brush as Script' }
  };

  // Arc Dial Modal Controller State & Event Handlers
  let curDialKey = 'size';
  let isDialTracking = false;

  const arcDialModal = document.getElementById('arc-dial-modal');
  const arcDialTitle = document.getElementById('arc-dial-title');
  const arcDialStage = document.getElementById('arc-dial-stage');
  const arcTrackBg = document.getElementById('arc-track-bg');
  const arcTrackFill = document.getElementById('arc-track-fill');
  const arcDialThumb = document.getElementById('arc-dial-thumb');
  const arcDialValText = document.getElementById('arc-dial-value-text');
  const arcDialUnitText = document.getElementById('arc-dial-unit-text');
  const arcDialPreview = document.getElementById('arc-dial-preview');
  const arcDialChips = document.getElementById('arc-dial-chips');
  const btnCloseArcDial = document.getElementById('btn-close-arc-dial');

  if (arcTrackBg) {
    arcTrackBg.setAttribute('d', describeArc(100, 100, 68, 135, 405));
  }

  function openArcDial(paramKey) {
    curDialKey = paramKey || 'size';
    const cfg = TB_PARAM_CONFIGS[curDialKey] || TB_PARAM_CONFIGS.size;
    if (arcDialTitle) arcDialTitle.textContent = cfg.name || curDialKey.toUpperCase();
    if (arcDialUnitText) arcDialUnitText.textContent = cfg.suffix || '';

    if (arcDialChips) {
      arcDialChips.innerHTML = '';
      const chips = cfg.chips || [cfg.min, Math.round(cfg.min + (cfg.max - cfg.min) * 0.25), Math.round(cfg.min + (cfg.max - cfg.min) * 0.5), Math.round(cfg.min + (cfg.max - cfg.min) * 0.75), cfg.max];
      const bp = host.brushParams || {};
      const curVal = cfg.getter ? cfg.getter(bp) : cfg.min;

      chips.forEach(cVal => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `arc-chip-btn${cVal === curVal ? ' active' : ''}`;
        btn.textContent = `${cVal}${cfg.suffix || ''}`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          setDialValue(cVal, true);
          triggerHaptic(15);
        });
        arcDialChips.appendChild(btn);
      });
    }

    updateArcDialDisplay();
    if (arcDialModal) arcDialModal.classList.add('active');
  }

  function closeArcDial() {
    if (arcDialModal) arcDialModal.classList.remove('active');
    isDialTracking = false;
  }

  if (btnCloseArcDial) {
    btnCloseArcDial.addEventListener('click', closeArcDial);
  }
  if (arcDialModal) {
    arcDialModal.addEventListener('click', (e) => {
      if (e.target === arcDialModal) closeArcDial();
    });
  }

  function setDialValue(val, runCommand = true) {
    const cfg = TB_PARAM_CONFIGS[curDialKey] || TB_PARAM_CONFIGS.size;
    val = Math.max(cfg.min, Math.min(cfg.max, val));
    if (cfg.step) {
      val = Math.round((val - cfg.min) / cfg.step) * cfg.step + cfg.min;
    }
    if (runCommand) {
      runCmd(`${cfg.cmd} ${val}`);
    }
    updateArcDialDisplay();
    syncModularToolbars();
  }

  function updateArcDialDisplay() {
    const cfg = TB_PARAM_CONFIGS[curDialKey] || TB_PARAM_CONFIGS.size;
    const bp = host.brushParams || {};
    const curVal = cfg.getter ? cfg.getter(bp) : cfg.min;
    const t = Math.max(0, Math.min(1, (curVal - cfg.min) / (cfg.max - cfg.min)));

    const curAngle = 135 + t * 270;
    if (arcTrackFill) {
      if (t > 0.001) {
        arcTrackFill.setAttribute('d', describeArc(100, 100, 68, 135, curAngle));
        arcTrackFill.style.display = 'block';
      } else {
        arcTrackFill.style.display = 'none';
      }
    }

    if (arcDialThumb) {
      const p = polarToCartesian(100, 100, 68, curAngle);
      arcDialThumb.setAttribute('cx', p.x);
      arcDialThumb.setAttribute('cy', p.y);
    }

    if (arcDialValText) arcDialValText.textContent = String(curVal);

    if (arcDialPreview) {
      arcDialPreview.innerHTML = '';
      if (curDialKey === 'size') {
        const circle = document.createElement('div');
        circle.className = 'arc-dial-preview-circle';
        const maxPreviewPx = 40;
        const pxSize = Math.max(2, Math.min(maxPreviewPx, (curVal / 150) * maxPreviewPx));
        circle.style.width = pxSize + 'px';
        circle.style.height = pxSize + 'px';
        arcDialPreview.appendChild(circle);
      } else if (curDialKey === 'opacity' || curDialKey === 'flow') {
        const swatch = document.createElement('div');
        swatch.style.width = '32px';
        swatch.style.height = '32px';
        swatch.style.background = '#fabd2f';
        swatch.style.opacity = String(curVal / 100);
        swatch.style.border = '1px solid #504945';
        arcDialPreview.appendChild(swatch);
      } else if (curDialKey === 'angle' || curDialKey === 'texture_rotate') {
        const needle = document.createElement('div');
        needle.style.width = '2px';
        needle.style.height = '34px';
        needle.style.background = '#fabd2f';
        needle.style.transform = `rotate(${curVal}deg)`;
        needle.style.transformOrigin = 'center center';
        needle.style.borderRadius = '1px';
        arcDialPreview.appendChild(needle);
      }
    }

    if (arcDialChips) {
      arcDialChips.querySelectorAll('.arc-chip-btn').forEach(btn => {
        const num = parseFloat(btn.textContent);
        btn.classList.toggle('active', num === curVal);
      });
    }
  }

  function handleDialPointer(e) {
    if (!arcDialStage) return;
    const rect = arcDialStage.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const deg = Math.atan2(dy, dx) * 180 / Math.PI;
    const normDeg = (deg - 135 + 360) % 360;

    let t = 0;
    if (normDeg <= 270) {
      t = normDeg / 270;
    } else {
      t = normDeg < 315 ? 1.0 : 0.0;
    }

    const cfg = TB_PARAM_CONFIGS[curDialKey] || TB_PARAM_CONFIGS.size;
    const val = cfg.min + t * (cfg.max - cfg.min);
    setDialValue(val, true);
  }

  if (arcDialStage) {
    arcDialStage.addEventListener('pointerdown', (e) => {
      isDialTracking = true;
      arcDialStage.setPointerCapture(e.pointerId);
      handleDialPointer(e);
      triggerHaptic(10);
    });
    arcDialStage.addEventListener('pointermove', (e) => {
      if (!isDialTracking) return;
      handleDialPointer(e);
    });
    const endTracking = (e) => {
      if (isDialTracking) {
        isDialTracking = false;
        try { arcDialStage.releasePointerCapture(e.pointerId); } catch (_) {}
        triggerHaptic(15);
      }
    };
    arcDialStage.addEventListener('pointerup', endTracking);
    arcDialStage.addEventListener('pointercancel', endTracking);
  }

  // ── Helper to build an Arc Dial widget pill ──
  function createDialWidgetElement(paramKey) {
    const cfg = TB_PARAM_CONFIGS[paramKey] || TB_PARAM_CONFIGS.size;
    const bp = host.brushParams || {};
    const curVal = cfg.getter ? cfg.getter(bp) : cfg.min;

    const dialBtn = document.createElement('button');
    dialBtn.type = 'button';
    dialBtn.className = 'tb-dial-btn';
    dialBtn.title = `Tap for Radial Dial | Drag horizontally to scrub ${cfg.name || paramKey}`;

    const t = Math.max(0, Math.min(1, (curVal - cfg.min) / (cfg.max - cfg.min)));
    const circumference = 2 * Math.PI * 4.5;
    const strokeOffset = circumference * (1 - t);

    dialBtn.innerHTML = `
      <span class="tb-dial-lbl">${cfg.name || paramKey}</span>
      <svg class="tb-dial-mini-ring" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="4.5" class="tb-dial-ring-bg" />
        <circle cx="8" cy="8" r="4.5" class="tb-dial-ring-fill" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${strokeOffset.toFixed(1)}" />
      </svg>
      <span class="tb-val">${curVal}${cfg.suffix || ''}</span>
    `;

    const miniRing = dialBtn.querySelector('.tb-dial-ring-fill');
    const valSpan = dialBtn.querySelector('.tb-val');

    dialBtn.addEventListener('click', () => {
      openArcDial(paramKey);
      triggerHaptic(15);
    });

    const syncFn = () => {
      const liveBp = host.brushParams || {};
      const liveVal = cfg.getter ? cfg.getter(liveBp) : cfg.min;
      if (liveVal !== undefined) {
        if (valSpan) valSpan.textContent = `${liveVal}${cfg.suffix || ''}`;
        if (miniRing) {
          const liveT = Math.max(0, Math.min(1, (liveVal - cfg.min) / (cfg.max - cfg.min)));
          const c = 2 * Math.PI * 4.5;
          miniRing.setAttribute('stroke-dashoffset', (c * (1 - liveT)).toFixed(1));
        }
      }
    };

    return { el: dialBtn, sync: syncFn };
  }

  // ── Helper to build a Direct Touch Slider widget ──
  function createSliderWidgetElement(paramKey) {
    const cfg = TB_PARAM_CONFIGS[paramKey] || TB_PARAM_CONFIGS.size;
    const bp = host.brushParams || {};
    const curVal = cfg.getter ? cfg.getter(bp) : cfg.min;

    const wrap = document.createElement('div');
    wrap.className = 'tb-slider-widget';

    const lbl = document.createElement('span');
    lbl.style.fontSize = '10px';
    lbl.style.fontWeight = 'bold';
    lbl.style.color = '#a89984';
    lbl.style.whiteSpace = 'nowrap';
    lbl.textContent = cfg.name || paramKey;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(cfg.min);
    slider.max = String(cfg.max);
    slider.step = String(cfg.step || 1);
    slider.value = String(curVal);
    slider.className = 'dock-strip-slider';

    const valBadge = document.createElement('span');
    valBadge.style.fontSize = '10px';
    valBadge.style.color = '#ebdbb2';
    valBadge.style.minWidth = '28px';
    valBadge.style.textAlign = 'right';
    valBadge.style.fontFamily = 'monospace';
    valBadge.textContent = `${curVal}${cfg.suffix || ''}`;

    let isTouching = false;
    slider.addEventListener('pointerdown', (e) => {
      isTouching = true;
      e.stopPropagation();
    });
    const stopTouch = () => { isTouching = false; };
    slider.addEventListener('pointerup', stopTouch);
    slider.addEventListener('pointercancel', stopTouch);

    const onValChange = () => {
      const v = parseFloat(slider.value);
      if (!isNaN(v)) {
        valBadge.textContent = `${v}${cfg.suffix || ''}`;
        runCmd(`${cfg.cmd} ${v}`);
      }
    };

    slider.addEventListener('input', onValChange);
    slider.addEventListener('change', () => {
      onValChange();
      triggerHaptic(10);
    });

    wrap.appendChild(lbl);
    wrap.appendChild(slider);
    wrap.appendChild(valBadge);

    const syncFn = () => {
      if (isTouching) return;
      const liveBp = host.brushParams || {};
      const liveVal = cfg.getter ? cfg.getter(liveBp) : cfg.min;
      if (liveVal !== undefined && document.activeElement !== slider) {
        slider.value = String(liveVal);
        valBadge.textContent = `${liveVal}${cfg.suffix || ''}`;
      }
    };

    return { el: wrap, sync: syncFn };
  }

  // ── Helper to build a Direct Number / Text Input widget ──
  function createInputWidgetElement(paramKey) {
    const cfg = TB_PARAM_CONFIGS[paramKey] || TB_PARAM_CONFIGS.size;
    const bp = host.brushParams || {};
    const curVal = cfg.getter ? cfg.getter(bp) : cfg.min;

    const wrap = document.createElement('div');
    wrap.className = 'tb-input-widget';

    const lbl = document.createElement('span');
    lbl.style.fontSize = '10px';
    lbl.style.fontWeight = 'bold';
    lbl.style.color = '#a89984';
    lbl.style.whiteSpace = 'nowrap';
    lbl.textContent = cfg.name || paramKey;

    const btnMinus = document.createElement('button');
    btnMinus.type = 'button';
    btnMinus.className = 'dock-strip-btn';
    btnMinus.style.minWidth = '18px';
    btnMinus.style.height = '22px';
    btnMinus.style.padding = '0';
    btnMinus.style.lineHeight = '20px';
    btnMinus.style.fontSize = '12px';
    btnMinus.textContent = '−';
    btnMinus.title = `Decrease ${cfg.name || paramKey}`;

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.min = String(cfg.min);
    numInput.max = String(cfg.max);
    numInput.step = String(cfg.step || 1);
    numInput.value = String(curVal);

    const btnPlus = document.createElement('button');
    btnPlus.type = 'button';
    btnPlus.className = 'dock-strip-btn';
    btnPlus.style.minWidth = '18px';
    btnPlus.style.height = '22px';
    btnPlus.style.padding = '0';
    btnPlus.style.lineHeight = '20px';
    btnPlus.style.fontSize = '12px';
    btnPlus.textContent = '+';
    btnPlus.title = `Increase ${cfg.name || paramKey}`;

    let suf = null;
    if (cfg.suffix) {
      suf = document.createElement('span');
      suf.style.fontSize = '9px';
      suf.style.color = '#928374';
      suf.textContent = cfg.suffix;
    }

    const applyValue = (val) => {
      let clamped = Math.max(cfg.min, Math.min(cfg.max, val));
      if (cfg.step && cfg.step >= 1) {
        clamped = Math.round(clamped / cfg.step) * cfg.step;
      }
      numInput.value = String(clamped);
      runCmd(`${cfg.cmd} ${clamped}`);
      triggerHaptic(10);
    };

    btnMinus.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = parseFloat(numInput.value) || cfg.min;
      const st = cfg.step || 1;
      applyValue(cur - st);
    });

    btnPlus.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = parseFloat(numInput.value) || cfg.min;
      const st = cfg.step || 1;
      applyValue(cur + st);
    });

    numInput.addEventListener('change', () => {
      const v = parseFloat(numInput.value);
      if (!isNaN(v)) applyValue(v);
    });

    numInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = parseFloat(numInput.value);
        if (!isNaN(v)) applyValue(v);
        numInput.blur();
      }
    });

    wrap.appendChild(lbl);
    wrap.appendChild(btnMinus);
    wrap.appendChild(numInput);
    wrap.appendChild(btnPlus);
    if (suf) wrap.appendChild(suf);

    const syncFn = () => {
      const liveBp = host.brushParams || {};
      const liveVal = cfg.getter ? cfg.getter(liveBp) : cfg.min;
      if (liveVal !== undefined && document.activeElement !== numInput) {
        numInput.value = String(liveVal);
      }
    };

    return { el: wrap, sync: syncFn };
  }

  // ── Helper to build a Checkbox Switch widget ──
  function createSwitchWidgetElement(paramKey) {
    const cfg = TB_PARAM_CONFIGS[paramKey] || TB_PARAM_CONFIGS.subpixel;
    const wrap = document.createElement('label');
    wrap.className = 'tb-chk-label';
    wrap.title = cfg.name || paramKey;

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    const bp = host.brushParams || {};
    chk.checked = cfg.getter ? cfg.getter(bp) : false;

    const txt = document.createElement('span');
    txt.textContent = cfg.name ? `${cfg.name}: ${chk.checked ? 'ON' : 'OFF'}` : (chk.checked ? 'ON' : 'OFF');

    chk.addEventListener('change', () => {
      runCmd(`${cfg.cmd} ${chk.checked ? 1 : 0}`);
      txt.textContent = cfg.name ? `${cfg.name}: ${chk.checked ? 'ON' : 'OFF'}` : (chk.checked ? 'ON' : 'OFF');
      triggerHaptic(10);
    });

    wrap.appendChild(chk);
    wrap.appendChild(txt);

    const syncFn = () => {
      const liveBp = host.brushParams || {};
      const liveVal = cfg.getter ? cfg.getter(liveBp) : false;
      if (document.activeElement !== chk) {
        chk.checked = liveVal;
        txt.textContent = cfg.name ? `${cfg.name}: ${liveVal ? 'ON' : 'OFF'}` : (liveVal ? 'ON' : 'OFF');
      }
    };
    return { el: wrap, sync: syncFn };
  }

  // ── Helper to build a Button Toggle widget ──
  function createBtnToggleWidgetElement(paramKey) {
    const cfg = TB_PARAM_CONFIGS[paramKey] || TB_PARAM_CONFIGS.subpixel;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dock-strip-btn';
    btn.textContent = cfg.name || paramKey;
    btn.title = `Toggle ${cfg.name || paramKey}`;

    btn.addEventListener('click', () => {
      const bp = host.brushParams || {};
      const cur = cfg.getter ? cfg.getter(bp) : false;
      const next = !cur;
      runCmd(`${cfg.cmd} ${next ? 1 : 0}`);
      btn.classList.toggle('active', next);
      triggerHaptic(10);
    });

    const syncFn = () => {
      const liveBp = host.brushParams || {};
      const liveVal = cfg.getter ? cfg.getter(liveBp) : false;
      btn.classList.toggle('active', liveVal);
    };
    return { el: btn, sync: syncFn };
  }

  // ── Helper to build a Live Swatch Strip widget ──
  function createSwatchStripWidgetElement() {
    const wrap = document.createElement('div');
    wrap.className = 'tb-swatch-strip';
    wrap.title = 'Color Palette Strip';

    function renderStrip() {
      wrap.innerHTML = '';
      const list = getActivePaletteColors().slice(0, 12);
      const curHex = (host.currentColor !== undefined)
        ? rgbToHex(host.currentColor & 0xFF, (host.currentColor >> 8) & 0xFF, (host.currentColor >> 16) & 0xFF).toUpperCase()
        : '';

      list.forEach(col => {
        const item = document.createElement('div');
        item.className = 'tb-swatch-item';
        item.style.background = col;
        item.title = `Select color ${col}`;
        if (col.toUpperCase() === curHex) item.classList.add('active');
        item.addEventListener('click', () => {
          updateColorControlsFromHex(col);
          runCmd(`set color ${col}`);
          triggerHaptic(10);
          renderStrip();
        });
        wrap.appendChild(item);
      });

      // Quick add current color button
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'dock-strip-btn';
      addBtn.style.minWidth = '22px';
      addBtn.style.padding = '0 4px';
      addBtn.style.fontSize = '12px';
      addBtn.textContent = '+';
      addBtn.title = 'Save current color to palette';
      addBtn.addEventListener('click', () => {
        if (host.currentColor !== undefined) {
          const hex = rgbToHex(host.currentColor & 0xFF, (host.currentColor >> 8) & 0xFF, (host.currentColor >> 16) & 0xFF).toUpperCase();
          addCustomSwatch(hex);
          triggerHaptic(15);
          renderStrip();
        }
      });
      wrap.appendChild(addBtn);
    }

    renderStrip();

    const syncFn = () => {
      const curHex = (host.currentColor !== undefined)
        ? rgbToHex(host.currentColor & 0xFF, (host.currentColor >> 8) & 0xFF, (host.currentColor >> 16) & 0xFF).toUpperCase()
        : '';
      wrap.querySelectorAll('.tb-swatch-item').forEach(el => {
        const bg = el.style.backgroundColor;
        el.classList.toggle('active', !!curHex && (el.style.background.toUpperCase() === curHex || bg === curHex));
      });
    };

    return { el: wrap, sync: syncFn };
  }

  // ── Modular Widget Registry ──
  const MODULAR_WIDGET_REGISTRY = {
    'tool_select': {
      category: 'Compound & Layout',
      label: 'Tools Dropdown',
      render: () => {
        const sel = document.createElement('select');
        sel.className = 'dock-strip-select';
        sel.title = 'Drawing Tool';
        sel.innerHTML = `
          <option value="brush">Tool: Brush</option>
          <option value="blend">Tool: Blend</option>
          <option value="fill">Tool: Fill</option>
          <option value="lasso_fill">Tool: Lasso</option>
          <option value="picker">Tool: Picker</option>
          <option value="line">Tool: Line</option>
          <option value="rect">Tool: Rect</option>
          <option value="ellipse">Tool: Ellipse</option>
        `;
        sel.addEventListener('change', () => {
          if (sel.value) {
            runCmd(`tool ${sel.value}`);
            triggerHaptic(12);
          }
        });
        const syncFn = () => {
          if (host.currentTool && sel.value !== host.currentTool) {
            sel.value = host.currentTool;
          }
        };
        return { el: sel, sync: syncFn };
      }
    },

    'mode_select': {
      category: 'Compound & Layout',
      label: 'Modes Dropdown',
      render: () => {
        const sel = document.createElement('select');
        sel.className = 'dock-strip-select';
        sel.title = 'Action Mode';
        sel.innerHTML = `
          <option value="draw">Mode: Draw</option>
          <option value="erase">Mode: Erase</option>
          <option value="smudge">Mode: Smudge</option>
          <option value="select">Mode: Select</option>
        `;
        sel.addEventListener('change', () => {
          if (sel.value) {
            runCmd(`mode ${sel.value}`);
            triggerHaptic(12);
          }
        });
        const syncFn = () => {
          if (host.actionMode && sel.value !== host.actionMode) {
            sel.value = host.actionMode;
          }
        };
        return { el: sel, sync: syncFn };
      }
    },

    'action_select': {
      category: 'Compound & Layout',
      label: 'Actions Dropdown',
      render: () => {
        const sel = document.createElement('select');
        sel.className = 'dock-strip-select';
        sel.title = 'Quick Actions';
        sel.innerHTML = `
          <option value="" disabled selected>-- Action --</option>
          <option value="undo">Undo</option>
          <option value="redo">Redo</option>
          <option value="copy">Copy</option>
          <option value="cut">Cut</option>
          <option value="deselect">Deselect</option>
          <option value="apply_xform">Apply Transform</option>
          <option value="cancel_xform">Cancel Transform</option>
          <option value="flip_h">Flip Horizontal</option>
          <option value="flip_v">Flip Vertical</option>
          <option value="clear">Clear Canvas</option>
          <option value="save_swatch">+ Save Swatch</option>
          <option value="open_color_picker">Color Studio</option>
          <option value="open_customizer">Toolbar Customizer</option>
        `;
        sel.addEventListener('change', () => {
          const act = sel.value;
          if (!act) return;
          if (act === 'undo') runCmd('undo');
          else if (act === 'redo') runCmd('redo');
          else if (act === 'copy') runCmd('selection copy');
          else if (act === 'cut') runCmd('selection cut');
          else if (act === 'deselect') runCmd('selection clear');
          else if (act === 'apply_xform') runCmd('transform apply');
          else if (act === 'cancel_xform') runCmd('transform cancel');
          else if (act === 'flip_h') runCmd('canvas flip h');
          else if (act === 'flip_v') runCmd('canvas flip v');
          else if (act === 'clear') runCmd('clear');
          else if (act === 'save_swatch') {
            if (host.currentColor !== undefined) {
              const hex = rgbToHex(host.currentColor & 0xFF, (host.currentColor >> 8) & 0xFF, (host.currentColor >> 16) & 0xFF).toUpperCase();
              addCustomSwatch(hex);
            }
          } else if (act === 'open_color_picker') {
            openTouchColorModal();
          } else if (act === 'open_customizer') {
            openToolbarManagerModal();
          }
          triggerHaptic(12);
          sel.selectedIndex = 0;
        });
        return { el: sel, sync: () => {} };
      }
    },

    'param_picker': {
      category: 'Compound & Layout',
      label: 'Dynamic Parameter Slot + Dropdown',
      render: () => {
        const wrap = document.createElement('div');
        wrap.className = 'tb-param-picker-wrap';
        wrap.style.display = 'inline-flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '4px';
        wrap.style.flexShrink = '0';

        const sel = document.createElement('select');
        sel.id = 'tb-param-select';
        sel.className = 'tb-param-select';
        sel.title = 'Brush Parameter';
        sel.innerHTML = `
          <optgroup label="Main Controls">
            <option value="size" selected>Size</option>
            <option value="opacity">Opacity</option>
            <option value="flow">Flow</option>
            <option value="hardness">Hardness</option>
            <option value="spacing">Spacing</option>
            <option value="smoothing">Stabilize</option>
            <option value="midpoint">Midpoint</option>
            <option value="angle">Angle</option>
            <option value="roundness">Round</option>
            <option value="scatter">Scatter</option>
          </optgroup>
          <optgroup label="Presets & Tips">
            <option value="preset">Preset</option>
            <option value="tip">Tip Shape</option>
            <option value="grain_tex">Texture</option>
            <option value="script">Script</option>
            <option value="save_tool">Copy Script</option>
            <option value="dab_blend">Dab Blend</option>
            <option value="symmetry">Symmetry</option>
            <option value="dual_shape">Dual Shape</option>
          </optgroup>
          <optgroup label="Wet Media & Dynamics">
            <option value="smudge">Smudge</option>
            <option value="wetness">Wetness</option>
            <option value="depletion">Deplete</option>
            <option value="color_pickup">Pickup</option>
            <option value="velocity">Velocity</option>
            <option value="string_length">Pulled String</option>
            <option value="taper_in">Taper In</option>
            <option value="taper_out">Taper Out</option>
            <option value="fade">Fade</option>
            <option value="tolerance">Fill Tol</option>
          </optgroup>
          <optgroup label="Jitter">
            <option value="size_jitter">Size Jitter</option>
            <option value="angle_jitter">Ang Jitter</option>
            <option value="opacity_jitter">Op Jitter</option>
            <option value="color_jitter">Col Jitter</option>
          </optgroup>
          <optgroup label="Texture & Dual">
            <option value="grain">Noise</option>
            <option value="texture_scale">Tex Scale</option>
            <option value="texture_rotate">Tex Rot</option>
            <option value="texture_contrast">Tex Cont</option>
            <option value="dual_size">Dual Size</option>
            <option value="dual_spacing">Dual Spc</option>
          </optgroup>
          <optgroup label="Switches">
            <option value="auto_rotate">Auto-Rot</option>
            <option value="subpixel">Subpixel</option>
            <option value="pressure_size">Press Size</option>
            <option value="pressure_flow">Press Flow</option>
            <option value="tilt_angle">Tilt Ang</option>
          </optgroup>
        `;

        const slot = document.createElement('div');
        slot.id = 'tb-dynamic-slot';
        slot.className = 'tb-dynamic-slot';

        let activeDialWidget = null;

        function renderDynamicSlot() {
          slot.innerHTML = '';
          const key = sel.value || 'size';
          const cfg = TB_PARAM_CONFIGS[key] || TB_PARAM_CONFIGS.size;
          activeDialWidget = null;

          if (cfg.type === 'dial') {
            activeDialWidget = createDialWidgetElement(key);
            slot.appendChild(activeDialWidget.el);
          } else if (cfg.type === 'switch') {
            const bp = host.brushParams || {};
            const isChecked = cfg.getter ? cfg.getter(bp) : false;
            const lbl = document.createElement('label');
            lbl.className = 'tb-chk-label';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = isChecked;
            const txt = document.createElement('span');
            txt.textContent = isChecked ? 'ON' : 'OFF';

            chk.addEventListener('change', () => {
              runCmd(`${cfg.cmd} ${chk.checked ? 1 : 0}`);
              txt.textContent = chk.checked ? 'ON' : 'OFF';
              triggerHaptic(10);
            });
            lbl.appendChild(chk);
            lbl.appendChild(txt);
            slot.appendChild(lbl);
          } else if (cfg.type === 'select_preset') {
            const pSel = document.createElement('select');
            pSel.className = 'tb-select';
            pSel.innerHTML = '<option value="" disabled selected>-- Presets --</option>';
            for (const [k, p] of Object.entries(BRUSH_PRESETS)) {
              if (!p.name) continue;
              const opt = document.createElement('option');
              opt.value = k;
              opt.textContent = p.name;
              pSel.appendChild(opt);
            }
            const custom = host.customBrushPresets || {};
            for (const [k, p] of Object.entries(custom)) {
              const opt = document.createElement('option');
              opt.value = k;
              opt.textContent = p.name || k;
              pSel.appendChild(opt);
            }
            pSel.addEventListener('change', () => {
              if (pSel.value) {
                host.selectBrushPreset(pSel.value);
                syncUiFromHost();
                triggerHaptic(15);
              }
              pSel.selectedIndex = 0;
            });
            slot.appendChild(pSel);
          } else if (cfg.type === 'select_tip') {
            const tSel = document.createElement('select');
            tSel.className = 'tb-select';
            tSel.innerHTML = `
              <option value="0">Round</option>
              <option value="1">Chisel</option>
              <option value="2">Dry Brush</option>
              <option value="3">Calligraphic</option>
              <option value="4">Pencil</option>
              <option value="5">Rake</option>
              <option value="6">Pixel</option>
            `;
            const curTip = (host.brushParams && host.brushParams.shape !== undefined) ? host.brushParams.shape : 0;
            tSel.value = String(curTip);
            tSel.addEventListener('change', () => {
              runCmd(`set shape ${tSel.value}`);
              triggerHaptic(10);
            });
            slot.appendChild(tSel);
          } else if (cfg.type === 'select_grain') {
            const gSel = document.createElement('select');
            gSel.className = 'tb-select';
            gSel.innerHTML = `
              <option value="none">None</option>
              <option value="canvas">Canvas</option>
              <option value="paper">Paper</option>
              <option value="noise">Noise</option>
              <option value="grunge">Grunge</option>
            `;
            gSel.value = (host.brushParams && host.brushParams.texture) ? host.brushParams.texture : 'none';
            gSel.addEventListener('change', () => {
              runCmd(`set texture ${gSel.value}`);
              triggerHaptic(10);
            });
            slot.appendChild(gSel);
          } else if (cfg.type === 'select_script') {
            const sSel = document.createElement('select');
            sSel.className = 'tb-select';
            sSel.innerHTML = '<option value="" disabled selected>-- Script --</option>';
            const list = getSavedScripts();
            list.forEach((s, idx) => {
              const opt = document.createElement('option');
              opt.value = String(idx);
              opt.textContent = s.name;
              sSel.appendChild(opt);
            });
            sSel.addEventListener('change', () => {
              const idx = parseInt(sSel.value, 10);
              if (!isNaN(idx) && list[idx]) {
                runScriptCode(list[idx].code);
                triggerHaptic(15);
              }
              sSel.selectedIndex = 0;
            });
            slot.appendChild(sSel);
          } else if (cfg.type === 'select_dab_blend') {
            const bSel = document.createElement('select');
            bSel.className = 'tb-select';
            bSel.innerHTML = `
              <option value="0">Normal</option>
              <option value="1">Multiply</option>
              <option value="2">Screen</option>
              <option value="3">Overlay</option>
              <option value="4">Add</option>
              <option value="5">Dodge</option>
            `;
            bSel.value = String((host.brushParams && host.brushParams.dab_blend !== undefined) ? host.brushParams.dab_blend : 0);
            bSel.addEventListener('change', () => {
              runCmd(`set dab_blend ${bSel.value}`);
              triggerHaptic(10);
            });
            slot.appendChild(bSel);
          } else if (cfg.type === 'select_symmetry') {
            const symSel = document.createElement('select');
            symSel.className = 'tb-select';
            symSel.innerHTML = `
              <option value="off">Sym: Off</option>
              <option value="vertical">Sym: Vertical</option>
              <option value="horizontal">Sym: Horizontal</option>
              <option value="quad">Sym: Quad</option>
              <option value="radial">Sym: Radial</option>
            `;
            symSel.value = (host.brushParams && host.brushParams.symmetry) ? host.brushParams.symmetry : 'off';
            symSel.addEventListener('change', () => {
              runCmd(`set symmetry ${symSel.value}`);
              triggerHaptic(10);
            });
            slot.appendChild(symSel);
          } else if (cfg.type === 'select_dual_shape') {
            const dSel = document.createElement('select');
            dSel.className = 'tb-select';
            dSel.innerHTML = `
              <option value="0">Dual: None</option>
              <option value="1">Dual: Round</option>
              <option value="2">Dual: Dry Brush</option>
              <option value="3">Dual: Noise</option>
              <option value="4">Dual: Rake</option>
            `;
            dSel.value = String((host.brushParams && host.brushParams.dual_shape !== undefined) ? host.brushParams.dual_shape : 0);
            dSel.addEventListener('change', () => {
              runCmd(`set dual_shape ${dSel.value}`);
              triggerHaptic(10);
            });
            slot.appendChild(dSel);
          } else if (cfg.type === 'save_tool') {
            const stBtn = document.createElement('button');
            stBtn.type = 'button';
            stBtn.className = 'dock-strip-btn';
            stBtn.textContent = 'Copy Script';
            stBtn.title = 'Copy current brush setup as runnable script';
            stBtn.addEventListener('click', async () => {
              const script = host.dumpBrushScript();
              try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  await navigator.clipboard.writeText(script);
                  log('Brush preset copied to clipboard [ok]');
                } else {
                  log(script);
                }
              } catch (_) {
                log(script);
              }
              triggerHaptic(15);
            });
            slot.appendChild(stBtn);
          }
        }

        sel.addEventListener('change', () => {
          renderDynamicSlot();
          triggerHaptic(10);
        });
        renderDynamicSlot();

        wrap.appendChild(sel);
        wrap.appendChild(slot);

        const syncFn = () => {
          if (activeDialWidget) activeDialWidget.sync();
        };

        return { el: wrap, sync: syncFn };
      }
    },

    'swatch': {
      category: 'Color & Swatches',
      label: 'Color Swatch (Opens Studio)',
      render: () => {
        const swatch = document.createElement('div');
        swatch.id = 'tb-color-swatch';
        swatch.className = 'tb-color-swatch';
        swatch.title = 'Touch Color Studio';
        if (host.currentColor !== undefined) {
          const c = host.currentColor;
          swatch.style.background = rgbToHex(c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF);
        }
        swatch.addEventListener('click', openTouchColorModal);
        const syncFn = () => {
          if (host.currentColor !== undefined) {
            const c = host.currentColor;
            swatch.style.background = rgbToHex(c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF);
          }
        };
        return { el: swatch, sync: syncFn };
      }
    },

    'swatch_strip': {
      category: 'Color & Swatches',
      label: 'Swatch Strip (Interactive Palette Bar)',
      render: () => createSwatchStripWidgetElement()
    },

    'preset_select': {
      category: 'Compound & Layout',
      label: 'Brush Presets Dropdown',
      render: () => {
        const sel = document.createElement('select');
        sel.className = 'dock-strip-select';
        sel.style.maxWidth = '130px';
        sel.style.fontWeight = 'bold';
        sel.title = 'Brush Preset';
        const populate = () => {
          sel.innerHTML = '<option value="" disabled selected>-- Presets --</option>';
          const optGrpBuiltin = document.createElement('optgroup');
          optGrpBuiltin.label = 'Built-in Presets';
          for (const [k, p] of Object.entries(BRUSH_PRESETS)) {
            if (!p.name) continue;
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = p.name;
            optGrpBuiltin.appendChild(opt);
          }
          sel.appendChild(optGrpBuiltin);
          const custom = host.customBrushPresets || {};
          if (Object.keys(custom).length > 0) {
            const grpCustom = document.createElement('optgroup');
            grpCustom.label = 'Custom Presets';
            for (const [k, p] of Object.entries(custom)) {
              const opt = document.createElement('option');
              opt.value = k;
              opt.textContent = p.name || k;
              grpCustom.appendChild(opt);
            }
            sel.appendChild(grpCustom);
          }
        };
        populate();
        sel.addEventListener('focus', populate);
        sel.addEventListener('pointerdown', populate);
        sel.addEventListener('change', () => {
          if (sel.value) {
            host.selectBrushPreset(sel.value);
            syncUiFromHost();
            triggerHaptic(15);
          }
          sel.selectedIndex = 0;
        });
        return { el: sel, sync: () => {} };
      }
    },

    'script_select': {
      category: 'Compound & Layout',
      label: 'Script Runner Dropdown',
      render: () => {
        const sel = document.createElement('select');
        sel.className = 'dock-strip-select';
        sel.title = 'Run Saved Script';
        const populate = () => {
          sel.innerHTML = '<option value="" disabled selected>Script</option>';
          const list = getSavedScripts();
          list.forEach((s, idx) => {
            const opt = document.createElement('option');
            opt.value = String(idx);
            opt.textContent = s.name;
            sel.appendChild(opt);
          });
        };
        populate();
        sel.addEventListener('focus', populate);
        sel.addEventListener('pointerdown', populate);
        sel.addEventListener('change', () => {
          const list = getSavedScripts();
          const idx = parseInt(sel.value, 10);
          if (!isNaN(idx) && list[idx]) {
            runScriptCode(list[idx].code);
            triggerHaptic(15);
          }
          sel.selectedIndex = 0;
        });
        return { el: sel, sync: () => {} };
      }
    }
  };

  // Register all Parameter Widgets (Arc Dial, Direct Slider, Number Input) and Switches
  Object.entries(TB_PARAM_CONFIGS).forEach(([paramKey, cfg]) => {
    if (cfg.type === 'dial') {
      // 1. Arc Dial
      MODULAR_WIDGET_REGISTRY[`dial:${paramKey}`] = {
        category: 'Parameters',
        label: `[Arc Dial] ${cfg.name || paramKey}`,
        render: () => createDialWidgetElement(paramKey)
      };

      // 2. Touch Slider
      MODULAR_WIDGET_REGISTRY[`slider:${paramKey}`] = {
        category: 'Parameters',
        label: `[Slider] ${cfg.name || paramKey}`,
        render: () => createSliderWidgetElement(paramKey)
      };

      // 3. Number / Text Input
      MODULAR_WIDGET_REGISTRY[`input:${paramKey}`] = {
        category: 'Parameters',
        label: `[Input] ${cfg.name || paramKey}`,
        render: () => createInputWidgetElement(paramKey)
      };
    } else if (cfg.type === 'switch') {
      // 1. Toggle Switch
      MODULAR_WIDGET_REGISTRY[`switch:${paramKey}`] = {
        category: 'Switches',
        label: `[Switch] ${cfg.name || paramKey}`,
        render: () => createSwitchWidgetElement(paramKey)
      };

      // 2. Button Toggle
      MODULAR_WIDGET_REGISTRY[`btn_toggle:${paramKey}`] = {
        category: 'Switches',
        label: `[Button Toggle] ${cfg.name || paramKey}`,
        render: () => createBtnToggleWidgetElement(paramKey)
      };
    }
  });

  // Register all Tools
  const TOOL_NAMES = [
    { id: 'brush', label: 'Brush' },
    { id: 'blend', label: 'Blend' },
    { id: 'fill', label: 'Fill' },
    { id: 'lasso_fill', label: 'Lasso' },
    { id: 'picker', label: 'Picker' },
    { id: 'line', label: 'Line' },
    { id: 'rect', label: 'Rect' },
    { id: 'ellipse', label: 'Ellipse' }
  ];
  TOOL_NAMES.forEach(t => {
    MODULAR_WIDGET_REGISTRY[`tool:${t.id}`] = {
      category: 'Drawing Tools',
      label: `Tool: ${t.label}`,
      render: () => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dock-strip-btn dock-tool-btn';
        btn.textContent = t.label;
        btn.title = `Tool: ${t.label}`;
        btn.addEventListener('click', () => {
          runCmd(`tool ${t.id}`);
          triggerHaptic(12);
        });
        const syncFn = () => {
          btn.classList.toggle('active', host.currentTool === t.id);
        };
        return { el: btn, sync: syncFn };
      }
    };
  });

  // Register all Modes
  const MODE_NAMES = [
    { id: 'draw', label: 'Draw' },
    { id: 'erase', label: 'Erase' },
    { id: 'smudge', label: 'Smudge' },
    { id: 'select', label: 'Select' }
  ];
  MODE_NAMES.forEach(m => {
    MODULAR_WIDGET_REGISTRY[`mode:${m.id}`] = {
      category: 'Action Modes',
      label: `Mode: ${m.label}`,
      render: () => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dock-strip-btn dock-mode-btn';
        btn.textContent = m.label;
        btn.title = `Mode: ${m.label}`;
        btn.addEventListener('click', () => {
          runCmd(`mode ${m.id}`);
          triggerHaptic(12);
        });
        const syncFn = () => {
          btn.classList.toggle('active', host.actionMode === m.id);
        };
        return { el: btn, sync: syncFn };
      }
    };
  });

  // Register all Actions
  const ACTION_ITEMS = [
    { id: 'undo', label: '↶ Undo', title: 'Undo (Ctrl+Z)', cmd: () => handleUndo() },
    { id: 'redo', label: '↷ Redo', title: 'Redo (Ctrl+Y)', cmd: () => handleRedo() },
    { id: 'save_swatch', label: '+ Swatch', title: 'Save Current Color to Palette', cmd: () => {
      if (host.currentColor !== undefined) {
        const hex = rgbToHex(host.currentColor & 0xFF, (host.currentColor >> 8) & 0xFF, (host.currentColor >> 16) & 0xFF).toUpperCase();
        addCustomSwatch(hex);
        log(`Swatch ${hex} saved [ok]`);
      }
    }},
    { id: 'open_color_picker', label: '🎨 Studio', title: 'Open Color Studio', cmd: () => openTouchColorModal() },
    { id: 'copy', label: 'Copy', title: 'Copy Selection', cmd: () => runCmd('selection copy') },
    { id: 'cut', label: 'Cut', title: 'Cut Selection', cmd: () => runCmd('selection cut') },
    { id: 'deselect', label: 'Desel', title: 'Deselect', cmd: () => runCmd('selection clear') },
    { id: 'apply_xform', label: 'Apply', title: 'Apply Transform', cmd: () => runCmd('transform apply') },
    { id: 'cancel_xform', label: 'Cancel', title: 'Cancel Transform', cmd: () => runCmd('transform cancel') },
    { id: 'flip_h', label: 'Flip H', title: 'Flip Canvas Horizontally', cmd: () => runCmd('canvas flip h') },
    { id: 'flip_v', label: 'Flip V', title: 'Flip Canvas Vertically', cmd: () => runCmd('canvas flip v') },
    { id: 'grid_toggle', label: '▦ Grid', title: 'Toggle Pixel Grid', cmd: () => {
      host.showPixelGrid = !host.showPixelGrid;
      log(`pixel grid: ${host.showPixelGrid ? 'on' : 'off'}`);
      syncUiFromHost();
    }},
    { id: 'symmetry_toggle', label: '◫ Symmetry', title: 'Toggle Symmetry Mirror (Off/Vertical/Quad)', cmd: () => {
      const cur = host.symmetryMode || (host.brushParams && host.brushParams.symmetry !== undefined ? host.brushParams.symmetry : 0);
      const next = (cur === 0 || cur === 'none' || cur === 'off') ? 1 : (cur === 1 || cur === 'v' || cur === 'vertical') ? 3 : 0;
      runCmd(`set symmetry ${next}`);
      syncUiFromHost();
    }},
    { id: 'clear_layer', label: 'Clear', title: 'Clear Active Layer', cmd: () => runCmd('clear') },
    { id: 'open_customizer', label: '⚙ Bars', title: 'Customize Toolbars', cmd: () => openToolbarManagerModal() }
  ];
  ACTION_ITEMS.forEach(act => {
    MODULAR_WIDGET_REGISTRY[`action:${act.id}`] = {
      category: 'Quick Actions',
      label: `Action: ${act.label}`,
      render: () => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dock-strip-btn';
        btn.textContent = act.label;
        btn.title = act.title;
        btn.addEventListener('click', () => {
          act.cmd();
          triggerHaptic(12);
        });
        return { el: btn, sync: () => {} };
      }
    };
  });

  // Register Layout Items
  MODULAR_WIDGET_REGISTRY['separator'] = {
    category: 'Compound & Layout',
    label: 'Separator (Line Divider)',
    render: () => {
      const sep = document.createElement('div');
      sep.className = 'tb-sep';
      return { el: sep, sync: () => {} };
    }
  };
  MODULAR_WIDGET_REGISTRY['spacer'] = {
    category: 'Compound & Layout',
    label: 'Spacer (Space)',
    render: () => {
      const sp = document.createElement('div');
      sp.style.width = '8px';
      sp.style.flexShrink = '0';
      return { el: sp, sync: () => {} };
    }
  };

  // ── Toolbar State & Persistence ──
  function normalizeModularItemType(type) {
    if (!type || typeof type !== 'string') return type;
    if (type.startsWith('param:')) {
      const parts = type.split(':');
      if (parts.length === 3) {
        return `${parts[2]}:${parts[1]}`;
      } else if (parts.length === 2) {
        return `dial:${parts[1]}`;
      }
    }
    return type;
  }

  // ── Toolbar State & Persistence ──
  const DEFAULT_MODULAR_TOOLBARS = [
    {
      id: 'bar_tools',
      name: 'Tools & Actions',
      items: [
        { type: 'action:undo' },
        { type: 'action:redo' },
        { type: 'separator' },
        { type: 'preset_select' },
        { type: 'tool_select' },
        { type: 'mode_select' },
        { type: 'action_select' }
      ]
    },
    {
      id: 'bar_brush_palette',
      name: 'Brush Controls & Palette',
      items: [
        { type: 'swatch' },
        { type: 'swatch_strip' },
        { type: 'separator' },
        { type: 'dial:size' },
        { type: 'dial:opacity' },
        { type: 'dial:flow' },
        { type: 'dial:stabilization' },
        { type: 'separator' },
        { type: 'param_picker' }
      ]
    }
  ];

  let currentModularToolbars = null;
  let activeModularWidgets = [];

  function loadModularToolbars() {
    try {
      const stored = localStorage.getItem('esenho_custom_toolbars');
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          let migrated = false;
          parsed.forEach(bar => {
            if (Array.isArray(bar.items)) {
              const newItems = [];
              bar.items.forEach(item => {
                if (item && item.type === 'category_switcher') {
                  newItems.push({ type: 'preset_select' });
                  newItems.push({ type: 'tool_select' });
                  newItems.push({ type: 'mode_select' });
                  newItems.push({ type: 'action_select' });
                  migrated = true;
                } else if (item && item.type) {
                  const normType = normalizeModularItemType(item.type);
                  if (normType !== item.type) {
                    migrated = true;
                    newItems.push({ ...item, type: normType });
                  } else {
                    newItems.push(item);
                  }
                } else {
                  newItems.push(item);
                }
              });
              bar.items = newItems;
            }
          });
          if (migrated) {
            try { localStorage.setItem('esenho_custom_toolbars', JSON.stringify(parsed)); } catch (_) {}
          }
          return parsed;
        }
      }
    } catch (_) {}
    return JSON.parse(JSON.stringify(DEFAULT_MODULAR_TOOLBARS));
  }

  function saveModularToolbars() {
    try {
      localStorage.setItem('esenho_custom_toolbars', JSON.stringify(currentModularToolbars));
    } catch (_) {}
  }

  function renderModularToolbars() {
    const container = document.getElementById('bottom-dock-bars');
    if (!container) return;
    container.innerHTML = '';
    activeModularWidgets = [];

    if (!currentModularToolbars) {
      currentModularToolbars = loadModularToolbars();
    }

    currentModularToolbars.forEach(bar => {
      const row = document.createElement('div');
      row.className = 'dock-bar-row';
      row.setAttribute('data-bar-id', bar.id);

      (bar.items || []).forEach(item => {
        let itemType = normalizeModularItemType(item.type);
        let renderer = MODULAR_WIDGET_REGISTRY[itemType];

        // Handle direct script button
        if (itemType === 'script_btn' && item.scriptName) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'dock-strip-btn';
          btn.textContent = item.scriptName;
          btn.title = `Run script "${item.scriptName}"`;
          btn.addEventListener('click', () => {
            const scripts = getSavedScripts();
            const found = scripts.find(s => s.name === item.scriptName);
            if (found) {
              runScriptCode(found.code);
              triggerHaptic(15);
            } else {
              alert(`Script "${item.scriptName}" not found.`);
            }
          });
          row.appendChild(btn);
          return;
        }

        if (renderer && renderer.render) {
          const widgetInstance = renderer.render(item);
          if (widgetInstance && widgetInstance.el) {
            row.appendChild(widgetInstance.el);
            if (widgetInstance.sync) {
              activeModularWidgets.push(widgetInstance.sync);
            }
          }
        }
      });

      container.appendChild(row);
      enableDragToScroll(row);
    });

    syncModularToolbars();
  }

  function syncModularToolbars() {
    activeModularWidgets.forEach(syncFn => {
      try { syncFn(); } catch (_) {}
    });
  }

  // ── Toolbar Manager Modal UI ──
  const toolbarMgrModal = document.getElementById('toolbar-manager-modal');
  const btnCloseToolbarMgr = document.getElementById('btn-close-toolbar-mgr');
  const btnOpenToolbarMgr = document.getElementById('btn-open-toolbar-mgr');
  const uiBtnOpenToolbarMgr = document.getElementById('ui-btn-open-toolbar-mgr');

  const tbMgrSelectBar = document.getElementById('tb-mgr-select-bar');
  const tbMgrBtnAddBar = document.getElementById('tb-mgr-btn-add-bar');
  const tbMgrBtnRenameBar = document.getElementById('tb-mgr-btn-rename-bar');
  const tbMgrBtnDelBar = document.getElementById('tb-mgr-btn-del-bar');
  const tbMgrSelectNewWidget = document.getElementById('tb-mgr-select-new-widget');
  const tbMgrSelectInputType = document.getElementById('tb-mgr-select-input-type');
  const tbMgrBtnAddWidget = document.getElementById('tb-mgr-btn-add-widget');
  const tbMgrItemsList = document.getElementById('tb-mgr-items-list');
  const tbMgrBtnResetDefault = document.getElementById('tb-mgr-btn-reset-default');
  const tbMgrBtnExport = document.getElementById('tb-mgr-btn-export');
  const tbMgrBtnImport = document.getElementById('tb-mgr-btn-import');

  let selectedBarIndex = 0;

  function updateInputTypeDropdown() {
    if (!tbMgrSelectInputType || !tbMgrSelectNewWidget) return;
    const val = tbMgrSelectNewWidget.value || '';
    if (val.startsWith('param:')) {
      tbMgrSelectInputType.style.display = 'inline-block';
      tbMgrSelectInputType.disabled = false;
      tbMgrSelectInputType.innerHTML = `
        <option value="dial" selected>Arc Dial</option>
        <option value="slider">Touch Slider</option>
        <option value="input">Number Input</option>
      `;
    } else if (val.startsWith('switch_param:')) {
      tbMgrSelectInputType.style.display = 'inline-block';
      tbMgrSelectInputType.disabled = false;
      tbMgrSelectInputType.innerHTML = `
        <option value="switch" selected>Toggle Switch</option>
        <option value="btn_toggle">Button Toggle</option>
      `;
    } else {
      tbMgrSelectInputType.style.display = 'none';
      tbMgrSelectInputType.disabled = true;
      tbMgrSelectInputType.innerHTML = '<option value="">(Default)</option>';
    }
  }

  function populateNewWidgetDropdown() {
    if (!tbMgrSelectNewWidget) return;
    tbMgrSelectNewWidget.innerHTML = '';

    // 1. Numerical Parameters Group
    const paramGroup = document.createElement('optgroup');
    paramGroup.label = 'Brush Parameters';
    Object.entries(TB_PARAM_CONFIGS).forEach(([key, cfg]) => {
      if (cfg.type === 'dial') {
        const opt = document.createElement('option');
        opt.value = `param:${key}`;
        opt.textContent = cfg.name || key;
        paramGroup.appendChild(opt);
      }
    });
    tbMgrSelectNewWidget.appendChild(paramGroup);

    // 2. Switch Parameters Group
    const switchGroup = document.createElement('optgroup');
    switchGroup.label = 'Switches & Toggles';
    Object.entries(TB_PARAM_CONFIGS).forEach(([key, cfg]) => {
      if (cfg.type === 'switch') {
        const opt = document.createElement('option');
        opt.value = `switch_param:${key}`;
        opt.textContent = cfg.name || key;
        switchGroup.appendChild(opt);
      }
    });
    tbMgrSelectNewWidget.appendChild(switchGroup);

    // 3. Color & Swatches Group
    const colorGroup = document.createElement('optgroup');
    colorGroup.label = 'Color & Swatches';
    colorGroup.innerHTML = `
      <option value="swatch">Color Swatch (Opens Studio)</option>
      <option value="swatch_strip">Swatch Strip (Interactive Palette Bar)</option>
      <option value="action:save_swatch">Quick Action: + Save Swatch</option>
      <option value="action:open_color_picker">Quick Action: Color Studio</option>
    `;
    tbMgrSelectNewWidget.appendChild(colorGroup);

    // 4. Drawing Tools Group
    const toolsGroup = document.createElement('optgroup');
    toolsGroup.label = 'Drawing Tools';
    TOOL_NAMES.forEach(t => {
      const opt = document.createElement('option');
      opt.value = `tool:${t.id}`;
      opt.textContent = `Tool: ${t.label}`;
      toolsGroup.appendChild(opt);
    });
    tbMgrSelectNewWidget.appendChild(toolsGroup);

    // 5. Action Modes Group
    const modesGroup = document.createElement('optgroup');
    modesGroup.label = 'Action Modes';
    MODE_NAMES.forEach(m => {
      const opt = document.createElement('option');
      opt.value = `mode:${m.id}`;
      opt.textContent = `Mode: ${m.label}`;
      modesGroup.appendChild(opt);
    });
    tbMgrSelectNewWidget.appendChild(modesGroup);

    // 6. Quick Actions Group
    const actionsGroup = document.createElement('optgroup');
    actionsGroup.label = 'Quick Actions';
    ACTION_ITEMS.forEach(act => {
      if (act.id === 'save_swatch' || act.id === 'open_color_picker') return;
      const opt = document.createElement('option');
      opt.value = `action:${act.id}`;
      opt.textContent = `Action: ${act.label}`;
      actionsGroup.appendChild(opt);
    });
    tbMgrSelectNewWidget.appendChild(actionsGroup);

    // 7. Compound & Layout Group
    const layoutGroup = document.createElement('optgroup');
    layoutGroup.label = 'Compound & Layout';
    layoutGroup.innerHTML = `
      <option value="tool_select">Tools Dropdown</option>
      <option value="mode_select">Modes Dropdown</option>
      <option value="action_select">Actions Dropdown</option>
      <option value="preset_select">Brush Presets Dropdown</option>
      <option value="param_picker">Dynamic Dial Slot</option>
      <option value="script_select">Script Runner Dropdown</option>
      <option value="separator">Separator (Line Divider)</option>
      <option value="spacer">Spacer (Empty Space)</option>
    `;
    tbMgrSelectNewWidget.appendChild(layoutGroup);

    // 8. Custom Scripts
    const scripts = getSavedScripts();
    if (scripts.length > 0) {
      const scriptGroup = document.createElement('optgroup');
      scriptGroup.label = 'Custom Script 1-Click Buttons';
      scripts.forEach(s => {
        const opt = document.createElement('option');
        opt.value = `script_btn:${s.name}`;
        opt.textContent = `Script Button: ${s.name}`;
        scriptGroup.appendChild(opt);
      });
      tbMgrSelectNewWidget.appendChild(scriptGroup);
    }

    updateInputTypeDropdown();
  }

  function renderToolbarManagerUI() {
    if (!currentModularToolbars) currentModularToolbars = loadModularToolbars();

    populateNewWidgetDropdown();

    if (currentModularToolbars.length === 0) {
      selectedBarIndex = -1;
      if (tbMgrSelectBar) {
        tbMgrSelectBar.innerHTML = '<option value="-1" disabled selected>(No bars — Click "+ New Bar")</option>';
        tbMgrSelectBar.disabled = true;
      }
      if (tbMgrBtnRenameBar) tbMgrBtnRenameBar.disabled = true;
      if (tbMgrBtnDelBar) tbMgrBtnDelBar.disabled = true;
      if (tbMgrBtnAddWidget) tbMgrBtnAddWidget.disabled = true;
      if (tbMgrSelectNewWidget) tbMgrSelectNewWidget.disabled = true;
      if (tbMgrSelectInputType) tbMgrSelectInputType.disabled = true;
      if (tbMgrItemsList) {
        tbMgrItemsList.innerHTML = '<div style="color: #928374; font-style: italic; padding: 12px; text-align: center;">No toolbars configured.<br>Click <strong>"+ New Bar"</strong> to create one.</div>';
      }
      return;
    }

    if (selectedBarIndex < 0 || selectedBarIndex >= currentModularToolbars.length) {
      selectedBarIndex = Math.max(0, currentModularToolbars.length - 1);
    }

    if (tbMgrSelectBar) {
      tbMgrSelectBar.disabled = false;
      tbMgrSelectBar.innerHTML = '';
      currentModularToolbars.forEach((b, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `[Bar ${idx + 1}] ${b.name || 'Toolbar'}`;
        if (idx === selectedBarIndex) opt.selected = true;
        tbMgrSelectBar.appendChild(opt);
      });
    }

    if (tbMgrBtnRenameBar) tbMgrBtnRenameBar.disabled = false;
    if (tbMgrBtnDelBar) tbMgrBtnDelBar.disabled = false;
    if (tbMgrBtnAddWidget) tbMgrBtnAddWidget.disabled = false;
    if (tbMgrSelectNewWidget) tbMgrSelectNewWidget.disabled = false;
    updateInputTypeDropdown();

    // Render items list for currently selected bar
    if (tbMgrItemsList) {
      tbMgrItemsList.innerHTML = '';
      const currentBar = currentModularToolbars[selectedBarIndex];
      if (!currentBar || !currentBar.items || currentBar.items.length === 0) {
        tbMgrItemsList.innerHTML = '<div style="color: #928374; font-style: italic; padding: 6px;">Bar is empty. Add items using the dropdown above.</div>';
      } else {
        currentBar.items.forEach((item, itemIdx) => {
          const row = document.createElement('div');
          row.className = 'toolbar-mgr-item-row';

          let displayName = item.type;
          if (item.type === 'script_btn') {
            displayName = `Script: ${item.scriptName}`;
          } else if (MODULAR_WIDGET_REGISTRY[item.type]) {
            displayName = MODULAR_WIDGET_REGISTRY[item.type].label;
          } else if (item.type.startsWith('dial:')) {
            const pk = item.type.replace('dial:', '');
            displayName = `[Arc Dial] ${TB_PARAM_CONFIGS[pk]?.name || pk}`;
          } else if (item.type.startsWith('slider:')) {
            const pk = item.type.replace('slider:', '');
            displayName = `[Slider] ${TB_PARAM_CONFIGS[pk]?.name || pk}`;
          } else if (item.type.startsWith('input:')) {
            const pk = item.type.replace('input:', '');
            displayName = `[Input] ${TB_PARAM_CONFIGS[pk]?.name || pk}`;
          } else if (item.type.startsWith('switch:')) {
            const pk = item.type.replace('switch:', '');
            displayName = `[Switch] ${TB_PARAM_CONFIGS[pk]?.name || pk}`;
          } else if (item.type.startsWith('btn_toggle:')) {
            const pk = item.type.replace('btn_toggle:', '');
            displayName = `[Button Toggle] ${TB_PARAM_CONFIGS[pk]?.name || pk}`;
          }

          const titleSpan = document.createElement('span');
          titleSpan.className = 'toolbar-mgr-item-title';
          titleSpan.textContent = `${itemIdx + 1}. ${displayName}`;

          const actionsDiv = document.createElement('div');
          actionsDiv.className = 'toolbar-mgr-item-actions';

          // Move Left / Up button
          const btnMoveLeft = document.createElement('button');
          btnMoveLeft.type = 'button';
          btnMoveLeft.className = 'dock-strip-btn';
          btnMoveLeft.style.padding = '0 6px';
          btnMoveLeft.textContent = '◀';
          btnMoveLeft.title = 'Move Left';
          btnMoveLeft.disabled = itemIdx === 0;
          btnMoveLeft.addEventListener('click', (e) => {
            e.stopPropagation();
            const temp = currentBar.items[itemIdx];
            currentBar.items[itemIdx] = currentBar.items[itemIdx - 1];
            currentBar.items[itemIdx - 1] = temp;
            saveModularToolbars();
            renderModularToolbars();
            renderToolbarManagerUI();
            triggerHaptic(10);
          });

          // Move Right / Down button
          const btnMoveRight = document.createElement('button');
          btnMoveRight.type = 'button';
          btnMoveRight.className = 'dock-strip-btn';
          btnMoveRight.style.padding = '0 6px';
          btnMoveRight.textContent = '▶';
          btnMoveRight.title = 'Move Right';
          btnMoveRight.disabled = itemIdx === currentBar.items.length - 1;
          btnMoveRight.addEventListener('click', (e) => {
            e.stopPropagation();
            const temp = currentBar.items[itemIdx];
            currentBar.items[itemIdx] = currentBar.items[itemIdx + 1];
            currentBar.items[itemIdx + 1] = temp;
            saveModularToolbars();
            renderModularToolbars();
            renderToolbarManagerUI();
            triggerHaptic(10);
          });

          // Delete Item button
          const btnDelete = document.createElement('button');
          btnDelete.type = 'button';
          btnDelete.className = 'dock-strip-btn';
          btnDelete.style.padding = '0 6px';
          btnDelete.style.color = '#fb4934';
          btnDelete.textContent = '✕';
          btnDelete.title = 'Remove Item';
          btnDelete.addEventListener('click', (e) => {
            e.stopPropagation();
            currentBar.items.splice(itemIdx, 1);
            saveModularToolbars();
            renderModularToolbars();
            renderToolbarManagerUI();
            triggerHaptic(15);
          });

          actionsDiv.appendChild(btnMoveLeft);
          actionsDiv.appendChild(btnMoveRight);
          actionsDiv.appendChild(btnDelete);

          row.appendChild(titleSpan);
          row.appendChild(actionsDiv);
          tbMgrItemsList.appendChild(row);
        });
      }
    }
  }

  function openToolbarManagerModal() {
    if (toolbarMgrModal) {
      renderToolbarManagerUI();
      toolbarMgrModal.classList.add('active');
      triggerHaptic(12);
    }
  }

  function closeToolbarManagerModal() {
    if (toolbarMgrModal) {
      toolbarMgrModal.classList.remove('active');
    }
  }

  if (btnOpenToolbarMgr) {
    const handleOpen = (e) => {
      e.stopPropagation();
      e.preventDefault();
      openToolbarManagerModal();
    };
    btnOpenToolbarMgr.addEventListener('pointerdown', (e) => e.stopPropagation());
    btnOpenToolbarMgr.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    btnOpenToolbarMgr.addEventListener('click', handleOpen);
  }
  if (uiBtnOpenToolbarMgr) {
    const handleOpenUi = (e) => {
      e.stopPropagation();
      e.preventDefault();
      openToolbarManagerModal();
    };
    uiBtnOpenToolbarMgr.addEventListener('pointerdown', (e) => e.stopPropagation());
    uiBtnOpenToolbarMgr.addEventListener('click', handleOpenUi);
  }
  if (btnCloseToolbarMgr) btnCloseToolbarMgr.addEventListener('click', closeToolbarManagerModal);
  if (toolbarMgrModal) {
    toolbarMgrModal.addEventListener('click', (e) => {
      if (e.target === toolbarMgrModal) closeToolbarManagerModal();
    });
  }

  if (tbMgrSelectBar) {
    tbMgrSelectBar.addEventListener('change', () => {
      selectedBarIndex = parseInt(tbMgrSelectBar.value, 10) || 0;
      renderToolbarManagerUI();
    });
  }

  if (tbMgrSelectNewWidget) {
    tbMgrSelectNewWidget.addEventListener('change', updateInputTypeDropdown);
  }

  if (tbMgrBtnAddBar) {
    tbMgrBtnAddBar.addEventListener('click', () => {
      const name = window.prompt('New Toolbar Name:', `Custom Bar ${(currentModularToolbars ? currentModularToolbars.length : 0) + 1}`);
      if (name && name.trim()) {
        if (!currentModularToolbars) currentModularToolbars = [];
        const newId = `bar_${Date.now()}`;
        currentModularToolbars.push({
          id: newId,
          name: name.trim(),
          items: []
        });
        selectedBarIndex = currentModularToolbars.length - 1;
        saveModularToolbars();
        renderModularToolbars();
        renderToolbarManagerUI();
        triggerHaptic(15);
      }
    });
  }

  if (tbMgrBtnRenameBar) {
    tbMgrBtnRenameBar.addEventListener('click', () => {
      if (!currentModularToolbars || selectedBarIndex < 0) return;
      const currentBar = currentModularToolbars[selectedBarIndex];
      if (!currentBar) return;
      const name = window.prompt('Rename Toolbar:', currentBar.name || '');
      if (name && name.trim()) {
        currentBar.name = name.trim();
        saveModularToolbars();
        renderModularToolbars();
        renderToolbarManagerUI();
        triggerHaptic(10);
      }
    });
  }

  if (tbMgrBtnDelBar) {
    tbMgrBtnDelBar.addEventListener('click', () => {
      if (!currentModularToolbars || currentModularToolbars.length === 0 || selectedBarIndex < 0) return;
      const barToDelete = currentModularToolbars[selectedBarIndex];
      if (confirm(`Delete toolbar "${barToDelete?.name || 'Toolbar'}"?`)) {
        currentModularToolbars.splice(selectedBarIndex, 1);
        selectedBarIndex = Math.max(-1, currentModularToolbars.length - 1);
        saveModularToolbars();
        renderModularToolbars();
        renderToolbarManagerUI();
        triggerHaptic(15);
      }
    });
  }

  if (tbMgrBtnAddWidget) {
    tbMgrBtnAddWidget.addEventListener('click', () => {
      if (!currentModularToolbars || currentModularToolbars.length === 0 || selectedBarIndex < 0) return;
      const currentBar = currentModularToolbars[selectedBarIndex];
      if (!currentBar) return;
      if (!currentBar.items) currentBar.items = [];

      const chosenVal = tbMgrSelectNewWidget ? tbMgrSelectNewWidget.value : '';
      if (!chosenVal) return;

      if (chosenVal.startsWith('param:')) {
        const paramKey = chosenVal.replace('param:', '');
        const inputType = (tbMgrSelectInputType && tbMgrSelectInputType.value) || 'dial';
        currentBar.items.push({ type: `${inputType}:${paramKey}` });
      } else if (chosenVal.startsWith('switch_param:')) {
        const paramKey = chosenVal.replace('switch_param:', '');
        const inputType = (tbMgrSelectInputType && tbMgrSelectInputType.value) || 'switch';
        currentBar.items.push({ type: `${inputType}:${paramKey}` });
      } else if (chosenVal.startsWith('script_btn:')) {
        const scriptName = chosenVal.replace('script_btn:', '');
        currentBar.items.push({ type: 'script_btn', scriptName: scriptName });
      } else {
        currentBar.items.push({ type: chosenVal });
      }

      saveModularToolbars();
      renderModularToolbars();
      renderToolbarManagerUI();
      triggerHaptic(12);
    });
  }

  if (tbMgrBtnResetDefault) {
    tbMgrBtnResetDefault.addEventListener('click', () => {
      if (confirm('Reset toolbars to default factory layout?')) {
        currentModularToolbars = JSON.parse(JSON.stringify(DEFAULT_MODULAR_TOOLBARS));
        selectedBarIndex = 0;
        saveModularToolbars();
        renderModularToolbars();
        renderToolbarManagerUI();
        triggerHaptic(20);
      }
    });
  }

  if (tbMgrBtnExport) {
    tbMgrBtnExport.addEventListener('click', () => {
      const jsonStr = JSON.stringify(currentModularToolbars || [], null, 2);
      navigator.clipboard.writeText(jsonStr).then(() => {
        alert('Toolbar configuration JSON copied to clipboard!');
      }).catch(() => {
        window.prompt('Copy Toolbar JSON configuration:', jsonStr);
      });
    });
  }

  if (tbMgrBtnImport) {
    tbMgrBtnImport.addEventListener('click', () => {
      const jsonStr = window.prompt('Paste Toolbar JSON configuration:');
      if (jsonStr && jsonStr.trim()) {
        try {
          const parsed = JSON.parse(jsonStr.trim());
          if (Array.isArray(parsed)) {
            currentModularToolbars = parsed;
            selectedBarIndex = parsed.length > 0 ? 0 : -1;
            saveModularToolbars();
            renderModularToolbars();
            renderToolbarManagerUI();
            alert('Toolbars imported successfully!');
            triggerHaptic(20);
          } else {
            alert('Invalid toolbar JSON format.');
          }
        } catch (err) {
          alert(`Failed to import JSON: ${err.message}`);
        }
      }
    });
  }

  // Initial render of modular toolbars
  renderModularToolbars();


  // Active Layer Opacity slider (Photoshop style)
  const activeLayerOp = document.getElementById('ui-active-layer-op');
  const activeLayerOpVal = document.getElementById('ui-active-layer-op-val');
  if (activeLayerOp) {
    activeLayerOp._currentVal = String(activeLayerOp.value);
    activeLayerOp.addEventListener('input', () => {
      if (activeLayerOpVal) activeLayerOpVal.textContent = activeLayerOp.value + '%';
      const curActive = (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.get_active_layer)
        ? host.canvasActor.exports.get_active_layer() : 0;
      const opCell = document.getElementById(`layer-op-text-${curActive}`);
      if (opCell) opCell.textContent = activeLayerOp.value + '%';
      const val = parseInt(activeLayerOp.value, 10);
      const op255 = Math.min(255, Math.max(0, Math.round(val * 255 / 100)));
      if (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.w_layer_opacity) {
        host.canvasActor.exports.w_layer_opacity(curActive, op255);
      }
    });
    activeLayerOp.addEventListener('change', () => {
      activeLayerOp._currentVal = String(activeLayerOp.value);
      const curActive = (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.get_active_layer)
        ? host.canvasActor.exports.get_active_layer() : 0;
      runCmd(`opacity layer ${curActive} ${activeLayerOp.value}`);
    });
  }

  // Tip Shape & Texture selectors
  const shapeSel = document.getElementById('ui-select-shape');
  if (shapeSel) {
    shapeSel.addEventListener('change', () => {
      runCmd(`set shape ${shapeSel.value}`);
    });
  }
  const tipSel = document.getElementById('ui-select-tip');
  if (tipSel) {
    tipSel.addEventListener('change', () => {
      host.setBrushParam('shape', parseInt(tipSel.value, 10));
      syncUiFromHost();
    });
  }
  const texSel = document.getElementById('ui-select-texture');
  if (texSel) {
    texSel.addEventListener('change', () => {
      runCmd(`set texture ${texSel.value}`);
    });
  }
  const grainSel = document.getElementById('ui-select-grain-tex');
  if (grainSel) {
    grainSel.addEventListener('change', () => {
      host.setTexture(grainSel.value);
      syncUiFromHost();
    });
  }

  const dualShapeSel = document.getElementById('ui-select-dual-shape');
  if (dualShapeSel) {
    dualShapeSel.addEventListener('change', () => {
      runCmd(`set dual_shape ${dualShapeSel.value}`);
    });
  }

  const chkSubpixel = document.getElementById('ui-chk-subpixel');
  if (chkSubpixel) {
    chkSubpixel.addEventListener('change', () => {
      runCmd(`set subpixel ${chkSubpixel.checked ? 'on' : 'off'}`);
    });
  }

  const btnExportBrush = document.getElementById('ui-btn-export-brush');
  if (btnExportBrush) {
    btnExportBrush.addEventListener('click', async () => {
      const script = host.dumpBrushScript();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(script);
          log('Brush preset copied to clipboard [ok]');
        } else {
          log(script);
        }
      } catch (_) {
        log(script);
      }
    });
  }

  // 3. Color Picker (RGB + HSL + Hex + Swatches)
  const colorPicker = document.getElementById('ui-color-picker');
  const colorHex = document.getElementById('ui-color-hex');
  const colorPreview = document.getElementById('ui-color-preview');

  // Sliders
  const slR = document.getElementById('ui-slider-r');
  const slG = document.getElementById('ui-slider-g');
  const slB = document.getElementById('ui-slider-b');
  const slH = document.getElementById('ui-slider-h');
  const slS = document.getElementById('ui-slider-s');
  const slL = document.getElementById('ui-slider-l');

  const tabRgb = document.getElementById('tab-rgb');
  const tabHsl = document.getElementById('tab-hsl');
  const panelRgb = document.getElementById('panel-rgb');
  const panelHsl = document.getElementById('panel-hsl');

  if (tabRgb && tabHsl) {
    tabRgb.addEventListener('click', () => {
      tabRgb.classList.add('active');
      tabHsl.classList.remove('active');
      if (panelRgb) panelRgb.style.display = 'flex';
      if (panelHsl) panelHsl.style.display = 'none';
    });
    tabHsl.addEventListener('click', () => {
      tabHsl.classList.add('active');
      tabRgb.classList.remove('active');
      if (panelHsl) panelHsl.style.display = 'flex';
      if (panelRgb) panelRgb.style.display = 'none';
    });
  }

  function updateColorControlsFromHex(hex) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    const cleanHex = hex.toLowerCase();
    if (colorPreview) colorPreview.style.background = cleanHex;
    const ipChip = document.getElementById('ip-color-chip');
    if (ipChip) ipChip.style.backgroundColor = cleanHex;
    if (colorPicker && document.activeElement !== colorPicker) {
      colorPicker.value = cleanHex;
    }
    if (colorHex && document.activeElement !== colorHex) colorHex.value = cleanHex;

    const rgb = hexToRgb(cleanHex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    const setBadge = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    if (slR && document.activeElement !== slR) { slR.value = rgb.r; slR._currentVal = String(rgb.r); setBadge('ui-val-rgb-r', rgb.r); }
    if (slG && document.activeElement !== slG) { slG.value = rgb.g; slG._currentVal = String(rgb.g); setBadge('ui-val-rgb-g', rgb.g); }
    if (slB && document.activeElement !== slB) { slB.value = rgb.b; slB._currentVal = String(rgb.b); setBadge('ui-val-rgb-b', rgb.b); }

    if (slH && document.activeElement !== slH) { slH.value = hsl.h; slH._currentVal = String(hsl.h); setBadge('ui-val-hsl-h', hsl.h + '°'); }
    if (slS && document.activeElement !== slS) { slS.value = hsl.s; slS._currentVal = String(hsl.s); setBadge('ui-val-hsl-s', hsl.s + '%'); }
    if (slL && document.activeElement !== slL) { slL.value = hsl.l; slL._currentVal = String(hsl.l); setBadge('ui-val-hsl-l', hsl.l + '%'); }
  }

  function onRgbSliderChange() {
    const r = parseInt(slR.value, 10);
    const g = parseInt(slG.value, 10);
    const b = parseInt(slB.value, 10);
    slR._currentVal = String(r);
    slG._currentVal = String(g);
    slB._currentVal = String(b);
    const setBadge = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    setBadge('ui-val-rgb-r', r);
    setBadge('ui-val-rgb-g', g);
    setBadge('ui-val-rgb-b', b);
    const hex = rgbToHex(r, g, b);
    updateColorControlsFromHex(hex);
    runCmd(`set color ${hex}`);
  }

  function onHslSliderChange() {
    const h = parseInt(slH.value, 10);
    const s = parseInt(slS.value, 10);
    const l = parseInt(slL.value, 10);
    slH._currentVal = String(h);
    slS._currentVal = String(s);
    slL._currentVal = String(l);
    const setBadge = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    setBadge('ui-val-hsl-h', h + '°');
    setBadge('ui-val-hsl-s', s + '%');
    setBadge('ui-val-hsl-l', l + '%');
    const rgb = hslToRgb(h, s, l);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    updateColorControlsFromHex(hex);
    runCmd(`set color ${hex}`);
  }

  if (slR) {
    slR.addEventListener('input', () => { const el = document.getElementById('ui-val-rgb-r'); if (el) el.textContent = slR.value; });
    slR.addEventListener('change', onRgbSliderChange);
  }
  if (slG) {
    slG.addEventListener('input', () => { const el = document.getElementById('ui-val-rgb-g'); if (el) el.textContent = slG.value; });
    slG.addEventListener('change', onRgbSliderChange);
  }
  if (slB) {
    slB.addEventListener('input', () => { const el = document.getElementById('ui-val-rgb-b'); if (el) el.textContent = slB.value; });
    slB.addEventListener('change', onRgbSliderChange);
  }
  if (slH) {
    slH.addEventListener('input', () => { const el = document.getElementById('ui-val-hsl-h'); if (el) el.textContent = slH.value + '°'; });
    slH.addEventListener('change', onHslSliderChange);
  }
  if (slS) {
    slS.addEventListener('input', () => { const el = document.getElementById('ui-val-hsl-s'); if (el) el.textContent = slS.value + '%'; });
    slS.addEventListener('change', onHslSliderChange);
  }
  if (slL) {
    slL.addEventListener('input', () => { const el = document.getElementById('ui-val-hsl-l'); if (el) el.textContent = slL.value + '%'; });
    slL.addEventListener('change', onHslSliderChange);
  }

  if (colorPicker) {
    colorPicker.addEventListener('input', () => {
      updateColorControlsFromHex(colorPicker.value);
    });
    colorPicker.addEventListener('change', () => {
      updateColorControlsFromHex(colorPicker.value);
      runCmd(`set color ${colorPicker.value}`);
    });
  }

  if (colorHex) {
    colorHex.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const v = colorHex.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
          updateColorControlsFromHex(v);
          runCmd(`set color ${v}`);
        }
      }
    });
    colorHex.addEventListener('blur', () => {
      const v = colorHex.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        updateColorControlsFromHex(v);
        runCmd(`set color ${v}`);
      }
    });
  }

    const addSwatchBtn = document.getElementById('ui-btn-add-swatch');
    if (addSwatchBtn) {
      addSwatchBtn.addEventListener('click', () => {
        const hex = colorHex ? colorHex.value.trim() : '';
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
          addCustomSwatch(hex);
          log(`Swatch ${hex} added [ok]`);
        }
      });
    }

    const delSwatchBtn = document.getElementById('ui-btn-del-swatch');
    if (delSwatchBtn) {
      delSwatchBtn.addEventListener('click', () => {
        swatchDeleteMode = !swatchDeleteMode;
        delSwatchBtn.classList.toggle('del-active', swatchDeleteMode);
        renderSwatches();
      });
    }

    // 4. Layers Buttons
    const addLayerBtn = document.getElementById('ui-btn-add-layer');
    if (addLayerBtn) {
      addLayerBtn.addEventListener('click', () => runCmd('new layer'));
    }
    const newGroupBtn = document.getElementById('ui-btn-new-group');
    if (newGroupBtn) {
      newGroupBtn.addEventListener('click', () => {
        const name = prompt('Folder name (or leave empty):', '');
        if (name !== null) {
          if (name.trim()) runCmd(`group new ${name.trim()}`);
          else runCmd('group new');
        }
      });
    }
    const dupLayerBtn = document.getElementById('ui-btn-duplicate-layer');
    if (dupLayerBtn) {
      dupLayerBtn.addEventListener('click', () => runCmd('duplicate layer'));
    }
    const clearLayerBtn = document.getElementById('ui-btn-clear-layer');
    if (clearLayerBtn) {
      clearLayerBtn.addEventListener('click', () => runCmd('clear layer'));
    }

  // View Navigation Controls
  const btnZoomIn = document.getElementById('ui-btn-zoom-in');
  if (btnZoomIn) btnZoomIn.addEventListener('click', () => runCmd('zoom in'));
  const btnZoomOut = document.getElementById('ui-btn-zoom-out');
  if (btnZoomOut) btnZoomOut.addEventListener('click', () => runCmd('zoom out'));
  const btnZoomFit = document.getElementById('ui-btn-zoom-fit');
  if (btnZoomFit) btnZoomFit.addEventListener('click', () => runCmd('zoom fit'));
  const btnZoom100 = document.getElementById('ui-btn-zoom-100');
  if (btnZoom100) btnZoom100.addEventListener('click', () => runCmd('zoom reset'));
  const btnResetPan = document.getElementById('ui-btn-reset-pan');
  if (btnResetPan) btnResetPan.addEventListener('click', () => runCmd('pan reset'));
  const btnResetRot = document.getElementById('ui-btn-reset-rot');
  if (btnResetRot) btnResetRot.addEventListener('click', () => runCmd('rotate reset'));
  const btnFlipH = document.getElementById('ui-btn-flip-h');
  if (btnFlipH) btnFlipH.addEventListener('click', () => runCmd('flip canvas'));
  const btnFlipV = document.getElementById('ui-btn-flip-v');
  if (btnFlipV) btnFlipV.addEventListener('click', () => runCmd('flip v'));

  // 5. Filters & Export
  const applyFilterBtn = document.getElementById('ui-btn-apply-filter');
  const filterSel = document.getElementById('ui-select-filter');
  const filterParamsContainer = document.getElementById('ui-ctrl-filter-params');
  const pluginInput = document.getElementById('ui-plugin-input');
  const btnLoadPlugin = document.getElementById('ui-btn-load-plugin');

  function populateFilterSelect() {
    if (filterSel) {
      const currentVal = filterSel.value;
      filterSel.innerHTML = '';

      for (const [name, p] of host.plugins.entries()) {
        if (p.type !== 'filter' && typeof p.module?.exports?.w_filter_apply !== 'function' && typeof p.module?.exports?.w_plugin_filter !== 'function') continue;
        const opt = document.createElement('option');
        opt.value = name;
        let label = name.charAt(0).toUpperCase() + name.slice(1);
        try {
          const info = p.module.getInfo();
          if (info && info.name) label = info.name;
        } catch (_) {}
        opt.textContent = label;
        filterSel.appendChild(opt);
      }

      if (currentVal && filterSel.querySelector(`option[value="${currentVal}"]`)) {
        filterSel.value = currentVal;
      }
      updateFilterControls();
    }

    const menuFiltersSubmenu = document.getElementById('menu-filters-submenu');
    if (menuFiltersSubmenu) {
      menuFiltersSubmenu.innerHTML = '';
      const filterEntries = [];
      for (const [name, p] of host.plugins.entries()) {
        if (p.type !== 'filter' && typeof p.module?.exports?.w_filter_apply !== 'function' && typeof p.module?.exports?.w_plugin_filter !== 'function') continue;
        let label = name.charAt(0).toUpperCase() + name.slice(1);
        try {
          const info = p.module.getInfo();
          if (info && info.name) label = info.name;
        } catch (_) {}
        filterEntries.push({ name, label });
      }

      filterEntries.sort((a, b) => a.label.localeCompare(b.label));

      filterEntries.forEach(({ name, label }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'menu-item btn-filter-trigger';
        btn.dataset.filter = name;
        btn.innerHTML = `<span>${label}</span>`;
        btn.addEventListener('click', () => {
          runCmd(`filter ${name}`);
        });
        menuFiltersSubmenu.appendChild(btn);
      });

      const div = document.createElement('div');
      div.className = 'menu-divider';
      menuFiltersSubmenu.appendChild(div);

      const btnImport = document.createElement('button');
      btnImport.type = 'button';
      btnImport.className = 'menu-item';
      btnImport.innerHTML = `<span>+ Import Filter (.wasm)...</span>`;
      btnImport.addEventListener('click', () => {
        const pInput = document.getElementById('ui-plugin-input');
        if (pInput) pInput.click();
      });
      menuFiltersSubmenu.appendChild(btnImport);

      const btnConfig = document.createElement('button');
      btnConfig.type = 'button';
      btnConfig.className = 'menu-item';
      btnConfig.innerHTML = `<span>Adjust Parameters...</span>`;
      btnConfig.addEventListener('click', () => {
        openSheet('sheet-filters');
      });
      menuFiltersSubmenu.appendChild(btnConfig);
    }
  }

  function updateFilterControls() {
    if (!filterSel || !filterParamsContainer) return;
    filterParamsContainer.innerHTML = '';
    const name = filterSel.value;
    if (!name) return;

    const p = host.plugins.get(name);
    if (!p || !p.module) return;

    let info = null;
    try {
      info = p.module.getInfo();
    } catch (_) {}

    const params = (info && Array.isArray(info.params)) ? info.params : [];
    if (params.length === 0) return;

    params.forEach((param, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'ip-touch-control';
      wrap.style.padding = '2px 4px';
      wrap.style.gap = '1px';

      const labelRow = document.createElement('div');
      labelRow.className = 'ip-touch-label-row';

      const lbl = document.createElement('span');
      const unit = param.unit ? ` (${param.unit})` : '';
      lbl.textContent = (param.name || param.id || `Param ${idx + 1}`) + unit;

      const valSpan = document.createElement('span');
      valSpan.className = 'ip-touch-val';
      const defVal = param.default !== undefined ? param.default : (param.min || 0);
      valSpan.textContent = String(defVal);

      labelRow.appendChild(lbl);
      labelRow.appendChild(valSpan);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'ip-touch-slider';
      slider.dataset.paramId = param.id || `p${idx}`;
      slider.min = param.min !== undefined ? param.min : 0;
      slider.max = param.max !== undefined ? param.max : 100;
      slider.step = param.step !== undefined ? param.step : 1;
      slider.value = defVal;

      slider.addEventListener('input', () => {
        valSpan.textContent = slider.value;
      });

      wrap.appendChild(labelRow);
      wrap.appendChild(slider);
      filterParamsContainer.appendChild(wrap);
    });
  }

  if (filterSel) {
    filterSel.addEventListener('change', updateFilterControls);
  }

  if (applyFilterBtn && filterSel) {
    applyFilterBtn.addEventListener('click', () => {
      const sliders = filterParamsContainer ? filterParamsContainer.querySelectorAll('input[type="range"]') : [];
      const args = Array.from(sliders).map(s => s.value);
      if (args.length > 0) {
        runCmd(`filter ${filterSel.value} ${args.join(' ')}`);
      } else {
        runCmd(`filter ${filterSel.value}`);
      }
    });
  }

  async function registerPluginFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.wasm')) {
      log('warn: only .wasm plugin files are supported', 'err');
      return;
    }
    const pluginName = file.name.replace(/\.wasm$/i, '').toLowerCase();
    try {
      const bytes = await file.arrayBuffer();
      const u8 = new Uint8Array(bytes);
      const mod = await EsenhoModule.fromBytes(u8, { name: pluginName });
      host.plugins.set(pluginName, { type: 'filter', module: mod, actor: mod });
      if (typeof EsenhoStore !== 'undefined' && EsenhoStore.savePlugin) {
        await EsenhoStore.savePlugin(pluginName, u8);
      }
      populateFilterSelect();
      if (filterSel) {
        filterSel.value = pluginName;
        updateFilterControls();
      }
      log(`Plugin "${pluginName}" loaded successfully [ok]`);
    } catch (e) {
      log(`err loading plugin ${file.name}: ${e.message}`, 'err');
    }
  }

  if (btnLoadPlugin && pluginInput) {
    btnLoadPlugin.addEventListener('click', () => pluginInput.click());
  }

  if (pluginInput) {
    pluginInput.addEventListener('change', () => {
      const file = pluginInput.files && pluginInput.files[0];
      if (file) registerPluginFile(file);
      pluginInput.value = '';
    });
  }

  populateFilterSelect();

  // 6. Layer Color Adjustments (HSV/HSL)
  const sliderHue = document.getElementById('ui-slider-hue');
  const valHue = document.getElementById('ui-val-hue');
  if (sliderHue && valHue) {
    sliderHue.addEventListener('input', () => {
      valHue.textContent = sliderHue.value + '°';
    });
  }
  const sliderSat = document.getElementById('ui-slider-sat');
  const valSat = document.getElementById('ui-val-sat');
  if (sliderSat && valSat) {
    sliderSat.addEventListener('input', () => {
      valSat.textContent = sliderSat.value + '%';
    });
  }
  const sliderBright = document.getElementById('ui-slider-bright');
  const valBright = document.getElementById('ui-val-bright');
  if (sliderBright && valBright) {
    sliderBright.addEventListener('input', () => {
      valBright.textContent = sliderBright.value + '%';
    });
  }
  const btnApplyHsv = document.getElementById('ui-btn-apply-hsv');
  if (btnApplyHsv) {
    btnApplyHsv.addEventListener('click', () => {
      const h = sliderHue ? parseInt(sliderHue.value, 10) || 0 : 0;
      const s = sliderSat ? parseInt(sliderSat.value, 10) || 0 : 0;
      const v = sliderBright ? parseInt(sliderBright.value, 10) || 0 : 0;
      runCmd(`adjust hsv ${h} ${s} ${v}`);
    });
  }
  const btnResetHsv = document.getElementById('ui-btn-reset-hsv');
  if (btnResetHsv) {
    btnResetHsv.addEventListener('click', () => {
      if (sliderHue) { sliderHue.value = '0'; if (valHue) valHue.textContent = '0°'; }
      if (sliderSat) { sliderSat.value = '0'; if (valSat) valSat.textContent = '0%'; }
      if (sliderBright) { sliderBright.value = '0'; if (valBright) valBright.textContent = '0%'; }
    });
  }

  const exportBtn = document.getElementById('ui-btn-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      runCmd('save canvas drawing.png');
    });
  }

  // Project & Autosave Storage Controls
  const btnSaveProject = document.getElementById('ui-btn-save-project');
  if (btnSaveProject) {
    btnSaveProject.addEventListener('click', async () => {
      await performAutosave(true);
      log(`Project autosaved [ok]`);
    });
  }

  const btnHome = document.getElementById('ui-btn-home');
  if (btnHome) {
    btnHome.addEventListener('click', async (e) => {
      e.preventDefault();
      await performAutosave(true);
      window.location.href = 'index.html';
    });
  }

  // Active Layer & Canvas Resize Controls
  const btnResizeCanvas = document.getElementById('ui-btn-resize-canvas');
  const inputCanvasW = document.getElementById('ui-canvas-w');
  const inputCanvasH = document.getElementById('ui-canvas-h');
  const chkLayerResample = document.getElementById('ui-layer-resample');
  if (btnResizeCanvas && inputCanvasW && inputCanvasH) {
    btnResizeCanvas.addEventListener('click', () => {
      const w = parseInt(inputCanvasW.value, 10);
      const h = parseInt(inputCanvasH.value, 10);
      const mode = (chkLayerResample && !chkLayerResample.checked) ? 'crop' : 'scale';
      if (w > 0 && h > 0) {
        runCmd(`layer resize ${w} ${h} ${mode}`);
      }
    });
  }

  document.querySelectorAll('.btn-res-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = btn.dataset.w;
      const h = btn.dataset.h;
      if (w && h) {
        if (inputCanvasW) inputCanvasW.value = w;
        if (inputCanvasH) inputCanvasH.value = h;
        const mode = (chkLayerResample && !chkLayerResample.checked) ? 'crop' : 'scale';
        runCmd(`layer resize ${w} ${h} ${mode}`);
      }
    });
  });

  const chkPixelGrid = document.getElementById('ui-chk-pixel-grid');
  const ipChkPixelGrid = document.getElementById('ip-chk-pixel-grid');
  host.showPixelGrid = localStorage.getItem('esenho_pixel_grid') === '1';
  const syncPixelGrid = (val) => {
    host.showPixelGrid = !!val;
    if (chkPixelGrid) chkPixelGrid.checked = host.showPixelGrid;
    if (ipChkPixelGrid) ipChkPixelGrid.checked = host.showPixelGrid;
    localStorage.setItem('esenho_pixel_grid', host.showPixelGrid ? '1' : '0');
    host.render();
  };
  if (chkPixelGrid) {
    chkPixelGrid.checked = !!host.showPixelGrid;
    chkPixelGrid.addEventListener('change', () => syncPixelGrid(chkPixelGrid.checked));
  }
  if (ipChkPixelGrid) {
    ipChkPixelGrid.checked = !!host.showPixelGrid;
    ipChkPixelGrid.addEventListener('change', () => syncPixelGrid(ipChkPixelGrid.checked));
  }

  const chkViewportFilter = document.getElementById('ui-chk-viewport-filter');
  const ipChkViewportFilter = document.getElementById('ip-chk-viewport-filter');
  host.viewportFiltering = localStorage.getItem('esenho_viewport_filter') === '1';
  const syncViewportFilter = (val, isUserAction = false) => {
    host.setViewportFiltering(val);
    if (chkViewportFilter) chkViewportFilter.checked = host.viewportFiltering;
    if (ipChkViewportFilter) ipChkViewportFilter.checked = host.viewportFiltering;
    const checkBilinear = document.getElementById('check-vfilter-bilinear');
    const checkNearest = document.getElementById('check-vfilter-nearest');
    if (checkBilinear) checkBilinear.style.opacity = host.viewportFiltering ? '1' : '0';
    if (checkNearest) checkNearest.style.opacity = host.viewportFiltering ? '0' : '1';
    if (canvasEl) canvasEl.style.imageRendering = host.viewportFiltering ? 'auto' : 'pixelated';
    if (uiCanvasEl) uiCanvasEl.style.imageRendering = host.viewportFiltering ? 'auto' : 'pixelated';
    localStorage.setItem('esenho_viewport_filter', host.viewportFiltering ? '1' : '0');
    if (isUserAction) {
      markCanvasDirty();
    } else {
      host.render();
    }
  };
  if (chkViewportFilter) {
    chkViewportFilter.checked = !!host.viewportFiltering;
    chkViewportFilter.addEventListener('change', () => syncViewportFilter(chkViewportFilter.checked, true));
  }
  if (ipChkViewportFilter) {
    ipChkViewportFilter.checked = !!host.viewportFiltering;
    ipChkViewportFilter.addEventListener('change', () => syncViewportFilter(ipChkViewportFilter.checked, true));
  }
  syncViewportFilter(host.viewportFiltering, false);

  const chkBrushOutline = document.getElementById('ui-chk-brush-outline');
  const ipChkBrushOutline = document.getElementById('ip-chk-brush-outline');
  host.showBrushOutline = localStorage.getItem('esenho_brush_outline') !== '0';
  const syncBrushOutline = (val) => {
    host.showBrushOutline = !!val;
    if (chkBrushOutline) chkBrushOutline.checked = host.showBrushOutline;
    if (ipChkBrushOutline) ipChkBrushOutline.checked = host.showBrushOutline;
    localStorage.setItem('esenho_brush_outline', host.showBrushOutline ? '1' : '0');
  };
  if (chkBrushOutline) {
    chkBrushOutline.checked = !!host.showBrushOutline;
    chkBrushOutline.addEventListener('change', () => syncBrushOutline(chkBrushOutline.checked));
  }
  if (ipChkBrushOutline) {
    ipChkBrushOutline.checked = !!host.showBrushOutline;
    ipChkBrushOutline.addEventListener('change', () => syncBrushOutline(ipChkBrushOutline.checked));
  }

  const chkTouchUndoRedo = document.getElementById('ui-chk-touch-undo-redo');
  const ipChkTouchUndoRedo = document.getElementById('ip-chk-touch-undo-redo');
  host.enableTouchUndoRedo = localStorage.getItem('esenho_touch_undo_redo') !== '0';
  const syncTouchUndoRedo = (val) => {
    host.enableTouchUndoRedo = !!val;
    if (chkTouchUndoRedo) chkTouchUndoRedo.checked = host.enableTouchUndoRedo;
    if (ipChkTouchUndoRedo) ipChkTouchUndoRedo.checked = host.enableTouchUndoRedo;
    localStorage.setItem('esenho_touch_undo_redo', host.enableTouchUndoRedo ? '1' : '0');
  };
  if (chkTouchUndoRedo) {
    chkTouchUndoRedo.checked = !!host.enableTouchUndoRedo;
    chkTouchUndoRedo.addEventListener('change', () => syncTouchUndoRedo(chkTouchUndoRedo.checked));
  }
  if (ipChkTouchUndoRedo) {
    ipChkTouchUndoRedo.checked = !!host.enableTouchUndoRedo;
    ipChkTouchUndoRedo.addEventListener('change', () => syncTouchUndoRedo(ipChkTouchUndoRedo.checked));
  }

  // Max undo history limit
  const sliderMaxUndo = document.getElementById('ui-slider-max-undo');
  const valMaxUndo = document.getElementById('ui-val-max-undo');
  const ipSliderMaxUndo = document.getElementById('ip-slider-max-undo');
  const ipValMaxUndo = document.getElementById('ip-val-max-undo');
  const savedMaxUndo = parseInt(localStorage.getItem('esenho_max_undo_steps'), 10);
  if (!isNaN(savedMaxUndo) && savedMaxUndo >= 0) {
    host.maxUndoSteps = savedMaxUndo;
  } else {
    host.maxUndoSteps = (host.maxUndoSteps !== undefined) ? host.maxUndoSteps : 25;
  }

  const syncMaxUndo = (val) => {
    if (val >= 0) {
      host.maxUndoSteps = val;
      if (host.undoStack && val > 0) {
        while (host.undoStack.length > host.maxUndoSteps) {
          host.undoStack.shift();
        }
      }
      const labelText = val === 0 ? 'Unlimited (∞)' : `${val} steps`;
      if (sliderMaxUndo) sliderMaxUndo.value = val;
      if (valMaxUndo) valMaxUndo.textContent = labelText;
      if (ipSliderMaxUndo) ipSliderMaxUndo.value = val;
      if (ipValMaxUndo) ipValMaxUndo.textContent = labelText;
      localStorage.setItem('esenho_max_undo_steps', val.toString());
    }
  };

  const initialUndoLabel = host.maxUndoSteps === 0 ? 'Unlimited (∞)' : `${host.maxUndoSteps} steps`;
  if (sliderMaxUndo) {
    sliderMaxUndo.value = host.maxUndoSteps;
    if (valMaxUndo) valMaxUndo.textContent = initialUndoLabel;
    sliderMaxUndo.addEventListener('input', () => syncMaxUndo(parseInt(sliderMaxUndo.value, 10)));
  }
  if (ipSliderMaxUndo) {
    ipSliderMaxUndo.value = host.maxUndoSteps;
    if (ipValMaxUndo) ipValMaxUndo.textContent = initialUndoLabel;
    ipSliderMaxUndo.addEventListener('input', () => syncMaxUndo(parseInt(ipSliderMaxUndo.value, 10)));
  }

  // Renderer Selection (GPU vs Software/CPU) & Power Saving Mode
  const selRenderer = document.getElementById('ui-select-renderer');
  const ipSelRenderer = document.getElementById('ip-select-renderer');
  const chkPowerSave = document.getElementById('ui-chk-power-save');
  const ipChkPowerSave = document.getElementById('ip-chk-power-save');
  const btnMenuPowerSave = document.getElementById('btn-menu-power-save');
  const checkPowerSave = document.getElementById('check-power-save');
  const initialRenderMode = (host.renderMode === 'cpu' || host.renderMode === 'software') ? 'cpu' : 'gpu';
  host.renderMode = initialRenderMode;

  const updateRendererBadge = () => {
    const label = document.getElementById('menu-current-renderer-label');
    if (label) {
      const base = host.renderMode === 'gpu' ? 'GPU' : 'CPU';
      label.textContent = host.powerSaveMode ? `${base} · ECO` : (host.renderMode === 'gpu' ? 'WEBGL 2 (GPU)' : 'SOFTWARE (CPU)');
    }
  };

  const syncPowerSaveMode = (enabled) => {
    host.powerSaveMode = !!enabled;
    host._forceNextFrame = true;
    if (chkPowerSave) chkPowerSave.checked = host.powerSaveMode;
    if (ipChkPowerSave) ipChkPowerSave.checked = host.powerSaveMode;
    if (checkPowerSave) checkPowerSave.style.opacity = host.powerSaveMode ? '1' : '0';
    updateRendererBadge();
    try {
      localStorage.setItem('esenho_power_save_v2', host.powerSaveMode ? '1' : '0');
    } catch (_) {}
    host.render();
  };
  host.setPowerSaveMode = syncPowerSaveMode;

  if (chkPowerSave) {
    chkPowerSave.checked = !!host.powerSaveMode;
    chkPowerSave.addEventListener('change', () => syncPowerSaveMode(chkPowerSave.checked));
  }
  if (ipChkPowerSave) {
    ipChkPowerSave.checked = !!host.powerSaveMode;
    ipChkPowerSave.addEventListener('change', () => syncPowerSaveMode(ipChkPowerSave.checked));
  }
  if (btnMenuPowerSave) {
    btnMenuPowerSave.addEventListener('click', () => syncPowerSaveMode(!host.powerSaveMode));
  }
  if (checkPowerSave) {
    checkPowerSave.style.opacity = host.powerSaveMode ? '1' : '0';
  }

  const syncRenderer = (mode) => {
    const cleanMode = (mode === 'cpu' || mode === 'software' || mode === 'canvas2d' || mode === '2d') ? 'cpu' : 'gpu';
    host.renderMode = cleanMode;
    if (selRenderer) selRenderer.value = cleanMode;
    if (ipSelRenderer) ipSelRenderer.value = cleanMode;
    const checkGpu = document.getElementById('check-engine-gpu');
    const checkSoftware = document.getElementById('check-engine-software');
    if (checkGpu) checkGpu.style.opacity = cleanMode === 'gpu' ? '1' : '0';
    if (checkSoftware) checkSoftware.style.opacity = cleanMode === 'cpu' ? '1' : '0';
    updateRendererBadge();
    try {
      localStorage.setItem('esenho_render_mode', cleanMode);
    } catch (_) {}
    if (cleanMode === 'gpu' && uiCtx && uiCanvasEl) {
      uiCtx.clearRect(0, 0, uiCanvasEl.width, uiCanvasEl.height);
    }
    imgData = null;
    host.render();
  };

  host.setRenderMode = syncRenderer;

  if (selRenderer) {
    selRenderer.value = host.renderMode;
    selRenderer.addEventListener('change', () => syncRenderer(selRenderer.value));
  }
  if (ipSelRenderer) {
    ipSelRenderer.value = host.renderMode;
    ipSelRenderer.addEventListener('change', () => syncRenderer(ipSelRenderer.value));
  }
  syncRenderer(host.renderMode);

  // Floating toolbar visibility & scale
  const chkFloatingToolbar = document.getElementById('ui-chk-floating-toolbar');
  const selToolbarScale = document.getElementById('ui-select-toolbar-scale');
  const valToolbarScale = document.getElementById('ui-val-toolbar-scale');
  const btnCloseToolbar = document.getElementById('tb-btn-close');

  function applyFloatingToolbarVisible(show) {
    host.showFloatingToolbar = !!show;
    if (touchToolbar) {
      touchToolbar.classList.toggle('hidden', !show);
    }
    if (chkFloatingToolbar) {
      chkFloatingToolbar.checked = !!show;
    }
    try {
      localStorage.setItem('esenho_show_floating_toolbar', show ? '1' : '0');
    } catch (_) {}
  }

  function applyFloatingToolbarScale(scaleVal) {
    let scale = parseFloat(scaleVal) || 1.0;
    scale = Math.max(0.4, Math.min(3.0, scale));
    host.floatingToolbarScale = scale;
    document.documentElement.style.setProperty('--touch-toolbar-scale', String(scale));
    if (valToolbarScale) {
      valToolbarScale.textContent = `${Math.round(scale * 100)}%`;
    }
    if (selToolbarScale) {
      const matchOpt = Array.from(selToolbarScale.options).find(o => Math.abs(parseFloat(o.value) - scale) < 0.001);
      if (matchOpt) {
        selToolbarScale.value = matchOpt.value;
      } else {
        const opt = document.createElement('option');
        opt.value = String(scale);
        opt.textContent = `Custom (${Math.round(scale * 100)}%)`;
        selToolbarScale.appendChild(opt);
        selToolbarScale.value = String(scale);
      }
    }
    try {
      localStorage.setItem('esenho_floating_toolbar_scale', String(scale));
    } catch (_) {}
  }

  host.setFloatingToolbarVisible = applyFloatingToolbarVisible;
  host.onFloatingToolbarVisibleChange = applyFloatingToolbarVisible;
  host.setFloatingToolbarScale = applyFloatingToolbarScale;
  host.onFloatingToolbarScaleChange = applyFloatingToolbarScale;

  if (chkFloatingToolbar) {
    chkFloatingToolbar.addEventListener('change', () => applyFloatingToolbarVisible(chkFloatingToolbar.checked));
  }
  if (selToolbarScale) {
    selToolbarScale.addEventListener('change', () => applyFloatingToolbarScale(selToolbarScale.value));
  }

  const savedToolbarShow = localStorage.getItem('esenho_show_floating_toolbar') !== '0';
  applyFloatingToolbarVisible(savedToolbarShow);

  const savedToolbarScale = localStorage.getItem('esenho_floating_toolbar_scale') || '1.0';
  applyFloatingToolbarScale(savedToolbarScale);


  // ── UI Scale / DPI Adaptation ──
  function getAutoUiScale() {
    const dpr = window.devicePixelRatio || 1;
    if (dpr >= 2.2) return 1.5;
    if (dpr >= 1.6) return 1.25;
    if (dpr >= 1.3) return 1.15;
    if (dpr <= 0.85) return 0.85;
    return 1.0;
  }

  function applyUiScale(scaleVal) {
    let effective = 1.0;
    const isAuto = (!scaleVal || scaleVal === 'auto');
    if (isAuto) {
      effective = getAutoUiScale();
    } else {
      let cleaned = String(scaleVal).trim();
      if (cleaned.endsWith('%')) {
        effective = parseFloat(cleaned) / 100;
      } else {
        effective = parseFloat(cleaned);
      }
      if (isNaN(effective) || effective < 0.5 || effective > 3.0) effective = 1.0;
    }

    document.documentElement.style.setProperty('--ui-scale', effective);

    const valEl = document.getElementById('ui-val-scale');
    if (valEl) {
      valEl.textContent = `${Math.round(effective * 100)}%${isAuto ? ' (auto)' : ''}`;
    }

    const selEl = document.getElementById('ui-select-scale');
    const selIpScale = document.getElementById('ip-select-ui-scale');
    [selEl, selIpScale].filter(Boolean).forEach(sEl => {
      if (isAuto) {
        sEl.value = 'auto';
      } else {
        const matchOpt = Array.from(sEl.options).find(o => o.value !== 'auto' && Math.abs(parseFloat(o.value) - effective) < 0.001);
        if (matchOpt) {
          sEl.value = matchOpt.value;
        } else {
          const opt = document.createElement('option');
          opt.value = String(effective);
          opt.textContent = `Custom (${Math.round(effective * 100)}%)`;
          sEl.appendChild(opt);
          sEl.value = String(effective);
        }
      }
    });

    try {
      localStorage.setItem('esenho_ui_scale', isAuto ? 'auto' : String(effective));
    } catch (_) {}

    setTimeout(() => {
      if (typeof resize === 'function') resize();
    }, 50);
  }

  host.onUiScaleChange = (val) => applyUiScale(val);

  const selScale = document.getElementById('ui-select-scale');
  if (selScale) {
    selScale.addEventListener('change', () => {
      host.setUiScale(selScale.value);
    });
  }

  const savedScale = localStorage.getItem('esenho_ui_scale') || 'auto';
  host.uiScale = savedScale;
  applyUiScale(savedScale);

  // File & Project / Image Import via File Picker & Drag-and-Drop
  let fileInput = document.getElementById('ui-file-input');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'ui-file-input';
    fileInput.accept = '.esen,.json,image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }

  async function handleFileImport(file) {
    if (!file) return;
    const lowerName = (file.name || '').toLowerCase();

    // 1. .esen / JSON project file
    if (lowerName.endsWith('.esen') || lowerName.endsWith('.json')) {
      try {
        let projData;
        if (typeof EsenhoStore !== 'undefined' && EsenhoStore && EsenhoStore.importEsenFile) {
          projData = await EsenhoStore.importEsenFile(file);
        } else {
          const text = await file.text();
          projData = JSON.parse(text);
        }
        if (projData && (projData.magic === 'ESENHO' || projData.magic === 'ESEN')) {
          host.loadProject(projData);
          syncUiFromHost();
          log(`Loaded project '${projData.name || file.name}' [ok]`);
          return;
        }
      } catch (err) {
        log(`err: failed importing project: ${err.message}`);
        return;
      }
    }

    // 2. SVG Asset Bundle (.bundle.svg or any bundle SVG)
    if (lowerName.endsWith('.svg')) {
      try {
        const text = await file.text();
        if (text.includes('data-esenho-bundle') || text.includes('<esenho-manifest>')) {
          if (typeof EsenhoBundle !== 'undefined') {
            const parsed = EsenhoBundle.parseBundle(text);
            if (parsed) {
              const res = await EsenhoBundle.importBundle(parsed);
              host.customBrushPresets = getCustomBrushPresets();
              populateBrushPresetsUI();
              log(`Imported Asset Bundle '${parsed.title}': ${res.brushes} brushes, ${res.plugins} plugins, ${res.textures} textures, ${res.tipShapes} tips, ${res.projects} projects [ok]`);
              return;
            }
          }
        }
      } catch (err) {
        log(`err: failed importing asset bundle: ${err.message}`);
      }
    }

    // 3. Image (PNG, JPG, WebP, etc.)
    if (file.type?.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|svg)$/i.test(lowerName)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            if (!host.canvasActor || !host.canvasActor.exports) return;
            const cw = host.canvasActor.exports.get_canvas_width();
            const ch = host.canvasActor.exports.get_canvas_height();
            const wasmId = host.canvasActor.exports.w_layer_add ? host.canvasActor.exports.w_layer_add() : -1;
            if (wasmId < 0) {
              log('err: cannot add layer for image (max layers reached)');
              return;
            }

            const off = document.createElement('canvas');
            off.width = cw;
            off.height = ch;
            const ctx = off.getContext('2d');
            const scale = Math.min(cw / img.width, ch / img.height, 1);
            const dw = Math.round(img.width * scale);
            const dh = Math.round(img.height * scale);
            const dx = Math.round((cw - dw) / 2);
            const dy = Math.round((ch - dh) / 2);
            ctx.drawImage(img, dx, dy, dw, dh);
            const imgData = ctx.getImageData(0, 0, cw, ch);

            const ptr = host.canvasActor.exports.w_layer_get_pixels(wasmId);
            if (ptr) {
              new Uint8Array(host.canvasActor.memory.buffer, ptr, cw * ch * 4).set(imgData.data);
            }

            const cleanName = file.name.replace(/\.[^/.]+$/, '').trim();
            if (!host.layerNames) host.layerNames = new Map();
            host.layerNames.set(wasmId, cleanName || `Image ${wasmId}`);

            host.canvasActor.exports.force_composite();
            syncUiFromHost();
            log(`Imported image '${file.name}' as layer [${wasmId}] (${cw}x${ch}) [ok]`);
          } catch (err) {
            log(`err: failed importing image: ${err.message}`);
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
      return;
    }

    // 3. WASM plugin
    if (lowerName.endsWith('.wasm')) {
      await registerPluginFile(file);
      return;
    }

    log(`err: unsupported file type '${file.name}'`);
  }

  const importBtn = document.getElementById('ui-btn-import');
  const importLayerBtn = document.getElementById('ui-btn-import-layer');
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
  }
  if (importLayerBtn && fileInput) {
    importLayerBtn.addEventListener('click', () => fileInput.click());
  }
  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        await handleFileImport(file);
      } finally {
        fileInput.value = '';
      }
    });
  }

  window.addEventListener('dragover', (e) => {
    const types = e.dataTransfer?.types;
    const hasFiles = types && (typeof types.includes === 'function' ? types.includes('Files') : Array.from(types).includes('Files'));
    if (!hasFiles) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  window.addEventListener('drop', async (e) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    for (let i = 0; i < files.length; i++) {
      await handleFileImport(files[i]);
    }
  });

  // 6. Master Sync Function
  let lastLayerOptionsCount = -1;
  let lastLayerTreeSig = '';
  let _lastSyncedActionMode = null;
  let _lastSyncedToolKey = null;
  let _lastSyncedSelMode = null;
  function syncUiFromHost() {
    if (!host.canvasActor || !host.canvasActor.exports) return;

    // 0. Action Mode
    const curActionMode = host.actionMode || (host.currentTool === 1 ? 'erase' : 'draw');
    if (_lastSyncedActionMode !== curActionMode) {
      _lastSyncedActionMode = curActionMode;
      document.querySelectorAll('.mode-btn, .ip-actionmode-card').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.actionmode === curActionMode);
      });
    }

    // Transform Action Bar (disabled; controls live in Tools & Modes panel)
    const xbar = document.getElementById('ip-transform-bar');
    if (xbar) xbar.style.display = 'none';

    // A. Tools & Selection Cards
    const mode = host.brushParams ? host.brushParams.mode : 0;
    const modeNames = ['brush', 'smudge', 'blend', 'fill', 'lasso_fill', 'picker', 'line', 'rect', 'ellipse', 'select_rect', 'lasso_select', 'magic_wand'];
    const curToolName = (host.actionMode === 'select' && typeof host.currentTool === 'string' && (host.currentTool.startsWith('select') || host.currentTool === 'lasso_select' || host.currentTool === 'magic_wand'))
      ? host.currentTool
      : (modeNames[mode] || 'brush');

    const toolKey = curToolName + ':' + (host.actionMode === 'vector' ? host.vectorSubTool : '');
    if (_lastSyncedToolKey !== toolKey) {
      _lastSyncedToolKey = toolKey;
      document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === curToolName);
      });

      document.querySelectorAll('#sheet-tools .ip-tool-card').forEach(card => {
        const t = card.dataset.tool;
        let active = false;
        if (host.actionMode === 'vector') {
          active = (t === 'pen_tool' && host.vectorSubTool === 'pen');
        } else if (host.actionMode === 'select') {
          active = (t === curToolName) || (t === 'brush_select' && curToolName === 'brush') || (t === 'select_rect' && curToolName === 'select');
        } else {
          active = (t === curToolName);
        }
        card.classList.toggle('active', active);
      });
    }

    const curSelMode = host.selectionMode || 'replace';
    if (_lastSyncedSelMode !== curSelMode) {
      _lastSyncedSelMode = curSelMode;
      document.querySelectorAll('.sel-mode-btn, #sheet-tools .ip-selmode-card, .ip-selbar-mode').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.selmode === curSelMode);
      });
    }

    // Sync Preset dropdowns
    const curPreset = host.activeBrush;
    const pSel = document.getElementById('ui-select-brush-preset');
    if (pSel && curPreset && document.activeElement !== pSel) pSel.value = curPreset;
    const dSel = document.getElementById('dock-select-brush-preset');
    if (dSel && curPreset && document.activeElement !== dSel) dSel.value = curPreset;
    const delPresetBtn = document.getElementById('ui-btn-del-preset');
    if (delPresetBtn) {
      const isCustomActive = host.customBrushPresets && host.customBrushPresets[curPreset];
      delPresetBtn.style.display = isCustomActive ? 'inline-block' : 'none';
    }

    const chkAdj = document.getElementById('ui-chk-adjacent');
    if (chkAdj && host.wandAdjacent !== undefined) {
      chkAdj.checked = host.wandAdjacent;
    }

    // B. Sliders
    if (host.brushParams) {
      const bp = host.brushParams;
      const setSlider = (id, valId, val, suf = '') => {
        const el = document.getElementById(id);
        if (!el || document.activeElement === el || val === undefined) return;
        const strVal = String(val);
        if (el._currentVal === strVal) return;
        el.value = val;
        el._currentVal = strVal;
        const v = document.getElementById(valId);
        if (v) v.textContent = val + suf;
      };
      setSlider('ui-slider-size', 'ui-val-size', bp.size);
      setSlider('ui-slider-opacity', 'ui-val-opacity', bp.opacity, '%');
      setSlider('ui-slider-hardness', 'ui-val-hardness', bp.hardness, '%');
      setSlider('ui-slider-flow', 'ui-val-flow', bp.flow, '%');
      setSlider('ui-slider-spacing', 'ui-val-spacing', bp.spacing, '%');
      setSlider('ui-slider-smoothing', 'ui-val-smoothing', bp.stabilization !== undefined ? bp.stabilization : (bp.smoothing || 0), '%');
      setSlider('ui-slider-midpoint', 'ui-val-midpoint', bp.midpoint !== undefined ? bp.midpoint : 50, '%');
      setSlider('ui-slider-angle', 'ui-val-angle', bp.angle, '°');
      setSlider('ui-slider-roundness', 'ui-val-roundness', bp.roundness, '%');
      setSlider('ui-slider-scatter', 'ui-val-scatter', bp.scatter, '%');
      setSlider('ui-slider-grain', 'ui-val-grain', bp.grain, '%');
      setSlider('ui-slider-smudge', 'ui-val-smudge', bp.smudge, '%');
      setSlider('ui-slider-wetness', 'ui-val-wetness', bp.wetness, '%');
      setSlider('ui-slider-tolerance', 'ui-val-tolerance', bp.tolerance);
      setSlider('ui-slider-tex-scale', 'ui-val-tex-scale', bp.texture_scale || 100, '%');
      setSlider('ui-slider-tex-rotate', 'ui-val-tex-rotate', bp.texture_rotate !== undefined ? bp.texture_rotate : (bp.texture_angle !== undefined ? bp.texture_angle : 0), '°');
      setSlider('ui-slider-tex-contrast', 'ui-val-tex-contrast', bp.texture_contrast !== undefined ? bp.texture_contrast : 100, '%');
      setSlider('ui-slider-velocity', 'ui-val-velocity', bp.velocity || 0, '%');
      setSlider('ui-slider-taper-in', 'ui-val-taper-in', bp.taper_in || 0, 'px');
      setSlider('ui-slider-fade', 'ui-val-fade', bp.fade || 0, 'px');
      setSlider('ui-slider-size-jitter', 'ui-val-size-jitter', bp.size_jitter || 0, '%');
      setSlider('ui-slider-angle-jitter', 'ui-val-angle-jitter', bp.angle_jitter || 0, '°');
      setSlider('ui-slider-opacity-jitter', 'ui-val-opacity-jitter', bp.opacity_jitter || 0, '%');
      setSlider('ui-slider-color-jitter', 'ui-val-color-jitter', bp.color_jitter || 0, '%');
      setSlider('ui-slider-depletion', 'ui-val-depletion', bp.depletion || 0, '%');
      setSlider('ui-slider-color-pickup', 'ui-val-color-pickup', bp.color_pickup || 0, '%');
      setSlider('ui-slider-dual-size', 'ui-val-dual-size', bp.dual_size !== undefined ? bp.dual_size : 100, '%');
      setSlider('ui-slider-dual-spacing', 'ui-val-dual-spacing', bp.dual_spacing !== undefined ? bp.dual_spacing : 10, '%');
      const dabBlendSel = document.getElementById('ui-select-dab-blend');
      if (dabBlendSel && bp.dab_blend !== undefined) {
        const blendNames = ['normal', 'multiply', 'screen', 'overlay', 'dodge', 'add'];
        dabBlendSel.value = blendNames[bp.dab_blend] || 'normal';
      }
      const chkAutoRot = document.getElementById('ui-chk-auto-rotate');
      if (chkAutoRot) chkAutoRot.checked = !!bp.auto_rotate;
      const chkPSize = document.getElementById('ui-chk-pressure-size');
      if (chkPSize) chkPSize.checked = bp.pressure_size !== undefined ? !!bp.pressure_size : true;
      const chkPFlow = document.getElementById('ui-chk-pressure-flow');
      if (chkPFlow) chkPFlow.checked = bp.pressure_flow !== undefined ? !!bp.pressure_flow : true;
      const chkTilt = document.getElementById('ui-chk-tilt-angle');
      if (chkTilt) chkTilt.checked = bp.tilt_angle !== undefined ? !!bp.tilt_angle : true;
      const chkSubpixel = document.getElementById('ui-chk-subpixel');
      if (chkSubpixel) chkSubpixel.checked = !!bp.subpixel;
      const symmetrySel = document.getElementById('ui-select-symmetry');
      if (symmetrySel && bp.symmetry !== undefined && document.activeElement !== symmetrySel) {
        symmetrySel.value = String(bp.symmetry);
      }
      const tipSel = document.getElementById('ui-select-tip');
      if (tipSel && bp.shape !== undefined && document.activeElement !== tipSel) {
        tipSel.value = String(bp.shape);
      }
      const grainSel = document.getElementById('ui-select-grain-tex');
      if (grainSel && document.activeElement !== grainSel) {
        grainSel.value = host.activeTexture || 'none';
      }
      const dualShapeSelEl = document.getElementById('ui-select-dual-shape');
      if (dualShapeSelEl && bp.dual_shape !== undefined && document.activeElement !== dualShapeSelEl) {
        dualShapeSelEl.value = String(bp.dual_shape);
      }
      const btnFlipH = document.getElementById('ui-btn-flip-h');
      if (btnFlipH) {
        btnFlipH.classList.toggle('active', !!host.flipH);
      }
      const btnFlipV = document.getElementById('ui-btn-flip-v');
      if (btnFlipV) {
        btnFlipV.classList.toggle('active', !!host.flipV);
      }
      const selScale = document.getElementById('ui-select-scale');
      if (selScale && host.uiScale) {
        selScale.value = host.uiScale;
      }
      const chkFT = document.getElementById('ui-chk-floating-toolbar');
      if (chkFT && host.showFloatingToolbar !== undefined) {
        chkFT.checked = !!host.showFloatingToolbar;
      }
      const chkDT = document.getElementById('ui-chk-dock-toolstrip');
      if (chkDT && host.showDockToolstrip !== undefined) {
        chkDT.checked = !!host.showDockToolstrip;
      }
      const selTS = document.getElementById('ui-select-toolbar-scale');
      if (selTS && host.floatingToolbarScale !== undefined && document.activeElement !== selTS) {
        selTS.value = String(host.floatingToolbarScale);
      }
    }

    // C. Color
    if (host.currentColor !== undefined) {
      const c = host.currentColor;
      const r = c & 0xFF;
      const g = (c >> 8) & 0xFF;
      const b = (c >> 16) & 0xFF;
      const hex = rgbToHex(r, g, b);
      updateColorControlsFromHex(hex);

      // Sync floating toolbar color swatch
      const tbSwatch = document.getElementById('tb-color-swatch');
      if (tbSwatch) tbSwatch.style.background = hex;

      // Sync touch color modal hex
      const tHex = document.getElementById('touch-color-hex');
      if (tHex) tHex.textContent = hex.toUpperCase();
    }

    // Sync modular dock toolbars (dials, active tools, modes, swatch, presets)
    if (typeof syncModularToolbars === 'function') {
      syncModularToolbars();
    }

    const inpProj = document.getElementById('ui-project-name');
    if (inpProj && document.activeElement !== inpProj && host.currentProjectName) {
      inpProj.value = host.currentProjectName;
    }

    // D. Canvas Size (Active Layer)
    const curW = host.canvasActor.exports.get_canvas_width ? host.canvasActor.exports.get_canvas_width() : 0;
    const curH = host.canvasActor.exports.get_canvas_height ? host.canvasActor.exports.get_canvas_height() : 0;
    const activeDraw = host.canvasActor.exports.get_active_layer ? host.canvasActor.exports.get_active_layer() : 0;
    const badgeCanvasSize = document.getElementById('ui-val-canvas-size');
    if (badgeCanvasSize && curW && curH) {
      badgeCanvasSize.textContent = `[${activeDraw}] ${curW} x ${curH}`;
    }
    const inpW = document.getElementById('ui-canvas-w');
    const inpH = document.getElementById('ui-canvas-h');
    if (inpW && document.activeElement !== inpW && curW) {
      inpW.value = curW;
    }
    if (inpH && document.activeElement !== inpH && curH) {
      inpH.value = curH;
    }

    // E. Layers, Shapes & Textures Sync (All Layers are Entities)
    const count = host.canvasActor.exports.get_layer_count ? host.canvasActor.exports.get_layer_count() : 0;
    const shapeId = host.brushParams ? host.brushParams.shape : 0;
    const activeTex = host.activeTexture || 'none';

    // Populate Unified Shape Dropdown (All Layers) - only if count changed
    if (shapeSel) {
      if (lastLayerOptionsCount !== count) {
        shapeSel.innerHTML = '';
        for (let i = 0; i < count; i++) {
          let name = `layer_${i}`;
          if (host.textures) {
            for (const [k, v] of host.textures.entries()) {
              if (v.wasmId === i) { name = k; break; }
            }
          }
          const w = host.canvasActor.exports.w_layer_get_width ? host.canvasActor.exports.w_layer_get_width(i) : 0;
          const h = host.canvasActor.exports.w_layer_get_height ? host.canvasActor.exports.w_layer_get_height(i) : 0;
          const dimStr = (w && h) ? ` (${w}x${h})` : '';
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = `[${i}] ${name}${dimStr}`;
          shapeSel.appendChild(opt);
        }
      }
      const builtins = ['circle', 'square', 'chisel'];
      let activeShapeName = builtins[shapeId] || `layer_${shapeId}`;
      if (host.textures) {
        for (const [k, v] of host.textures.entries()) {
          if (v.wasmId === shapeId) { activeShapeName = k; break; }
        }
      }
      if (document.activeElement !== shapeSel) shapeSel.value = activeShapeName;
    }

    // Populate Unified Texture Dropdown (All Layers + None)
    if (texSel) {
      if (lastLayerOptionsCount !== count) {
        texSel.innerHTML = '';
        const optNone = document.createElement('option');
        optNone.value = 'none';
        optNone.textContent = 'None (no texture)';
        texSel.appendChild(optNone);

        for (let i = 0; i < count; i++) {
          let name = `layer_${i}`;
          if (host.textures) {
            for (const [k, v] of host.textures.entries()) {
              if (v.wasmId === i) { name = k; break; }
            }
          }
          const w = host.canvasActor.exports.w_layer_get_width ? host.canvasActor.exports.w_layer_get_width(i) : 0;
          const h = host.canvasActor.exports.w_layer_get_height ? host.canvasActor.exports.w_layer_get_height(i) : 0;
          const dimStr = (w && h) ? ` (${w}x${h})` : '';
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = `[${i}] ${name}${dimStr}`;
          texSel.appendChild(opt);
        }
      }
      if (document.activeElement !== texSel) texSel.value = activeTex;
    }

    // Populate Unified Dual Shape Dropdown (All Layers + None)
    if (dualShapeSel) {
      if (lastLayerOptionsCount !== count) {
        dualShapeSel.innerHTML = '';
        const optNone = document.createElement('option');
        optNone.value = 'none';
        optNone.textContent = 'None (no dual brush)';
        dualShapeSel.appendChild(optNone);

        for (let i = 0; i < count; i++) {
          let name = `layer_${i}`;
          if (host.textures) {
            for (const [k, v] of host.textures.entries()) {
              if (v.wasmId === i) { name = k; break; }
            }
          }
          const w = host.canvasActor.exports.w_layer_get_width ? host.canvasActor.exports.w_layer_get_width(i) : 0;
          const h = host.canvasActor.exports.w_layer_get_height ? host.canvasActor.exports.w_layer_get_height(i) : 0;
          const dimStr = (w && h) ? ` (${w}x${h})` : '';
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = `[${i}] ${name}${dimStr}`;
          dualShapeSel.appendChild(opt);
        }
      }
      const dualShapeId = host.brushParams ? host.brushParams.dual_shape : -1;
      const builtins = ['circle', 'square', 'chisel'];
      let activeDualName = dualShapeId === -1 ? 'none' : (builtins[dualShapeId] || `layer_${dualShapeId}`);
      if (dualShapeId !== -1 && host.textures) {
        for (const [k, v] of host.textures.entries()) {
          if (v.wasmId === dualShapeId) { activeDualName = k; break; }
        }
      }
      if (document.activeElement !== dualShapeSel) dualShapeSel.value = activeDualName;
    }

    lastLayerOptionsCount = count;

    // Sync active layer opacity slider (Photoshop style)
    const curActiveOp = (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.get_layer_opacity)
      ? host.canvasActor.exports.get_layer_opacity(activeDraw) : 255;
    const curActivePct = Math.round((curActiveOp / 255) * 100);
    if (activeLayerOp && document.activeElement !== activeLayerOp) {
      activeLayerOp.value = curActivePct;
      if (activeLayerOpVal) activeLayerOpVal.textContent = curActivePct + '%';
    }

    // Render Layers List (Photoshop-like hierarchical layer & folder tree + Drag-and-Drop + Reordering + Stacking order sync)
    const layersList = document.getElementById('ui-layers-list');
    const ipSheetLayersList = document.getElementById('ip-sheet-layers-list');
    const layerContainers = [layersList, ipSheetLayersList].filter(Boolean);
    const orderCount = (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.w_layer_get_order_count)
      ? host.canvasActor.exports.w_layer_get_order_count()
      : count;

    let wasmOrderStr = '';
    if (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.w_layer_get_order) {
      const arr = [];
      for (let i = 0; i < orderCount; i++) arr.push(host.canvasActor.exports.w_layer_get_order(i));
      wasmOrderStr = arr.join(',');
    }

    const layerProps = [];
    for (let i = 0; i < count; i++) {
      const vis = host.canvasActor?.exports?.w_layer_get_visible ? host.canvasActor.exports.w_layer_get_visible(i) : 1;
      const lock = host.canvasActor?.exports?.w_layer_get_alpha_lock ? host.canvasActor.exports.w_layer_get_alpha_lock(i) : 0;
      const clip = host.canvasActor?.exports?.w_layer_get_clipping ? host.canvasActor.exports.w_layer_get_clipping(i) : 0;
      const bm = host.canvasActor?.exports?.w_layer_get_blend_mode ? host.canvasActor.exports.w_layer_get_blend_mode(i) : 0;
      const op = host.canvasActor?.exports?.get_layer_opacity ? host.canvasActor.exports.get_layer_opacity(i) : 255;
      const name = host.layerNames?.get(i) || '';
      const isVec = host.isVectorLayer && host.isVectorLayer(i) ? 1 : 0;
      const vecCnt = isVec && host.getVectorLayer(i)?.paths ? host.getVectorLayer(i).paths.length : 0;
      layerProps.push(`${i}:${vis}:${lock}:${clip}:${bm}:${op}:${name}:${isVec}:${vecCnt}`);
    }

    const groupProps = [];
    if (host.layerGroups instanceof Map) {
      for (const g of host.layerGroups.values()) {
        const ch = Array.isArray(g.children)
          ? g.children.map(c => typeof c === 'object' && c !== null ? `${c.type}:${c.id}` : String(c)).join(',')
          : '';
        groupProps.push(`${g.id}:${g.name}:${g.collapsed ? 1 : 0}:${g.visible ? 1 : 0}:${g.parentId || ''}:[${ch}]`);
      }
    }

    const treeStructure = host.layerTree ? JSON.stringify(host.layerTree) : '';
    const currentTreeSig = `${count}|${orderCount}|${wasmOrderStr}|${layerProps.join(';')}|${groupProps.join(';')}|${treeStructure}`;

    const isAnyContainerEmpty = layerContainers.some(c => c.children.length === 0);
    if (layerContainers.length > 0) {
      if (currentTreeSig === lastLayerTreeSig && !isAnyContainerEmpty) {
        // Fast update without DOM destruction
        layerContainers.forEach(container => {
          container.querySelectorAll('.ui-layer-row').forEach(row => {
            const lid = parseInt(row.getAttribute('data-layer-id'), 10);
            row.classList.toggle('active-draw', lid === activeDraw);
          });
        });
      } else {
        lastLayerTreeSig = currentTreeSig;
        host.ensureTreeIntegrity();

        const renderLayerTreeToContainer = (targetContainer) => {
        if (!targetContainer) return;
        targetContainer.innerHTML = '';

        let layerDragSource = null; // { type: 'layer'|'group', id: number|string }
        let touchReorderState = null;

        const clearDropIndicators = () => {
          targetContainer.querySelectorAll('.drop-indicator-top, .drop-indicator-bottom, .drop-target-group').forEach(el => {
            el.classList.remove('drop-indicator-top', 'drop-indicator-bottom', 'drop-target-group');
          });
        };

      const attachTouchReorder = (el, type, id) => {
        let timer = null;
        let startX = 0, startY = 0;
        el.style.webkitTouchCallout = 'none';
        el.style.userSelect = 'none';
        el.style.webkitUserSelect = 'none';

        el.addEventListener('touchstart', (e) => {
          if (e.touches.length !== 1) return;
          if (e.target.closest('button, input, select, .layer-slider, .layer-op-slider')) return;
          el.draggable = false;
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;

          timer = setTimeout(() => {
            timer = null;
            touchReorderState = { type, id, startEl: el, lastTarget: null, lastDropPos: null };
            layerDragSource = { type, id };
            el.classList.add('touch-reordering');
            triggerHaptic(20);
          }, 300);
        }, { passive: true });

        el.addEventListener('touchmove', (e) => {
          if (timer) {
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if (Math.hypot(dx, dy) > 10) {
              clearTimeout(timer);
              timer = null;
            }
          }
          if (touchReorderState && touchReorderState.id === id) {
            if (e.cancelable) e.preventDefault();
            const touchX = e.touches[0].clientX;
            const touchY = e.touches[0].clientY;

            // Temporarily ignore dragged element so document.elementFromPoint hits the layer/group below
            const prevPE = el.style.pointerEvents;
            el.style.pointerEvents = 'none';
            const targetEl = document.elementFromPoint(touchX, touchY);
            el.style.pointerEvents = prevPE;

            const row = targetEl?.closest('.ui-layer-row, .ui-layer-group-header');
            clearDropIndicators();
            if (row && row !== el) {
              const rect = row.getBoundingClientRect();
              const relY = (touchY - rect.top) / rect.height;
              const isGroup = row.classList.contains('ui-layer-group-header');
              const targetId = isGroup ? row.getAttribute('data-group-id') : parseInt(row.getAttribute('data-layer-id'), 10);
              const targetType = isGroup ? 'group' : 'layer';

              let dropPos = 'inside';
              if (isGroup) {
                if (relY < 0.25) { dropPos = 'before'; row.classList.add('drop-indicator-top'); }
                else if (relY > 0.75) { dropPos = 'after'; row.classList.add('drop-indicator-bottom'); }
                else { dropPos = 'inside'; row.classList.add('drop-target-group'); }
              } else {
                if (relY < 0.5) { dropPos = 'before'; row.classList.add('drop-indicator-top'); }
                else { dropPos = 'after'; row.classList.add('drop-indicator-bottom'); }
              }
              touchReorderState.lastTarget = { type: targetType, id: targetId };
              touchReorderState.lastDropPos = dropPos;
            } else {
              touchReorderState.lastTarget = null;
              touchReorderState.lastDropPos = null;
            }
          }
        }, { passive: false });

        const finishTouch = () => {
          el.draggable = true;
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          if (touchReorderState && touchReorderState.id === id) {
            el.classList.remove('touch-reordering');
            clearDropIndicators();
            if (touchReorderState.lastTarget && touchReorderState.lastDropPos) {
              const tgt = touchReorderState.lastTarget;
              if (tgt.type !== touchReorderState.type || String(tgt.id) !== String(touchReorderState.id)) {
                host.reorderTreeItem(touchReorderState.type, touchReorderState.id, tgt.type, tgt.id, touchReorderState.lastDropPos);
                triggerHaptic(15);
                syncUiFromHost();
              }
            }
            touchReorderState = null;
            layerDragSource = null;
          }
        };

        el.addEventListener('touchend', finishTouch);
        el.addEventListener('touchcancel', finishTouch);
      };

      const openGroupContextMenu = (anchorOrEv, grpId) => {
        if (!window.contextMenuService) return;
        const grp = typeof grpId === 'object' && grpId !== null ? grpId : host.layerGroups?.get(grpId);
        if (!grp) return;
        const getAnchor = () => {
          if (anchorOrEv && typeof anchorOrEv.getBoundingClientRect === 'function') {
            const r = anchorOrEv.getBoundingClientRect();
            return { x: r.right, y: r.bottom + 2 };
          }
          return { x: anchorOrEv?.clientX || 120, y: anchorOrEv?.clientY || 120 };
        };
        const grpActions = [
          { type: 'header', title: `Folder: ${grp.name}` },
          { type: 'item', label: '+ Add Layer Inside Folder', action: () => {
            if (host.canvasActor?.exports?.w_layer_add) {
              const newLid = host.canvasActor.exports.w_layer_add();
              if (newLid >= 0) {
                host.addLayerToGroup(grp.id, newLid);
                grp.collapsed = false;
                syncUiFromHost();
                triggerHaptic(15);
              }
            }
          }},
          { type: 'item', label: '+ New Raster Layer', action: () => runCmd('layer add') },
          { type: 'item', label: '+ New Folder / Group', action: () => runCmd('group create') },
          { type: 'sep' },
          { type: 'item', label: (grp.visible ? '✓ ' : '') + 'Folder Visible', action: () => runCmd(`group toggle ${grp.id}`) },
          { type: 'item', label: 'Rename Folder...', action: () => {
            const newName = prompt('Rename folder:', grp.name);
            if (newName && newName.trim()) {
              grp.name = newName.trim();
              syncUiFromHost();
            }
          }},
          { type: 'sep' },
          { type: 'item', label: '▲ Move Folder Up', action: () => runCmd(`group move up ${grp.id}`) },
          { type: 'item', label: '▼ Move Folder Down', action: () => runCmd(`group move down ${grp.id}`) },
          { type: 'sep' },
          { type: 'item', label: 'Delete Folder...', danger: true, action: () => {
            const hasChildren = (grp.children && grp.children.length > 0);
            if (!hasChildren) {
              runCmd(`group delete ${grp.id}`);
            } else {
              const delContent = confirm(`Delete folder '${grp.name}' AND all layers inside? (Click Cancel to delete folder only)`);
              host.deleteGroup(grp.id, delContent);
              syncUiFromHost();
            }
          }}
        ];
        window.contextMenuService.showContextMenu({
          getAnchor,
          getActions: () => grpActions
        });
      };

      const createGroupHeader = (grp, depth = 0, parentGroup = null) => {
        const grpRow = document.createElement('div');
        grpRow.className = 'ui-layer-group-header' + (grp.collapsed ? ' group-collapsed' : '');
        grpRow.style.paddingLeft = `${6 + depth * 16}px`;
        grpRow.title = `Folder: ${grp.name} (${(grp.children || []).length} items)`;
        grpRow.setAttribute('data-group-id', grp.id);

        attachTouchReorder(grpRow, 'group', grp.id);

        // HTML5 Drag & Drop
        grpRow.draggable = true;
        grpRow.addEventListener('dragstart', (e) => {
          layerDragSource = { type: 'group', id: grp.id };
          grpRow.classList.add('is-dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', grp.id);
          e.stopPropagation();
        });
        grpRow.addEventListener('dragend', () => {
          layerDragSource = null;
          clearDropIndicators();
          grpRow.classList.remove('is-dragging');
        });

        grpRow.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!layerDragSource) return;
          if (layerDragSource.type === 'group' && layerDragSource.id === grp.id) return;
          const rect = grpRow.getBoundingClientRect();
          const relY = (e.clientY - rect.top) / rect.height;
          clearDropIndicators();
          if (relY < 0.25) {
            grpRow.classList.add('drop-indicator-top');
          } else if (relY > 0.75) {
            grpRow.classList.add('drop-indicator-bottom');
          } else {
            grpRow.classList.add('drop-target-group');
          }
        });

        grpRow.addEventListener('dragleave', (e) => {
          if (!grpRow.contains(e.relatedTarget)) {
            grpRow.classList.remove('drop-indicator-top', 'drop-indicator-bottom', 'drop-target-group');
          }
        });

        grpRow.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!layerDragSource) return;
          if (layerDragSource.type === 'group' && layerDragSource.id === grp.id) return;
          const rect = grpRow.getBoundingClientRect();
          const relY = (e.clientY - rect.top) / rect.height;
          let dropPos = 'inside';
          if (relY < 0.25) dropPos = 'before';
          else if (relY > 0.75) dropPos = 'after';

          host.reorderTreeItem(layerDragSource.type, layerDragSource.id, 'group', grp.id, dropPos);
          clearDropIndicators();
          syncUiFromHost();
          triggerHaptic(15);
        });

        // 1. Collapse/Expand button
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'group-btn-collapse';
        toggleBtn.textContent = grp.collapsed ? '▸' : '▾';
        toggleBtn.title = grp.collapsed ? 'Expand folder' : 'Collapse folder';
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          grp.collapsed = !grp.collapsed;
          syncUiFromHost();
        });
        grpRow.appendChild(toggleBtn);

        // 2. Folder icon
        const iconSpan = document.createElement('span');
        iconSpan.style.fontSize = '12px';
        iconSpan.style.marginRight = '2px';
        iconSpan.textContent = grp.collapsed ? '📁' : '📂';
        grpRow.appendChild(iconSpan);

        // 3. Group Name (click toggles, double-click renames)
        const titleSpan = document.createElement('span');
        titleSpan.className = 'group-title';
        titleSpan.textContent = grp.name;
        titleSpan.addEventListener('click', () => {
          grp.collapsed = !grp.collapsed;
          syncUiFromHost();
        });
        titleSpan.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const newName = prompt('Rename folder:', grp.name);
          if (newName && newName.trim()) {
            grp.name = newName.trim();
            syncUiFromHost();
          }
        });
        grpRow.appendChild(titleSpan);

        // 4. Group Visibility toggle
        const grpVisBtn = document.createElement('button');
        grpVisBtn.type = 'button';
        grpVisBtn.className = 'layer-btn-vis' + (grp.visible ? '' : ' hidden');
        grpVisBtn.textContent = grp.visible ? '◉' : '—';
        grpVisBtn.title = grp.visible ? 'Hide folder' : 'Show folder';
        grpVisBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`group toggle ${grp.id}`);
        });
        grpRow.appendChild(grpVisBtn);

        // 5. Folder '⋯' Contextual Menu button
        const moreGrpBtn = document.createElement('button');
        moreGrpBtn.type = 'button';
        moreGrpBtn.className = 'layer-btn-action layer-btn-more';
        moreGrpBtn.textContent = '⋯';
        moreGrpBtn.title = `Folder options for '${grp.name}'`;
        moreGrpBtn.style.fontWeight = 'bold';
        moreGrpBtn.style.padding = '0 6px';
        moreGrpBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openGroupContextMenu(moreGrpBtn, grp.id);
        });
        grpRow.appendChild(moreGrpBtn);

        grpRow.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openGroupContextMenu(e, grp.id);
        });

        return grpRow;
      };

      const BLEND_MODE_NAMES = [
        { val: 0, short: 'Norm', label: 'Normal' },
        { val: 1, short: 'Mult', label: 'Multiply' },
        { val: 2, short: 'Scrn', label: 'Screen' },
        { val: 3, short: 'Over', label: 'Overlay' },
        { val: 4, short: 'Ddg', label: 'Color Dodge' },
        { val: 5, short: 'Add', label: 'Linear Dodge (Add)' }
      ];

      const openLayerContextMenu = (anchorOrEv, i, name, vis, alphaLock, clipping, blendMode, parentGroup) => {
        const curDraw = host.canvasActor?.exports?.get_active_draw_layer ? host.canvasActor.exports.get_active_draw_layer() : null;
        if (curDraw !== i && host.canvasActor?.exports?.w_layer_select) {
          host.canvasActor.exports.w_layer_select(i);
          document.querySelectorAll('.ui-layer-row').forEach(row => {
            const lid = parseInt(row.getAttribute('data-layer-id'), 10);
            row.classList.toggle('active-draw', lid === i);
          });
        }
        if (!window.contextMenuService) return;
        if (name === undefined) {
          if (i === 3) name = 'Background';
          else if (host.layerNames && host.layerNames.has(i)) name = host.layerNames.get(i);
          else name = `layer_${i}`;
        }
        if (vis === undefined) {
          vis = host.canvasActor?.exports?.w_layer_get_visible ? host.canvasActor.exports.w_layer_get_visible(i) : 1;
        }
        if (alphaLock === undefined) {
          alphaLock = host.getLayerAlphaLock ? host.getLayerAlphaLock(i) : 0;
        }
        if (clipping === undefined) {
          clipping = host.getLayerClipping ? host.getLayerClipping(i) : 0;
        }
        if (blendMode === undefined) {
          blendMode = host.getLayerBlendMode ? host.getLayerBlendMode(i) : 0;
        }
        const getAnchor = () => {
          if (anchorOrEv && typeof anchorOrEv.getBoundingClientRect === 'function') {
            const r = anchorOrEv.getBoundingClientRect();
            return { x: r.right, y: r.bottom + 2 };
          }
          return { x: anchorOrEv?.clientX || 120, y: anchorOrEv?.clientY || 120 };
        };
        const isVecApp = !!window.ESENHO_VECTOR_PAINTER_MODE;
        const isVecLyr = isVecApp && host.isVectorLayer && host.isVectorLayer(i);
        const curBlendObj = BLEND_MODE_NAMES.find(b => b.val === blendMode) || BLEND_MODE_NAMES[0];
        const curOpRaw = host.canvasActor?.exports?.get_layer_opacity ? host.canvasActor.exports.get_layer_opacity(i) : 255;
        const curOpPct = Math.round((curOpRaw / 255) * 100);
        const blendChildren = BLEND_MODE_NAMES.map(b => ({
          type: 'item',
          label: (b.val === blendMode ? '✓ ' : '') + b.label,
          action: () => runCmd(`layer blend ${i} ${b.val}`)
        }));

        const layerActions = [
          { type: 'header', title: isVecLyr ? `◆ Vector Layer #${i}: ${name}` : `Layer #${i}: ${name}` },
          {
            type: 'slider',
            label: 'Opacity',
            min: 0,
            max: 100,
            step: 1,
            value: curOpPct,
            format: (v) => `${Math.round(v)}%`,
            onChange: (v) => {
              const rawOp = Math.round((v / 100) * 255);
              runCmd(`layer opacity ${i} ${rawOp}`);
              const opBadge = document.getElementById(`layer-op-text-${i}`);
              if (opBadge) opBadge.textContent = `${Math.round(v)}%`;
            }
          },
          {
            type: 'item',
            label: `Blend Mode: ${curBlendObj.label}`,
            children: blendChildren
          },
          { type: 'item', label: (vis ? '✓ ' : '') + 'Visible', action: () => runCmd(`toggle layer ${i}`) }
        ];
        if (!isVecLyr) {
          layerActions.push(
            { type: 'item', label: (alphaLock ? '✓ ' : '') + 'Alpha Lock (⚿)', action: () => runCmd(`layer alpha_lock ${i} ${alphaLock ? 'off' : 'on'}`) }
          );
        }
        layerActions.push(
          { type: 'item', label: (clipping ? '✓ ' : '') + 'Clipping Mask (⮑)', action: () => runCmd(`layer clipping ${i} ${clipping ? 'off' : 'on'}`) },
          { type: 'sep' },
          { type: 'item', label: '+ New Raster Layer', action: () => runCmd('layer add') },
          ...(isVecApp ? [{ type: 'item', label: '+ New Vector Layer', action: () => document.getElementById('btn-ip-add-vector-layer')?.click() }] : []),
          { type: 'item', label: '+ New Folder / Group', action: () => runCmd('group create') },
          { type: 'item', label: 'Import Image as Layer...', action: () => { fileInput?.click(); } },
          { type: 'sep' },
          { type: 'item', label: 'Rename Layer...', action: () => {
            const newName = prompt(`Rename layer #${i}:`, name);
            if (newName && newName.trim()) {
              if (!host.layerNames) host.layerNames = new Map();
              host.layerNames.set(i, newName.trim());
              syncUiFromHost();
            }
          }},
          { type: 'item', label: 'Duplicate Layer', action: () => runCmd(`layer duplicate ${i}`) },
          { type: 'item', label: 'Merge Down', action: () => runCmd(`layer merge_down ${i}`) }
        );
        if (!isVecLyr) {
          layerActions.push(
            { type: 'item', label: 'Invert Layer Colors', action: () => runCmd(`layer invert ${i}`) }
          );
        }
        layerActions.push({ type: 'sep' });

        if (parentGroup) {
          layerActions.push(
            { type: 'item', label: 'Move Out of Folder', action: () => runCmd(`group remove ${i}`) },
            { type: 'sep' }
          );
        } else if (host.layerGroups && host.layerGroups.size > 0) {
          const grpList = Array.from(host.layerGroups.values());
          const grpChildren = grpList.map(g => ({
            type: 'item',
            label: `📁 ${g.name}`,
            action: () => runCmd(`group add ${g.id} ${i}`)
          }));
          layerActions.push(
            {
              type: 'item',
              label: 'Move to Folder',
              children: grpChildren
            },
            { type: 'sep' }
          );
        }

        if (isVecApp && isVecLyr) {
          layerActions.push(
            { type: 'item', label: 'Edit Vector Nodes on Layer', action: () => {
              host.vectorSubTool = 'nodes';
              host.setActionMode('vector');
              markCanvasDirty();
              syncUiFromHost();
            }},
            { type: 'item', label: 'Export Vector SVG (.svg)', action: () => {
              document.getElementById('btn-ip-vecbar-export-svg')?.click();
            }},
            { type: 'sep' }
          );
        }

        layerActions.push(
          { type: 'item', label: isVecLyr ? 'Clear Vector Layer' : 'Clear Layer', danger: true, action: () => runCmd('clear') },
          { type: 'item', label: 'Delete Layer', danger: true, action: () => {
            if (confirm(`Delete layer [${i}] ${name}?`)) runCmd(`delete layer ${i}`);
          }}
        );

        window.contextMenuService.showContextMenu({
          getAnchor,
          getActions: () => layerActions
        });
      };

      host.openLayerContextMenu = openLayerContextMenu;
      host.openGroupContextMenu = openGroupContextMenu;
      host.BLEND_MODE_NAMES = BLEND_MODE_NAMES;
      host.syncUiFromHost = syncUiFromHost;
      host.runCmd = runCmd;

      const renderLayerRow = (i, depth = 0, parentGroup = null) => {
        const vis = host.canvasActor.exports.get_layer_visible ? host.canvasActor.exports.get_layer_visible(i) : 1;
        const op = host.canvasActor.exports.get_layer_opacity ? host.canvasActor.exports.get_layer_opacity(i) : 255;
        const w = host.canvasActor.exports.w_layer_get_width ? host.canvasActor.exports.w_layer_get_width(i) : 0;
        const h = host.canvasActor.exports.w_layer_get_height ? host.canvasActor.exports.w_layer_get_height(i) : 0;
        const opPct = Math.round((op / 255) * 100);
        const alphaLock = host.getLayerAlphaLock ? host.getLayerAlphaLock(i) : 0;
        const clipping = host.getLayerClipping ? host.getLayerClipping(i) : 0;
        const blendMode = host.getLayerBlendMode ? host.getLayerBlendMode(i) : 0;

        let name = `layer_${i}`;
        if (i === 3) {
          name = 'Background';
        } else if (host.layerNames && host.layerNames.has(i)) {
          name = host.layerNames.get(i);
        } else if (host.textures) {
          for (const [k, v] of host.textures.entries()) {
            if (v.wasmId === i) { name = k; break; }
          }
        }

        const isDraw = (i === activeDraw);

        const row = document.createElement('div');
        row.className = 'ui-layer-row' + (isDraw ? ' active-draw' : '') + (parentGroup ? ' ui-layer-in-group' : '') + (clipping ? ' clipped-layer' : '');
        row.style.paddingLeft = `${6 + depth * 16}px`;
        row.title = `[${i}] ${name} (${w}×${h}) — Right-click for options, drag to reorder`;
        row.setAttribute('data-layer-id', i);

        attachTouchReorder(row, 'layer', i);

        // HTML5 Drag & Drop
        row.draggable = true;
        row.addEventListener('dragstart', (e) => {
          layerDragSource = { type: 'layer', id: i };
          row.classList.add('is-dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(i));
          e.stopPropagation();
        });
        row.addEventListener('dragend', () => {
          layerDragSource = null;
          clearDropIndicators();
          row.classList.remove('is-dragging');
        });

        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!layerDragSource) return;
          if (layerDragSource.type === 'layer' && layerDragSource.id === i) return;
          const rect = row.getBoundingClientRect();
          const relY = (e.clientY - rect.top) / rect.height;
          clearDropIndicators();
          if (relY < 0.5) {
            row.classList.add('drop-indicator-top');
          } else {
            row.classList.add('drop-indicator-bottom');
          }
        });

        row.addEventListener('dragleave', (e) => {
          if (!row.contains(e.relatedTarget)) {
            row.classList.remove('drop-indicator-top', 'drop-indicator-bottom');
          }
        });

        row.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!layerDragSource) return;
          if (layerDragSource.type === 'layer' && layerDragSource.id === i) return;
          const rect = row.getBoundingClientRect();
          const relY = (e.clientY - rect.top) / rect.height;
          const dropPos = relY < 0.5 ? 'before' : 'after';

          host.reorderTreeItem(layerDragSource.type, layerDragSource.id, 'layer', i, dropPos);
          clearDropIndicators();
          syncUiFromHost();
          triggerHaptic(15);
        });

        // 1. Visibility toggle (compact eye button)
        const visBtn = document.createElement('button');
        visBtn.type = 'button';
        visBtn.className = 'layer-btn-vis' + (vis ? '' : ' hidden');
        visBtn.textContent = vis ? '◉' : '—';
        visBtn.title = vis ? 'Hide layer' : 'Show layer';
        visBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`toggle layer ${i}`);
        });
        row.appendChild(visBtn);

        // 2. Info Cell (flex: 1; min-width: 0; click selects layer, double-click renames)
        const infoCell = document.createElement('div');
        infoCell.className = 'layer-cell-info';
        infoCell.style.flex = '1';
        infoCell.style.minWidth = '0';
        infoCell.style.cursor = 'pointer';
        const isVecLayerRow = host.isVectorLayer && host.isVectorLayer(i);
        const vecPathCount = isVecLayerRow && host.getVectorLayer(i)?.paths ? host.getVectorLayer(i).paths.length : 0;
        const vecBadgeHtml = isVecLayerRow
          ? `<span style="font-size:9px; background:#1d2021; color:#8ec07c; border:1px solid #8ec07c; border-radius:3px; padding:0 4px; margin-left:4px; font-weight:bold;" title="Editable Vector Layer (${vecPathCount} paths)">VEC</span>`
          : '';
        const blendObj = BLEND_MODE_NAMES.find(b => b.val === blendMode);
        const blendBadgeHtml = (blendMode !== 0 && blendObj)
          ? `<span style="font-size:9px; color:#d3869b; margin-left:4px;" title="Blend Mode: ${blendObj.label}">${blendObj.short}</span>`
          : '';
        const lockBadgeHtml = alphaLock
          ? `<span style="font-size:10px; color:#fabd2f; margin-left:3px;" title="Alpha Lock enabled">⚿</span>`
          : '';
        const clipBadgeHtml = clipping
          ? `<span style="font-size:10px; color:#83a598; margin-left:3px;" title="Clipping Mask enabled">⮑</span>`
          : '';
        infoCell.innerHTML = `
          <span class="layer-idx">#${i}</span>
          <span class="layer-name-text" title="${name}">${name}</span>
          ${vecBadgeHtml}${blendBadgeHtml}${lockBadgeHtml}${clipBadgeHtml}
        `;
        infoCell.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`layer select ${i}`);
        });
        infoCell.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const newName = prompt(`Rename layer #${i}:`, name);
          if (newName && newName.trim()) {
            if (!host.layerNames) host.layerNames = new Map();
            host.layerNames.set(i, newName.trim());
            syncUiFromHost();
          }
        });
        row.appendChild(infoCell);

        // 3. Clean Controls Cell: Opacity label + '⋯' Context Menu button
        const controlsCell = document.createElement('div');
        controlsCell.className = 'layer-cell-controls';

        const opCell = document.createElement('div');
        opCell.className = 'layer-cell-op';
        opCell.id = `layer-op-text-${i}`;
        opCell.textContent = `${opPct}%`;
        controlsCell.appendChild(opCell);

        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'layer-btn-action layer-btn-more';
        moreBtn.textContent = '⋯';
        moreBtn.title = `Layer options for [${i}] ${name}`;
        moreBtn.style.fontWeight = 'bold';
        moreBtn.style.padding = '0 6px';
        moreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openLayerContextMenu(moreBtn, i, name, vis, alphaLock, clipping, blendMode, parentGroup);
        });
        controlsCell.appendChild(moreBtn);

        row.appendChild(controlsCell);

        row.addEventListener('click', () => {
          runCmd(`layer select ${i}`);
        });

        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openLayerContextMenu(e, i, name, vis, alphaLock, clipping, blendMode, parentGroup);
        });

        return row;
      };

      // Recursive tree rendering
      const texIds = host.getTextureWasmIds ? host.getTextureWasmIds() : new Set([0, 1, 2]);
      const renderTreeNode = (node, depth = 0, parentGroup = null) => {
        if (node.type === 'layer') {
          if (texIds.has(node.id)) return;
          const layerEl = renderLayerRow(node.id, depth, parentGroup);
          if (layerEl) targetContainer.appendChild(layerEl);
        } else if (node.type === 'group') {
          const grp = host.layerGroups.get(node.id);
          if (grp) {
            const grpHeader = createGroupHeader(grp, depth, parentGroup);
            targetContainer.appendChild(grpHeader);
            if (!grp.collapsed && Array.isArray(grp.children)) {
              for (const childNode of grp.children) {
                renderTreeNode(childNode, depth + 1, grp);
              }
            }
          }
        }
      };

      for (const rootNode of (host.layerTree || [])) {
        renderTreeNode(rootNode, 0, null);
      }

      if (!targetContainer._hasEmptyContextMenu) {
        targetContainer._hasEmptyContextMenu = true;
        const bindEmptyLayersMenu = (el) => {
          if (!el) return;
          el.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.ui-layer-row, .ui-layer-group-header')) return;
            e.preventDefault();
            e.stopPropagation();
            const curDraw = host.canvasActor?.exports?.get_active_draw_layer ? host.canvasActor.exports.get_active_draw_layer() : 3;
            const vis = host.canvasActor?.exports?.get_layer_visible ? host.canvasActor.exports.get_layer_visible(curDraw) : 1;
            const alphaLock = host.getLayerAlphaLock ? host.getLayerAlphaLock(curDraw) : 0;
            const clipping = host.getLayerClipping ? host.getLayerClipping(curDraw) : 0;
            const blendMode = host.getLayerBlendMode ? host.getLayerBlendMode(curDraw) : 0;
            const name = curDraw === 3 ? 'Background' : (host.layerNames?.get(curDraw) || `layer_${curDraw}`);
            openLayerContextMenu(e, curDraw, name, vis, alphaLock, clipping, blendMode, null);
          });
        };
        bindEmptyLayersMenu(targetContainer);
        bindEmptyLayersMenu(document.getElementById('dock-panel-layers'));
      }
    };

    layerContainers.forEach(container => renderLayerTreeToContainer(container));
  }
}

    if (chkPixelGrid) {
      chkPixelGrid.checked = !!host.showPixelGrid;
    }
    if (ipChkPixelGrid) {
      ipChkPixelGrid.checked = !!host.showPixelGrid;
    }
    if (chkViewportFilter) {
      chkViewportFilter.checked = !!host.viewportFiltering;
    }
    if (ipChkViewportFilter) {
      ipChkViewportFilter.checked = !!host.viewportFiltering;
    }
    if (chkBrushOutline) {
      chkBrushOutline.checked = !!host.showBrushOutline;
    }
    if (ipChkBrushOutline) {
      ipChkBrushOutline.checked = !!host.showBrushOutline;
    }
    if (chkTouchUndoRedo) {
      chkTouchUndoRedo.checked = !!host.enableTouchUndoRedo;
    }
    if (ipChkTouchUndoRedo) {
      ipChkTouchUndoRedo.checked = !!host.enableTouchUndoRedo;
    }
    if (ipSliderMaxUndo && host.maxUndoSteps !== undefined) {
      ipSliderMaxUndo.value = host.maxUndoSteps;
      if (ipValMaxUndo) {
        ipValMaxUndo.textContent = host.maxUndoSteps === 0 ? 'Unlimited (∞)' : `${host.maxUndoSteps} steps`;
      }
    }
    if (ipSelRenderer && host.renderMode) {
      ipSelRenderer.value = host.renderMode;
    }

    saveUserPreferences();
    syncInfinitePainterUI();
  }

  /* ── Infinite Painter Ergonomic UI Controller ── */
  function initInfinitePainterUI() {
    const ipTopBar = document.getElementById('ip-top-bar');
    if (!ipTopBar) return;

    // Close on backdrop click
    document.querySelectorAll('.ip-sheet-modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });

    // 1. Top Bar Main Menu Dropdown & Actions
    const btnMenuLogo = document.getElementById('btn-menu-logo') || document.getElementById('btn-ip-menu');
    const menuDropdown = document.getElementById('app-menu-dropdown');

    async function updatePainterRecentsMenu() {
      const listEl = document.getElementById('menu-recents-list');
      if (!listEl || typeof EsenhoStore === 'undefined' || !EsenhoStore.listProjects) return;
      try {
        const projects = await EsenhoStore.listProjects();
        if (!projects || projects.length === 0) {
          listEl.innerHTML = '<div style="padding: 6px 10px; font-size: 10px; color: var(--text-muted); text-align: center;">No stored projects yet</div>';
          return;
        }
        listEl.innerHTML = '';
        projects.slice(0, 6).forEach(p => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'menu-item';
          item.style.padding = '5px 8px';
          const d = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '';
          item.innerHTML = `
            <div style="display: flex; flex-direction: column; overflow: hidden; text-align: left;">
              <span style="font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name || 'Untitled'}</span>
              <span style="font-size: 9px; color: var(--text-muted);">${p.width}×${p.height} · ${d}</span>
            </div>
          `;
          item.addEventListener('click', async (e) => {
            e.stopPropagation();
            menuDropdown?.classList.remove('active');
            btnMenuLogo?.classList.remove('active');
            if (p.type === 'vector') {
              window.location.href = `studio.html?project=${p.id}`;
              return;
            }
            const fullProj = await EsenhoStore.getProject(p.id);
            if (fullProj) {
              if (fullProj.type === 'vector' || (!fullProj.layers && (fullProj.jsonDoc || fullProj.svgData))) {
                window.location.href = `studio.html?project=${p.id}`;
                return;
              }
              try {
                host.loadProject(fullProj);
                host.currentProjectId = fullProj.id;
                host.currentProjectName = fullProj.name;
                localStorage.setItem('esenho_last_project_id', fullProj.id);
                if (typeof syncUiFromHost === 'function') syncUiFromHost();
                updateStatus(host, 0, 0, true);
                log(`Loaded project '${fullProj.name}' [ok]`);
              } catch (loadErr) {
                log(`err: failed loading project: ${loadErr.message}`, 'err');
              }
            }
          });
          listEl.appendChild(item);
        });
      } catch (err) {
        console.warn('Failed loading recents for menu:', err);
      }
    }

    function setupPainterTitleBarMenuDrag() {
      if (!btnMenuLogo) return;
      btnMenuLogo.style.touchAction = 'none';

      let isDragging = false;
      let hasDragged = false;
      let startX = 0;
      let startY = 0;
      let reticleEl = null;

      function createReticle() {
        if (reticleEl) return reticleEl;
        const el = document.createElement('div');
        el.className = 'context-drop-reticle';
        el.style.cssText = 'position:fixed;pointer-events:none;z-index:100000;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;left:-9999px;top:-9999px;user-select:none;';
        el.innerHTML = `
          <div style="width:40px;height:40px;border-radius:50%;border:2px solid #fabd2f;background:rgba(29,32,33,0.7);backdrop-filter:blur(2px);box-shadow:0 0 0 2px rgba(0,0,0,0.6),0 0 14px rgba(250,189,47,0.6);display:flex;align-items:center;justify-content:center;position:relative;">
            <div style="position:absolute;width:14px;height:2px;background:#fabd2f;left:50%;top:50%;transform:translate(-50%,-50%);"></div>
            <div style="position:absolute;width:2px;height:14px;background:#fabd2f;left:50%;top:50%;transform:translate(-50%,-50%);"></div>
            <div style="width:6px;height:6px;border-radius:50%;background:#ebdbb2;z-index:2;box-shadow:0 0 3px #000;"></div>
          </div>
        `;
        document.body.appendChild(el);
        reticleEl = el;
        return el;
      }

      function updateReticlePos(x, y) {
        if (!reticleEl) createReticle();
        reticleEl.style.left = `${x}px`;
        reticleEl.style.top = `${y}px`;
      }

      function removeReticle() {
        if (reticleEl) {
          reticleEl.remove();
          reticleEl = null;
        }
      }

      function triggerPainterContextDrop(dropX, dropY) {
        const targetEl = document.elementFromPoint(dropX, dropY);
        const rect = btnMenuLogo.getBoundingClientRect();
        const distToBtn = Math.hypot(dropX - (rect.left + rect.width / 2), dropY - (rect.top + rect.height / 2));
        if (distToBtn < 24 || (targetEl && (targetEl === btnMenuLogo || btnMenuLogo.contains(targetEl)))) {
          showPainterTitleBarContextMenu({
            clientX: rect.left,
            clientY: rect.bottom + 2,
            preventDefault() {},
            stopPropagation() {}
          });
          return;
        }

        const cvs = document.getElementById('wcanvas');
        const cvsWrap = document.getElementById('cvswrap');
        if (cvs && (targetEl === cvs || cvsWrap?.contains(targetEl))) {
          showPainterContextMenu({
            clientX: dropX,
            clientY: dropY,
            preventDefault() {},
            stopPropagation() {}
          });
          return;
        }

        if (targetEl) {
          const evt = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: dropX,
            clientY: dropY,
            button: 2,
            buttons: 2,
            view: window
          });
          const cancelled = !targetEl.dispatchEvent(evt);
          if (!cancelled) {
            showPainterContextMenu({
              clientX: dropX,
              clientY: dropY,
              preventDefault() {},
              stopPropagation() {}
            });
          }
        } else {
          showPainterContextMenu({
            clientX: dropX,
            clientY: dropY,
            preventDefault() {},
            stopPropagation() {}
          });
        }
      }

      btnMenuLogo.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        isDragging = false;
        hasDragged = false;

        const rect = btnMenuLogo.getBoundingClientRect();
        showPainterTitleBarContextMenu({
          clientX: rect.left,
          clientY: rect.bottom + 2,
          preventDefault() {},
          stopPropagation() {}
        });

        try { btnMenuLogo.setPointerCapture(e.pointerId); } catch (_) {}

        const onPointerMove = (me) => {
          const dist = Math.hypot(me.clientX - startX, me.clientY - startY);
          if (!isDragging && dist > 8) {
            isDragging = true;
            hasDragged = true;
            window.contextMenuService?.hideContextMenu();
            if (navigator.vibrate) {
              try { navigator.vibrate(20); } catch (_) {}
            }
            btnMenuLogo.classList.add('active');
            btnMenuLogo.style.opacity = '0.6';
            updateReticlePos(me.clientX, me.clientY);
          }
          if (isDragging) {
            updateReticlePos(me.clientX, me.clientY);
          }
        };

        const onPointerUp = (ue) => {
          btnMenuLogo.removeEventListener('pointermove', onPointerMove);
          btnMenuLogo.removeEventListener('pointerup', onPointerUp);
          btnMenuLogo.removeEventListener('pointercancel', onPointerCancel);
          try { btnMenuLogo.releasePointerCapture(ue.pointerId); } catch (_) {}

          btnMenuLogo.classList.remove('active');
          btnMenuLogo.style.opacity = '';

          const finalX = ue.clientX;
          const finalY = ue.clientY;

          if (isDragging) {
            isDragging = false;
            removeReticle();
            if (navigator.vibrate) {
              try { navigator.vibrate(15); } catch (_) {}
            }
            requestAnimationFrame(() => {
              triggerPainterContextDrop(finalX, finalY);
            });
          } else {
            removeReticle();
          }
        };

        const onPointerCancel = (ce) => {
          btnMenuLogo.removeEventListener('pointermove', onPointerMove);
          btnMenuLogo.removeEventListener('pointerup', onPointerUp);
          btnMenuLogo.removeEventListener('pointercancel', onPointerCancel);
          try { btnMenuLogo.releasePointerCapture(ce.pointerId); } catch (_) {}
          btnMenuLogo.classList.remove('active');
          btnMenuLogo.style.opacity = '';
          isDragging = false;
          removeReticle();
        };

        btnMenuLogo.addEventListener('pointermove', onPointerMove);
        btnMenuLogo.addEventListener('pointerup', onPointerUp);
        btnMenuLogo.addEventListener('pointercancel', onPointerCancel);
      });

      btnMenuLogo.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (hasDragged) {
          hasDragged = false;
          return;
        }
        if (!window.contextMenuService?.activeMenu) {
          const rect = btnMenuLogo.getBoundingClientRect();
          showPainterTitleBarContextMenu({
            clientX: rect.left,
            clientY: rect.bottom + 2,
            preventDefault() {},
            stopPropagation() {}
          });
        }
      });
    }

    setupPainterTitleBarMenuDrag();

    document.querySelectorAll('.menu-item-submenu-wrap > button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = btn.closest('.menu-item-submenu-wrap');
        const isAlreadyOpen = wrap?.classList.contains('open');
        document.querySelectorAll('.menu-item-submenu-wrap').forEach(w => w.classList.remove('open'));
        if (!isAlreadyOpen) {
          wrap?.classList.add('open');
        }
      });
    });

    menuDropdown?.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn && btn.parentElement?.classList.contains('menu-item-submenu-wrap')) {
        return;
      }
      if (btn) {
        menuDropdown.classList.remove('active');
        btnMenuLogo?.classList.remove('active');
        document.querySelectorAll('.menu-item-submenu-wrap').forEach(w => w.classList.remove('open'));
      }
    });

    // Dropdown Action Bindings
    document.getElementById('btn-menu-new-project')?.addEventListener('click', () => {
      openSheet('sheet-new-proj');
    });

    document.getElementById('btn-open-recents-modal')?.addEventListener('click', () => {
      openSheet('sheet-recents');
      if (typeof window.loadPainterRecents === 'function') window.loadPainterRecents();
    });

    const menuFileInput = document.getElementById('menu-file-input');
    document.getElementById('btn-menu-import-file')?.addEventListener('click', () => {
      menuFileInput?.click();
    });
    menuFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await handleFileImport(file);
      } finally {
        menuFileInput.value = '';
      }
    });

    document.getElementById('btn-menu-save-project')?.addEventListener('click', () => {
      document.getElementById('btn-ip-save-proj')?.click();
    });

    document.getElementById('btn-quick-export-png')?.addEventListener('click', () => {
      exportImage('image/png');
    });
    document.getElementById('btn-quick-export-jpg')?.addEventListener('click', () => {
      exportImage('image/jpeg');
    });
    document.getElementById('btn-quick-export-gif')?.addEventListener('click', exportAnimatedGif);
    document.getElementById('btn-quick-export-webm')?.addEventListener('click', exportWebmVideo);
    document.getElementById('btn-quick-export-esen')?.addEventListener('click', () => {
      exportEsenProject();
    });

    document.getElementById('btn-menu-undo')?.addEventListener('click', () => { runCmd('undo'); });
    document.getElementById('btn-menu-redo')?.addEventListener('click', () => { runCmd('redo'); });
    document.getElementById('btn-menu-zoom-fit')?.addEventListener('click', () => {
      host.zoom = 1.0;
      host.panX = 0;
      host.panY = 0;
      host.render();
      log('Zoom reset to fit [ok]');
    });

    document.getElementById('btn-menu-resize-canvas')?.addEventListener('click', () => {
      const w = prompt('New Width (px):', host.docWidth || 1280);
      if (!w) return;
      const h = prompt('New Height (px):', host.docHeight || 720);
      if (!h) return;
      runCmd(`resize ${parseInt(w, 10)} ${parseInt(h, 10)}`);
    });
    document.getElementById('btn-menu-crop-selection')?.addEventListener('click', () => { runCmd('crop'); });
    document.getElementById('btn-menu-clear-layer')?.addEventListener('click', () => { runCmd('clear'); });
    document.getElementById('btn-menu-invert-layer')?.addEventListener('click', () => { runCmd('layer invert'); });
    document.getElementById('btn-menu-rot-cw')?.addEventListener('click', () => { runCmd('rotate 90'); });
    document.getElementById('btn-menu-rot-ccw')?.addEventListener('click', () => { runCmd('rotate -90'); });
    document.getElementById('btn-menu-flip-h')?.addEventListener('click', () => { runCmd('flip horizontal'); });
    document.getElementById('btn-menu-flip-v')?.addEventListener('click', () => { runCmd('flip vertical'); });

    document.querySelectorAll('.btn-filter-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const filterName = btn.dataset.filter;
        if (filterName) runCmd(`filter ${filterName}`);
      });
    });

    document.querySelectorAll('.render-engine-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const eng = btn.dataset.engine;
        if (eng) {
          syncRenderer(eng);
        }
      });
    });

    document.querySelectorAll('.view-filter-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const vfilt = btn.dataset.vfilter;
        if (vfilt) {
          syncViewportFilter(vfilt === 'bilinear');
        }
      });
    });

    // Panel & HUD Configuration Menu Buttons
    document.getElementById('btn-menu-configure-panels')?.addEventListener('click', () => {
      openHudCustomizer();
    });

    document.getElementById('btn-menu-toggle-anim')?.addEventListener('click', () => {
      if (host.rasterAnimatorUI) {
        host.rasterAnimatorUI.toggle();
        updateAnimTimelineDockOffset();
        syncInfinitePainterUI();
      }
    });

    document.querySelectorAll('.btn-menu-toggle-panel').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.panel;
        if (!targetId) return;
        if (targetId === 'touch-color-modal' && !window.isDockviewPainter) {
          openTouchColorModal();
        } else {
          toggleSheet(targetId);
        }
      });
    });

    // 2. Customizable HUD Bars Controller (Top, Left, Right, Bottom)
    const HUD_AVAILABLE_SLIDERS = [
      { id: 'size', label: 'Size', key: 'size', min: 1, max: 300, isCurve: true, unit: '', defaultOn: true },
      { id: 'opacity', label: 'Opac', key: 'opacity', min: 1, max: 100, isCurve: false, unit: '%', defaultOn: true },
      { id: 'flow', label: 'Flow', key: 'flow', min: 1, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'hardness', label: 'Hard', key: 'hardness', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'roundness', label: 'Round', key: 'roundness', min: 1, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'angle', label: 'Angle', key: 'angle', min: 0, max: 360, isCurve: false, unit: '°', defaultOn: false },
      { id: 'spacing', label: 'Spac', key: 'spacing', min: 1, max: 200, isCurve: false, unit: '%', defaultOn: false },
      { id: 'smoothing', label: 'Stab', key: 'smoothing', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'string_length', label: 'String', key: 'string_length', min: 0, max: 200, isCurve: false, unit: 'px', defaultOn: false },
      { id: 'midpoint', label: 'MidPt', key: 'midpoint', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'velocity', label: 'Velo', key: 'velocity', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'taper_in', label: 'TapIn', key: 'taper_in', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'taper_out', label: 'TapOut', key: 'taper_out', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'fade', label: 'Fade', key: 'fade', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'wetness', label: 'Wet', key: 'wetness', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'smudge', label: 'Smdg', key: 'smudge', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'pickup', label: 'Mix', key: 'color_pickup', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'depletion', label: 'Dry', key: 'depletion', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'scatter', label: 'Scat', key: 'scatter', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'size_jitter', label: 'JitSz', key: 'size_jitter', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'angle_jitter', label: 'JitAng', key: 'angle_jitter', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'opacity_jitter', label: 'JitOp', key: 'opacity_jitter', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'color_jitter', label: 'JitCol', key: 'color_jitter', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'grain', label: 'Grain', key: 'grain', min: 0, max: 100, isCurve: false, unit: '%', defaultOn: false },
      { id: 'tex_scale', label: 'TexSz', key: 'texture_scale', min: 10, max: 400, isCurve: false, unit: '%', defaultOn: false },
      { id: 'tex_contrast', label: 'TexCt', key: 'texture_contrast', min: 0, max: 200, isCurve: false, unit: '%', defaultOn: false },
      { id: 'tex_rotate', label: 'TexRot', key: 'texture_rotate', min: 0, max: 360, isCurve: false, unit: '°', defaultOn: false },
      { id: 'dual_size', label: 'DualSz', key: 'dual_size', min: 10, max: 300, isCurve: false, unit: '%', defaultOn: false },
      { id: 'dual_spacing', label: 'DualSp', key: 'dual_spacing', min: 1, max: 100, isCurve: false, unit: '%', defaultOn: false }
    ];

    const HUD_AVAILABLE_ACTIONS = [
      { id: 'brush', label: 'Brush Shelf', title: 'Brush Shelf & Presets', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg><span class="ip-hud-brush-name" style="font-size: 10px; font-weight: bold; max-width: 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Brush</span>', defaultOn: true },
      { id: 'tools', label: 'Tools', title: 'Shapes, Fill & Selection Tools', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="6" cy="6" r="3"/><rect x="14" y="3" width="7" height="7" rx="1"/><polygon points="12 21 5 13 19 13"/></svg>', defaultOn: true },
      { id: 'layers', label: 'Layers', title: 'Layers Stack', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>', defaultOn: true },
      { id: 'brush_lab', label: 'Brush Lab', title: 'Brush Dynamics Lab', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', defaultOn: false },
      { id: 'undo', label: 'Undo', title: 'Undo (Ctrl+Z)', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>', defaultOn: false },
      { id: 'redo', label: 'Redo', title: 'Redo (Ctrl+Y)', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>', defaultOn: false },
      { id: 'grid', label: 'Grid', title: 'Toggle Pixel Grid', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>', defaultOn: false },
      { id: 'symmetry', label: 'Symmetry', title: 'Symmetry Mirror', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22" stroke-dasharray="3 3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/></svg>', defaultOn: false },
      { id: 'color', label: 'Color Studio', title: 'Color Studio (Wheel, Palettes, HSV)', icon: '<div class="ip-color-chip-wrap"><div class="ip-color-chip" style="width: 100%; height: 100%; border-radius: 50%; background: #ebdbb2;"></div></div>', defaultOn: true },
      { id: 'swap_mode', label: 'Brush/Eraser', title: 'Toggle Brush / Eraser', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13.5L8.5 22H3v-5.5l9.5-9.5L18 13.5z"/><path d="M14 5.5l3.5-3.5a2.12 2.12 0 0 1 3 3L17 8.5 14 5.5z"/></svg>', defaultOn: true },
      { id: 'pipette', label: 'Eyedropper', title: 'Pipette Eyedropper', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14.5 2.5l7 7L18 13l-7-7 3.5-3.5z"/><path d="M11 6L3 14v7h7l8-8"/><circle cx="5.5" cy="18.5" r="1.5"/></svg>', defaultOn: false },
      { id: 'clear_layer', label: 'Clear Layer', title: 'Clear Active Layer', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>', defaultOn: false },
      { id: 'hud_gear', label: '⚙ Settings', title: 'Customize HUD Bars', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', defaultOn: false },
      { id: 'sel_mode_cycle', label: 'Sel Mode', title: 'Cycle Selection Mode (New / Add / Sub / Intersect)', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="11" height="11" rx="1.5"/><rect x="10" y="10" width="11" height="11" rx="1.5" stroke-dasharray="2 2"/><line x1="15.5" y1="12" x2="15.5" y2="19"/><line x1="12" y1="15.5" x2="19" y2="15.5"/></svg>', defaultOn: false },
      { id: 'select_rect', label: 'Marquee', title: 'Rectangle Marquee Selection', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>', defaultOn: false },
      { id: 'select_lasso', label: 'Lasso', title: 'Freehand Polygon Lasso Selection', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14a8 8 0 0 1 13.5-5.5L20 11"/><path d="M11 20a8 8 0 0 1-5.5-13.5L8 4"/></svg>', defaultOn: false },
      { id: 'select_wand', label: 'Wand', title: 'Magic Wand Selection', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 4l5 5L7 22H2v-5L15 4z"/><line x1="18.5" y1="2.5" x2="21.5" y2="5.5"/><line x1="12" y1="7" x2="17" y2="12"/></svg>', defaultOn: false },
      { id: 'select_invert', label: 'Invert Sel', title: 'Invert Selection', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" fill="currentColor"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>', defaultOn: false },
      { id: 'anim_timeline', label: 'Animation', title: 'Frame-by-Frame Animation Timeline', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>', defaultOn: true }
    ];

    let ipActiveHudConfig = {
      left: {
        sliders: ['size', 'opacity'],
        actions: ['color', 'swap_mode']
      },
      right: {
        sliders: [],
        actions: ['hud_gear']
      },
      bottom: {
        sliders: [],
        actions: ['brush', 'tools', 'layers', 'brush_lab']
      }
    };

    try {
      const savedHud = localStorage.getItem('esenho_ip_hud_config');
      if (savedHud) {
        const parsed = JSON.parse(savedHud);
        if (parsed && typeof parsed === 'object') {
          ipActiveHudConfig = {
            left: parsed.left || { sliders: ['size', 'opacity'], actions: ['color', 'swap_mode'] },
            right: parsed.right || { sliders: [], actions: ['hud_gear'] },
            bottom: parsed.bottom || (parsed.top ? { sliders: parsed.top.sliders || [], actions: parsed.top.actions || ['brush', 'tools', 'layers', 'brush_lab'] } : { sliders: [], actions: ['brush', 'tools', 'layers', 'brush_lab'] })
          };
        }
      }
    } catch (_) {}

    const renderDock = (dockName) => {
      const hud = document.getElementById(`ip-${dockName}-hud`);
      if (!hud) return;
      const cfg = ipActiveHudConfig[dockName] || { sliders: [], actions: [] };
      hud.innerHTML = '';

      const totalItems = (cfg.sliders ? cfg.sliders.length : 0) + (cfg.actions ? cfg.actions.length : 0);
      if (totalItems === 0) {
        hud.style.display = 'none';
        return;
      }
      hud.style.display = 'flex';

      // Sliders
      const rasterOnlySliderIds = new Set(['wetness', 'smudge', 'pickup', 'depletion']);
      const rasterOnlyActionIds = new Set(['select_rect', 'select_lasso', 'select_wand', 'sel_mode_cycle', 'select_invert', 'grid']);
      (cfg.sliders || []).forEach(sid => {
        const sDef = HUD_AVAILABLE_SLIDERS.find(s => s.id === sid);
        if (!sDef) return;

        const ctrl = document.createElement('div');
        ctrl.className = 'ip-hud-control' + (rasterOnlySliderIds.has(sDef.id) ? ' raster-only-ui' : '');
        ctrl.id = `ip-hud-${dockName}-${sDef.id}-ctrl`;
        ctrl.title = `${sDef.label} (drag up/down)`;
        ctrl.innerHTML = `
          <div class="ip-hud-pill">
            <span class="ip-hud-lbl">${sDef.label}</span>
            <span id="ip-hud-${dockName}-${sDef.id}-val" class="ip-hud-val">--</span>
          </div>
          <div class="ip-vslider-track" id="ip-vtrack-${dockName}-${sDef.id}">
            <div class="ip-vslider-fill" id="ip-vfill-${dockName}-${sDef.id}"></div>
            <div class="ip-vslider-thumb" id="ip-vthumb-${dockName}-${sDef.id}"></div>
          </div>
        `;
        hud.appendChild(ctrl);

        const track = ctrl.querySelector('.ip-vslider-track');
        const valEl = ctrl.querySelector('.ip-hud-val');
        const fillEl = ctrl.querySelector('.ip-vslider-fill');
        const thumbEl = ctrl.querySelector('.ip-vslider-thumb');
        let isDragging = false;

        const handleDrag = (clientY) => {
          if (!track || !host.brushParams) return;
          const rect = track.getBoundingClientRect();
          const pos = Math.max(0.005, Math.min(1, 1 - (clientY - rect.top) / rect.height));
          let val;
          if (sDef.isCurve) {
            val = Math.max(1, Math.min(300, Math.round(pos * pos * 299 + 1)));
          } else {
            val = Math.round((sDef.min || 0) + pos * ((sDef.max || 100) - (sDef.min || 0)));
          }
          if (valEl) valEl.textContent = `${val}${sDef.unit || ''}`;
          if (fillEl) fillEl.style.height = `${pos * 100}%`;
          if (thumbEl) thumbEl.style.bottom = `${pos * 100}%`;

          host.brushParams[sDef.key] = val;
          runCmd(`set ${sDef.key} ${val}`);
          syncUiFromHost();
        };

        const onDown = (e) => {
          isDragging = true;
          if (e.pointerId && typeof ctrl.setPointerCapture === 'function') {
            try { ctrl.setPointerCapture(e.pointerId); } catch (_) {}
          }
          const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
          handleDrag(clientY);
          e.preventDefault();
        };

        const onMove = (e) => {
          if (!isDragging) return;
          const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
          handleDrag(clientY);
          e.preventDefault();
        };

        const onUp = (e) => {
          if (isDragging) {
            isDragging = false;
            if (e.pointerId && typeof ctrl.releasePointerCapture === 'function') {
              try { ctrl.releasePointerCapture(e.pointerId); } catch (_) {}
            }
            triggerHaptic(8);
          }
        };

        ctrl.addEventListener('pointerdown', onDown);
        ctrl.addEventListener('pointermove', onMove);
        ctrl.addEventListener('pointerup', onUp);
        ctrl.addEventListener('pointercancel', onUp);

        ctrl.addEventListener('touchstart', onDown, { passive: false });
        ctrl.addEventListener('touchmove', onMove, { passive: false });
        ctrl.addEventListener('touchend', onUp);
        ctrl.addEventListener('touchcancel', onUp);
      });

      const createActionBtn = (aid) => {
        const aDef = HUD_AVAILABLE_ACTIONS.find(a => a.id === aid);
        if (!aDef) return null;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ip-hud-btn' + (rasterOnlyActionIds.has(aDef.id) ? ' raster-only-ui' : '');
        btn.id = aDef.id === 'swap_mode' ? `btn-ip-swap-mode-${dockName}` : `btn-ip-hud-${dockName}-${aDef.id}`;
        btn.title = aDef.title;
        btn.innerHTML = aDef.icon;

        if (aDef.id === 'brush') {
          btn.addEventListener('click', () => {
            if (host.actionMode === 'erase' || host.actionMode === 'smudge') {
              host.actionMode = 'draw';
              runCmd(`set mode brush`);
              syncUiFromHost();
            }
            toggleSheet('sheet-brushes');
            triggerHaptic(12);
          });
        } else if (aDef.id === 'color') {
          btn.addEventListener('click', () => {
            if (typeof openTouchColorModal === 'function') openTouchColorModal();
            else {
              const tm = document.getElementById('touch-color-modal');
              if (tm) tm.classList.add('active');
            }
            triggerHaptic(12);
          });
        } else if (aDef.id === 'swap_mode') {
          btn.addEventListener('click', () => {
            const isCurrentlyEraser = host.actionMode === 'erase' || (host.brushParams && host.brushParams.eraser === 1);
            if (isCurrentlyEraser) {
              host.actionMode = 'draw';
              runCmd(`set mode brush`);
            } else {
              host.actionMode = 'erase';
              runCmd(`set mode erase`);
            }
            syncUiFromHost();
            triggerHaptic(18);
          });
        } else if (aDef.id === 'pipette') {
          btn.addEventListener('click', () => {
            host.actionMode = host.actionMode === 'color_picker' ? 'draw' : 'color_picker';
            syncUiFromHost();
            triggerHaptic(12);
          });
        } else if (aDef.id === 'undo') {
          btn.addEventListener('click', () => { handleUndo(); triggerHaptic(12); });
        } else if (aDef.id === 'redo') {
          btn.addEventListener('click', () => { handleRedo(); triggerHaptic(12); });
        } else if (aDef.id === 'clear_layer') {
          btn.addEventListener('click', () => {
            if (confirm('Clear current active layer?')) runCmd('clear');
            triggerHaptic(15);
          });
        } else if (aDef.id === 'brush_lab') {
          btn.addEventListener('click', () => { toggleSheet('sheet-lab'); triggerHaptic(12); });
        } else if (aDef.id === 'tools') {
          btn.addEventListener('click', () => { toggleSheet('sheet-tools'); triggerHaptic(12); });
        } else if (aDef.id === 'layers') {
          btn.addEventListener('click', () => { toggleSheet('sheet-layers'); triggerHaptic(12); });
        } else if (aDef.id === 'grid') {
          btn.addEventListener('click', () => {
            syncPixelGrid(!host.showPixelGrid);
            btn.classList.toggle('active', !!host.showPixelGrid);
            triggerHaptic(10);
          });
        } else if (aDef.id === 'symmetry') {
          btn.addEventListener('click', () => {
            const curSym = (host.brushParams && host.brushParams.symmetry !== undefined) ? host.brushParams.symmetry : 0;
            const nextSym = (curSym + 1) % 4;
            runCmd(`set symmetry ${nextSym}`);
            btn.classList.toggle('active', nextSym > 0);
            triggerHaptic(10);
          });
        } else if (aDef.id === 'hud_gear') {
          btn.addEventListener('click', () => {
            openHudCustomizer();
            triggerHaptic(12);
          });
        } else if (aDef.id === 'sel_mode_cycle') {
          btn.addEventListener('click', () => {
            const modes = ['replace', 'add', 'sub', 'intersect'];
            const curIdx = modes.indexOf(host.selectionMode || 'replace');
            const nextMode = modes[(curIdx + 1) % modes.length];
            host.setSelectionMode(nextMode);
            syncUiFromHost();
            triggerHaptic(12);
          });
        } else if (aDef.id === 'select_rect') {
          btn.addEventListener('click', () => {
            host.actionMode = 'select';
            host.currentTool = 'select_rect';
            syncUiFromHost();
            triggerHaptic(12);
          });
        } else if (aDef.id === 'select_lasso') {
          btn.addEventListener('click', () => {
            host.actionMode = 'select';
            host.currentTool = 'lasso_select';
            syncUiFromHost();
            triggerHaptic(12);
          });
        } else if (aDef.id === 'select_wand') {
          btn.addEventListener('click', () => {
            host.actionMode = 'select';
            host.currentTool = 'magic_wand';
            syncUiFromHost();
            triggerHaptic(12);
          });
        } else if (aDef.id === 'select_invert') {
          btn.addEventListener('click', () => {
            runCmd('select invert');
            syncUiFromHost();
            triggerHaptic(12);
          });
        } else if (aDef.id === 'anim_timeline') {
          btn.addEventListener('click', () => {
            if (host.rasterAnimatorUI) {
              host.rasterAnimatorUI.toggle();
              btn.classList.toggle('active', host.rasterAnimatorUI.visible);
              updateAnimTimelineDockOffset();
            }
            triggerHaptic(12);
          });
        }

        return btn;
      };

      if (dockName === 'bottom' && cfg.sliders && cfg.sliders.length > 0) {
        // Bottom bar has sliders (expanded height): stack up to 3 action buttons vertically per column
        const actionList = cfg.actions || [];
        for (let i = 0; i < actionList.length; i += 3) {
          const col = document.createElement('div');
          col.className = 'ip-hud-btn-col';
          for (let j = 0; j < 3 && (i + j) < actionList.length; j++) {
            const btn = createActionBtn(actionList[i + j]);
            if (btn) col.appendChild(btn);
          }
          hud.appendChild(col);
        }
      } else {
        (cfg.actions || []).forEach(aid => {
          const btn = createActionBtn(aid);
          if (btn) hud.appendChild(btn);
        });
      }
    };

    const updateAnimTimelineDockOffset = () => {
      const animDock = document.getElementById('raster-anim-timeline-dock');
      const bottomHud = document.getElementById('ip-bottom-hud');
      if (!animDock) return;
      if (bottomHud && bottomHud.style.display !== 'none') {
        const hudH = bottomHud.offsetHeight || 46;
        animDock.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${hudH + 18}px)`;
      } else {
        animDock.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + 12px)`;
      }
    };

    const renderAllHuds = () => {
      renderDock('left');
      renderDock('right');
      renderDock('bottom');
      updateAnimTimelineDockOffset();
      syncInfinitePainterUI();
    };

    let currentCustomizingDock = 'left';

    const saveContextMenuSliders = (list) => {
      const validIds = new Set(CONTEXT_MENU_SLIDERS_DEF.map(s => s.id));
      host.contextMenuSliders = CONTEXT_MENU_SLIDERS_DEF
        .map(s => s.id)
        .filter(id => validIds.has(id) && list.includes(id));
      try {
        localStorage.setItem(CONTEXT_MENU_SLIDERS_STORAGE_KEY, JSON.stringify(host.contextMenuSliders));
      } catch (_) {}
    };

    const renderHudCustomizerOptions = () => {
      const sGrid = document.getElementById('ip-hud-sliders-toggle-grid');
      const aGrid = document.getElementById('ip-hud-actions-toggle-grid');
      const cfg = ipActiveHudConfig[currentCustomizingDock] || { sliders: [], actions: [] };

      if (sGrid) {
        sGrid.innerHTML = '';
        const activeSet = new Set(Array.isArray(host.contextMenuSliders) ? host.contextMenuSliders : ['size', 'opacity', 'smoothing']);
        CONTEXT_MENU_SLIDERS_DEF.forEach(s => {
          const item = document.createElement('label');
          item.className = 'ip-btn';
          item.style.display = 'flex';
          item.style.alignItems = 'center';
          item.style.gap = '6px';
          item.style.cursor = 'pointer';
          item.style.padding = '5px 7px';
          const isChecked = activeSet.has(s.id);
          item.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''} data-ctx-slider="${s.id}"> <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.label}</span>`;
          item.querySelector('input').addEventListener('change', (e) => {
            const cur = new Set(Array.isArray(host.contextMenuSliders) ? host.contextMenuSliders : []);
            if (e.target.checked) cur.add(s.id);
            else cur.delete(s.id);
            saveContextMenuSliders(Array.from(cur));
          });
          sGrid.appendChild(item);
        });
      }

      if (aGrid) {
        aGrid.innerHTML = '';
        HUD_AVAILABLE_ACTIONS.forEach(a => {
          const item = document.createElement('label');
          item.className = 'ip-btn';
          item.style.display = 'flex';
          item.style.alignItems = 'center';
          item.style.gap = '6px';
          item.style.cursor = 'pointer';
          const isChecked = (cfg.actions || []).includes(a.id);
          item.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''} data-hud-action="${a.id}"> <span>${a.label}</span>`;
          item.querySelector('input').addEventListener('change', (e) => {
            if (!ipActiveHudConfig[currentCustomizingDock]) {
              ipActiveHudConfig[currentCustomizingDock] = { sliders: [], actions: [] };
            }
            if (e.target.checked) {
              if (!ipActiveHudConfig[currentCustomizingDock].actions.includes(a.id)) {
                ipActiveHudConfig[currentCustomizingDock].actions.push(a.id);
              }
            } else {
              ipActiveHudConfig[currentCustomizingDock].actions = ipActiveHudConfig[currentCustomizingDock].actions.filter(x => x !== a.id);
            }
            localStorage.setItem('esenho_ip_hud_config', JSON.stringify(ipActiveHudConfig));
            renderAllHuds();
          });
          aGrid.appendChild(item);
        });
      }
    };

    const openHudCustomizer = (initialDock = 'left') => {
      currentCustomizingDock = initialDock;
      renderHudCustomizerOptions();
      if (window.isDockviewPainter && typeof window.openPainterDockPanel === 'function') {
        window.openPainterDockPanel('hud');
        return;
      }
      const modal = document.getElementById('sheet-hud-customizer');
      if (!modal) return;
      openSheet('sheet-hud-customizer');
    };
    window.renderHudCustomizerOptions = renderHudCustomizerOptions;

    // Context Menu Sliders Presets
    const btnHudDefault = document.getElementById('btn-ip-hud-preset-default');
    if (btnHudDefault) {
      btnHudDefault.addEventListener('click', () => {
        saveContextMenuSliders(['size', 'opacity', 'smoothing']);
        renderHudCustomizerOptions();
        triggerHaptic(12);
      });
    }

    const btnHudPro = document.getElementById('btn-ip-hud-preset-pro');
    if (btnHudPro) {
      btnHudPro.addEventListener('click', () => {
        saveContextMenuSliders(['size', 'opacity', 'flow', 'hardness', 'smoothing', 'wetness', 'smudge', 'pickup']);
        renderHudCustomizerOptions();
        triggerHaptic(12);
      });
    }

    const btnHudInk = document.getElementById('btn-ip-hud-preset-ink');
    if (btnHudInk) {
      btnHudInk.addEventListener('click', () => {
        saveContextMenuSliders(['size', 'opacity', 'smoothing', 'string_length', 'taper_in', 'taper_out', 'velocity']);
        renderHudCustomizerOptions();
        triggerHaptic(12);
      });
    }

    const btnHudFull = document.getElementById('btn-ip-hud-preset-full');
    if (btnHudFull) {
      btnHudFull.addEventListener('click', () => {
        saveContextMenuSliders(CONTEXT_MENU_SLIDERS_DEF.map(s => s.id));
        renderHudCustomizerOptions();
        triggerHaptic(12);
      });
    }

    const btnOpenHudCust = document.getElementById('btn-ip-open-hud-customizer');
    if (btnOpenHudCust) btnOpenHudCust.addEventListener('click', () => { openHudCustomizer(); });

    const btnCloseHudCust = document.getElementById('btn-ip-hud-save-close');
    if (btnCloseHudCust) btnCloseHudCust.addEventListener('click', () => {
      try {
        localStorage.setItem('esenho_ip_hud_config', JSON.stringify(ipActiveHudConfig));
      } catch (_) {}
      if (window.isDockviewPainter && typeof window.closePainterDockPanel === 'function') {
        window.closePainterDockPanel('hud');
      } else {
        document.getElementById('sheet-hud-customizer')?.classList.remove('active');
      }
    });

    renderAllHuds();
    renderHudCustomizerOptions();

    // 4. Brush Shelf Grid Population
    const brushShelfGrid = document.getElementById('ip-brush-cards-grid');
    const catPills = document.querySelectorAll('#ip-brush-cat-pills .ip-pill-btn');
    let activeBrushCat = 'all';

    const renderBrushShelf = () => {
      if (!brushShelfGrid) return;
      brushShelfGrid.innerHTML = '';

      const presetsMap = { ...BRUSH_PRESETS, ...(host.customBrushPresets || {}) };
      for (const [key, preset] of Object.entries(presetsMap)) {
        if (!preset.name) continue;

        let cat = preset.category || 'paint';
        if (host.customBrushPresets && host.customBrushPresets[key]) cat = 'custom';

        if (activeBrushCat !== 'all' && activeBrushCat !== cat) continue;

        const card = document.createElement('div');
        card.className = `ip-brush-card${host.activeBrush === key ? ' active' : ''}`;
        card.innerHTML = `
          <div class="ip-brush-card-top">
            <span class="ip-brush-card-title">${preset.name}</span>
            <span style="font-size: 9px; color: #a89984; font-weight: bold;">${preset.size || 12}px</span>
          </div>
          <div class="ip-brush-card-desc">${preset.desc || 'Custom calibrated brush preset'}</div>
        `;
        card.addEventListener('click', () => {
          host.selectBrushPreset(key);
          syncUiFromHost();
          triggerHaptic(15);
        });
        brushShelfGrid.appendChild(card);
      }
    };

    catPills.forEach(pill => {
      pill.addEventListener('click', () => {
        catPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeBrushCat = pill.dataset.bcat || 'all';
        renderBrushShelf();
        triggerHaptic(8);
      });
    });

    renderBrushShelf();

    const btnSaveCustomBrush = document.getElementById('btn-ip-save-brush-preset');
    if (btnSaveCustomBrush) {
      btnSaveCustomBrush.addEventListener('click', () => {
        const name = prompt('Preset Name:', 'Custom Brush');
        if (name && name.trim() && host.brushParams) {
          const key = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
          const custom = host.customBrushPresets || {};
          custom[key] = {
            ...JSON.parse(JSON.stringify(host.brushParams || {})),
            texture: host.activeTexture || (host.brushParams && host.brushParams.texture) || 'none',
            name: name.trim(),
            category: 'custom',
            desc: `User custom preset (${host.brushParams.size}px)`
          };
          host.customBrushPresets = custom;
          saveCustomBrushPresets(custom);
          populateBrushPresetsUI();
          renderBrushShelf();
          triggerHaptic(15);
        }
      });
    }

    const btnOpenLabFromShelf = document.getElementById('btn-ip-open-lab-from-shelf');
    if (btnOpenLabFromShelf) {
      btnOpenLabFromShelf.addEventListener('click', () => {
        if (window.isDockviewPainter && typeof window.openPainterDockPanel === 'function') {
          window.openPainterDockPanel('lab');
        } else {
          toggleSheet('sheet-lab');
        }
      });
    }

    // 5. Tools & Modes Sheet Tabs + Action Modes Cards
    const toolsTabBtns = document.querySelectorAll('#ip-tools-tab-pills .ip-pill-btn');
    const toolsTabPanels = document.querySelectorAll('#sheet-tools .ip-tools-tab-panel');
    const switchToolsSheetTab = (tabName) => {
      if (!tabName) return;
      toolsTabBtns.forEach(b => b.classList.toggle('active', b.dataset.toolstab === tabName));
      toolsTabPanels.forEach(p => {
        p.style.display = (p.dataset.toolspanel === tabName) ? 'flex' : 'none';
      });
    };
    toolsTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tName = btn.dataset.toolstab || 'draw';
        switchToolsSheetTab(tName);
        triggerHaptic(8);
      });
    });

    document.querySelectorAll('#sheet-tools .ip-actionmode-card').forEach(card => {
      card.addEventListener('click', () => {
        const actMode = card.dataset.actionmode || 'draw';
        host.setActionMode(actMode);
        if (actMode === 'vector') {
          if (!host.vectorSubTool || host.vectorSubTool === 'draw') {
            host.vectorSubTool = 'nodes';
          }
          if (host.enableVectorLayer) {
            const vl = host.enableVectorLayer();
            if (vl && !vl.selectedPathId && vl.paths.length > 0) {
              host.selectVectorPath(vl.paths[vl.paths.length - 1].id, 0);
            }
          }
          switchToolsSheetTab('nodes');
        } else if (actMode === 'select') {
          if (host.currentTool !== 'select_rect' && host.currentTool !== 'lasso_select' && host.currentTool !== 'magic_wand' && host.currentTool !== 'brush') {
            host.currentTool = 'select_rect';
            host.setBrushParam('mode', 9);
          } else if (host.currentTool === 'select_rect') {
            host.setBrushParam('mode', 9);
          }
          switchToolsSheetTab('select');
        } else {
          vecPenActivePathId = null;
          if (host.currentTool === 'select_rect' || host.currentTool === 'lasso_select' || host.currentTool === 'magic_wand') {
            host.currentTool = 'brush';
            host.setBrushParam('mode', 0);
          }
          switchToolsSheetTab('draw');
        }
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(12);
      });
    });

    // Floating Vector Painter Bar & Sheet Vector Tools
    document.querySelectorAll('.ip-vecbar-subtool, .ip-vecbar-sub, .ip-sheet-vec-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = btn.dataset.vecsub || 'nodes';
        vecPenActivePathId = null;
        if (sub === 'draw' || sub === 'line' || sub === 'rect' || sub === 'ellipse') {
          host.vectorSubTool = sub;
          host.setActionMode('draw');
          const modeMap = { draw: 0, line: 6, rect: 7, ellipse: 8 };
          host.currentTool = (sub === 'draw') ? 'brush' : sub;
          host.setBrushParam('mode', modeMap[sub] || 0);
          if (host.enableVectorLayer) host.enableVectorLayer();
        } else if (sub === 'erase') {
          host.vectorSubTool = 'erase';
          host.setActionMode('erase');
          if (host.enableVectorLayer) host.enableVectorLayer();
        } else {
          host.vectorSubTool = sub;
          host.setActionMode('vector');
          if (host.enableVectorLayer) {
            const vl = host.enableVectorLayer();
            if (sub !== 'pen') {
              if (vl && !vl.selectedPathId && vl.paths.length > 0) {
                host.selectVectorPath(vl.paths[vl.paths.length - 1].id, 0);
              } else if (vl && vl.selectedPathId && vl.selectedNodeIdx < 0) {
                host.selectVectorPath(vl.selectedPathId, 0);
              }
            }
          }
        }
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(10);
      });
    });

    const exportVectorLayerSvg = () => {
      if (typeof host.exportSVG !== 'function') return;
      const svgContent = host.exportSVG();
      if (!svgContent) return;
      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const projName = (host.currentProjectName || 'esenho-vector').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      a.download = `${projName}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      triggerHaptic(15);
    };
    document.getElementById('btn-ip-vecbar-export-svg')?.addEventListener('click', exportVectorLayerSvg);
    document.getElementById('btn-sheet-vec-export-svg')?.addEventListener('click', exportVectorLayerSvg);
    document.getElementById('btn-top-vec-export-svg')?.addEventListener('click', exportVectorLayerSvg);
    document.getElementById('btn-quick-export-svg')?.addEventListener('click', exportVectorLayerSvg);

    document.getElementById('btn-ip-vecbar-pen-done')?.addEventListener('click', () => {
      vecPenActivePathId = null;
      markCanvasDirty();
      syncUiFromHost();
      triggerHaptic(12);
    });

    const toggleVectorClosedLoop = () => {
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (selPath) {
        host.pushUndoSnapshot('toggle vector closed');
        selPath.closed = !selPath.closed;
        if (selPath.closed && vecPenActivePathId === selPath.id) vecPenActivePathId = null;
        host.renderVectorLayer();
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(12);
      }
    };
    document.getElementById('btn-ip-vecbar-closed')?.addEventListener('click', toggleVectorClosedLoop);
    document.getElementById('btn-ip-vecbar-close-loop')?.addEventListener('click', toggleVectorClosedLoop);
    document.getElementById('btn-ip-sheet-vec-closed')?.addEventListener('click', toggleVectorClosedLoop);
    document.getElementById('btn-sheet-vec-close-loop')?.addEventListener('click', toggleVectorClosedLoop);

    const selectAllVecNodes = () => {
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (selPath && Array.isArray(selPath.nodes)) {
        host.selectVectorNodes(selPath.id, selPath.nodes.map((_, i) => i), false);
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(10);
      }
    };
    document.getElementById('btn-ip-vecbar-sel-all')?.addEventListener('click', selectAllVecNodes);
    document.getElementById('btn-ip-vecbar-sel-all-nodes')?.addEventListener('click', selectAllVecNodes);
    document.getElementById('btn-ip-sheet-vec-sel-all')?.addEventListener('click', selectAllVecNodes);
    document.getElementById('btn-sheet-vec-sel-all')?.addEventListener('click', selectAllVecNodes);

    const selectNoneVecNodes = () => {
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (selPath) {
        host.selectVectorNodes(selPath.id, [], false);
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(10);
      }
    };
    document.getElementById('btn-ip-vecbar-sel-none')?.addEventListener('click', selectNoneVecNodes);
    document.getElementById('btn-ip-vecbar-sel-none-nodes')?.addEventListener('click', selectNoneVecNodes);
    document.getElementById('btn-ip-sheet-vec-sel-none')?.addEventListener('click', selectNoneVecNodes);

    document.getElementById('btn-ip-vecbar-marquee-add')?.addEventListener('click', () => {
      host.vecMarqueeAdditive = !host.vecMarqueeAdditive;
      syncUiFromHost();
      triggerHaptic(10);
    });

    const applyVectorTaper = () => {
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (selPath && Array.isArray(selPath.nodes) && selPath.nodes.length >= 2) {
        host.pushUndoSnapshot('taper vector stroke');
        const count = selPath.nodes.length;
        selPath.nodes.forEach((nd, idx) => {
          const t = count > 1 ? idx / (count - 1) : 0.5;
          const bell = Math.sin(t * Math.PI);
          nd.widthScale = Number((0.22 + 0.93 * bell).toFixed(2));
        });
        host.renderVectorLayer();
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(12);
      }
    };
    document.getElementById('btn-ip-vecbar-taper')?.addEventListener('click', applyVectorTaper);
    document.getElementById('btn-ip-sheet-vec-taper')?.addEventListener('click', applyVectorTaper);

    document.querySelectorAll('.ip-vecbar-curvemode, .ip-vecbar-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        const cm = btn.dataset.vecmode || 'bezier';
        host.vectorCurveMode = cm;
        const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
        if (host.actionMode === 'vector' && selPath && typeof selPath.simplify === 'function') {
          host.pushUndoSnapshot('vector curve mode');
          selPath.simplify(host.vectorFitTolerance || 2.5, cm === 'bezier');
          host.renderVectorLayer();
        }
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(10);
      });
    });

    document.querySelectorAll('.ip-vecbar-nodetype').forEach(btn => {
      btn.addEventListener('click', () => {
        const nt = btn.dataset.nodetype || 'smooth';
        const vl = host.getVectorLayer ? host.getVectorLayer() : null;
        const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
        if (vl && selPath && typeof selPath.setNodeType === 'function') {
          host.pushUndoSnapshot('set vector node type');
          const selArr = host.getSelectedVectorNodeIndices ? host.getSelectedVectorNodeIndices() : [];
          const selSet = new Set(Array.isArray(selArr) ? selArr : []);
          if (selSet.size > 0) {
            selSet.forEach(idx => {
              if (idx >= 0 && idx < selPath.nodes.length) selPath.setNodeType(idx, nt);
            });
          } else if (vl.selectedNodeIdx >= 0 && vl.selectedNodeIdx < selPath.nodes.length) {
            selPath.setNodeType(vl.selectedNodeIdx, nt);
          } else {
            for (let i = 0; i < selPath.nodes.length; i++) selPath.setNodeType(i, nt);
          }
          host.renderVectorLayer();
          markCanvasDirty();
          syncUiFromHost();
          triggerHaptic(10);
        }
      });
    });

    const vecWidthSlider = document.getElementById('ip-vecbar-width-slider');
    const vecWidthVal = document.getElementById('ip-vecbar-width-val');
    if (vecWidthSlider) {
      let vecWidthUndoPushed = false;
      const finishVecWidthDrag = () => {
        if (!vecWidthDragging) return;
        vecWidthDragging = false;
        host.renderVectorLayer();
        markCanvasDirty();
        syncUiFromHost();
      };
      vecWidthSlider.addEventListener('pointerdown', () => { vecWidthUndoPushed = false; });
      vecWidthSlider.addEventListener('touchstart', () => { vecWidthUndoPushed = false; }, { passive: true });
      vecWidthSlider.addEventListener('input', () => {
        const pct = parseInt(vecWidthSlider.value, 10) || 100;
        if (vecWidthVal) vecWidthVal.textContent = `${pct}%`;
        const vl = host.getVectorLayer ? host.getVectorLayer() : null;
        const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
        if (vl && selPath && Array.isArray(selPath.nodes)) {
          if (!vecWidthUndoPushed) {
            host.pushUndoSnapshot('vector node width');
            vecWidthUndoPushed = true;
          }
          const scale = Math.max(0.1, Math.min(3.0, pct / 100));
          const selArr = host.getSelectedVectorNodeIndices ? host.getSelectedVectorNodeIndices() : [];
          const selSet = new Set(Array.isArray(selArr) ? selArr : []);
          if (selSet.size > 0) {
            selSet.forEach(idx => {
              if (selPath.nodes[idx]) selPath.nodes[idx].widthScale = scale;
            });
          } else if (vl.selectedNodeIdx >= 0 && vl.selectedNodeIdx < selPath.nodes.length) {
            selPath.nodes[vl.selectedNodeIdx].widthScale = scale;
          } else {
            selPath.nodes.forEach(n => { n.widthScale = scale; });
          }
          vecWidthDragging = true;
          markCanvasDirty();
        }
      });
      vecWidthSlider.addEventListener('change', finishVecWidthDrag);
      vecWidthSlider.addEventListener('pointerup', finishVecWidthDrag);
      vecWidthSlider.addEventListener('pointercancel', finishVecWidthDrag);
      vecWidthSlider.addEventListener('touchend', finishVecWidthDrag, { passive: true });
    }

    const doVecAddNode = () => {
      const vl = host.getVectorLayer ? host.getVectorLayer() : null;
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (vl && selPath && selPath.nodes.length >= 2 && typeof selPath.splitSegment === 'function') {
        host.pushUndoSnapshot('add vector node');
        const segCount = selPath.closed ? selPath.nodes.length : selPath.nodes.length - 1;
        const segIdx = (vl.selectedNodeIdx >= 0 && vl.selectedNodeIdx < segCount)
          ? vl.selectedNodeIdx
          : Math.floor((segCount - 1) / 2);
        const splitRes = selPath.splitSegment(segIdx, 0.5);
        const newIdx = (splitRes && typeof splitRes === 'object') ? splitRes.index : splitRes;
        host.selectVectorPath(selPath.id, newIdx);
        host.renderVectorLayer();
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(12);
      }
    };
    document.getElementById('btn-ip-vecbar-add-node')?.addEventListener('click', doVecAddNode);
    document.getElementById('btn-ip-sheet-vec-add-node')?.addEventListener('click', doVecAddNode);
    document.getElementById('btn-sheet-vec-add-node')?.addEventListener('click', doVecAddNode);

    const doVecDelNode = () => {
      const vl = host.getVectorLayer ? host.getVectorLayer() : null;
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (vl && selPath) {
        const selIndices = (vl.selectedNodeIndices instanceof Set && vl.selectedNodeIndices.size > 0)
          ? Array.from(vl.selectedNodeIndices).sort((a, b) => b - a)
          : (vl.selectedNodeIdx >= 0 ? [vl.selectedNodeIdx] : []);
        if (selIndices.length > 0 && (selPath.nodes.length - selIndices.length) >= 2) {
          host.pushUndoSnapshot('delete vector nodes');
          if (typeof selPath.removeNodes === 'function') {
            selPath.removeNodes(selIndices);
          } else {
            for (const idx of selIndices) selPath.removeNode(idx);
          }
          const nextIdx = Math.min(selIndices[selIndices.length - 1], selPath.nodes.length - 1);
          host.selectVectorPath(selPath.id, nextIdx);
          host.renderVectorLayer();
          markCanvasDirty();
          syncUiFromHost();
          triggerHaptic(12);
        } else {
          host.pushUndoSnapshot('delete vector path');
          vl.paths = vl.paths.filter(p => p.id !== selPath.id);
          vl.selectedPathId = vl.paths.length > 0 ? vl.paths[vl.paths.length - 1].id : null;
          vl.selectedNodeIdx = -1;
          if (vl.selectedNodeIndices instanceof Set) vl.selectedNodeIndices.clear();
          if (vecPenActivePathId === selPath.id) vecPenActivePathId = null;
          host.renderVectorLayer();
          markCanvasDirty();
          syncUiFromHost();
          triggerHaptic(12);
        }
      }
    };
    document.getElementById('btn-ip-vecbar-del-node')?.addEventListener('click', doVecDelNode);
    document.getElementById('btn-ip-sheet-vec-del-node')?.addEventListener('click', doVecDelNode);
    document.getElementById('btn-sheet-vec-del-node')?.addEventListener('click', doVecDelNode);

    const doVecSimplify = () => {
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (selPath && typeof selPath.simplify === 'function') {
        host.pushUndoSnapshot('simplify vector path');
        selPath.simplify((host.vectorFitTolerance || 2.5) * 1.4, host.vectorCurveMode !== 'raw');
        host.renderVectorLayer();
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(12);
      }
    };
    document.getElementById('btn-ip-vecbar-simplify')?.addEventListener('click', doVecSimplify);
    document.getElementById('btn-ip-sheet-vec-simplify')?.addEventListener('click', doVecSimplify);
    document.getElementById('btn-sheet-vec-simplify')?.addEventListener('click', doVecSimplify);

    const doVecDelPath = () => {
      const vl = host.getVectorLayer ? host.getVectorLayer() : null;
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (vl && selPath) {
        host.pushUndoSnapshot('delete vector path');
        vl.paths = vl.paths.filter(p => p.id !== selPath.id);
        vl.selectedPathId = vl.paths.length > 0 ? vl.paths[vl.paths.length - 1].id : null;
        vl.selectedNodeIdx = -1;
        if (vl.selectedNodeIndices instanceof Set) vl.selectedNodeIndices.clear();
        if (vecPenActivePathId === selPath.id) vecPenActivePathId = null;
        host.renderVectorLayer();
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(15);
      }
    };
    document.getElementById('btn-ip-vecbar-del-path')?.addEventListener('click', doVecDelPath);
    document.getElementById('btn-ip-sheet-vec-del-path')?.addEventListener('click', doVecDelPath);

    const doVecRasterize = () => {
      if (host.isVectorLayer && host.isVectorLayer()) {
        vecPenActivePathId = null;
        runCmd('rasterize layer');
        host.setActionMode('draw');
        syncUiFromHost();
        triggerHaptic(15);
      }
    };
    document.getElementById('btn-ip-vecbar-rasterize')?.addEventListener('click', doVecRasterize);
    document.getElementById('btn-ip-sheet-vec-bake')?.addEventListener('click', doVecRasterize);
    document.getElementById('btn-sheet-vec-bake')?.addEventListener('click', doVecRasterize);
    document.getElementById('btn-top-vec-bake')?.addEventListener('click', doVecRasterize);
    document.getElementById('btn-ip-export-svg-menu')?.addEventListener('click', exportVectorLayerSvg);
    document.getElementById('btn-sheet-vec-taper')?.addEventListener('click', applyVectorTaper);
    document.getElementById('btn-vec-path-delete')?.addEventListener('click', doVecDelPath);

    const doVecDuplicatePath = () => {
      const vl = host.getVectorLayer ? host.getVectorLayer() : null;
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (vl && selPath && typeof selPath.clone === 'function') {
        host.pushUndoSnapshot('duplicate vector path');
        const copy = selPath.clone();
        copy.name = `${selPath.name || 'Path'} Copy`;
        if (typeof copy.translate === 'function') copy.translate(16, 16);
        vl.paths.push(copy);
        host.selectVectorPath(copy.id, 0);
        host.renderVectorLayer();
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(12);
      }
    };
    document.getElementById('btn-ip-vecbar-dup-path')?.addEventListener('click', doVecDuplicatePath);
    document.getElementById('btn-vec-path-dup')?.addEventListener('click', doVecDuplicatePath);

    const doVecToggleFill = () => {
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (selPath) {
        host.pushUndoSnapshot('toggle vector fill');
        const hasFill = selPath.fill && selPath.fill !== 'none';
        const fillInput = document.getElementById('ip-vec-fill-color');
        selPath.fill = hasFill ? 'none' : ((fillInput && fillInput.value) || selPath.stroke || host._colorToHex(host.currentColor));
        if (!hasFill) selPath.closed = true;
        host.renderVectorLayer();
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(12);
      }
    };
    document.getElementById('btn-ip-vecbar-fill-toggle')?.addEventListener('click', doVecToggleFill);

    // Boolean Path Operations (Union, Subtract, Intersect, Exclude)
    document.querySelectorAll('.btn-vec-boolean').forEach(btn => {
      btn.addEventListener('click', () => {
        const op = btn.dataset.boolop || 'union';
        if (host.performVectorBooleanOp && host.performVectorBooleanOp(op)) {
          markCanvasDirty();
          syncUiFromHost();
          triggerHaptic(15);
        }
      });
    });

    // Stroke & Fill Surface Inspector
    const inpVecStrokeCol = document.getElementById('ip-vec-stroke-color');
    inpVecStrokeCol?.addEventListener('input', (e) => {
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (selPath) {
        selPath.stroke = e.target.value;
        host.renderVectorLayer();
        markCanvasDirty();
        syncUiFromHost();
      }
    });

    const inpVecStrokeWidth = document.getElementById('ip-vec-stroke-width');
    const lblVecStrokeWidth = document.getElementById('ip-vec-stroke-width-val');
    inpVecStrokeWidth?.addEventListener('input', (e) => {
      const sw = Math.max(1, parseInt(e.target.value, 10) || 1);
      if (lblVecStrokeWidth) lblVecStrokeWidth.textContent = `${sw}px`;
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (selPath) {
        selPath.strokeWidth = sw;
        if (selPath.brushConfig) selPath.brushConfig.size = sw;
        host.renderVectorLayer();
        markCanvasDirty();
      }
    });

    const chkVecFillEnabled = document.getElementById('chk-ip-vec-fill-enabled');
    const inpVecFillCol = document.getElementById('ip-vec-fill-color');
    chkVecFillEnabled?.addEventListener('change', (e) => {
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (selPath) {
        host.pushUndoSnapshot('toggle vector fill');
        selPath.fill = e.target.checked ? ((inpVecFillCol && inpVecFillCol.value) || selPath.stroke || '#8ec07c') : 'none';
        if (e.target.checked) selPath.closed = true;
        host.renderVectorLayer();
        markCanvasDirty();
        syncUiFromHost();
      }
    });
    inpVecFillCol?.addEventListener('input', (e) => {
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (selPath) {
        if (chkVecFillEnabled) chkVecFillEnabled.checked = true;
        selPath.fill = e.target.value;
        selPath.closed = true;
        host.renderVectorLayer();
        markCanvasDirty();
        syncUiFromHost();
      }
    });

    document.getElementById('btn-ip-vec-apply-active-brush')?.addEventListener('click', () => {
      if (host.applyCurrentBrushStyleToSelectedVectorPaths) {
        host.pushUndoSnapshot('apply brush to vector path');
        host.applyCurrentBrushStyleToSelectedVectorPaths({ all: true, color: true });
        markCanvasDirty();
        syncUiFromHost();
        triggerHaptic(12);
      }
    });

    // Path Geometry Transform & Z-Order
    const transformSelectedVecPath = (fn) => {
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (!selPath || typeof selPath.getBounds !== 'function') return;
      host.pushUndoSnapshot('transform vector path');
      const b = selPath.getBounds();
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      fn(selPath, cx, cy, b);
      host.renderVectorLayer();
      markCanvasDirty();
      syncUiFromHost();
      triggerHaptic(10);
    };
    document.getElementById('btn-vec-path-rot-ccw')?.addEventListener('click', () => {
      transformSelectedVecPath((p, cx, cy) => { if (typeof p.rotate === 'function') p.rotate(-Math.PI / 2, cx, cy); });
    });
    document.getElementById('btn-vec-path-rot-cw')?.addEventListener('click', () => {
      transformSelectedVecPath((p, cx, cy) => { if (typeof p.rotate === 'function') p.rotate(Math.PI / 2, cx, cy); });
    });
    document.getElementById('btn-vec-path-fliph')?.addEventListener('click', () => {
      transformSelectedVecPath((p, cx, cy) => { if (typeof p.scale === 'function') p.scale(-1, 1, cx, cy); });
    });
    document.getElementById('btn-vec-path-flipv')?.addEventListener('click', () => {
      transformSelectedVecPath((p, cx, cy) => { if (typeof p.scale === 'function') p.scale(1, -1, cx, cy); });
    });
    document.getElementById('btn-vec-path-scale-down')?.addEventListener('click', () => {
      transformSelectedVecPath((p, cx, cy) => { if (typeof p.scale === 'function') p.scale(0.9, 0.9, cx, cy); });
    });
    document.getElementById('btn-vec-path-scale-up')?.addEventListener('click', () => {
      transformSelectedVecPath((p, cx, cy) => { if (typeof p.scale === 'function') p.scale(1.1, 1.1, cx, cy); });
    });
    document.getElementById('btn-vec-path-center')?.addEventListener('click', () => {
      transformSelectedVecPath((p, cx, cy) => {
        const cw = host.canvasActor?.exports?.get_canvas_width ? host.canvasActor.exports.get_canvas_width() : 1280;
        const ch = host.canvasActor?.exports?.get_canvas_height ? host.canvasActor.exports.get_canvas_height() : 720;
        if (typeof p.translate === 'function') p.translate((cw / 2) - cx, (ch / 2) - cy);
      });
    });

    const moveSelectedVecPathOrder = (delta) => {
      const vl = host.getVectorLayer ? host.getVectorLayer() : null;
      const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
      if (!vl || !selPath || !Array.isArray(vl.paths)) return;
      const idx = vl.paths.findIndex(p => p.id === selPath.id);
      const nextIdx = idx + delta;
      if (idx < 0 || nextIdx < 0 || nextIdx >= vl.paths.length) return;
      host.pushUndoSnapshot('reorder vector path');
      const [item] = vl.paths.splice(idx, 1);
      vl.paths.splice(nextIdx, 0, item);
      host.renderVectorLayer();
      markCanvasDirty();
      syncUiFromHost();
      triggerHaptic(10);
    };
    document.getElementById('btn-vec-path-forward')?.addEventListener('click', () => moveSelectedVecPathOrder(1));
    document.getElementById('btn-vec-path-backward')?.addEventListener('click', () => moveSelectedVecPathOrder(-1));

    const createAndActivateVectorLayer = () => {
      vecPenActivePathId = null;
      runCmd('new vector layer');
      host.vectorSubTool = 'nodes';
      host.setActionMode('vector');
      markCanvasDirty();
      syncUiFromHost();
      triggerHaptic(12);
    };
    document.getElementById('btn-sheet-vec-new-layer')?.addEventListener('click', createAndActivateVectorLayer);

    const btnVecClose = document.getElementById('btn-ip-vecbar-close');
    if (btnVecClose) {
      btnVecClose.addEventListener('click', () => {
        vecPenActivePathId = null;
        if (host.selectVectorPath) host.selectVectorPath(null, -1);
        host.setActionMode('draw');
        syncUiFromHost();
        triggerHaptic(12);
      });
    }

    const sliderSheetVecTol = document.getElementById('ip-sheet-slider-vec-tol');
    const lblSheetVecTol = document.getElementById('ip-sheet-vec-tol-val');
    if (sliderSheetVecTol) {
      sliderSheetVecTol.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 2.5;
        host.vectorFitTolerance = val;
        if (lblSheetVecTol) lblSheetVecTol.textContent = val.toFixed(1);
      });
    }

    // Selection Modes in Sheet & Floating Selection Bar
    document.querySelectorAll('#sheet-tools .ip-selmode-card, .ip-selbar-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        const sm = btn.dataset.selmode || 'replace';
        host.setSelectionMode(sm);
        syncUiFromHost();
        triggerHaptic(10);
      });
    });

    document.querySelectorAll('.ip-selbar-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        const st = btn.dataset.seltool;
        host.setActionMode('select');
        host.currentTool = st;
        if (st === 'select_rect' || st === 'select') host.setBrushParam('mode', 9);
        else if (st === 'lasso_select') host.setBrushParam('mode', 10);
        else if (st === 'magic_wand') host.setBrushParam('mode', 11);
        else host.setBrushParam('mode', 0);
        syncUiFromHost();
        triggerHaptic(12);
      });
    });

    document.getElementById('btn-ip-selbar-transform')?.addEventListener('click', () => { runCmd('transform'); });
    document.getElementById('btn-ip-selbar-all')?.addEventListener('click', () => { runCmd('select all'); syncUiFromHost(); triggerHaptic(10); });
    document.getElementById('btn-ip-selbar-invert')?.addEventListener('click', () => { runCmd('select invert'); syncUiFromHost(); triggerHaptic(10); });
    document.getElementById('btn-ip-selbar-clear')?.addEventListener('click', () => {
      runCmd('select clear');
      syncUiFromHost();
      triggerHaptic(10);
    });
    document.getElementById('btn-ip-selbar-copy')?.addEventListener('click', () => { runCmd('copy'); triggerHaptic(10); });
    document.getElementById('btn-ip-selbar-cut')?.addEventListener('click', () => { runCmd('cut'); triggerHaptic(10); });
    document.getElementById('btn-ip-selbar-paste')?.addEventListener('click', () => { runCmd('paste'); triggerHaptic(10); });
    document.getElementById('btn-ip-selbar-erase')?.addEventListener('click', () => { runCmd('clear'); triggerHaptic(12); });
    document.getElementById('btn-ip-selbar-crop')?.addEventListener('click', () => { runCmd('crop'); syncUiFromHost(); triggerHaptic(12); });
    document.getElementById('btn-ip-crop-sel')?.addEventListener('click', () => { runCmd('crop'); syncUiFromHost(); triggerHaptic(12); });

    const btnSelbarClose = document.getElementById('btn-ip-selbar-close');
    if (btnSelbarClose) {
      btnSelbarClose.addEventListener('click', () => {
        if (typeof host.clearSelection === 'function') host.clearSelection();
        host.setActionMode('draw');
        if (host.currentTool === 'select_rect' || host.currentTool === 'lasso_select' || host.currentTool === 'magic_wand') {
          host.currentTool = 'brush';
          host.setBrushParam('mode', 0);
        }
        syncUiFromHost();
        triggerHaptic(15);
      });
    }

    // Wand Sheet & Floating Bar Controls
    const sliderSheetWand = document.getElementById('ip-sheet-slider-wand-tol');
    const lblSheetWand = document.getElementById('ip-sheet-wand-tol-val');
    const sliderSelbarWand = document.getElementById('ip-selbar-wand-tol');
    const lblSelbarWand = document.getElementById('ip-selbar-wand-tol-val');
    const syncWandTol = (val) => {
      const v = Math.max(0, Math.min(255, parseInt(val, 10) || 0));
      host.wandTolerance = v;
      if (sliderSheetWand && document.activeElement !== sliderSheetWand) sliderSheetWand.value = v;
      if (lblSheetWand) lblSheetWand.textContent = v;
      if (sliderSelbarWand && document.activeElement !== sliderSelbarWand) sliderSelbarWand.value = v;
      if (lblSelbarWand) lblSelbarWand.textContent = v;
    };
    sliderSheetWand?.addEventListener('input', (e) => syncWandTol(e.target.value));
    sliderSelbarWand?.addEventListener('input', (e) => syncWandTol(e.target.value));

    const chkSheetWandAdj = document.getElementById('ip-sheet-wand-adj');
    const chkSelbarWandAdj = document.getElementById('ip-selbar-wand-adj');
    const syncWandAdj = (checked) => {
      host.wandAdjacent = !!checked;
      if (chkSheetWandAdj) chkSheetWandAdj.checked = host.wandAdjacent;
      if (chkSelbarWandAdj) chkSelbarWandAdj.checked = host.wandAdjacent;
    };
    chkSheetWandAdj?.addEventListener('change', (e) => syncWandAdj(e.target.checked));
    chkSelbarWandAdj?.addEventListener('change', (e) => syncWandAdj(e.target.checked));

    // Tools Sheet Cards
    document.querySelectorAll('#sheet-tools .ip-tool-card').forEach(card => {
      card.addEventListener('click', () => {
        const tool = card.dataset.tool;
        if (!tool) return;
        if (tool === 'transform') {
          host.startTransform();
          switchToolsSheetTab('transform');
        } else if (tool === 'pen_tool') {
          host.vectorSubTool = 'pen';
          host.setActionMode('vector');
          if (host.enableVectorLayer) host.enableVectorLayer();
          vecPenActivePathId = null;
          markCanvasDirty();
        } else if (tool === 'select_rect' || tool === 'select') {
          host.setActionMode('select');
          host.currentTool = 'select_rect';
          host.setBrushParam('mode', 9);
        } else if (tool === 'lasso_select') {
          host.setActionMode('select');
          host.currentTool = 'lasso_select';
          host.setBrushParam('mode', 10);
        } else if (tool === 'magic_wand') {
          host.setActionMode('select');
          host.currentTool = 'magic_wand';
          host.setBrushParam('mode', 11);
        } else if (tool === 'brush_select') {
          host.setActionMode('select');
          host.currentTool = 'brush';
          host.setBrushParam('mode', 0);
        } else {
          vecPenActivePathId = null;
          if (host.actionMode === 'select' || host.actionMode === 'vector') {
            host.setActionMode('draw');
          }
          if (host.isVectorLayer && host.isVectorLayer()) {
            host.vectorSubTool = (tool === 'brush') ? 'draw' : tool;
          }
          const modeMap = { brush: 0, smudge: 1, blend: 2, fill: 3, lasso_fill: 4, picker: 5, line: 6, rect: 7, ellipse: 8 };
          const modeIdx = modeMap[tool] !== undefined ? modeMap[tool] : 0;
          host.currentTool = tool;
          host.setBrushParam('mode', modeIdx);
        }
        syncUiFromHost();
        triggerHaptic(12);
      });
    });

    // Symmetry buttons in Tools panel
    document.querySelectorAll('#sheet-tools .ip-sym-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const symVal = parseInt(btn.dataset.sym, 10) || 0;
        runCmd(`set symmetry ${symVal}`);
        syncUiFromHost();
        triggerHaptic(10);
      });
    });

    // Paint / Erase Inside Active Selection (Keep Mask)
    document.getElementById('btn-ip-sel-paint-inside')?.addEventListener('click', () => {
      host.setActionMode('draw');
      host.currentTool = 'brush';
      host.setBrushParam('mode', 0);
      switchToolsSheetTab('draw');
      syncUiFromHost();
      triggerHaptic(12);
    });
    document.getElementById('btn-ip-sel-erase-inside')?.addEventListener('click', () => {
      host.setActionMode('erase');
      host.currentTool = 'brush';
      host.setBrushParam('mode', 0);
      switchToolsSheetTab('draw');
      syncUiFromHost();
      triggerHaptic(12);
    });

    // Selection & Transform buttons in Sheet & Floating Transform Bar
    document.getElementById('btn-ip-copy')?.addEventListener('click', () => { runCmd('copy'); });
    document.getElementById('btn-ip-cut')?.addEventListener('click', () => { runCmd('cut'); });
    document.getElementById('btn-ip-paste')?.addEventListener('click', () => { runCmd('paste'); });
    document.getElementById('btn-ip-deselect')?.addEventListener('click', () => { runCmd('deselect'); });
    document.getElementById('btn-ip-select-all')?.addEventListener('click', () => { runCmd('select all'); });
    document.getElementById('btn-ip-invert-sel')?.addEventListener('click', () => { runCmd('select invert'); });
    document.getElementById('btn-ip-crop-sel')?.addEventListener('click', () => { runCmd('crop'); });
    document.getElementById('btn-ip-sel-clear-pixels')?.addEventListener('click', () => { runCmd('clear'); });
    document.getElementById('btn-ip-sel-capture-tip')?.addEventListener('click', () => { runCmd('brush capture tip'); });
    document.getElementById('btn-ip-sel-capture-grain')?.addEventListener('click', () => { runCmd('brush capture grain'); });
    const handleTransformBtn = () => {
      runCmd('transform');
      if (typeof switchToolsSheetTab === 'function') switchToolsSheetTab('transform');
      markCanvasDirty();
      syncUiFromHost();
    };
    document.getElementById('btn-ip-transform')?.addEventListener('click', handleTransformBtn);
    document.getElementById('btn-ip-tool-transform')?.addEventListener('click', handleTransformBtn);
    document.getElementById('btn-ip-xform-apply')?.addEventListener('click', () => { runCmd('transform apply'); });
    document.getElementById('btn-ip-xform-cancel')?.addEventListener('click', () => { runCmd('transform cancel'); });

    document.querySelectorAll('.ip-xbar-mode, .ip-sheet-xform-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        host.transformMode = btn.dataset.xmode || 'scale';
        syncUiFromHost();
        triggerHaptic(10);
      });
    });

    const toggleTransformLockAspect = () => {
      host.transformLockAspect = !host.transformLockAspect;
      syncUiFromHost();
      triggerHaptic(10);
    };
    document.getElementById('btn-ip-xbar-lock-aspect')?.addEventListener('click', toggleTransformLockAspect);
    document.getElementById('btn-ip-xbar-aspect')?.addEventListener('click', toggleTransformLockAspect);
    document.getElementById('btn-ip-sheet-xform-lock')?.addEventListener('click', toggleTransformLockAspect);

    document.getElementById('btn-ip-xbar-interp')?.addEventListener('click', () => {
      host.transformInterpolation = host.transformInterpolation === 'bilinear' ? 'nearest' : 'bilinear';
      if (host.floatingTransform) bakeFtPreview();
      syncUiFromHost();
      triggerHaptic(10);
    });
    document.querySelectorAll('.ip-sheet-xform-interp').forEach(btn => {
      btn.addEventListener('click', () => {
        host.transformInterpolation = btn.dataset.xinterp || 'nearest';
        if (host.floatingTransform) bakeFtPreview();
        syncUiFromHost();
        triggerHaptic(10);
      });
    });

    const ensureTransformStarted = () => {
      if (!host.floatingTransform && typeof host.startTransform === 'function') {
        host.startTransform();
      }
    };
    document.getElementById('btn-ip-xbar-apply')?.addEventListener('click', () => { runCmd('transform apply'); });
    document.getElementById('btn-ip-xbar-cancel')?.addEventListener('click', () => { runCmd('transform cancel'); });
    document.getElementById('btn-ip-xbar-rot-ccw')?.addEventListener('click', () => { runCmd('transform rotate -90'); triggerHaptic(10); });
    document.getElementById('btn-ip-xbar-rot-cw')?.addEventListener('click', () => { runCmd('transform rotate 90'); triggerHaptic(10); });
    document.getElementById('btn-ip-xbar-rot-180')?.addEventListener('click', () => { runCmd('transform rotate 90'); runCmd('transform rotate 90'); triggerHaptic(10); });
    document.getElementById('btn-ip-xbar-fliph')?.addEventListener('click', () => { runCmd('transform flip h'); triggerHaptic(10); });
    document.getElementById('btn-ip-xbar-flipv')?.addEventListener('click', () => { runCmd('transform flip v'); triggerHaptic(10); });
    document.getElementById('btn-ip-xbar-center')?.addEventListener('click', () => {
      ensureTransformStarted();
      if (host.centerFloatTransform) host.centerFloatTransform();
      bakeFtPreview();
      syncUiFromHost();
      triggerHaptic(10);
    });
    document.getElementById('btn-ip-xbar-fit')?.addEventListener('click', () => {
      ensureTransformStarted();
      if (host.fitFloatTransformToCanvas) host.fitFloatTransformToCanvas();
      bakeFtPreview();
      syncUiFromHost();
      triggerHaptic(10);
    });
    document.getElementById('btn-ip-xbar-reset')?.addEventListener('click', () => { runCmd('transform reset'); triggerHaptic(10); });

    const bindXformSheetBtn = (ids, fn) => ids.forEach(id => document.getElementById(id)?.addEventListener('click', fn));
    bindXformSheetBtn(['btn-ip-sheet-xform-ccw', 'btn-sheet-xform-ccw'], () => { ensureTransformStarted(); runCmd('transform rotate -90'); triggerHaptic(10); });
    bindXformSheetBtn(['btn-ip-sheet-xform-cw', 'btn-sheet-xform-cw'], () => { ensureTransformStarted(); runCmd('transform rotate 90'); triggerHaptic(10); });
    bindXformSheetBtn(['btn-ip-sheet-xform-180'], () => { ensureTransformStarted(); runCmd('transform rotate 90'); runCmd('transform rotate 90'); triggerHaptic(10); });
    bindXformSheetBtn(['btn-ip-sheet-xform-fliph', 'btn-sheet-xform-fliph'], () => { ensureTransformStarted(); runCmd('transform flip h'); triggerHaptic(10); });
    bindXformSheetBtn(['btn-ip-sheet-xform-flipv', 'btn-sheet-xform-flipv'], () => { ensureTransformStarted(); runCmd('transform flip v'); triggerHaptic(10); });
    bindXformSheetBtn(['btn-ip-sheet-xform-center', 'btn-sheet-xform-center'], () => {
      ensureTransformStarted();
      if (host.centerFloatTransform) host.centerFloatTransform();
      bakeFtPreview();
      syncUiFromHost();
      triggerHaptic(10);
    });
    bindXformSheetBtn(['btn-ip-sheet-xform-fit', 'btn-sheet-xform-fit'], () => {
      ensureTransformStarted();
      if (host.fitFloatTransformToCanvas) host.fitFloatTransformToCanvas();
      bakeFtPreview();
      syncUiFromHost();
      triggerHaptic(10);
    });
    bindXformSheetBtn(['btn-ip-sheet-xform-reset', 'btn-sheet-xform-reset'], () => { ensureTransformStarted(); runCmd('transform reset'); triggerHaptic(10); });

    // Animation Tab Controls in #sheet-tools
    bindXformSheetBtn(['btn-ip-sheet-anim-toggle-dock', 'btn-sheet-anim-toggle-dock'], () => {
      if (window.isDockviewPainter && typeof window.openPainterDockPanel === 'function') {
        window.openPainterDockPanel('timeline');
      } else if (host.rasterAnimatorUI) {
        host.rasterAnimatorUI.toggle();
        updateAnimTimelineDockOffset();
      }
      syncUiFromHost();
      triggerHaptic(12);
    });
    bindXformSheetBtn(['btn-ip-sheet-anim-play', 'btn-sheet-anim-play'], () => {
      if (host.rasterAnimator) {
        host.rasterAnimator.togglePlay();
        if (host.rasterAnimatorUI) host.rasterAnimatorUI.syncUI();
        syncUiFromHost();
        triggerHaptic(10);
      }
    });
    bindXformSheetBtn(['btn-sheet-anim-prev'], () => {
      if (host.rasterAnimator && typeof host.rasterAnimator.prevFrame === 'function') {
        host.rasterAnimator.prevFrame();
        if (host.rasterAnimatorUI) host.rasterAnimatorUI.syncUI();
        syncUiFromHost();
        triggerHaptic(10);
      }
    });
    bindXformSheetBtn(['btn-sheet-anim-next'], () => {
      if (host.rasterAnimator && typeof host.rasterAnimator.nextFrame === 'function') {
        host.rasterAnimator.nextFrame();
        if (host.rasterAnimatorUI) host.rasterAnimatorUI.syncUI();
        syncUiFromHost();
        triggerHaptic(10);
      }
    });
    bindXformSheetBtn(['btn-ip-sheet-anim-add', 'btn-sheet-anim-add'], () => {
      if (host.rasterAnimator) {
        host.rasterAnimator.addFrame(false);
        if (host.rasterAnimatorUI) host.rasterAnimatorUI.syncUI();
        syncUiFromHost();
        triggerHaptic(10);
      }
    });
    bindXformSheetBtn(['btn-ip-sheet-anim-dup', 'btn-sheet-anim-dup'], () => {
      if (host.rasterAnimator) {
        host.rasterAnimator.duplicateFrame();
        if (host.rasterAnimatorUI) host.rasterAnimatorUI.syncUI();
        syncUiFromHost();
        triggerHaptic(10);
      }
    });
    bindXformSheetBtn(['btn-ip-sheet-anim-clear'], () => {
      if (host.rasterAnimator) {
        host.rasterAnimator.clearFrame();
        if (host.rasterAnimatorUI) host.rasterAnimatorUI.syncUI();
        syncUiFromHost();
        triggerHaptic(10);
      }
    });
    bindXformSheetBtn(['btn-ip-sheet-anim-del', 'btn-sheet-anim-del'], () => {
      if (host.rasterAnimator) {
        host.rasterAnimator.deleteFrame();
        if (host.rasterAnimatorUI) host.rasterAnimatorUI.syncUI();
        syncUiFromHost();
        triggerHaptic(12);
      }
    });
    bindXformSheetBtn(['btn-ip-sheet-anim-onion', 'btn-sheet-anim-onion'], () => {
      if (host.rasterAnimator) {
        host.rasterAnimator.toggleOnionSkin();
        if (host.rasterAnimatorUI) host.rasterAnimatorUI.syncUI();
        syncUiFromHost();
        triggerHaptic(10);
      }
    });
    bindXformSheetBtn(['btn-ip-sheet-anim-loop'], () => {
      if (host.rasterAnimator) {
        host.rasterAnimator.loop = !host.rasterAnimator.loop;
        if (host.rasterAnimatorUI) host.rasterAnimatorUI.syncUI();
        syncUiFromHost();
        triggerHaptic(10);
      }
    });
    document.getElementById('btn-sheet-anim-dur-dec')?.addEventListener('click', () => {
      if (host.rasterAnimator) {
        const cur = host.rasterAnimator.frames[host.rasterAnimator.currentFrameIndex];
        const nextDur = Math.max(1, (cur?.duration || 1) - 1);
        host.rasterAnimator.setFrameDuration(nextDur);
        syncUiFromHost();
        triggerHaptic(8);
      }
    });
    document.getElementById('btn-sheet-anim-dur-inc')?.addEventListener('click', () => {
      if (host.rasterAnimator) {
        const cur = host.rasterAnimator.frames[host.rasterAnimator.currentFrameIndex];
        const nextDur = (cur?.duration || 1) + 1;
        host.rasterAnimator.setFrameDuration(nextDur);
        syncUiFromHost();
        triggerHaptic(8);
      }
    });
    document.getElementById('ip-sheet-anim-duration')?.addEventListener('change', (e) => {
      if (host.rasterAnimator) {
        const nextDur = Math.max(1, Math.round(Number(e.target.value) || 1));
        host.rasterAnimator.setFrameDuration(nextDur);
        syncUiFromHost();
      }
    });
    document.getElementById('ip-sheet-slider-anim-fps')?.addEventListener('input', (e) => {
      if (host.rasterAnimator) {
        const fpsVal = parseInt(e.target.value, 10) || 12;
        host.rasterAnimator.setFps(fpsVal);
        const lbl = document.getElementById('ip-sheet-anim-fps-val');
        if (lbl) lbl.textContent = fpsVal;
        if (host.rasterAnimatorUI) host.rasterAnimatorUI.syncUI();
      }
    });
    bindXformSheetBtn(['btn-ip-sheet-anim-gif', 'btn-sheet-anim-gif'], () => {
      exportAnimatedGif();
    });
    bindXformSheetBtn(['btn-ip-sheet-anim-webm', 'btn-sheet-anim-webm'], () => {
      exportWebmVideo();
    });

    // Import Image button strictly from Layers Stack
    const btnIpImportLayer = document.getElementById('btn-ip-import-layer-btn');
    if (btnIpImportLayer) btnIpImportLayer.addEventListener('click', () => { fileInput?.click(); });

    // 6. Pixel Art Suite
    const cardPixel1 = document.getElementById('card-ip-pixel-1px');
    if (cardPixel1) {
      cardPixel1.addEventListener('click', () => {
        host.selectBrushPreset('pixel');
        runCmd('set size 1');
        host.showPixelGrid = true;
        syncUiFromHost();
        triggerHaptic(15);
      });
    }

    const cardPixel2 = document.getElementById('card-ip-pixel-2px');
    if (cardPixel2) {
      cardPixel2.addEventListener('click', () => {
        host.selectBrushPreset('pixel');
        runCmd('set size 2');
        syncUiFromHost();
        triggerHaptic(15);
      });
    }

    const cardPixel4 = document.getElementById('card-ip-pixel-4px');
    if (cardPixel4) {
      cardPixel4.addEventListener('click', () => {
        host.selectBrushPreset('pixel');
        runCmd('set size 4');
        syncUiFromHost();
        triggerHaptic(15);
      });
    }

    const cardPixelDither = document.getElementById('card-ip-pixel-dither');
    if (cardPixelDither) {
      cardPixelDither.addEventListener('click', () => {
        host.selectBrushPreset('halftone');
        syncUiFromHost();
        triggerHaptic(15);
      });
    }

    const btnPixelGrid = document.getElementById('btn-ip-pixel-grid-toggle');
    if (btnPixelGrid) {
      btnPixelGrid.addEventListener('click', () => {
        syncPixelGrid(!host.showPixelGrid);
        btnPixelGrid.classList.toggle('active', host.showPixelGrid);
        triggerHaptic(10);
      });
    }

    const btnPixel100 = document.getElementById('btn-ip-pixel-zoom-100');
    if (btnPixel100) {
      btnPixel100.addEventListener('click', () => {
        if (host.zoomTo100) host.zoomTo100();
      });
    }

    const btnSymX = document.getElementById('btn-ip-pixel-sym-x');
    if (btnSymX) btnSymX.addEventListener('click', () => { runCmd('set symmetry 1'); });
    const btnSymY = document.getElementById('btn-ip-pixel-sym-y');
    if (btnSymY) btnSymY.addEventListener('click', () => { runCmd('set symmetry 2'); });
    const btnSymQuad = document.getElementById('btn-ip-pixel-sym-quad');
    if (btnSymQuad) btnSymQuad.addEventListener('click', () => { runCmd('set symmetry 3'); });

    // Pixel Palettes
    const btnPalGameboy = document.getElementById('btn-ip-pal-gameboy');
    if (btnPalGameboy) {
      btnPalGameboy.addEventListener('click', () => {
        if (touchPaletteSelect) touchPaletteSelect.value = 'retro_gameboy';
        if (typeof openTouchColorModal === 'function') openTouchColorModal('palettes');
      });
    }

    const btnPalGruvbox = document.getElementById('btn-ip-pal-gruvbox');
    if (btnPalGruvbox) {
      btnPalGruvbox.addEventListener('click', () => {
        if (touchPaletteSelect) touchPaletteSelect.value = 'gruvbox';
        if (typeof openTouchColorModal === 'function') openTouchColorModal('palettes');
      });
    }

    const btnPalCyber = document.getElementById('btn-ip-pal-cyber');
    if (btnPalCyber) {
      btnPalCyber.addEventListener('click', () => {
        if (touchPaletteSelect) touchPaletteSelect.value = 'cyberpunk';
        if (typeof openTouchColorModal === 'function') openTouchColorModal('palettes');
      });
    }

    // 7. Layer Sheet Controls
    const ipLayerOpSlider = document.getElementById('ip-active-layer-op-slider');
    const ipLayerOpVal = document.getElementById('ip-active-layer-op-val');
    if (ipLayerOpSlider) {
      ipLayerOpSlider.addEventListener('input', () => {
        const val = parseInt(ipLayerOpSlider.value, 10);
        if (ipLayerOpVal) ipLayerOpVal.textContent = `${val}%`;
        const activeIdx = (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.w_layer_get_active)
          ? host.canvasActor.exports.w_layer_get_active()
          : (host.canvasActor?.exports?.get_active_layer ? host.canvasActor.exports.get_active_layer() : 0);
        const alpha = Math.min(255, Math.max(0, Math.round((val / 100) * 255)));
        if (host.canvasActor?.exports?.w_layer_opacity) {
          host.canvasActor.exports.w_layer_opacity(activeIdx, alpha);
          host.render();
        }
      });
    }

    const btnIpAddLayer = document.getElementById('btn-ip-add-layer');
    if (btnIpAddLayer) btnIpAddLayer.addEventListener('click', () => { runCmd('new layer'); });
    const btnIpAddVectorLayer = document.getElementById('btn-ip-add-vector-layer');
    if (btnIpAddVectorLayer) btnIpAddVectorLayer.addEventListener('click', createAndActivateVectorLayer);
    const btnIpAddFolder = document.getElementById('btn-ip-add-folder');
    if (btnIpAddFolder) btnIpAddFolder.addEventListener('click', () => { runCmd('new group'); });
    const btnIpDupLayer = document.getElementById('btn-ip-dup-layer');
    if (btnIpDupLayer) btnIpDupLayer.addEventListener('click', () => { runCmd('duplicate layer'); });
    const btnIpMergeLayer = document.getElementById('btn-ip-merge-layer');
    if (btnIpMergeLayer) btnIpMergeLayer.addEventListener('click', () => { runCmd('layer merge down'); });
    const btnIpClearLayer = document.getElementById('btn-ip-clear-layer');
    if (btnIpClearLayer) btnIpClearLayer.addEventListener('click', () => { runCmd('clear'); });
    const btnIpDelLayer = document.getElementById('btn-ip-del-layer');
    if (btnIpDelLayer) {
      btnIpDelLayer.addEventListener('click', () => {
        const getActive = host.canvasActor?.exports?.w_layer_get_active || host.canvasActor?.exports?.get_active_layer;
        const activeIdx = getActive ? getActive() : 0;
        if (confirm(`Delete active layer ${activeIdx}?`)) runCmd(`delete layer ${activeIdx}`);
      });
    }

    // 8. Menu Sheet Project / Canvas Resize / Export
    const btnIpSaveProj = document.getElementById('btn-ip-save-proj');
    if (btnIpSaveProj) {
      btnIpSaveProj.addEventListener('click', async () => {
        saveUserPreferences();
        await performAutosave(true);
        const badge = document.getElementById('ip-menu-autosave-badge');
        if (badge) { badge.textContent = 'Saved!'; badge.style.color = '#b8bb26'; }
        triggerHaptic(20);
      });
    }

    // New Project & Recent Projects
    const btnIpNewProj = document.getElementById('btn-ip-new-proj');
    if (btnIpNewProj) {
      btnIpNewProj.addEventListener('click', () => {
        openSheet('sheet-new-proj');
      });
    }

    const btnIpRecentProj = document.getElementById('btn-ip-recent-proj');
    const sheetRecents = document.getElementById('sheet-recents');
    const ipRecentsList = document.getElementById('ip-recents-list');

    async function loadPainterRecents() {
      if (!ipRecentsList || typeof EsenhoStore === 'undefined') return;
      ipRecentsList.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); grid-column: 1/-1;">Loading stored projects...</div>';
      try {
        const list = await EsenhoStore.listProjects();
        if (!list || list.length === 0) {
          ipRecentsList.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); grid-column: 1/-1;">No stored projects yet.</div>';
          return;
        }
        ipRecentsList.innerHTML = list.map(p => {
          const dateStr = new Date(p.updatedAt).toLocaleDateString() + ' ' + new Date(p.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const isVec = p.type === 'vector';
          const badge = isVec ? '<span class="ip-recent-badge ip-badge-vector">Vector</span>' : '<span class="ip-recent-badge ip-badge-painter">Painter</span>';
          const thumbHtml = p.thumbnail 
            ? (p.thumbnail.startsWith('data:image/svg+xml') ? `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:4px;">${decodeURIComponent(p.thumbnail.split(',')[1] || '')}</div>` : `<img src="${p.thumbnail}" style="max-width:100%;max-height:100%;object-fit:contain;" alt="Thumb">`)
            : `<span style="font-size: 20px; color: var(--text-muted);">🎨</span>`;
          return `
            <div class="ip-recent-card" onclick="window.painterOpenRecent('${p.id}', '${p.type}')">
              <div class="ip-recent-thumb">
                ${thumbHtml}
              </div>
              <div class="ip-recent-body">
                <div class="ip-recent-header">
                  <span class="ip-recent-title">${p.name}</span>
                  ${badge}
                </div>
                <span class="ip-recent-meta">${p.width}×${p.height} • ${dateStr}</span>
                <div class="ip-recent-actions" onclick="event.stopPropagation();">
                  <button type="button" class="ip-btn ip-mini-btn ip-btn-open-recent" style="background:var(--primary); color:var(--bg-dark); font-weight:bold; height:20px; padding:0 6px; font-size:10px;" onclick="window.painterOpenRecent('${p.id}', '${p.type}')">Open</button>
                  ${isVec ? `<button type="button" class="ip-btn ip-mini-btn ip-btn-addlayer-recent" style="color:var(--primary); border: 1px solid var(--primary); height:20px; padding:0 6px; font-size:10px;" onclick="window.painterInsertVectorLayer('${p.id}')">+ Layer</button>` : ''}
                  <button type="button" class="ip-btn ip-mini-btn ip-btn-del-recent" style="color:var(--danger); height:20px; padding:0 6px; font-size:10px;" onclick="window.painterDeleteRecent('${p.id}')">Del</button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      } catch (e) {
        ipRecentsList.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--danger); grid-column: 1/-1;">Error loading recents: ${e.message}</div>`;
      }
    }
    window.loadPainterRecents = loadPainterRecents;

    window.painterInsertVectorLayer = async function(id) {
      if (!host.canvasActor || !host.canvasActor.exports) return;
      try {
        const proj = await EsenhoStore.getProject(id);
        if (!proj) return alert('Vector project not found');
        const pngUrl = await EsenhoStore.compositeVectorProjectToDataUrl(proj);
        if (!pngUrl) return alert('Could not render vector project');
        const img = new Image();
        img.onload = () => {
          try {
            const cw = host.canvasActor.exports.get_canvas_width();
            const ch = host.canvasActor.exports.get_canvas_height();
            const wasmId = host.canvasActor.exports.w_layer_add ? host.canvasActor.exports.w_layer_add() : -1;
            if (wasmId < 0) {
              alert('Max layers reached in Painter canvas');
              return;
            }
            const off = document.createElement('canvas');
            off.width = cw;
            off.height = ch;
            const ctx = off.getContext('2d');
            const scale = Math.min(cw / img.width, ch / img.height, 1);
            const dw = Math.round(img.width * scale);
            const dh = Math.round(img.height * scale);
            const dx = Math.round((cw - dw) / 2);
            const dy = Math.round((ch - dh) / 2);
            ctx.drawImage(img, dx, dy, dw, dh);
            const imgData = ctx.getImageData(0, 0, cw, ch);
            const ptr = host.canvasActor.exports.w_layer_get_pixels(wasmId);
            if (ptr) {
              new Uint8Array(host.canvasActor.memory.buffer, ptr, cw * ch * 4).set(imgData.data);
            }
            if (!host.layerNames) host.layerNames = new Map();
            host.layerNames.set(wasmId, proj.name || `Vector Layer ${wasmId}`);
            host.canvasActor.exports.force_composite();
            syncUiFromHost();
            closeAllSheets();
            if (typeof markCanvasDirty === 'function') markCanvasDirty();
            log(`Imported vector project '${proj.name}' as layer [${wasmId}]`);
          } catch (err) {
            alert('Error adding vector layer: ' + err.message);
          }
        };
        img.src = pngUrl;
      } catch (err) {
        alert('Failed importing vector project: ' + err.message);
      }
    };

    window.painterOpenRecent = function(id, type) {
      if (type === 'vector') {
        window.location.href = `studio.html?project=${id}`;
        return;
      }
      window.location.href = `painter.html?project=${id}`;
    };

    window.painterDeleteRecent = async function(id) {
      if (!confirm('Delete this project from memory?')) return;
      await EsenhoStore.deleteProject(id);
      loadPainterRecents();
    };

    if (btnIpRecentProj) {
      btnIpRecentProj.addEventListener('click', () => {
        openSheet('sheet-recents');
        loadPainterRecents();
      });
    }

    document.getElementById('btn-ip-recents-new')?.addEventListener('click', () => {
      openSheet('sheet-new-proj');
    });

    async function handleClearAllStorage() {
      if (!confirm('Clear ALL projects and stored data? This cannot be undone.')) return;
      if (typeof EsenhoStore !== 'undefined') await EsenhoStore.clearAll();
      alert('Storage cleared.');
      window.location.href = 'studio.html';
    }

    document.getElementById('btn-ip-clear-storage')?.addEventListener('click', handleClearAllStorage);
    document.getElementById('btn-ip-recents-clear')?.addEventListener('click', handleClearAllStorage);

    document.querySelectorAll('.ip-btn-new-res').forEach(btn => {
      btn.addEventListener('click', () => {
        const inpW = document.getElementById('inp-ip-new-w');
        const inpH = document.getElementById('inp-ip-new-h');
        if (inpW && inpH) {
          inpW.value = btn.dataset.w;
          inpH.value = btn.dataset.h;
        }
      });
    });

    document.getElementById('btn-ip-confirm-new-proj')?.addEventListener('click', () => {
      const title = encodeURIComponent(document.getElementById('inp-ip-new-title')?.value.trim() || 'Untitled Artwork');
      const w = parseInt(document.getElementById('inp-ip-new-w')?.value, 10) || 1280;
      const h = parseInt(document.getElementById('inp-ip-new-h')?.value, 10) || 720;
      window.location.href = `painter.html?new=1&name=${title}&w=${w}&h=${h}`;
    });

    const btnIpExportPng = document.getElementById('btn-ip-export-png');
    if (btnIpExportPng) btnIpExportPng.addEventListener('click', () => { exportImage('image/png'); closeAllSheets(); });

    const btnIpExportEsen = document.getElementById('btn-ip-export-esen');
    if (btnIpExportEsen) btnIpExportEsen.addEventListener('click', () => { exportEsenProject(); closeAllSheets(); });

    const btnIpImportFile = document.getElementById('btn-ip-import-file');
    if (btnIpImportFile) btnIpImportFile.addEventListener('click', () => { fileInput?.click(); closeAllSheets(); });

    const btnIpApplyResize = document.getElementById('btn-ip-apply-resize');
    const inpCw = document.getElementById('ip-inp-cw');
    const inpCh = document.getElementById('ip-inp-ch');
    if (btnIpApplyResize && inpCw && inpCh) {
      btnIpApplyResize.addEventListener('click', () => {
        const w = parseInt(inpCw.value, 10);
        const h = parseInt(inpCh.value, 10);
        if (w > 0 && h > 0) {
          runCmd(`canvas resize ${w} ${h}`);
          closeAllSheets();
        }
      });
    }

    document.querySelectorAll('.ip-btn-quick-res').forEach(btn => {
      btn.addEventListener('click', () => {
        if (inpCw && inpCh) {
          inpCw.value = btn.dataset.w;
          inpCh.value = btn.dataset.h;
        }
      });
    });

    const btnIpZoomFit = document.getElementById('btn-ip-zoom-fit');
    if (btnIpZoomFit) btnIpZoomFit.addEventListener('click', () => { if (host.zoomToFit) host.zoomToFit(); closeAllSheets(); });
    const btnIpZoom100 = document.getElementById('btn-ip-zoom-100');
    if (btnIpZoom100) btnIpZoom100.addEventListener('click', () => { if (host.zoomTo100) host.zoomTo100(); closeAllSheets(); });
    const btnIpRotZero = document.getElementById('btn-ip-rot-zero');
    if (btnIpRotZero) btnIpRotZero.addEventListener('click', () => { if (host.resetRotation) host.resetRotation(); closeAllSheets(); });
    const btnIpFlipH = document.getElementById('btn-ip-flip-h');
    if (btnIpFlipH) btnIpFlipH.addEventListener('click', () => { if (host.toggleFlipH) host.toggleFlipH(); closeAllSheets(); });
    const btnIpFlipV = document.getElementById('btn-ip-flip-v');
    if (btnIpFlipV) btnIpFlipV.addEventListener('click', () => { if (host.toggleFlipV) host.toggleFlipV(); closeAllSheets(); });
    const btnIpCenter = document.getElementById('btn-ip-center');
    if (btnIpCenter) btnIpCenter.addEventListener('click', () => { if (host.centerCanvas) host.centerCanvas(); closeAllSheets(); });


    // Terminal & Scripts Sheet
    // 9. Brush Lab Tabs & Controls
    const labTabs = document.querySelectorAll('#ip-lab-tabs .ip-pill-btn');
    const labPanels = document.querySelectorAll('.ip-lab-tab-panel');
    labTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        labTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.labtab;
        labPanels.forEach(p => {
          p.style.display = (p.dataset.labpanel === target) ? 'flex' : 'none';
        });
      });
    });

    const selBrushShape = document.getElementById('ip-sel-brush-shape');
    if (selBrushShape) {
      selBrushShape.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val.startsWith('layer:')) {
          const lId = parseInt(val.split(':')[1], 10);
          runCmd(`set shape ${lId}`);
        } else {
          runCmd(`set shape ${val}`);
        }
        triggerHaptic(10);
      });
    }

    const selBrushTex = document.getElementById('ip-sel-texture');
    if (selBrushTex) {
      selBrushTex.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val.startsWith('layer:')) {
          const lId = parseInt(val.split(':')[1], 10);
          runCmd(`set tex_layer ${lId}`);
        } else {
          runCmd(`set tex_layer -1`);
          runCmd(`set texture ${val}`);
        }
        triggerHaptic(10);
      });
    }

    const selIpUiScale = document.getElementById('ip-select-ui-scale');
    if (selIpUiScale) {
      selIpUiScale.addEventListener('change', (e) => {
        host.setUiScale(e.target.value);
      });
    }

    const linkLabSlider = (sliderId, valId, cmdName, suf = '') => {
      const s = document.getElementById(sliderId);
      const v = document.getElementById(valId);
      if (s) {
        s.addEventListener('input', () => {
          runCmd(`set ${cmdName} ${s.value}`);
          if (v) v.textContent = s.value + suf;
        });
      }
    };

    // Tip & Shape
    linkLabSlider('ip-slider-hardness', 'ip-val-hardness', 'hardness', '%');
    linkLabSlider('ip-slider-roundness', 'ip-val-roundness', 'roundness', '%');
    linkLabSlider('ip-slider-angle', 'ip-val-angle', 'angle', '°');

    // Dynamics
    const selStabMode = document.getElementById('ip-select-stabilizer-mode');
    if (selStabMode) {
      selStabMode.addEventListener('change', () => {
        runCmd(`brush stabilizer_mode ${selStabMode.value}`);
        syncUiFromHost();
        triggerHaptic(10);
      });
    }
    linkLabSlider('ip-slider-spacing', 'ip-val-spacing', 'spacing', '%');
    linkLabSlider('ip-slider-smoothing', 'ip-val-smoothing', 'stabilization', '%');
    linkLabSlider('ip-slider-string-length', 'ip-val-string-length', 'string_length', 'px');
    linkLabSlider('ip-slider-midpoint', 'ip-val-midpoint', 'midpoint', '%');
    linkLabSlider('ip-slider-velocity', 'ip-val-velocity', 'velocity', '%');
    linkLabSlider('ip-slider-taper-in', 'ip-val-taper-in', 'taper_in', '%');
    linkLabSlider('ip-slider-taper-out', 'ip-val-taper-out', 'taper_out', '%');
    linkLabSlider('ip-slider-fade', 'ip-val-fade', 'fade', '%');

    // Wet & Mix
    linkLabSlider('ip-slider-wetness', 'ip-val-wetness', 'wetness', '%');
    linkLabSlider('ip-slider-smudge', 'ip-val-smudge', 'smudge', '%');
    linkLabSlider('ip-slider-pickup', 'ip-val-pickup', 'color_pickup', '%');
    linkLabSlider('ip-slider-depletion', 'ip-val-depletion', 'depletion', '%');

    // Jitter & Dual
    linkLabSlider('ip-slider-jitter-size', 'ip-val-jitter-size', 'size_jitter', '%');
    linkLabSlider('ip-slider-jitter-angle', 'ip-val-jitter-angle', 'angle_jitter', '%');
    linkLabSlider('ip-slider-jitter-op', 'ip-val-jitter-op', 'opacity_jitter', '%');
    linkLabSlider('ip-slider-jitter-color', 'ip-val-jitter-color', 'color_jitter', '%');
    linkLabSlider('ip-slider-scatter', 'ip-val-scatter', 'scatter', '%');
    linkLabSlider('ip-slider-dual-size', 'ip-val-dual-size', 'dual_size', '%');
    linkLabSlider('ip-slider-dual-spacing', 'ip-val-dual-spacing', 'dual_spacing', '%');

    // Texture
    linkLabSlider('ip-slider-grain', 'ip-val-grain', 'grain', '%');
    linkLabSlider('ip-slider-tex-scale', 'ip-val-tex-scale', 'texture_scale', '%');
    linkLabSlider('ip-slider-tex-contrast', 'ip-val-tex-contrast', 'texture_contrast', '%');
    linkLabSlider('ip-slider-tex-rotate', 'ip-val-tex-rotate', 'texture_rotate', '°');

    // Checkbox toggles
    const bindToggleBtn = (btnId, chkId, cmdName) => {
      const btn = document.getElementById(btnId);
      const chk = document.getElementById(chkId);
      if (btn && chk) {
        btn.addEventListener('click', () => {
          chk.checked = !chk.checked;
          runCmd(`set ${cmdName} ${chk.checked ? 1 : 0}`);
          triggerHaptic(10);
        });
      }
    };
    bindToggleBtn('btn-ip-lab-autorotate', 'chk-ip-lab-autorotate', 'auto_rotate');
    bindToggleBtn('btn-ip-lab-subpixel', 'chk-ip-lab-subpixel', 'subpixel');
    bindToggleBtn('btn-ip-lab-press-size', 'chk-ip-lab-press-size', 'pressure_size');
    bindToggleBtn('btn-ip-lab-press-flow', 'chk-ip-lab-press-flow', 'pressure_flow');
    bindToggleBtn('btn-ip-lab-tilt-angle', 'chk-ip-lab-tilt-angle', 'tilt_angle');
    bindToggleBtn('btn-ip-lab-buildup', 'chk-ip-lab-buildup', 'buildup');

    // Dropdown selects
    const bindSelect = (selId, cmdName) => {
      const sel = document.getElementById(selId);
      if (sel) {
        sel.addEventListener('change', (e) => {
          runCmd(`set ${cmdName} ${e.target.value}`);
        });
      }
    };
    bindSelect('ip-sel-dab-blend', 'dab_blend');
    bindSelect('ip-sel-dual-shape', 'dual_shape');
    bindSelect('ip-sel-tex-mode', 'texture_mode');

    // Tip & Grain creation buttons
    const btnTipFromLayer = document.getElementById('btn-ip-tip-from-layer');
    if (btnTipFromLayer) {
      btnTipFromLayer.addEventListener('click', () => {
        const name = prompt('Custom Tip Name:', 'Layer Tip') || 'Layer Tip';
        if (typeof host.createTipFromLayer === 'function') host.createTipFromLayer(name);
        triggerHaptic(15);
      });
    }

    const btnTipFromSel = document.getElementById('btn-ip-tip-from-selection');
    if (btnTipFromSel) {
      btnTipFromSel.addEventListener('click', () => {
        const name = prompt('Custom Tip Name:', 'Selection Tip') || 'Selection Tip';
        if (typeof host.createTipFromSelection === 'function') host.createTipFromSelection(name);
        triggerHaptic(15);
      });
    }

    const btnGrainFromLayer = document.getElementById('btn-ip-grain-from-layer');
    if (btnGrainFromLayer) {
      btnGrainFromLayer.addEventListener('click', () => {
        const name = prompt('Custom Grain Name:', 'Layer Grain') || 'Layer Grain';
        if (typeof host.createGrainFromLayer === 'function') host.createGrainFromLayer(name);
        triggerHaptic(15);
      });
    }

    const btnGrainFromSel = document.getElementById('btn-ip-grain-from-selection');
    if (btnGrainFromSel) {
      btnGrainFromSel.addEventListener('click', () => {
        const name = prompt('Custom Grain Name:', 'Selection Grain') || 'Selection Grain';
        if (typeof host.createGrainFromSelection === 'function') host.createGrainFromSelection(name);
        triggerHaptic(15);
      });
    }

    // Reset & Save preset buttons
    const btnLabReset = document.getElementById('btn-ip-lab-reset');
    if (btnLabReset) {
      btnLabReset.addEventListener('click', () => {
        runCmd('reset tool');
        syncInfinitePainterUI();
        triggerHaptic(15);
      });
    }

    const btnLabSave = document.getElementById('btn-ip-lab-save');
    if (btnLabSave) {
      btnLabSave.addEventListener('click', () => {
        const name = prompt('Enter custom brush preset name:', 'My Custom Brush');
        if (name && name.trim()) {
          const key = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
          if (!host.customBrushPresets) host.customBrushPresets = {};
          host.customBrushPresets[key] = {
            name: name.trim(),
            category: 'custom',
            desc: `Custom preset (${host.brushParams?.size || 12}px)`,
            ...JSON.parse(JSON.stringify(host.brushParams || {})),
            texture: host.activeTexture || (host.brushParams && host.brushParams.texture) || 'none',
            eraser: host.strokeIsEraser ? 1 : 0
          };
          saveCustomBrushPresets(host.customBrushPresets);
          host.activeBrush = key;
          populateBrushPresetsUI();
          if (typeof renderBrushShelf === 'function') renderBrushShelf();
          syncInfinitePainterUI();
          syncUiFromHost();
          triggerHaptic(15);
        }
      });
    }
  }

  let _lastSyncedColorHex = null;
  let _lastSyncedBrushKey = null;
  let _lastSyncedHudState = null;

  function syncInfinitePainterUI() {
    // 1. Color chips across all HUDs and ribbons
    let hex = '#ebdbb2';
    if (host.currentColor !== undefined) {
      hex = rgbToHex(host.currentColor & 0xFF, (host.currentColor >> 8) & 0xFF, (host.currentColor >> 16) & 0xFF);
    } else if (host.brushParams && host.brushParams.color !== undefined) {
      hex = host.brushParams.color;
    }
    if (_lastSyncedColorHex !== hex) {
      _lastSyncedColorHex = hex;
      document.querySelectorAll('.ip-color-chip, #ip-color-chip').forEach(el => {
        el.style.backgroundColor = hex;
      });
      if (window.isDockviewPainter && typeof applyColorFromStudio === 'function' && touchColorHexInput && touchColorHexInput.value.toUpperCase() !== hex.toUpperCase()) {
        applyColorFromStudio(hex, true);
      }
    }

    // 2. Active Brush Name
    const activeKey = host.activeBrush;
    if (_lastSyncedBrushKey !== activeKey) {
      _lastSyncedBrushKey = activeKey;
      const p = BRUSH_PRESETS[activeKey] || (host.customBrushPresets && host.customBrushPresets[activeKey]);
      const activeBrushDisplayName = p?.name || activeKey || 'Studio Inker';
      document.querySelectorAll('.ip-hud-brush-name, #ip-active-brush-name').forEach(el => {
        el.textContent = activeBrushDisplayName;
      });
    }

    // 3. Multi-Dock Dynamic Sliders & Actions
    if (host.brushParams) {
      const bp = host.brushParams;
      const slidersDef = [
        { id: 'size', key: 'size', isCurve: true, unit: '', min: 1, max: 300 },
        { id: 'opacity', key: 'opacity', isCurve: false, unit: '%', min: 1, max: 100 },
        { id: 'flow', key: 'flow', isCurve: false, unit: '%', min: 1, max: 100 },
        { id: 'hardness', key: 'hardness', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'roundness', key: 'roundness', isCurve: false, unit: '%', min: 1, max: 100 },
        { id: 'angle', key: 'angle', isCurve: false, unit: '°', min: 0, max: 360 },
        { id: 'spacing', key: 'spacing', isCurve: false, unit: '%', min: 1, max: 200 },
        { id: 'smoothing', key: 'smoothing', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'string_length', key: 'string_length', isCurve: false, unit: 'px', min: 0, max: 200 },
        { id: 'midpoint', key: 'midpoint', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'velocity', key: 'velocity', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'taper_in', key: 'taper_in', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'taper_out', key: 'taper_out', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'fade', key: 'fade', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'wetness', key: 'wetness', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'smudge', key: 'smudge', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'pickup', key: 'color_pickup', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'depletion', key: 'depletion', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'scatter', key: 'scatter', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'size_jitter', key: 'size_jitter', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'angle_jitter', key: 'angle_jitter', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'opacity_jitter', key: 'opacity_jitter', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'color_jitter', key: 'color_jitter', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'grain', key: 'grain', isCurve: false, unit: '%', min: 0, max: 100 },
        { id: 'tex_scale', key: 'texture_scale', isCurve: false, unit: '%', min: 10, max: 400 },
        { id: 'tex_contrast', key: 'texture_contrast', isCurve: false, unit: '%', min: 0, max: 200 },
        { id: 'tex_rotate', key: 'texture_rotate', isCurve: false, unit: '°', min: 0, max: 360 },
        { id: 'dual_size', key: 'dual_size', isCurve: false, unit: '%', min: 10, max: 300 },
        { id: 'dual_spacing', key: 'dual_spacing', isCurve: false, unit: '%', min: 1, max: 100 }
      ];

      ['top', 'left', 'right', 'bottom'].forEach(dockName => {
        slidersDef.forEach(s => {
          const valEl = document.getElementById(`ip-hud-${dockName}-${s.id}-val`) || document.getElementById(`ip-hud-${s.id}-val`);
          const fillEl = document.getElementById(`ip-vfill-${dockName}-${s.id}`) || document.getElementById(`ip-vfill-${s.id}`);
          const thumbEl = document.getElementById(`ip-vthumb-${dockName}-${s.id}`) || document.getElementById(`ip-vthumb-${s.id}`);
          if (!valEl || !fillEl || !thumbEl) return;
          let rawVal = bp[s.key];
          if (rawVal === undefined) {
            if (s.key === 'smoothing' && bp.stabilization !== undefined) rawVal = bp.stabilization;
            else if (s.key === 'texture_scale' && bp.tex_scale !== undefined) rawVal = bp.tex_scale;
            else if (s.key === 'texture_contrast' && bp.tex_contrast !== undefined) rawVal = bp.tex_contrast;
            else if (s.key === 'texture_rotate' && bp.texture_angle !== undefined) rawVal = bp.texture_angle;
            else if (s.key === 'color_pickup' && bp.pickup !== undefined) rawVal = bp.pickup;
            else rawVal = s.min || 0;
          }
          if (valEl._lastRawVal === rawVal) return;
          valEl._lastRawVal = rawVal;
          valEl.textContent = `${rawVal}${s.unit || ''}`;
          let ratio = 0;
          if (s.isCurve) {
            ratio = Math.max(0.01, Math.min(1, Math.sqrt(Math.max(0, rawVal - 1) / 299)));
          } else {
            ratio = Math.max(0.01, Math.min(1, ((rawVal || 0) - (s.min || 0)) / ((s.max || 100) - (s.min || 0))));
          }
          fillEl.style.height = `${ratio * 100}%`;
          thumbEl.style.bottom = `${ratio * 100}%`;
        });
      });
    }

    // 4. Mode & HUD buttons
    const isErase = host.actionMode === 'erase' || (host.brushParams && host.brushParams.eraser === 1);
    const isSmudge = host.actionMode === 'smudge' || (host.brushParams && host.brushParams.mode === 1);
    const isDraw = !isErase && !isSmudge;
    const symActive = (host.brushParams?.symmetry || 0) > 0;
    const isSelectMode = host.actionMode === 'select';
    const curSelMode = host.selectionMode || 'replace';
    const curHudState = `${isDraw}:${isErase}:${isSmudge}:${symActive}:${isSelectMode}:${curSelMode}:${host.currentTool}:${host.actionMode}:${host.showPixelGrid}`;

    if (_lastSyncedHudState !== curHudState) {
      _lastSyncedHudState = curHudState;
      const btnBrush = document.getElementById('btn-ip-brush');
      const btnEraser = document.getElementById('btn-ip-eraser');
      const btnBlend = document.getElementById('btn-ip-blend');
      if (btnBrush) btnBrush.classList.toggle('active', isDraw);
      if (btnEraser) btnEraser.classList.toggle('active', isErase);
      if (btnBlend) btnBlend.classList.toggle('active', isSmudge);

      // Swap mode and action buttons across docks
      ['top', 'left', 'right', 'bottom'].forEach(dockName => {
        const btnBrushHud = document.getElementById(`btn-ip-hud-${dockName}-brush`);
        if (btnBrushHud) btnBrushHud.classList.toggle('active', isDraw);
        const btnSwap = document.getElementById(`btn-ip-swap-mode-${dockName}`) || document.getElementById('btn-ip-swap-mode');
        if (btnSwap) btnSwap.classList.toggle('is-eraser', isErase);
        const btnPip = document.getElementById(`btn-ip-hud-${dockName}-pipette`) || document.getElementById('btn-ip-hud-pipette');
        if (btnPip) btnPip.classList.toggle('active', host.actionMode === 'color_picker');
        const btnGridHud = document.getElementById(`btn-ip-hud-${dockName}-grid`);
        if (btnGridHud) btnGridHud.classList.toggle('active', !!host.showPixelGrid);
        const btnSymHud = document.getElementById(`btn-ip-hud-${dockName}-symmetry`);
        if (btnSymHud) btnSymHud.classList.toggle('active', symActive);
        const btnSelRect = document.getElementById(`btn-ip-hud-${dockName}-select_rect`);
        if (btnSelRect) btnSelRect.classList.toggle('active', isSelectMode && host.currentTool === 'select_rect');
        const btnSelLasso = document.getElementById(`btn-ip-hud-${dockName}-select_lasso`);
        if (btnSelLasso) btnSelLasso.classList.toggle('active', isSelectMode && host.currentTool === 'lasso_select');
        const btnSelWand = document.getElementById(`btn-ip-hud-${dockName}-select_wand`);
        if (btnSelWand) btnSelWand.classList.toggle('active', isSelectMode && host.currentTool === 'magic_wand');
      });
    }

    // Vector Layer Mode State & Transition Handling
    if (window.ESENHO_VECTOR_PAINTER_MODE && host.enableVectorLayer && (!host.isVectorLayer || !host.isVectorLayer())) {
      host.enableVectorLayer();
    }
    const isVecLayerActive = !!window.ESENHO_VECTOR_PAINTER_MODE || !!(host.isVectorLayer && host.isVectorLayer());
    document.body.classList.toggle('is-vector-layer-mode', isVecLayerActive);

    if (isVecLayerActive && !host._lastVecLayerModeUi) {
      if (host.selection?.active && host.clearSelection) {
        host.clearSelection();
      }
      if (host.floatingTransform && host.cancelTransform) {
        host.cancelTransform();
      }
      if (host.actionMode === 'select' || host.actionMode === 'smudge' || host.actionMode === 'blend' || host.actionMode === 'clone') {
        host.vectorSubTool = host.vectorSubTool || 'nodes';
        if (host.setActionMode) host.setActionMode('vector');
        else host.actionMode = 'vector';
      }
      if (host.currentTool === 'fill' || host.currentTool === 'lasso_fill') {
        host.currentTool = 'brush';
        if (host.setBrushParam) host.setBrushParam('mode', 0);
      }
      const pixSheet = document.getElementById('sheet-pixelart');
      if (pixSheet && pixSheet.classList.contains('open')) {
        pixSheet.classList.remove('open');
      }
      const activeToolTab = document.querySelector('#sheet-tools .sheet-tab.active');
      if (activeToolTab && (activeToolTab.dataset.tab === 'select' || activeToolTab.dataset.tab === 'transform')) {
        const nodesTabBtn = document.querySelector('#sheet-tools .sheet-tab[data-tab="nodes"]');
        if (nodesTabBtn) nodesTabBtn.click();
      }
    }
    host._lastVecLayerModeUi = isVecLayerActive;

    // Selection UI Synchronization (controls live in Tools & Modes panel)
    const ipSelBar = document.getElementById('ip-selection-bar');
    if (ipSelBar) ipSelBar.style.display = 'none';
    document.querySelectorAll('.ip-selmode-card, .ip-selbar-mode, .sel-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.selmode === curSelMode);
    });

    // Transform Bar & Sheet Synchronization
    const isFloatTransforming = !!(host.floatingTransform && host.floatingTransform.corners);
    const btnToolTransform = document.getElementById('btn-ip-tool-transform') || document.getElementById('btn-ip-transform');
    if (btnToolTransform) {
      btnToolTransform.classList.toggle('active', isFloatTransforming);
    }
    const curXMode = host.transformMode || 'scale';
    document.querySelectorAll('.ip-xbar-mode, .ip-sheet-xform-mode').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.xmode === curXMode);
    });
    document.getElementById('btn-ip-xbar-lock-aspect')?.classList.toggle('active', !!host.transformLockAspect);
    document.getElementById('btn-ip-sheet-xform-lock')?.classList.toggle('active', !!host.transformLockAspect);
    const curXInterp = host.transformInterpolation || 'nearest';
    const btnXbarInterp = document.getElementById('btn-ip-xbar-interp');
    if (btnXbarInterp) {
      btnXbarInterp.textContent = curXInterp === 'bilinear' ? 'Smooth' : 'Crisp';
      btnXbarInterp.classList.toggle('active', curXInterp === 'bilinear');
    }
    document.querySelectorAll('.ip-sheet-xform-interp').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.xinterp === curXInterp);
    });

    document.querySelectorAll('#sheet-tools .ip-actionmode-card').forEach(card => {
      card.classList.toggle('active', card.dataset.actionmode === host.actionMode);
    });
    document.querySelectorAll('#sheet-tools .ip-tool-card').forEach(card => {
      const t = card.dataset.tool;
      if (!t || t === 'transform') return;
      let isCardActive = false;
      if (host.actionMode === 'select') {
        if (t === 'brush_select') isCardActive = (host.currentTool === 'brush');
        else isCardActive = (host.currentTool === t);
      } else {
        isCardActive = (host.currentTool === t);
      }
      card.classList.toggle('active', isCardActive);
    });
    const curSymVal = host.brushParams?.symmetry || 0;
    document.querySelectorAll('#sheet-tools .ip-sym-btn').forEach(btn => {
      btn.classList.toggle('active', (parseInt(btn.dataset.sym, 10) || 0) === curSymVal);
    });
    const selBadgeEl = document.getElementById('ip-tools-sel-badge');
    if (selBadgeEl) {
      if (host.selection?.active) {
        selBadgeEl.textContent = 'Selection Active (strokes clipped)';
        selBadgeEl.style.color = 'var(--primary)';
      } else {
        selBadgeEl.textContent = '';
        selBadgeEl.style.color = 'var(--text-muted)';
      }
    }

    // Vector Painter Floating Bar & Sheet Synchronization
    const ipVecBar = document.getElementById('ip-vector-bar');
    let activeSubTool = 'draw';
    if (host.actionMode === 'vector') {
      activeSubTool = host.vectorSubTool || 'nodes';
    } else if (host.actionMode === 'erase') {
      activeSubTool = 'erase';
    } else if (host.currentTool === 'line' || host.currentTool === 'rect' || host.currentTool === 'ellipse') {
      activeSubTool = host.currentTool;
    } else {
      activeSubTool = 'draw';
    }
    document.querySelectorAll('.ip-vecbar-subtool, .ip-vecbar-sub, .ip-sheet-vec-tool').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.vecsub === activeSubTool);
    });
    const curCurveMode = host.vectorCurveMode || 'bezier';
    document.querySelectorAll('.ip-vecbar-curvemode, .ip-vecbar-mode').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.vecmode === curCurveMode);
    });

    const vl = host.getVectorLayer ? host.getVectorLayer() : null;
    const selPath = host.getSelectedVectorPath ? host.getSelectedVectorPath() : null;
    const rawSelNodes = host.getSelectedVectorNodeIndices ? host.getSelectedVectorNodeIndices() : [];
    const selNodeCount = Array.isArray(rawSelNodes) ? rawSelNodes.length : (rawSelNodes && rawSelNodes.size ? rawSelNodes.size : 0);
    const selNode = (vl && selPath && vl.selectedNodeIdx >= 0 && selPath.nodes[vl.selectedNodeIdx])
      ? selPath.nodes[vl.selectedNodeIdx]
      : (selPath && selPath.nodes && selPath.nodes[0] ? selPath.nodes[0] : null);
    const curNodeType = selNode ? selNode.type : null;
    document.querySelectorAll('.ip-vecbar-nodetype').forEach(btn => {
      btn.classList.toggle('active', !!curNodeType && btn.dataset.nodetype === curNodeType);
    });

    document.getElementById('btn-ip-vecbar-closed')?.classList.toggle('active', !!(selPath && selPath.closed));
    document.getElementById('btn-ip-vecbar-close-loop')?.classList.toggle('active', !!(selPath && selPath.closed));
    document.getElementById('btn-ip-sheet-vec-closed')?.classList.toggle('active', !!(selPath && selPath.closed));
    document.getElementById('btn-ip-vecbar-marquee-add')?.classList.toggle('active', !!host.vecMarqueeAdditive);
    document.getElementById('btn-ip-vecbar-fill-toggle')?.classList.toggle('active', !!(selPath && selPath.fill && selPath.fill !== 'none'));

    // Sync Vector Stroke & Fill Surface Inspector
    const vecSelPathLabel = document.getElementById('ip-vec-selected-path-label');
    if (vecSelPathLabel) {
      if (selPath) {
        const ptCount = Array.isArray(selPath.nodes) ? selPath.nodes.length : 0;
        vecSelPathLabel.textContent = `Path #${selPath.id} (${ptCount} pts${selPath.closed ? ', closed' : ''})`;
      } else {
        vecSelPathLabel.textContent = 'No Path Selected';
      }
    }
    const vecStrokeColorEl = document.getElementById('ip-vec-stroke-color');
    if (vecStrokeColorEl && document.activeElement !== vecStrokeColorEl) {
      const hex = selPath && selPath.brush && typeof selPath.brush.color === 'number'
        ? '#' + ((selPath.brush.color >>> 8) & 0xFFFFFF).toString(16).padStart(6, '0')
        : (typeof host.getFgHex === 'function' ? host.getFgHex() : '#10b981');
      vecStrokeColorEl.value = hex;
    }
    const vecStrokeWidthEl = document.getElementById('ip-vec-stroke-width');
    const vecStrokeWidthValEl = document.getElementById('ip-vec-stroke-width-val');
    if (vecStrokeWidthEl && document.activeElement !== vecStrokeWidthEl) {
      const sw = selPath && selPath.brush && selPath.brush.size ? Math.round(selPath.brush.size) : Math.round(host.brushSize || 12);
      vecStrokeWidthEl.value = sw;
      if (vecStrokeWidthValEl) vecStrokeWidthValEl.textContent = `${sw}px`;
    }
    const chkVecFill = document.getElementById('chk-ip-vec-fill-enabled');
    const vecFillColorEl = document.getElementById('ip-vec-fill-color');
    if (chkVecFill) {
      const hasFill = !!(selPath && selPath.fill && selPath.fill !== 'none');
      chkVecFill.checked = hasFill;
      if (vecFillColorEl && hasFill && document.activeElement !== vecFillColorEl) {
        vecFillColorEl.value = selPath.fill;
      }
    }

    // Sync Active Layer Vector Paths List in Layers Sheet
    const vecPathsListEl = document.getElementById('ip-vector-paths-list');
    const vecPathsCountEl = document.getElementById('ip-sheet-vec-paths-count');
    if (vecPathsCountEl) {
      const totalPaths = vl && Array.isArray(vl.paths) ? vl.paths.length : 0;
      vecPathsCountEl.textContent = `${totalPaths} path${totalPaths === 1 ? '' : 's'}`;
    }
    if (vecPathsListEl && vl && Array.isArray(vl.paths)) {
      const sig = `${vl.selectedPathId}:${vl.paths.map(p => `${p.id}_${p.nodes?.length || 0}_${p.closed ? 1 : 0}_${p.fill || ''}_${p.brush?.color || 0}`).join('|')}`;
      if (vecPathsListEl.dataset.renderSig !== sig) {
        vecPathsListEl.dataset.renderSig = sig;
        vecPathsListEl.innerHTML = '';
        if (vl.paths.length === 0) {
          vecPathsListEl.innerHTML = `<div style="font-size:11px; color:rgba(255,255,255,0.4); padding:6px 4px; text-align:center;">No vector paths on this layer yet. Draw with Pen or Vector Brush!</div>`;
        } else {
          for (let i = vl.paths.length - 1; i >= 0; i--) {
            const p = vl.paths[i];
            const isSel = p.id === vl.selectedPathId;
            const cHex = p.brush && typeof p.brush.color === 'number'
              ? '#' + ((p.brush.color >>> 8) & 0xFFFFFF).toString(16).padStart(6, '0')
              : '#10b981';
            const row = document.createElement('div');
            row.style.cssText = `display:flex; align-items:center; justify-content:space-between; padding:6px 8px; border-radius:8px; cursor:pointer; font-size:11px; background:${isSel ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.03)'}; border:1px solid ${isSel ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.06)'}; color:${isSel ? '#a7f3d0' : '#e4e4e7'};`;
            row.innerHTML = `
              <span style="display:flex; align-items:center; gap:6px; font-weight:${isSel ? '700' : '500'};">
                <span style="width:10px; height:10px; border-radius:50%; background:${cHex}; border:1px solid rgba(255,255,255,0.4); display:inline-block;"></span>
                Path #${p.id} ${p.closed ? '●' : '〰'}
              </span>
              <span style="font-size:10px; opacity:0.7;">${p.nodes ? p.nodes.length : 0} pts${p.fill && p.fill !== 'none' ? ' · Fill' : ''}</span>
            `;
            row.addEventListener('click', () => {
              vl.selectedPathId = p.id;
              vl.selectedNodeIdx = p.nodes && p.nodes.length ? 0 : -1;
              if (vl.selectedNodeIndices instanceof Set) vl.selectedNodeIndices.clear();
              if (host.setActionMode) host.setActionMode('vector');
              else host.actionMode = 'vector';
              host.vectorSubTool = host.vectorSubTool || 'nodes';
              host.markOverlayDirty?.();
              syncUiFromHost();
            });
            vecPathsListEl.appendChild(row);
          }
        }
      }
    }

    const topVecInfo = document.getElementById('ip-top-vec-layer-info');
    if (topVecInfo && isVecLayerActive) {
      const totalPaths = vl && Array.isArray(vl.paths) ? vl.paths.length : 0;
      topVecInfo.textContent = `${totalPaths} path${totalPaths === 1 ? '' : 's'}`;
    }

    if (ipVecBar) {
      const showVecBar = (isVecLayerActive || host.actionMode === 'vector') && !isFloatTransforming;
      ipVecBar.style.display = showVecBar ? 'flex' : 'none';

      const rowNodes = document.getElementById('ip-vecbar-row-nodes');
      const rowBrush = document.getElementById('ip-vecbar-row-brush');
      if (rowNodes && rowBrush) {
        const isDrawLikeSub = (activeSubTool === 'draw' || activeSubTool === 'line' || activeSubTool === 'rect' || activeSubTool === 'ellipse' || activeSubTool === 'erase');
        rowNodes.style.display = isDrawLikeSub ? 'none' : 'flex';
        rowBrush.style.display = isDrawLikeSub ? 'flex' : 'none';
      }

      const btnPenDone = document.getElementById('btn-ip-vecbar-pen-done');
      if (btnPenDone) {
        btnPenDone.style.display = (vecPenActivePathId && selPath && selPath.id === vecPenActivePathId) ? 'inline-flex' : 'none';
      }

      const statusBadge = document.getElementById('ip-vecbar-status');
      if (statusBadge) {
        const totalPaths = vl && Array.isArray(vl.paths) ? vl.paths.length : 0;
        if (activeSubTool === 'pen' && vecPenActivePathId && selPath && selPath.id === vecPenActivePathId) {
          statusBadge.textContent = `Pen: ${selPath.nodes.length} pt${selPath.nodes.length === 1 ? '' : 's'} (open)`;
        } else if (selPath && Array.isArray(selPath.nodes)) {
          if (selNodeCount > 1) {
            statusBadge.textContent = `${selNodeCount}/${selPath.nodes.length} nodes sel`;
          } else if (vl && vl.selectedNodeIdx >= 0) {
            statusBadge.textContent = `Node #${vl.selectedNodeIdx + 1}/${selPath.nodes.length}`;
          } else {
            statusBadge.textContent = `Curve (${selPath.nodes.length} pts)`;
          }
        } else {
          statusBadge.textContent = `${totalPaths} path${totalPaths === 1 ? '' : 's'}`;
        }
      }

      const vecWSlider = document.getElementById('ip-vecbar-width-slider');
      const vecWVal = document.getElementById('ip-vecbar-width-val');
      if (vecWSlider && document.activeElement !== vecWSlider) {
        const wPct = selNode ? Math.round((selNode.widthScale ?? 1.0) * 100) : 100;
        vecWSlider.value = wPct;
        if (vecWVal) vecWVal.textContent = `${wPct}%`;
      }
    }

    // Wand Controls in Sheet & Floating Selection Bar
    const wandTolSheetSlider = document.getElementById('ip-sheet-slider-wand-tol');
    const wandTolSheetVal = document.getElementById('ip-sheet-wand-tol-val');
    const wandTolBarSlider = document.getElementById('ip-selbar-wand-tol');
    const wandTolBarVal = document.getElementById('ip-selbar-wand-tol-val');
    if (host.wandTolerance !== undefined) {
      if (wandTolSheetSlider && document.activeElement !== wandTolSheetSlider) wandTolSheetSlider.value = host.wandTolerance;
      if (wandTolSheetVal) wandTolSheetVal.textContent = host.wandTolerance;
      if (wandTolBarSlider && document.activeElement !== wandTolBarSlider) wandTolBarSlider.value = host.wandTolerance;
      if (wandTolBarVal) wandTolBarVal.textContent = host.wandTolerance;
    }
    const wandAdjSheetChk = document.getElementById('ip-sheet-wand-adj');
    const wandAdjBarChk = document.getElementById('ip-selbar-wand-adj');
    if (host.wandAdjacent !== undefined) {
      if (wandAdjSheetChk) wandAdjSheetChk.checked = host.wandAdjacent;
      if (wandAdjBarChk) wandAdjBarChk.checked = host.wandAdjacent;
    }

    // Animation Controls in #sheet-tools & Timeline Dock
    if (host.rasterAnimator) {
      const animPlayBtn = document.getElementById('btn-ip-sheet-anim-play') || document.getElementById('btn-sheet-anim-play');
      if (animPlayBtn) {
        animPlayBtn.textContent = host.rasterAnimator.isPlaying ? '⏸ Pause' : '▶ Play / Pause';
        animPlayBtn.classList.toggle('active', !!host.rasterAnimator.isPlaying);
      }
      document.getElementById('btn-ip-sheet-anim-onion')?.classList.toggle('active', !!host.rasterAnimator.onionSkin?.enabled);
      document.getElementById('btn-sheet-anim-onion')?.classList.toggle('active', !!host.rasterAnimator.onionSkin?.enabled);
      document.getElementById('btn-ip-sheet-anim-loop')?.classList.toggle('active', !!host.rasterAnimator.loop);
      const animFpsSlider = document.getElementById('ip-sheet-slider-anim-fps');
      const animFpsVal = document.getElementById('ip-sheet-anim-fps-val');
      if (animFpsSlider && document.activeElement !== animFpsSlider) animFpsSlider.value = host.rasterAnimator.fps || 12;
      if (animFpsVal) animFpsVal.textContent = host.rasterAnimator.fps || 12;
      const animDurInput = document.getElementById('ip-sheet-anim-duration');
      if (animDurInput && document.activeElement !== animDurInput) {
        const curCel = host.rasterAnimator.frames?.[host.rasterAnimator.currentFrameIndex];
        animDurInput.value = String(curCel?.duration || 1);
      }
    }
    if (host.rasterAnimatorUI) {
      if (host.rasterAnimatorUI.visible) {
        host.rasterAnimatorUI.syncUI();
      }
      const btnToggleDock = document.getElementById('btn-ip-sheet-anim-toggle-dock');
      if (btnToggleDock) {
        btnToggleDock.classList.toggle('active', !!host.rasterAnimatorUI.visible);
        btnToggleDock.textContent = host.rasterAnimatorUI.visible ? '🎬 Hide Timeline Dock on Canvas' : '🎬 Show Timeline Dock on Canvas';
      }
    }

    // Active Layer Opacity in Sheet
    const activeLayerIdx = (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.w_layer_get_active)
      ? host.canvasActor.exports.w_layer_get_active()
      : (host.canvasActor?.exports?.get_active_layer ? host.canvasActor.exports.get_active_layer() : 0);
    const activeLayerOp255 = (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.get_layer_opacity)
      ? host.canvasActor.exports.get_layer_opacity(activeLayerIdx)
      : 255;
    const activeLayerOpPct = Math.round((activeLayerOp255 / 255) * 100);
    const ipLayerOpSliderEl = document.getElementById('ip-active-layer-op-slider');
    const ipLayerOpValEl = document.getElementById('ip-active-layer-op-val');
    if (ipLayerOpSliderEl && document.activeElement !== ipLayerOpSliderEl) {
      ipLayerOpSliderEl.value = activeLayerOpPct;
    }
    if (ipLayerOpValEl) {
      ipLayerOpValEl.textContent = `${activeLayerOpPct}%`;
    }

    // 5. Grid & Symmetry buttons (legacy / header)
    const btnGrid = document.getElementById('btn-ip-grid');
    if (btnGrid) btnGrid.classList.toggle('active', !!host.showPixelGrid);

    const btnSym = document.getElementById('btn-ip-symmetry');
    if (btnSym) {
      btnSym.classList.toggle('active', symActive);
    }

    // 6. Brush Lab values & Layer pickers synchronization
    const layerCount = (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.w_layer_get_count)
      ? host.canvasActor.exports.w_layer_get_count()
      : 1;
    const texIds = host.getTextureWasmIds ? host.getTextureWasmIds() : new Set([0, 1, 2]);

    const shapeOptgroup = document.getElementById('ip-optgroup-shape-layers');
    if (shapeOptgroup) {
      shapeOptgroup.innerHTML = '';
      if (host.textures) {
        for (const [key, tex] of host.textures.entries()) {
          if (tex.category === 'shape' && tex.wasmId !== undefined && tex.wasmId >= 0) {
            const opt = document.createElement('option');
            opt.value = `layer:${tex.wasmId}`;
            opt.textContent = `Custom Tip: ${tex.name || key} (ID: ${tex.wasmId})`;
            shapeOptgroup.appendChild(opt);
          }
        }
      }
      for (let i = 0; i < layerCount; i++) {
        if (texIds.has(i)) continue;
        const opt = document.createElement('option');
        opt.value = `layer:${i}`;
        const name = host.layerNames?.get(i) || (i === 3 ? 'Background' : `Layer ${i}`);
        opt.textContent = `Layer: ${name} (ID: ${i})`;
        shapeOptgroup.appendChild(opt);
      }
    }

    const texOptgroup = document.getElementById('ip-optgroup-tex-layers');
    if (texOptgroup) {
      texOptgroup.innerHTML = '';
      if (host.textures) {
        for (const [key, tex] of host.textures.entries()) {
          if (tex.category === 'texture' && tex.wasmId !== undefined && tex.wasmId >= 0) {
            const opt = document.createElement('option');
            opt.value = `layer:${tex.wasmId}`;
            opt.textContent = `Custom Grain: ${tex.name || key} (ID: ${tex.wasmId})`;
            texOptgroup.appendChild(opt);
          }
        }
      }
      for (let i = 0; i < layerCount; i++) {
        if (texIds.has(i)) continue;
        const opt = document.createElement('option');
        opt.value = `layer:${i}`;
        const name = host.layerNames?.get(i) || (i === 3 ? 'Background' : `Layer ${i}`);
        opt.textContent = `Layer: ${name} (ID: ${i})`;
        texOptgroup.appendChild(opt);
      }
    }

    if (host.brushParams) {
      const bp = host.brushParams;
      const setLabSlider = (sliderId, valId, val, suf = '') => {
        const s = document.getElementById(sliderId);
        const v = document.getElementById(valId);
        if (s && val !== undefined) {
          s.value = val;
          if (v) v.textContent = val + suf;
        }
      };

      const labName = document.getElementById('ip-lab-brush-name');
      if (labName) {
        const activeKey = host.activeBrush;
        const p = BRUSH_PRESETS[activeKey] || (host.customBrushPresets && host.customBrushPresets[activeKey]);
        labName.textContent = `(${p?.name || activeKey || 'Custom'})`;
      }

      // Tip shape selection
      const selShape = document.getElementById('ip-sel-brush-shape');
      if (selShape) {
        const curShape = bp.shape !== undefined ? bp.shape : 0;
        if (typeof curShape === 'string' && curShape.startsWith('layer:')) {
          selShape.value = curShape;
        } else if (curShape >= 0 && curShape <= 7) {
          selShape.value = String(curShape);
        } else {
          selShape.value = `layer:${curShape}`;
        }
      }

      // Tip
      setLabSlider('ip-slider-hardness', 'ip-val-hardness', bp.hardness ?? 100, '%');
      setLabSlider('ip-slider-roundness', 'ip-val-roundness', bp.roundness ?? 100, '%');
      setLabSlider('ip-slider-angle', 'ip-val-angle', bp.angle ?? 0, '°');

      // Dynamics
      const selStabMode = document.getElementById('ip-select-stabilizer-mode');
      const isPulled = (bp.stabilizer_mode === 1 || bp.stabilizer_mode === 'pulled' || bp.stabilizer_mode === 'string');
      if (selStabMode) {
        selStabMode.value = isPulled ? '1' : '0';
      }
      const ctrlStringLen = document.getElementById('ip-ctrl-string-length');
      const ctrlMidpoint = document.getElementById('ip-ctrl-midpoint');
      if (ctrlStringLen) ctrlStringLen.style.display = isPulled ? 'flex' : 'none';
      if (ctrlMidpoint) ctrlMidpoint.style.display = isPulled ? 'none' : 'flex';

      setLabSlider('ip-slider-spacing', 'ip-val-spacing', bp.spacing ?? 5, '%');
      setLabSlider('ip-slider-smoothing', 'ip-val-smoothing', bp.smoothing ?? 0, '%');
      setLabSlider('ip-slider-string-length', 'ip-val-string-length', bp.string_length ?? 30, 'px');
      setLabSlider('ip-slider-midpoint', 'ip-val-midpoint', bp.midpoint ?? 50, '%');
      setLabSlider('ip-slider-velocity', 'ip-val-velocity', bp.velocity ?? 0, '%');
      setLabSlider('ip-slider-taper-in', 'ip-val-taper-in', bp.taper_in ?? 0, '%');
      setLabSlider('ip-slider-taper-out', 'ip-val-taper-out', bp.taper_out ?? 0, '%');
      setLabSlider('ip-slider-fade', 'ip-val-fade', bp.fade ?? 0, '%');

      // Wet
      setLabSlider('ip-slider-wetness', 'ip-val-wetness', bp.wetness ?? 0, '%');
      setLabSlider('ip-slider-smudge', 'ip-val-smudge', bp.smudge ?? 0, '%');
      setLabSlider('ip-slider-pickup', 'ip-val-pickup', bp.color_pickup ?? 0, '%');
      setLabSlider('ip-slider-depletion', 'ip-val-depletion', bp.depletion ?? 0, '%');

      // Jitters
      setLabSlider('ip-slider-jitter-size', 'ip-val-jitter-size', bp.size_jitter ?? 0, '%');
      setLabSlider('ip-slider-jitter-angle', 'ip-val-jitter-angle', bp.angle_jitter ?? 0, '%');
      setLabSlider('ip-slider-jitter-op', 'ip-val-jitter-op', bp.opacity_jitter ?? 0, '%');
      setLabSlider('ip-slider-jitter-color', 'ip-val-jitter-color', bp.color_jitter ?? 0, '%');
      setLabSlider('ip-slider-scatter', 'ip-val-scatter', bp.scatter ?? 0, '%');
      setLabSlider('ip-slider-dual-size', 'ip-val-dual-size', bp.dual_size ?? 100, '%');
      setLabSlider('ip-slider-dual-spacing', 'ip-val-dual-spacing', bp.dual_spacing ?? 10, '%');

      // Texture
      setLabSlider('ip-slider-grain', 'ip-val-grain', bp.grain ?? 0, '%');
      setLabSlider('ip-slider-tex-scale', 'ip-val-tex-scale', bp.texture_scale ?? 100, '%');
      setLabSlider('ip-slider-tex-contrast', 'ip-val-tex-contrast', bp.texture_contrast ?? 100, '%');
      setLabSlider('ip-slider-tex-rotate', 'ip-val-tex-rotate', bp.texture_rotate ?? (bp.texture_angle ?? 0), '°');

      // Toggles
      const setChk = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!val;
      };
      setChk('chk-ip-lab-autorotate', bp.auto_rotate);
      setChk('chk-ip-lab-subpixel', bp.subpixel);
      setChk('chk-ip-lab-press-size', bp.pressure_size ?? 1);
      setChk('chk-ip-lab-press-flow', bp.pressure_flow ?? 1);
      setChk('chk-ip-lab-tilt-angle', bp.tilt_angle ?? 1);
      setChk('chk-ip-lab-buildup', bp.buildup);

      // Selects
      const setSel = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.value = val;
      };
      setSel('ip-sel-dab-blend', bp.dab_blend ?? 0);
      setSel('ip-sel-dual-shape', bp.dual_shape ?? -1);
      const selTex = document.getElementById('ip-sel-texture');
      if (selTex) {
        if (bp.tex_layer !== undefined && bp.tex_layer >= 0) {
          selTex.value = `layer:${bp.tex_layer}`;
        } else {
          selTex.value = host.activeTexture || bp.texture || 'none';
        }
      }
      setSel('ip-sel-tex-mode', bp.texture_mode ?? 0);
    }
    saveUserPreferences();
  }

  // Initial population
  populateBrushPresetsUI();
  populateScriptSelect();
  const initialScripts = getSavedScripts();
  if (initialScripts.length > 0 && scriptEditor && !scriptEditor.value) {
    if (scriptNameInp) scriptNameInp.value = initialScripts[0].name;
    scriptEditor.value = initialScripts[0].code;
    if (scriptSel) scriptSel.value = '0';
  }
  renderSwatches();
  initInfinitePainterUI();
  if (window.isDockviewPainter) {
    refreshTouchColorStudio();
  }
  syncUiFromHost();
  host.updateStatus = (docX, docY, force) => updateStatus(host, docX, docY, force);
  window.host = host;
  window.W = host.canvasActor;
  if (window.esenho) {
    window.esenho.setContext({ host, actor: host.canvasActor });
  }
  window.dispatchEvent(new CustomEvent('esenho:ready', { detail: { host } }));
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'PAINTER_READY' }, '*');
    } catch (_) {}
  }
}

main().catch(e => { console.error(e); log(`BOOT ERROR: ${e.message}`, 'err'); });




