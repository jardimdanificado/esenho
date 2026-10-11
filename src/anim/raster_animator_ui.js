/**
 * =========================================================================
 * Raster Frame-by-Frame Animation Timeline Dock Widget (src/anim/raster_animator_ui.js)
 * Reorganized, clean studio-grade timeline for Esenho Painter.
 * Features:
 * - Structured 2-tier layout (Header/Transport/Timing + Frame Actions & Filmstrip)
 * - Collapsible Onion Skin configuration bar (Past/Future frames, Opacity)
 * - Frame actions: Add blank, Duplicate, Clear, Move Left/Right, Hold Duration (1x..6x), Delete
 * - Collapsible/minimizable filmstrip mode & unclipped GIF/WebM export
 * =========================================================================
 */

export class RasterAnimatorUI {
  constructor(containerEl, animator, options = {}) {
    this.container = containerEl;
    this.animator = animator;
    this.options = options;
    this.visible = false;
    this.collapsed = false;
    this.onionSettingsOpen = false;
    this._thumbCache = new Map();

    this.render();
    this.bindEvents();

    this._unsub = this.animator.subscribe((event, data) => {
      this.handleAnimatorEvent(event, data);
    });
  }

  show() {
    this.visible = true;
    this.container.style.display = 'flex';
    this.updateTimeline();
  }

