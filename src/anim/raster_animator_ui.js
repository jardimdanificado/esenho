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

const TICK_COL_WIDTH = 58;

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
      <div class="raster-anim-dock" style="display: flex; flex-direction: column; width: 100%; height: 100%; background: var(--bg-panel); color: var(--text); font-family: var(--font-sans); font-size: 11px; user-select: none; box-sizing: border-box; position: relative; overflow: hidden;">
        
        <!-- TIER 1: Header, Transport, Active Layer Cel Actions, Unlimited Hold Duration, Onion Skin & Export -->
        <div class="raster-anim-bar" style="display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 5px 10px; background: var(--bg-panel-sub); border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; flex-shrink: 0;">
          
          <!-- Left: Playhead Counter & Transport Controls -->
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <span id="raster-frame-counter" style="font-weight: 800; font-family: var(--font-mono); font-size: 10px; color: var(--primary); background: var(--bg-dark); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 2px 7px; min-width: 68px; text-align: center;" title="Current Tick / Total Ticks (Active Layer Cel)">1 / 1</span>

            <div style="display: flex; align-items: center; gap: 2px; background: var(--bg-dark); padding: 2px 4px; border-radius: var(--radius-sm); border: 1px solid var(--border); flex-shrink: 0;">
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-first" title="First Tick" style="min-width: 22px; height: 22px; padding: 0 4px; font-size: 10px;">⏮</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-prev" title="Previous Cel on Active Layer (,)" style="min-width: 24px; height: 22px; padding: 0 5px; font-size: 10px;">◀</button>
              <button type="button" class="ip-btn ip-mini-btn raster-btn-play" id="raster-btn-play" title="Play / Pause (Space)" style="min-width: 32px; height: 22px; padding: 0 8px; background: var(--primary); color: var(--bg-dark); font-weight: 800; font-size: 11px;">▶</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-next" title="Next Cel on Active Layer (.)" style="min-width: 24px; height: 22px; padding: 0 5px; font-size: 10px;">▶</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-last" title="Last Tick" style="min-width: 22px; height: 22px; padding: 0 4px; font-size: 10px;">⏭</button>
              <div style="width: 1px; height: 14px; background: var(--border); margin: 0 2px;"></div>
              <button type="button" class="ip-btn ip-mini-btn active" id="raster-btn-loop" title="Loop Playback" style="height: 22px; padding: 0 6px; font-size: 9.5px; font-weight: 700;">Loop</button>
            </div>
          </div>

          <!-- Center: Active Layer Cel Actions + Unlimited Hold Duration Input -->
          <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 3px; background: var(--bg-dark); padding: 2px 4px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-add" title="Add Blank Frame to Active Layer (+)" style="height: 22px; padding: 0 7px; font-size: 10px; font-weight: 800; background: var(--primary); color: var(--bg-dark);">+ Blank</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-dup" title="Duplicate Cel on Active Layer" style="height: 22px; padding: 0 6px; font-size: 10px; font-weight: 700;">Dup</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-move-left" title="Move Cel Left on Layer" style="height: 22px; padding: 0 5px; font-size: 10px;">←</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-move-right" title="Move Cel Right on Layer" style="height: 22px; padding: 0 5px; font-size: 10px;">→</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-clear" title="Clear Active Cel Pixels" style="height: 22px; padding: 0 6px; font-size: 9.5px;">Clear</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-del" title="Delete Active Cel" style="height: 22px; padding: 0 6px; font-size: 9.5px; color: var(--danger);">Del</button>
            </div>

            <!-- Unlimited Frame Duration (Hold) Stepper + Number Input -->
            <div style="display: flex; align-items: center; gap: 3px; background: var(--bg-dark); padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border);" title="Frame Hold Duration (in frames) — any positive number">
              <span style="font-size: 9.5px; color: var(--text-muted); font-weight: 800;">Duration:</span>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-hold-dec" title="Decrease Frame Duration (-1f)" style="min-width: 20px; height: 20px; padding: 0 4px; font-size: 11px; font-weight: 800;">−</button>
              <input type="number" id="raster-hold-input" min="1" step="1" value="1" style="width: 46px; height: 20px; background: var(--bg-panel); color: var(--primary); border: 1px solid var(--border); border-radius: 3px; font-family: var(--font-mono); font-size: 10.5px; font-weight: 800; text-align: center; padding: 0 2px;" title="Type any frame duration (1, 10, 24, 100...)">
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-hold-inc" title="Increase Frame Duration (+1f)" style="min-width: 20px; height: 20px; padding: 0 4px; font-size: 11px; font-weight: 800;">+</button>
              <span style="font-size: 9px; color: var(--text-muted); font-family: var(--font-mono);">frames</span>
            </div>
          </div>

          <!-- Right: Onion Skin, FPS, Export -->
          <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 2px; background: var(--bg-dark); padding: 2px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-onionskin" title="Toggle Onion Skinning on Active Layer (O)" style="height: 22px; padding: 0 7px; font-size: 10px; font-weight: 700; display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="6" stroke-dasharray="2 2"/><circle cx="15" cy="12" r="6"/></svg>
                <span>Onion</span>
              </button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-onion-cfg" title="Onion Skin Settings" style="height: 22px; padding: 0 5px; font-size: 9px;">▾</button>
            </div>

            <div style="display: flex; align-items: center; gap: 4px; background: var(--bg-dark); padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border);" title="Playback Frame Rate (FPS)">
              <span style="font-size: 9.5px; color: var(--text-muted); font-weight: 800;">FPS</span>
              <input type="range" id="raster-fps-slider" min="1" max="60" value="12" style="width: 50px; cursor: pointer; accent-color: var(--primary);">
              <span id="raster-fps-val" style="font-family: var(--font-mono); font-size: 10px; font-weight: 800; color: var(--primary); min-width: 18px; text-align: right;">12</span>
            </div>

            <div style="display: flex; align-items: center; gap: 2px; background: var(--bg-dark); padding: 2px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <button type="button" class="ip-btn ip-mini-btn" id="raster-export-gif" title="Export Animated GIF (.gif)" style="height: 22px; padding: 0 6px; font-size: 10px; font-weight: 700; color: var(--primary);">GIF</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-export-webm" title="Export WebM Video (.webm)" style="height: 22px; padding: 0 6px; font-size: 10px; font-weight: 700;">WebM</button>
            </div>
          </div>
        </div>

        <!-- COLLAPSIBLE ONION SKIN CONFIGURATION ROW -->
        <div id="raster-onion-settings-row" style="display: none; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 12px; background: var(--bg-dark); border-bottom: 1px solid var(--border); font-size: 10px; flex-wrap: wrap; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="color: #fb4934; font-weight: 800;">● Past Frames:</span>
            <input type="range" id="raster-onion-prev" min="0" max="5" value="2" style="width: 55px; accent-color: #fb4934;">
            <span id="raster-onion-prev-val" style="font-family: var(--font-mono); min-width: 14px;">2</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="color: #83a598; font-weight: 800;">● Future Frames:</span>
            <input type="range" id="raster-onion-next" min="0" max="5" value="1" style="width: 55px; accent-color: #83a598;">
            <span id="raster-onion-next-val" style="font-family: var(--font-mono); min-width: 14px;">1</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="color: var(--text-muted); font-weight: 800;">Ghost Opacity:</span>
            <input type="range" id="raster-onion-opacity" min="10" max="85" value="35" style="width: 65px; accent-color: var(--primary);">
            <span id="raster-onion-op-val" style="font-family: var(--font-mono); color: var(--primary); min-width: 28px;">35%</span>
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
    const btnExportGif = this.container.querySelector('#raster-export-gif');
    const btnExportWebm = this.container.querySelector('#raster-export-webm');

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
      const cur = this.animator.frames[this.animator.currentFrameIndex];
      const curDur = cur ? (cur.duration || 1) : 1;
      applyDurationChange(Math.max(1, curDur - 1));
    });

    btnHoldInc?.addEventListener('click', () => {
      const cur = this.animator.frames[this.animator.currentFrameIndex];
      const curDur = cur ? (cur.duration || 1) : 1;
      applyDurationChange(curDur + 1);
    });

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

    btnExportGif?.addEventListener('click', async () => {
      const origText = btnExportGif.textContent;
      btnExportGif.textContent = '...';
      try {
        const blob = await this.animator.exportGif();
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.animator.host?.currentProjectName || 'animation'}.gif`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        alert('GIF export failed: ' + err.message);
      } finally {
        btnExportGif.textContent = origText;
      }
    });

    btnExportWebm?.addEventListener('click', async () => {
      const origText = btnExportWebm.textContent;
      btnExportWebm.textContent = '...';
      try {
        const blob = await this.animator.exportWebM();
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.animator.host?.currentProjectName || 'animation'}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        alert('WebM export failed: ' + err.message);
      } finally {
        btnExportWebm.textContent = origText;
      }
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
    if (typeof layerId === 'number' && typeof frameIdx === 'number') {
      this.animator.selectLayerCel(layerId, frameIdx);
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
          { type: 'item', label: 'Export Animated GIF (.gif)', action: () => this.container.querySelector('#raster-export-gif')?.click() },
          { type: 'item', label: 'Export WebM Video (.webm)', action: () => this.container.querySelector('#raster-export-webm')?.click() }
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
    const cur = this.animator.frames[this.animator.currentFrameIndex];
    if (holdInput && cur && document.activeElement !== holdInput) {
      holdInput.value = String(cur.duration || 1);
    }
  }

  updateTimeline() {
    this.animator.syncLayersWithCanvas?.();
    this.updateCounter();
    const strip = this.container.querySelector('#raster-filmstrip');
    if (!strip) return;

    strip.innerHTML = '';

    const layerIdsBottomToTop = this.animator.getDrawingLayerIds ? this.animator.getDrawingLayerIds() : [3];
    // Display layers top-to-bottom (matching the Layers panel visual order)
    const layerIdsTopToBottom = [...layerIdsBottomToTop].reverse();
    const activeLayerId = this.animator.getActiveLayerId ? this.animator.getActiveLayerId() : 3;
    const totalTicks = this.animator.getTotalDurationTicks ? this.animator.getTotalDurationTicks() : 1;
    const curTick = this.animator.currentTick || 0;

    // 1. Time Ruler Row
    const rulerRow = document.createElement('div');
    rulerRow.style.cssText = `
      display: flex; align-items: stretch; border-bottom: 1px solid var(--border);
      background: var(--bg-panel-sub); position: sticky; top: 0; z-index: 4; height: 22px;
    `;

    const rulerCorner = document.createElement('div');
    rulerCorner.style.cssText = `
      width: 170px; min-width: 170px; padding: 0 8px; display: flex; align-items: center; justify-content: space-between;
      border-right: 1px solid var(--border); background: var(--bg-panel-sub); position: sticky; left: 0; z-index: 5;
      font-size: 9.5px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px;
      box-sizing: border-box;
    `;
    rulerCorner.innerHTML = `<span>Layer Tracks (${layerIdsTopToBottom.length})</span><span>Ticks</span>`;
    rulerRow.appendChild(rulerCorner);

    const rulerTicksWrap = document.createElement('div');
    rulerTicksWrap.style.cssText = 'display: flex; align-items: stretch; padding: 0 6px; gap: 4px;';
    const displayTicks = Math.min(totalTicks, 240);
    for (let t = 0; t < displayTicks; t++) {
      const isCurTick = t === curTick;
      const tickEl = document.createElement('div');
      tickEl.title = `Scrub to Tick #${t + 1}`;
      tickEl.style.cssText = `
        width: ${TICK_COL_WIDTH}px; min-width: ${TICK_COL_WIDTH}px; display: flex; align-items: center; justify-content: center;
        font-family: var(--font-mono); font-size: 9.5px; font-weight: 800; cursor: pointer; border-radius: 2px;
        color: ${isCurTick ? 'var(--bg-dark)' : 'var(--text-muted)'};
        background: ${isCurTick ? 'var(--primary)' : 'transparent'};
      `;
      tickEl.textContent = `${t + 1}f`;
      tickEl.addEventListener('click', () => {
        this.animator.goToTick(t);
      });
      rulerTicksWrap.appendChild(tickEl);
    }
    rulerRow.appendChild(rulerTicksWrap);
    strip.appendChild(rulerRow);

    // 2. Per-Layer Track Rows
    layerIdsTopToBottom.forEach((lid) => {
      const isLayerActive = lid === activeLayerId;
      const track = this.animator.getLayerTrack(lid);
      const frames = track ? track.frames : [];
      const layerName = this.animator.getLayerName(lid);
      const exp = this.animator.host?.canvasActor?.exports;
      const isVis = exp?.w_layer_get_visible ? !!exp.w_layer_get_visible(lid) : true;

      const rowEl = document.createElement('div');
      rowEl.className = `raster-layer-track-row ${isLayerActive ? 'active' : ''}`;
      rowEl.dataset.layerId = String(lid);
      rowEl.style.cssText = `
        display: flex; align-items: stretch; min-height: 62px; border-bottom: 1px solid var(--border);
        background: ${isLayerActive ? 'rgba(16, 185, 129, 0.06)' : 'var(--bg-dark)'};
      `;

      // Left Sticky Layer Info Header
      const layerHeader = document.createElement('div');
      layerHeader.style.cssText = `
        width: 170px; min-width: 170px; padding: 6px 8px; display: flex; flex-direction: column; justify-content: space-between;
        border-right: 1px solid var(--border); position: sticky; left: 0; z-index: 3; box-sizing: border-box; cursor: pointer;
        background: ${isLayerActive ? 'var(--bg-panel)' : 'var(--bg-panel-sub)'};
        border-left: 3px solid ${isLayerActive ? 'var(--primary)' : 'transparent'};
      `;

      const topRow = document.createElement('div');
      topRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 4px;';

      const nameWrap = document.createElement('div');
      nameWrap.style.cssText = 'display: flex; align-items: center; gap: 5px; overflow: hidden;';

      const visBtn = document.createElement('button');
      visBtn.type = 'button';
      visBtn.className = 'ip-btn ip-mini-btn';
      visBtn.title = 'Toggle Layer Visibility';
      visBtn.style.cssText = `padding: 0 4px; height: 18px; font-size: 9.5px; opacity: ${isVis ? '1' : '0.4'};`;
      visBtn.textContent = isVis ? '👁' : '—';
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (exp?.w_layer_visible) {
          exp.w_layer_visible(lid, isVis ? 0 : 1);
          this.animator.host?.render?.();
          this.updateTimeline();
        }
      });

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = `font-size: 10.5px; font-weight: ${isLayerActive ? '800' : '600'}; color: ${isLayerActive ? 'var(--primary)' : 'var(--text)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;
      nameSpan.textContent = layerName;

      nameWrap.appendChild(visBtn);
      nameWrap.appendChild(nameSpan);
      topRow.appendChild(nameWrap);

      const bottomRow = document.createElement('div');
      bottomRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 4px;';

      const layerStats = document.createElement('span');
      const layerTicks = this.animator.getLayerDurationTicks ? this.animator.getLayerDurationTicks(lid) : frames.length;
      layerStats.style.cssText = 'font-size: 9px; font-family: var(--font-mono); color: var(--text-muted);';
      layerStats.textContent = `${frames.length} ${frames.length === 1 ? 'cel' : 'cels'} (${layerTicks}f)`;

      const quickBtns = document.createElement('div');
      quickBtns.style.cssText = 'display: flex; gap: 3px;';

      const addLayerCelBtn = document.createElement('button');
      addLayerCelBtn.type = 'button';
      addLayerCelBtn.className = 'ip-btn ip-mini-btn';
      addLayerCelBtn.title = `Add Blank Frame to ${layerName}`;
      addLayerCelBtn.style.cssText = 'height: 18px; padding: 0 5px; font-size: 9px; font-weight: 800;';
      addLayerCelBtn.textContent = '+Cel';
      addLayerCelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.animator.selectLayerCel(lid, track.activeCelIndex);
        this.animator.addFrame(false, lid);
      });

      const dupLayerCelBtn = document.createElement('button');
      dupLayerCelBtn.type = 'button';
      dupLayerCelBtn.className = 'ip-btn ip-mini-btn';
      dupLayerCelBtn.title = `Duplicate Frame on ${layerName}`;
      dupLayerCelBtn.style.cssText = 'height: 18px; padding: 0 5px; font-size: 9px;';
      dupLayerCelBtn.textContent = 'Dup';
      dupLayerCelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.animator.selectLayerCel(lid, track.activeCelIndex);
        this.animator.addFrame(true, lid);
      });

      quickBtns.appendChild(addLayerCelBtn);
      quickBtns.appendChild(dupLayerCelBtn);
      bottomRow.appendChild(layerStats);
      bottomRow.appendChild(quickBtns);

      layerHeader.appendChild(topRow);
      layerHeader.appendChild(bottomRow);

      layerHeader.addEventListener('click', () => {
        this.animator.selectLayerCel(lid, track.activeCelIndex);
      });

      rowEl.appendChild(layerHeader);

      // Right Cels Track for this Layer
      const celsWrap = document.createElement('div');
      celsWrap.style.cssText = 'display: flex; align-items: center; padding: 4px 6px; gap: 4px;';

      frames.forEach((cel, idx) => {
        const isCelActive = isLayerActive && idx === track.activeCelIndex;
        const dur = Math.max(1, Math.round(Number(cel.duration) || 1));
        const cardWidth = Math.max(TICK_COL_WIDTH, Math.min(dur * TICK_COL_WIDTH + (dur - 1) * 4, 920));

        const card = document.createElement('div');
        card.className = `raster-frame-card ${isCelActive ? 'active' : ''}`;
        card.dataset.layerId = String(lid);
        card.dataset.index = String(idx);
        card.title = `${layerName} • Cel #${idx + 1} (Duration: ${dur} ${dur === 1 ? 'frame' : 'frames'}) — Drag right edge to resize duration`;
        card.style.cssText = `
          position: relative; display: flex; flex-direction: column; justify-content: space-between;
          width: ${cardWidth}px; min-width: ${cardWidth}px; height: 54px;
          background: var(--bg-panel); border: 2px solid ${isCelActive ? 'var(--primary)' : (idx === track.activeCelIndex ? 'var(--border-bright)' : 'var(--border)')};
          border-radius: var(--radius-sm); cursor: pointer; flex-shrink: 0; box-sizing: border-box; padding: 3px 8px 3px 4px;
          ${isCelActive ? 'box-shadow: 0 0 8px rgba(16, 185, 129, 0.35);' : ''}
        `;

        const bodyRow = document.createElement('div');
        bodyRow.style.cssText = 'display: flex; align-items: center; gap: 6px; height: 34px; overflow: hidden;';

        const thumb = document.createElement('canvas');
        thumb.width = 48;
        thumb.height = 32;
        thumb.style.cssText = 'width: 48px; height: 32px; background: #14171a; border-radius: 2px; display: block; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.06);';
        this.renderCelThumb(cel, thumb);
        bodyRow.appendChild(thumb);

        if (dur > 1) {
          const holdBar = document.createElement('div');
          holdBar.style.cssText = 'flex: 1; height: 6px; background: repeating-linear-gradient(90deg, var(--primary) 0px, var(--primary) 6px, transparent 6px, transparent 10px); opacity: 0.45; border-radius: 3px;';
          bodyRow.appendChild(holdBar);
        }

        const footer = document.createElement('div');
        footer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; width: 100%;';

        const label = document.createElement('span');
        label.style.cssText = `font-size: 9px; font-weight: 800; font-family: var(--font-mono); color: ${isCelActive ? 'var(--primary)' : 'var(--text-muted)'};`;
        label.textContent = `#${idx + 1}`;
        footer.appendChild(label);

        const holdBadge = document.createElement('span');
        holdBadge.title = 'Click to edit frame duration (unlimited frames)';
        holdBadge.style.cssText = `
          font-size: 8.5px; font-weight: 800; font-family: var(--font-mono);
          color: ${dur > 1 ? 'var(--bg-dark)' : 'var(--text-muted)'};
          background: ${dur > 1 ? 'var(--primary)' : 'var(--bg-dark)'};
          border-radius: 2px; padding: 0 4px; cursor: pointer;
        `;
        holdBadge.textContent = `${dur}f`;
        holdBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          this.animator.selectLayerCel(lid, idx);
          const holdInput = this.container.querySelector('#raster-hold-input');
          if (holdInput) {
            holdInput.focus();
            holdInput.select();
          }
        });
        footer.appendChild(holdBadge);

        // Right-edge resize handle for dragging cel duration interactively
        const resizeHandle = document.createElement('div');
        resizeHandle.title = 'Drag horizontally to change frame duration';
        resizeHandle.style.cssText = `
          position: absolute; top: 0; right: 0; width: 7px; height: 100%;
          cursor: ew-resize; display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.04); border-left: 1px solid rgba(255,255,255,0.08);
        `;
        resizeHandle.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const startX = e.clientX;
          const startDur = dur;
          const onMove = (me) => {
            const dx = me.clientX - startX;
            const deltaTicks = Math.round(dx / (TICK_COL_WIDTH * 0.65));
            const nextDur = Math.max(1, startDur + deltaTicks);
            if (nextDur !== cel.duration) {
              this.animator.setFrameDuration(nextDur, idx, lid);
            }
          };
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });

        card.appendChild(bodyRow);
        card.appendChild(footer);
        card.appendChild(resizeHandle);

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

      // Quick "+ Frame" button at the end of this layer's track
      const addCard = document.createElement('button');
      addCard.type = 'button';
      addCard.title = `Add Blank Frame to ${layerName}`;
      addCard.style.cssText = `
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
        width: 40px; height: 54px; background: var(--bg-panel-sub); border: 1px dashed var(--border-bright);
        border-radius: var(--radius-sm); color: var(--text-muted); cursor: pointer; flex-shrink: 0; font-size: 14px; font-weight: bold;
      `;
      addCard.innerHTML = `<span>+</span><span style="font-size: 8px; font-weight: 700;">Cel</span>`;
      addCard.addEventListener('click', () => {
        this.animator.selectLayerCel(lid, frames.length - 1);
        this.animator.addFrame(false, lid);
      });
      celsWrap.appendChild(addCard);

      rowEl.appendChild(celsWrap);
      strip.appendChild(rowEl);
    });
  }

  renderCelThumb(cel, canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!cel || !cel.pixels || !cel.width || !cel.height) return;
    const scale = Math.min(canvas.width / cel.width, canvas.height / cel.height);
    const tw = Math.max(1, Math.round(cel.width * scale));
    const th = Math.max(1, Math.round(cel.height * scale));
    const ox = Math.round((canvas.width - tw) / 2);
    const oy = Math.round((canvas.height - th) / 2);

    const off = document.createElement('canvas');
    off.width = cel.width;
    off.height = cel.height;
    const octx = off.getContext('2d');
    const img = octx.createImageData(cel.width, cel.height);
    img.data.set(cel.pixels.subarray(0, img.data.length));
    octx.putImageData(img, 0, 0);

    ctx.globalAlpha = (cel.opacity ?? 255) / 255;
    ctx.drawImage(off, ox, oy, tw, th);
  }
}
