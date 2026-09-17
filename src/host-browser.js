/**
 * src/host-browser.js — Esenho browser host
 * Reuses all engine logic from src/esenho.js unchanged.
 * Handles: fetch WASM, canvas events, touch (draw/pan/zoom/rotate), REPL.
 */
if (typeof globalThis.process === 'undefined') {
  globalThis.process = { stdout: { write: (s) => console.log(String(s)) } };
}

const canvasEl   = document.getElementById('wcanvas');
const ctx        = canvasEl.getContext('2d', { desynchronized: true });
const termEl      = document.getElementById('wterm');
const inputEl     = document.getElementById('wcmd');
const statusEl    = document.getElementById('wstatus');
const toggleBtn   = document.getElementById('toggle-panel');

/* ── Boot ── */
async function main() {
  log('Loading canvas.wasm…');
  const host = new EsenhoScreenHost();
  /* canvasRotation: radians, stored on host */
  host.canvasRotation = 0;

  if (!globalThis.papagaio) {
    try {
      const mod = await import('./papagaio/index.js');
      globalThis.papagaio = mod.papagaio;
    } catch (_) {}
  }

  host.sendConsoleLog = (text, color = 0xFF00FF88) =>
    log(text, color === 0xFFFF5555 ? 'err' : 'ok');

  host.canvasActor = await EsenhoModule.fromURL('roms/canvas.wasm', { name: 'canvas' });
  const urlParams = new URLSearchParams(window.location.search);
  const projectIdParam = urlParams.get('project') || urlParams.get('p') || urlParams.get('id');
  let projectLoaded = false;

  if (projectIdParam && typeof EsenhoStore !== 'undefined') {
    try {
      const savedProj = await EsenhoStore.getProject(projectIdParam);
      if (savedProj) {
        host.loadProject(savedProj);
        projectLoaded = true;
        host.currentProjectId = savedProj.id;
        host.currentProjectName = savedProj.name || 'Untitled Project';
        localStorage.setItem('esenho_last_project_id', savedProj.id);
        log(`Loaded project '${savedProj.name}' (${savedProj.width}x${savedProj.height}) [ok]`);
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
    localStorage.setItem('esenho_last_project_id', host.currentProjectId);

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

    // Restore user preferences
    try {
      const savedTool = localStorage.getItem('esenho_last_tool');
      if (savedTool !== null) host.currentTool = parseInt(savedTool, 10) || 0;
      const savedAction = localStorage.getItem('esenho_last_action_mode');
      if (savedAction) host.actionMode = savedAction;
      const savedCol = localStorage.getItem('esenho_last_color');
      if (savedCol) host.currentColor = parseInt(savedCol, 10) >>> 0;
      const savedBP = localStorage.getItem('esenho_saved_brush_params');
      if (savedBP) {
        const parsedBP = JSON.parse(savedBP);
        for (const [k, v] of Object.entries(parsedBP)) {
          host.setBrushParam(k, v);
        }
      }
    } catch (_) {}

    host.syncBrushParams(host.canvasActor);
    host.canvasActor.exports.force_composite();
  }
  log('canvas.wasm ready [ok]');

  try {
    const res = await fetch('plugins/manifest.json');
    if (res.ok) {
      const list = await res.json();
      for (const item of list) {
        const file = typeof item === 'string' ? item : item.file || item.name;
        if (!file || !file.endsWith('.wasm')) continue;
        const name = file.replace(/\.wasm$/i, '');
        try {
          const mod = await EsenhoModule.fromURL(`plugins/${file}`, { name });
          host.plugins.set(name, { type: 'filter', module: mod, actor: mod });
        } catch (e) {
          log(`warn: plugin ${file} — ${e.message}`, 'err');
        }
      }
    }
  } catch (e) {
    log(`info: plugins dynamic discovery: ${e.message}`);
  }
  log(`${host.plugins.size} plugins loaded [ok]`);

  /* ── Ensure UI Panel exists in DOM ── */
  ensureUiPanel();

  /* ── Canvas sizing + pan management ── */
  const isMobile = () => window.innerWidth <= 768;
  let initializedPan = false;

  let isCanvasDirty = false;
  function markCanvasDirty() {
    isCanvasDirty = true;
    const badge = document.getElementById('ui-autosave-badge');
    if (badge) {
      badge.textContent = 'Unsaved';
      badge.style.color = '#fabd2f';
    }
    saveUserPreferences();
  }

  function markCanvasClean() {
    isCanvasDirty = false;
    const badge = document.getElementById('ui-autosave-badge');
    if (badge) {
      badge.textContent = 'Saved';
      badge.style.color = '#b8bb26';
    }
  }

  function saveUserPreferences() {
    try {
      if (host.currentTool !== undefined) localStorage.setItem('esenho_last_tool', String(host.currentTool));
      if (host.actionMode) localStorage.setItem('esenho_last_action_mode', host.actionMode);
      if (host.currentColor !== undefined) localStorage.setItem('esenho_last_color', String(host.currentColor));
      if (host.brushParams) localStorage.setItem('esenho_saved_brush_params', JSON.stringify(host.brushParams));
      if (host.currentProjectId) localStorage.setItem('esenho_last_project_id', host.currentProjectId);
    } catch (_) {}
  }

  async function performAutosave(force = false) {
    if (!force && !isCanvasDirty) return;
    if (typeof EsenhoStore === 'undefined' || typeof host.exportProject !== 'function') return;

    const badge = document.getElementById('ui-autosave-badge');
    if (badge) {
      badge.textContent = 'Saving...';
      badge.style.color = '#fabd2f';
    }

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
      if (badge) {
        badge.textContent = 'Save Error';
        badge.style.color = '#fb4934';
      }
    }
  }

  // Periodic autosave every 60s
  setInterval(() => {
    performAutosave(false);
  }, 60000);


  function resize() {
    const parent = canvasEl.parentElement;
    if (!parent) return;
    const parentW = parent.clientWidth;
    const parentH = parent.clientHeight;
    if (parentW <= 0 || parentH <= 0) return;

    const prevW = canvasEl.width;
    const prevH = canvasEl.height;

    if (canvasEl.width !== parentW || canvasEl.height !== parentH) {
      canvasEl.width  = parentW;
      canvasEl.height = parentH;
      host.windowWidth  = parentW;
      host.windowHeight = parentH;
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

    
  }
  resize();
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined' && canvasEl.parentElement) {
    new ResizeObserver(() => resize()).observe(canvasEl.parentElement);
  }

  

  
  /* ── Mobile-First Unified Bottom Dock & Drawer ── */
  const savedMobileH = localStorage.getItem('esenho_mobile_drawer_height');
  if (savedMobileH) {
    const pH = parseInt(savedMobileH, 10);
    if (pH >= 80 && pH <= window.innerHeight * 0.85) {
      document.documentElement.style.setProperty('--mobile-drawer-height', `${pH}px`);
    }
  }

  function syncDrawerPanel(isOpen, targetHeight) {
    const uiEl = document.getElementById('ui-panel');
    if (!uiEl) return;

    if (!isOpen) {
      uiEl.classList.add('hidden');
      uiEl.style.height = '';
      resize();
      return;
    }

    const wasHidden = uiEl.classList.contains('hidden');
    uiEl.classList.remove('hidden');

    if (wasHidden) {
      armTouchGuard(uiEl);
    }

    let h = targetHeight;
    if (typeof h !== 'number' || h <= 0) {
      const saved = parseInt(localStorage.getItem('esenho_mobile_drawer_height'), 10);
      h = saved || Math.round(window.innerHeight * 0.42);
    }
    h = Math.max(80, Math.min(Math.round(window.innerHeight * 0.75), h));
    uiEl.style.height = `${h}px`;
    document.documentElement.style.setProperty('--mobile-drawer-height', `${h}px`);
    resize();
  }
  const syncMobilePanels = syncDrawerPanel;
  function updateDockTabs() {}

  function armTouchGuard(el) {
    if (!el) return;
    el.classList.add('touch-guard');
    setTimeout(() => {
      el.classList.remove('touch-guard');
    }, 250);
  }

  /* ── Toggle UI tools panel ── */
  function toggleUi(forceOpen) {
    const el = document.getElementById('ui-panel');
    if (!el) return;

    let willOpen;
    if (typeof forceOpen === 'boolean') {
      willOpen = forceOpen;
    } else {
      willOpen = el.classList.contains('hidden');
    }

    syncDrawerPanel(willOpen);
  }

  /* ── Toggle console/scripts tab in bottom drawer ── */
  function toggleConsole(forceOpen, targetSubTab) {
    const uiEl = document.getElementById('ui-panel');
    if (!uiEl) return;

    let willOpen;
    if (typeof forceOpen === 'boolean') {
      willOpen = forceOpen;
    } else {
      willOpen = uiEl.classList.contains('hidden');
    }

    if (willOpen) {
      switchDrawerTab('console');
      syncDrawerPanel(true);
      const cmdInput = document.getElementById('wcmd');
      if (cmdInput) cmdInput.focus();
    } else {
      syncDrawerPanel(false);
    }
  }

  /* ── Draggable Tab Setup (Legacy compatibility) ── */
  function setupDraggableTab(panelId, btnId, side, storageKey) {
    // No-op in unified mobile-first bottom dock layout
  }

  const bottomDock = document.getElementById('bottom-dock');
  const dockHandle = document.getElementById('bottom-dock-handle');
  if (bottomDock) {
    let isDraggingDock = false;
    let hasMoved = false;
    let startY = 0;
    let startH = 0;
    let suppressClickUntil = 0;

    // Toggle dock drawer on handle click
    if (dockHandle) {
      dockHandle.addEventListener('click', (e) => {
        if (e.target.closest('#btn-open-toolbar-mgr, #btn-toggle-dock-strip, .dock-handle-btn, .dock-handle-toggle')) return;
        if (Date.now() < suppressClickUntil) { e.preventDefault(); e.stopPropagation(); return; }
        const uiEl = document.getElementById('ui-panel');
        const isHidden = !uiEl || uiEl.classList.contains('hidden');
        syncDrawerPanel(isHidden);
      });
    }

    let dockRafId = null;
    let pendingClientY = null;

    const updateDockHeightUI = (clientY) => {
      if (!isDraggingDock) return;
      const dy = clientY - startY;
      if (!hasMoved && Math.abs(dy) > 3) hasMoved = true;
      if (!hasMoved) return;

      const maxH = Math.round(window.innerHeight * 0.75);
      if (startH === 0) {
        if (-dy > 12) {
          let newH = Math.max(80, Math.min(maxH, -dy));
          document.documentElement.style.setProperty('--mobile-drawer-height', `${newH}px`);
          syncDrawerPanel(true, newH);
        } else if (dy <= 18) {
          syncDrawerPanel(false);
        }
      } else {
        let newH = startH - dy;
        if (newH >= 70) {
          newH = Math.min(maxH, newH);
          document.documentElement.style.setProperty('--mobile-drawer-height', `${newH}px`);
          syncDrawerPanel(true, newH);
        } else {
          syncDrawerPanel(false);
        }
      }
    };

    const applyDockHeight = (clientY) => {
      pendingClientY = clientY;
      if (!dockRafId) {
        dockRafId = requestAnimationFrame(() => {
          dockRafId = null;
          if (pendingClientY !== null) {
            updateDockHeightUI(pendingClientY);
          }
        });
      }
    };

    const finishDockDrag = () => {
      if (!isDraggingDock) return;
      isDraggingDock = false;
      if (dockRafId) {
        cancelAnimationFrame(dockRafId);
        dockRafId = null;
      }
      if (pendingClientY !== null) {
        updateDockHeightUI(pendingClientY);
        pendingClientY = null;
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishDockDrag);
      window.removeEventListener('pointercancel', finishDockDrag);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', finishDockDrag);
      window.removeEventListener('touchcancel', finishDockDrag);

      if (hasMoved) {
        suppressClickUntil = Date.now() + 250;

        const uiEl = document.getElementById('ui-panel');
        if (uiEl && !uiEl.classList.contains('hidden')) {
          if (uiEl.offsetHeight < 70) {
            syncDrawerPanel(false);
          } else {
            localStorage.setItem('esenho_mobile_drawer_height', uiEl.offsetHeight);
          }
        }
      }
      updateDockTabs();
      hasMoved = false;
      resize();
    };

    const onPointerMove = (e) => {
      if (hasMoved && e.cancelable) e.preventDefault();
      applyDockHeight(e.clientY);
    };

    const onTouchMove = (e) => {
      if (e.touches && e.touches.length > 0) {
        if (hasMoved && e.cancelable) e.preventDefault();
        applyDockHeight(e.touches[0].clientY);
      }
    };

    const handleDockStart = (clientY, isDirectHandle, target) => {
      if (target && target.closest('#btn-open-toolbar-mgr, #btn-toggle-dock-strip, .dock-handle-btn, .dock-handle-toggle, .dock-nav-btn, .dock-panel')) return false;
      if (!isDirectHandle) return false;
      const uiEl = document.getElementById('ui-panel');
      const uiHidden = !uiEl || uiEl.classList.contains('hidden');
      startH = (!uiHidden) ? uiEl.offsetHeight : 0;
      isDraggingDock = true;
      hasMoved = false;
      startY = clientY;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';
      return true;
    };

    bottomDock.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('#btn-open-toolbar-mgr, #btn-toggle-dock-strip, .dock-handle-btn, .dock-handle-toggle, .dock-nav-btn, .dock-panel, #ui-panel, #bottom-dock-bars')) return;
      const isDirectHandle = (e.target === dockHandle || (dockHandle && dockHandle.contains(e.target)));
      if (!handleDockStart(e.clientY, isDirectHandle, e.target)) return;
      if (isDirectHandle && e.cancelable) e.preventDefault();

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', finishDockDrag);
      window.addEventListener('pointercancel', finishDockDrag);
    });

    bottomDock.addEventListener('touchstart', e => {
      if (e.touches && e.touches.length > 0) {
        if (e.target.closest('#btn-toggle-dock-strip, .dock-handle-toggle, .dock-nav-btn, .dock-panel, #ui-panel, #bottom-dock-bars')) return;
        const isDirectHandle = (e.target === dockHandle || (dockHandle && dockHandle.contains(e.target)));
        if (!handleDockStart(e.touches[0].clientY, isDirectHandle, e.target)) return;
        if (isDirectHandle && e.cancelable) e.preventDefault();

        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', finishDockDrag);
        window.addEventListener('touchcancel', finishDockDrag);
      }
    }, { passive: false });
  }

  // Initial setup: start with full-screen canvas (drawer closed)
  const initialUiEl = document.getElementById('ui-panel');
  if (initialUiEl) initialUiEl.classList.add('hidden');
  updateDockTabs();
  resize();

  window.addEventListener('keydown', e => {
    if (e.key === '`' && e.ctrlKey) {
      toggleConsole();
      e.preventDefault();
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
    } else if ((e.ctrlKey && (e.key === 'd' || e.key === 'D')) || e.key === 'Escape') {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      host.clearSelection();
      e.preventDefault();
    } else if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      host.selectAll();
      e.preventDefault();
    }
  });

  /* ── Render loop ── */
  let imgData = null;
  let offscreen = null;
  let offscreenCtx = null;
  let lassoPoints = [];

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
      } else {
        host.pushUndoSnapshot(isErase ? 'erase rect' : 'shape rect');
        const drawCol = isErase ? 0x00000000 : col;
        host.canvasActor.exports.w_draw_rect(rx, ry, rw, rh, drawCol);
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
      } else {
        host.pushUndoSnapshot(isErase ? 'erase ellipse' : 'shape ellipse');
        const drawCol = isErase ? 0x00000000 : col;
        host.canvasActor.exports.w_draw_ellipse(Math.round(cx), Math.round(cy), Math.round(rx), Math.round(ry), drawCol);
        if (host.canvasActor.exports.force_composite) host.canvasActor.exports.force_composite();
      }
    }
  }

  function frame() {
    if (canvasEl.parentElement) {
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

    ctx.fillStyle = '#1d2021';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

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

      /* Draw with pan + zoom + rotation around doc center */
      const cx = host.panX + (cw * host.zoom) / 2;
      const cy = host.panY + (ch * host.zoom) / 2;
      ctx.save();
      ctx.translate(cx, cy);
      if (host.flipH) ctx.scale(-1, 1);
      if (host.flipV) ctx.scale(1, -1);
      ctx.rotate(host.canvasRotation);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, -(cw * host.zoom) / 2, -(ch * host.zoom) / 2, cw * host.zoom, ch * host.zoom);

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

        // Draw quad outline
        ctx.beginPath();
        ctx.moveTo(c[0].x * z, c[0].y * z);
        ctx.lineTo(c[1].x * z, c[1].y * z);
        ctx.lineTo(c[2].x * z, c[2].y * z);
        ctx.lineTo(c[3].x * z, c[3].y * z);
        ctx.closePath();
        ctx.fillStyle = 'rgba(69, 133, 136, 0.12)';
        ctx.fill();
        ctx.strokeStyle = '#83a598';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.stroke();

        // Corner handles (white square) — perspective control, each moves independently
        const hs = 7;
        ctx.fillStyle = '#ebdbb2';
        ctx.strokeStyle = '#458588';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const px = c[i].x * z, py = c[i].y * z;
          ctx.fillRect(px - hs/2, py - hs/2, hs, hs);
          ctx.strokeRect(px - hs/2, py - hs/2, hs, hs);
        }

        // Edge midpoint handles (diamond) — skew: moves adjacent pair
        const edgeMids = [
          [(c[0].x + c[1].x)/2 * z, (c[0].y + c[1].y)/2 * z],
          [(c[1].x + c[2].x)/2 * z, (c[1].y + c[2].y)/2 * z],
          [(c[2].x + c[3].x)/2 * z, (c[2].y + c[3].y)/2 * z],
          [(c[3].x + c[0].x)/2 * z, (c[3].y + c[0].y)/2 * z],
        ];
        ctx.fillStyle = '#a89984';
        ctx.strokeStyle = '#458588';
        const ds = 5; // diamond half-size
        for (const [mx, my] of edgeMids) {
          ctx.beginPath();
          ctx.moveTo(mx, my - ds);
          ctx.lineTo(mx + ds, my);
          ctx.lineTo(mx, my + ds);
          ctx.lineTo(mx - ds, my);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        ctx.restore();
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
    const r = canvasEl.getBoundingClientRect();
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

  /* ── Mouse events ── */
  canvasEl.addEventListener('contextmenu', e => e.preventDefault());

  /* Helper: hit-test float transform handles. Returns handle id string or null. */
  /* Maps doc-space handle positions to screen-space, returns handle id or null */
  function ftHitTest(x, y) {
    const ft = host.floatingTransform;
    if (!ft || !ft.corners) return null;
    const z = host.zoom;
    const hs = 10; // hit radius px in screen space
    // Corner handles: c0=tl, c1=tr, c2=br, c3=bl
    const c = ft.corners;
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
    for (const h of [...cornerHandles, ...edgeHandles]) {
      const dx = (h.x - x) * z, dy = (h.y - y) * z;
      if (Math.abs(dx) < hs && Math.abs(dy) < hs) return h.id;
    }
    // Inside quad check (simple point-in-quad via cross products)
    function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
    let inside = true;
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      if (cross(b.x - a.x, b.y - a.y, x - a.x, y - a.y) < 0) { inside = false; break; }
    }
    if (inside) return 'move';
    return null;
  }

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
    if (e.pointerType === 'touch') return; // Handled by touch events (gestures/taps)
    if (e.pointerType === 'pen') penActive = true;
    try { canvasEl.setPointerCapture(e.pointerId); } catch (_) {}

    const { sx, sy, x, y } = clientPos(e);
    host.mouseHover = { x, y, sx, sy, inside: true };
    host.mouseState.x = sx; host.mouseState.y = sy;
    if (e.button === 1) {
      host.isPanning = true; host.panStartX = sx; host.panStartY = sy;
    } else {
      host.mouseState.buttons |= e.button === 0 ? 1 : 2;
      const curMode = host.brushParams ? host.brushParams.mode : 0;

      // Float transform takes priority
      if (host.floatingTransform) {
        const handle = ftHitTest(x, y);
        if (handle) {
          ftDragging = true;
          ftHandle = handle;
          ftDragStart = { sx, sy, x, y };
          const ft = host.floatingTransform;
          // Deep copy corners for drag origin
          ftDragOrigin = { corners: ft.corners.map(c => ({ x: c.x, y: c.y })) };
          e.preventDefault();
          return;
        }
        // Click outside float → apply
        host.applyFloatTransform();
        e.preventDefault();
        return;
      }

      if (curMode === 5) {
        sampleEyedropperColor(x, y, e.clientX, e.clientY);
        e.preventDefault();
        return;
      }
      if (curMode >= 6 && curMode <= 8) {
        isDraggingShape = true;
        shapeStartDoc = { x, y };
        shapeCurDoc = { x, y };
        e.preventDefault();
        return;
      }
      if (host.actionMode === 'select') {
        if (curMode === 3) {
          // Fill in select mode = magic wand selection
          host.wandSelect(x, y, host.wandTolerance, host.wandAdjacent);
          e.preventDefault();
          return;
        }
        if (curMode === 4) {
          // Lasso in select mode = polygon selection
          isLassoSelecting = true;
          lassoSelPoints = [{ x, y }];
          if (host.selectionMode === 'replace') {
            host.clearSelection();
          }
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
        e.preventDefault();
        return;
      }
      host.isDrawingOnCanvas = true;
      host.strokePrevX = x; host.strokePrevY = y;

      // Check for hardware stylus eraser tip: button 5, buttons & 32
      const isEraserTip = (e.pointerType === 'pen') && (e.button === 5 || ((e.buttons & 32) !== 0));
      const isEraseMode = host.actionMode === 'erase' || isEraserTip;
      host.strokeIsEraser = (e.button === 2 || isEraserTip) ? 1 : (isEraseMode || host.currentTool === 1 ? 1 : 0);
      const strokeCol = isEraseMode && curMode === 3 ? 0x00000000 : host.currentColor;
      if (host.brushParams && host.brushParams.mode === 4) {
        lassoPoints = [{ x, y }];
      }
      const press = (e.pointerType === 'pen' && e.pressure !== undefined && e.pressure > 0) ? e.pressure : 1.0;
      host.sendStroke(x, y, x, y, 0, host.strokeIsEraser, strokeCol, press, e.tiltX || 0, e.tiltY || 0);
    }
    e.preventDefault();
  });

  const handlePointerMove = e => {
    if (e.pointerType === 'touch') return;
    const { sx, sy, x, y } = clientPos(e);
    host.mouseHover = { x, y, sx, sy, inside: true };
    host.mouseState.x = sx; host.mouseState.y = sy;
    if (host.isPanning) {
      host.panX += sx - host.panStartX; host.panY += sy - host.panStartY;
      host.panStartX = sx; host.panStartY = sy;
    } else if (ftDragging && ftHandle && ftDragStart && ftDragOrigin) {
      const ft = host.floatingTransform;
      if (ft && ftDragOrigin.corners) {
        const ddx = (sx - ftDragStart.sx) / host.zoom;
        const ddy = (sy - ftDragStart.sy) / host.zoom;
        const oc = ftDragOrigin.corners;
        if (ftHandle === 'move') {
          // Translate all 4 corners
          for (let i = 0; i < 4; i++) {
            ft.corners[i].x = oc[i].x + ddx;
            ft.corners[i].y = oc[i].y + ddy;
          }
        } else if (ftHandle === 'c0') {
          ft.corners[0].x = oc[0].x + ddx; ft.corners[0].y = oc[0].y + ddy;
        } else if (ftHandle === 'c1') {
          ft.corners[1].x = oc[1].x + ddx; ft.corners[1].y = oc[1].y + ddy;
        } else if (ftHandle === 'c2') {
          ft.corners[2].x = oc[2].x + ddx; ft.corners[2].y = oc[2].y + ddy;
        } else if (ftHandle === 'c3') {
          ft.corners[3].x = oc[3].x + ddx; ft.corners[3].y = oc[3].y + ddy;
        } else if (ftHandle === 'e01') {
          // Top edge: move c0 and c1 together (skew top)
          ft.corners[0].x = oc[0].x + ddx; ft.corners[0].y = oc[0].y + ddy;
          ft.corners[1].x = oc[1].x + ddx; ft.corners[1].y = oc[1].y + ddy;
        } else if (ftHandle === 'e23') {
          // Bottom edge: move c2 and c3 together (skew bottom)
          ft.corners[2].x = oc[2].x + ddx; ft.corners[2].y = oc[2].y + ddy;
          ft.corners[3].x = oc[3].x + ddx; ft.corners[3].y = oc[3].y + ddy;
        } else if (ftHandle === 'e30') {
          // Left edge: move c0 and c3 together (skew left)
          ft.corners[0].x = oc[0].x + ddx; ft.corners[0].y = oc[0].y + ddy;
          ft.corners[3].x = oc[3].x + ddx; ft.corners[3].y = oc[3].y + ddy;
        } else if (ftHandle === 'e12') {
          // Right edge: move c1 and c2 together (skew right)
          ft.corners[1].x = oc[1].x + ddx; ft.corners[1].y = oc[1].y + ddy;
          ft.corners[2].x = oc[2].x + ddx; ft.corners[2].y = oc[2].y + ddy;
        }
      }
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
      for (const ev of coalesced) {
        const pt = clientPos(ev);
        if (host.brushParams && host.brushParams.mode === 4) {
          lassoPoints.push({ x: pt.x, y: pt.y });
        }
        const strokeCol = host.actionMode === 'select' ? 0xFF83A598 : host.currentColor;
        const press = (ev.pointerType === 'pen' && ev.pressure !== undefined && ev.pressure > 0) ? ev.pressure : 1.0;
        host.sendStroke(pt.x, pt.y, host.strokePrevX, host.strokePrevY, 1, host.strokeIsEraser, strokeCol, press, ev.tiltX || 0, ev.tiltY || 0);
        host.strokePrevX = pt.x; host.strokePrevY = pt.y;
      }
    }
    updateStatus(host, x, y);
  };

  if (typeof window !== 'undefined' && 'onpointerrawupdate' in window) {
    canvasEl.addEventListener('pointerrawupdate', handlePointerMove, { passive: false });
  } else {
    canvasEl.addEventListener('pointermove', handlePointerMove, { passive: false });
  }

  const handlePointerUp = e => {
    if (e.pointerType === 'touch') return;
    if (e.pointerType === 'pen') penActive = false;
    try { canvasEl.releasePointerCapture(e.pointerId); } catch (_) {}
    if (e.button === 1) { host.isPanning = false; }
    else {
      host.mouseState.buttons &= ~(e.button === 0 ? 1 : 2);
      if (ftDragging) {
        ftDragging = false; ftHandle = null; ftDragStart = null; ftDragOrigin = null;
        // Bake the homographic transform into the WASM layer pixels
        const ft = host.floatingTransform;
        if (ft) {
          const ptr = host.canvasActor.exports.w_layer_get_pixels(ft.layerId);
          if (ptr) {
            const lw = host.canvasActor.exports.w_layer_get_width(ft.layerId);
            const lh = host.canvasActor.exports.w_layer_get_height(ft.layerId);
            const tgtU32 = new Uint32Array(host.canvasActor.memory.buffer, ptr, lw * lh);
            tgtU32.fill(0);
            const srcPts = [
              { x: 0, y: 0 }, { x: ft.width, y: 0 },
              { x: ft.width, y: ft.height }, { x: 0, y: ft.height }
            ];
            const H_inv = host._computeHomography(ft.corners, srcPts);
            if (H_inv) {
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              for (const c of ft.corners) {
                if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
                if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
              }
              const x0 = Math.max(0, Math.floor(minX)), y0 = Math.max(0, Math.floor(minY));
              const x1 = Math.min(lw - 1, Math.ceil(maxX)), y1 = Math.min(lh - 1, Math.ceil(maxY));
              for (let oy = y0; oy <= y1; oy++) {
                for (let ox = x0; ox <= x1; ox++) {
                  const W = H_inv[6] * (ox + 0.5) + H_inv[7] * (oy + 0.5) + H_inv[8];
                  const srcX = Math.round((H_inv[0] * (ox + 0.5) + H_inv[1] * (oy + 0.5) + H_inv[2]) / W - 0.5);
                  const srcY = Math.round((H_inv[3] * (ox + 0.5) + H_inv[4] * (oy + 0.5) + H_inv[5]) / W - 0.5);
                  if (srcX < 0 || srcX >= ft.width || srcY < 0 || srcY >= ft.height) continue;
                  const sp = ft.pixels[srcY * ft.width + srcX];
                  if (((sp >> 24) & 0xFF) === 0) continue;
                  tgtU32[oy * lw + ox] = sp;
                }
              }
            }
            if (host.canvasActor.exports.force_composite) host.canvasActor.exports.force_composite();
          }
        }
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
        const strokeCol = host.actionMode === 'select' ? 0xFF83A598 : host.currentColor;
        const press = (e.pointerType === 'pen' && e.pressure !== undefined && e.pressure > 0) ? e.pressure : 1.0;
        host.sendStroke(host.strokePrevX, host.strokePrevY,
                        host.strokePrevX, host.strokePrevY,
                        2, host.strokeIsEraser, strokeCol, press, e.tiltX || 0, e.tiltY || 0);
        host.isDrawingOnCanvas = false;
        lassoPoints = [];
        if (selectScratchLayerId >= 0) {
          endBrushSelect();
        }
        markCanvasDirty();
      }
      if (e.pointerType !== 'touch') {
        const p = clientPos(e);
        host.mouseHover = { x: p.x, y: p.y, sx: p.sx, sy: p.sy, inside: true };
      }
    }
  };

  canvasEl.addEventListener('pointerup', handlePointerUp);
  canvasEl.addEventListener('pointercancel', handlePointerUp);

  canvasEl.addEventListener('wheel', e => {
    const r = canvasEl.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.15 : 0.85, old = host.zoom;
    host.zoom = Math.max(0.05, Math.min(20, host.zoom * f));
    /* zoom toward cursor — adjust pan so screen point stays fixed */
    host.panX = sx - (sx - host.panX) * (host.zoom / old);
    host.panY = sy - (sy - host.panY) * (host.zoom / old);
    e.preventDefault();
  }, { passive: false });

  /* ── Touch support — 1 finger: draw / 2 finger: pan + pinch-zoom + rotate / 2-finger tap: undo / 3-finger tap: redo ── */
  const touch = {
    prevTouches: null,   /* TouchList snapshot from last event */
    drawing: false,
    pending: null,       /* Pending touch: { sx, sy, x, y } */
    timer: null,
    longPressTimer: null,
    longPressTriggered: false,
    tapGesture: null     /* Multi-finger tap: { time, maxFingers, moved, startPositions } */
  };

  function commitPendingTouch() {
    if (touch.pending && !touch.drawing) {
      const p = touch.pending;
      touch.drawing = true;
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
  }

  const _scratchTouch = { sx: 0, sy: 0, x: 0, y: 0 };
  function touchDocPos(t) {
    const r = canvasEl.getBoundingClientRect();
    const sx = t.clientX - r.left, sy = t.clientY - r.top;
    const doc = screenToDoc(sx, sy);
    _scratchTouch.sx = sx;
    _scratchTouch.sy = sy;
    _scratchTouch.x = doc.x;
    _scratchTouch.y = doc.y;
    return _scratchTouch;
  }

  function touchMidpoint(a, b) {
    const r = canvasEl.getBoundingClientRect();
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
      const { sx, sy, x, y } = touchDocPos(e.touches[0]);
      host.mouseHover = { x, y, sx, sy, inside: true };
      touch.pending = { sx, sy, x, y };
      touch.longPressTriggered = false;
      if (touch.timer) clearTimeout(touch.timer);
      if (touch.longPressTimer) clearTimeout(touch.longPressTimer);

      if (host.brushParams && host.brushParams.mode === 5) {
        isTouchPicker = true;
        sampleEyedropperColor(x, y, e.touches[0].clientX, e.touches[0].clientY - 60);
        triggerHaptic(12);
        return;
      }

      const curMode = host.brushParams ? host.brushParams.mode : 0;
      if (curMode >= 6 && curMode <= 8) {
        isDraggingShape = true;
        shapeStartDoc = { x, y };
        shapeCurDoc = { x, y };
        clearPendingTouch();
        return;
      }
      if (host.actionMode === 'select') {
        if (curMode === 3) {
          host.wandSelect(x, y, host.wandTolerance, host.wandAdjacent);
          clearPendingTouch();
          return;
        }
        if (curMode === 4) {
          isLassoSelecting = true;
          lassoSelPoints = [{ x, y }];
          if (host.selectionMode === 'replace') host.clearSelection();
          clearPendingTouch();
          return;
        }
      }
      if (curMode === 9) {
        isSelecting = true;
        selStartDoc = { x, y };
        selCurDoc = { x, y };
        if (host.selectionMode === 'replace') host.clearSelection();
        clearPendingTouch();
        return;
      }
      if (curMode === 10) {
        isLassoSelecting = true;
        lassoSelPoints = [{ x, y }];
        if (host.selectionMode === 'replace') host.clearSelection();
        clearPendingTouch();
        return;
      }
      if (curMode === 11) {
        host.wandSelect(x, y, host.wandTolerance, host.wandAdjacent);
        clearPendingTouch();
        return;
      }

      // Long-press timer (300ms) for eyedropper loupe (optional)
      if (host.enableTouchEyedropper !== false) {
        touch.longPressTimer = setTimeout(() => {
          touch.longPressTriggered = true;
          isTouchPicker = true;
          clearPendingTouch();
          sampleEyedropperColor(x, y, e.touches[0].clientX, e.touches[0].clientY - 60);
          triggerHaptic(15);
        }, 300);
      }

      touch.timer = setTimeout(() => {
        if (!touch.longPressTriggered && !isTouchPicker) {
          commitPendingTouch();
        }
      }, 50);
    } else {
      /* 2+ fingers landed: cancel pending dab and end any drawing stroke */
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
      const { sx, sy, x, y } = touchDocPos(e.touches[0]);
      host.mouseHover = { x, y, sx, sy, inside: true };

      // Estimate finger dynamic pressure based on velocity & contact radius
      if (lastTouchPoint) {
        const now = performance.now();
        const dt = Math.max(1, now - lastTouchTime);
        const speed = Math.hypot(e.touches[0].clientX - lastTouchPoint.x, e.touches[0].clientY - lastTouchPoint.y) / dt;
        const force = e.touches[0].force || ((e.touches[0].radiusX || 12) / 25);
        estimatedFingerPressure = Math.max(0.1, Math.min(1.0, 0.3 + (force * 0.4) + Math.min(0.3, speed * 0.08)));
        lastTouchPoint = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastTouchTime = now;
      }

      if (isTouchPicker) {
        sampleEyedropperColor(x, y, e.touches[0].clientX, e.touches[0].clientY - 60);
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
        if (host.brushParams && host.brushParams.mode === 4) {
          lassoPoints.push({ x, y });
        }
        const strokeCol = host.actionMode === 'select' ? 0xFF83A598 : host.currentColor;
        host.sendStroke(x, y, host.strokePrevX, host.strokePrevY,
                        1, host.strokeIsEraser, strokeCol);
        host.strokePrevX = x; host.strokePrevY = y;
        updateStatus(host, x, y);
      }

    } else if (e.touches.length >= 2) {
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

      if (e.touches.length === 2 && touch.prevTouches && touch.prevTouches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const [pa, pb] = [touch.prevTouches[0], touch.prevTouches[1]];

        const mid  = touchMidpoint(a, b);
        const pmid = touchMidpoint(pa, pb);

        const curDist  = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const prevDist = Math.hypot(pa.clientX - pb.clientX, pa.clientY - pb.clientY);

        // Rotation angle delta with deadzone & finger distance threshold
        let dTheta = 0;
        if (curDist > 40 && prevDist > 40) {
          const curAngle  = Math.atan2(b.clientY  - a.clientY,  b.clientX  - a.clientX);
          const prevAngle = Math.atan2(pb.clientY - pa.clientY, pb.clientX - pa.clientX);
          let rawDelta = curAngle - prevAngle;
          while (rawDelta > Math.PI) rawDelta -= 2 * Math.PI;
          while (rawDelta < -Math.PI) rawDelta += 2 * Math.PI;

          // Deadzone to suppress finger tremor / jitter
          if (Math.abs(rawDelta) > 0.008) {
            // Damping when zoomed in close to avoid hyper-sensitive spinning
            const damping = host.zoom > 2 ? Math.max(0.35, 1.0 / (host.zoom * 0.45)) : 0.85;
            dTheta = rawDelta * damping;
          }
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

        // Snap rotation near 0° with subtle haptic
        if (Math.abs(host.canvasRotation) < 0.03 && host.canvasRotation !== 0) {
          host.canvasRotation = 0;
          triggerHaptic(8);
        }
      }
    }

    touch.prevTouches = e.touches;
  }, { passive: false });

  canvasEl.addEventListener('touchend', e => {
    e.preventDefault();

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
      const strokeCol = host.actionMode === 'select' ? 0xFF83A598 : host.currentColor;
      host.sendStroke(host.strokePrevX, host.strokePrevY,
                      host.strokePrevX, host.strokePrevY,
                      2, host.strokeIsEraser, strokeCol);
      touch.drawing = false;
      lassoPoints = [];
      if (selectScratchLayerId >= 0) {
        endBrushSelect();
      }
    } else if (e.touches.length === 0 && touch.drawing) {
      const strokeCol = host.actionMode === 'select' ? 0xFF83A598 : host.currentColor;
      host.sendStroke(host.strokePrevX, host.strokePrevY,
                      host.strokePrevX, host.strokePrevY,
                      2, host.strokeIsEraser, strokeCol);
      touch.drawing = false;
      lassoPoints = [];
      if (selectScratchLayerId >= 0) {
        endBrushSelect();
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

  /* ── UI Controls & Sync ── */
  const uiPanel = document.getElementById('ui-panel');
  if (uiPanel) {
    uiPanel.addEventListener('mousedown', e => e.stopPropagation());
    uiPanel.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
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

    const fillSelect = (sel) => {
      if (!sel) return;
      sel.innerHTML = '';

      const grpBuiltin = document.createElement('optgroup');
      grpBuiltin.label = 'Built-in Presets';
      for (const [k, p] of Object.entries(BRUSH_PRESETS)) {
        if (!p.name) continue;
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = p.name;
        if (host.activeBrush === k) opt.selected = true;
        grpBuiltin.appendChild(opt);
      }
      sel.appendChild(grpBuiltin);

      const custom = host.customBrushPresets || {};
      if (Object.keys(custom).length > 0) {
        const grpCustom = document.createElement('optgroup');
        grpCustom.label = 'Custom Presets';
        for (const [k, p] of Object.entries(custom)) {
          const opt = document.createElement('option');
          opt.value = k;
          opt.textContent = p.name || k;
          if (host.activeBrush === k) opt.selected = true;
          grpCustom.appendChild(opt);
        }
        sel.appendChild(grpCustom);
      }
    };

    fillSelect(mainSel);
    fillSelect(dockSel);

    const isCustomActive = host.customBrushPresets && host.customBrushPresets[host.activeBrush];
    if (delBtn) delBtn.style.display = isCustomActive ? 'inline-block' : 'none';
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
    log('--- Running script ---', 'cmd');
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
      if (scriptNameInp) scriptNameInp.value = 'untitled';
      if (scriptEditor) {
        scriptEditor.value = `# New script\nset mode brush\nset size 20\nset color #fabd2f\n`;
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

  function hexToRgb(hex) {
    hex = (hex || '').replace('#', '').trim();
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length !== 6) return [235, 219, 178];
    const num = parseInt(hex, 16);
    if (isNaN(num)) return [235, 219, 178];
    return [(num >> 16) & 0xFF, (num >> 8) & 0xFF, num & 0xFF];
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

  // Swatches functions & persistence
  const DEFAULT_SWATCHES = [
    '#fb4934', '#fe8019', '#fabd2f', '#b8bb26', '#8ec07c', '#83a598',
    '#d3869b', '#fbf1c7', '#ebdbb2', '#928374', '#282828', '#000000'
  ];

  function getCustomSwatches() {
    try {
      return JSON.parse(localStorage.getItem('esenho_custom_swatches') || '[]');
    } catch (_) { return []; }
  }

  function addCustomSwatch(color) {
    const swatches = getCustomSwatches();
    if (!swatches.includes(color)) {
      swatches.push(color);
      localStorage.setItem('esenho_custom_swatches', JSON.stringify(swatches));
      broadcastSwatchesChanged();
    }
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

    DEFAULT_SWATCHES.forEach(col => {
      const el = document.createElement('div');
      el.className = 'swatch-item';
      el.style.background = col;
      el.title = `${col} (built-in)`;
      el.addEventListener('click', () => {
        updateColorControlsFromHex(col);
        runCmd(`set color ${col}`);
      });
      grid.appendChild(el);
    });

    const custom = getCustomSwatches();
    custom.forEach((col, idx) => {
      const el = document.createElement('div');
      el.className = 'swatch-item';
      el.style.background = col;
      el.title = swatchDeleteMode
        ? `Click to delete ${col}`
        : `${col} (right-click, long-press, or toggle [- Del] to delete)`;

      el.addEventListener('click', () => {
        if (swatchDeleteMode) {
          removeCustomSwatch(idx);
          log(`Swatch ${col} removed [ok]`);
        } else {
          updateColorControlsFromHex(col);
          runCmd(`set color ${col}`);
        }
      });

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
    const swatches = getCustomSwatches();
    const currentHex = (host.currentColor !== undefined)
      ? rgbToHex(host.currentColor & 0xFF, (host.currentColor >> 8) & 0xFF, (host.currentColor >> 16) & 0xFF).toUpperCase()
      : '';

    const listToShow = swatches.length > 0 ? swatches : PALETTE_PRESETS.gruvbox.slice(0, 10);
    listToShow.forEach(hex => {
      const slot = document.createElement('div');
      slot.className = 'touch-swatch-slot';
      slot.style.width = '24px';
      slot.style.height = '20px';
      slot.style.flexShrink = '0';
      slot.style.background = hex;
      if (currentHex && hex.toUpperCase() === currentHex) {
        slot.style.border = '2px solid #fabd2f';
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

    const selectedPal = touchPaletteSelect ? touchPaletteSelect.value : 'custom';
    let colors = [];
    if (selectedPal === 'custom') {
      colors = getCustomSwatches();
      if (colors.length === 0) {
        touchModalSwatches.innerHTML = '<div style="grid-column: 1 / -1; color: #928374; font-size: 10px; font-style: italic; padding: 8px; text-align: center;">No custom swatches saved yet.<br>Click <strong>"+ Swatch"</strong> to add current color.</div>';
        return;
      }
    } else if (PALETTE_PRESETS[selectedPal]) {
      colors = PALETTE_PRESETS[selectedPal];
    } else {
      colors = PALETTE_PRESETS.gruvbox;
    }

    const currentHex = (host.currentColor !== undefined)
      ? rgbToHex(host.currentColor & 0xFF, (host.currentColor >> 8) & 0xFF, (host.currentColor >> 16) & 0xFF).toUpperCase()
      : '';

    colors.forEach((hex, idx) => {
      const slot = document.createElement('div');
      slot.className = 'touch-swatch-slot';
      if (studioDelMode && selectedPal === 'custom') slot.classList.add('del-mode');
      slot.style.background = hex;
      if (currentHex && hex.toUpperCase() === currentHex) {
        slot.style.borderColor = '#fabd2f';
      }
      slot.title = studioDelMode && selectedPal === 'custom' ? `Click to delete ${hex}` : hex;

      slot.addEventListener('click', () => {
        if (studioDelMode && selectedPal === 'custom') {
          removeCustomSwatch(idx);
          broadcastSwatchesChanged();
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

    renderTouchQuickSwatches();
    if (typeof updateColorControlsFromHex === 'function') {
      updateColorControlsFromHex(hex);
    }
    syncModularToolbars();
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
    touchPaletteSelect.addEventListener('change', () => {
      renderTouchModalSwatches();
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

  function openTouchColorModal() {
    if (!touchColorModal) return;
    touchColorModal.classList.add('active');

    if (host.currentColor !== undefined) {
      const c = host.currentColor;
      studioPrevHex = rgbToHex(c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF).toUpperCase();
    } else {
      studioPrevHex = '#EBDBB2';
    }

    if (touchColorPrevChip) touchColorPrevChip.style.background = studioPrevHex;
    applyColorFromStudio(studioPrevHex, true);
    switchStudioMode(studioActiveMode || 'wheel');
    renderTouchModalSwatches();
    renderTouchQuickSwatches();
    triggerHaptic(10);
  }

  function closeTouchColorModal() {
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

  // Bottom Dock Quick Category Dropdown
  const dockQuickCategory = document.getElementById('dock-quick-category');
  const dockGroups = document.querySelectorAll('#bottom-dock-quickstrip .dock-group');

  function switchDockCategory(catId) {
    if (!document.getElementById(`dock-group-${catId}`)) {
      catId = 'tool';
    }
    if (dockQuickCategory) dockQuickCategory.value = catId;
    dockGroups.forEach(g => {
      g.classList.toggle('active', g.id === `dock-group-${catId}`);
    });
    try {
      localStorage.setItem('esenho_dock_category', catId);
    } catch (_) {}
  }

  if (dockQuickCategory) {
    dockQuickCategory.addEventListener('change', () => {
      triggerHaptic(10);
      switchDockCategory(dockQuickCategory.value);
    });
  }

  const savedDockCat = localStorage.getItem('esenho_dock_category') || 'tool';
  switchDockCategory(savedDockCat);

  // Right Panel / Mobile Drawer Tabs (Paint, Layers, Settings, Console)
  const drawerTabBtns = document.querySelectorAll('#ui-drawer-tabs .drawer-tab-btn');
  const uiSections = document.querySelectorAll('#ui-scroll .ui-panel-section');

  function switchDrawerTab(tabId) {
    if (tabId === 'filters') tabId = 'settings';
    if (tabId === 'scripts') tabId = 'console';
    drawerTabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.drawertab === tabId);
    });
    uiSections.forEach(sec => {
      const match = sec.dataset.drawertab === tabId;
      sec.style.display = match ? 'flex' : 'none';
      if (match && sec.tagName.toLowerCase() === 'details') {
        sec.open = true;
      }
    });
    try {
      localStorage.setItem('esenho_drawer_active_tab', tabId);
    } catch (_) {}
  }

  drawerTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerHaptic(10);
      switchDrawerTab(btn.dataset.drawertab);
    });
  });

  const savedDrawerTab = localStorage.getItem('esenho_drawer_active_tab') || 'paint';
  switchDrawerTab(savedDrawerTab);

  // Quick Buttons in Bottom Dock Panels
  const dockStripBtns = document.querySelectorAll('#bottom-dock .dock-strip-btn:not(select)');
  dockStripBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      triggerHaptic(10);
      const tool = btn.dataset.tool;
      const actionmode = btn.dataset.actionmode;
      const dockaction = btn.dataset.dockaction;
      if (tool) {
        runCmd(`tool ${tool}`);
        const panelBtn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
        if (panelBtn) panelBtn.click();
      } else if (actionmode) {
        runCmd(`mode ${actionmode}`);
        const modeBtn = document.querySelector(`.mode-btn[data-actionmode="${actionmode}"]`);
        if (modeBtn) modeBtn.click();
      } else if (dockaction) {
        if (dockaction === 'copy') {
          runCmd('copy');
        } else if (dockaction === 'cut') {
          runCmd('cut');
        } else if (dockaction === 'deselect') {
          runCmd('deselect');
        } else if (dockaction === 'apply_xform') {
          runCmd('transform apply');
        } else if (dockaction === 'cancel_xform') {
          runCmd('transform cancel');
        }
      }
    });
  });

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
    if (host.activeTexture) lines.push(`set texture ${host.activeTexture}`);
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
    stabilization: { type: 'dial', name: 'Stabilize', min: 0, max: 100, step: 1, suffix: '%', cmd: 'brush stabilize', getter: bp => (bp.stabilization !== undefined ? bp.stabilization : (bp.smoothing || 0)), chips: [0, 15, 30, 50, 80] },
    smoothing: { type: 'dial', name: 'Stabilize', min: 0, max: 100, step: 1, suffix: '%', cmd: 'brush stabilize', getter: bp => (bp.stabilization !== undefined ? bp.stabilization : (bp.smoothing || 0)), chips: [0, 15, 30, 50, 80] },
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

    dialBtn.addEventListener('click', (e) => {
      if (!dialBtn._didScrub) {
        openArcDial(paramKey);
        triggerHaptic(15);
      }
    });

    let isScrubbing = false;
    let scrubStartX = 0;
    let scrubStartVal = curVal;

    dialBtn.addEventListener('pointerdown', (e) => {
      isScrubbing = true;
      dialBtn._didScrub = false;
      scrubStartX = e.clientX;
      const freshVal = cfg.getter ? cfg.getter(host.brushParams || {}) : cfg.min;
      scrubStartVal = freshVal !== undefined ? freshVal : cfg.min;
      dialBtn.setPointerCapture(e.pointerId);
    });

    dialBtn.addEventListener('pointermove', (e) => {
      if (!isScrubbing) return;
      const dx = e.clientX - scrubStartX;
      if (Math.abs(dx) > 3) {
        dialBtn._didScrub = true;
        const range = cfg.max - cfg.min;
        const deltaVal = (dx / 120) * range;
        const targetVal = scrubStartVal + deltaVal;
        curDialKey = paramKey;
        setDialValue(targetVal, true);
      }
    });

    const stopScrub = (e) => {
      if (isScrubbing) {
        isScrubbing = false;
        try { dialBtn.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };
    dialBtn.addEventListener('pointerup', stopScrub);
    dialBtn.addEventListener('pointercancel', stopScrub);

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
      const custom = getCustomSwatches();
      const list = custom.length > 0 ? custom : DEFAULT_SWATCHES.slice(0, 8);
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
          <option value="open_color_picker">🎨 Color Studio</option>
          <option value="open_customizer">⚙ Toolbar Customizer</option>
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
        wrap.style.display = 'inline-flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '4px';

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
          <optgroup label="Presets & Scripts">
            <option value="preset">Preset</option>
            <option value="tip">Tip</option>
            <option value="grain_tex">Grain</option>
            <option value="script">Script</option>
            <option value="save_tool">Save Tool</option>
            <option value="dab_blend">Blend</option>
            <option value="symmetry">Symmetry</option>
            <option value="dual_shape">Dual</option>
          </optgroup>
          <optgroup label="Wet Media & Dynamics">
            <option value="smudge">Smudge</option>
            <option value="wetness">Wetness</option>
            <option value="depletion">Deplete</option>
            <option value="color_pickup">Pickup</option>
            <option value="velocity">Velocity</option>
            <option value="taper_in">Taper</option>
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
            pSel.innerHTML = '<option value="" disabled selected>-- Preset --</option>';
            for (const [k, p] of Object.entries(BRUSH_PRESETS)) {
              if (!p.name) continue;
              const opt = document.createElement('option');
              opt.value = k;
              opt.textContent = p.name;
              pSel.appendChild(opt);
            }
            pSel.addEventListener('change', () => {
              if (pSel.value) {
                host.selectBrushPreset(pSel.value);
                syncUiFromHost();
                triggerHaptic(15);
              }
            });
            slot.appendChild(pSel);
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
          sel.innerHTML = '';
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
          if (host.activeBrush) sel.value = host.activeBrush;
        };
        populate();
        sel.addEventListener('change', () => {
          if (sel.value) {
            host.selectBrushPreset(sel.value);
            syncUiFromHost();
            triggerHaptic(15);
          }
        });
        const syncFn = () => {
          if (host.activeBrush && sel.value !== host.activeBrush) {
            sel.value = host.activeBrush;
          }
        };
        return { el: sel, sync: syncFn };
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
  const DEFAULT_MODULAR_TOOLBARS = [
    {
      id: 'bar_tweaks',
      name: 'Quick Tweaks',
      items: [
        { type: 'action:undo' },
        { type: 'action:redo' },
        { type: 'separator' },
        { type: 'swatch' },
        { type: 'separator' },
        { type: 'param_picker' }
      ]
    },
    {
      id: 'bar_tools',
      name: 'Tools & Modes',
      items: [
        { type: 'preset_select' },
        { type: 'tool_select' },
        { type: 'mode_select' },
        { type: 'action_select' }
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
        let itemType = item.type;
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
      <option value="action:open_color_picker">Quick Action: 🎨 Color Studio</option>
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
    if (!filterSel) return;
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
      wrap.className = 'ui-control';
      wrap.style.marginTop = '4px';

      const labelRow = document.createElement('div');
      labelRow.className = 'ui-label-row';

      const lbl = document.createElement('span');
      const unit = param.unit ? ` (${param.unit})` : '';
      lbl.textContent = (param.name || param.id || `Param ${idx + 1}`) + unit;

      const valSpan = document.createElement('span');
      valSpan.className = 'ui-val';
      const defVal = param.default !== undefined ? param.default : (param.min || 0);
      valSpan.textContent = String(defVal);

      labelRow.appendChild(lbl);
      labelRow.appendChild(valSpan);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'ui-filter-param-slider';
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
      const mod = await EsenhoModule.fromBytes(bytes, { name: pluginName });
      host.plugins.set(pluginName, { type: 'filter', module: mod, actor: mod });
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
  host.showPixelGrid = localStorage.getItem('esenho_pixel_grid') === '1';
  if (chkPixelGrid) {
    chkPixelGrid.checked = !!host.showPixelGrid;
    chkPixelGrid.addEventListener('change', () => {
      host.showPixelGrid = chkPixelGrid.checked;
      localStorage.setItem('esenho_pixel_grid', host.showPixelGrid ? '1' : '0');
    });
  }

  const chkBrushOutline = document.getElementById('ui-chk-brush-outline');
  host.showBrushOutline = localStorage.getItem('esenho_brush_outline') !== '0';
  if (chkBrushOutline) {
    chkBrushOutline.checked = !!host.showBrushOutline;
    chkBrushOutline.addEventListener('change', () => {
      host.showBrushOutline = chkBrushOutline.checked;
      localStorage.setItem('esenho_brush_outline', host.showBrushOutline ? '1' : '0');
    });
  }

  const chkTouchUndoRedo = document.getElementById('ui-chk-touch-undo-redo');
  host.enableTouchUndoRedo = localStorage.getItem('esenho_touch_undo_redo') !== '0';
  if (chkTouchUndoRedo) {
    chkTouchUndoRedo.checked = !!host.enableTouchUndoRedo;
    chkTouchUndoRedo.addEventListener('change', () => {
      host.enableTouchUndoRedo = chkTouchUndoRedo.checked;
      localStorage.setItem('esenho_touch_undo_redo', host.enableTouchUndoRedo ? '1' : '0');
    });
  }

  const chkTouchEyedropper = document.getElementById('ui-chk-touch-eyedropper');
  host.enableTouchEyedropper = localStorage.getItem('esenho_touch_eyedropper') !== '0';
  if (chkTouchEyedropper) {
    chkTouchEyedropper.checked = !!host.enableTouchEyedropper;
    chkTouchEyedropper.addEventListener('change', () => {
      host.enableTouchEyedropper = chkTouchEyedropper.checked;
      localStorage.setItem('esenho_touch_eyedropper', host.enableTouchEyedropper ? '1' : '0');
    });
  }

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
      selToolbarScale.value = String(scale);
      if (selToolbarScale.selectedIndex === -1) {
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

  // Bottom Dock quick buttons toggle
  const chkDockToolstrip = document.getElementById('ui-chk-dock-toolstrip');
  const btnToggleDockStrip = document.getElementById('btn-toggle-dock-strip');

  function applyDockToolstripVisible(show) {
    host.showDockToolstrip = !!show;
    if (bottomDock) {
      bottomDock.classList.toggle('collapsed', !show);
    }
    if (chkDockToolstrip) {
      chkDockToolstrip.checked = !!show;
    }
    if (btnToggleDockStrip) {
      btnToggleDockStrip.title = show ? 'Hide Quick Buttons' : 'Show Quick Buttons';
    }
    try {
      localStorage.setItem('esenho_show_dock_toolstrip', show ? '1' : '0');
    } catch (_) {}
    if (typeof resize === 'function') resize();
  }

  host.setDockToolstripVisible = applyDockToolstripVisible;
  host.onDockToolstripVisibleChange = applyDockToolstripVisible;

  if (chkDockToolstrip) {
    chkDockToolstrip.addEventListener('change', () => applyDockToolstripVisible(chkDockToolstrip.checked));
  }
  if (btnToggleDockStrip) {
    const handleToggleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerHaptic(10);
      applyDockToolstripVisible(bottomDock.classList.contains('collapsed'));
    };
    btnToggleDockStrip.addEventListener('click', handleToggleClick);
    btnToggleDockStrip.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    btnToggleDockStrip.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
  }

  const savedDockShow = localStorage.getItem('esenho_show_dock_toolstrip') !== '0';
  applyDockToolstripVisible(savedDockShow);

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
    if (selEl) {
      if (isAuto) {
        selEl.value = 'auto';
      } else {
        selEl.value = String(effective);
        if (selEl.selectedIndex === -1) {
          const opt = document.createElement('option');
          opt.value = String(effective);
          opt.textContent = `Custom (${Math.round(effective * 100)}%)`;
          selEl.appendChild(opt);
          selEl.value = String(effective);
        }
      }
    }

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

  // Image Import via File Picker
  const fileInput = document.getElementById('ui-file-input');
  const importBtn = document.getElementById('ui-btn-import');
  const importLayerBtn = document.getElementById('ui-btn-import-layer');
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
  }
  if (importLayerBtn && fileInput) {
    importLayerBtn.addEventListener('click', () => fileInput.click());
  }
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            const off = document.createElement('canvas');
            off.width = img.width;
            off.height = img.height;
            const ctx = off.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, img.width, img.height);

            const wasmId = host.canvasActor.exports.w_layer_create(img.width, img.height);
            if (wasmId < 0) {
              log('err: cannot add layer for image (max layers reached)');
              return;
            }

            const ptr = host.canvasActor.exports.w_layer_get_pixels(wasmId);
            if (ptr) {
              new Uint8Array(host.canvasActor.memory.buffer, ptr, img.width * img.height * 4).set(imgData.data);
            }

            if (typeof host.canvasActor.exports.w_layer_add_texture === 'function') {
              host.canvasActor.exports.w_layer_add_texture(wasmId);
            }

            const cleanName = file.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            const texName = cleanName || `image_${wasmId}`;
            if (host.textures) {
              host.textures.set(texName, {
                width: img.width,
                height: img.height,
                data: imgData.data,
                wasmId
              });
            }

            host.canvasActor.exports.force_composite();
            syncUiFromHost();
            log(`Imported image '${file.name}' as layer [${wasmId}] (${img.width}x${img.height}) [ok]`);
          } catch (err) {
            log(`err: failed importing image: ${err.message}`);
          } finally {
            fileInput.value = '';
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.wasm')) {
        await registerPluginFile(file);
      }
    }
  });

  // 6. Master Sync Function
  function syncUiFromHost() {
    if (!host.canvasActor || !host.canvasActor.exports) return;

    // 0. Action Mode
    const curActionMode = host.actionMode || (host.currentTool === 1 ? 'erase' : 'draw');
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.actionmode === curActionMode);
    });

    // A. Tools
    const mode = host.brushParams ? host.brushParams.mode : 0;
    const modeNames = ['brush', 'smudge', 'blend', 'fill', 'lasso_fill', 'picker', 'line', 'rect', 'ellipse'];
    const curToolName = modeNames[mode] || 'brush';

    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === curToolName);
    });

    // Sync Bottom Dock Mode & Tool Buttons
    document.querySelectorAll('#bottom-dock .dock-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.actionmode === curActionMode);
    });
    document.querySelectorAll('#bottom-dock .dock-tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === curToolName);
    });

    const curSelMode = host.selectionMode || 'replace';
    document.querySelectorAll('.sel-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.selmode === curSelMode);
    });

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
        const v = document.getElementById(valId);
        if (el && document.activeElement !== el && val !== undefined) {
          el.value = val;
          el._currentVal = String(val);
          if (v) v.textContent = val + suf;
        }
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

    // Populate Unified Shape Dropdown (All Layers)
    if (shapeSel) {
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
      const builtins = ['circle', 'square', 'chisel'];
      let activeShapeName = builtins[shapeId] || `layer_${shapeId}`;
      if (host.textures) {
        for (const [k, v] of host.textures.entries()) {
          if (v.wasmId === shapeId) { activeShapeName = k; break; }
        }
      }
      shapeSel.value = activeShapeName;
    }

    // Populate Unified Texture Dropdown (All Layers + None)
    if (texSel) {
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
      texSel.value = activeTex;
    }

    // Populate Unified Dual Shape Dropdown (All Layers + None)
    if (dualShapeSel) {
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
      const dualShapeId = host.brushParams ? host.brushParams.dual_shape : -1;
      const builtins = ['circle', 'square', 'chisel'];
      let activeDualName = dualShapeId === -1 ? 'none' : (builtins[dualShapeId] || `layer_${dualShapeId}`);
      if (dualShapeId !== -1 && host.textures) {
        for (const [k, v] of host.textures.entries()) {
          if (v.wasmId === dualShapeId) { activeDualName = k; break; }
        }
      }
      dualShapeSel.value = activeDualName;
    }

    // Sync active layer opacity slider (Photoshop style)
    const curActiveOp = (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.get_layer_opacity)
      ? host.canvasActor.exports.get_layer_opacity(activeDraw) : 255;
    const curActivePct = Math.round((curActiveOp / 255) * 100);
    if (activeLayerOp && document.activeElement !== activeLayerOp) {
      activeLayerOp.value = curActivePct;
      if (activeLayerOpVal) activeLayerOpVal.textContent = curActivePct + '%';
    }

    // Render Layers List (Photoshop-like top-to-bottom stacking order + Groups + Reordering + Merge Down)
    const layersList = document.getElementById('ui-layers-list');
    if (layersList) {
      layersList.innerHTML = '';
      const orderCount = (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.w_layer_get_order_count)
        ? host.canvasActor.exports.w_layer_get_order_count()
        : count;

      const layerToGroup = new Map();
      if (host.layerGroups) {
        for (const grp of host.layerGroups.values()) {
          for (const lid of grp.layerIds) {
            layerToGroup.set(lid, grp);
          }
        }
      }

      const renderedGroups = new Set();

      const createGroupHeader = (grp) => {
        const grpRow = document.createElement('div');
        grpRow.className = 'ui-layer-group-header';
        grpRow.title = `Folder: ${grp.name} (${grp.layerIds.length} layers)`;

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

        const titleSpan = document.createElement('span');
        titleSpan.className = 'group-title';
        titleSpan.textContent = grp.name;
        titleSpan.addEventListener('click', () => {
          grp.collapsed = !grp.collapsed;
          syncUiFromHost();
        });
        grpRow.appendChild(titleSpan);

        const grpVisBtn = document.createElement('button');
        grpVisBtn.type = 'button';
        grpVisBtn.className = 'layer-btn-vis' + (grp.visible ? '' : ' hidden');
        grpVisBtn.textContent = grp.visible ? '◉' : '—';
        grpVisBtn.title = grp.visible ? 'Hide folder layers' : 'Show folder layers';
        grpVisBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`group toggle ${grp.id}`);
        });
        grpRow.appendChild(grpVisBtn);

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'layer-btn-action';
        addBtn.textContent = '+';
        addBtn.title = `Add active layer [${activeDraw}] to ${grp.name}`;
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`group add ${grp.id} ${activeDraw}`);
        });
        grpRow.appendChild(addBtn);

        const delGrpBtn = document.createElement('button');
        delGrpBtn.type = 'button';
        delGrpBtn.className = 'layer-btn-action btn-del';
        delGrpBtn.textContent = '✕';
        delGrpBtn.title = `Delete folder '${grp.name}'`;
        delGrpBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Delete folder '${grp.name}'? (Layers won't be deleted)`)) {
            runCmd(`group delete ${grp.id}`);
          }
        });
        grpRow.appendChild(delGrpBtn);

        return grpRow;
      };

      const renderLayerRow = (i, pos, inGroup) => {
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
        const isShape = (i === shapeId);
        const isTex = (name === activeTex);

        const row = document.createElement('div');
        row.className = 'ui-layer-row' + (isDraw ? ' active-draw' : '') + (inGroup ? ' ui-layer-in-group' : '') + (clipping ? ' clipped-layer' : '');
        row.title = `[${i}] ${name} (${w}×${h})`;

        // Row Top: Visibility, Name/Info, Opacity, Actions
        const rowTop = document.createElement('div');
        rowTop.className = 'layer-row-top';

        // Col 1: Visibility eye
        const visCell = document.createElement('div');
        visCell.className = 'layer-cell-vis';
        const visBtn = document.createElement('button');
        visBtn.type = 'button';
        visBtn.className = 'layer-btn-vis' + (vis ? '' : ' hidden');
        visBtn.textContent = vis ? '◉' : '—';
        visBtn.title = vis ? 'Hide layer' : 'Show layer';
        visBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`toggle layer ${i}`);
        });
        visCell.appendChild(visBtn);
        rowTop.appendChild(visCell);

        // Col 2: Info
        const infoCell = document.createElement('div');
        infoCell.className = 'layer-cell-info';
        infoCell.innerHTML = `
          <span class="layer-idx">#${i}</span>
          <span class="layer-name-text" title="${name}">${name}</span>
          <span class="layer-dims-text">${w}×${h}</span>
        `;
        rowTop.appendChild(infoCell);

        // Col 3: Opacity text
        const opCell = document.createElement('div');
        opCell.className = 'layer-cell-op';
        opCell.id = `layer-op-text-${i}`;
        opCell.textContent = `${opPct}%`;
        rowTop.appendChild(opCell);

        // Col 4: Actions
        const actCell = document.createElement('div');
        actCell.className = 'layer-cell-actions';

        // Move Up
        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.className = 'layer-btn-action';
        upBtn.textContent = '▲';
        upBtn.title = 'Move layer up';
        if (pos >= orderCount - 1) upBtn.disabled = true;
        upBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`layer move up ${i}`);
        });
        actCell.appendChild(upBtn);

        // Move Down
        const downBtn = document.createElement('button');
        downBtn.type = 'button';
        downBtn.className = 'layer-btn-action';
        downBtn.textContent = '▼';
        downBtn.title = 'Move layer down';
        if (pos <= 0) downBtn.disabled = true;
        downBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`layer move down ${i}`);
        });
        actCell.appendChild(downBtn);

        // Merge Down
        const mergeBtn = document.createElement('button');
        mergeBtn.type = 'button';
        mergeBtn.className = 'layer-btn-action btn-merge';
        mergeBtn.textContent = '⤓';
        mergeBtn.title = 'Merge down into layer below';
        if (pos <= 0) mergeBtn.disabled = true;
        mergeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Merge layer #${i} down into layer below? This action cannot be undone.`)) {
            runCmd(`layer merge down ${i}`);
          }
        });
        actCell.appendChild(mergeBtn);

        // Group assign/remove
        if (inGroup) {
          const remGrpBtn = document.createElement('button');
          remGrpBtn.type = 'button';
          remGrpBtn.className = 'layer-btn-action';
          remGrpBtn.textContent = '⊟';
          remGrpBtn.title = 'Remove from folder';
          remGrpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            runCmd(`group remove ${i}`);
          });
          actCell.appendChild(remGrpBtn);
        } else if (host.layerGroups && host.layerGroups.size > 0) {
          const addGrpBtn = document.createElement('button');
          addGrpBtn.type = 'button';
          addGrpBtn.className = 'layer-btn-action';
          addGrpBtn.textContent = '◫';
          addGrpBtn.title = 'Add to folder';
          addGrpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const grpList = Array.from(host.layerGroups.values());
            if (grpList.length === 1) {
              runCmd(`group add ${grpList[0].id} ${i}`);
            } else {
              const names = grpList.map(g => g.name).join(', ');
              const target = prompt(`Add to folder (${names}):`, grpList[0].name);
              if (target) runCmd(`group add ${target} ${i}`);
            }
          });
          actCell.appendChild(addGrpBtn);
        }

        // Delete button
        if (orderCount > 1) {
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'layer-btn-action btn-del';
          delBtn.textContent = '✕';
          delBtn.title = `Delete layer [${i}] ${name}`;
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete layer [${i}] ${name}?`)) {
              runCmd(`delete layer ${i}`);
            }
          });
          actCell.appendChild(delBtn);
        }

        rowTop.appendChild(actCell);
        row.appendChild(rowTop);

        // Row Bottom: Toggles & modes
        const rowBottom = document.createElement('div');
        rowBottom.className = 'layer-row-bottom';

        const togglesCell = document.createElement('div');
        togglesCell.className = 'layer-cell-toggles';

        const activeBtn = document.createElement('button');
        activeBtn.type = 'button';
        activeBtn.className = 'layer-pill' + (isDraw ? ' active-layer-pill' : '');
        activeBtn.textContent = 'Active';
        activeBtn.title = 'Set as active drawing layer';
        activeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`layer select ${i}`);
        });
        togglesCell.appendChild(activeBtn);

        const shapeBtn = document.createElement('button');
        shapeBtn.type = 'button';
        shapeBtn.className = 'layer-pill' + (isShape ? ' active-shape' : '');
        shapeBtn.textContent = 'Tip';
        shapeBtn.title = 'Use as brush tip (Shape)';
        shapeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`set shape ${name}`);
        });
        togglesCell.appendChild(shapeBtn);

        const texBtn = document.createElement('button');
        texBtn.type = 'button';
        texBtn.className = 'layer-pill' + (isTex ? ' active-tex' : '');
        texBtn.textContent = 'Grain';
        texBtn.title = 'Use as grain texture';
        texBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`set texture ${name}`);
        });
        togglesCell.appendChild(texBtn);

        // Alpha Lock button (unicode lock symbol)
        const lockBtn = document.createElement('button');
        lockBtn.type = 'button';
        lockBtn.className = 'layer-pill' + (alphaLock ? ' active-lock' : '');
        lockBtn.textContent = '⚿';
        lockBtn.title = alphaLock ? 'Alpha Lock: ON (Click to unlock)' : 'Alpha Lock: OFF (Click to lock alpha)';
        lockBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`layer alpha_lock ${i} ${alphaLock ? 'off' : 'on'}`);
        });
        togglesCell.appendChild(lockBtn);

        // Clipping Mask button
        const clipBtn = document.createElement('button');
        clipBtn.type = 'button';
        clipBtn.className = 'layer-pill' + (clipping ? ' active-clip' : '');
        clipBtn.textContent = '⮑';
        clipBtn.title = clipping ? 'Clipping Mask: ON (Click to unclip)' : 'Clipping Mask: OFF (Click to clip to layer below)';
        clipBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`layer clipping ${i} ${clipping ? 'off' : 'on'}`);
        });
        togglesCell.appendChild(clipBtn);

        // Blend Mode dropdown
        const blendSel = document.createElement('select');
        blendSel.className = 'layer-select-blend';
        blendSel.title = 'Layer Blend Mode';
        const bOpts = [
          { val: 0, label: 'Norm' },
          { val: 1, label: 'Mult' },
          { val: 2, label: 'Scrn' },
          { val: 3, label: 'Over' },
          { val: 4, label: 'Ddg' },
          { val: 5, label: 'Add' }
        ];
        bOpts.forEach(optData => {
          const opt = document.createElement('option');
          opt.value = optData.val;
          opt.textContent = optData.label;
          if (optData.val === blendMode) opt.selected = true;
          blendSel.appendChild(opt);
        });
        blendSel.addEventListener('change', (e) => {
          e.stopPropagation();
          runCmd(`layer blend ${i} ${blendSel.value}`);
        });
        blendSel.addEventListener('click', (e) => e.stopPropagation());
        togglesCell.appendChild(blendSel);

        rowBottom.appendChild(togglesCell);
        row.appendChild(rowBottom);

        /* ── Mobile: Swipe actions on layer row ── */
        if (isMobile()) {
          // Create swipe action panel
          const swipePanel = document.createElement('div');
          swipePanel.className = 'layer-swipe-actions';

          const swipeDel = document.createElement('button');
          swipeDel.type = 'button';
          swipeDel.className = 'layer-swipe-btn swipe-del';
          swipeDel.textContent = 'Del';
          swipeDel.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete layer [${i}] ${name}?`)) {
              runCmd(`delete layer ${i}`);
            }
          });

          const swipeMerge = document.createElement('button');
          swipeMerge.type = 'button';
          swipeMerge.className = 'layer-swipe-btn swipe-merge';
          swipeMerge.textContent = 'Merge';
          if (pos <= 0) swipeMerge.style.opacity = '0.3';
          swipeMerge.addEventListener('click', (e) => {
            e.stopPropagation();
            if (pos > 0) runCmd(`layer merge down ${i}`);
          });

          const swipeDup = document.createElement('button');
          swipeDup.type = 'button';
          swipeDup.className = 'layer-swipe-btn swipe-dup';
          swipeDup.textContent = 'Dup';
          swipeDup.addEventListener('click', (e) => {
            e.stopPropagation();
            runCmd(`layer select ${i}`);
            runCmd('duplicate layer');
          });

          swipePanel.appendChild(swipeDup);
          swipePanel.appendChild(swipeMerge);
          swipePanel.appendChild(swipeDel);
          row.appendChild(swipePanel);

          // Swipe detection
          let swipeStartX = null;
          let swipeStartY = null;
          let swiping = false;

          row.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
              swipeStartX = e.touches[0].clientX;
              swipeStartY = e.touches[0].clientY;
              swiping = false;
            }
          }, { passive: true });

          row.addEventListener('touchmove', (e) => {
            if (swipeStartX === null) return;
            const dx = e.touches[0].clientX - swipeStartX;
            const dy = e.touches[0].clientY - swipeStartY;
            // Only swipe if horizontal movement dominates
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20) {
              swiping = true;
              if (dx < -40) {
                // Swipe left: reveal action buttons
                swipePanel.classList.add('revealed');
              } else if (dx > 40) {
                // Swipe right: hide action buttons or toggle visibility
                if (swipePanel.classList.contains('revealed')) {
                  swipePanel.classList.remove('revealed');
                } else {
                  runCmd(`toggle layer ${i}`);
                  swipeStartX = null; // Prevent repeated toggles
                }
              }
            }
          }, { passive: true });

          row.addEventListener('touchend', () => {
            swipeStartX = null;
            swipeStartY = null;
          }, { passive: true });

          // Tap outside swipe panel closes it
          row.addEventListener('click', () => {
            if (!swiping && swipePanel.classList.contains('revealed')) {
              swipePanel.classList.remove('revealed');
            }
          });
        }

        return row;
      };

      // 1. Render all main document layers (not in folders) in top-to-bottom order (highest pos down to 0)
      for (let pos = orderCount - 1; pos >= 0; pos--) {
        const i = (host.canvasActor.exports.w_layer_get_order)
          ? host.canvasActor.exports.w_layer_get_order(pos)
          : pos;
        if (i < 0 || i >= count) continue;

        const grp = layerToGroup.get(i);
        if (!grp) {
          layersList.appendChild(renderLayerRow(i, pos, false));
        }
      }

      // 2. Render layer folders below main layers (collapsed by default)
      if (host.layerGroups) {
        for (const grp of host.layerGroups.values()) {
          layersList.appendChild(createGroupHeader(grp));
          if (!grp.collapsed) {
            for (let pos = orderCount - 1; pos >= 0; pos--) {
              const i = (host.canvasActor.exports.w_layer_get_order)
                ? host.canvasActor.exports.w_layer_get_order(pos)
                : pos;
              if (grp.layerIds.includes(i)) {
                layersList.appendChild(renderLayerRow(i, pos, true));
              }
            }
          }
        }
      }
    }

    if (chkPixelGrid) {
      chkPixelGrid.checked = !!host.showPixelGrid;
    }
    if (chkBrushOutline) {
      chkBrushOutline.checked = !!host.showBrushOutline;
    }
    if (chkTouchUndoRedo) {
      chkTouchUndoRedo.checked = !!host.enableTouchUndoRedo;
    }
    if (chkTouchEyedropper) {
      chkTouchEyedropper.checked = !!host.enableTouchEyedropper;
    }

    updateDockTabs();
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
  syncUiFromHost();
  log('Ready — left=draw  right=erase  mid/2-finger=pan  scroll/pinch=zoom  2-finger-twist=rotate');
  statusEl.textContent = 'ready';
}

