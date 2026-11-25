/**
 * Small scripts run inside web pages (webview.executeJavaScript). They run in the page's main
 * world, so they only READ the page and report back; nothing from the page is trusted.
 */

/** Prefix of console messages the progress script sends (read via the webview 'console-message' event) */
export const PROGRESS_MSG = '__tct_p:'

/**
 * Reports reading progress ("0.000".."1.000", or -1 for pages too short to scroll) as the user
 * scrolls, at most once per animation frame and only when it moved by 0.5%.
 * Also installs window.__tctSetScroll(ratio) used by split-view scroll sync.
 */
export const PROGRESS_SCRIPT = `(function () {
  try {
    if (window.__tctProgress) return;
    window.__tctProgress = true;
    var last = -2, pending = false, target = null;
    function scroller(t) {
      if (t && t.nodeType === 1 && t !== document.documentElement && t !== document.body) {
        if (t.scrollHeight - t.clientHeight > window.innerHeight * 0.5 && t.clientHeight > window.innerHeight * 0.5) return t;
      }
      return document.scrollingElement || document.documentElement;
    }
    function measure() {
      pending = false;
      var se = scroller(target);
      var view = se === (document.scrollingElement || document.documentElement) ? window.innerHeight : se.clientHeight;
      var max = se.scrollHeight - view;
      var r = max < window.innerHeight * 0.5 ? -1 : Math.min(1, Math.max(0, se.scrollTop / max));
      r = Math.round(r * 1000) / 1000;
      if (r !== -1 && last !== -2 && Math.abs(r - last) < 0.005 && r !== 1 && r !== 0) return;
      if (r === last) return;
      last = r;
      console.debug('${PROGRESS_MSG}' + r);
    }
    window.addEventListener('scroll', function (e) {
      target = e.target;
      if (!pending) { pending = true; requestAnimationFrame(measure); }
    }, { passive: true, capture: true });
    window.__tctSetScroll = function (ratio) {
      var se = document.scrollingElement || document.documentElement;
      var max = se.scrollHeight - window.innerHeight;
      if (max > 0) se.scrollTop = Math.round(ratio * max);
    };
    setTimeout(measure, 900);
  } catch (e) {}
})();`

export const scrollToRatioScript = (ratio: number, smooth = false) => `(function () {
  try {
    var r = ${Math.min(1, Math.max(0, Number(ratio) || 0))};
    var se = document.scrollingElement || document.documentElement;
    var max = se.scrollHeight - window.innerHeight;
    if (max > 0) se.scrollTo({ top: Math.round(r * max), behavior: ${smooth ? "'smooth'" : "'auto'"} });
  } catch (e) {}
})();`

/** Readable text of the page for "search pages you've read". Skips login / payment pages. */
export const PAGE_TEXT_SCRIPT = `(function () {
  try {
    if (document.querySelector('input[type="password"], input[autocomplete="cc-number"]')) return null;
    var root = document.querySelector('article, main, [role="main"]');
    var t = root && root.innerText && root.innerText.length > 400 ? root.innerText : (document.body ? document.body.innerText : '');
    return (t || '').slice(0, 40000);
  } catch (e) { return null; }
})();`

/** Text of the page with line breaks kept, for split-view "Compare text" */
export const COMPARE_TEXT_SCRIPT = `(function () {
  try {
    var root = document.querySelector('article, main, [role="main"]');
    var t = root && root.innerText && root.innerText.length > 400 ? root.innerText : (document.body ? document.body.innerText : '');
    return { title: document.title, text: (t || '').slice(0, 300000) };
  } catch (e) { return null; }
})();`

export interface PickedArea {
  /** null = the whole page */
  selector: string | null
  text: string
}

/**
 * Lets the user click the part of the page to watch. Resolves to the picked area,
 * { selector: null } for "whole page", or null when cancelled (Esc).
 */
export const ELEMENT_PICKER_SCRIPT = `new Promise(function (resolve) {
  try {
    if (window.__tctPicking) { resolve(null); return; }
    window.__tctPicking = true;
    var host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    var root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = '<style>'
      + '.bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 10px 8px 14px;border-radius:14px;background:#111216;color:#f4f4f5;font:500 13px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);pointer-events:auto;border:1px solid rgba(255,255,255,.12)}'
      + 'button{font:600 12px system-ui,sans-serif;border:0;border-radius:9px;padding:6px 10px;cursor:pointer;background:#27272a;color:#f4f4f5}'
      + 'button.p{background:#6366f1;color:#fff}'
      + '.box{position:fixed;pointer-events:none;border:2px solid #6366f1;background:rgba(99,102,241,.12);border-radius:6px;transition:all .06s ease-out;display:none}'
      + '</style>'
      + '<div class="box"></div>'
      + '<div class="bar"><span>Click the part of the page to watch</span><button class="p" data-a="page">Whole page</button><button data-a="cancel">Cancel (Esc)</button></div>';
    document.documentElement.appendChild(host);
    var box = root.querySelector('.box');
    var current = null;

    function finish(value) {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      host.remove();
      window.__tctPicking = false;
      resolve(value);
    }
    function textOf(el) { return ((el && (el.innerText || el.textContent)) || '').replace(/\\s+/g, ' ').trim().slice(0, 5000); }
    function esc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'); }
    function stableId(id) { return id && !/\\d{3,}|[:]|^[0-9]/.test(id) && id.length < 60; }
    function selectorFor(el) {
      var parts = [];
      while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement && parts.length < 12) {
        if (stableId(el.id) && document.querySelectorAll('#' + esc(el.id)).length === 1) { parts.unshift('#' + esc(el.id)); break; }
        var tag = el.tagName.toLowerCase();
        var i = 1, sib = el;
        while ((sib = sib.previousElementSibling)) if (sib.tagName === el.tagName) i++;
        parts.unshift(tag + ':nth-of-type(' + i + ')');
        el = el.parentElement;
      }
      var sel = parts.join(' > ');
      if (sel.charAt(0) !== '#') sel = 'body > ' + sel;
      return sel;
    }
    function onMove(e) {
      var el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === host) return;
      current = el;
      var r = el.getBoundingClientRect();
      box.style.display = 'block';
      box.style.left = r.left - 2 + 'px'; box.style.top = r.top - 2 + 'px';
      box.style.width = r.width + 4 + 'px'; box.style.height = r.height + 4 + 'px';
    }
    root.querySelector('[data-a="cancel"]').addEventListener('click', function (e) { e.stopPropagation(); finish(null); });
    root.querySelector('[data-a="page"]').addEventListener('click', function (e) {
      e.stopPropagation();
      finish({ selector: null, text: textOf(document.querySelector('main, article, [role="main"]') || document.body) });
    });
    function onClick(e) {
      // Clicks on our own bar are retargeted to the host: let the buttons handle them
      if (e.target === host) return;
      e.preventDefault(); e.stopPropagation();
      var el = current || e.target;
      if (!el || el.nodeType !== 1) return;
      var sel = selectorFor(el);
      var check = document.querySelector(sel);
      finish({ selector: check === el ? sel : null, text: textOf(el) });
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); finish(null); } }
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  } catch (e) { window.__tctPicking = false; resolve(null); }
})`
