/**
 * =========================================================================
 * Raster Per-Layer Frame-by-Frame Animation Timeline Dock Widget
 * (src/anim/raster_animator_ui.js)
 * Features:
 * - Multi-layer timeline tracks (each layer has its own independent cel track)
 * - Unlimited frame hold duration (numeric input, +/- buttons, drag right edge
 *   of any cel card, or right-click custom duration)
 * - Shared time/tick ruler for scrubbing across all layers simultaneously
 * - Collapsible Onion Skin configuration bar & GIF/WebM export
 * =========================================================================
 */

const TICK_COL_WIDTH = 38;
const TICK_GAP = 3;
const TICK_STEP = TICK_COL_WIDTH + TICK_GAP; // 41px per frame hold tick

function getCelCardWidth(duration) {
  const d = Math.max(1, Math.round(Number(duration) || 1));
  return d * TICK_STEP - TICK_GAP;
}

export class RasterAnimatorUI {
  constructor(containerEl, animator, options = {}) {
    this.container = containerEl;
    this.animator = animator;
    this.options = options;
    this.visible = !!(typeof window !== 'undefined' && (window.isDockviewPainter || containerEl?.closest?.('#dock-panel-timeline')));
    this.collapsed = false;
    this.onionSettingsOpen = false;
    this._thumbCache = new Map();

    this._ensurePerLayerAnimator(this.animator);
    this.render();
    this.bindEvents();
    this.updateTimeline();

    this._unsub = this.animator.subscribe((event, data) => {
      this.handleAnimatorEvent(event, data);
    });
  }

  _ensurePerLayerAnimator(anim) {
    if (!anim) return;
    if (!anim.layerTracks) anim.layerTracks = new Map();
    if (typeof anim.getDrawingLayerIds !== 'function') {
      anim.getDrawingLayerIds = function () {
        const exp = this.host?.canvasActor?.exports;
        if (!exp) return [3];
        const cnt = exp.w_layer_get_order_count ? exp.w_layer_get_order_count() : 0;
        const texIds = (typeof this.host.getTextureWasmIds === 'function') ? this.host.getTextureWasmIds() : new Set();
        const ids = [];
        for (let p = 0; p < cnt; p++) {
          const id = exp.w_layer_get_order(p);
          if (id >= 3 && !texIds.has(id)) ids.push(id);
        }
        return ids.length ? ids : [3];
      };
    }
    if (typeof anim.getActiveLayerId !== 'function') {
      anim.getActiveLayerId = function () {
        const exp = this.host?.canvasActor?.exports;
        const fn = exp?.get_active_layer || exp?.w_layer_get_active;
        const id = typeof fn === 'function' ? fn() : 3;
        return id >= 3 ? id : 3;
      };
    }
    if (typeof anim.getLayerName !== 'function') {
      anim.getLayerName = function (lid) {
        return this.host?.layerNames?.get(lid) || (lid === 3 ? 'Background' : `Layer ${lid}`);
      };
    }
    if (typeof anim.syncLayersWithCanvas !== 'function') {
      anim.syncLayersWithCanvas = function () {
        const ids = this.getDrawingLayerIds();
        for (const lid of ids) {
          if (!this.layerTracks.has(lid)) {
            this.layerTracks.set(lid, {
              layerId: lid,
              frames: Array.isArray(this.frames) && this.frames.length
                ? this.frames.map((f, i) => ({
                    id: f.id || `cel_${lid}_${i + 1}`,
                    layerId: lid,
                    name: f.name || `Frame ${i + 1}`,
                    duration: Math.max(1, Number(f.duration) || 1),
                    width: f.layers?.get?.(lid)?.width || this.docWidth,
                    height: f.layers?.get?.(lid)?.height || this.docHeight,
                    pixels: f.layers?.get?.(lid)?.pixels || new Uint8Array(this.docWidth * this.docHeight * 4),
                    visible: 1,
                    opacity: 255
                  }))
                : [{ id: `cel_${lid}_1`, layerId: lid, name: 'Frame 1', duration: 1, width: this.docWidth, height: this.docHeight, pixels: new Uint8Array(this.docWidth * this.docHeight * 4), visible: 1, opacity: 255 }],
              activeCelIndex: this.currentFrameIndex || 0
            });
          }
        }
      };
    }
    if (typeof anim.getLayerTrack !== 'function') {
      anim.getLayerTrack = function (lid = this.getActiveLayerId()) {
        this.syncLayersWithCanvas();
        return this.layerTracks.get(lid) || { layerId: lid, frames: this.frames || [], activeCelIndex: this.currentFrameIndex || 0 };
      };
    }
    if (typeof anim.getLayerDurationTicks !== 'function') {
      anim.getLayerDurationTicks = function (lid) {
        const tr = this.getLayerTrack(lid);
        return Math.max(1, (tr?.frames || []).reduce((acc, f) => acc + Math.max(1, Math.round(Number(f.duration) || 1)), 0));
      };
    }
    if (typeof anim.getTotalDurationTicks !== 'function') {
      anim.getTotalDurationTicks = function () {
        this.syncLayersWithCanvas();
        let m = 1;
        for (const lid of this.layerTracks.keys()) {
          m = Math.max(m, this.getLayerDurationTicks(lid));
        }
        return m;
      };
    }
    if (typeof anim.goToTick !== 'function') {
      anim.goToTick = function (tick) {
        this.currentTick = Math.max(0, Math.round(tick || 0));
        if (typeof this.goToFrame === 'function') {
          this.goToFrame(Math.min(this.currentTick, Math.max(0, (this.frames?.length || 1) - 1)));
        }
      };
    }
    if (typeof anim.selectLayerCel !== 'function') {
      anim.selectLayerCel = function (layerId, celIndex) {
        const exp = this.host?.canvasActor?.exports;
        if (exp?.w_layer_select) exp.w_layer_select(layerId);
        const tr = this.getLayerTrack(layerId);
        if (tr) tr.activeCelIndex = Math.max(0, Math.min(celIndex, tr.frames.length - 1));
        if (typeof this.goToFrame === 'function') this.goToFrame(celIndex);
      };
    }
  }

  syncUI() {
    this.updateTimeline();
  }

  show() {
    this.visible = true;
    this.container.style.display = 'flex';
    if (typeof window !== 'undefined' && window.isDockviewPainter && typeof window.openPainterDockPanel === 'function') {
      window.openPainterDockPanel('timeline', true);
    }
    this.updateTimeline();
  }

