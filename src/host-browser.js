/**
 * src/host-browser.js — Wesenho browser host
 * Reuses all engine logic from src/wesenho.js unchanged.
 * Handles: fetch WASM, canvas events, touch (draw/pan/zoom/rotate), REPL.
 */
if (typeof globalThis.process === 'undefined') {
  globalThis.process = { stdout: { write: (s) => console.log(String(s)) } };
}

const FILTER_NAMES = [
  'blur','brightness','contrast','dither',
  'edge','grayscale','invert','noise',
  'pixelate','sepia','threshold'
];

const canvasEl   = document.getElementById('wcanvas');
const ctx        = canvasEl.getContext('2d');
const panelEl     = document.getElementById('panel');
const termEl      = document.getElementById('wterm');
const inputEl     = document.getElementById('wcmd');
const statusEl    = document.getElementById('wstatus');
const toggleBtn   = document.getElementById('toggle-panel');

/* ── Boot ── */
async function main() {
  log('Loading canvas.wasm…');
  const host = new WesenhoScreenHost();
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

  host.canvasActor = await WesenhoModule.fromURL('roms/canvas.wasm', { name: 'canvas' });
  host.canvasActor.exports.w_init(800, 1000);
  host.syncBrushParams(host.canvasActor);
  log('canvas.wasm ready [ok]');

  for (const name of FILTER_NAMES) {
    try {
      const mod = await WesenhoModule.fromURL(`plugins/${name}.wasm`, { name });
      host.plugins.set(name, { type: 'filter', module: mod, actor: mod });
    } catch (e) { log(`warn: filter ${name} — ${e.message}`, 'err'); }
  }
  log(`${host.plugins.size} filters loaded [ok]`);

  /* ── Ensure UI Panel exists in DOM ── */
  ensureUiPanel();

  /* ── Canvas sizing + pan management ── */
  /* ── Canvas sizing + pan management ── */
  let initializedPan = false;
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

  const isMobile = () => window.matchMedia('(max-width: 768px), (max-aspect-ratio: 3/4)').matches;

  let activeUiSubTab = 'tools'; // 'tools' or 'scripts'
  function switchUiSubTab(tab) {
    activeUiSubTab = tab;
    const tabTools = document.getElementById('tab-sub-tools');
    const tabScripts = document.getElementById('tab-sub-scripts');
    const uiScroll = document.getElementById('ui-scroll');
    const uiScripts = document.getElementById('ui-scripts');

    if (tab === 'scripts') {
      if (tabTools) tabTools.classList.remove('active');
      if (tabScripts) tabScripts.classList.add('active');
      if (uiScroll) uiScroll.style.display = 'none';
      if (uiScripts) uiScripts.style.display = 'flex';
    } else {
      if (tabTools) tabTools.classList.add('active');
      if (tabScripts) tabScripts.classList.remove('active');
      if (uiScroll) uiScroll.style.display = 'flex';
      if (uiScripts) uiScripts.style.display = 'none';
    }
    updateDockTabs();
  }

  function updateDockTabs() {
    const uiEl = document.getElementById('ui-panel');
    const consoleEl = document.getElementById('panel');
    const tabTools = document.getElementById('tab-dock-tools');
    const tabConsole = document.getElementById('tab-dock-console');
    const tabScripts = document.getElementById('tab-dock-scripts');
    const btnClose = document.getElementById('tab-dock-close');

    const uiOpen = uiEl && !uiEl.classList.contains('hidden');
    const consoleOpen = consoleEl && !consoleEl.classList.contains('hidden');

    if (tabTools) tabTools.classList.toggle('active', uiOpen && activeUiSubTab === 'tools');
    if (tabScripts) tabScripts.classList.toggle('active', uiOpen && activeUiSubTab === 'scripts');
    if (tabConsole) tabConsole.classList.toggle('active', !!consoleOpen);
    if (btnClose) btnClose.classList.toggle('visible', !!(uiOpen || consoleOpen));
  }

  /* ── Toggle UI tools/scripts panel ── */
  function toggleUi(forceOpen, targetSubTab) {
    const el = document.getElementById('ui-panel');
    const consoleEl = document.getElementById('panel');
    if (!el) return;

    if (targetSubTab) {
      switchUiSubTab(targetSubTab);
    }

    const isMob = isMobile();
    let willOpen;
    if (typeof forceOpen === 'boolean') {
      willOpen = forceOpen;
    } else {
      willOpen = el.classList.contains('hidden');
    }

    if (willOpen) {
      el.classList.remove('hidden');
      if (isMob && consoleEl) {
        consoleEl.classList.add('hidden');
        const btnC = document.getElementById('toggle-panel');
        if (btnC) btnC.textContent = '◀ console [show]';
      }
    } else {
      el.classList.add('hidden');
    }

    const btn = document.getElementById('toggle-ui');
    if (btn) {
      btn.textContent = willOpen ? '◀ tools [hide]' : 'tools [show] ▶';
    }
    updateDockTabs();
    resize();
  }

  /* ── Toggle console panel ── */
  function toggleConsole(forceOpen) {
    const el = document.getElementById('panel');
    const uiEl = document.getElementById('ui-panel');
    if (!el) return;

    const isMob = isMobile();
    let willOpen;
    if (typeof forceOpen === 'boolean') {
      willOpen = forceOpen;
    } else {
      willOpen = el.classList.contains('hidden');
    }

    if (willOpen) {
      el.classList.remove('hidden');
      if (isMob && uiEl) {
        uiEl.classList.add('hidden');
        const btnU = document.getElementById('toggle-ui');
        if (btnU) btnU.textContent = 'tools [show] ▶';
      }
    } else {
      el.classList.add('hidden');
    }

    const btn = document.getElementById('toggle-panel');
    if (btn) {
      btn.textContent = willOpen ? 'console [hide] ▶' : '◀ console [show]';
    }
    updateDockTabs();
    resize();
    if (willOpen && inputEl) inputEl.focus();
  }

  /* ── Draggable Orelha Resizing & Toggle ── */
  function setupDraggableTab(panelId, btnId, side, storageKey) {
    const panel = document.getElementById(panelId);
    const btn = document.getElementById(btnId);
    if (!panel || !btn) return;

    // Restore saved width if available
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (parsed > 100 && parsed < window.innerWidth * 0.85) {
        panel.style.width = `${parsed}px`;
      }
    }

    let isDragging = false;
    let hasMoved = false;
    let startX = 0;
    let startY = 0;
    let startDim = 0;

    btn.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const isVertical = window.matchMedia('(max-aspect-ratio: 3/4)').matches;
      startDim = isVertical ? panel.offsetHeight : panel.offsetWidth;

      try {
        btn.setPointerCapture(e.pointerId);
      } catch (_) {}

      document.body.style.userSelect = 'none';
      document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
    });

    btn.addEventListener('pointermove', e => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!hasMoved && Math.hypot(dx, dy) > 3) {
        hasMoved = true;
        if (panel.classList.contains('hidden')) {
          panel.classList.remove('hidden');
          if (panelId === 'ui-panel') {
            btn.textContent = '◀ tools [hide]';
          } else {
            btn.textContent = 'console [hide] ▶';
          }
        }
      }

      if (!hasMoved) return;

      const isVertical = window.matchMedia('(max-aspect-ratio: 3/4)').matches;
      if (isVertical) {
        let newH = (side === 'left') ? (startDim + dy) : (startDim - dy);
        newH = Math.max(70, Math.min(window.innerHeight * 0.7, newH));
        panel.style.height = `${newH}px`;
        panel.style.maxHeight = `${newH}px`;
      } else {
        let newW = (side === 'left') ? (startDim + dx) : (startDim - dx);
        newW = Math.max(160, Math.min(window.innerWidth * 0.8, newW));
        panel.style.width = `${newW}px`;
      }
      resize();
    });

    const finishDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch (_) {}

      if (hasMoved) {
        const isVertical = window.matchMedia('(max-aspect-ratio: 3/4)').matches;
        const finalDim = isVertical ? panel.offsetHeight : panel.offsetWidth;
        localStorage.setItem(storageKey, finalDim);
      } else {
        if (panelId === 'ui-panel') {
          toggleUi();
        } else {
          toggleConsole();
        }
      }
      hasMoved = false;
    };

    btn.addEventListener('pointerup', finishDrag);
    btn.addEventListener('pointercancel', finishDrag);
  }

  setupDraggableTab('ui-panel', 'toggle-ui', 'left', 'wesenho_ui_width');
  setupDraggableTab('panel', 'toggle-panel', 'right', 'wesenho_console_width');

  /* ── Mobile Unified Bottom Dock Listeners ── */
  const savedMobileH = localStorage.getItem('wesenho_mobile_drawer_height');
  if (savedMobileH) {
    const pH = parseInt(savedMobileH, 10);
    if (pH >= 120 && pH <= window.innerHeight * 0.8) {
      document.documentElement.style.setProperty('--mobile-drawer-height', `${pH}px`);
    }
  }

  const tabDockTools = document.getElementById('tab-dock-tools');
  const tabDockConsole = document.getElementById('tab-dock-console');
  const tabDockScripts = document.getElementById('tab-dock-scripts');
  const tabDockClose = document.getElementById('tab-dock-close');
  const dockHandle = document.getElementById('bottom-dock-handle');

  const tabSubTools = document.getElementById('tab-sub-tools');
  const tabSubScripts = document.getElementById('tab-sub-scripts');
  if (tabSubTools) {
    tabSubTools.addEventListener('click', () => switchUiSubTab('tools'));
  }
  if (tabSubScripts) {
    tabSubScripts.addEventListener('click', () => switchUiSubTab('scripts'));
  }

  if (tabDockTools) {
    tabDockTools.addEventListener('click', () => {
      const el = document.getElementById('ui-panel');
      const isOpen = el && !el.classList.contains('hidden') && activeUiSubTab === 'tools';
      if (isOpen) {
        toggleUi(false);
      } else {
        toggleUi(true, 'tools');
      }
    });
  }

  if (tabDockScripts) {
    tabDockScripts.addEventListener('click', () => {
      const el = document.getElementById('ui-panel');
      const isOpen = el && !el.classList.contains('hidden') && activeUiSubTab === 'scripts';
      if (isOpen) {
        toggleUi(false);
      } else {
        toggleUi(true, 'scripts');
      }
    });
  }

  if (tabDockConsole) {
    tabDockConsole.addEventListener('click', () => {
      const el = document.getElementById('panel');
      const isOpen = el && !el.classList.contains('hidden');
      toggleConsole(!isOpen);
    });
  }

  if (tabDockClose) {
    tabDockClose.addEventListener('click', () => {
      toggleUi(false);
      toggleConsole(false);
    });
  }

  if (dockHandle) {
    let isDraggingDock = false;
    let startY = 0;
    let startH = 0;
    let targetPanel = null;

    dockHandle.addEventListener('pointerdown', e => {
      if (!isMobile()) return;
      const uiEl = document.getElementById('ui-panel');
      const consoleEl = document.getElementById('panel');
      if (uiEl && !uiEl.classList.contains('hidden')) {
        targetPanel = uiEl;
      } else if (consoleEl && !consoleEl.classList.contains('hidden')) {
        targetPanel = consoleEl;
      } else {
        toggleUi(true);
        targetPanel = uiEl;
      }
      if (!targetPanel) return;

      isDraggingDock = true;
      startY = e.clientY;
      startH = targetPanel.offsetHeight || 280;
      try { dockHandle.setPointerCapture(e.pointerId); } catch (_) {}
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';
    });

    dockHandle.addEventListener('pointermove', e => {
      if (!isDraggingDock || !targetPanel) return;
      const dy = e.clientY - startY;
      let newH = startH - dy;
      newH = Math.max(90, Math.min(window.innerHeight * 0.75, newH));
      document.documentElement.style.setProperty('--mobile-drawer-height', `${newH}px`);
      targetPanel.style.height = `${newH}px`;
      resize();
    });

    const finishDockDrag = (e) => {
      if (!isDraggingDock) return;
      isDraggingDock = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      try { dockHandle.releasePointerCapture(e.pointerId); } catch (_) {}
      if (targetPanel) {
        if (targetPanel.offsetHeight < 100) {
          toggleUi(false);
          toggleConsole(false);
        } else {
          localStorage.setItem('wesenho_mobile_drawer_height', targetPanel.offsetHeight);
        }
      }
      targetPanel = null;
    };

    dockHandle.addEventListener('pointerup', finishDockDrag);
    dockHandle.addEventListener('pointercancel', finishDockDrag);
  }

  // On mobile initial setup: start with full-screen canvas (drawers closed)
  if (isMobile()) {
    const uiEl = document.getElementById('ui-panel');
    const consoleEl = document.getElementById('panel');
    if (uiEl) uiEl.classList.add('hidden');
    if (consoleEl) consoleEl.classList.add('hidden');
    updateDockTabs();
    resize();
  }

  window.addEventListener('keydown', e => {
    if (e.key === '`' && e.ctrlKey) {
      toggleConsole();
      e.preventDefault();
    } else if ((e.key === 'b' || e.key === 'B' || e.key === 'u' || e.key === 'U') && (e.ctrlKey || e.altKey)) {
      toggleUi();
      e.preventDefault();
    }
  });

  /* ── Render loop ── */
  let imgData = null;
  let lassoPoints = [];

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

    ctx.fillStyle = '#1d2021';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

    if (ptr && cw > 0 && ch > 0) {
      if (!imgData || imgData.width !== cw || imgData.height !== ch)
        imgData = ctx.createImageData(cw, ch);
      imgData.data.set(new Uint8Array(host.canvasActor.memory.buffer, ptr, cw * ch * 4));
      const tmp = new OffscreenCanvas(cw, ch);
      tmp.getContext('2d').putImageData(imgData, 0, 0);

      /* Draw with pan + zoom + rotation around doc center */
      const cx = host.panX + (cw * host.zoom) / 2;
      const cy = host.panY + (ch * host.zoom) / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(host.canvasRotation);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, -(cw * host.zoom) / 2, -(ch * host.zoom) / 2, cw * host.zoom, ch * host.zoom);

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

        // 25% tint of current drawing color
        const c = host.currentColor !== undefined ? host.currentColor : 0xFFEBDBB2;
        const r = c & 0xFF, g = (c >> 8) & 0xFF, b = (c >> 16) & 0xFF;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.28)`;
        ctx.fill();

        // Animated marching ants outline
        ctx.strokeStyle = '#fabd2f';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = (Date.now() / 40) % 10;
        ctx.stroke();

        ctx.restore();
      }

      ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ── Coordinate helpers ── */
  /* Screen → document space, accounting for pan/zoom/rotation */
  function screenToDoc(sx, sy) {
    const cw = host.canvasActor.exports.get_canvas_width();
    const ch = host.canvasActor.exports.get_canvas_height();
    const ocx = host.panX + (cw * host.zoom) / 2; /* rotation origin on screen */
    const ocy = host.panY + (ch * host.zoom) / 2;
    /* unrotate around origin */
    const cosA = Math.cos(-host.canvasRotation);
    const sinA = Math.sin(-host.canvasRotation);
    const rx = (sx - ocx) * cosA - (sy - ocy) * sinA;
    const ry = (sx - ocx) * sinA + (sy - ocy) * cosA;
    /* unzoom + unpan */
    return {
      x: (rx + (cw * host.zoom) / 2) / host.zoom,
      y: (ry + (ch * host.zoom) / 2) / host.zoom
    };
  }

  function clientPos(e) {
    const r = canvasEl.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    return { sx, sy, ...screenToDoc(sx, sy) };
  }

  /* ── Mouse events ── */
  canvasEl.addEventListener('contextmenu', e => e.preventDefault());

  canvasEl.addEventListener('mousedown', e => {
    const { sx, sy, x, y } = clientPos(e);
    host.mouseState.x = sx; host.mouseState.y = sy;
    if (e.button === 1) {
      host.isPanning = true; host.panStartX = sx; host.panStartY = sy;
    } else {
      host.mouseState.buttons |= e.button === 0 ? 1 : 2;
      host.isDrawingOnCanvas = true;
      host.strokePrevX = x; host.strokePrevY = y;
      host.strokeIsEraser = e.button === 2 ? 1 : (host.currentTool === 1 ? 1 : 0);
      if (host.brushParams && host.brushParams.mode === 4) {
        lassoPoints = [{ x, y }];
      }
      host.sendStroke(x, y, x, y, 0, host.strokeIsEraser, host.currentColor);
    }
    e.preventDefault();
  });

  canvasEl.addEventListener('mousemove', e => {
    const { sx, sy, x, y } = clientPos(e);
    host.mouseState.x = sx; host.mouseState.y = sy;
    if (host.isPanning) {
      host.panX += sx - host.panStartX; host.panY += sy - host.panStartY;
      host.panStartX = sx; host.panStartY = sy;
    } else if (host.isDrawingOnCanvas && (host.mouseState.buttons & 3)) {
      if (host.brushParams && host.brushParams.mode === 4) {
        lassoPoints.push({ x, y });
      }
      host.sendStroke(x, y, host.strokePrevX, host.strokePrevY, 1, host.strokeIsEraser, host.currentColor);
      host.strokePrevX = x; host.strokePrevY = y;
    }
    updateStatus(host, x, y);
  });

  canvasEl.addEventListener('mouseup', e => {
    if (e.button === 1) { host.isPanning = false; }
    else {
      host.mouseState.buttons &= ~(e.button === 0 ? 1 : 2);
      if (!(host.mouseState.buttons & 3) && host.isDrawingOnCanvas) {
        host.sendStroke(host.strokePrevX, host.strokePrevY,
                        host.strokePrevX, host.strokePrevY,
                        2, host.strokeIsEraser, host.currentColor);
        host.isDrawingOnCanvas = false;
        lassoPoints = [];
      }
    }
  });

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

  /* ── Touch support — 1 finger: draw / 2 finger: pan + pinch-zoom + rotate ── */
  const touch = {
    prevTouches: null,   /* TouchList snapshot from last event */
    drawing: false
  };

  function touchDocPos(t) {
    const r = canvasEl.getBoundingClientRect();
    const sx = t.clientX - r.left, sy = t.clientY - r.top;
    return { sx, sy, ...screenToDoc(sx, sy) };
  }

  function touchMidpoint(a, b) {
    const r = canvasEl.getBoundingClientRect();
    return {
      sx: (a.clientX + b.clientX) / 2 - r.left,
      sy: (a.clientY + b.clientY) / 2 - r.top
    };
  }

  canvasEl.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const { x, y } = touchDocPos(e.touches[0]);
      touch.drawing = true;
      host.strokePrevX = x; host.strokePrevY = y;
      host.strokeIsEraser = host.currentTool === 1 ? 1 : 0;
      if (host.brushParams && host.brushParams.mode === 4) {
        lassoPoints = [{ x, y }];
      }
      host.sendStroke(x, y, x, y, 0, host.strokeIsEraser, host.currentColor);
    } else if (touch.drawing) {
      /* second finger landed mid-stroke — end stroke, switch to gesture */
      host.sendStroke(host.strokePrevX, host.strokePrevY,
                      host.strokePrevX, host.strokePrevY,
                      2, host.strokeIsEraser, host.currentColor);
      touch.drawing = false;
      lassoPoints = [];
    }
    touch.prevTouches = e.touches;
  }, { passive: false });

  canvasEl.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && touch.drawing) {
      const { x, y } = touchDocPos(e.touches[0]);
      if (host.brushParams && host.brushParams.mode === 4) {
        lassoPoints.push({ x, y });
      }
      host.sendStroke(x, y, host.strokePrevX, host.strokePrevY,
                      1, host.strokeIsEraser, host.currentColor);
      host.strokePrevX = x; host.strokePrevY = y;
      updateStatus(host, x, y);

    } else if (e.touches.length === 2 && touch.prevTouches && touch.prevTouches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const [pa, pb] = [touch.prevTouches[0], touch.prevTouches[1]];

      /* Current / previous midpoints on screen */
      const mid  = touchMidpoint(a, b);
      const pmid = touchMidpoint(pa, pb);

      /* Pan: midpoint delta */
      host.panX += mid.sx - pmid.sx;
      host.panY += mid.sy - pmid.sy;

      /* Pinch-zoom around current midpoint */
      const curDist  = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const prevDist = Math.hypot(pa.clientX - pb.clientX, pa.clientY - pb.clientY);
      if (prevDist > 1) {
        const f = curDist / prevDist, old = host.zoom;
        host.zoom = Math.max(0.05, Math.min(20, host.zoom * f));
        host.panX = mid.sx - (mid.sx - host.panX) * (host.zoom / old);
        host.panY = mid.sy - (mid.sy - host.panY) * (host.zoom / old);
      }

      /* Rotation: angle between finger vectors */
      const curAngle  = Math.atan2(b.clientY  - a.clientY,  b.clientX  - a.clientX);
      const prevAngle = Math.atan2(pb.clientY - pa.clientY, pb.clientX - pa.clientX);
      host.canvasRotation += curAngle - prevAngle;
    }

    touch.prevTouches = e.touches;
  }, { passive: false });

  canvasEl.addEventListener('touchend', e => {
    e.preventDefault();
    if (e.touches.length === 0 && touch.drawing) {
      host.sendStroke(host.strokePrevX, host.strokePrevY,
                      host.strokePrevX, host.strokePrevY,
                      2, host.strokeIsEraser, host.currentColor);
      touch.drawing = false;
      lassoPoints = [];
    }
    touch.prevTouches = e.touches;
  }, { passive: false });

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

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      runCmd(inputEl.value); inputEl.value = ''; e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      hl.i = Math.min(hl.i + 1, history.length - 1);
      inputEl.value = history[history.length - 1 - hl.i] || ''; e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      hl.i = Math.max(hl.i - 1, -1);
      inputEl.value = hl.i < 0 ? '' : history[history.length - 1 - hl.i] || ''; e.preventDefault();
    }
  });

  /* ── UI Controls & Sync ── */
  const uiPanel = document.getElementById('ui-panel');
  if (uiPanel) {
    uiPanel.addEventListener('mousedown', e => e.stopPropagation());
    uiPanel.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  }

  // 1. Presets & Tools
  const DEFAULT_PRESETS = [
    { name: 'Pencil', tool: 'brush', mode: 0, size: 2, opacity: 100, hardness: 100, flow: 100, smoothing: 15, shape: 'circle' },
    { name: 'Inker', tool: 'brush', mode: 0, size: 4, opacity: 100, hardness: 100, flow: 100, smoothing: 40, shape: 'circle' },
    { name: 'Airbrush', tool: 'brush', mode: 0, size: 45, opacity: 40, hardness: 0, flow: 30, smoothing: 20, shape: 'circle' },
    { name: 'Hard Round', tool: 'brush', mode: 0, size: 16, opacity: 100, hardness: 100, flow: 100, smoothing: 0, shape: 'circle' },
    { name: 'Chisel', tool: 'brush', mode: 0, size: 28, opacity: 80, hardness: 85, flow: 80, shape: 'chisel', angle: 45, roundness: 40 },
    { name: 'Charcoal', tool: 'brush', mode: 0, size: 24, opacity: 85, hardness: 70, flow: 90, grain: 45, texture: 'paper', shape: 'circle' },
    { name: 'Smudge Tool', tool: 'smudge', mode: 1, size: 30, opacity: 100, hardness: 40, smudge: 70 },
    { name: 'Blender Tool', tool: 'blend', mode: 2, size: 35, opacity: 100, hardness: 30, smudge: 50, wetness: 70 },
    { name: 'Soft Eraser', tool: 'eraser', size: 30, opacity: 100, hardness: 20 },
    { name: 'Hard Eraser', tool: 'eraser', size: 16, opacity: 100, hardness: 100 }
  ];

  function getCustomPresets() {
    try {
      return JSON.parse(localStorage.getItem('wesenho_brush_presets') || '[]');
    } catch (_) { return []; }
  }

  function saveCustomPreset(preset) {
    const list = getCustomPresets().filter(p => p.name !== preset.name);
    list.push(preset);
    localStorage.setItem('wesenho_brush_presets', JSON.stringify(list));
  }

  function deleteCustomPreset(name) {
    const list = getCustomPresets().filter(p => p.name !== name);
    localStorage.setItem('wesenho_brush_presets', JSON.stringify(list));
  }

  function populatePresetsDropdown() {
    const sel = document.getElementById('ui-select-preset');
    if (!sel) return;
    const curVal = sel.value;
    sel.innerHTML = '<option value="">-- Choose Preset --</option>';

    const grpBuiltin = document.createElement('optgroup');
    grpBuiltin.label = 'Built-in Presets';
    DEFAULT_PRESETS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = 'builtin:' + p.name;
      opt.textContent = p.name;
      grpBuiltin.appendChild(opt);
    });
    sel.appendChild(grpBuiltin);

    const custom = getCustomPresets();
    if (custom.length > 0) {
      const grpCustom = document.createElement('optgroup');
      grpCustom.label = 'Custom Presets';
      custom.forEach(p => {
        const opt = document.createElement('option');
        opt.value = 'custom:' + p.name;
        opt.textContent = p.name;
        grpCustom.appendChild(opt);
      });
      sel.appendChild(grpCustom);
    }
    sel.value = curVal;
  }

  function applyPreset(p) {
    if (!p) return;
    if (p.tool === 'eraser') {
      runCmd('set tool eraser');
    } else if (p.tool === 'smudge') {
      runCmd('set tool smudge');
    } else if (p.tool === 'blend') {
      runCmd('set tool blend');
    } else if (p.tool === 'fill') {
      runCmd('set tool fill');
    } else if (p.tool === 'lasso_fill') {
      runCmd('set tool lasso_fill');
    } else {
      runCmd('set tool brush');
    }
    if (p.size !== undefined) runCmd(`brush size ${p.size}`);
    if (p.opacity !== undefined) runCmd(`brush opacity ${p.opacity}`);
    if (p.hardness !== undefined) runCmd(`brush hardness ${p.hardness}`);
    if (p.flow !== undefined) runCmd(`brush flow ${p.flow}`);
    if (p.spacing !== undefined) runCmd(`set spacing ${p.spacing}`);
    if (p.smoothing !== undefined) runCmd(`brush smooth ${p.smoothing}`);
    if (p.midpoint !== undefined) runCmd(`set midpoint ${p.midpoint}`);
    if (p.angle !== undefined) runCmd(`set angle ${p.angle}`);
    if (p.roundness !== undefined) runCmd(`set roundness ${p.roundness}`);
    if (p.scatter !== undefined) runCmd(`set scatter ${p.scatter}`);
    if (p.grain !== undefined) runCmd(`set grain ${p.grain}`);
    if (p.smudge !== undefined) runCmd(`set smudge ${p.smudge}`);
    if (p.wetness !== undefined) runCmd(`set wetness ${p.wetness}`);
    if (p.tolerance !== undefined) runCmd(`set tolerance ${p.tolerance}`);
    if (p.shape !== undefined) runCmd(`set shape ${p.shape}`);
    if (p.texture !== undefined) runCmd(`set texture ${p.texture}`);
  }

  const presetSel = document.getElementById('ui-select-preset');
  if (presetSel) {
    presetSel.addEventListener('change', () => {
      const val = presetSel.value;
      if (!val) return;
      if (val.startsWith('builtin:')) {
        const name = val.slice(8);
        const p = DEFAULT_PRESETS.find(x => x.name === name);
        if (p) applyPreset(p);
      } else if (val.startsWith('custom:')) {
        const name = val.slice(7);
        const p = getCustomPresets().find(x => x.name === name);
        if (p) applyPreset(p);
      }
    });
  }

  const savePresetBtn = document.getElementById('ui-btn-save-preset');
  if (savePresetBtn) {
    savePresetBtn.addEventListener('click', () => {
      const name = prompt('Preset name:');
      if (!name || !name.trim()) return;
      const trimName = name.trim();
      const shapes = ['circle', 'square', 'chisel'];
      const p = {
        name: trimName,
        tool: host.currentTool === 1 ? 'eraser' : (['brush', 'smudge', 'blend', 'fill', 'lasso_fill'][host.brushParams.mode] || 'brush'),
        size: host.brushParams.size,
        opacity: host.brushParams.opacity,
        hardness: host.brushParams.hardness,
        flow: host.brushParams.flow,
        spacing: host.brushParams.spacing,
        smoothing: host.brushParams.smoothing || 0,
        midpoint: host.brushParams.midpoint !== undefined ? host.brushParams.midpoint : 50,
        angle: host.brushParams.angle,
        roundness: host.brushParams.roundness,
        scatter: host.brushParams.scatter,
        grain: host.brushParams.grain,
        smudge: host.brushParams.smudge,
        wetness: host.brushParams.wetness,
        tolerance: host.brushParams.tolerance,
        shape: shapes[host.brushParams.shape] || `layer_${host.brushParams.shape}`,
        texture: host.activeTexture || 'none'
      };
      saveCustomPreset(p);
      populatePresetsDropdown();
      if (presetSel) presetSel.value = 'custom:' + trimName;
      log(`Preset '${trimName}' saved [ok]`);
    });
  }

  const delPresetBtn = document.getElementById('ui-btn-del-preset');
  if (delPresetBtn) {
    delPresetBtn.addEventListener('click', () => {
      const val = presetSel ? presetSel.value : '';
      if (!val || !val.startsWith('custom:')) {
        alert('Select a custom preset to delete.');
        return;
      }
      const name = val.slice(7);
      if (confirm(`Delete preset '${name}'?`)) {
        deleteCustomPreset(name);
        populatePresetsDropdown();
        if (presetSel) presetSel.value = '';
        log(`Preset '${name}' deleted [ok]`);
      }
    });
  }

  // Tool buttons
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      runCmd(`set tool ${tool}`);
    });
  });

  /* ── User Scripts Manager & Runner (Pure REPL Commands) ── */
  const DEFAULT_SCRIPTS = [
    {
      name: 'starter_canvas',
      code: `# Setup starter canvas and brush\nset tool brush\nset size 25\nset color #fabd2f\nset opacity 100\nset hardness 80\nbrush 200 200\nbrush 250 200\nbrush 300 200\nset color #fe8019\nset size 15\nbrush 250 250`
    },
    {
      name: 'swatches_palette',
      code: `# Paint color swatches on canvas\nset tool brush\nset size 30\nset hardness 100\nset color #fb4934\nbrush 100 200\nset color #fe8019\nbrush 160 200\nset color #fabd2f\nbrush 220 200\nset color #b8bb26\nbrush 280 200\nset color #83a598\nbrush 340 200\nset color #d3869b\nbrush 400 200`
    },
    {
      name: 'layers_demo',
      code: `# Create and blend layers\nnew layer\nset tool brush\nset size 40\nset color #8ec07c\nbrush 200 150\nbrush 260 150\nnew layer\nset color #fabd2f\nbrush 230 180`
    }
  ];

  function getSavedScripts() {
    try {
      const stored = localStorage.getItem('wesenho_user_scripts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hasOldJsDefaults = parsed.some(s => s.name === 'spiral_pattern.js' || (s.code && s.code.includes('runCmd(')));
          if (!hasOldJsDefaults) return parsed;
        }
      }
    } catch (_) {}
    return DEFAULT_SCRIPTS.slice();
  }

  function saveScriptsList(list) {
    localStorage.setItem('wesenho_user_scripts', JSON.stringify(list));
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
        scriptEditor.value = `# New script\nset tool brush\nset size 20\nset color #fabd2f\n`;
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
    el.addEventListener('input', () => {
      if (badge) badge.textContent = el.value + suffix;
    });
    el.addEventListener('change', () => {
      runCmd(`${cmdPrefix} ${el.value}`);
    });
  }

  bindSlider('ui-slider-size', 'ui-val-size', 'brush size');
  bindSlider('ui-slider-opacity', 'ui-val-opacity', 'brush opacity', '%');
  bindSlider('ui-slider-hardness', 'ui-val-hardness', 'brush hardness', '%');
  bindSlider('ui-slider-flow', 'ui-val-flow', 'brush flow', '%');
  bindSlider('ui-slider-spacing', 'ui-val-spacing', 'set spacing', '%');
  bindSlider('ui-slider-smoothing', 'ui-val-smoothing', 'brush smooth', '%');
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

  // Tip Shape & Texture selectors
  const shapeSel = document.getElementById('ui-select-shape');
  if (shapeSel) {
    shapeSel.addEventListener('change', () => {
      runCmd(`set shape ${shapeSel.value}`);
    });
  }
  const texSel = document.getElementById('ui-select-texture');
  if (texSel) {
    texSel.addEventListener('change', () => {
      runCmd(`set texture ${texSel.value}`);
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
    if (colorPreview) colorPreview.style.background = hex;
    if (colorPicker && document.activeElement !== colorPicker) colorPicker.value = hex;
    if (colorHex && document.activeElement !== colorHex) colorHex.value = hex;

    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    if (slR && document.activeElement !== slR) { slR.value = rgb.r; document.getElementById('ui-val-rgb-r').textContent = rgb.r; }
    if (slG && document.activeElement !== slG) { slG.value = rgb.g; document.getElementById('ui-val-rgb-g').textContent = rgb.g; }
    if (slB && document.activeElement !== slB) { slB.value = rgb.b; document.getElementById('ui-val-rgb-b').textContent = rgb.b; }

    if (slH && document.activeElement !== slH) { slH.value = hsl.h; document.getElementById('ui-val-hsl-h').textContent = hsl.h + '°'; }
    if (slS && document.activeElement !== slS) { slS.value = hsl.s; document.getElementById('ui-val-hsl-s').textContent = hsl.s + '%'; }
    if (slL && document.activeElement !== slL) { slL.value = hsl.l; document.getElementById('ui-val-hsl-l').textContent = hsl.l + '%'; }
  }

  function onRgbSliderChange() {
    const r = parseInt(slR.value, 10);
    const g = parseInt(slG.value, 10);
    const b = parseInt(slB.value, 10);
    document.getElementById('ui-val-rgb-r').textContent = r;
    document.getElementById('ui-val-rgb-g').textContent = g;
    document.getElementById('ui-val-rgb-b').textContent = b;
    const hex = rgbToHex(r, g, b);
    updateColorControlsFromHex(hex);
    runCmd(`set color ${hex}`);
  }

  function onHslSliderChange() {
    const h = parseInt(slH.value, 10);
    const s = parseInt(slS.value, 10);
    const l = parseInt(slL.value, 10);
    document.getElementById('ui-val-hsl-h').textContent = h + '°';
    document.getElementById('ui-val-hsl-s').textContent = s + '%';
    document.getElementById('ui-val-hsl-l').textContent = l + '%';
    const rgb = hslToRgb(h, s, l);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    updateColorControlsFromHex(hex);
    runCmd(`set color ${hex}`);
  }

  if (slR) {
    slR.addEventListener('input', () => { document.getElementById('ui-val-rgb-r').textContent = slR.value; });
    slR.addEventListener('change', onRgbSliderChange);
  }
  if (slG) {
    slG.addEventListener('input', () => { document.getElementById('ui-val-rgb-g').textContent = slG.value; });
    slG.addEventListener('change', onRgbSliderChange);
  }
  if (slB) {
    slB.addEventListener('input', () => { document.getElementById('ui-val-rgb-b').textContent = slB.value; });
    slB.addEventListener('change', onRgbSliderChange);
  }
  if (slH) {
    slH.addEventListener('input', () => { document.getElementById('ui-val-hsl-h').textContent = slH.value + '°'; });
    slH.addEventListener('change', onHslSliderChange);
  }
  if (slS) {
    slS.addEventListener('input', () => { document.getElementById('ui-val-hsl-s').textContent = slS.value + '%'; });
    slS.addEventListener('change', onHslSliderChange);
  }
  if (slL) {
    slL.addEventListener('input', () => { document.getElementById('ui-val-hsl-l').textContent = slL.value + '%'; });
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

  // Swatches functions
  const DEFAULT_SWATCHES = [
    '#fb4934', '#fe8019', '#fabd2f', '#b8bb26', '#8ec07c', '#83a598',
    '#d3869b', '#fbf1c7', '#ebdbb2', '#928374', '#282828', '#000000'
  ];

  function getCustomSwatches() {
    try {
      return JSON.parse(localStorage.getItem('wesenho_custom_swatches') || '[]');
    } catch (_) { return []; }
  }

  function addCustomSwatch(color) {
    const swatches = getCustomSwatches();
    if (!swatches.includes(color)) {
      swatches.push(color);
      localStorage.setItem('wesenho_custom_swatches', JSON.stringify(swatches));
      renderSwatches();
    }
  }

  function removeCustomSwatch(index) {
    const swatches = getCustomSwatches();
    swatches.splice(index, 1);
    localStorage.setItem('wesenho_custom_swatches', JSON.stringify(swatches));
    renderSwatches();
  }

  function renderSwatches() {
    const grid = document.getElementById('ui-swatches-grid');
    if (!grid) return;
    grid.innerHTML = '';

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
      el.title = `${col} (right-click or click [x] to delete)`;
      el.addEventListener('click', () => {
        updateColorControlsFromHex(col);
        runCmd(`set color ${col}`);
      });
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        removeCustomSwatch(idx);
      });

      const del = document.createElement('span');
      del.className = 'swatch-del';
      del.textContent = 'x';
      del.title = 'Delete swatch';
      del.addEventListener('click', e => {
        e.stopPropagation();
        removeCustomSwatch(idx);
      });
      el.appendChild(del);

      grid.appendChild(el);
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

  // 4. Layers Buttons
  const addLayerBtn = document.getElementById('ui-btn-add-layer');
  if (addLayerBtn) {
    addLayerBtn.addEventListener('click', () => runCmd('new layer'));
  }
  const clearLayerBtn = document.getElementById('ui-btn-clear-layer');
  if (clearLayerBtn) {
    clearLayerBtn.addEventListener('click', () => runCmd('clear layer'));
  }

  // 5. Filters & Export
  const applyFilterBtn = document.getElementById('ui-btn-apply-filter');
  const filterSel = document.getElementById('ui-select-filter');
  if (applyFilterBtn && filterSel) {
    applyFilterBtn.addEventListener('click', () => {
      runCmd(`filter ${filterSel.value}`);
    });
  }

  const exportBtn = document.getElementById('ui-btn-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      runCmd('save canvas drawing.png');
    });
  }

  // Canvas Resize Controls
  const btnResizeCanvas = document.getElementById('ui-btn-resize-canvas');
  const inputCanvasW = document.getElementById('ui-canvas-w');
  const inputCanvasH = document.getElementById('ui-canvas-h');
  if (btnResizeCanvas && inputCanvasW && inputCanvasH) {
    btnResizeCanvas.addEventListener('click', () => {
      const w = parseInt(inputCanvasW.value, 10);
      const h = parseInt(inputCanvasH.value, 10);
      if (w > 0 && h > 0) {
        runCmd(`resize ${w} ${h}`);
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
        runCmd(`resize ${w} ${h}`);
      }
    });
  });

  // Layer Resize Controls
  const btnResizeLayer = document.getElementById('ui-btn-resize-layer');
  const inputLayerW = document.getElementById('ui-layer-w');
  const inputLayerH = document.getElementById('ui-layer-h');
  const chkLayerResample = document.getElementById('ui-layer-resample');
  if (btnResizeLayer && inputLayerW && inputLayerH) {
    btnResizeLayer.addEventListener('click', () => {
      const w = parseInt(inputLayerW.value, 10);
      const h = parseInt(inputLayerH.value, 10);
      const mode = (chkLayerResample && !chkLayerResample.checked) ? 'crop' : 'scale';
      if (w > 0 && h > 0) {
        runCmd(`layer resize ${w} ${h} ${mode}`);
      }
    });
  }

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

  // 6. Master Sync Function
  function syncUiFromHost() {
    if (!host.canvasActor || !host.canvasActor.exports) return;

    // A. Tools
    const isEraser = host.currentTool === 1;
    const mode = host.brushParams ? host.brushParams.mode : 0;
    const modeNames = ['brush', 'smudge', 'blend', 'fill', 'lasso_fill'];
    const curToolName = isEraser ? 'eraser' : (modeNames[mode] || 'brush');

    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === curToolName);
    });

    // B. Sliders
    if (host.brushParams) {
      const bp = host.brushParams;
      const setSlider = (id, valId, val, suf = '') => {
        const el = document.getElementById(id);
        const v = document.getElementById(valId);
        if (el && document.activeElement !== el && val !== undefined) {
          el.value = val;
          if (v) v.textContent = val + suf;
        }
      };
      setSlider('ui-slider-size', 'ui-val-size', bp.size);
      setSlider('ui-slider-opacity', 'ui-val-opacity', bp.opacity, '%');
      setSlider('ui-slider-hardness', 'ui-val-hardness', bp.hardness, '%');
      setSlider('ui-slider-flow', 'ui-val-flow', bp.flow, '%');
      setSlider('ui-slider-spacing', 'ui-val-spacing', bp.spacing, '%');
      setSlider('ui-slider-smoothing', 'ui-val-smoothing', bp.smoothing || 0, '%');
      setSlider('ui-slider-midpoint', 'ui-val-midpoint', bp.midpoint !== undefined ? bp.midpoint : 50, '%');
      setSlider('ui-slider-angle', 'ui-val-angle', bp.angle, '°');
      setSlider('ui-slider-roundness', 'ui-val-roundness', bp.roundness, '%');
      setSlider('ui-slider-scatter', 'ui-val-scatter', bp.scatter, '%');
      setSlider('ui-slider-grain', 'ui-val-grain', bp.grain, '%');
      setSlider('ui-slider-smudge', 'ui-val-smudge', bp.smudge, '%');
      setSlider('ui-slider-wetness', 'ui-val-wetness', bp.wetness, '%');
      setSlider('ui-slider-tolerance', 'ui-val-tolerance', bp.tolerance);
      setSlider('ui-slider-tex-scale', 'ui-val-tex-scale', bp.texture_scale || 100, '%');
      setSlider('ui-slider-tex-rotate', 'ui-val-tex-rotate', bp.texture_rotate || 0, '°');
      setSlider('ui-slider-tex-contrast', 'ui-val-tex-contrast', bp.texture_contrast !== undefined ? bp.texture_contrast : 100, '%');
    }

    // C. Color
    if (host.currentColor !== undefined) {
      const c = host.currentColor;
      const r = c & 0xFF;
      const g = (c >> 8) & 0xFF;
      const b = (c >> 16) & 0xFF;
      const hex = rgbToHex(r, g, b);
      updateColorControlsFromHex(hex);
    }

    // D. Canvas Size
    const curW = host.canvasActor.exports.get_canvas_width ? host.canvasActor.exports.get_canvas_width() : 0;
    const curH = host.canvasActor.exports.get_canvas_height ? host.canvasActor.exports.get_canvas_height() : 0;
    const badgeCanvasSize = document.getElementById('ui-val-canvas-size');
    if (badgeCanvasSize && curW && curH) {
      badgeCanvasSize.textContent = `${curW} x ${curH}`;
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
    const activeDraw = host.canvasActor.exports.get_active_layer ? host.canvasActor.exports.get_active_layer() : 0;
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

    // Render Layers List Cards
    const layersList = document.getElementById('ui-layers-list');
    if (layersList) {
      layersList.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const vis = host.canvasActor.exports.get_layer_visible ? host.canvasActor.exports.get_layer_visible(i) : 1;
        const op = host.canvasActor.exports.get_layer_opacity ? host.canvasActor.exports.get_layer_opacity(i) : 255;
        const w = host.canvasActor.exports.w_layer_get_width ? host.canvasActor.exports.w_layer_get_width(i) : 0;
        const h = host.canvasActor.exports.w_layer_get_height ? host.canvasActor.exports.w_layer_get_height(i) : 0;
        const opPct = Math.round((op / 255) * 100);

        let name = `layer_${i}`;
        if (host.textures) {
          for (const [k, v] of host.textures.entries()) {
            if (v.wasmId === i) { name = k; break; }
          }
        }

        const isDraw = (i === activeDraw);
        const isShape = (i === shapeId);
        const isTex = (name === activeTex);

        const card = document.createElement('div');
        card.className = 'ui-layer-card' + (isDraw ? ' active-draw' : '');

        // Header: title + badges
        const header = document.createElement('div');
        header.className = 'layer-card-header';

        const title = document.createElement('span');
        title.className = 'layer-card-title';
        title.textContent = `[${i}] ${name} (${w}x${h})`;
        title.title = `Click to select drawing layer [${i}]`;
        title.addEventListener('click', () => runCmd(`layer select ${i}`));
        header.appendChild(title);

        if (isDraw) {
          const b = document.createElement('span');
          b.className = 'badge-tag badge-draw';
          b.textContent = 'DRAW';
          header.appendChild(b);
        }
        if (isShape) {
          const b = document.createElement('span');
          b.className = 'badge-tag badge-shape';
          b.textContent = 'SHAPE';
          header.appendChild(b);
        }
        if (isTex) {
          const b = document.createElement('span');
          b.className = 'badge-tag badge-tex';
          b.textContent = 'TEX';
          header.appendChild(b);
        }
        card.appendChild(header);

        // Actions Row
        const actions = document.createElement('div');
        actions.className = 'layer-actions-row';

        const drawBtn = document.createElement('button');
        drawBtn.className = 'ui-mini-btn' + (isDraw ? ' active' : '');
        drawBtn.textContent = 'Draw';
        drawBtn.title = 'Set as active drawing layer';
        drawBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`layer select ${i}`);
        });
        actions.appendChild(drawBtn);

        const shapeBtn = document.createElement('button');
        shapeBtn.className = 'ui-mini-btn' + (isShape ? ' active' : '');
        shapeBtn.textContent = 'Shape';
        shapeBtn.title = 'Use this layer as brush tip shape';
        shapeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`set shape ${name}`);
        });
        actions.appendChild(shapeBtn);

        const texBtn = document.createElement('button');
        texBtn.className = 'ui-mini-btn' + (isTex ? ' active' : '');
        texBtn.textContent = 'Grain';
        texBtn.title = 'Use this layer as grain texture';
        texBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`set texture ${name}`);
        });
        actions.appendChild(texBtn);

        const resizeBtn = document.createElement('button');
        resizeBtn.className = 'ui-mini-btn';
        resizeBtn.textContent = 'size';
        resizeBtn.title = `Resize layer [${i}] (${w}x${h})`;
        resizeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`layer select ${i}`);
          if (inputLayerW) inputLayerW.value = w;
          if (inputLayerH) inputLayerH.value = h;
          if (inputLayerW) inputLayerW.focus();
        });
        actions.appendChild(resizeBtn);

        const visBtn = document.createElement('button');
        visBtn.className = 'ui-mini-btn';
        visBtn.textContent = vis ? 'vis' : 'hid';
        visBtn.title = vis ? 'Hide layer' : 'Show layer';
        visBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runCmd(`toggle layer ${i}`);
        });
        actions.appendChild(visBtn);

        if (count > 1) {
          const delBtn = document.createElement('button');
          delBtn.className = 'ui-mini-btn';
          delBtn.textContent = 'del';
          delBtn.title = 'Delete layer';
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete layer [${i}] ${name}?`)) {
              runCmd(`delete layer ${i}`);
            }
          });
          actions.appendChild(delBtn);
        }

        card.appendChild(actions);

        // Opacity Row
        const opRow = document.createElement('div');
        opRow.className = 'layer-opacity-row';
        opRow.innerHTML = `<span>Op:</span>`;

        const opInput = document.createElement('input');
        opInput.type = 'range';
        opInput.min = '0';
        opInput.max = '100';
        opInput.value = opPct;
        opInput.title = `Opacity ${opPct}%`;

        const opVal = document.createElement('span');
        opVal.className = 'ui-val';
        opVal.textContent = `${opPct}%`;

        opInput.addEventListener('input', () => { opVal.textContent = `${opInput.value}%`; });
        opInput.addEventListener('change', (e) => {
          e.stopPropagation();
          runCmd(`opacity layer ${i} ${e.target.value}`);
        });
        opInput.addEventListener('mousedown', e => e.stopPropagation());
        opInput.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });

        opRow.appendChild(opInput);
        opRow.appendChild(opVal);
        card.appendChild(opRow);

        layersList.appendChild(card);
      }
    }

    // Sync Layer Resizer UI for Active Layer
    const actLayer = host.canvasActor.exports.get_active_layer ? host.canvasActor.exports.get_active_layer() : 0;
    const actW = host.canvasActor.exports.w_layer_get_width ? host.canvasActor.exports.w_layer_get_width(actLayer) : 0;
    const actH = host.canvasActor.exports.w_layer_get_height ? host.canvasActor.exports.w_layer_get_height(actLayer) : 0;
    const badgeLayerSize = document.getElementById('ui-val-layer-size');
    if (badgeLayerSize && actW && actH) {
      badgeLayerSize.textContent = `[${actLayer}] ${actW} x ${actH}`;
    }
    if (inputLayerW && document.activeElement !== inputLayerW && actW) {
      inputLayerW.value = actW;
    }
    if (inputLayerH && document.activeElement !== inputLayerH && actH) {
      inputLayerH.value = actH;
    }

    updateDockTabs();
  }

  // Initial population
  populatePresetsDropdown();
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
  const el = document.createElement('div');
  if (cls) el.className = cls;
  el.textContent = String(msg).replace(/\x1b\[[^m]*m/g, '');
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

  if (!document.getElementById('wesenho-ui-styles')) {
    const style = document.createElement('style');
    style.id = 'wesenho-ui-styles';
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
    #ui-layers-list { display: flex; flex-direction: column; gap: 5px; max-height: 240px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #504945 #1d2021; }
    .ui-layer-card { background: #282828; border: 1px solid #3c3836; padding: 5px 6px; display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
    .ui-layer-card.active-draw { border-color: #b8bb26; background: #2d302a; }
    .layer-card-header { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
    .layer-card-title { font-weight: bold; color: #ebdbb2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; flex: 1; }
    .ui-layer-card.active-draw .layer-card-title { color: #fabd2f; }
    .badge-tag { font-size: 9px; padding: 1px 4px; border-radius: 2px; font-weight: bold; text-transform: uppercase; }
    .badge-draw  { background: #b8bb26; color: #1d2021; }
    .badge-shape { background: #fe8019; color: #1d2021; }
    .badge-tex   { background: #83a598; color: #1d2021; }
    .layer-actions-row { display: flex; align-items: center; gap: 3px; }
    .layer-opacity-row { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #a89984; }
    #toggle-ui { position: absolute; top: 14px; right: 1px; transform: translateX(100%); z-index: 20; background: #282828; color: #ebdbb2; border: 1px solid #504945; border-left: 1px solid #282828; border-radius: 0; padding: 5px 9px; font: inherit; font-size: 11px; cursor: pointer; user-select: none; white-space: nowrap; box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.4); }
    #toggle-ui:hover { background: #3c3836; color: #fabd2f; border-color: #7c6f64; }
    #ui-panel.hidden { width: 0 !important; border-right: none !important; }
    #ui-panel.hidden > *:not(#toggle-ui) { display: none !important; }
    /* ── Mobile Unified Bottom Dock & Drawer Tabs ── */
    #bottom-dock { display: none; }
    @media (max-width: 768px), (max-aspect-ratio: 3/4) {
      #layout { flex-direction: column; position: relative; height: 100vh; overflow: hidden; }
      #cvswrap { order: 1; flex: 1; width: 100%; min-height: 0; position: relative; overflow: hidden; }
      #toggle-ui, #toggle-panel { display: none !important; }
      #bottom-dock { display: flex; flex-direction: column; order: 2; width: 100%; background: #1d2021; border-top: 1px solid #3c3836; z-index: 25; flex-shrink: 0; }
      #bottom-dock-handle { width: 100%; height: 12px; cursor: row-resize; display: flex; align-items: center; justify-content: center; touch-action: none; }
      #bottom-dock-handle::after { content: ''; width: 38px; height: 4px; background: #504945; border-radius: 2px; }
      #bottom-dock-tabs { display: flex; align-items: stretch; height: 36px; padding: 0 6px 6px 6px; gap: 6px; }
      .dock-tab-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; font: inherit; font-size: 11px; font-weight: bold; background: #282828; color: #a89984; border: 1px solid #3c3836; border-radius: 4px; cursor: pointer; user-select: none; touch-action: manipulation; }
      .dock-tab-btn:hover { background: #32302f; color: #ebdbb2; }
      .dock-tab-btn.active { background: #3c3836; color: #fabd2f; border-color: #fabd2f; }
      .dock-close-btn { flex: 0 0 36px; color: #928374; display: none; font-size: 13px; }
      .dock-close-btn.visible { display: flex; }
      #ui-panel, #panel { order: 3; width: 100% !important; border: none !important; background: #1d2021; flex-shrink: 0; }
      #ui-panel { height: var(--mobile-drawer-height, 42vh); max-height: 75vh; min-height: 120px; display: flex; flex-direction: column; border-top: 1px solid #3c3836 !important; }
      #panel { height: var(--mobile-drawer-height, 42vh); max-height: 75vh; min-height: 120px; display: flex; flex-direction: column; border-top: 1px solid #3c3836 !important; }
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
        <summary>TOOLS &amp; PRESETS</summary>
        <div class="ui-group-content">
          <div class="ui-control">
            <div class="ui-label-row"><span>Brush Preset</span></div>
            <div class="ui-row-gap">
              <select id="ui-select-preset" class="ui-select"></select>
              <button id="ui-btn-save-preset" class="ui-mini-btn" title="Save current brush as preset">+ Save</button>
              <button id="ui-btn-del-preset" class="ui-mini-btn" title="Delete custom preset">&#x2715;</button>
            </div>
          </div>
          <div class="ui-grid-3">
            <button class="ui-btn tool-btn active" data-tool="brush" title="Brush (Draw)">Brush</button>
            <button class="ui-btn tool-btn" data-tool="eraser" title="Eraser">Eraser</button>
            <button class="ui-btn tool-btn" data-tool="smudge" title="Smudge">Smudge</button>
            <button class="ui-btn tool-btn" data-tool="blend" title="Blend / Wet Mix">Blend</button>
            <button class="ui-btn tool-btn" data-tool="fill" title="Flood Fill">Fill</button>
            <button class="ui-btn tool-btn" data-tool="lasso_fill" title="Lasso Fill">Lasso</button>
          </div>
        </div>
      </details>
      <details class="ui-group" open>
        <summary>BRUSH PARAMETERS</summary>
        <div class="ui-group-content">
          <div class="ui-control">
            <div class="ui-label-row"><span>Size</span><span id="ui-val-size" class="ui-val">16</span></div>
            <input type="range" id="ui-slider-size" min="1" max="500" value="16">
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
            <div class="ui-label-row"><span>Smoothing</span><span id="ui-val-smoothing" class="ui-val">0%</span></div>
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
            <div class="ui-label-row"><span>Fill Tolerance</span><span id="ui-val-tolerance" class="ui-val">32</span></div>
            <input type="range" id="ui-slider-tolerance" min="0" max="255" value="32">
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
            <div class="ui-label-row"><span>Swatches (click to pick, hover [x] to delete)</span></div>
            <div id="ui-swatches-grid" class="ui-swatches-grid"></div>
          </div>
        </div>
      </details>
      <details class="ui-group" open>
        <summary>LAYERS (CANVAS &amp; SHAPES)</summary>
        <div class="ui-group-content">
          <div class="ui-row-between">
            <span style="font-size:10px; color:#a89984;">Manage &amp; Assign:</span>
            <div class="ui-row-gap">
              <button id="ui-btn-import-layer" class="ui-mini-btn" title="Import image as new layer">+ Import</button>
              <button id="ui-btn-add-layer" class="ui-mini-btn" title="Add new layer">+ New Layer</button>
              <button id="ui-btn-clear-layer" class="ui-mini-btn" title="Clear active layer">Clear</button>
            </div>
          </div>
          <div id="ui-layers-list"></div>
          <!-- Layer Resizer -->
          <div class="ui-control" style="margin-top: 6px; border-top: 1px solid #3c3836; padding-top: 6px;">
            <div class="ui-label-row">
              <span>Resize Active Layer:</span>
              <span id="ui-val-layer-size" class="ui-val">640 x 480</span>
            </div>
            <div class="ui-row-gap" style="margin-top: 4px;">
              <input type="number" id="ui-layer-w" class="ui-input-num" value="640" min="1" max="16384" style="width: 62px;" placeholder="W" title="Layer Width (px)">
              <span style="color: #a89984;">×</span>
              <input type="number" id="ui-layer-h" class="ui-input-num" value="480" min="1" max="16384" style="width: 62px;" placeholder="H" title="Layer Height (px)">
              <label style="font-size: 10px; color: #ebdbb2; display: flex; align-items: center; gap: 3px; cursor: pointer;" title="Resample / Scale contents instead of cropping">
                <input type="checkbox" id="ui-layer-resample" checked> Scale
              </label>
              <button id="ui-btn-resize-layer" class="ui-mini-btn" style="flex: 1;">Resize</button>
            </div>
          </div>
        </div>
      </details>
      <details class="ui-group">
        <summary>CANVAS RESOLUTION</summary>
        <div class="ui-group-content">
          <div class="ui-label-row">
            <span>Dimensions:</span>
            <span id="ui-val-canvas-size" class="ui-val">640 x 480</span>
          </div>
          <div class="ui-row-gap" style="margin-top: 4px;">
            <input type="number" id="ui-canvas-w" class="ui-input-num" value="640" min="1" max="16384" style="width: 65px;" title="Width (px)">
            <span style="color: #a89984;">×</span>
            <input type="number" id="ui-canvas-h" class="ui-input-num" value="480" min="1" max="16384" style="width: 65px;" title="Height (px)">
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
      <details class="ui-group">
        <summary>FILTERS &amp; EXPORT</summary>
        <div class="ui-group-content">
          <div class="ui-control">
            <div class="ui-label-row"><span>Filter Plugin</span></div>
            <div class="ui-row-gap">
              <select id="ui-select-filter" class="ui-select" style="flex:1;">
                <option value="blur">Blur</option>
                <option value="brightness">Brightness</option>
                <option value="contrast">Contrast</option>
                <option value="dither">Dither</option>
                <option value="edge">Edge Detect</option>
                <option value="grayscale">Grayscale</option>
                <option value="invert">Invert</option>
                <option value="noise">Noise</option>
                <option value="pixelate">Pixelate</option>
                <option value="sepia">Sepia</option>
                <option value="threshold">Threshold</option>
              </select>
              <button id="ui-btn-apply-filter" class="ui-btn" style="flex-shrink:0;">Apply</button>
            </div>
          </div>
          <div class="ui-grid-2" style="margin-top: 4px;">
            <button id="ui-btn-export" class="ui-btn" title="Export composite drawing as PNG">Export PNG</button>
            <button id="ui-btn-import" class="ui-btn" title="Import image as new layer">Import Image</button>
          </div>
          <input type="file" id="ui-file-input" accept="image/*" style="display: none;" />
        </div>
      </details>
    </div>
  `;

  const layout = document.getElementById('layout') || document.body;
  layout.insertBefore(panel, layout.firstChild);
  if (typeof setupDraggableTab === 'function') {
    setupDraggableTab('ui-panel', 'toggle-ui', 'left', 'wesenho_ui_width');
  }
}

main().catch(e => { console.error(e); log(`BOOT ERROR: ${e.message}`, 'err'); });