/* ── Helpers ── */
function log(msg, cls = '') {
  if (!termEl) return;
  const el = document.createElement('div');
  el.className = 'wterm-line';
  let effCls = cls;
  const str = String(msg).replace(/\x1b\[[^m]*m/g, '');
  if (!effCls) {
    if (str.startsWith('> ')) effCls = 'cmd';
    else if (str.includes('[ok]') || str.startsWith('ok:') || str.startsWith('Ready') || str.startsWith('SUCCESS') || str.includes('loaded successfully')) effCls = 'ok';
    else if (str.startsWith('err') || str.startsWith('BOOT ERROR') || str.includes('failed') || str.includes('error')) effCls = 'err';
    else if (str.startsWith('warn')) effCls = 'warn';
    else if (str.startsWith('info:') || str.startsWith('---')) effCls = 'info';
  }
  if (effCls) el.classList.add(effCls);
  el.textContent = str;
  termEl.appendChild(el);
  termEl.scrollTop = termEl.scrollHeight;
}

function updateStatus(host, docX, docY) {
  const cw = host.canvasActor?.exports?.get_canvas_width?.() ?? 0;
  const ch = host.canvasActor?.exports?.get_canvas_height?.() ?? 0;
  const deg = ((host.canvasRotation * 180 / Math.PI) % 360).toFixed(1);
  statusEl.textContent =
    `${cw}x${ch}  ${Math.round(docX)},${Math.round(docY)}  ` +
    `zoom ${(host.zoom * 100).toFixed(0)}%  rot ${deg}°`;
}

/* ── Color math helpers ── */
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
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

/* ── Fallback DOM auto-injection ── */
function ensureUiPanel() {
  if (document.getElementById('ui-panel')) return;

  if (!document.getElementById('esenho-ui-styles')) {
    const style = document.createElement('style');
    style.id = 'esenho-ui-styles';
    style.textContent = `
    #ui-panel {
      position: relative;
      width: 290px;
      display: flex;
      flex-direction: column;
      border-right: 1px solid #3c3836;
      background: #1d2021;
      flex-shrink: 0;
      z-index: 15;
    }
    #ui-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scrollbar-width: thin;
      scrollbar-color: #504945 #1d2021;
    }
    details.ui-group {
      border: 1px solid #3c3836;
      background: #232524;
      padding: 0;
    }
    details.ui-group summary {
      background: #282828;
      color: #ebdbb2;
      padding: 5px 8px;
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 0.6px;
      cursor: pointer;
      user-select: none;
      list-style: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #3c3836;
    }
    details.ui-group summary::-webkit-details-marker { display: none; }
    details.ui-group summary::after { content: '▾'; color: #a89984; font-size: 10px; }
    details.ui-group:not([open]) summary::after { content: '▸'; }
    details.ui-group:not([open]) summary { border-bottom: none; }
    .ui-group-content {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .ui-row-between { display: flex; justify-content: space-between; align-items: center; }
    .ui-row-gap { display: flex; align-items: center; gap: 6px; }
    .ui-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
    .ui-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
    .ui-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .ui-btn {
      background: #282828;
      color: #ebdbb2;
      border: 1px solid #3c3836;
      padding: 4px 6px;
      font: inherit;
      font-size: 11px;
      cursor: pointer;
      text-align: center;
      user-select: none;
      transition: background 0.1s, border-color 0.1s;
    }
    .ui-btn:hover { background: #3c3836; color: #fabd2f; border-color: #504945; }
    .ui-btn.active { background: #3c3836; color: #fabd2f; border-color: #fabd2f; font-weight: bold; }
    .ui-mini-btn {
      background: #282828;
      color: #ebdbb2;
      border: 1px solid #3c3836;
      font: inherit;
      font-size: 10px;
      padding: 2px 6px;
      cursor: pointer;
    }
    .ui-mini-btn:hover { background: #3c3836; color: #fabd2f; border-color: #fabd2f; }
    .ui-mini-btn.active { background: #fabd2f; color: #1d2021; font-weight: bold; }
    .ui-control { display: flex; flex-direction: column; gap: 2px; font-size: 10px; }
    .ui-label-row { display: flex; justify-content: space-between; color: #a89984; }
    .ui-val { color: #fabd2f; font-weight: bold; }
    input[type=range] { accent-color: #fe8019; cursor: pointer; height: 4px; background: #282828; width: 100%; }
    input[type=range]::-webkit-slider-thumb { transform: scale(0.65); cursor: pointer; }
    input[type=range]::-moz-range-thumb { transform: scale(0.65); cursor: pointer; }
    .ui-select { background: #282828; color: #ebdbb2; border: 1px solid #3c3836; padding: 3px 5px; font: inherit; font-size: 11px; outline: none; width: 100%; }
    .color-preview-box { width: 32px; height: 28px; border: 1px solid #504945; flex-shrink: 0; position: relative; }
    #ui-color-picker { opacity: 0; width: 100%; height: 100%; position: absolute; top: 0; left: 0; cursor: pointer; }
    #ui-color-hex { flex: 1; background: #282828; border: 1px solid #3c3836; color: #ebdbb2; font: inherit; font-size: 11px; padding: 4px 6px; outline: none; }
    .color-mode-tabs { display: flex; border: 1px solid #3c3836; background: #1d2021; }
    .color-mode-tab { flex: 1; background: transparent; border: none; color: #a89984; padding: 3px; font: inherit; font-size: 10px; cursor: pointer; text-align: center; }
    .color-mode-tab.active { background: #3c3836; color: #fabd2f; font-weight: bold; }
    .color-sliders-wrap { display: flex; flex-direction: column; gap: 4px; }
    .ui-swatches-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; max-height: 120px; overflow-y: auto; }
    .swatch-item { height: 20px; border: 1px solid #3c3836; cursor: pointer; position: relative; }
    .swatch-item:hover { border-color: #fbf1c7; transform: scale(1.05); z-index: 2; }
    .swatch-del { display: none; position: absolute; top: -3px; right: -3px; background: #fb4934; color: #fff; font-size: 8px; width: 12px; height: 12px; line-height: 11px; text-align: center; border-radius: 50%; cursor: pointer; }
    .swatch-item:hover .swatch-del { display: block; }
    #ui-layers-list { display: flex; flex-direction: column; gap: 3px; max-height: 290px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #504945 #1d2021; padding-right: 2px; }
    .ui-layer-card { background: #242625; border: 1px solid #3c3836; border-left: 3px solid transparent; border-radius: 3px; padding: 4px 6px; display: flex; flex-direction: column; gap: 3px; font-size: 11px; cursor: pointer; user-select: none; }
    .ui-layer-card:hover { background: #282a28; border-color: #504945; }
    .ui-layer-card.active-draw { background: #2a2d28; border-color: #665c54; border-left-color: #b8bb26; box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
    .layer-row-top { display: flex; align-items: center; gap: 5px; min-height: 22px; }
    .layer-btn-vis { background: transparent; border: 1px solid #3c3836; border-radius: 3px; color: #ebdbb2; width: 22px; height: 20px; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; padding: 0; }
    .layer-btn-vis:hover { background: #3c3836; color: #fabd2f; border-color: #504945; }
    .layer-btn-vis.hidden { opacity: 0.35; color: #928374; }
    .layer-title-wrap { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; overflow: hidden; white-space: nowrap; }
    .layer-title-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: bold; font-size: 11px; color: #ebdbb2; }
    .ui-layer-card.active-draw .layer-title-text { color: #fabd2f; }
    .layer-dims { font-size: 9px; color: #928374; flex-shrink: 0; }
    .badge-tag { font-size: 8px; padding: 1px 3px; border-radius: 2px; font-weight: bold; text-transform: uppercase; flex-shrink: 0; }
    .badge-draw  { background: #b8bb26; color: #1d2021; }
    .badge-shape { background: #fe8019; color: #1d2021; }
    .badge-tex   { background: #83a598; color: #1d2021; }
    .layer-btn-group { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
    .layer-btn-action { background: #282828; color: #a89984; border: 1px solid #3c3836; border-radius: 2px; font: inherit; font-size: 9px; padding: 2px 5px; height: 20px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
    .layer-btn-action:hover { color: #ebdbb2; background: #3c3836; border-color: #504945; }
    .layer-btn-action.active-shape { background: #af3a03; color: #fbf1c7; border-color: #fe8019; font-weight: bold; }
    .layer-btn-action.active-tex { background: #076678; color: #fbf1c7; border-color: #83a598; font-weight: bold; }
    .layer-btn-icon { background: #282828; color: #a89984; border: 1px solid #3c3836; border-radius: 2px; font: inherit; font-size: 10px; width: 20px; height: 20px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
    .layer-btn-icon:hover { color: #ebdbb2; background: #3c3836; border-color: #665c54; }
    .layer-btn-icon.layer-btn-del:hover { color: #fb4934; border-color: #cc241d; background: #321c1c; }
    .layer-row-bottom { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #928374; padding: 0 1px; }
    .layer-op-slider { flex: 1; height: 4px; accent-color: #fe8019; cursor: pointer; }
    .layer-op-val { width: 32px; text-align: right; font-size: 9px; color: #fabd2f; font-weight: bold; flex-shrink: 0; }
    .ui-layer-row.ui-layer-in-group { padding-left: 14px; background: #1f2120; border-left: 3px solid #83a598; }
    .ui-layer-group-header { display: flex; align-items: center; gap: 4px; height: 24px; padding: 0 6px; background: #282828; border-left: 3px solid #b8bb26; border-bottom: 1px solid #3c3836; font-size: 11px; color: #b8bb26; font-weight: 600; user-select: none; }
    .ui-layer-group-header .group-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
    .group-btn-collapse { background: transparent; border: none; color: #b8bb26; font-size: 10px; width: 16px; height: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
    .layer-cell-actions { display: flex; align-items: center; gap: 1px; flex-shrink: 0; }
    .layer-btn-action.btn-merge { color: #83a598; }
    .layer-btn-action.btn-del { color: #928374; }
    .layer-btn-action.btn-del:hover { color: #fb4934; background: #3c2020; }
    .ui-swatches-grid.delete-mode .swatch-del { display: block; }
    .ui-mini-btn.del-active { background: #fb4934 !important; color: #fff !important; border-color: #cc241d !important; font-weight: bold; }
    #toggle-ui { position: absolute; top: 14px; right: 1px; transform: translateX(100%); z-index: 20; background: #282828; color: #ebdbb2; border: 1px solid #504945; border-left: 1px solid #282828; border-radius: 0; padding: 5px 9px; font: inherit; font-size: 11px; cursor: pointer; user-select: none; white-space: nowrap; box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.4); }
    #toggle-ui:hover { background: #3c3836; color: #fabd2f; border-color: #7c6f64; }
    #ui-panel.hidden { width: 0 !important; border-right: none !important; }
    #ui-panel.hidden > *:not(#toggle-ui) { display: none !important; }
    /* ── Mobile Unified Bottom Dock & Drawer Tabs ── */
    #bottom-dock { display: none; }
    @media (max-width: 768px) {
      #layout { flex-direction: column; position: relative; height: 100vh; overflow: hidden; }
      #cvswrap { order: 1; flex: 1; width: 100%; min-height: 0; position: relative; overflow: hidden; }
      #toggle-ui, #toggle-panel { display: none !important; }
      #bottom-dock { display: flex; flex-direction: column; order: 2; width: 100%; background: #1d2021; border-top: 1px solid #3c3836; z-index: 25; flex-shrink: 0; touch-action: none; user-select: none; -webkit-user-select: none; }
      #bottom-dock-handle { width: 100%; height: 28px; cursor: row-resize; display: flex; align-items: center; justify-content: center; touch-action: none; user-select: none; -webkit-user-select: none; padding: 4px 0; }
      #bottom-dock-handle::after { content: ''; width: 44px; height: 4px; background: #504945; border-radius: 2px; pointer-events: none; }
      #bottom-dock-tabs { display: flex; align-items: stretch; height: 36px; padding: 0 6px 6px 6px; gap: 6px; }
      .dock-tab-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; font: inherit; font-size: 11px; font-weight: bold; background: #282828; color: #a89984; border: 1px solid #3c3836; border-radius: 0; cursor: pointer; user-select: none; touch-action: manipulation; }
      .dock-tab-btn:hover { background: #32302f; color: #ebdbb2; }
      .dock-tab-btn.active { background: #3c3836; color: #fabd2f; border-color: #fabd2f; }
      .dock-close-btn { flex: 0 0 36px; color: #928374; display: none; font-size: 13px; border-radius: 0; }
      .dock-close-btn.visible { display: flex; }
      #ui-panel, #panel { order: 3; width: 100% !important; border: none !important; background: #1d2021; flex-shrink: 0; }
      #ui-panel { height: var(--mobile-drawer-height, 42vh); max-height: 85vh; min-height: 0; display: flex; flex-direction: column; border-top: 1px solid #3c3836 !important; }
      #panel { height: var(--mobile-drawer-height, 42vh); max-height: 85vh; min-height: 0; display: flex; flex-direction: column; border-top: 1px solid #3c3836 !important; }
      #ui-panel.hidden, #panel.hidden { height: 0 !important; min-height: 0 !important; max-height: 0 !important; display: none !important; border: none !important; }
      #ui-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 8px 10px 24px; }
      #wterm { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
    }
    `;
    document.head.appendChild(style);
  }

  const panel = document.createElement('div');
  panel.id = 'ui-panel';
  panel.innerHTML = `
    <button id="toggle-ui" type="button" title="Toggle Tools (Alt+B or Ctrl+B)">&#x25C0; tools [hide]</button>
    <div id="ui-scroll">
      <details class="ui-group" open>
        <summary>TOOLS</summary>
        <div class="ui-group-content">
          <div class="ui-grid-2" style="margin-bottom: 5px;">
            <button id="ui-btn-undo" class="ui-btn" title="Undo (Ctrl+Z or 2-finger tap)">&#x21A9; Undo</button>
            <button id="ui-btn-redo" class="ui-btn" title="Redo (Ctrl+Y or 3-finger tap)">&#x21AA; Redo</button>
          </div>
          <div class="ui-control" style="margin-bottom: 6px;">
            <label class="ui-label">MODE</label>
            <div class="ui-grid-4">
              <button class="ui-btn mode-btn active" data-actionmode="draw" title="Draw Mode">Draw</button>
              <button class="ui-btn mode-btn" data-actionmode="erase" title="Erase Mode">Erase</button>
              <button class="ui-btn mode-btn" data-actionmode="smudge" title="Smudge Mode">Smudge</button>
              <button class="ui-btn mode-btn" data-actionmode="select" title="Select Mode">Select</button>
            </div>
          </div>
          <div class="ui-grid-4">
            <button class="ui-btn tool-btn active" data-tool="brush" title="Brush">Brush</button>
            <button class="ui-btn tool-btn" data-tool="blend" title="Blend / Wet Mix">Blend</button>
            <button class="ui-btn tool-btn" data-tool="fill" title="Flood Fill">Fill</button>
            <button class="ui-btn tool-btn" data-tool="lasso_fill" title="Lasso">Lasso</button>
            <button class="ui-btn tool-btn" data-tool="picker" title="Eyedropper / Color Picker">Picker</button>
            <button class="ui-btn tool-btn" data-tool="line" title="Line Guide">Line</button>
            <button class="ui-btn tool-btn" data-tool="rect" title="Rectangle Guide (Filled)">Rect</button>
            <button class="ui-btn tool-btn" data-tool="ellipse" title="Ellipse Guide (Filled)">Ellipse</button>
          </div>
          <div class="ui-grid-2" style="margin-top: 6px;">
            <button id="ui-btn-copy" class="ui-btn" title="Copy selection → new floating layer">Copy</button>
            <button id="ui-btn-cut" class="ui-btn" title="Cut selection → new floating layer">Cut</button>
            <button id="ui-btn-paste" class="ui-btn" title="Paste clipboard to active layer">Paste</button>
            <button id="ui-btn-deselect" class="ui-btn" title="Clear selection">Deselect</button>
            <button id="ui-btn-transform-apply" class="ui-btn" title="Apply floating transform to layer">Apply Xform</button>
            <button id="ui-btn-transform-cancel" class="ui-btn" title="Cancel floating transform">Cancel Xform</button>
          </div>
          <div class="ui-control" style="margin-top: 6px;">
            <label class="ui-label">Selection Mode</label>
            <div class="ui-grid-4">
              <button class="ui-btn sel-mode-btn active" data-selmode="replace" title="Replace / New selection">New</button>
              <button class="ui-btn sel-mode-btn" data-selmode="add" title="Add to selection (+)">Add</button>
              <button class="ui-btn sel-mode-btn" data-selmode="sub" title="Subtract from selection (-)">Sub</button>
              <button class="ui-btn sel-mode-btn" data-selmode="intersect" title="Intersect selection (∩)">Intersect</button>
            </div>
          </div>
          <div class="ui-control" style="margin-top: 4px;">
            <label class="ui-label">Wand Tolerance <span id="ui-wand-tol-val">30</span></label>
            <input type="range" id="ui-slider-wand-tol" class="ui-slider" min="0" max="255" step="1" value="30">
          </div>
          <div class="ui-control" style="margin-top: 4px;">
            <label class="ui-label" style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; text-transform: none;">
              <input type="checkbox" id="ui-chk-adjacent" checked style="accent-color: #fabd2f; cursor: pointer; width: 14px; height: 14px; margin: 0;">
              <span>Adjacent Pixels</span>
            </label>
          </div>
        </div>
      </details>
      <details class="ui-group" open>
        <summary>BRUSH PARAMETERS</summary>
        <div class="ui-group-content">
          <div class="ui-control">
            <div class="ui-label-row"><span>Size</span><span id="ui-val-size" class="ui-val">16</span></div>
            <input type="range" id="ui-slider-size" min="1" max="100" value="16">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Opacity</span><span id="ui-val-opacity" class="ui-val">100%</span></div>
            <input type="range" id="ui-slider-opacity" min="1" max="100" value="100">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Hardness</span><span id="ui-val-hardness" class="ui-val">100%</span></div>
            <input type="range" id="ui-slider-hardness" min="0" max="100" value="100">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Flow</span><span id="ui-val-flow" class="ui-val">100%</span></div>
            <input type="range" id="ui-slider-flow" min="1" max="100" value="100">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Spacing</span><span id="ui-val-spacing" class="ui-val">5%</span></div>
            <input type="range" id="ui-slider-spacing" min="1" max="200" value="5">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Stabilization</span><span id="ui-val-smoothing" class="ui-val">0%</span></div>
            <input type="range" id="ui-slider-smoothing" min="0" max="100" value="0">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Bézier Midpoint</span><span id="ui-val-midpoint" class="ui-val">50%</span></div>
            <input type="range" id="ui-slider-midpoint" min="0" max="100" value="50">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Angle</span><span id="ui-val-angle" class="ui-val">0°</span></div>
            <input type="range" id="ui-slider-angle" min="0" max="359" value="0">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Roundness</span><span id="ui-val-roundness" class="ui-val">100%</span></div>
            <input type="range" id="ui-slider-roundness" min="1" max="100" value="100">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Scatter</span><span id="ui-val-scatter" class="ui-val">0%</span></div>
            <input type="range" id="ui-slider-scatter" min="0" max="200" value="0">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Grain / Noise</span><span id="ui-val-grain" class="ui-val">0%</span></div>
            <input type="range" id="ui-slider-grain" min="0" max="100" value="0">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Smudge Pickup</span><span id="ui-val-smudge" class="ui-val">0%</span></div>
            <input type="range" id="ui-slider-smudge" min="0" max="100" value="0">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Wetness Mix</span><span id="ui-val-wetness" class="ui-val">0%</span></div>
            <input type="range" id="ui-slider-wetness" min="0" max="100" value="0">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Paint Depletion</span><span id="ui-val-depletion" class="ui-val">0%</span></div>
            <input type="range" id="ui-slider-depletion" min="0" max="100" value="0">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Continuous Color Pickup</span><span id="ui-val-color-pickup" class="ui-val">0%</span></div>
            <input type="range" id="ui-slider-color-pickup" min="0" max="100" value="0">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Fill Tolerance</span><span id="ui-val-tolerance" class="ui-val">32</span></div>
            <input type="range" id="ui-slider-tolerance" min="0" max="255" value="32">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Velocity Dynamics</span><span id="ui-val-velocity" class="ui-val">0%</span></div>
            <input type="range" id="ui-slider-velocity" min="0" max="100" value="0">
          </div>
          <div class="ui-control" style="margin-top: 4px;">
            <label class="ui-chk-label" style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="ui-chk-auto-rotate"> Auto-Rotate (Follow Trajectory)
            </label>
          </div>
          <div class="ui-control" style="margin-top: 4px;">
            <label class="ui-chk-label" style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="ui-chk-pressure-size" checked> Stylus Pressure Size
            </label>
          </div>
          <div class="ui-control" style="margin-top: 4px;">
            <label class="ui-chk-label" style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="ui-chk-pressure-flow" checked> Stylus Pressure Flow
            </label>
          </div>
          <div class="ui-control" style="margin-top: 4px;">
            <label class="ui-chk-label" style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="ui-chk-tilt-angle" checked> Stylus Tilt Dynamics
            </label>
          </div>
          <div class="ui-control" style="margin-top: 4px;">
            <label class="ui-chk-label" style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="ui-chk-subpixel"> Subpixel Rendering (Anti-Aliased Edge)
            </label>
          </div>
          <div class="ui-row-gap" style="margin-top: 6px;">
            <button id="ui-btn-export-brush" class="ui-btn" style="flex: 1;" title="Copy current brush preset as REPL script to clipboard">Copy Brush Script</button>
          </div>
        </div>
      </details>
      <details class="ui-group" open>
        <summary>SHAPE &amp; GRAIN</summary>
        <div class="ui-group-content">
          <div class="ui-control">
            <div class="ui-label-row"><span>Tip Shape (Built-in &amp; Layers)</span></div>
            <select id="ui-select-shape" class="ui-select"></select>
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Grain Texture (Textures &amp; Layers)</span></div>
            <select id="ui-select-texture" class="ui-select"></select>
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Texture Scale</span><span id="ui-val-tex-scale" class="ui-val">100%</span></div>
            <input type="range" id="ui-slider-tex-scale" min="10" max="400" value="100">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Texture Rotate</span><span id="ui-val-tex-rotate" class="ui-val">0°</span></div>
            <input type="range" id="ui-slider-tex-rotate" min="0" max="359" value="0">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Grain Contrast</span><span id="ui-val-tex-contrast" class="ui-val">100%</span></div>
            <input type="range" id="ui-slider-tex-contrast" min="0" max="200" value="100">
          </div>
          <div class="ui-control" style="border-top: 1px solid #3c3836; padding-top: 6px; margin-top: 6px;">
            <div class="ui-label-row"><span>Dual Brush Shape</span></div>
            <select id="ui-select-dual-shape" class="ui-select"></select>
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Dual Brush Size</span><span id="ui-val-dual-size" class="ui-val">100%</span></div>
            <input type="range" id="ui-slider-dual-size" min="10" max="300" value="100">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Dual Brush Spacing</span><span id="ui-val-dual-spacing" class="ui-val">10%</span></div>
            <input type="range" id="ui-slider-dual-spacing" min="1" max="200" value="10">
          </div>
        </div>
      </details>
      <details class="ui-group" open>
        <summary>COLOR (RGB / HSL)</summary>
        <div class="ui-group-content">
          <div class="ui-row-gap">
            <div class="color-preview-box" id="ui-color-preview">
              <input type="color" id="ui-color-picker" value="#ebdbb2" title="Click for native color picker">
            </div>
            <input type="text" id="ui-color-hex" value="#ebdbb2" spellcheck="false" maxlength="7">
            <button id="ui-btn-add-swatch" class="ui-mini-btn" title="Add current color to swatches">+ Swatch</button>
            <button id="ui-btn-del-swatch" class="ui-mini-btn" title="Toggle delete swatch mode">- Del</button>
          </div>
          <div class="color-mode-tabs">
            <button type="button" class="color-mode-tab active" id="tab-rgb">RGB</button>
            <button type="button" class="color-mode-tab" id="tab-hsl">HSL</button>
          </div>
          <div id="panel-rgb" class="color-sliders-wrap">
            <div class="ui-control">
              <div class="ui-label-row"><span>R (Red)</span><span id="ui-val-rgb-r" class="ui-val">235</span></div>
              <input type="range" id="ui-slider-r" min="0" max="255" value="235">
            </div>
            <div class="ui-control">
              <div class="ui-label-row"><span>G (Green)</span><span id="ui-val-rgb-g" class="ui-val">219</span></div>
              <input type="range" id="ui-slider-g" min="0" max="255" value="219">
            </div>
            <div class="ui-control">
              <div class="ui-label-row"><span>B (Blue)</span><span id="ui-val-rgb-b" class="ui-val">178</span></div>
              <input type="range" id="ui-slider-b" min="0" max="255" value="178">
            </div>
          </div>
          <div id="panel-hsl" class="color-sliders-wrap" style="display:none;">
            <div class="ui-control">
              <div class="ui-label-row"><span>Hue</span><span id="ui-val-hsl-h" class="ui-val">43°</span></div>
              <input type="range" id="ui-slider-h" min="0" max="360" value="43">
            </div>
            <div class="ui-control">
              <div class="ui-label-row"><span>Saturation</span><span id="ui-val-hsl-s" class="ui-val">60%</span></div>
              <input type="range" id="ui-slider-s" min="0" max="100" value="60">
            </div>
            <div class="ui-control">
              <div class="ui-label-row"><span>Lightness</span><span id="ui-val-hsl-l" class="ui-val">81%</span></div>
              <input type="range" id="ui-slider-l" min="0" max="100" value="81">
            </div>
          </div>
          <div class="ui-control" style="margin-top: 4px;">
            <div class="ui-label-row"><span>Swatches</span></div>
            <div id="ui-swatches-grid" class="ui-swatches-grid"></div>
          </div>
        </div>
      </details>
      <details class="ui-group" open>
        <summary>LAYERS (CANVAS &amp; SHAPES)</summary>
        <div class="ui-group-content">
          <div class="ui-row-between">
            <span style="font-size:10px; color:#a89984;">Manage:</span>
            <div class="ui-row-gap">
              <button id="ui-btn-import-layer" class="ui-mini-btn" title="Import image as new layer">+ Import</button>
              <button id="ui-btn-add-layer" class="ui-mini-btn" title="Add new layer">+ New</button>
              <button id="ui-btn-new-group" class="ui-mini-btn" title="Create new folder/group">+ Folder</button>
              <button id="ui-btn-duplicate-layer" class="ui-mini-btn" title="Duplicate active layer">Dup</button>
              <button id="ui-btn-clear-layer" class="ui-mini-btn" title="Clear active layer">Clear</button>
            </div>
          </div>
          <div id="ui-layers-list"></div>
        </div>
      </details>
      <details class="ui-group">
        <summary>ACTIVE LAYER / CANVAS SIZE</summary>
        <div class="ui-group-content">
          <div class="ui-label-row">
            <span>Active Layer &amp; Canvas:</span>
            <span id="ui-val-canvas-size" class="ui-val">640 x 480</span>
          </div>
          <div class="ui-row-gap" style="margin-top: 4px;">
            <input type="number" id="ui-canvas-w" class="ui-input-num" value="640" min="1" max="16384" style="width: 62px;" title="Width (px)">
            <span style="color: #a89984;">×</span>
            <input type="number" id="ui-canvas-h" class="ui-input-num" value="480" min="1" max="16384" style="width: 62px;" title="Height (px)">
            <label style="font-size: 10px; color: #ebdbb2; display: flex; align-items: center; gap: 3px; cursor: pointer;" title="Resample / Scale contents instead of cropping">
              <input type="checkbox" id="ui-layer-resample" checked> Scale
            </label>
            <button id="ui-btn-resize-canvas" class="ui-btn" style="flex: 1;">Resize</button>
          </div>
          <div class="ui-grid-3" style="margin-top: 6px;">
            <button class="ui-mini-btn btn-res-preset" data-w="640" data-h="480">640×480</button>
            <button class="ui-mini-btn btn-res-preset" data-w="800" data-h="600">800×600</button>
            <button class="ui-mini-btn btn-res-preset" data-w="1280" data-h="720">720p</button>
            <button class="ui-mini-btn btn-res-preset" data-w="1920" data-h="1080">1080p</button>
            <button class="ui-mini-btn btn-res-preset" data-w="1080" data-h="1080">1:1 Square</button>
            <button class="ui-mini-btn btn-res-preset" data-w="2048" data-h="2048">2K High</button>
          </div>
        </div>
      </details>
      <details class="ui-group" open>
        <summary>PROJECT &amp; STORAGE</summary>
        <div class="ui-group-content">
          <div class="ui-control">
            <div class="ui-label-row">
              <span>Project Name</span>
              <span id="ui-autosave-badge" class="ui-val" style="color: #b8bb26;">Saved</span>
            </div>
            <input type="text" id="ui-project-name" class="ui-input" value="Untitled Project" style="width: 100%; background: #1d2021; border: 1px solid #3c3836; color: #ebdbb2; padding: 4px 6px; font-size: 11px;">
          </div>
          <div class="ui-grid-2" style="margin-top: 4px;">
            <button id="ui-btn-save-project" class="ui-btn" title="Download project savefile (.esen)">Save .esen</button>
            <button id="ui-btn-open-project" class="ui-btn" title="Open .esen savefile from disk">Open .esen</button>
            <button id="ui-btn-export" class="ui-btn" title="Export composite drawing as PNG">Export PNG</button>
            <a href="index.html" id="ui-btn-home" class="ui-btn" style="text-align: center; text-decoration: none; display: flex; align-items: center; justify-content: center;" title="Go to Start Menu &amp; Recent Projects">Launcher</a>
          </div>
          <input type="file" id="ui-project-file-input" accept=".esen,application/json" style="display: none;" />
          <input type="file" id="ui-plugin-input" accept=".wasm" style="display: none;" />
          <input type="file" id="ui-file-input" accept="image/*" style="display: none;" />
        </div>
      </details>
      <details class="ui-group">
        <summary>FILTERS &amp; PLUGINS</summary>
        <div class="ui-group-content">
          <div class="ui-control">
            <div class="ui-label-row"><span>Filter Plugin</span></div>
            <div class="ui-row-gap">
              <select id="ui-select-filter" class="ui-select" style="flex:1;">
              </select>
              <button id="ui-btn-apply-filter" class="ui-btn" style="flex-shrink:0;">Apply</button>
            </div>
          </div>
          <div id="ui-ctrl-filter-params"></div>
          <div class="ui-control" style="border-top: 1px solid #3c3836; padding-top: 6px; margin-top: 6px;">
            <button id="ui-btn-load-plugin" class="ui-btn" style="width: 100%;" title="Load custom WASM filter plugin (.wasm)">Load Plugin (.wasm)</button>
          </div>
        </div>
      </details>
      <details class="ui-group">
        <summary>ADJUSTMENTS (HSV / HSL)</summary>
        <div class="ui-group-content">
          <div class="ui-control">
            <div class="ui-label-row"><span>Hue Shift</span><span id="ui-val-hue" class="ui-val">0°</span></div>
            <input type="range" id="ui-slider-hue" min="-180" max="180" value="0">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Saturation</span><span id="ui-val-sat" class="ui-val">0%</span></div>
            <input type="range" id="ui-slider-sat" min="-100" max="100" value="0">
          </div>
          <div class="ui-control">
            <div class="ui-label-row"><span>Brightness / Value</span><span id="ui-val-bright" class="ui-val">0%</span></div>
            <input type="range" id="ui-slider-bright" min="-100" max="100" value="0">
          </div>
          <div class="ui-row-gap" style="margin-top: 6px;">
            <button id="ui-btn-apply-hsv" class="ui-btn" style="flex: 1;">Apply HSL Adjust</button>
            <button id="ui-btn-reset-hsv" class="ui-btn" style="flex: 1;">Reset Sliders</button>
          </div>
        </div>
      </details>
    </div>
  `;

  const layout = document.getElementById('layout') || document.body;
  layout.appendChild(panel);
  if (typeof setupDraggableTab === 'function') {
    setupDraggableTab('ui-panel', 'toggle-ui', 'right', 'esenho_ui_width');
  }
}

main().catch(e => { console.error(e); log(`BOOT ERROR: ${e.message}`, 'err'); });

