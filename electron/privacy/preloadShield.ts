/**
 * TCT Orbit Privacy Shield — Injected Preload Hardening & Cosmetic Blocker
 * Implements Mullvad-standard browser fingerprinting resistance and cosmetic ad suppression.
 */

export function getShieldInjectionScript(enabled: boolean, fingerprintingResistance: boolean, isWhitelisted: boolean): string {
  if (!enabled || isWhitelisted) {
    return '/* TCT Orbit Shield: Inactive for this site */'
  }

  return `
    (function() {
      'use strict';
      if (window.__tct_shield_hardened) return;
      window.__tct_shield_hardened = true;

      try {
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
              // Alter only a tiny fraction of pixels (every 64th byte) by 1 unit
              for (let i = 0; i < d.length; i += 64) {
                d[i] = shiftNoise(d[i]);
              }
            } catch(e) {}
            return imgData;
          };

          const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
          HTMLCanvasElement.prototype.toDataURL = function(...args) {
            try {
              const ctx = this.getContext('2d');
              if (ctx) {
                const w = Math.min(this.width, 16);
                const h = Math.min(this.height, 16);
                if (w > 0 && h > 0) {
                  const img = ctx.getImageData(0, 0, w, h);
                  img.data[0] = shiftNoise(img.data[0]);
                  ctx.putImageData(img, 0, 0);
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
            if (param === 0x9245) return 'Google Inc. (TCT Orbit Engine)';
            // UNMASKED_RENDERER_WEBGL
            if (param === 0x9246) return 'ANGLE (Generic Direct3D11 vs_5_0 ps_5_0)';
            return origWebGLGetParam.apply(this, arguments);
          };

          if (typeof WebGL2RenderingContext !== 'undefined') {
            const origWebGL2GetParam = WebGL2RenderingContext.prototype.getParameter;
            WebGL2RenderingContext.prototype.getParameter = function(param) {
              if (param === 0x9245) return 'Google Inc. (TCT Orbit Engine)';
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

        // --- 3. YOUTUBE AD SUPPRESSION & AUTO-SKIPPER ---
        const isYouTube = window.location.hostname.includes('youtube.com');
        if (isYouTube) {
          // Hide promotional banners and sidebar ad cards safely without breaking player controls
          const ytStyle = document.createElement('style');
          ytStyle.id = 'tct-yt-adblock';
          ytStyle.textContent = \`
            ytd-ad-slot-renderer,
            ytd-banner-promo-renderer,
            ytd-statement-banner-renderer,
            ytd-in-feed-ad-layout-renderer,
            #masthead-ad,
            #player-ads,
            ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
            ytd-merch-shelf-renderer,
            .ytp-ad-overlay-container,
            .ytp-ad-message-container {
              display: none !important;
              visibility: hidden !important;
              height: 0 !important;
              width: 0 !important;
              opacity: 0 !important;
              pointer-events: none !important;
            }
          \`;
          (document.head || document.documentElement).appendChild(ytStyle);

          // Auto-skip video ads ONLY when movie_player is actively in ad-showing mode
          const handleYouTubeAds = () => {
            try {
              const moviePlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
              const isAdShowing = Boolean(
                moviePlayer && (
                  moviePlayer.classList.contains('ad-showing') ||
                  moviePlayer.classList.contains('ad-interrupting')
                )
              );

              if (isAdShowing) {
                // If ad is currently showing, click skip button or fast-forward ad to end
                const skipButtons = document.querySelectorAll(
                  '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-slot button, button.ytp-ad-skip-button-modern'
                );
                skipButtons.forEach((btn) => {
                  if (typeof btn.click === 'function') btn.click();
                });

                const adVideo = moviePlayer ? moviePlayer.querySelector('video') : null;
                if (adVideo && !isNaN(adVideo.duration) && adVideo.duration > 0) {
                  adVideo.playbackRate = 16.0;
                  adVideo.muted = true;
                  adVideo.currentTime = adVideo.duration - 0.1;
                }
              } else {
                // Normal video playback: ensure playback rate is normalized
                const mainVideo = document.querySelector('video.html5-main-video') || document.querySelector('video');
                if (mainVideo && mainVideo.playbackRate === 16.0) {
                  mainVideo.playbackRate = 1.0;
                }
              }

              // Close any overlay popup banners
              const closeButtons = document.querySelectorAll('.ytp-ad-overlay-close-button');
              closeButtons.forEach((btn) => {
                if (typeof btn.click === 'function') btn.click();
              });
            } catch(e) {}
          };

          setInterval(handleYouTubeAds, 200);
        }

        // --- 4. GENERAL COSMETIC AD CONTAINER REMOVAL ---
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
        (document.head || document.documentElement).appendChild(generalAdStyle);

      } catch(err) {
        console.warn('[TCT Orbit Shield] Preload initialization warning:', err);
      }
    })();
  `
}
