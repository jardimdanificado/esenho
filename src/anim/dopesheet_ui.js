/**
 * =========================================================================
 * Wesenho DopeSheet UI Widget (src/anim/dopesheet_ui.js)
 * Interactive Bottom Dock for Frame Scrubbing, Playback, Auto-Keyframing
 * and Parameter Tracks across all Quadro engine subsystems.
 * =========================================================================
 */

import * as DopeSheetModule from './dopesheet.js';

const PARAMETER_REGISTRY = DopeSheetModule.PARAMETER_REGISTRY || {};
const extractLiveObjectProperties = typeof DopeSheetModule.extractLiveObjectProperties === 'function'
  ? DopeSheetModule.extractLiveObjectProperties
  : function(o) { return {}; };
const getParameterGroups = typeof DopeSheetModule.getParameterGroups === 'function' ? DopeSheetModule.getParameterGroups : function() {
  const groups = {};
  for (const [key, def] of Object.entries(PARAMETER_REGISTRY)) {
    const groupName = def.group || 'General';
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push({ key, ...def });
  }
  return groups;
};

export class DopeSheetUI {
  constructor(containerEl, dopeSheet, onFrameChange = null) {
    this.container = containerEl;
    this.ds = dopeSheet;
    this.onFrameChange = onFrameChange;
    this.frameWidth = 14; // pixels per frame on timeline ruler
    this.selectedObjectId = null;
    this.isScrubbing = false;
    this._playInterval = null;
    this._activeMenu = null;

    this.render();
    this.ds.subscribe((event, payload) => {
      if (event === 'frameChanged') {
        this.updatePlayhead();
        if (this.onFrameChange) this.onFrameChange(this.ds.currentFrame, this.ds.sampleAll(this.ds.currentFrame));
      } else if (event === 'playStateChanged') {
        this.updatePlayButton();
      } else {
        this.updateGrid();
      }
    });
  }

