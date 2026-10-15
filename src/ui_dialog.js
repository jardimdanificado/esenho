/**
 * Esenho UI Dialogs & Notifications System
 * Replaces native browser alert, confirm, and prompt with skeuomorphic,
 * non-blocking, touch-ready and accessible modals & toasts.
 */
(function (global) {
  'use strict';

  // Guard against non-browser environments
  if (typeof document === 'undefined') {
    const noop = () => Promise.resolve(null);
    const mock = {
      toast: noop,
      alert: noop,
      confirm: () => Promise.resolve(false),
      prompt: () => Promise.resolve(null),
      promptMulti: () => Promise.resolve(null),
      select: () => Promise.resolve(null)
    };
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = mock;
    }
    return;
  }

  // Inject UI styles if not already present
  const STYLE_ID = 'esenho-ui-dialog-styles';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .esenho-toast-container {
        position: fixed;
        bottom: 22px;
        right: 22px;
        z-index: 2000005;
        display: flex;
        flex-direction: column-reverse;
        gap: 8px;
        pointer-events: none;
        max-width: 380px;
        width: calc(100vw - 44px);
      }
      .esenho-toast {
        pointer-events: auto;
        background: linear-gradient(180deg, #2c3138 0%, #1c2024 100%);
        border: 1px solid #3e4652;
        border-top: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 6px;
        padding: 9px 14px;
        color: #ebdbb2;
        font-family: inherit;
        font-size: 12px;
        line-height: 1.4;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.75), 0 3px 8px rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        gap: 10px;
        opacity: 0;
        transform: translateY(12px) scale(0.97);
        transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .esenho-toast.active {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .esenho-toast-icon {
        font-size: 14px;
        flex-shrink: 0;
      }
      .esenho-toast-content {
        flex: 1;
        word-break: break-word;
      }
      .esenho-toast-success {
        border-left: 3px solid #10b981;
      }
      .esenho-toast-danger {
        border-left: 3px solid #ef4444;
      }
      .esenho-toast-warning {
        border-left: 3px solid #f59e0b;
      }
      .esenho-toast-info {
        border-left: 3px solid #38bdf8;
      }

      /* Modal Backdrop */
      .esenho-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.72);
        backdrop-filter: blur(2.5px);
        -webkit-backdrop-filter: blur(2.5px);
        z-index: 2000000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        opacity: 0;
        transition: opacity 0.18s ease-out;
      }
      .esenho-modal-backdrop.active {
        opacity: 1;
      }

      /* Modal Card */
      .esenho-modal-card {
        background: linear-gradient(180deg, #2b3036 0%, #1d2125 100%);
        border: 1px solid #3e4652;
        border-top: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 7px;
        box-shadow:
          0 24px 60px rgba(0, 0, 0, 0.9),
          0 8px 24px rgba(0, 0, 0, 0.65),
          inset 0 1px 0 rgba(255, 255, 255, 0.15);
        max-width: 440px;
        width: 100%;
        max-height: 88vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: scale(0.95) translateY(6px);
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        font-family: inherit;
        color: #ebdbb2;
      }
      .esenho-modal-backdrop.active .esenho-modal-card {
        transform: scale(1) translateY(0);
      }

      /* Modal Header */
      .esenho-modal-header {
        background: linear-gradient(180deg, #373d45 0%, #292d34 100%);
        border-bottom: 1px solid #14171a;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
        padding: 10px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        user-select: none;
      }
      .esenho-modal-title {
        font-size: 13px;
        font-weight: 750;
        color: #ffc848;
        text-shadow: 0 -1px 0 #000, 0 0 8px rgba(245, 158, 11, 0.3);
        margin: 0;
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .esenho-modal-close-btn {
        background: transparent;
        border: 1px solid transparent;
        color: #8894a4;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        padding: 3px 7px;
        border-radius: 4px;
        transition: all 0.12s ease;
      }
      .esenho-modal-close-btn:hover {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
        border-color: rgba(239, 68, 68, 0.4);
      }

      /* Modal Body */
      .esenho-modal-body {
        padding: 16px 18px;
        font-size: 13px;
        line-height: 1.5;
        overflow-y: auto;
        color: #d5c4a1;
      }
      .esenho-modal-message {
        margin: 0 0 14px 0;
        word-break: break-word;
        white-space: pre-wrap;
      }

      /* Form controls inside modal */
      .esenho-modal-input {
        width: 100%;
        box-sizing: border-box;
        background: #16191c;
        border: 1px solid #333a44;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        color: #ebdbb2;
        padding: 8px 11px;
        font-size: 13px;
        font-family: inherit;
        outline: none;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.6);
        transition: border-color 0.15s ease;
      }
      .esenho-modal-input:focus {
        border-color: #f59e0b;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 0 2px rgba(245, 158, 11, 0.25);
      }
      textarea.esenho-modal-input {
        min-height: 90px;
        resize: vertical;
      }

      /* Modal Field Rows */
      .esenho-modal-field {
        margin-bottom: 12px;
      }
      .esenho-modal-field:last-child {
        margin-bottom: 0;
      }
      .esenho-modal-label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        color: #a89984;
        margin-bottom: 5px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* Option Grid / List for Select Modal */
      .esenho-modal-options {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .esenho-modal-option-btn {
        background: linear-gradient(180deg, #32373f 0%, #24282e 100%);
        border: 1px solid #3c4450;
        border-radius: 5px;
        padding: 8px 12px;
        color: #ebdbb2;
        font-size: 12.5px;
        font-family: inherit;
        font-weight: 550;
        text-align: left;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.1s ease;
      }
      .esenho-modal-option-btn:hover {
        background: linear-gradient(180deg, #3f4650 0%, #2e343c 100%);
        border-color: #f59e0b;
        color: #ffc848;
        transform: translateY(-1px);
      }
      .esenho-modal-option-btn.selected {
        border-color: #f59e0b;
        background: linear-gradient(180deg, #443c2c 0%, #2c2518 100%);
        color: #ffc848;
        box-shadow: inset 0 0 0 1px #f59e0b;
      }

      /* Modal Footer */
      .esenho-modal-footer {
        background: linear-gradient(180deg, #22262c 0%, #181b1e 100%);
        border-top: 1px solid #131518;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        padding: 10px 14px;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 9px;
      }

      /* Skeuomorphic Action Buttons */
      .esenho-btn {
        font-family: inherit;
        font-size: 12px;
        font-weight: 650;
        padding: 6px 15px;
        border-radius: 4px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        user-select: none;
        transition: all 0.1s ease;
      }
      .esenho-btn-cancel {
        background: linear-gradient(180deg, #373d45 0%, #262a30 100%);
        border: 1px solid #1a1c20;
        border-top: 1px solid rgba(255, 255, 255, 0.18);
        color: #bdae93;
        box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      }
      .esenho-btn-cancel:hover {
        background: linear-gradient(180deg, #414852 0%, #2c3138 100%);
        color: #ebdbb2;
      }
      .esenho-btn-primary {
        background: linear-gradient(180deg, #f59e0b 0%, #b45309 100%);
        border: 1px solid #78350f;
        border-top: 1px solid rgba(255, 255, 255, 0.35);
        color: #1a1205;
        font-weight: 750;
        text-shadow: 0 1px 0 rgba(255, 255, 255, 0.3);
        box-shadow: 0 2px 5px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3);
      }
      .esenho-btn-primary:hover {
        background: linear-gradient(180deg, #fbbf24 0%, #d97706 100%);
        box-shadow: 0 3px 8px rgba(245, 158, 11, 0.4), inset 0 1px 0 rgba(255,255,255,0.4);
      }
      .esenho-btn-danger {
        background: linear-gradient(180deg, #ef4444 0%, #991b1b 100%);
        border: 1px solid #7f1d1d;
        border-top: 1px solid rgba(255, 255, 255, 0.3);
        color: #ffffff;
        font-weight: 750;
        text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.5);
        box-shadow: 0 2px 5px rgba(0,0,0,0.4);
      }
      .esenho-btn-danger:hover {
        background: linear-gradient(180deg, #f87171 0%, #b91c1c 100%);
        box-shadow: 0 3px 8px rgba(239, 68, 68, 0.4);
      }
    `;
    document.head.appendChild(style);
  }

  // Toast Container
  let toastContainer = null;
  function getToastContainer() {
    if (!toastContainer || !toastContainer.isConnected) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'esenho-toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  /**
   * Display a non-blocking floating notification
   * @param {string} message
   * @param {'info'|'success'|'warning'|'danger'} type
   * @param {number} duration
   */
  function uiToast(message, type = 'info', duration = 2600) {
    if (typeof message !== 'string') message = String(message || '');
    const container = getToastContainer();

    const toast = document.createElement('div');
    toast.className = `esenho-toast esenho-toast-${type}`;

    const icon = document.createElement('span');
    icon.className = 'esenho-toast-icon';
    if (type === 'success') icon.textContent = '✔';
    else if (type === 'danger') icon.textContent = '✖';
    else if (type === 'warning') icon.textContent = '⚠';
    else icon.textContent = 'ℹ';

    const content = document.createElement('div');
    content.className = 'esenho-toast-content';
    content.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(content);
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('active');
    });

    const timer = setTimeout(() => {
      dismiss();
    }, duration);

    function dismiss() {
      clearTimeout(timer);
      toast.classList.remove('active');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }

    toast.addEventListener('click', dismiss);
    return toast;
  }

  // Active modal tracker to prevent multiple modals overlapping inappropriately
  let currentModalDismiss = null;

  function createBaseModal({ title = '', onClose = () => {} }) {
    if (currentModalDismiss) {
      currentModalDismiss(null);
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'esenho-modal-backdrop';

    const card = document.createElement('div');
    card.className = 'esenho-modal-card';

    const header = document.createElement('div');
    header.className = 'esenho-modal-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'esenho-modal-title';
    titleEl.textContent = title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'esenho-modal-close-btn';
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&times;';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'esenho-modal-body';

    const footer = document.createElement('div');
    footer.className = 'esenho-modal-footer';

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    requestAnimationFrame(() => {
      backdrop.classList.add('active');
    });

    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      backdrop.classList.remove('active');
      document.removeEventListener('keydown', handleKeyDown);
      currentModalDismiss = null;
      setTimeout(() => {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        onClose(result);
      }, 190);
    }

    currentModalDismiss = close;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    closeBtn.addEventListener('click', () => close(null));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });

    return { backdrop, card, header, body, footer, close };
  }

  /**
   * Modal Alert (replaces window.alert)
   */
  function uiAlert(message, options = {}) {
    const title = options.title || 'Notification';
    const confirmText = options.confirmText || 'OK';

    return new Promise((resolve) => {
      const modal = createBaseModal({
        title,
        onClose: () => resolve()
      });

      const msgEl = document.createElement('div');
      msgEl.className = 'esenho-modal-message';
      msgEl.textContent = message;
      modal.body.appendChild(msgEl);

      const okBtn = document.createElement('button');
      okBtn.className = 'esenho-btn esenho-btn-primary';
      okBtn.textContent = confirmText;
      okBtn.addEventListener('click', () => modal.close(true));
      modal.footer.appendChild(okBtn);

      function handleKey(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          modal.close(true);
        }
      }
      modal.card.addEventListener('keydown', handleKey);
      setTimeout(() => okBtn.focus(), 50);
    });
  }

  /**
   * Modal Confirm (replaces window.confirm)
   */
  function uiConfirm(message, options = {}) {
    const title = options.title || 'Confirmation';
    const confirmText = options.confirmText || 'Confirm';
    const cancelText = options.cancelText || 'Cancel';
    const danger = options.danger === true;

    return new Promise((resolve) => {
      const modal = createBaseModal({
        title,
        onClose: (res) => resolve(res === true)
      });

      const msgEl = document.createElement('div');
      msgEl.className = 'esenho-modal-message';
      msgEl.textContent = message;
      modal.body.appendChild(msgEl);

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'esenho-btn esenho-btn-cancel';
      cancelBtn.textContent = cancelText;
      cancelBtn.addEventListener('click', () => modal.close(false));

      const okBtn = document.createElement('button');
      okBtn.className = `esenho-btn ${danger ? 'esenho-btn-danger' : 'esenho-btn-primary'}`;
      okBtn.textContent = confirmText;
      okBtn.addEventListener('click', () => modal.close(true));

      modal.footer.appendChild(cancelBtn);
      modal.footer.appendChild(okBtn);

      function handleKey(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          modal.close(true);
        }
      }
      modal.card.addEventListener('keydown', handleKey);
      setTimeout(() => (danger ? cancelBtn.focus() : okBtn.focus()), 50);
    });
  }

  /**
   * Modal Prompt (replaces window.prompt)
   */
  function uiPrompt(message, defaultValue = '', options = {}) {
    const title = options.title || 'Input';
    const confirmText = options.confirmText || 'OK';
    const cancelText = options.cancelText || 'Cancel';
    const placeholder = options.placeholder || '';
    const multiline = options.multiline === true;

    return new Promise((resolve) => {
      const modal = createBaseModal({
        title,
        onClose: (res) => resolve(res)
      });

      if (message) {
        const msgEl = document.createElement('div');
        msgEl.className = 'esenho-modal-message';
        msgEl.textContent = message;
        modal.body.appendChild(msgEl);
      }

      const input = multiline ? document.createElement('textarea') : document.createElement('input');
      input.className = 'esenho-modal-input';
      if (!multiline) input.type = 'text';
      input.value = defaultValue == null ? '' : String(defaultValue);
      if (placeholder) input.placeholder = placeholder;
      modal.body.appendChild(input);

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'esenho-btn esenho-btn-cancel';
      cancelBtn.textContent = cancelText;
      cancelBtn.addEventListener('click', () => modal.close(null));

      const okBtn = document.createElement('button');
      okBtn.className = 'esenho-btn esenho-btn-primary';
      okBtn.textContent = confirmText;
      okBtn.addEventListener('click', () => modal.close(input.value));

      modal.footer.appendChild(cancelBtn);
      modal.footer.appendChild(okBtn);

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          modal.close(input.value);
        }
      });

      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);
    });
  }

  /**
   * Multi-field prompt (perfect for canvas resize width/height)
   * fields: [{ key: 'width', label: 'Width (px)', value: 1280, type: 'number' }, ...]
   */
  function uiPromptMulti(title, fields = [], options = {}) {
    const confirmText = options.confirmText || 'Apply';
    const cancelText = options.cancelText || 'Cancel';

    return new Promise((resolve) => {
      const modal = createBaseModal({
        title: title || 'Configure',
        onClose: (res) => resolve(res)
      });

      const inputs = {};

      fields.forEach((field, idx) => {
        const fieldEl = document.createElement('div');
        fieldEl.className = 'esenho-modal-field';

        const label = document.createElement('label');
        label.className = 'esenho-modal-label';
        label.textContent = field.label || field.key;
        fieldEl.appendChild(label);

        const input = document.createElement('input');
        input.className = 'esenho-modal-input';
        input.type = field.type || 'text';
        input.value = field.value != null ? field.value : '';
        if (field.min != null) input.min = field.min;
        if (field.max != null) input.max = field.max;
        if (field.step != null) input.step = field.step;
        inputs[field.key] = input;

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        });

        fieldEl.appendChild(input);
        modal.body.appendChild(fieldEl);
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'esenho-btn esenho-btn-cancel';
      cancelBtn.textContent = cancelText;
      cancelBtn.addEventListener('click', () => modal.close(null));

      const okBtn = document.createElement('button');
      okBtn.className = 'esenho-btn esenho-btn-primary';
      okBtn.textContent = confirmText;
      okBtn.addEventListener('click', submit);

      function submit() {
        const result = {};
        for (const f of fields) {
          const val = inputs[f.key].value;
          result[f.key] = f.type === 'number' ? (parseFloat(val) || 0) : val;
        }
        modal.close(result);
      }

      modal.footer.appendChild(cancelBtn);
      modal.footer.appendChild(okBtn);

      const firstInput = Object.values(inputs)[0];
      if (firstInput) {
        setTimeout(() => {
          firstInput.focus();
          firstInput.select();
        }, 50);
      }
    });
  }

  /**
   * Selection Modal with cards/buttons
   * options: [{ value: 'analogous', label: 'Analogous', description: '...' }, ...]
   */
  function uiSelect(message, options = [], config = {}) {
    const title = config.title || 'Select Option';
    const defaultValue = config.defaultValue || '';

    return new Promise((resolve) => {
      const modal = createBaseModal({
        title,
        onClose: (res) => resolve(res)
      });

      if (message) {
        const msgEl = document.createElement('div');
        msgEl.className = 'esenho-modal-message';
        msgEl.textContent = message;
        modal.body.appendChild(msgEl);
      }

      const list = document.createElement('div');
      list.className = 'esenho-modal-options';

      options.forEach((opt) => {
        const val = typeof opt === 'object' ? opt.value : opt;
        const lbl = typeof opt === 'object' ? (opt.label || opt.value) : opt;
        const desc = typeof opt === 'object' && opt.description ? opt.description : '';

        const btn = document.createElement('button');
        btn.className = `esenho-modal-option-btn ${val === defaultValue ? 'selected' : ''}`;
        btn.setAttribute('type', 'button');

        const labelSpan = document.createElement('span');
        labelSpan.textContent = lbl;
        btn.appendChild(labelSpan);

        if (desc) {
          const descSpan = document.createElement('small');
          descSpan.style.color = '#8894a4';
          descSpan.style.fontSize = '11px';
          descSpan.textContent = desc;
          btn.appendChild(descSpan);
        }

        btn.addEventListener('click', () => {
          modal.close(val);
        });

        list.appendChild(btn);
      });

      modal.body.appendChild(list);

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'esenho-btn esenho-btn-cancel';
      cancelBtn.textContent = config.cancelText || 'Cancel';
      cancelBtn.addEventListener('click', () => modal.close(null));
      modal.footer.appendChild(cancelBtn);
    });
  }

  // Export to global scope
  const api = {
    toast: uiToast,
    alert: uiAlert,
    confirm: uiConfirm,
    prompt: uiPrompt,
    promptMulti: uiPromptMulti,
    select: uiSelect
  };

  global.uiDialog = api;
  global.uiToast = uiToast;
  global.uiAlert = uiAlert;
  global.uiConfirm = uiConfirm;
  global.uiPrompt = uiPrompt;
  global.uiPromptMulti = uiPromptMulti;
  global.uiSelect = uiSelect;

  // Provide showNotification backwards compatibility if not already defined
  if (!global.showNotification) {
    global.showNotification = function (msg, duration) {
      return uiToast(msg, 'info', duration || 2400);
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : this);