  hide() {
    if (typeof window !== 'undefined' && (window.isDockviewPainter || this.container?.closest?.('#dock-panel-timeline'))) {
      if (this.animator.isPlaying) this.animator.stop();
      return;
    }
    this.visible = false;
    this.container.style.display = 'none';
    if (this.animator.isPlaying) {
      this.animator.stop();
    }
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  render() {
    this.container.innerHTML = `
      <div class="raster-anim-dock" style="display: flex; flex-direction: column; width: 100%; height: 100%; background: var(--bg-panel); color: var(--text); font-family: var(--font-sans); font-size: 10px; user-select: none; box-sizing: border-box; position: relative; overflow: hidden;">
        
        <!-- TIER 1: Compact Single-Line Toolbar -->
        <div class="raster-anim-bar" style="display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 2px 6px; min-height: 24px; background: var(--bg-panel-sub); border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; flex-shrink: 0;">
          
          <!-- Left: Playhead Counter & Transport Controls -->
          <div style="display: flex; align-items: center; gap: 2px; flex-shrink: 0;">
            <span id="raster-frame-counter" style="font-weight: 800; font-family: var(--font-mono); font-size: 9px; color: var(--primary); background: var(--bg-dark); border: 1px solid var(--border); border-radius: 2px; padding: 1px 5px; min-width: 48px; text-align: center;" title="Current Tick / Total Ticks">T 1/1</span>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-first" title="First Tick" style="min-width: 18px; height: 19px; padding: 0 3px; font-size: 9px;">⏮</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-prev" title="Previous Cel (,)" style="min-width: 18px; height: 19px; padding: 0 4px; font-size: 9px;">◀</button>
            <button type="button" class="ip-btn ip-mini-btn raster-btn-play" id="raster-btn-play" title="Play / Pause (Space)" style="min-width: 24px; height: 19px; padding: 0 6px; background: var(--primary); color: var(--bg-dark); font-weight: 800; font-size: 9.5px;">▶</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-next" title="Next Cel (.)" style="min-width: 18px; height: 19px; padding: 0 4px; font-size: 9px;">▶</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-last" title="Last Tick" style="min-width: 18px; height: 19px; padding: 0 3px; font-size: 9px;">⏭</button>
            <button type="button" class="ip-btn ip-mini-btn active" id="raster-btn-loop" title="Loop Playback" style="height: 19px; padding: 0 5px; font-size: 9px; font-weight: 700;">Loop</button>
          </div>

          <!-- Center: Active Layer Cel Actions + Unlimited Hold Duration -->
          <div style="display: flex; align-items: center; gap: 2px; flex-shrink: 0;">
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-add-layer" title="New Layer" style="height: 19px; padding: 0 5px; font-size: 9px; font-weight: 700; background: var(--bg-panel); color: var(--text);">+Layer</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-add-group" title="New Folder / Group" style="height: 19px; padding: 0 4px; font-size: 9px; background: var(--bg-panel); color: var(--text);">+Group</button>

            <div style="width: 1px; height: 13px; background: var(--border); margin: 0 2px;"></div>

            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-add" title="Add Blank Cel (+)" style="height: 19px; padding: 0 6px; font-size: 9px; font-weight: 800; background: var(--primary); color: var(--bg-dark);">+Cel</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-dup" title="Duplicate Cel" style="height: 19px; padding: 0 5px; font-size: 9px;">Dup</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-move-left" title="Move Cel Left" style="height: 19px; padding: 0 4px; font-size: 9px;">←</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-move-right" title="Move Cel Right" style="height: 19px; padding: 0 4px; font-size: 9px;">→</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-clear" title="Clear Cel Pixels" style="height: 19px; padding: 0 5px; font-size: 9px;">Clr</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-del" title="Delete Cel" style="height: 19px; padding: 0 5px; font-size: 9px; color: var(--danger);">Del</button>

            <div style="width: 1px; height: 13px; background: var(--border); margin: 0 2px;"></div>

            <div style="display: flex; align-items: center; gap: 2px;" title="Frame Hold Duration (in frames)">
              <span style="font-size: 8.5px; color: var(--text-muted); font-weight: 700;">Dur</span>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-hold-dec" title="-1 Frame" style="min-width: 17px; height: 19px; padding: 0 3px; font-size: 10px; font-weight: 800;">−</button>
              <input type="number" id="raster-hold-input" min="1" step="1" value="1" style="width: 36px; height: 19px; background: var(--bg-dark); color: var(--primary); border: 1px solid var(--border); border-radius: 2px; font-family: var(--font-mono); font-size: 9.5px; font-weight: 800; text-align: center; padding: 0 1px;" title="Frame duration (unlimited)">
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-hold-inc" title="+1 Frame" style="min-width: 17px; height: 19px; padding: 0 3px; font-size: 10px; font-weight: 800;">+</button>
            </div>
          </div>

          <!-- Right: Onion Skin, FPS, Export -->
          <div style="display: flex; align-items: center; gap: 3px; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 1px;">
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-onionskin" title="Toggle Onion Skin (O)" style="height: 19px; padding: 0 5px; font-size: 9px; font-weight: 700;">Onion</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-onion-cfg" title="Onion Skin Settings" style="height: 19px; padding: 0 4px; font-size: 8px;">▾</button>
            </div>

            <div style="display: flex; align-items: center; gap: 3px; background: var(--bg-dark); padding: 1px 4px; border-radius: 2px; border: 1px solid var(--border);" title="Playback Frame Rate (FPS)">
              <span style="font-size: 8.5px; color: var(--text-muted); font-weight: 700;">FPS</span>
              <input type="range" id="raster-fps-slider" min="1" max="60" value="12" style="width: 42px; height: 4px; cursor: pointer; accent-color: var(--primary);">
              <span id="raster-fps-val" style="font-family: var(--font-mono); font-size: 9px; font-weight: 800; color: var(--primary); min-width: 14px; text-align: right;">12</span>
            </div>
          </div>
        </div>

        <!-- COLLAPSIBLE ONION SKIN CONFIGURATION ROW -->
        <div id="raster-onion-settings-row" style="display: none; align-items: center; justify-content: flex-start; gap: 10px; padding: 2px 8px; background: var(--bg-dark); border-bottom: 1px solid var(--border); font-size: 9px; flex-wrap: wrap; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="color: #fb4934; font-weight: 700;">Past</span>
            <input type="range" id="raster-onion-prev" min="0" max="5" value="2" style="width: 45px; height: 4px; accent-color: #fb4934;">
            <span id="raster-onion-prev-val" style="font-family: var(--font-mono);">2</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="color: #83a598; font-weight: 700;">Next</span>
            <input type="range" id="raster-onion-next" min="0" max="5" value="1" style="width: 45px; height: 4px; accent-color: #83a598;">
            <span id="raster-onion-next-val" style="font-family: var(--font-mono);">1</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="color: var(--text-muted); font-weight: 700;">Alpha</span>
            <input type="range" id="raster-onion-opacity" min="10" max="85" value="35" style="width: 50px; height: 4px; accent-color: var(--primary);">
            <span id="raster-onion-op-val" style="font-family: var(--font-mono); color: var(--primary);">35%</span>
          </div>
        </div>

        <!-- TIER 2: Multi-Layer Timeline Tracks (Scrollable X & Y) -->
        <div id="raster-tier2-body" style="flex: 1; display: flex; flex-direction: column; background: var(--bg-dark); overflow: auto; position: relative;">
          <div id="raster-filmstrip" style="display: flex; flex-direction: column; min-width: max-content; width: 100%;"></div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const btnFirst = this.container.querySelector('#raster-btn-first');
    const btnPlay = this.container.querySelector('#raster-btn-play');
    const btnPrev = this.container.querySelector('#raster-btn-prev');
    const btnNext = this.container.querySelector('#raster-btn-next');
    const btnLast = this.container.querySelector('#raster-btn-last');
    const btnLoop = this.container.querySelector('#raster-btn-loop');
    const btnOnion = this.container.querySelector('#raster-btn-onionskin');
    const btnOnionCfg = this.container.querySelector('#raster-btn-onion-cfg');
    const onionRow = this.container.querySelector('#raster-onion-settings-row');
    const onionPrev = this.container.querySelector('#raster-onion-prev');
    const onionNext = this.container.querySelector('#raster-onion-next');
    const onionOp = this.container.querySelector('#raster-onion-opacity');

    const btnAddLayer = this.container.querySelector('#raster-btn-add-layer');
    const btnAddGroup = this.container.querySelector('#raster-btn-add-group');
    const btnAdd = this.container.querySelector('#raster-btn-add');
    const btnDup = this.container.querySelector('#raster-btn-dup');
    const btnHoldDec = this.container.querySelector('#raster-btn-hold-dec');
    const btnHoldInc = this.container.querySelector('#raster-btn-hold-inc');
    const holdInput = this.container.querySelector('#raster-hold-input');
    const btnMoveL = this.container.querySelector('#raster-btn-move-left');
    const btnMoveR = this.container.querySelector('#raster-btn-move-right');
    const btnClear = this.container.querySelector('#raster-btn-clear');
    const btnDel = this.container.querySelector('#raster-btn-del');
    const fpsSlider = this.container.querySelector('#raster-fps-slider');

    btnFirst?.addEventListener('click', () => {
      this.animator.goToTick(0);
    });

    btnPlay?.addEventListener('click', () => {
      this.animator.togglePlay();
    });

    btnPrev?.addEventListener('click', () => {
      this.animator.prevFrame();
    });

    btnNext?.addEventListener('click', () => {
      this.animator.nextFrame();
    });

    btnLast?.addEventListener('click', () => {
      const total = this.animator.getTotalDurationTicks ? this.animator.getTotalDurationTicks() : this.animator.frames.length;
      this.animator.goToTick(Math.max(0, total - 1));
    });

    btnLoop?.addEventListener('click', () => {
      this.animator.loop = !this.animator.loop;
      btnLoop.classList.toggle('active', this.animator.loop);
    });

    btnOnion?.addEventListener('click', () => {
      this.animator.toggleOnionSkin();
      btnOnion.classList.toggle('active', this.animator.onionSkin.enabled);
    });

    btnOnionCfg?.addEventListener('click', () => {
      this.onionSettingsOpen = !this.onionSettingsOpen;
      if (onionRow) onionRow.style.display = this.onionSettingsOpen ? 'flex' : 'none';
      btnOnionCfg.classList.toggle('active', this.onionSettingsOpen);
    });

    onionPrev?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.animator.onionSkin.prevFrames = v;
      const lbl = this.container.querySelector('#raster-onion-prev-val');
      if (lbl) lbl.textContent = String(v);
      if (!this.animator.onionSkin.enabled && v > 0) this.animator.toggleOnionSkin(true);
      this.animator.host?.render?.();
    });

    onionNext?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.animator.onionSkin.nextFrames = v;
      const lbl = this.container.querySelector('#raster-onion-next-val');
      if (lbl) lbl.textContent = String(v);
      if (!this.animator.onionSkin.enabled && v > 0) this.animator.toggleOnionSkin(true);
      this.animator.host?.render?.();
    });

    onionOp?.addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10) || 35;
      this.animator.onionSkin.opacity = pct / 100;
      const lbl = this.container.querySelector('#raster-onion-op-val');
      if (lbl) lbl.textContent = `${pct}%`;
      this.animator.host?.render?.();
    });

    btnAddLayer?.addEventListener('click', () => {
      const h = this.animator.host;
      if (h?.runCmd) h.runCmd('layer add');
      else if (h?.executeCommand) { h.executeCommand('layer add'); h.syncUiFromHost?.(); }
      else if (h?.canvasActor?.exports?.w_layer_add) {
        h.canvasActor.exports.w_layer_add();
        h.syncUiFromHost?.();
      }
    });

    btnAddGroup?.addEventListener('click', () => {
      const h = this.animator.host;
      if (h?.runCmd) h.runCmd('group create');
      else if (h?.executeCommand) { h.executeCommand('group create'); h.syncUiFromHost?.(); }
      else if (h?.createGroup) {
        h.createGroup();
        h.syncUiFromHost?.();
      }
    });

    btnAdd?.addEventListener('click', () => {
      this.animator.addFrame(false);
    });

    btnDup?.addEventListener('click', () => {
      this.animator.addFrame(true);
    });

    const applyDurationChange = (newDuration) => {
      const d = Math.max(1, Math.round(Number(newDuration) || 1));
      this.animator.setFrameDuration(d);
      if (holdInput) holdInput.value = String(d);
    };

    btnHoldDec?.addEventListener('click', () => {
      const activeLid = this.animator.getActiveLayerId ? this.animator.getActiveLayerId() : 3;
      const activeTrack = this.animator.getLayerTrack ? this.animator.getLayerTrack(activeLid) : null;
      const cur = activeTrack?.frames?.[activeTrack.activeCelIndex] || this.animator.frames?.[this.animator.currentFrameIndex];
      const curDur = cur ? (cur.duration || 1) : 1;
      applyDurationChange(Math.max(1, curDur - 1));
    });

    btnHoldInc?.addEventListener('click', () => {
      const activeLid = this.animator.getActiveLayerId ? this.animator.getActiveLayerId() : 3;
      const activeTrack = this.animator.getLayerTrack ? this.animator.getLayerTrack(activeLid) : null;
      const cur = activeTrack?.frames?.[activeTrack.activeCelIndex] || this.animator.frames?.[this.animator.currentFrameIndex];
      const curDur = cur ? (cur.duration || 1) : 1;
      applyDurationChange(curDur + 1);
    });

    const isMobileDevice = (typeof window !== 'undefined') && (
      ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    );

    if (isMobileDevice && holdInput) {
      holdInput.setAttribute('inputmode', 'none');
      holdInput.readOnly = true;
      holdInput.tabIndex = -1;
      holdInput.style.cursor = 'default';
      holdInput.style.userSelect = 'none';
      holdInput.addEventListener('focus', () => {
        holdInput.blur();
      });
      holdInput.addEventListener('touchstart', (e) => {
        e.preventDefault();
      }, { passive: false });
    }

    holdInput?.addEventListener('change', (e) => {
      applyDurationChange(e.target.value);
    });

    holdInput?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        applyDurationChange(holdInput.value);
        holdInput.blur();
      }
    });

    btnMoveL?.addEventListener('click', () => {
      const idx = this.animator.currentFrameIndex;
      if (idx > 0) this.animator.moveFrame(idx, idx - 1);
    });

    btnMoveR?.addEventListener('click', () => {
      const idx = this.animator.currentFrameIndex;
      if (idx < this.animator.frames.length - 1) this.animator.moveFrame(idx, idx + 1);
    });

    btnClear?.addEventListener('click', () => {
      this.animator.clearCurrentFrame();
      this.updateTimeline();
    });

    btnDel?.addEventListener('click', () => {
      this.animator.deleteFrame();
    });

    fpsSlider?.addEventListener('input', (e) => {
      const fps = parseInt(e.target.value, 10) || 12;
      this.animator.setFps(fps);
      const valEl = this.container.querySelector('#raster-fps-val');
      if (valEl) valEl.textContent = String(fps);
    });

    // Keyboard shortcuts: Space = Play/Pause, ,/. = Prev/Next frame, O = Onion
    window.addEventListener('keydown', (e) => {
      if (!this.visible) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.animator.togglePlay();
      } else if (e.key === ',' || e.key === '<') {
        e.preventDefault();
        this.animator.prevFrame();
      } else if (e.key === '.' || e.key === '>') {
        e.preventDefault();
        this.animator.nextFrame();
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        this.animator.toggleOnionSkin();
        btnOnion?.classList.toggle('active', this.animator.onionSkin.enabled);
      }
    });

    this.container.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.raster-frame-card')) return;
      e.preventDefault();
      e.stopPropagation();
      this.openTimelineContextMenu(e, this.animator.getActiveLayerId(), this.animator.currentFrameIndex);
    });
  }

  openTimelineContextMenu(e, layerId, frameIdx) {
    if (typeof window === 'undefined' || !window.contextMenuService) return;
    const curActiveLid = this.animator.getActiveLayerId ? this.animator.getActiveLayerId() : 3;
    const curTrack = this.animator.getLayerTrack ? this.animator.getLayerTrack(curActiveLid) : null;
    const curCelIdx = curTrack ? curTrack.activeCelIndex : this.animator.currentFrameIndex;

    if (typeof layerId === 'number' && typeof frameIdx === 'number') {
      if (layerId !== curActiveLid || frameIdx !== curCelIdx) {
        this.animator.selectLayerCel(layerId, frameIdx);
      }
    }
    const activeLid = this.animator.getActiveLayerId();
    const track = this.animator.getLayerTrack(activeLid);
    const idx = track ? track.activeCelIndex : 0;
    const total = track ? track.frames.length : 1;
    const curFrame = track?.frames?.[idx];
    const curHold = curFrame?.duration || 1;
    const layerName = this.animator.getLayerName(activeLid);
    const onion = this.animator.onionSkin || { enabled: false, prevFrames: 2, nextFrames: 1, opacity: 0.35 };

    const presetDurations = [1, 2, 3, 4, 6, 8, 12, 16, 24, 36, 48, 60, 100];
    const holdChildren = [
      {
        type: 'slider',
        label: 'Duration (Frames)',
        min: 1,
        max: Math.max(60, curHold + 24),
        step: 1,
        value: curHold,
        unit: 'f',
        onInput: (val) => {
          this.animator.setFrameDuration(val, idx, activeLid);
        }
      },
      { type: 'sep' },
      { type: 'item', label: '+1 Frame', action: () => this.animator.setFrameDuration(curHold + 1, idx, activeLid) },
      { type: 'item', label: '-1 Frame', action: () => this.animator.setFrameDuration(Math.max(1, curHold - 1), idx, activeLid) },
      { type: 'item', label: '+5 Frames', action: () => this.animator.setFrameDuration(curHold + 5, idx, activeLid) },
      { type: 'item', label: '+10 Frames', action: () => this.animator.setFrameDuration(curHold + 10, idx, activeLid) },
      { type: 'sep' },
      ...presetDurations.map(h => ({
        type: 'item',
        label: (curHold === h ? '✓ ' : '') + `${h} ${h === 1 ? 'Frame' : 'Frames'}`,
        action: () => this.animator.setFrameDuration(h, idx, activeLid)
      }))
    ];

    const actions = [
      { type: 'header', title: `${layerName} • Cel #${idx + 1}/${total} (${curHold}f)` },
      {
        type: 'item',
        label: this.animator.isPlaying ? '⏸ Pause Playback' : '▶ Play Animation',
        hotkey: 'Space',
        action: () => this.animator.togglePlay()
      },
      {
        type: 'item',
        label: (this.animator.loop ? '✓ ' : '') + 'Loop Playback',
        action: () => {
          this.animator.loop = !this.animator.loop;
          this.container.querySelector('#raster-btn-loop')?.classList.toggle('active', this.animator.loop);
        }
      },
      {
        type: 'slider',
        label: 'Frame Rate (FPS)',
        min: 1,
        max: 60,
        step: 1,
        value: this.animator.fps || 12,
        unit: ' fps',
        onInput: (val) => {
          this.animator.setFps(val);
        }
      },
      { type: 'sep' },
      { type: 'item', label: `+ Add Blank Cel on "${layerName}"`, action: () => this.animator.addFrame(false, activeLid) },
      { type: 'item', label: `Duplicate Cel on "${layerName}"`, action: () => this.animator.addFrame(true, activeLid) },
      {
        type: 'item',
        label: `Frame Duration: ${curHold} ${curHold === 1 ? 'frame' : 'frames'}`,
        children: holdChildren
      },
      { type: 'item', label: '← Move Cel Left', action: () => { if (idx > 0) this.animator.moveFrame(idx, idx - 1, activeLid); } },
      { type: 'item', label: '→ Move Cel Right', action: () => { if (idx < total - 1) this.animator.moveFrame(idx, idx + 1, activeLid); } },
      { type: 'sep' },
      {
        type: 'item',
        label: 'Onion Skin Settings',
        children: [
          {
            type: 'item',
            label: (onion.enabled ? '✓ ' : '') + 'Enable Onion Skin',
            hotkey: 'O',
            action: () => this.animator.toggleOnionSkin()
          },
          {
            type: 'slider',
            label: 'Past Frames',
            min: 0,
            max: 5,
            step: 1,
            value: onion.prevFrames ?? 2,
            onInput: (v) => {
              this.animator.onionSkin.prevFrames = v;
              if (!this.animator.onionSkin.enabled && v > 0) this.animator.toggleOnionSkin(true);
              this.animator.host?.render?.();
            }
          },
          {
            type: 'slider',
            label: 'Future Frames',
            min: 0,
            max: 5,
            step: 1,
            value: onion.nextFrames ?? 1,
            onInput: (v) => {
              this.animator.onionSkin.nextFrames = v;
              if (!this.animator.onionSkin.enabled && v > 0) this.animator.toggleOnionSkin(true);
              this.animator.host?.render?.();
            }
          },
          {
            type: 'slider',
            label: 'Ghost Opacity',
            min: 10,
            max: 85,
            step: 1,
            value: Math.round((onion.opacity ?? 0.35) * 100),
            unit: '%',
            onInput: (v) => {
              this.animator.onionSkin.opacity = v / 100;
              this.animator.host?.render?.();
            }
          }
        ]
      },
      {
        type: 'item',
        label: 'Export Animation',
        children: [
          { type: 'item', label: 'Export Animated GIF (.gif)', action: () => this.exportGif() },
          { type: 'item', label: 'Export WebM Video (.webm)', action: () => this.exportWebM() }
        ]
      },
      { type: 'sep' },
      {
        type: 'item',
        label: 'Clear Cel Pixels',
        danger: true,
        action: () => {
          this.animator.clearCurrentFrame(activeLid);
          this.updateTimeline();
        }
      },
      {
        type: 'item',
        label: 'Delete Cel',
        danger: true,
        action: () => {
          this.animator.deleteFrame(idx, activeLid);
        }
      }
    ];

    window.contextMenuService.showContextMenu({
      getAnchor: () => ({ x: e.clientX || 160, y: e.clientY || 160 }),
      getActions: () => actions
    });
  }

