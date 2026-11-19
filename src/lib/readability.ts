/**
 * Injected script for extracting distraction-free article reader content from the active webview.
 */
export const READABILITY_EXTRACTION_SCRIPT = `
(function() {
  try {
    // 1. Candidate containers
    const candidates = [
      document.querySelector('article'),
      document.querySelector('[role="main"]'),
      document.querySelector('main'),
      document.querySelector('.post-content, .article-content, .entry-content, #content, .content, .story-body'),
      document.body
    ].filter(Boolean);

    const article = candidates[0] || document.body;
    const clone = article.cloneNode(true);

    // 2. Remove clutter, navigation, ads, headers, footers
    const unwantedSelectors = [
      'script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript', 'svg',
      '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
      '.ad', '.ads', '.advertisement', '.sidebar', '.comments', '.newsletter', '.social-share',
      '.popup', '.modal', '.banner', '#cookie-banner', '.cookie-consent', '.paywall',
      'button', 'form'
    ];
    unwantedSelectors.forEach(function(sel) {
      clone.querySelectorAll(sel).forEach(function(el) { el.remove(); });
    });

    // 3. Extract clean title
    const title = document.querySelector('h1')?.innerText?.trim() || document.title || 'Readable Article';

    // 4. Extract author / publication info
    const bylineEl = document.querySelector('[rel="author"], .byline, .author, time, .date');
    const byline = bylineEl?.innerText?.trim() || window.location.hostname;

    // 5. Calculate reading time
    const text = clone.innerText || '';
    const words = text.trim().split(/\\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.round(words / 220));

    // 6. Ensure image sources are absolute
    clone.querySelectorAll('img').forEach(function(img) {
      if (img.src) img.setAttribute('src', img.src);
    });

    return {
      success: true,
      title: title,
      byline: byline,
      readingTime: minutes + ' min read',
      contentHtml: clone.innerHTML
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
})();
`

export const PICTURE_IN_PICTURE_SCRIPT = `
(async function() {
  try {
    const video = document.querySelector('video');
    if (!video) {
      return { success: false, reason: 'No video element found on this page.' };
    }

    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return { success: true, active: false };
    } else {
      await video.requestPictureInPicture();
      return { success: true, active: true };
    }
  } catch (err) {
    return { success: false, reason: String(err) };
  }
})();
`
