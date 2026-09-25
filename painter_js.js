  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }

  // Embedded Mode for SVG Vector Editor
  if (new URLSearchParams(window.location.search).get('embedded') === 'true') {
    document.body.classList.add('is-embedded');
    let editId = null;
    let pendingInitEdit = null;

    function applyInitEdit(data) {
      if (!data) return;
      editId = data.id;
      const host = window.host;
      if (!host || !host.canvasActor || !host.canvasActor.exports) {
        pendingInitEdit = data;
        return;
      }

      const img = new Image();
      img.onload = () => {
        const w = Math.max(1, Math.round(img.naturalWidth || data.naturalWidth || img.width || data.width || 800));
        const h = Math.max(1, Math.round(img.naturalHeight || data.naturalHeight || img.height || data.height || 600));

        // Re-initialize surface to exact raster dimensions
        host.canvasActor.exports.w_init(w, h);
        host.currentProjectId = 'embedded_' + Date.now();
        host.currentProjectName = 'Raster Layer';
        host.canvasRotation = 0;
        host.flipH = false;
        host.flipV = false;

        // Clear background layer slot 3 with transparent
        const bgPtr = host.canvasActor.exports.w_layer_get_pixels(3);
        if (bgPtr) {
          new Uint32Array(host.canvasActor.memory.buffer, bgPtr, w * h).fill(0);
        }

        // Get active or create drawing layer
        let drawId = (typeof host.canvasActor.exports.w_layer_get_active === 'function') 
          ? host.canvasActor.exports.w_layer_get_active() 
          : -1;
        if (drawId < 0 || drawId === 3) {
          drawId = host.canvasActor.exports.w_layer_create(w, h);
        }
        if (drawId >= 0 && typeof host.canvasActor.exports.w_layer_select === 'function') {
          host.canvasActor.exports.w_layer_select(drawId);
        }

        // Draw image onto drawing layer
        const cvs = document.createElement('canvas');
        cvs.width = w;
        cvs.height = h;
        const ctx = cvs.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const idata = ctx.getImageData(0, 0, w, h);

        const drawPtr = host.canvasActor.exports.w_layer_get_pixels(drawId);
        if (drawPtr) {
          new Uint8Array(host.canvasActor.memory.buffer, drawPtr, w * h * 4).set(idata.data);
        }

        if (!host.layerNames) host.layerNames = new Map();
        host.layerNames.set(3, 'Background');
        if (drawId >= 0) host.layerNames.set(drawId, 'Layer 1');

        host.canvasActor.exports.force_composite();
        if (typeof host.resize === 'function') host.resize();
        if (typeof syncUiFromHost === 'function') syncUiFromHost();
        if (typeof host.resizeCanvas === 'function') {
          host.resizeCanvas(w, h);
        } else if (host.zoomToFit) {
          host.zoomToFit();
        }
        if (host.render) host.render();
      };
      img.src = data.src;
    }

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'INIT_EDIT') {
        applyInitEdit(e.data);
      }
    });

    window.addEventListener('wesenho:ready', () => {
      if (pendingInitEdit) {
        const d = pendingInitEdit;
        pendingInitEdit = null;
        applyInitEdit(d);
      }
    });

    // Create Save and Cancel buttons in top bar
    const bar = document.getElementById('ip-top-fixed-group');
    if (bar) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'ip-btn-icon';
      saveBtn.style.cssText = 'color: var(--primary); font-weight: bold; font-size: 11px; width: auto; padding: 0 10px; border: 1px solid var(--primary); border-radius: var(--radius-sm); margin-left: 10px; cursor: pointer;';
      saveBtn.textContent = '✓ SAVE TO VECTOR';
      saveBtn.onclick = () => {
        const host = window.host;
        if (host && host.canvasActor && host.canvasActor.exports) {
          const exp = host.canvasActor.exports;
          const w = exp.get_canvas_width();
          const h = exp.get_canvas_height();
          const cvs = document.createElement('canvas');
          cvs.width = w;
          cvs.height = h;
          const ctx = cvs.getContext('2d');

          const orderCount = exp.w_layer_get_order_count ? exp.w_layer_get_order_count() : 0;
          let renderedAny = false;

          if (orderCount > 0) {
            for (let p = 0; p < orderCount; p++) {
              const layerId = exp.w_layer_get_order(p);
              if (layerId < 0) continue;
              const vis = exp.w_layer_get_visible ? exp.w_layer_get_visible(layerId) : 1;
              const op = exp.w_layer_get_opacity ? exp.w_layer_get_opacity(layerId) : 255;
              if (!vis || op === 0) continue;

              const lw = exp.w_layer_get_width ? exp.w_layer_get_width(layerId) : w;
              const lh = exp.w_layer_get_height ? exp.w_layer_get_height(layerId) : h;
              const lx = exp.w_layer_get_x ? exp.w_layer_get_x(layerId) : 0;
              const ly = exp.w_layer_get_y ? exp.w_layer_get_y(layerId) : 0;
              const ptr = exp.w_layer_get_pixels(layerId);
              if (!ptr || lw <= 0 || lh <= 0) continue;

              const u8 = new Uint8Array(host.canvasActor.memory.buffer, ptr, lw * lh * 4);
              let hasAlpha = false;
              for (let i = 3; i < u8.length; i += 4) {
                if (u8[i] > 0) {
                  hasAlpha = true;
                  break;
                }
              }
              if (!hasAlpha) continue;

              const layerCvs = document.createElement('canvas');
              layerCvs.width = lw;
              layerCvs.height = lh;
              const lCtx = layerCvs.getContext('2d');
              const imgData = lCtx.createImageData(lw, lh);
              imgData.data.set(u8);
              lCtx.putImageData(imgData, 0, 0);

              ctx.save();
              ctx.globalAlpha = op / 255;
              ctx.drawImage(layerCvs, lx, ly);
              ctx.restore();
              renderedAny = true;
            }
          }

          if (!renderedAny) {
            const activeId = exp.w_layer_get_active ? exp.w_layer_get_active() : 0;
            const ptr = exp.w_layer_get_pixels(activeId);
            if (ptr) {
              const imgData = ctx.createImageData(w, h);
              imgData.data.set(new Uint8Array(host.canvasActor.memory.buffer, ptr, w * h * 4));
              ctx.putImageData(imgData, 0, 0);
            }
          }

          const src = cvs.toDataURL('image/png');
          window.parent.postMessage({ type: 'SAVE_EDIT', id: editId, src: src }, '*');
        }
      };

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'ip-btn-icon';
      cancelBtn.style.cssText = 'color: var(--danger); font-weight: bold; font-size: 11px; width: auto; padding: 0 10px; margin-left: 4px; border: 1px solid var(--danger); border-radius: var(--radius-sm); cursor: pointer;';
      cancelBtn.textContent = '✕ CANCEL';
      cancelBtn.onclick = () => window.parent.postMessage({ type: 'CANCEL_EDIT' }, '*');

      bar.appendChild(saveBtn);
      bar.appendChild(cancelBtn);
    }
  }