  async exportGif() {
    if (this.animator.host && typeof this.animator.host.exportAnimatedGif === 'function') {
      return this.animator.host.exportAnimatedGif();
    }
    try {
      const blob = await this.animator.exportGif();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const projName = this.animator.host?.currentProjectName || 'animation';
        const safeName = projName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'animation';
        a.download = `${safeName}.gif`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (typeof uiToast === 'function') {
        uiToast('GIF export failed: ' + err.message, 'danger');
      } else if (typeof alert === 'function') {
        alert('GIF export failed: ' + err.message);
      }
    }
  }

  async exportWebM() {
    if (this.animator.host && typeof this.animator.host.exportWebmVideo === 'function') {
      return this.animator.host.exportWebmVideo();
    }
    try {
      const blob = await this.animator.exportWebM();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const projName = this.animator.host?.currentProjectName || 'animation';
        const safeName = projName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'animation';
        a.download = `${safeName}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (typeof uiToast === 'function') {
        uiToast('WebM export failed: ' + err.message, 'danger');
      } else if (typeof alert === 'function') {
        alert('WebM export failed: ' + err.message);
      }
    }
  }

  handleAnimatorEvent(event, data) {
    if (event === 'frameChange' || event === 'framesUpdated' || event === 'frameContentUpdated') {
      this.updateTimeline();
    } else if (event === 'playState') {
      const btnPlay = this.container.querySelector('#raster-btn-play');
      if (btnPlay) {
        btnPlay.textContent = data.isPlaying ? '⏸' : '▶';
        btnPlay.style.background = data.isPlaying ? 'var(--primary-hover)' : 'var(--primary)';
      }
    } else if (event === 'onionSkinChanged') {
      const btnOnion = this.container.querySelector('#raster-btn-onionskin');
      if (btnOnion) btnOnion.classList.toggle('active', data.enabled);
    } else if (event === 'fpsChanged') {
      const fpsSlider = this.container.querySelector('#raster-fps-slider');
      const valEl = this.container.querySelector('#raster-fps-val');
      if (fpsSlider) fpsSlider.value = String(data.fps);
      if (valEl) valEl.textContent = String(data.fps);
    }
  }

  updateCounter() {
    const counter = this.container.querySelector('#raster-frame-counter');
    const totalTicks = this.animator.getTotalDurationTicks ? this.animator.getTotalDurationTicks() : this.animator.frames.length;
    const curTick = (this.animator.currentTick || 0) + 1;
    if (counter) {
      counter.textContent = `T ${curTick} / ${totalTicks}`;
    }
    const holdInput = this.container.querySelector('#raster-hold-input');
    const activeLid = this.animator.getActiveLayerId ? this.animator.getActiveLayerId() : 3;
    const activeTrack = this.animator.getLayerTrack ? this.animator.getLayerTrack(activeLid) : null;
    const cur = activeTrack?.frames?.[activeTrack.activeCelIndex] || this.animator.frames?.[this.animator.currentFrameIndex];
    if (holdInput && cur && document.activeElement !== holdInput) {
      holdInput.value = String(cur.duration || 1);
    }
  }

  updateTimeline() {
    this.animator.syncLayersWithCanvas?.();
    this.updateCounter();
    const tier2Body = this.container.querySelector('#raster-tier2-body');
    const savedScrollLeft = tier2Body ? tier2Body.scrollLeft : 0;
    const savedScrollTop = tier2Body ? tier2Body.scrollTop : 0;
    const strip = this.container.querySelector('#raster-filmstrip');
    if (!strip) return;

    strip.innerHTML = '';

    const host = this.animator.host;
    const exp = host?.canvasActor?.exports;
    const layerIdsBottomToTop = this.animator.getDrawingLayerIds ? this.animator.getDrawingLayerIds() : [3];
    // Display layers top-to-bottom (matching the Layers panel visual order)
    const layerIdsTopToBottom = [...layerIdsBottomToTop].reverse();
    const activeLayerId = this.animator.getActiveLayerId ? this.animator.getActiveLayerId() : 3;

    // Helper: Drop indicators and drag state
    const clearDropIndicators = () => {
      strip.querySelectorAll('.drop-indicator-top, .drop-indicator-bottom, .drop-target-group').forEach(el => {
        el.classList.remove('drop-indicator-top', 'drop-indicator-bottom', 'drop-target-group');
      });
    };

    let layerDragSource = null;
    let touchReorderState = null;

    const attachDragAndDrop = (row, type, id) => {
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        layerDragSource = { type, id };
        row.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(id));
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
        if (layerDragSource.type === type && String(layerDragSource.id) === String(id)) return;
        const rect = row.getBoundingClientRect();
        const relY = (e.clientY - rect.top) / rect.height;
        clearDropIndicators();
        if (type === 'group') {
          if (relY < 0.25) row.classList.add('drop-indicator-top');
          else if (relY > 0.75) row.classList.add('drop-indicator-bottom');
          else row.classList.add('drop-target-group');
        } else {
          if (relY < 0.5) row.classList.add('drop-indicator-top');
          else row.classList.add('drop-indicator-bottom');
        }
      });

      row.addEventListener('dragleave', (e) => {
        if (!row.contains(e.relatedTarget)) {
          row.classList.remove('drop-indicator-top', 'drop-indicator-bottom', 'drop-target-group');
        }
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!layerDragSource) return;
        if (layerDragSource.type === type && String(layerDragSource.id) === String(id)) return;
        const rect = row.getBoundingClientRect();
        const relY = (e.clientY - rect.top) / rect.height;
        let dropPos = 'after';
        if (type === 'group') {
          if (relY < 0.25) dropPos = 'before';
          else if (relY > 0.75) dropPos = 'after';
          else dropPos = 'inside';
        } else {
          dropPos = relY < 0.5 ? 'before' : 'after';
        }
        if (host?.reorderTreeItem) {
          host.reorderTreeItem(layerDragSource.type, layerDragSource.id, type, id, dropPos);
          clearDropIndicators();
          if (host.syncUiFromHost) host.syncUiFromHost();
          else this.updateTimeline();
        }
      });

      // Touch hold-and-drag reordering
      let timer = null;
      let startX = 0, startY = 0;
      row.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        if (e.target.closest('button, input, select, .raster-frame-card')) return;
        row.draggable = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        timer = setTimeout(() => {
          timer = null;
          touchReorderState = { type, id, startEl: row, lastTarget: null, lastDropPos: null };
          layerDragSource = { type, id };
          row.classList.add('touch-reordering');
          if (navigator.vibrate) try { navigator.vibrate(18); } catch (_) {}
        }, 280);
      }, { passive: true });

      row.addEventListener('touchmove', (e) => {
        if (timer) {
          const dx = e.touches[0].clientX - startX;
          const dy = e.touches[0].clientY - startY;
          if (Math.hypot(dx, dy) > 10) {
            clearTimeout(timer);
            timer = null;
          }
        }
        if (touchReorderState && String(touchReorderState.id) === String(id)) {
          if (e.cancelable) e.preventDefault();
          const touchX = e.touches[0].clientX;
          const touchY = e.touches[0].clientY;
          const prevPE = row.style.pointerEvents;
          row.style.pointerEvents = 'none';
          const targetEl = document.elementFromPoint(touchX, touchY);
          row.style.pointerEvents = prevPE;

          const targetRow = targetEl?.closest('.raster-layer-track-row, .raster-group-track-row');
          clearDropIndicators();
          if (targetRow && targetRow !== row) {
            const rect = targetRow.getBoundingClientRect();
            const relY = (touchY - rect.top) / rect.height;
            const isGroup = targetRow.classList.contains('raster-group-track-row');
            const tgtId = isGroup ? targetRow.dataset.groupId : parseInt(targetRow.dataset.layerId, 10);
            const tgtType = isGroup ? 'group' : 'layer';
            let dropPos = 'after';
            if (isGroup) {
              if (relY < 0.25) { dropPos = 'before'; targetRow.classList.add('drop-indicator-top'); }
              else if (relY > 0.75) { dropPos = 'after'; targetRow.classList.add('drop-indicator-bottom'); }
              else { dropPos = 'inside'; targetRow.classList.add('drop-target-group'); }
            } else {
              if (relY < 0.5) { dropPos = 'before'; targetRow.classList.add('drop-indicator-top'); }
              else { dropPos = 'after'; targetRow.classList.add('drop-indicator-bottom'); }
            }
            touchReorderState.lastTarget = { type: tgtType, id: tgtId };
            touchReorderState.lastDropPos = dropPos;
          } else {
            touchReorderState.lastTarget = null;
            touchReorderState.lastDropPos = null;
          }
        }
      }, { passive: false });

      const finishTouch = () => {
        row.draggable = true;
        if (timer) { clearTimeout(timer); timer = null; }
        if (touchReorderState && String(touchReorderState.id) === String(id)) {
          row.classList.remove('touch-reordering');
          clearDropIndicators();
          if (touchReorderState.lastTarget && touchReorderState.lastDropPos) {
            const tgt = touchReorderState.lastTarget;
            if (tgt.type !== touchReorderState.type || String(tgt.id) !== String(touchReorderState.id)) {
              if (host?.reorderTreeItem) {
                host.reorderTreeItem(touchReorderState.type, touchReorderState.id, tgt.type, tgt.id, touchReorderState.lastDropPos);
                if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {}
                if (host.syncUiFromHost) host.syncUiFromHost();
                else this.updateTimeline();
              }
            }
          }
          touchReorderState = null;
          layerDragSource = null;
        }
      };

      row.addEventListener('touchend', finishTouch);
      row.addEventListener('touchcancel', finishTouch);
    };

    // Helper: Create Group Row
    const createGroupTrack = (grp, depth = 0, parentGroup = null) => {
      const grpRow = document.createElement('div');
      grpRow.className = 'raster-group-track-row ui-layer-group-header';
      grpRow.dataset.groupId = String(grp.id);
      grpRow.style.cssText = `
        display: flex; align-items: stretch; min-height: 24px; height: 24px; border-bottom: 1px solid var(--border);
        background: var(--bg-panel-sub);
      `;

      const grpHeader = document.createElement('div');
      grpHeader.style.cssText = `
        width: 195px; min-width: 195px; max-width: 195px; padding: 0 4px; padding-left: ${4 + depth * 12}px;
        display: flex; align-items: center; justify-content: space-between; gap: 3px;
        border-right: 1px solid var(--border); position: sticky; left: 0; z-index: 3; box-sizing: border-box; cursor: pointer;
        background: var(--bg-panel-sub); font-size: 9px;
      `;

      const leftWrap = document.createElement('div');
      leftWrap.style.cssText = 'display: flex; align-items: center; gap: 3px; overflow: hidden; flex: 1; min-width: 0;';

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'ip-btn ip-mini-btn';
      toggleBtn.textContent = grp.collapsed ? '▸' : '▾';
      toggleBtn.title = grp.collapsed ? 'Expand folder' : 'Collapse folder';
      toggleBtn.style.cssText = 'min-width: 14px; height: 16px; padding: 0 1px; font-size: 8px; flex-shrink: 0;';
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        grp.collapsed = !grp.collapsed;
        if (host?.syncUiFromHost) host.syncUiFromHost();
        else this.updateTimeline();
      });

      const iconSpan = document.createElement('span');
      iconSpan.style.cssText = 'font-size: 10px; flex-shrink: 0;';
      iconSpan.textContent = grp.collapsed ? '📁' : '📂';

      const grpNameSpan = document.createElement('span');
      grpNameSpan.style.cssText = 'font-weight: 700; color: var(--text-bright); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
      grpNameSpan.textContent = grp.name;
      grpNameSpan.title = grp.name;
      grpNameSpan.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        const newName = typeof uiPrompt === 'function'
          ? await uiPrompt('Rename folder:', grp.name, { title: 'Rename Folder' })
          : (typeof prompt === 'function' ? prompt('Rename folder:', grp.name) : null);
        if (newName && newName.trim()) {
          grp.name = newName.trim();
          if (host?.syncUiFromHost) host.syncUiFromHost();
          else this.updateTimeline();
        }
      });

      leftWrap.appendChild(toggleBtn);
      leftWrap.appendChild(iconSpan);
      leftWrap.appendChild(grpNameSpan);

      const rightWrap = document.createElement('div');
      rightWrap.style.cssText = 'display: flex; align-items: center; gap: 2px; flex-shrink: 0;';

      const grpVisBtn = document.createElement('button');
      grpVisBtn.type = 'button';
      grpVisBtn.className = 'ip-btn ip-mini-btn';
      grpVisBtn.textContent = grp.visible !== false ? '◉' : '—';
      grpVisBtn.title = grp.visible !== false ? 'Hide folder' : 'Show folder';
      grpVisBtn.style.cssText = `padding: 0 2px; min-width: 16px; height: 16px; font-size: 9px; opacity: ${grp.visible !== false ? '1' : '0.4'}; flex-shrink: 0;`;
      grpVisBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (host?.runCmd) host.runCmd(`group toggle ${grp.id}`);
        else {
          grp.visible = grp.visible === false;
          if (host?.syncUiFromHost) host.syncUiFromHost();
          else this.updateTimeline();
        }
      });

      const grpMoreBtn = document.createElement('button');
      grpMoreBtn.type = 'button';
      grpMoreBtn.className = 'ip-btn ip-mini-btn';
      grpMoreBtn.textContent = '⋯';
      grpMoreBtn.title = `Folder options for ${grp.name}`;
      grpMoreBtn.style.cssText = 'min-width: 16px; height: 16px; padding: 0 2px; font-size: 9px; font-weight: bold; flex-shrink: 0;';
      grpMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (host?.openGroupContextMenu) host.openGroupContextMenu(grpMoreBtn, grp.id);
      });

      rightWrap.appendChild(grpVisBtn);
      rightWrap.appendChild(grpMoreBtn);

      grpHeader.appendChild(leftWrap);
      grpHeader.appendChild(rightWrap);

      grpHeader.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (host?.openGroupContextMenu) host.openGroupContextMenu(e, grp.id);
      });

      grpRow.appendChild(grpHeader);

      const grpTrack = document.createElement('div');
      grpTrack.style.cssText = 'display: flex; align-items: center; padding: 0 8px; font-size: 8.5px; color: var(--text-muted); font-style: italic;';
      grpTrack.textContent = `${(grp.children || []).length} items`;
      grpRow.appendChild(grpTrack);

      attachDragAndDrop(grpRow, 'group', grp.id);
      return grpRow;
    };

    // Helper: Create Layer Row
    const createLayerTrack = (lid, depth = 0, parentGroup = null) => {
      const isLayerActive = lid === activeLayerId;
      const track = this.animator.getLayerTrack(lid);
      const frames = track ? track.frames : [];
      const layerName = this.animator.getLayerName(lid);
      const isVis = exp?.w_layer_get_visible ? !!exp.w_layer_get_visible(lid) : true;

      const rowEl = document.createElement('div');
      rowEl.className = `raster-layer-track-row ${isLayerActive ? 'active' : ''}`;
      rowEl.dataset.layerId = String(lid);
      rowEl.style.cssText = `
        display: flex; align-items: stretch; min-height: 28px; height: 28px; border-bottom: 1px solid var(--border);
        background: ${isLayerActive ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-dark)'};
      `;

      // Sticky Left Layer Header (Layers++ with full layer management)
      const layerHeader = document.createElement('div');
      layerHeader.style.cssText = `
        width: 195px; min-width: 195px; max-width: 195px; padding: 0 4px; padding-left: ${4 + depth * 12}px;
        display: flex; align-items: center; justify-content: space-between; gap: 3px;
        border-right: 1px solid var(--border); position: sticky; left: 0; z-index: 3; box-sizing: border-box; cursor: pointer;
        background: ${isLayerActive ? 'var(--bg-panel)' : 'var(--bg-panel-sub)'};
        border-left: 3px solid ${isLayerActive ? 'var(--primary)' : 'transparent'};
      `;

      const nameWrap = document.createElement('div');
      nameWrap.style.cssText = 'display: flex; align-items: center; gap: 3px; overflow: hidden; flex: 1; min-width: 0;';

      const visBtn = document.createElement('button');
      visBtn.type = 'button';
      visBtn.className = 'ip-btn ip-mini-btn';
      visBtn.title = isVis ? 'Hide layer' : 'Show layer';
      visBtn.style.cssText = `padding: 0 2px; min-width: 16px; height: 16px; font-size: 9px; opacity: ${isVis ? '1' : '0.4'}; flex-shrink: 0;`;
      visBtn.textContent = isVis ? '◉' : '—';
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (host?.runCmd) host.runCmd(`toggle layer ${lid}`);
        else if (exp?.w_layer_visible) {
          exp.w_layer_visible(lid, isVis ? 0 : 1);
          host?.render?.();
          if (host?.syncUiFromHost) host.syncUiFromHost();
          else this.updateTimeline();
        }
      });

      const idxSpan = document.createElement('span');
      idxSpan.style.cssText = 'font-size: 8.5px; font-family: var(--font-mono); color: var(--text-muted); flex-shrink: 0;';
      idxSpan.textContent = `#${lid}`;

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = `font-size: 9.5px; font-weight: ${isLayerActive ? '800' : '600'}; color: ${isLayerActive ? 'var(--primary)' : 'var(--text)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;`;
      nameSpan.textContent = layerName;
      nameSpan.title = layerName;
      nameSpan.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        const newName = typeof uiPrompt === 'function'
          ? await uiPrompt(`Rename layer #${lid}:`, layerName, { title: 'Rename Layer' })
          : (typeof prompt === 'function' ? prompt(`Rename layer #${lid}:`, layerName) : null);
        if (newName && newName.trim()) {
          if (!host.layerNames) host.layerNames = new Map();
          host.layerNames.set(lid, newName.trim());
          if (host.syncUiFromHost) host.syncUiFromHost();
          else this.updateTimeline();
        }
      });

