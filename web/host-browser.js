/**
 * host-browser.js — Wesenho browser host
 * Replaces: initWindow(), setupRepl(), renderFrame(), main(), discoverModules()
 * Reuses:   everything in wesenho.js (WesenhoModule, WesenhoScreenHost, engine logic)
 *
 * Load order in index.html:
 *   <script src="../src/wesenho.js"></script>
 *   <script src="host-browser.js"></script>
 */

const FILTER_NAMES = [
  'blur','brightness','contrast','dither',
  'edge','grayscale','invert','noise',
  'pixelate','sepia','threshold'
];

const canvasEl = document.getElementById('wcanvas');
const ctx      = canvasEl.getContext('2d');
const termEl   = document.getElementById('wterm');
const inputEl  = document.getElementById('wcmd');
const statusEl = document.getElementById('wstatus');

/* ── Boot ── */
async function main() {
  log('Loading canvas.wasm…');
  const host = new WesenhoScreenHost();

  host.sendConsoleLog = (text, color = 0xFF00FF88) =>
    log(text, color === 0xFFFF5555 ? 'err' : 'ok');

  host.canvasActor = await WesenhoModule.fromURL('../roms/canvas.wasm', { name: 'canvas' });
  host.canvasActor.exports.w_init(800, 1000);
  host.syncBrushParams(host.canvasActor);
  log('canvas.wasm ready ✓');

  for (const name of FILTER_NAMES) {
    try {
      const mod = await WesenhoModule.fromURL(`../plugins/filters/${name}.wasm`, { name });
      host.plugins.set(name, { type: 'filter', module: mod, actor: mod });
    } catch (e) { log(`warn: filter ${name} — ${e.message}`, 'err'); }
  }
  log(`${host.plugins.size} filters loaded ✓`);

  /* ── Canvas sizing ── */
  function resize() {
    canvasEl.width  = canvasEl.parentElement.clientWidth;
    canvasEl.height = canvasEl.parentElement.clientHeight;
    host.windowWidth  = canvasEl.width;
    host.windowHeight = canvasEl.height;
    const cw = host.canvasActor.exports.get_canvas_width();
    const ch = host.canvasActor.exports.get_canvas_height();
    host.panX = (canvasEl.width  - cw * host.zoom) / 2;
    host.panY = (canvasEl.height - ch * host.zoom) / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── Render loop ── */
  let imgData = null;
  function frame() {
    if (host.canvasActor.exports.w_render) host.canvasActor.exports.w_render();
    const cw = host.canvasActor.exports.get_canvas_width();
    const ch = host.canvasActor.exports.get_canvas_height();
    const ptr = host.canvasActor.exports.get_composite_pixels();
    if (ptr && cw > 0 && ch > 0) {
      ctx.fillStyle = '#181818';
      ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
      if (!imgData || imgData.width !== cw || imgData.height !== ch)
        imgData = ctx.createImageData(cw, ch);
      imgData.data.set(new Uint8Array(host.canvasActor.memory.buffer, ptr, cw * ch * 4));
      const tmp = new OffscreenCanvas(cw, ch);
      tmp.getContext('2d').putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, host.panX, host.panY, cw * host.zoom, ch * host.zoom);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ── Mouse helpers ── */
  function docPos(e) {
    const r = canvasEl.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    return { cx, cy, x: (cx - host.panX) / host.zoom, y: (cy - host.panY) / host.zoom };
  }

  canvasEl.addEventListener('contextmenu', e => e.preventDefault());

  canvasEl.addEventListener('mousedown', e => {
    const { cx, cy, x, y } = docPos(e);
    host.mouseState.x = cx; host.mouseState.y = cy;
    if (e.button === 1) {
      host.isPanning = true; host.panStartX = cx; host.panStartY = cy;
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
    const { cx, cy, x, y } = docPos(e);
    host.mouseState.x = cx; host.mouseState.y = cy;
    if (host.isPanning) {
      host.panX += cx - host.panStartX; host.panY += cy - host.panStartY;
      host.panStartX = cx; host.panStartY = cy;
    } else if (host.isDrawingOnCanvas && (host.mouseState.buttons & 3)) {
      host.sendStroke(x, y, host.strokePrevX, host.strokePrevY, 1, host.strokeIsEraser, host.currentColor);
      host.strokePrevX = x; host.strokePrevY = y;
    }
    statusEl.textContent = `${host.canvasActor.exports.get_canvas_width()}x${host.canvasActor.exports.get_canvas_height()}  ${Math.round(x)},${Math.round(y)}  ${(host.zoom*100).toFixed(0)}%`;
  });

  canvasEl.addEventListener('mouseup', e => {
    if (e.button === 1) { host.isPanning = false; }
    else {
      host.mouseState.buttons &= ~(e.button === 0 ? 1 : 2);
      if (!(host.mouseState.buttons & 3) && host.isDrawingOnCanvas) {
        host.sendStroke(host.strokePrevX, host.strokePrevY, host.strokePrevX, host.strokePrevY, 2, host.strokeIsEraser, host.currentColor);
        host.isDrawingOnCanvas = false;
      }
    }
  });

  canvasEl.addEventListener('wheel', e => {
    const { cx, cy } = docPos(e);
    const f = e.deltaY < 0 ? 1.15 : 0.85, old = host.zoom;
    host.zoom = Math.max(0.05, Math.min(20, host.zoom * f));
    host.panX = cx - (cx - host.panX) * (host.zoom / old);
    host.panY = cy - (cy - host.panY) * (host.zoom / old);
    e.preventDefault();
  }, { passive: false });

  /* ── Touch support ── */
  let lt = null;
  canvasEl.addEventListener('touchstart', e => {
    e.preventDefault();
    const r = canvasEl.getBoundingClientRect();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const x = (t.clientX - r.left - host.panX) / host.zoom;
      const y = (t.clientY - r.top  - host.panY) / host.zoom;
      host.isDrawingOnCanvas = true;
      host.strokePrevX = x; host.strokePrevY = y;
      host.strokeIsEraser = host.currentTool === 1 ? 1 : 0;
      host.sendStroke(x, y, x, y, 0, host.strokeIsEraser, host.currentColor);
    }
    lt = e.touches;
  }, { passive: false });

  canvasEl.addEventListener('touchmove', e => {
    e.preventDefault();
    const r = canvasEl.getBoundingClientRect();
    if (e.touches.length === 1 && host.isDrawingOnCanvas) {
      const t = e.touches[0];
      const x = (t.clientX - r.left - host.panX) / host.zoom;
      const y = (t.clientY - r.top  - host.panY) / host.zoom;
      host.sendStroke(x, y, host.strokePrevX, host.strokePrevY, 1, host.strokeIsEraser, host.currentColor);
      host.strokePrevX = x; host.strokePrevY = y;
    } else if (e.touches.length === 2 && lt?.length === 2) {
      const pan = [(e.touches[0].clientX - lt[0].clientX + e.touches[1].clientX - lt[1].clientX) / 2,
                   (e.touches[0].clientY - lt[0].clientY + e.touches[1].clientY - lt[1].clientY) / 2];
      host.panX += pan[0]; host.panY += pan[1];
      const prevD = Math.hypot(lt[0].clientX - lt[1].clientX, lt[0].clientY - lt[1].clientY);
      const curD  = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (prevD > 0) {
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
        const old = host.zoom; host.zoom = Math.max(0.05, Math.min(20, host.zoom * curD / prevD));
        host.panX = cx - (cx - host.panX) * (host.zoom / old);
        host.panY = cy - (cy - host.panY) * (host.zoom / old);
      }
    }
    lt = e.touches;
  }, { passive: false });

  canvasEl.addEventListener('touchend', e => {
    e.preventDefault();
    if (!e.touches.length && host.isDrawingOnCanvas) {
      host.sendStroke(host.strokePrevX, host.strokePrevY, host.strokePrevX, host.strokePrevY, 2, host.strokeIsEraser, host.currentColor);
      host.isDrawingOnCanvas = false;
    }
    lt = e.touches;
  }, { passive: false });

  /* ── REPL ── */
  const history = [], hl = { i: -1 };

  /* Intercept process.stdout.write for list/get commands */
  const _origWrite = typeof process !== 'undefined' ? process.stdout.write.bind(process.stdout) : null;

  function runCmd(raw) {
    raw = raw.trim();
    if (!raw) return;
    log(`> ${raw}`, 'cmd');
    history.push(raw); hl.i = -1;
    /* capture console.log output from list/get commands */
    const lines = [];
    const origLog = console.log;
    console.log = (...a) => { lines.push(a.map(String).join(' ')); };
    if (_origWrite) {
      process.stdout.write = (s) => { lines.push(String(s).replace(/\x1b\[[^m]*m/g, '')); };
    }
    host.executeCommand(raw);
    console.log = origLog;
    if (_origWrite) process.stdout.write = _origWrite;
    lines.forEach(l => { if (l.trim()) log(l.trim()); });
  }

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { runCmd(inputEl.value); inputEl.value = ''; e.preventDefault(); }
    else if (e.key === 'ArrowUp')   { hl.i = Math.min(hl.i + 1, history.length - 1); inputEl.value = history[history.length - 1 - hl.i] || ''; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { hl.i = Math.max(hl.i - 1, -1); inputEl.value = hl.i < 0 ? '' : history[history.length - 1 - hl.i] || ''; e.preventDefault(); }
  });

  log('Ready — left=draw  right=erase  middle/2-finger=pan  scroll=zoom');
  statusEl.textContent = 'ready';
}

function log(msg, cls = '') {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  el.textContent = String(msg).replace(/\x1b\[[^m]*m/g, ''); /* strip ANSI */
  termEl.appendChild(el);
  termEl.scrollTop = termEl.scrollHeight;
}

main().catch(e => { console.error(e); log(`BOOT ERROR: ${e.message}`, 'err'); });