  render() {
    this.container.innerHTML = `
      <div class="dopesheet-panel" style="display: flex; flex-direction: column; height: 100%; width: 100%; background: #1d2021; color: #ebdbb2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; font-size: 11px; border-top: 2px solid #3c3836; user-select: none; box-sizing: border-box; position: relative;">
        
        <!-- Top Resize Handle / Ear -->
        <div id="ds-resize-handle" title="Drag vertically to resize Timeline height" style="position: absolute; top: -6px; left: 0; right: 0; height: 12px; cursor: ns-resize; z-index: 100; display: flex; align-items: center; justify-content: center;">
          <div class="ds-resize-ear" style="width: 56px; height: 4px; background: #665c54; border-radius: 2px; transition: background 0.15s, transform 0.15s; pointer-events: none;"></div>
        </div>

        <!-- Header Toolbar -->
        <div class="ds-toolbar" style="display: flex; align-items: center; gap: 8px; padding: 4px 10px; background: #282828; border-bottom: 1px solid #3c3836; flex-wrap: wrap; z-index: 30;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <button id="ds-btn-prev" class="ds-btn" title="Previous Frame (Left Arrow)" style="background: #3c3836; color: #ebdbb2; border: 1px solid #504945; border-radius: 4px; padding: 3px 8px; cursor: pointer;">⏮</button>
            <button id="ds-btn-play" class="ds-btn" title="Play / Pause (Space)" style="background: #d79921; color: #282828; font-weight: bold; border: 1px solid #fabd2f; border-radius: 4px; padding: 3px 12px; cursor: pointer;">▶</button>
            <button id="ds-btn-next" class="ds-btn" title="Next Frame (Right Arrow)" style="background: #3c3836; color: #ebdbb2; border: 1px solid #504945; border-radius: 4px; padding: 3px 8px; cursor: pointer;">⏭</button>
            <button id="ds-btn-loop" class="ds-btn" title="Toggle Loop" style="background: ${this.ds.loop ? '#458588' : '#3c3836'}; color: #ebdbb2; border: 1px solid #504945; border-radius: 4px; padding: 3px 8px; cursor: pointer;">🔁</button>
          </div>

          <div style="height: 16px; width: 1px; background: #504945; margin: 0 4px;"></div>

          <div style="display: flex; align-items: center; gap: 6px;">
            <span>Frame:</span>
            <input id="ds-input-frame" type="number" min="1" max="${this.ds.totalFrames}" value="${this.ds.currentFrame}" style="width: 48px; background: #1d2021; color: #fabd2f; border: 1px solid #504945; border-radius: 3px; padding: 2px 4px; text-align: center; font-weight: bold;">
            <span style="color: #928374;">/</span>
            <input id="ds-input-total" type="number" min="1" max="9999" value="${this.ds.totalFrames}" style="width: 48px; background: #1d2021; color: #ebdbb2; border: 1px solid #504945; border-radius: 3px; padding: 2px 4px; text-align: center;">
          </div>

          <div style="display: flex; align-items: center; gap: 6px;">
            <span>FPS:</span>
            <select id="ds-select-fps" style="background: #1d2021; color: #ebdbb2; border: 1px solid #504945; border-radius: 3px; padding: 2px;">
              <option value="12" ${this.ds.fps === 12 ? 'selected' : ''}>12</option>
              <option value="24" ${this.ds.fps === 24 ? 'selected' : ''}>24</option>
              <option value="30" ${this.ds.fps === 30 ? 'selected' : ''}>30</option>
              <option value="60" ${this.ds.fps === 60 ? 'selected' : ''}>60</option>
            </select>
          </div>

          <div style="height: 16px; width: 1px; background: #504945; margin: 0 4px;"></div>

          <button id="ds-btn-add-kf" class="ds-btn" title="Add Keyframe at Current Frame" style="background: #b8bb26; color: #282828; font-weight: bold; border: 1px solid #b8bb26; border-radius: 4px; padding: 3px 8px; cursor: pointer;">◆ Add Keyframe</button>
          <button id="ds-btn-del-kf" class="ds-btn" title="Remove Keyframe" style="background: #ea6962; color: #282828; font-weight: bold; border: 1px solid #ea6962; border-radius: 4px; padding: 3px 8px; cursor: pointer;">◇ Remove</button>
          
          <button id="ds-btn-autokf" class="ds-btn" title="Toggle Auto-Keyframe Recording" style="background: ${this.ds.autoKeyframe ? '#cc241d' : '#3c3836'}; color: ${this.ds.autoKeyframe ? '#ffffff' : '#ebdbb2'}; border: 1px solid ${this.ds.autoKeyframe ? '#fb4934' : '#504945'}; border-radius: 4px; padding: 3px 10px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: bold; margin-left: auto;">
            <span id="ds-autokf-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${this.ds.autoKeyframe ? '#fb4934' : '#7c6f64'}; box-shadow: ${this.ds.autoKeyframe ? '0 0 6px #fb4934' : 'none'};"></span>
            Auto-Keyframe
          </button>
        </div>

        <!-- Main Body: Split View (Channel Tree on Left, Timeline Grid on Right) -->
        <div id="ds-body" style="display: flex; flex: 1; min-height: 0; position: relative; overflow: hidden;">
          
          <!-- Left: Channels Tree Sidebar -->
          <div id="ds-tree-sidebar" style="width: 250px; min-width: 200px; max-width: 340px; background: #282828; border-right: 1px solid #3c3836; display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden;">
            <!-- Tree Header (Matches 24px ruler height exactly) -->
            <div style="height: 24px; min-height: 24px; padding: 0 8px; background: #32302f; border-bottom: 1px solid #3c3836; font-weight: bold; color: #a89984; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;">
              <span>Layers & Property Tracks</span>
              <span style="font-size: 9px; color: #7c6f64;">Quadro ABI</span>
            </div>
            <!-- Scrollable Track Labels Container -->
            <div id="ds-tree-scroll" style="flex: 1; overflow-y: hidden; overflow-x: hidden; position: relative;">
              <div id="ds-tree-rows"></div>
            </div>
          </div>

          <!-- Right: Timeline Grid & Ruler Scrollable View -->
          <div id="ds-timeline-scroll" style="flex: 1; overflow: auto; position: relative; background: #1d2021;">
            
            <!-- Timeline Ruler (Top Sticky) -->
            <div id="ds-ruler-container" style="position: sticky; top: 0; left: 0; height: 24px; background: #32302f; border-bottom: 1px solid #3c3836; z-index: 10; cursor: pointer; width: max-content;">
              <canvas id="ds-ruler-canvas" style="display: block; height: 24px;"></canvas>
            </div>

            <!-- Grid Keyframe Rows -->
            <div id="ds-grid-rows" style="position: relative; width: max-content; cursor: crosshair;">
              <canvas id="ds-grid-canvas" style="display: block;"></canvas>
            </div>

            <!-- Playhead Vertical Bar -->
            <div id="ds-playhead" style="position: absolute; top: 0; bottom: 0; width: 2px; background: #fb4934; z-index: 20; pointer-events: none; left: 0;">
              <div style="position: absolute; top: 0; left: -5px; width: 12px; height: 14px; background: #fb4934; clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%);"></div>
            </div>

          </div>

        </div>

      </div>
    `;

    this.bindEvents();
    this.updateGrid();
    this.updatePlayhead();
  }