      nameWrap.appendChild(visBtn);
      nameWrap.appendChild(idxSpan);
      nameWrap.appendChild(nameSpan);

      // Layer Badges
      const badgesWrap = document.createElement('div');
      badgesWrap.style.cssText = 'display: flex; align-items: center; gap: 2px; flex-shrink: 0;';

      const isVec = host?.isVectorLayer && host.isVectorLayer(lid);
      if (isVec) {
        const vecSpan = document.createElement('span');
        vecSpan.style.cssText = 'font-size: 8px; background: #1d2021; color: #8ec07c; border: 1px solid #8ec07c; border-radius: 2px; padding: 0 2px; font-weight: bold;';
        vecSpan.title = 'Vector Layer';
        vecSpan.textContent = 'VEC';
        badgesWrap.appendChild(vecSpan);
      }

      const blendMode = exp?.w_layer_get_blend_mode ? exp.w_layer_get_blend_mode(lid) : 0;
      const blendList = host?.BLEND_MODE_NAMES || [
        { val: 0, short: 'Norm', label: 'Normal' },
        { val: 1, short: 'Mult', label: 'Multiply' },
        { val: 2, short: 'Scrn', label: 'Screen' },
        { val: 3, short: 'Over', label: 'Overlay' },
        { val: 4, short: 'Ddg', label: 'Color Dodge' },
        { val: 5, short: 'Add', label: 'Linear Dodge (Add)' }
      ];
      const blendObj = blendList.find(b => b.val === blendMode);
      if (blendMode !== 0 && blendObj) {
        const bmSpan = document.createElement('span');
        bmSpan.style.cssText = 'font-size: 8px; color: #d3869b; font-weight: bold;';
        bmSpan.title = `Blend Mode: ${blendObj.label}`;
        bmSpan.textContent = blendObj.short;
        badgesWrap.appendChild(bmSpan);
      }

