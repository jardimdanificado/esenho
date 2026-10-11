/**
 * =========================================================================
 * Raster Frame-by-Frame Animation Timeline Dock Widget (src/anim/raster_animator_ui.js)
 * Clean, fluid, touch & desktop timeline for Esenho Painter.
 * Features:
 * - Transport controls: Play/Stop, Prev, Next, Loop
 * - Frame management: Add blank frame, Duplicate frame, Delete frame
 * - Live Onion Skin toggle & configuration (previous & future frame tints)
 * - FPS slider & tabular readout
 * - Thumbnail strip with drag-to-scrub & touch swipe
 * - Export as Animated GIF89a & WebM video
 * =========================================================================
 */

export class RasterAnimatorUI {
  constructor(containerEl, animator, options = {}) {
    this.container = containerEl;
    this.animator = animator;
    this.options = options;
    this.visible = false;
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
      <div class="raster-anim-dock" style="display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; background: var(--bg-panel); color: var(--text); font-family: var(--font-sans); font-size: 11px; user-select: none; box-sizing: border-box; position: relative;">
        <!-- Top Control Bar -->
        <div class="raster-anim-bar" style="display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 4px 10px; background: var(--bg-panel-sub); border-bottom: 1px solid var(--border); flex-wrap: wrap; min-height: 38px;">
          
          <!-- Transport Section -->
          <div style="display: flex; align-items: center; gap: 4px;">
            <button type="button" class="ip-btn raster-btn-play" id="raster-btn-play" title="Play/Pause (Space)" style="min-width: 34px; height: 28px; background: var(--primary); color: var(--bg-dark); font-weight: bold; font-size: 13px;">▶</button>
            <button type="button" class="ip-btn" id="raster-btn-prev" title="Previous Frame (,)" style="min-width: 28px; height: 28px;">◀</button>
            <button type="button" class="ip-btn" id="raster-btn-next" title="Next Frame (.)" style="min-width: 28px; height: 28px;">▶</button>
            <button type="button" class="ip-btn active" id="raster-btn-loop" title="Loop Playback" style="min-width: 28px; height: 28px; font-size: 10px;">🔁</button>
            
            <div style="height: 18px; width: 1px; background: var(--border); margin: 0 4px;"></div>
            
            <span id="raster-frame-counter" style="font-weight: bold; font-family: var(--font-mono); font-size: 11px; color: var(--primary); min-width: 55px; text-align: center;">1 / 1</span>
          </div>

          <!-- Onion Skin & Frame Operations -->
          <div style="display: flex; align-items: center; gap: 4px;">
            <button type="button" class="ip-btn" id="raster-btn-onionskin" title="Toggle Onion Skinning (O)" style="height: 28px; padding: 0 8px; font-weight: bold; display: flex; align-items: center; gap: 4px;">
              <span style="font-size: 13px; line-height: 1;">🧅</span>
              <span>Onion</span>
            </button>
            
            <button type="button" class="ip-btn" id="raster-btn-add" title="Add Blank Frame (+)" style="height: 28px; padding: 0 8px; display: flex; align-items: center; gap: 3px;">
              <span style="font-weight: 800; font-size: 13px;">+</span>
              <span>Frame</span>
            </button>

            <button type="button" class="ip-btn" id="raster-btn-dup" title="Duplicate Current Frame" style="height: 28px; padding: 0 8px;">⎘ Dup</button>
            <button type="button" class="ip-btn" id="raster-btn-del" title="Delete Frame" style="height: 28px; padding: 0 8px; color: var(--danger);">🗑</button>
          </div>

          <!-- FPS, Export & Close -->
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 4px; background: var(--bg-dark); padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <span style="font-size: 10px; color: var(--text-muted); font-weight: bold;">FPS</span>
              <input type="range" id="raster-fps-slider" min="1" max="30" value="12" style="width: 55px; cursor: pointer;">
              <span id="raster-fps-val" style="font-family: var(--font-mono); font-size: 10px; color: var(--text-bright); min-width: 18px;">12</span>
            </div>

            <div class="menu-container">
              <button type="button" class="ip-btn" id="raster-btn-export" style="height: 28px; padding: 0 8px; font-weight: bold; color: var(--primary); border-color: var(--primary);">
                <span>Export Anim</span>
                <span style="font-size: 8px; margin-left: 2px;">▼</span>
              </button>
              <div id="raster-export-dropdown" class="dropdown-menu" style="right: 0; left: auto; min-width: 140px;">
                <button type="button" class="menu-item" id="raster-export-gif">
                  <span>Animated GIF (.gif)</span>
                </button>
                <button type="button" class="menu-item" id="raster-export-webm">
                  <span>WebM Video (.webm)</span>
                </button>
              </div>
            </div>

            <button type="button" class="ip-btn" id="raster-btn-close" title="Close Animation Timeline" style="height: 28px; width: 28px; padding: 0; font-weight: bold;">✕</button>
          </div>
        </div>

        <!-- Frame Filmstrip Scrub Container -->
        <div id="raster-filmstrip-wrap" style="flex: 1; display: flex; align-items: center; overflow-x: auto; overflow-y: hidden; padding: 6px 12px; gap: 8px; background: var(--bg-dark); touch-action: pan-x; -webkit-overflow-scrolling: touch;">
          <div id="raster-filmstrip" style="display: flex; align-items: center; gap: 6px; min-width: max-content;"></div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const btnPlay = this.container.querySelector('#raster-btn-play');
    const btnPrev = this.container.querySelector('#raster-btn-prev');
    const btnNext = this.container.querySelector('#raster-btn-next');
    const btnLoop = this.container.querySelector('#raster-btn-loop');
    const btnOnion = this.container.querySelector('#raster-btn-onionskin');
    const btnAdd = this.container.querySelector('#raster-btn-add');
    const btnDup = this.container.querySelector('#raster-btn-dup');
    const btnDel = this.container.querySelector('#raster-btn-del');
    const fpsSlider = this.container.querySelector('#raster-fps-slider');
    const btnExport = this.container.querySelector('#raster-btn-export');
    const exportDrop = this.container.querySelector('#raster-export-dropdown');
    const btnExportGif = this.container.querySelector('#raster-export-gif');
    const btnExportWebm = this.container.querySelector('#raster-export-webm');
    const btnClose = this.container.querySelector('#raster-btn-close');

    btnPlay?.addEventListener('click', () => {
      this.animator.togglePlay();
    });

    btnPrev?.addEventListener('click', () => {
      this.animator.prevFrame();
    });

    btnNext?.addEventListener('click', () => {
      this.animator.nextFrame();
    });

    btnLoop?.addEventListener('click', () => {
      this.animator.loop = !this.animator.loop;
      btnLoop.classList.toggle('active', this.animator.loop);
    });

    btnOnion?.addEventListener('click', () => {
      this.animator.toggleOnionSkin();
      btnOnion.classList.toggle('active', this.animator.onionSkin.enabled);
    });

    btnAdd?.addEventListener('click', () => {
      this.animator.addFrame(false);
    });

    btnDup?.addEventListener('click', () => {
      this.animator.addFrame(true);
    });

    btnDel?.addEventListener('click', () => {
      if (confirm('Delete current frame?')) {
        this.animator.deleteFrame();
      }
    });

    fpsSlider?.addEventListener('input', (e) => {
      const fps = parseInt(e.target.value, 10) || 12;
      this.animator.setFps(fps);
      const valEl = this.container.querySelector('#raster-fps-val');
      if (valEl) valEl.textContent = String(fps);
    });

    btnExport?.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDrop?.classList.toggle('active');
    });

    document.addEventListener('click', () => {
      exportDrop?.classList.remove('active');
    });

    btnExportGif?.addEventListener('click', async () => {
      exportDrop?.classList.remove('active');
      const origText = btnExport.innerHTML;
      btnExport.innerHTML = '<span>Exporting GIF...</span>';
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
        btnExport.innerHTML = origText;
      }
    });

    btnExportWebm?.addEventListener('click', async () => {
      exportDrop?.classList.remove('active');
      const origText = btnExport.innerHTML;
      btnExport.innerHTML = '<span>Exporting WebM...</span>';
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
        btnExport.innerHTML = origText;
      }
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
    } else if (event === 'framesUpdated') {
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
    }
  }

  updateCounter() {
    const counter = this.container.querySelector('#raster-frame-counter');
    if (counter) {
      counter.textContent = `${this.animator.currentFrameIndex + 1} / ${this.animator.frames.length}`;
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
        card.style.boxShadow = '0 0 8px rgba(250, 189, 47, 0.5)';
        // Ensure visible in view
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
      const card = document.createElement('div');
      card.className = `raster-frame-card ${idx === this.animator.currentFrameIndex ? 'active' : ''}`;
      card.dataset.index = String(idx);
      card.style.cssText = `
        display: flex; flex-direction: column; align-items: center; justify-content: space-between;
        width: 60px; height: 58px; background: var(--bg-panel); border: 2px solid ${idx === this.animator.currentFrameIndex ? 'var(--primary)' : 'var(--border)'};
        border-radius: var(--radius-sm); cursor: pointer; flex-shrink: 0; box-sizing: border-box; padding: 2px;
        transition: transform 0.1s ease, border-color 0.1s ease;
      `;

      // Mini Canvas Thumbnail Preview
      const thumb = document.createElement('canvas');
      thumb.width = 52;
      thumb.height = 36;
      thumb.style.cssText = 'width: 52px; height: 36px; background: #121415; border-radius: 2px;';
      this.renderFrameThumb(frame, thumb);

      const label = document.createElement('span');
      label.style.cssText = 'font-size: 9px; font-weight: bold; font-family: var(--font-mono); color: var(--text-muted);';
      label.textContent = String(idx + 1);

      card.appendChild(thumb);
      card.appendChild(label);

      card.addEventListener('click', () => {
        this.animator.goToFrame(idx);
      });

      strip.appendChild(card);
    });
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

    // Create offscreen layer buffer
    for (const [lid, ldata] of frame.layers.entries()) {
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
