/**
 * src/host-browser.js — Wesenho browser host
 * Reuses all engine logic from src/wesenho.js unchanged.
 * Handles: fetch WASM, canvas events, touch (draw/pan/zoom/rotate), REPL.
 */

const FILTER_NAMES = [
  'blur','brightness','contrast','dither',
  'edge','grayscale','invert','noise',
  'pixelate','sepia','threshold'
];

const canvasEl = document.getElementById('wcanvas');
const ctx      = canvasEl.getContext('2d');
const panelEl   = document.getElementById('panel');
const termEl    = document.getElementById('wterm');
const inputEl   = document.getElementById('wcmd');
const statusEl  = document.getElementById('wstatus');
const toggleBtn = document.getElementById('toggle-panel');

/* ── Boot ── */
async function main() {
  log('Loading canvas.wasm…');
  const host = new WesenhoScreenHost();
  /* canvasRotation: radians, stored on host */
  host.canvasRotation = 0;

  host.sendConsoleLog = (text, color = 0xFF00FF88) =>
    log(text, color === 0xFFFF5555 ? 'err' : 'ok');

  host.canvasActor = await WesenhoModule.fromURL('roms/canvas.wasm', { name: 'canvas' });
  host.canvasActor.exports.w_init(800, 1000);
  host.syncBrushParams(host.canvasActor);
  log('canvas.wasm ready ✓');

  for (const name of FILTER_NAMES) {
    try {
      const mod = await WesenhoModule.fromURL(`plugins/filters/${name}.wasm`, { name });
      host.plugins.set(name, { type: 'filter', module: mod, actor: mod });
    } catch (e) { log(`warn: filter ${name} — ${e.message}`, 'err'); }
  }
  log(`${host.plugins.size} filters loaded ✓`);

  /* ── Canvas sizing + pan management ── */
  let initializedPan = false;
  function resize() {
    const prevW = canvasEl.width;
    const prevH = canvasEl.height;
    canvasEl.width  = canvasEl.parentElement.clientWidth;
    canvasEl.height = canvasEl.parentElement.clientHeight;
    host.windowWidth  = canvasEl.width;
    host.windowHeight = canvasEl.height;
    const cw = host.canvasActor.exports.get_canvas_width();
    const ch = host.canvasActor.exports.get_canvas_height();

    if (!initializedPan) {
      host.panX = (canvasEl.width  - cw * host.zoom) / 2;
      host.panY = (canvasEl.height - ch * host.zoom) / 2;
      initializedPan = true;
    } else {
      host.panX += (canvasEl.width - prevW) / 2;
      host.panY += (canvasEl.height - prevH) / 2;
    }
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── Toggle console panel ── */
  function toggleConsole() {
    const isHidden = panelEl.classList.toggle('hidden');
    if (toggleBtn) {
      toggleBtn.textContent = isHidden ? 'console [show]' : 'console [hide]';
    }
    resize();
    if (!isHidden) inputEl.focus();
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('mousedown', e => e.stopPropagation());
    toggleBtn.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleConsole();
    });
  }

  window.addEventListener('keydown', e => {
    if (e.key === '`' && e.ctrlKey) {
      toggleConsole();
      e.preventDefault();
    }
  });

  /* ── Render loop ── */
  let imgData = null;
  function frame() {
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
      host.sendStroke(x, y, x, y, 0, host.strokeIsEraser, host.currentColor);
    } else if (touch.drawing) {
      /* second finger landed mid-stroke — end stroke, switch to gesture */
      host.sendStroke(host.strokePrevX, host.strokePrevY,
                      host.strokePrevX, host.strokePrevY,
                      2, host.strokeIsEraser, host.currentColor);
      touch.drawing = false;
    }
    touch.prevTouches = e.touches;
  }, { passive: false });

  canvasEl.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && touch.drawing) {
      const { x, y } = touchDocPos(e.touches[0]);
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
    /* intercept process.stdout.write for list commands */
    const origWrite = typeof process !== 'undefined' ? process.stdout.write : null;
    if (origWrite) process.stdout.write = s => lines.push(String(s));
    host.executeCommand(raw);
    console.log = origLog;
    if (origWrite) process.stdout.write = origWrite;
    lines.forEach(l => { const c = l.trim().replace(/\x1b\[[^m]*m/g, ''); if (c) log(c); });
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

main().catch(e => { console.error(e); log(`BOOT ERROR: ${e.message}`, 'err'); });