      const alphaLock = exp?.w_layer_get_alpha_lock ? exp.w_layer_get_alpha_lock(lid) : 0;
      if (alphaLock) {
        const lockSpan = document.createElement('span');
        lockSpan.style.cssText = 'font-size: 9px; color: #fabd2f;';
        lockSpan.title = 'Alpha Lock';
        lockSpan.textContent = '⚿';
        badgesWrap.appendChild(lockSpan);
      }

      const clipping = exp?.w_layer_get_clipping ? exp.w_layer_get_clipping(lid) : 0;
      if (clipping) {
        const clipSpan = document.createElement('span');
        clipSpan.style.cssText = 'font-size: 9px; color: #83a598;';
        clipSpan.title = 'Clipping Mask';
        clipSpan.textContent = '⮑';
        badgesWrap.appendChild(clipSpan);
      }

      nameWrap.appendChild(badgesWrap);

      // Right Controls: Opacity % + Options button ⋯
      const rightWrap = document.createElement('div');
      rightWrap.style.cssText = 'display: flex; align-items: center; gap: 2px; flex-shrink: 0;';

      const opRaw = exp?.get_layer_opacity ? exp.get_layer_opacity(lid) : 255;
      const opPct = Math.round((opRaw / 255) * 100);
      const opSpan = document.createElement('span');
      opSpan.style.cssText = 'font-size: 8px; font-family: var(--font-mono); color: var(--text-muted); min-width: 22px; text-align: right; flex-shrink: 0;';
      opSpan.textContent = `${opPct}%`;

      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'ip-btn ip-mini-btn';
      moreBtn.title = `Layer options for [${lid}] ${layerName}`;
      moreBtn.style.cssText = 'min-width: 16px; height: 16px; padding: 0 2px; font-size: 9px; font-weight: bold; flex-shrink: 0;';
      moreBtn.textContent = '⋯';
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (host?.openLayerContextMenu) {
          host.openLayerContextMenu(moreBtn, lid);
        }
      });

      rightWrap.appendChild(opSpan);
      rightWrap.appendChild(moreBtn);

      layerHeader.appendChild(nameWrap);
      layerHeader.appendChild(rightWrap);

      layerHeader.addEventListener('click', () => {
        this.animator.selectLayerCel(lid, track ? track.activeCelIndex : 0);
      });

      layerHeader.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (host?.openLayerContextMenu) {
          host.openLayerContextMenu(e, lid);
        }
      });

      rowEl.appendChild(layerHeader);

      // Right Cels Track for this Layer (no tick row, no add-tick button)
      const celsWrap = document.createElement('div');
      celsWrap.style.cssText = 'display: flex; align-items: center; padding: 1px 4px; gap: 3px;';

      frames.forEach((cel, idx) => {
        const isCelActive = isLayerActive && idx === track.activeCelIndex;
        const dur = Math.max(1, Math.round(Number(cel.duration) || 1));
        const cardWidth = getCelCardWidth(dur);

        const card = document.createElement('div');
        card.className = `raster-frame-card ${isCelActive ? 'active' : ''}`;
        card.dataset.layerId = String(lid);
        card.dataset.index = String(idx);
        card.title = `${layerName} • Cel #${idx + 1} (${dur}f) — Click to select, right-click for options`;
        card.style.cssText = `
          position: relative; display: flex; align-items: center; justify-content: space-between; gap: 2px;
          width: ${cardWidth}px; min-width: ${cardWidth}px; height: 24px;
          background: var(--bg-panel); border: 1.5px solid ${isCelActive ? 'var(--primary)' : (idx === track.activeCelIndex ? 'var(--border-bright)' : 'var(--border)')};
          border-radius: 3px; cursor: pointer; flex-shrink: 0; box-sizing: border-box; padding: 1px 4px; overflow: hidden;
          ${isCelActive ? 'box-shadow: 0 0 6px rgba(16, 185, 129, 0.3);' : ''}
        `;

        const thumb = document.createElement('canvas');
        thumb.width = 22;
        thumb.height = 18;
        thumb.style.cssText = 'width: 22px; height: 18px; background: #14171a; border-radius: 2px; display: block; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.06);';
        this.renderCelThumb(cel, thumb);
        card.appendChild(thumb);

        if (dur > 1) {
          const holdBar = document.createElement('div');
          holdBar.style.cssText = 'flex: 1; min-width: 4px; height: 4px; background: repeating-linear-gradient(90deg, var(--primary) 0px, var(--primary) 4px, transparent 4px, transparent 7px); opacity: 0.45; border-radius: 2px;';
          card.appendChild(holdBar);
        }

        const holdBadge = document.createElement('span');
        holdBadge.title = `Cel #${idx + 1} (${dur} frame${dur > 1 ? 's' : ''})`;
        holdBadge.style.cssText = `
          font-size: 8px; font-weight: 800; font-family: var(--font-mono);
          color: ${dur > 1 ? 'var(--bg-dark)' : (isCelActive ? 'var(--primary)' : 'var(--text-muted)')};
          background: ${dur > 1 ? 'var(--primary)' : 'transparent'};
          border-radius: 2px; padding: 0 2px; flex-shrink: 0; pointer-events: none;
        `;
        holdBadge.textContent = dur > 1 ? `${dur}f` : `#${idx + 1}`;
        card.appendChild(holdBadge);

        card.addEventListener('click', () => {
          this.animator.selectLayerCel(lid, idx);
        });

        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.openTimelineContextMenu(e, lid, idx);
        });

        celsWrap.appendChild(card);
      });

      rowEl.appendChild(celsWrap);
      attachDragAndDrop(rowEl, 'layer', lid);
      return rowEl;
    };

    // Render tree or flat list
    const texIds = host?.getTextureWasmIds ? host.getTextureWasmIds() : new Set([0, 1, 2]);
    const renderNode = (node, depth = 0, parentGroup = null) => {
      if (node.type === 'layer') {
        if (texIds.has(node.id)) return;
        const rowEl = createLayerTrack(node.id, depth, parentGroup);
        if (rowEl) strip.appendChild(rowEl);
      } else if (node.type === 'group') {
        const grp = host?.layerGroups?.get(node.id);
        if (grp) {
          const grpRow = createGroupTrack(grp, depth, parentGroup);
          if (grpRow) strip.appendChild(grpRow);
          if (!grp.collapsed && Array.isArray(grp.children)) {
            for (const childNode of grp.children) {
              renderNode(childNode, depth + 1, grp);
            }
          }
        }
      }
    };

    if (host?.layerTree && host.layerTree.length > 0) {
      for (const rootNode of host.layerTree) {
        renderNode(rootNode, 0, null);
      }
    } else {
      layerIdsTopToBottom.forEach((lid) => {
        const rowEl = createLayerTrack(lid, 0, null);
        if (rowEl) strip.appendChild(rowEl);
      });
    }

    if (tier2Body) {
      tier2Body.scrollLeft = savedScrollLeft;
      tier2Body.scrollTop = savedScrollTop;
    }
  }

  renderCelThumb(cel, canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!cel || !cel.pixels || !cel.width || !cel.height) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.min(cw / cel.width, ch / cel.height);
    const tw = Math.max(1, Math.round(cel.width * scale));
    const th = Math.max(1, Math.round(cel.height * scale));
    const ox = Math.round((cw - tw) / 2);
    const oy = Math.round((ch - th) / 2);

    const img = ctx.createImageData(tw, th);
    const dst = img.data;
    const src = cel.pixels;
    const srcW = cel.width;
    const srcH = cel.height;
    const alphaMul = ((cel.opacity ?? 255) / 255);

    for (let dy = 0; dy < th; dy++) {
      const sy = Math.min(srcH - 1, Math.floor((dy + 0.5) * srcH / th));
      const rowSrcOffset = sy * srcW;
      const rowDstOffset = dy * tw;
      for (let dx = 0; dx < tw; dx++) {
        const sx = Math.min(srcW - 1, Math.floor((dx + 0.5) * srcW / tw));
        const si = (rowSrcOffset + sx) * 4;
        const di = (rowDstOffset + dx) * 4;
        dst[di] = src[si];
        dst[di + 1] = src[si + 1];
        dst[di + 2] = src[si + 2];
        dst[di + 3] = Math.round(src[si + 3] * alphaMul);
      }
    }
    ctx.putImageData(img, ox, oy);
  }
}
