/**
 * TCT Orbit Privacy Shield — Injected Preload Hardening & Cosmetic Blocker
 * Implements Mullvad-standard browser fingerprinting resistance and cosmetic ad suppression.
 */

export function getShieldInjectionScript(
  enabled: boolean,
  fingerprintingResistance: boolean,
  isWhitelisted: boolean,
  spoofLanguage = false
): string {
  // Each protection is independent: turning the ad blocker off must not disable fingerprint protection
  if (isWhitelisted || (!enabled && !fingerprintingResistance && !spoofLanguage)) {
    return '/* TCT Orbit Shield: Inactive for this site */'
  }

  return `
    (function() {
      'use strict';
      if (window.__tct_shield_hardened) return;
      window.__tct_shield_hardened = true;

      try {
        ${spoofLanguage ? `
        // --- 0. GENERIC LOCALE (matches the spoofed Accept-Language header) ---
        try {
          Object.defineProperty(Navigator.prototype, 'language', { get: () => 'en-US', configurable: true });
          Object.defineProperty(Navigator.prototype, 'languages', { get: () => Object.freeze(['en-US', 'en']), configurable: true });
        } catch(e) {}
        ` : ''}

        // --- 1. GLOBAL PRIVACY CONTROL & DNT ---
        try {
          Object.defineProperty(navigator, 'globalPrivacyControl', {
            get: () => true,
            configurable: false,
            enumerable: true
          });
          Object.defineProperty(navigator, 'doNotTrack', {
            get: () => '1',
            configurable: false,
            enumerable: true
          });
        } catch(e) {}

        ${fingerprintingResistance ? `
        // --- 2. FINGERPRINTING RESISTANCE (Mullvad Standard) ---

        // A. Normalize Hardware Concurrency & Memory to standard safe defaults
        try {
          Object.defineProperty(navigator, 'hardwareConcurrency', {
            get: () => 4,
            configurable: false,
            enumerable: true
          });
          Object.defineProperty(navigator, 'deviceMemory', {
            get: () => 8,
            configurable: false,
            enumerable: true
          });
        } catch(e) {}

        // B. Restrict Leaky Sensor & Hardware Probing APIs
        try {
          if (navigator.getBattery) {
            navigator.getBattery = () => Promise.reject(new Error('Battery API disabled for privacy'));
          }
          if (navigator.getGamepads) {
            navigator.getGamepads = () => [];
          }
        } catch(e) {}

        // C. Canvas Fingerprinting Noise Injection
        // Generates deterministic, imperceptible 1-bit pseudo-noise per origin session
        try {
          const shiftNoise = (val) => {
            const delta = (Math.random() < 0.5 ? -1 : 1);
            return Math.max(0, Math.min(255, val + delta));
          };

          const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
          CanvasRenderingContext2D.prototype.getImageData = function(...args) {
            const imgData = origGetImageData.apply(this, args);
            try {
              const d = imgData.data;
              // Alter only a tiny fraction of pixels (capped at 16 sample points)
              // to defeat canvas fingerprint hashes without lagging large canvas rendering or 60fps web apps
              const sampleLimit = Math.min(d.length, 64);
              for (let i = 0; i < sampleLimit; i += 4) {
                d[i] = shiftNoise(d[i]);
              }
            } catch(e) {}
            return imgData;
          };

          // Export a noised COPY so the page's own canvas is never modified (repeated calls used to
          // accumulate drift in drawing apps). Only small canvases (typical fingerprint probes) are noised.
          // Remember which canvases are 2D (WebGL buffers may already be cleared, so never copy those)
          const twoDCanvases = new WeakSet();
          const origGetContext = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(type, ...rest) {
            const ctx = origGetContext.call(this, type, ...rest);
            if (ctx && type === '2d') twoDCanvases.add(this);
            return ctx;
          };

          const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
          HTMLCanvasElement.prototype.toDataURL = function(...args) {
            try {
              const w = this.width, h = this.height;
              if (twoDCanvases.has(this) && w > 0 && h > 0 && w * h <= 1024 * 256) {
                const copy = document.createElement('canvas');
                copy.width = w;
                copy.height = h;
                const cctx = origGetContext.call(copy, '2d');
                if (cctx) {
                  cctx.drawImage(this, 0, 0);
                  const img = origGetImageData.call(cctx, 0, 0, Math.min(w, 16), 1);
                  img.data[0] = shiftNoise(img.data[0]);
                  cctx.putImageData(img, 0, 0);
                  return origToDataURL.apply(copy, args);
                }
              }
            } catch(e) {}
            return origToDataURL.apply(this, args);
          };
        } catch(e) {}

        // D. WebGL Vendor & Renderer Masking + ReadPixels Noise
        try {
          const origWebGLGetParam = WebGLRenderingContext.prototype.getParameter;
          WebGLRenderingContext.prototype.getParameter = function(param) {
            // UNMASKED_VENDOR_WEBGL
            if (param === 0x9245) return 'Google Inc.';
            // UNMASKED_RENDERER_WEBGL
            if (param === 0x9246) return 'ANGLE (Generic Direct3D11 vs_5_0 ps_5_0)';
            return origWebGLGetParam.apply(this, arguments);
          };

          if (typeof WebGL2RenderingContext !== 'undefined') {
            const origWebGL2GetParam = WebGL2RenderingContext.prototype.getParameter;
            WebGL2RenderingContext.prototype.getParameter = function(param) {
              if (param === 0x9245) return 'Google Inc.';
              if (param === 0x9246) return 'ANGLE (Generic Direct3D11 vs_5_0 ps_5_0)';
              return origWebGL2GetParam.apply(this, arguments);
            };
          }
        } catch(e) {}

        // E. AudioContext Fingerprint Protection
        try {
          if (typeof AudioBuffer !== 'undefined') {
            const origGetChannelData = AudioBuffer.prototype.getChannelData;
            AudioBuffer.prototype.getChannelData = function(...args) {
              const data = origGetChannelData.apply(this, args);
              for (let i = 0; i < data.length; i += 128) {
                data[i] += (Math.random() - 0.5) * 1e-7;
              }
              return data;
            };
          }
          if (typeof AnalyserNode !== 'undefined') {
            const origGetFloatFreq = AnalyserNode.prototype.getFloatFrequencyData;
            AnalyserNode.prototype.getFloatFrequencyData = function(arr) {
              origGetFloatFreq.apply(this, arguments);
              for (let i = 0; i < arr.length; i += 32) {
                arr[i] += (Math.random() - 0.5) * 0.05;
              }
            };
          }
        } catch(e) {}
        ` : ''}

        // Safe style appender helper that guarantees styles attach even if document.head is null at early parse
        const safeAppendStyle = (styleEl) => {
          if (document.head) {
            document.head.appendChild(styleEl);
          } else if (document.documentElement) {
            document.documentElement.appendChild(styleEl);
          } else {
            document.addEventListener('DOMContentLoaded', () => {
              (document.head || document.documentElement || document.body)?.appendChild(styleEl);
            }, { once: true });
          }
        };

        // --- 3. YOUTUBE AD SUPPRESSION & AUTO-SKIPPER ---
        const ADBLOCK_ENABLED = ${enabled ? 'true' : 'false'};
        const isYouTube = /(^|\\.)youtube\\.com$/.test(window.location.hostname);
        if (ADBLOCK_ENABLED && isYouTube) {
          // Permanently suppress overlay ads, sponsored cards, bottom banners, and companion ads
          const ytStyle = document.createElement('style');
          ytStyle.id = 'tct-yt-adblock';
          ytStyle.textContent = \`
            .ytp-ad-overlay-slot,
            .ytp-ad-overlay-container,
            .ytp-ad-module,
            .ytp-ad-player-overlay,
            .ytp-ad-player-overlay-layout,
            .ytp-ad-player-overlay-flyout-cta,
            .ytp-ad-action-interstitial,
            .ytp-ad-hover-text-container,
            .ytp-ad-text,
            .ytp-suggested-action,
            .ytp-paid-content-overlay,
            ytd-ad-slot-renderer,
            ytd-banner-promo-renderer,
            ytd-statement-banner-renderer,
            ytd-in-feed-ad-layout-renderer,
            #masthead-ad,
            #player-ads,
            ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
            ytd-merch-shelf-renderer,
            ytd-action-companion-ad-renderer,
            ytd-promoted-sparkles-web-renderer,
            ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
            .ytp-ad-message-container {
              display: none !important;
              visibility: hidden !important;
              height: 0 !important;
              width: 0 !important;
              opacity: 0 !important;
              pointer-events: none !important;
            }
          \`;
          safeAppendStyle(ytStyle);

          // Auto-skip video ads with minimal CPU overhead
          let cachedPlayer = null;
          let wasAdShowing = false;
          const handleYouTubeAds = () => {
            try {
              if (window.location.pathname.startsWith('/shorts')) return;

              if (!cachedPlayer || !cachedPlayer.isConnected) {
                cachedPlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
              }
              if (!cachedPlayer) return;

              const isAdShowing = cachedPlayer.classList.contains('ad-showing') || cachedPlayer.classList.contains('ad-interrupting');

              if (isAdShowing) {
                wasAdShowing = true;
                const skipButtons = cachedPlayer.querySelectorAll(
                  '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-slot button, button.ytp-ad-skip-button-modern'
                );
                skipButtons.forEach((btn) => {
                  if (typeof btn.click === 'function') btn.click();
                });

                const adVideo = cachedPlayer.querySelector('video');
                if (adVideo && !isNaN(adVideo.duration) && adVideo.duration > 0) {
                  adVideo.playbackRate = 16.0;
                  adVideo.muted = true;
                  adVideo.currentTime = adVideo.duration - 0.05;
                }

                // Do NOT remove 'ad-showing' / 'ad-interrupting' manually: the player owns those classes
                // and stripping them desyncs its state (black screen / "something went wrong" errors).

                const closeButtons = cachedPlayer.querySelectorAll('.ytp-ad-overlay-close-button');
                closeButtons.forEach((btn) => {
                  if (typeof btn.click === 'function') btn.click();
                });
              } else if (wasAdShowing) {
                wasAdShowing = false;
                const mainVideo = cachedPlayer.querySelector('video');
                if (mainVideo && mainVideo.playbackRate === 16.0) {
                  mainVideo.playbackRate = 1.0;
                }
              }
            } catch(e) {}
          };

          // Lightweight 500ms interval replaces aggressive 200ms unthrottled DOM queries
          setInterval(handleYouTubeAds, 500);
        }

        // --- 4. GENERAL COSMETIC AD CONTAINER REMOVAL ---
        if (ADBLOCK_ENABLED) {
        const generalAdStyle = document.createElement('style');
        generalAdStyle.id = 'tct-general-adblock';
        generalAdStyle.textContent = \`
          div[id^="google_ads_"],
          ins.adsbygoogle,
          iframe[id^="google_ads_frame"],
          iframe[src*="doubleclick.net"],
          div[class*="taboola"],
          div[class*="outbrain"],
          .ad-banner,
          .ad-container,
          .advertisement {
            display: none !important;
          }
        \`;
        safeAppendStyle(generalAdStyle);
        }

        // (Scrollbar / overscroll CSS is injected once by the main process on dom-ready.)

      } catch(err) {
        console.warn('[TCT Orbit Shield] Preload initialization warning:', err);
      }
    })();
  `
}