  bindEvents() {
    // ── Isolate Timeline completely from Canvas Underlying Events ──
    const stopEvt = (e) => e.stopPropagation();
    const eventsToStop = [
      'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
      'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'contextmenu',
      'wheel', 'touchstart', 'touchmove', 'touchend'
    ];
    eventsToStop.forEach(evtName => {
      this.container.addEventListener(evtName, stopEvt);
    });

    // ── Resizable Dock Height ("Orelha" / Top Grip Handle) ──
    try {
      const savedH = localStorage.getItem('wesenho_timeline_height');
      if (savedH && Number(savedH) >= 100) {
        this.container.style.height = `${Number(savedH)}px`;
      }
    } catch (_) {}

    const resizeHandle = this.container.querySelector('#ds-resize-handle');
    const resizeEar = this.container.querySelector('.ds-resize-ear');
    if (resizeHandle) {
      let isResizing = false;
      let startY = 0;
      let startH = 0;

      resizeHandle.onmouseenter = () => {
        if (resizeEar) {
          resizeEar.style.background = '#fabd2f';
          resizeEar.style.transform = 'scaleY(1.6)';
        }
      };
      resizeHandle.onmouseleave = () => {
        if (!isResizing && resizeEar) {
          resizeEar.style.background = '#665c54';
          resizeEar.style.transform = 'scaleY(1)';
        }
      };

      const onResizeMove = (e) => {
        if (!isResizing) return;
        e.stopPropagation();
        e.preventDefault();
        const dy = startY - e.clientY;
        const maxH = Math.max(200, window.innerHeight - 80);
        const newH = Math.max(100, Math.min(maxH, startH + dy));
        this.container.style.height = `${newH}px`;
        try {
          localStorage.setItem('wesenho_timeline_height', String(newH));
        } catch (_) {}
      };

      const onResizeUp = (e) => {
        if (isResizing) {
          e.stopPropagation();
          e.preventDefault();
          isResizing = false;
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          if (resizeEar) {
            resizeEar.style.background = '#665c54';
            resizeEar.style.transform = 'scaleY(1)';
          }
          window.removeEventListener('pointermove', onResizeMove, { capture: true });
          window.removeEventListener('pointerup', onResizeUp, { capture: true });
          this.updateGrid();
        }
      };

      resizeHandle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isResizing = true;
        startY = e.clientY;
        startH = this.container.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        if (resizeEar) {
          resizeEar.style.background = '#fabd2f';
          resizeEar.style.transform = 'scaleY(1.6)';
        }
        window.addEventListener('pointermove', onResizeMove, { capture: true });
        window.addEventListener('pointerup', onResizeUp, { capture: true });
      });
    }

    // ── Synchronous Vertical Scrolling between Track Labels and Grid Rows ──
    const treeScroll = this.container.querySelector('#ds-tree-scroll');
    const timelineScroll = this.container.querySelector('#ds-timeline-scroll');

    let isSyncingTree = false;
    let isSyncingTimeline = false;

    if (treeScroll && timelineScroll) {
      treeScroll.addEventListener('scroll', () => {
        if (isSyncingTree) { isSyncingTree = false; return; }
        isSyncingTimeline = true;
        timelineScroll.scrollTop = treeScroll.scrollTop;
      });

      timelineScroll.addEventListener('scroll', () => {
        if (isSyncingTimeline) { isSyncingTimeline = false; return; }
        isSyncingTree = true;
        treeScroll.scrollTop = timelineScroll.scrollTop;
      });

      treeScroll.addEventListener('wheel', (e) => {
        timelineScroll.scrollTop += e.deltaY;
      }, { passive: true });
    }

    const playBtn = this.container.querySelector('#ds-btn-play');
    const prevBtn = this.container.querySelector('#ds-btn-prev');
    const nextBtn = this.container.querySelector('#ds-btn-next');
    const loopBtn = this.container.querySelector('#ds-btn-loop');
    const frameInput = this.container.querySelector('#ds-input-frame');
    const totalInput = this.container.querySelector('#ds-input-total');
    const fpsSelect = this.container.querySelector('#ds-select-fps');
    const autoKfBtn = this.container.querySelector('#ds-btn-autokf');
    const addKfBtn = this.container.querySelector('#ds-btn-add-kf');
    const delKfBtn = this.container.querySelector('#ds-btn-del-kf');

    playBtn.onclick = () => this.togglePlayback();
    prevBtn.onclick = () => this.ds.prevFrame();
    nextBtn.onclick = () => this.ds.nextFrame();
    loopBtn.onclick = () => {
      this.ds.loop = !this.ds.loop;
      loopBtn.style.background = this.ds.loop ? '#458588' : '#3c3836';
    };
    frameInput.onchange = (e) => this.ds.setFrame(Number(e.target.value));
    totalInput.onchange = (e) => {
      this.ds.totalFrames = Math.max(1, Number(e.target.value));
      this.updateGrid();
    };
    fpsSelect.onchange = (e) => {
      this.ds.fps = Number(e.target.value);
    };

    autoKfBtn.onclick = () => {
      this.ds.autoKeyframe = !this.ds.autoKeyframe;
      this.updateAutoKeyframeUI();
    };

    addKfBtn.onclick = () => {
      let targetId = this.selectedObjectId;
      if (!targetId && typeof window !== 'undefined' && window.doc) {
        const sel = window.doc.getSelectedObjects ? window.doc.getSelectedObjects() : [];
        if (sel && sel.length > 0) targetId = sel[0].id;
        else if (window.doc.objects && window.doc.objects.length > 0) targetId = window.doc.objects[0].id;
      }
      if (targetId) {
        const obj = this.ds.getOrCreateObject(targetId);
        let liveObj = null;
        if (typeof window !== 'undefined' && window.doc) {
          liveObj = window.doc.findObject ? window.doc.findObject(targetId) : window.doc.objects.find(o => o.id === targetId);
        }

        if (liveObj) {
          const props = extractLiveObjectProperties(liveObj);
          for (const [key, val] of Object.entries(props)) {
            if (val !== undefined && val !== null) {
              obj.setKeyframe(key, this.ds.currentFrame, val);
            }
          }
        } else {
          for (const [key, ch] of obj.channels.entries()) {
            const val = ch.sample(this.ds.currentFrame);
            ch.addKeyframe(this.ds.currentFrame, val);
          }
        }
        this.selectedObjectId = targetId;
        this.updateGrid();
      }
    };

    delKfBtn.onclick = () => {
      let targetId = this.selectedObjectId;
      if (!targetId && typeof window !== 'undefined' && window.doc) {
        const sel = window.doc.getSelectedObjects ? window.doc.getSelectedObjects() : [];
        if (sel && sel.length > 0) targetId = sel[0].id;
      }
      if (targetId) {
        const obj = this.ds.objects.get(targetId);
        if (obj) {
          for (const ch of obj.channels.values()) {
            ch.removeKeyframe(this.ds.currentFrame);
          }
          this.updateGrid();
        }
      }
    };

    // ── Scrubbing on Timeline Ruler & Grid Rows ──
    const rulerEl = this.container.querySelector('#ds-ruler-container');
    const gridEl = this.container.querySelector('#ds-grid-rows');
    const onScrub = (e) => {
      const rect = rulerEl.getBoundingClientRect();
      const scrollEl = this.container.querySelector('#ds-timeline-scroll');
      const clickX = e.clientX - rect.left;
      const targetFrame = Math.max(1, Math.min(this.ds.totalFrames, Math.floor(clickX / this.frameWidth) + 1));
      this.ds.setFrame(targetFrame);
    };

    const startScrub = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.isScrubbing = true;
      onScrub(e);
      window.addEventListener('pointermove', rulerMove, { capture: true });
      window.addEventListener('pointerup', rulerUp, { capture: true });
    };

    const rulerMove = (e) => {
      if (this.isScrubbing) {
        e.stopPropagation();
        e.preventDefault();
        onScrub(e);
      }
    };

    const rulerUp = (e) => {
      if (this.isScrubbing) {
        e.stopPropagation();
        e.preventDefault();
      }
      this.isScrubbing = false;
      window.removeEventListener('pointermove', rulerMove, { capture: true });
      window.removeEventListener('pointerup', rulerUp, { capture: true });
    };

    if (rulerEl) rulerEl.onpointerdown = startScrub;
    if (gridEl) gridEl.onpointerdown = startScrub;

    // Dismiss active popup menus on outside click
    window.addEventListener('pointerdown', () => {
      this.closeActiveMenu();
    });
  }

  updateAutoKeyframeUI() {
    const autoKfBtn = this.container.querySelector('#ds-btn-autokf');
    const autoKfDot = this.container.querySelector('#ds-autokf-dot');
    if (autoKfBtn && autoKfDot) {
      const active = !!this.ds.autoKeyframe;
      autoKfBtn.style.background = active ? '#cc241d' : '#3c3836';
      autoKfBtn.style.color = active ? '#ffffff' : '#ebdbb2';
      autoKfBtn.style.borderColor = active ? '#fb4934' : '#504945';
      autoKfDot.style.background = active ? '#fb4934' : '#7c6f64';
      autoKfDot.style.boxShadow = active ? '0 0 6px #fb4934' : 'none';
    }
  }

  togglePlayback() {
    if (this.ds.isPlaying) {
      this.ds.pause();
      if (this._playInterval) clearInterval(this._playInterval);
      this._playInterval = null;
    } else {
      this.ds.play();
      const intervalMs = 1000 / this.ds.fps;
      this._playInterval = setInterval(() => {
        this.ds.nextFrame();
      }, intervalMs);
    }
  }

  updatePlayButton() {
    const playBtn = this.container.querySelector('#ds-btn-play');
    if (playBtn) {
      playBtn.textContent = this.ds.isPlaying ? '⏸' : '▶';
      playBtn.style.background = this.ds.isPlaying ? '#fe8019' : '#d79921';
    }
  }

  updatePlayhead() {
    const frameInput = this.container.querySelector('#ds-input-frame');
    if (frameInput) frameInput.value = this.ds.currentFrame;

    const playheadEl = this.container.querySelector('#ds-playhead');
    if (playheadEl) {
      const pos = (this.ds.currentFrame - 1) * this.frameWidth + this.frameWidth / 2;
      playheadEl.style.left = `${pos}px`;
    }
  }

  closeActiveMenu() {
    if (this._activeMenu) {
      this._activeMenu.remove();
      this._activeMenu = null;
    }
  }

  showAddPropertyMenu(obj, targetBtn) {
    this.closeActiveMenu();

    const menu = document.createElement('div');
    menu.className = 'ds-prop-menu';
    menu.style.position = 'absolute';
    menu.style.background = '#282828';
    menu.style.border = '1px solid #504945';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 6px 20px rgba(0,0,0,0.6)';
    menu.style.zIndex = '1000';
    menu.style.padding = '6px';
    menu.style.width = '240px';
    menu.style.maxHeight = '280px';
    menu.style.overflowY = 'auto';
    menu.style.fontSize = '11px';
    menu.style.color = '#ebdbb2';

    const rect = targetBtn.getBoundingClientRect();
    const panelRect = this.container.getBoundingClientRect();
    menu.style.left = `${Math.min(panelRect.width - 250, Math.max(10, rect.left - panelRect.left))}px`;
    menu.style.top = `${Math.max(10, rect.bottom - panelRect.top + 4)}px`;

    menu.onpointerdown = (e) => e.stopPropagation();

    const groups = getParameterGroups();
    let html = `<div style="font-weight: bold; color: #fabd2f; padding: 2px 6px; margin-bottom: 4px; border-bottom: 1px solid #3c3836;">+ Add Quadro Property Track</div>`;

    for (const [groupName, params] of Object.entries(groups)) {
      html += `<div style="font-size: 10px; font-weight: bold; color: #a89984; padding: 4px 6px 2px 6px; text-transform: uppercase;">${groupName}</div>`;
      for (const p of params) {
        const alreadyHas = obj.channels.has(p.key);
        html += `
          <div class="ds-prop-item" data-key="${p.key}" style="padding: 3px 8px; margin: 1px 0; border-radius: 3px; cursor: ${alreadyHas ? 'default' : 'pointer'}; opacity: ${alreadyHas ? 0.4 : 1.0}; display: flex; justify-content: space-between; align-items: center; background: ${alreadyHas ? 'transparent' : '#1d2021'};">
            <span>${p.label}</span>
            <span style="font-size: 9px; color: #7c6f64;">${p.unit || p.type}</span>
          </div>
        `;
      }
    }

    menu.innerHTML = html;

    menu.querySelectorAll('.ds-prop-item').forEach(item => {
      const key = item.getAttribute('data-key');
      if (!obj.channels.has(key)) {
        item.onmouseenter = () => item.style.background = '#3c3836';
        item.onmouseleave = () => item.style.background = '#1d2021';
        item.onclick = (e) => {
          e.stopPropagation();
          obj.getOrCreateChannel(key);
          // Sample current frame value or initial
          const ch = obj.channels.get(key);
          if (ch.keyframes.length === 0) {
            ch.addKeyframe(this.ds.currentFrame, ch.defaultValue);
          }
          this.closeActiveMenu();
          this.updateGrid();
        };
      }
    });

    this.container.querySelector('.dopesheet-panel').appendChild(menu);
    this._activeMenu = menu;
  }

  updateGrid() {
    const totalW = Math.max(800, this.ds.totalFrames * this.frameWidth + 40);
    const treeRowsEl = this.container.querySelector('#ds-tree-rows');
    const rulerCanvas = this.container.querySelector('#ds-ruler-canvas');
    const gridCanvas = this.container.querySelector('#ds-grid-canvas');
    if (!treeRowsEl || !rulerCanvas || !gridCanvas) return;

    // 1. Build Flat List of Visible Channel Rows
    const flatRows = [];
    for (const obj of this.ds.objects.values()) {
      flatRows.push({ type: 'object', object: obj, id: obj.id, label: obj.name });
      if (!obj.collapsed) {
        for (const [paramKey, ch] of obj.channels.entries()) {
          flatRows.push({ type: 'channel', object: obj, channel: ch, paramKey, label: ch.label });
        }
      }
    }

    const rowHeight = 22;
    const totalH = Math.max(120, flatRows.length * rowHeight);

    // 2. Render Left Sidebar DOM Rows
    treeRowsEl.innerHTML = '';
    flatRows.forEach((r, idx) => {
      const rowEl = document.createElement('div');
      rowEl.style.height = `${rowHeight}px`;
      rowEl.style.display = 'flex';
      rowEl.style.alignItems = 'center';
      rowEl.style.padding = '0 6px';
      rowEl.style.borderBottom = '1px solid #32302f';
      rowEl.style.background = (r.object.id === this.selectedObjectId) ? '#3c3836' : (idx % 2 === 0 ? '#282828' : '#242424');
      rowEl.style.cursor = 'pointer';
      rowEl.style.boxSizing = 'border-box';
      rowEl.onclick = () => {
        this.selectedObjectId = r.object.id;
        this.updateGrid();
      };

      if (r.type === 'object') {
        rowEl.innerHTML = `
          <span class="ds-toggle-collapse" style="margin-right: 4px; color: #d79921; cursor: pointer; font-size: 9px; width: 12px;">${r.object.collapsed ? '▶' : '▼'}</span>
          <span style="font-weight: bold; color: #fabd2f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;" title="${r.label}">${r.label}</span>
          <button class="ds-add-prop-btn" title="Add Quadro Property Track" style="background: #3c3836; color: #b8bb26; border: 1px solid #504945; border-radius: 3px; padding: 1px 5px; font-size: 9px; cursor: pointer; margin-left: 4px;">+ Track</button>
        `;
        rowEl.querySelector('.ds-toggle-collapse').onclick = (e) => {
          e.stopPropagation();
          r.object.collapsed = !r.object.collapsed;
          this.updateGrid();
        };
        const addBtn = rowEl.querySelector('.ds-add-prop-btn');
        addBtn.onclick = (e) => {
          e.stopPropagation();
          this.showAddPropertyMenu(r.object, addBtn);
        };
      } else {
        const val = r.channel.sample(this.ds.currentFrame);
        let valDisplay = typeof val === 'number' ? Math.round(val * 100) / 100 : String(val);
        const def = PARAMETER_REGISTRY[r.paramKey];
        if (def && def.unit) valDisplay += def.unit;

        rowEl.innerHTML = `
          <span style="margin-left: 14px; color: #ebdbb2; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;" title="${r.label}">${r.label}</span>
          <span style="font-size: 9px; color: #83a598; margin-right: 4px; background: #1d2021; padding: 1px 4px; border-radius: 2px;">${valDisplay}</span>
          <span class="ds-del-ch-btn" title="Remove track" style="color: #7c6f64; font-size: 10px; cursor: pointer; padding: 0 3px;">✕</span>
        `;
        const delBtn = rowEl.querySelector('.ds-del-ch-btn');
        delBtn.onmouseenter = () => delBtn.style.color = '#ea6962';
        delBtn.onmouseleave = () => delBtn.style.color = '#7c6f64';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          r.object.removeChannel(r.paramKey);
          this.updateGrid();
        };
      }
      treeRowsEl.appendChild(rowEl);
    });

    // 3. Render Ruler Canvas
    rulerCanvas.width = totalW;
    rulerCanvas.height = 24;
    const rctx = rulerCanvas.getContext('2d');
    rctx.fillStyle = '#32302f';
    rctx.fillRect(0, 0, totalW, 24);
    rctx.strokeStyle = '#504945';
    rctx.fillStyle = '#a89984';
    rctx.font = '9px monospace';

    for (let f = 1; f <= this.ds.totalFrames; f++) {
      const x = (f - 1) * this.frameWidth;
      const isMajor = f === 1 || f % 5 === 0;
      rctx.beginPath();
      rctx.moveTo(x, isMajor ? 6 : 14);
      rctx.lineTo(x, 24);
      rctx.stroke();
      if (isMajor) {
        rctx.fillText(String(f), x + 2, 12);
      }
    }

    // 4. Render Grid Canvas & Keyframe Diamonds
    gridCanvas.width = totalW;
    gridCanvas.height = totalH;
    const gctx = gridCanvas.getContext('2d');
    gctx.fillStyle = '#1d2021';
    gctx.fillRect(0, 0, totalW, totalH);

    // Grid vertical frame dividers
    gctx.strokeStyle = '#282828';
    gctx.lineWidth = 1;
    for (let f = 1; f <= this.ds.totalFrames; f++) {
      const x = (f - 1) * this.frameWidth;
      gctx.beginPath();
      gctx.moveTo(x, 0);
      gctx.lineTo(x, totalH);
      gctx.stroke();
    }

    // Draw row backgrounds & keyframes
    flatRows.forEach((r, idx) => {
      const y = idx * rowHeight;
      gctx.fillStyle = idx % 2 === 0 ? 'rgba(40,40,40,0.3)' : 'rgba(29,32,33,0.3)';
      gctx.fillRect(0, y, totalW, rowHeight);
      gctx.strokeStyle = '#32302f';
      gctx.strokeRect(0, y, totalW, rowHeight);

      if (r.type === 'object') {
        // Draw summarized keyframe dots
        for (let f = 1; f <= this.ds.totalFrames; f++) {
          if (r.object.hasAnyKeyframeAt(f)) {
            const kx = (f - 1) * this.frameWidth + this.frameWidth / 2;
            const ky = y + rowHeight / 2;
            gctx.fillStyle = '#fabd2f';
            gctx.beginPath();
            gctx.arc(kx, ky, 3.5, 0, Math.PI * 2);
            gctx.fill();
          }
        }
      } else if (r.type === 'channel') {
        // Draw Keyframe Diamonds
        for (const kf of r.channel.keyframes) {
          const kx = (kf.frame - 1) * this.frameWidth + this.frameWidth / 2;
          const ky = y + rowHeight / 2;
          const size = 5;

          gctx.fillStyle = kf.selected ? '#fb4934' : '#83a598';
          gctx.strokeStyle = '#1d2021';
          gctx.lineWidth = 1.2;

          gctx.beginPath();
          gctx.moveTo(kx, ky - size);
          gctx.lineTo(kx + size, ky);
          gctx.lineTo(kx, ky + size);
          gctx.lineTo(kx - size, ky);
          gctx.closePath();
          gctx.fill();
          gctx.stroke();
        }
      }
    });

    this.updatePlayhead();
    this.updateAutoKeyframeUI();
  }
}
