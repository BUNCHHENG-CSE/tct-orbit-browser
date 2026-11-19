export const SEARCH_ENGINES = {
  duckduckgo: {
    id: "duckduckgo",
    name: "DuckDuckGo",
    searchUrl: "https://duckduckgo.com/?q=%s",
    homeUrl: "https://duckduckgo.com",
    icon: "/icons/ddg.svg"
  },
  google: {
    id: "google",
    name: "Google",
    searchUrl: "https://www.google.com/search?q=%s",
    homeUrl: "https://www.google.com",
    icon: "/icons/google.svg"
  },
  bing: {
    id: "bing",
    name: "Bing",
    searchUrl: "https://www.bing.com/search?q=%s",
    homeUrl: "https://www.bing.com",
    icon: "/icons/bing.svg"
  }
} as const;

export type SearchEngineId = keyof typeof SEARCH_ENGINES;
export const DEFAULT_ENGINE: SearchEngineId = "duckduckgo";

/**
 * Checks if input is a valid URL or looks like a web address (with or without protocol)
 */
export function isUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }

  // Already has protocol
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  // Localhost with optional port
  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return true;
  }

  // IP address with optional port
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(trimmed)) {
    return true;
  }

  // Domain name with valid TLD structure: e.g. example.com, sub.domain.org/path
  const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+(\/.*)?$/;
  if (domainPattern.test(trimmed)) {
    try {
      new URL(`https://${trimmed}`);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Normalizes input by prepending https:// if protocol is missing
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Builds search engine URL for a given query
 */
export function buildSearchUrl(query: string, engine: SearchEngineId, _isDark?: boolean): string {
  const targetEngine = SEARCH_ENGINES[engine] || SEARCH_ENGINES[DEFAULT_ENGINE];
  const encodedQuery = encodeURIComponent(query.trim());
  return targetEngine.searchUrl.replace("%s", encodedQuery);
}

export interface DisplayUrlInfo {
  displayText: string;
  isSearch: boolean;
  isSecure: boolean;
  searchEngineName?: string;
  searchQuery?: string;
  hostname: string;
}

/**
 * Parses and formats a raw URL for the top navigation bar.
 * If the URL is a search engine results page (e.g. DuckDuckGo, Google, Bing, YouTube),
 * extracts the exact search query so the top bar reflects what the user searched for.
 */
export function getDisplayUrlInfo(rawUrl: string): DisplayUrlInfo {
  if (!rawUrl || rawUrl === 'about:blank') {
    return {
      displayText: 'Search or enter URL...',
      isSearch: false,
      isSecure: false,
      hostname: ''
    };
  }

  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const isSecure = parsed.protocol === 'https:';

    // Extract search query if present
    const qParam =
      parsed.searchParams.get('q') ||
      parsed.searchParams.get('search_query') ||
      parsed.searchParams.get('query') ||
      parsed.searchParams.get('p') ||
      parsed.searchParams.get('wd') ||
      parsed.searchParams.get('text');

    const isSearchEngine =
      hostname.includes('duckduckgo.com') ||
      hostname.includes('google.') ||
      hostname.includes('bing.com') ||
      hostname.includes('youtube.com') ||
      hostname.includes('yahoo.com') ||
      hostname.includes('ecosia.org');

    if (qParam && qParam.trim() && isSearchEngine) {
      const query = qParam.trim();
      let engineName = 'Search';
      if (hostname.includes('duckduckgo')) engineName = 'DuckDuckGo';
      else if (hostname.includes('google')) engineName = 'Google';
      else if (hostname.includes('bing')) engineName = 'Bing';
      else if (hostname.includes('youtube')) engineName = 'YouTube';

      return {
        displayText: query,
        isSearch: true,
        isSecure,
        searchEngineName: engineName,
        searchQuery: query,
        hostname
      };
    }

    // Standard non-search URL formatting (preserves dynamic hash/scroll anchors like #forex or #futures)
    let path = parsed.pathname;
    const search = parsed.search ? (parsed.search.length > 40 ? parsed.search.slice(0, 40) + '...' : parsed.search) : '';
    const hash = parsed.hash ? (parsed.hash.length > 40 ? parsed.hash.slice(0, 40) + '...' : parsed.hash) : '';

    if (path === '/') {
      path = search || hash ? '/' : '';
    }

    let formatted = hostname + path + search + hash;
    if (!formatted) formatted = hostname;

    return {
      displayText: formatted,
      isSearch: false,
      isSecure,
      hostname
    };
  } catch {
    return {
      displayText: rawUrl,
      isSearch: false,
      isSecure: false,
      hostname: ''
    };
  }
}