  hide() {
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
      <div class="raster-anim-dock" style="display: flex; flex-direction: column; width: 100%; background: var(--bg-panel); color: var(--text); font-family: var(--font-sans); font-size: 11px; user-select: none; box-sizing: border-box; position: relative; border-radius: var(--radius-lg); overflow: visible;">
        
        <!-- TIER 1: Header, Transport, Speed, Onion Skin & Export -->
        <div class="raster-anim-bar" style="display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 10px; background: var(--bg-panel-sub); border-bottom: 1px solid var(--border); border-radius: var(--radius-lg) var(--radius-lg) 0 0; overflow-x: auto; scrollbar-width: none;">
          
          <!-- Left: Brand Badge & Frame Counter -->
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <span style="display: inline-flex; align-items: center; gap: 4px; font-weight: 800; font-size: 10px; color: var(--primary); letter-spacing: 0.4px; text-transform: uppercase;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="7" y1="3" x2="7" y2="21"/><line x1="17" y1="3" x2="17" y2="21"/><line x1="2" y1="9" x2="7" y2="9"/><line x1="2" y1="15" x2="7" y2="15"/><line x1="17" y1="9" x2="22" y2="9"/><line x1="17" y1="15" x2="22" y2="15"/></svg>
              ANIM
            </span>
            <span id="raster-frame-counter" style="font-weight: 800; font-family: var(--font-mono); font-size: 10.5px; color: var(--primary); background: var(--bg-dark); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 2px 7px; min-width: 48px; text-align: center;" title="Current Frame / Total Frames">1 / 1</span>
          </div>

          <!-- Center: Transport Controls -->
          <div style="display: flex; align-items: center; gap: 3px; background: var(--bg-dark); padding: 2px 4px; border-radius: var(--radius-sm); border: 1px solid var(--border); flex-shrink: 0;">
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-first" title="First Frame" style="min-width: 24px; height: 24px; padding: 0 5px; font-size: 10px;">⏮</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-prev" title="Previous Frame (,)" style="min-width: 26px; height: 24px; padding: 0 6px; font-size: 10px;">◀</button>
            <button type="button" class="ip-btn ip-mini-btn raster-btn-play" id="raster-btn-play" title="Play / Pause (Space)" style="min-width: 34px; height: 24px; padding: 0 10px; background: var(--primary); color: var(--bg-dark); font-weight: 800; font-size: 11px;">▶</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-next" title="Next Frame (.)" style="min-width: 26px; height: 24px; padding: 0 6px; font-size: 10px;">▶</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-last" title="Last Frame" style="min-width: 24px; height: 24px; padding: 0 5px; font-size: 10px;">⏭</button>
            <div style="width: 1px; height: 14px; background: var(--border); margin: 0 2px;"></div>
            <button type="button" class="ip-btn ip-mini-btn active" id="raster-btn-loop" title="Loop Playback" style="height: 24px; padding: 0 7px; font-size: 10px; font-weight: 700;">Loop</button>
          </div>

          <!-- Right: Onion Skin, FPS, Export & Window Controls -->
          <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;">
            <!-- Onion Skin Pill Group -->
            <div style="display: flex; align-items: center; gap: 2px; background: var(--bg-dark); padding: 2px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-onionskin" title="Toggle Onion Skinning (O)" style="height: 24px; padding: 0 8px; font-size: 10px; font-weight: 700; display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="6" stroke-dasharray="2 2"/><circle cx="15" cy="12" r="6"/></svg>
                <span>Onion</span>
              </button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-onion-cfg" title="Onion Skin Settings (Past/Future Frames & Opacity)" style="height: 24px; padding: 0 5px; font-size: 9px;">▾</button>
            </div>

            <!-- FPS Control -->
            <div style="display: flex; align-items: center; gap: 4px; background: var(--bg-dark); padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border);" title="Playback Frame Rate (FPS)">
              <span style="font-size: 9.5px; color: var(--text-muted); font-weight: 800;">FPS</span>
              <input type="range" id="raster-fps-slider" min="1" max="30" value="12" style="width: 54px; cursor: pointer; accent-color: var(--primary);">
              <span id="raster-fps-val" style="font-family: var(--font-mono); font-size: 10px; font-weight: 800; color: var(--primary); min-width: 18px; text-align: right;">12</span>
            </div>

            <!-- Direct Export Buttons -->
            <div style="display: flex; align-items: center; gap: 2px; background: var(--bg-dark); padding: 2px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <button type="button" class="ip-btn ip-mini-btn" id="raster-export-gif" title="Export Animated GIF (.gif)" style="height: 24px; padding: 0 7px; font-size: 10px; font-weight: 700; color: var(--primary);">GIF</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-export-webm" title="Export WebM Video (.webm)" style="height: 24px; padding: 0 7px; font-size: 10px; font-weight: 700;">WebM</button>
            </div>

            <!-- Collapse & Close -->
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-collapse" title="Collapse / Expand Filmstrip" style="height: 24px; width: 24px; padding: 0; font-size: 10px;">▾</button>
            <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-close" title="Close Animation Timeline" style="height: 24px; width: 24px; padding: 0; font-weight: bold; color: var(--danger);">✕</button>
          </div>
        </div>

        <!-- COLLAPSIBLE ONION SKIN CONFIGURATION ROW -->
        <div id="raster-onion-settings-row" style="display: none; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 12px; background: var(--bg-dark); border-bottom: 1px solid var(--border); font-size: 10px; flex-wrap: wrap;">
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

        <!-- TIER 2: Frame Operations Toolbar + Filmstrip -->
        <div id="raster-tier2-body" style="display: flex; align-items: stretch; min-height: 74px; background: var(--bg-dark); border-radius: 0 0 var(--radius-lg) var(--radius-lg); overflow: hidden;">
          
          <!-- Left Sticky Frame Action Cluster -->
          <div style="display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 6px 8px; background: var(--bg-panel-sub); border-right: 1px solid var(--border); flex-shrink: 0;">
            <div style="display: flex; gap: 3px;">
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-add" title="Add Blank Frame (+)" style="height: 24px; padding: 0 8px; font-size: 10px; font-weight: 800; background: var(--primary); color: var(--bg-dark);">+ Blank</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-dup" title="Duplicate Current Frame" style="height: 24px; padding: 0 7px; font-size: 10px; font-weight: 700;">Dup</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-hold" title="Cycle Frame Hold Duration (1x..4x)" style="height: 24px; padding: 0 6px; font-size: 10px; font-family: var(--font-mono);">1x</button>
            </div>
            <div style="display: flex; gap: 3px;">
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-move-left" title="Move Frame Left" style="height: 22px; padding: 0 6px; font-size: 9.5px;">←</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-move-right" title="Move Frame Right" style="height: 22px; padding: 0 6px; font-size: 9.5px;">→</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-clear" title="Clear Current Frame Pixels" style="height: 22px; padding: 0 6px; font-size: 9.5px;">Clear</button>
              <button type="button" class="ip-btn ip-mini-btn" id="raster-btn-del" title="Delete Current Frame" style="height: 22px; padding: 0 6px; font-size: 9.5px; color: var(--danger);">Del</button>
            </div>
          </div>

          <!-- Scrollable Filmstrip Container -->
          <div id="raster-filmstrip-wrap" style="flex: 1; display: flex; align-items: center; overflow-x: auto; overflow-y: hidden; padding: 6px 10px; gap: 6px; touch-action: pan-x; -webkit-overflow-scrolling: touch;">
            <div id="raster-filmstrip" style="display: flex; align-items: center; gap: 6px; min-width: max-content;"></div>
          </div>
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
    const btnHold = this.container.querySelector('#raster-btn-hold');
    const btnMoveL = this.container.querySelector('#raster-btn-move-left');
    const btnMoveR = this.container.querySelector('#raster-btn-move-right');
    const btnClear = this.container.querySelector('#raster-btn-clear');
    const btnDel = this.container.querySelector('#raster-btn-del');
    const fpsSlider = this.container.querySelector('#raster-fps-slider');
    const btnExportGif = this.container.querySelector('#raster-export-gif');
    const btnExportWebm = this.container.querySelector('#raster-export-webm');
    const btnCollapse = this.container.querySelector('#raster-btn-collapse');
    const tier2Body = this.container.querySelector('#raster-tier2-body');
    const btnClose = this.container.querySelector('#raster-btn-close');

    btnFirst?.addEventListener('click', () => {
      this.animator.goToFrame(0);
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
      this.animator.goToFrame(Math.max(0, this.animator.frames.length - 1));
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

    btnHold?.addEventListener('click', () => {
      const cur = this.animator.frames[this.animator.currentFrameIndex];
      if (!cur) return;
      const nextHold = ((cur.duration || 1) % 4) + 1;
      if (typeof this.animator.setFrameDuration === 'function') {
        this.animator.setFrameDuration(nextHold);
      } else {
        cur.duration = nextHold;
        this.updateTimeline();
      }
      btnHold.textContent = `${nextHold}x`;
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
      if (this.animator.frames.length <= 1 || confirm('Delete current frame?')) {
        this.animator.deleteFrame();
      }
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

    btnCollapse?.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      if (tier2Body) tier2Body.style.display = this.collapsed ? 'none' : 'flex';
      if (onionRow && this.collapsed) onionRow.style.display = 'none';
      btnCollapse.textContent = this.collapsed ? '▴' : '▾';
    });

    btnClose?.addEventListener('click', () => {
      this.hide();
    });

    // Keyboard shortcuts: Space = Play/Pause, ,/. = Prev/Next frame, O = Onion
    window.addEventListener('keydown', (e) => {
      if (!this.visible) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

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
  }

  handleAnimatorEvent(event, data) {
    if (event === 'frameChange') {
      this.updateCounter();
      this.highlightActiveFrame(data.index);
    } else if (event === 'framesUpdated' || event === 'frameContentUpdated') {
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
    if (counter) {
      counter.textContent = `${this.animator.currentFrameIndex + 1} / ${this.animator.frames.length}`;
    }
    const btnHold = this.container.querySelector('#raster-btn-hold');
    const cur = this.animator.frames[this.animator.currentFrameIndex];
    if (btnHold && cur) {
      btnHold.textContent = `${cur.duration || 1}x`;
    }
  }

  highlightActiveFrame(activeIndex) {
    const strip = this.container.querySelector('#raster-filmstrip');
    if (!strip) return;

    const cards = strip.querySelectorAll('.raster-frame-card');
    cards.forEach((card, idx) => {
      if (idx === activeIndex) {
        card.classList.add('active');
        card.style.borderColor = 'var(--primary)';
        card.style.boxShadow = '0 0 8px rgba(250, 189, 47, 0.45)';
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      } else {
        card.classList.remove('active');
        card.style.borderColor = 'var(--border)';
        card.style.boxShadow = 'none';
      }
    });
  }

  updateTimeline() {
    this.updateCounter();
    const strip = this.container.querySelector('#raster-filmstrip');
    if (!strip) return;

    strip.innerHTML = '';
    const frames = this.animator.frames;

    frames.forEach((frame, idx) => {
      const isAct = idx === this.animator.currentFrameIndex;
      const card = document.createElement('div');
      card.className = `raster-frame-card ${isAct ? 'active' : ''}`;
      card.dataset.index = String(idx);
      card.style.cssText = `
        position: relative; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
        width: 64px; height: 60px; background: var(--bg-panel); border: 2px solid ${isAct ? 'var(--primary)' : 'var(--border)'};
        border-radius: var(--radius-sm); cursor: pointer; flex-shrink: 0; box-sizing: border-box; padding: 3px;
        transition: transform 0.1s ease, border-color 0.1s ease;
        ${isAct ? 'box-shadow: 0 0 8px rgba(250, 189, 47, 0.45);' : ''}
      `;

      const thumb = document.createElement('canvas');
      thumb.width = 56;
      thumb.height = 38;
      thumb.style.cssText = 'width: 56px; height: 38px; background: #121415; border-radius: 2px; display: block;';
      this.renderFrameThumb(frame, thumb);

      const footer = document.createElement('div');
      footer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0 2px;';

      const label = document.createElement('span');
      label.style.cssText = `font-size: 9px; font-weight: 800; font-family: var(--font-mono); color: ${isAct ? 'var(--primary)' : 'var(--text-muted)'};`;
      label.textContent = `#${idx + 1}`;
      footer.appendChild(label);

      if ((frame.duration || 1) > 1) {
        const holdBadge = document.createElement('span');
        holdBadge.style.cssText = 'font-size: 8.5px; font-weight: 800; font-family: var(--font-mono); color: var(--bg-dark); background: var(--primary); border-radius: 2px; padding: 0 3px;';
        holdBadge.textContent = `${frame.duration}x`;
        footer.appendChild(holdBadge);
      }

      card.appendChild(thumb);
      card.appendChild(footer);

      card.addEventListener('click', () => {
        this.animator.goToFrame(idx);
      });

      strip.appendChild(card);
    });

    // Quick "+ Frame" tail card at the end of the filmstrip
    const addCard = document.createElement('button');
    addCard.type = 'button';
    addCard.title = 'Add Blank Frame';
    addCard.style.cssText = `
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
      width: 46px; height: 60px; background: var(--bg-panel-sub); border: 1.5px dashed var(--border-bright);
      border-radius: var(--radius-sm); color: var(--text-muted); cursor: pointer; flex-shrink: 0; font-size: 16px; font-weight: bold;
    `;
    addCard.innerHTML = `<span>+</span><span style="font-size: 8.5px; font-weight: 700;">New</span>`;
    addCard.addEventListener('click', () => {
      this.animator.addFrame(false);
    });
    strip.appendChild(addCard);
  }

  renderFrameThumb(frame, canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const docW = this.animator.docWidth;
    const docH = this.animator.docHeight;
    const scale = Math.min(canvas.width / docW, canvas.height / docH);
    const tw = Math.round(docW * scale);
    const th = Math.round(docH * scale);
    const ox = Math.round((canvas.width - tw) / 2);
    const oy = Math.round((canvas.height - th) / 2);

    for (const [, ldata] of frame.layers.entries()) {
      if (!ldata.visible || ldata.opacity === 0 || !ldata.pixels) continue;
      const off = document.createElement('canvas');
      off.width = ldata.width;
      off.height = ldata.height;
      const octx = off.getContext('2d');
      const img = octx.createImageData(ldata.width, ldata.height);
      img.data.set(ldata.pixels);
      octx.putImageData(img, 0, 0);

      ctx.globalAlpha = (ldata.opacity || 255) / 255;
      ctx.drawImage(off, ox, oy, tw, th);
    }
  }
}
