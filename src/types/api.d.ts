export interface User {
  id: string;
  createdAt: string | Date;
}

export interface Space {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon: string;
  order: number;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  tabs?: Tab[];
  /** Separate profile: this space keeps its own cookies, logins and site storage */
  isolated?: boolean;
}

export interface Tab {
  id: string;
  spaceId: string;
  url: string;
  title: string;
  favicon?: string | null;
  isPinned: boolean;
  order: number;
  lastVisited: string | Date;
  createdAt: string | Date;
  isAudible?: boolean;
  isMuted?: boolean;
  isSleeping?: boolean;
  /** Private tab: in-memory session, never saved to disk or history */
  isPrivate?: boolean;
  /** Tab group this tab belongs to (null/undefined = ungrouped) */
  groupId?: string | null;
}

/** Named, colored, nestable group of tabs inside a space */
export interface TabGroup {
  id: string;
  spaceId: string;
  /** Parent group (null = top level). Max nesting depth is MAX_GROUP_DEPTH. */
  parentId: string | null;
  name: string;
  /** null = inherit the parent group's color */
  color: string | null;
  collapsed: boolean;
  order: number;
  /** Links opened from tabs in this group open as new tabs inside the group */
  openLinksInGroup: boolean;
  createdAt: string | Date;
}

export interface CreateTabGroupData {
  spaceId: string;
  name: string;
  parentId?: string | null;
  color?: string | null;
  /** Tabs to move into the new group */
  tabIds?: string[];
}

export interface UpdateTabGroupData {
  name?: string;
  color?: string | null;
  collapsed?: boolean;
  parentId?: string | null;
  order?: number;
  openLinksInGroup?: boolean;
}

/** A saved two-pane layout that can be reopened in one click */
export interface SavedSplit {
  id: string;
  name: string;
  primary: { url: string; title: string };
  secondary: { url: string; title: string };
  ratio: number;
  createdAt: string | Date;
}

export interface SaveSplitData {
  name: string;
  primary: { url: string; title: string };
  secondary: { url: string; title: string };
  ratio: number;
}

export interface PasswordEntryInfo {
  id: string;
  origin: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface PasswordSaveOffer {
  token: string;
  origin: string;
  username: string;
  /** Same username already saved with a different password */
  isUpdate: boolean;
}

export interface PasswordSettings {
  offerToSave: boolean;
  /** Sites where the user chose "Never" */
  neverSave: string[];
  /** OS encryption (DPAPI / Keychain) is available */
  encrypted: boolean;
}

export interface DefaultBrowserStatus {
  isDefault: boolean;
  /** false in dev builds or when the OS tool is missing */
  canSet: boolean;
  reason?: string;
}

export interface BrowserExtensionInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  allowInPrivate: boolean;
  /** Enabled and successfully loaded by Electron */
  loaded: boolean;
  icon?: string;
  store?: 'chrome' | 'edge' | 'opera' | 'file' | 'builtin';
  /** Ships with TCT Orbit (can still be turned off or removed, and restored later) */
  builtin?: boolean;
  /** Has a toolbar button that can be clicked */
  hasAction?: boolean;
  /** chrome-extension:// URL of the toolbar popup (when loaded) */
  popupUrl?: string;
  /** chrome-extension:// URL of the options page (when loaded) */
  optionsUrl?: string;
}

/** A downloaded extension waiting for the user to confirm the install */
export interface ExtensionInstallPreview {
  token: string;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  icon?: string;
  store: 'chrome' | 'edge' | 'opera' | 'file';
  manifestVersion: number;
  /** Same store extension already installed: this replaces it */
  isUpdate: boolean;
}

export interface AboutInfo {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  v8: string;
  platform: string;
}

export interface ArcImportInfo {
  found: boolean;
  spaces: number;
  tabs: number;
}

export interface ArcImportResult {
  success: boolean;
  spaces: number;
  tabs: number;
  groups: number;
  error?: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type AccentPreset = 'orbit-blue' | 'nebula-violet' | 'emerald' | 'amber' | 'rose' | 'monochrome' | string;
export type WebColorScheme = 'match-browser' | 'light' | 'dark' | 'system';

export interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  accent: AccentPreset;
  webColorScheme: WebColorScheme;
}

export interface SetThemeData {
  mode?: ThemeMode;
  accent?: AccentPreset;
  webColorScheme?: WebColorScheme;
}

export type StartupBehavior = 'previous-session' | 'new-tab' | 'custom-urls';
export type AutoArchiveDuration = 'off' | '12h' | '24h' | '3d' | '7d';

export interface Settings {
  id: string;
  userId: string;
  defaultSearchEngine: "duckduckgo" | "google" | "bing" | string;
  theme: string;
  sidebarCollapsed: boolean;
  accentColor?: string;
  accentPreset?: AccentPreset;
  webColorScheme?: WebColorScheme;
  smoothScrolling?: boolean;
  startupBehavior?: StartupBehavior;
  startupCustomUrls?: string[];
  downloadPath?: string;
  askWhereToSave?: boolean;
  openFolderOnDownload?: boolean;
  defaultZoom?: number;
  autoArchiveDuration?: AutoArchiveDuration;
  memorySaverEnabled?: boolean;
  sleepTimeoutMinutes?: number;
  /** What Ctrl+T / New Tab opens: the command bar (default) or the Orbit start page */
  newTabPage?: NewTabPage;
  /** Where tabs are shown: vertical sidebar (default) or a horizontal strip under the toolbar */
  tabLayout?: TabLayout;
  /** New tabs go first (after pinned tabs) instead of next to the active tab */
  newTabsOnTop?: boolean;
  /** Favorites bar under the toolbar: always, never, or only on new tabs (default: always) */
  favoritesBar?: FavoritesBarMode;
  /** Check spelling while typing on web pages (default on) */
  spellcheck?: boolean;
  /** Dictionaries in use, e.g. ["en-US"] (empty = system languages) */
  spellcheckLanguages?: string[];
  /** Warn before opening known phishing / malware sites (default on) */
  safeBrowsing?: boolean;
  /** Download updates automatically (default on) */
  autoUpdate?: boolean;
  /** Custom keyboard shortcuts: action id -> combos */
  shortcuts?: Record<string, string[]>;
  /** Interface language ("system" = follow the OS) */
  language?: string;
  /** Language pages are translated to ("" = interface language) */
  translateTo?: string;
  /** Local model used by "Ask this page" */
  aiModel?: string;
  updatedAt: string | Date;
}

export type FavoritesBarMode = 'always' | 'never' | 'new-tab';

export type TabLayout = 'sidebar' | 'topbar';

export type NewTabPage = 'command-bar' | 'start-page';

export interface CreateSpaceData {
  name: string;
  color?: string;
  icon?: string;
  order?: number;
  initialUrl?: string;
  initialTitle?: string;
  isolated?: boolean;
}

export interface UpdateSpaceData {
  name?: string;
  color?: string;
  icon?: string;
  order?: number;
  isActive?: boolean;
  isolated?: boolean;
}

export interface CreateTabData {
  spaceId: string;
  url: string;
  title?: string;
  favicon?: string | null;
  isPinned?: boolean;
  order?: number;
  isPrivate?: boolean;
  groupId?: string | null;
}

export interface UpdateTabData {
  url?: string;
  title?: string;
  favicon?: string | null;
  isPinned?: boolean;
  order?: number;
  spaceId?: string;
  groupId?: string | null;
}

export interface UpdateSettingsData {
  defaultSearchEngine?: string;
  theme?: string;
  sidebarCollapsed?: boolean;
  accentColor?: string;
  accentPreset?: AccentPreset;
  webColorScheme?: WebColorScheme;
  smoothScrolling?: boolean;
  startupBehavior?: StartupBehavior;
  startupCustomUrls?: string[];
  downloadPath?: string;
  askWhereToSave?: boolean;
  openFolderOnDownload?: boolean;
  defaultZoom?: number;
  autoArchiveDuration?: AutoArchiveDuration;
  memorySaverEnabled?: boolean;
  sleepTimeoutMinutes?: number;
  newTabPage?: NewTabPage;
  tabLayout?: TabLayout;
  newTabsOnTop?: boolean;
  favoritesBar?: FavoritesBarMode;
  spellcheck?: boolean;
  spellcheckLanguages?: string[];
  safeBrowsing?: boolean;
  autoUpdate?: boolean;
  shortcuts?: Record<string, string[]>;
  language?: string;
  translateTo?: string;
  aiModel?: string;
}

export type ReleaseChannel = 'stable' | 'nova' | 'deep' | 'canary';

export interface AppInfo {
  name: string;
  version: string;
  channel: ReleaseChannel;
}

export interface ContextMenuParams {
  x: number;
  y: number;
  linkURL?: string;
  srcURL?: string;
  mediaType?: string;
  hasImageContents?: boolean;
  isEditable?: boolean;
  selectionText?: string;
  titleText?: string;
  pageURL?: string;
  frameURL?: string;
  editFlags?: {
    canUndo?: boolean;
    canRedo?: boolean;
    canCut?: boolean;
    canCopy?: boolean;
    canPaste?: boolean;
    canDelete?: boolean;
    canSelectAll?: boolean;
  };
  dictionarySuggestions?: string[];
}

export interface ContextMenuEventData {
  webContentsId: number;
  params: ContextMenuParams;
  canGoBack: boolean;
  canGoForward: boolean;
  pageURL: string;
}

export interface DevToolsState {
  isOpen: boolean;
  isDetached: boolean;
  isDocked: boolean;
}

export type DohProvider = 'mullvad' | 'cloudflare' | 'quad9' | 'adguard';
export type MasterShieldStatus = 'ACTIVE' | 'PARTIALLY_ACTIVE' | 'OFF';
export type ProxyMode = 'off' | 'system' | 'tor' | 'custom';

export interface ProxyTestResult {
  ok: boolean;
  ip?: string;
  isTor?: boolean;
  error?: string;
}

export interface PrivacyShieldPrefs {
  adBlockerEnabled: boolean;
  trackerProtection: boolean;
  fingerprintResistance: boolean;
  httpsOnlyMode: boolean;
  dnsOverHttps: boolean;
  dohProvider: DohProvider;
  webrtcProtection: boolean;
  globalPrivacyControl: boolean;
  stripTrackingParams: boolean;
  blockThirdPartyCookies: boolean;
  clearCacheOnExit: boolean;
  blockPings: boolean;
  strictReferrer: boolean;
  spoofLanguage: boolean;
  blockCookieBanners: boolean;
  proxyMode: ProxyMode;
  proxyUrl: string;
  whitelistedOrigins: string[];
}

export interface PrivacyStats {
  adsBlockedTotal: number;
  trackersBlockedTotal: number;
  fingerprintProbesBlockedTotal: number;
  httpsUpgradesTotal: number;
}

export interface SiteShieldStatus {
  origin: string;
  isWhitelisted: boolean;
  adsBlocked: number;
  trackersBlocked: number;
  isHttps: boolean;
}

export interface PrivacyEngineState {
  prefs: PrivacyShieldPrefs;
  masterStatus: MasterShieldStatus;
  stats: PrivacyStats;
}

export interface DownloadProgress {
  id: string;
  filename: string;
  receivedBytes: number;
  totalBytes: number;
  progress: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  savePath: string;
  isPaused?: boolean;
  canResume?: boolean;
}

export interface DownloadCompleted {
  id: string;
  filename: string;
  savePath: string;
  totalBytes: number;
}

export interface DownloadRecord {
  id: string;
  filename: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  startTime: string;
  endTime?: string;
  url?: string;
  /** Live only (not persisted): paused by the user or interrupted by the network */
  isPaused?: boolean;
  canResume?: boolean;
}

export type BackupCategory = 'settings' | 'spaces' | 'tabs' | 'privacy' | 'history' | 'bookmarks' | 'notes';

export interface ExportBackupOptions {
  categories?: BackupCategory[];
  includeOpenTabs?: boolean;
  includePinnedTabs?: boolean;
}

export interface ExportBackupResult {
  success: boolean;
  canceled?: boolean;
  filePath?: string;
  error?: string;
  itemCounts?: {
    spaces: number;
    tabs: number;
    pinnedTabs: number;
    history?: number;
    bookmarks?: number;
    notes?: number;
    hasSettings: boolean;
    hasPrivacy: boolean;
  };
}

export interface BackupInspectionResult {
  valid: boolean;
  version: number;
  exportedAt: string;
  appName?: string;
  appVersion?: string;
  spacesCount: number;
  tabsCount: number;
  pinnedCount: number;
  historyCount?: number;
  bookmarksCount?: number;
  notesCount?: number;
  hasSettings: boolean;
  hasPrivacy: boolean;
  categories: string[];
  rawContent: string;
  error?: string;
  /** File is passphrase-encrypted (.orbitsync): decrypt it before importing */
  encrypted?: boolean;
}

export interface ImportBackupOptions {
  rawContent: string;
  mode: 'merge' | 'replace';
}

export interface ImportBackupResult {
  success: boolean;
  mode: 'merge' | 'replace';
  error?: string;
  importedCounts: {
    spaces: number;
    tabs: number;
    history?: number;
    bookmarks?: number;
    notes?: number;
    settingsUpdated: boolean;
    privacyUpdated: boolean;
  };
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  favicon?: string | null;
  visitedAt: string;
  visitCount: number;
  spaceId?: string;
}

export interface RecordVisitData {
  url: string;
  title?: string;
  favicon?: string | null;
  spaceId?: string;
}

export interface HistoryFilterOptions {
  query?: string;
  spaceId?: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

export interface HistoryListResult {
  entries: HistoryEntry[];
  total: number;
}

export type HistoryClearRange = 'last-hour' | 'today' | 'last-7-days' | 'all';

export interface SpaceNote {
  spaceId: string;
  content: string;
  updatedAt: string;
}

export interface BookmarkItem {
  id: string;
  url: string;
  title: string;
  favicon?: string | null;
  spaceId?: string;
  folder?: string;
  isReadingList?: boolean;
  isRead?: boolean;
  /** Display order (favorites bar drag & drop); unset = by creation time */
  order?: number;
  createdAt: string;
}

export interface AddBookmarkData {
  url: string;
  title: string;
  favicon?: string | null;
  spaceId?: string;
  folder?: string;
  isReadingList?: boolean;
}

export interface SiteInfoResult {
  origin: string;
  protocol: string;
  isSecure: boolean;
  cookiesCount: number;
  hasStorage: boolean;
  certificate?: {
    issuerName?: string;
    validFrom?: string;
    validTo?: string;
    subjectName?: string;
  };
}

export interface ClearSiteDataResult {
  success: boolean;
  origin: string;
}

export interface ProcessMetricInfo {
  pid: number;
  type: string;
  cpuPercent: number;
  memoryMB: number;
  title?: string;
  url?: string;
  webContentsId?: number;
  isTab?: boolean;
  /** The browser's own interface (not a web page) */
  isAppUi?: boolean;
  /** Renderer without a page: service worker, extension or spare renderer */
  isWorker?: boolean;
  /** Can be ended from the Task Manager (web page tabs only) */
  killable?: boolean;
}

export interface SystemMetricsResult {
  processes: ProcessMetricInfo[];
  totalAppMemoryMB: number;
  systemFreeMemoryMB: number;
  systemTotalMemoryMB: number;
}

export interface ElectronAPI {
  /** Updates, screen sharing, sign-in prompts, safe browsing, autofill, routing, boosts, capture, AI, windows */
  essentials: import('./essentials').EssentialsApi;
  /** Snoozed tabs, page watchers, focus rules per space, search over pages you've read */
  smart: import('./smart').SmartApi;
  app: {
    getInfo: () => Promise<AppInfo>;
    getInfoSync: () => AppInfo;
    getVersion: () => string;
    getName: () => string;
    getChannel: () => ReleaseChannel;
    about: () => Promise<AboutInfo>;
    /** URLs the OS asked Orbit to open before the UI was ready */
    takePendingUrls: () => Promise<string[]>;
  };
  appInfo: AppInfo;
  passwords: {
    list: () => Promise<PasswordEntryInfo[]>;
    /** Decrypted password (for show / copy in the Passwords manager) */
    reveal: (id: string) => Promise<string | null>;
    update: (id: string, data: { username?: string; password?: string }) => Promise<boolean>;
    remove: (id: string) => Promise<boolean>;
    respond: (token: string, action: 'save' | 'never' | 'dismiss', username?: string) => Promise<boolean>;
    getSettings: () => Promise<PasswordSettings>;
    setOfferToSave: (enabled: boolean) => Promise<PasswordSettings>;
    removeNeverSave: (origin: string) => Promise<PasswordSettings>;
    /** A page submitted a login: ask the user whether to save it */
    onOffer: (callback: (offer: PasswordSaveOffer) => void) => () => void;
  };
  search: {
    /** Live suggestions from the search engine (never used for private tabs) */
    suggest: (query: string, engine: string) => Promise<string[]>;
  };
  defaultBrowser: {
    status: () => Promise<DefaultBrowserStatus>;
    set: () => Promise<{ ok: boolean; openedSystemSettings: boolean; error?: string }>;
  };
  extensions: {
    list: () => Promise<BrowserExtensionInfo[]>;
    addUnpacked: () => Promise<{ ok: boolean; error?: string; extension?: BrowserExtensionInfo }>;
    setEnabled: (id: string, enabled: boolean) => Promise<BrowserExtensionInfo[]>;
    setAllowInPrivate: (id: string, allow: boolean) => Promise<BrowserExtensionInfo[]>;
    remove: (id: string) => Promise<BrowserExtensionInfo[]>;
    openFolder: () => Promise<boolean>;
    /** Toolbar click on an extension without a popup, for the tab with this webContents id */
    click: (id: string, tabWebContentsId: number) => Promise<{ ok: boolean; error?: string }>;
    /** Reinstall built-in extensions the user removed */
    restoreBuiltins: () => Promise<BrowserExtensionInfo[]>;
    /** How many built-ins were removed (and can be restored) */
    removedBuiltinCount: () => Promise<number>;
    /** Download from Chrome Web Store / Edge Add-ons / Opera add-ons (link or id) and unpack for review */
    prepareFromStore: (input: string) => Promise<{ ok: true; preview: ExtensionInstallPreview } | { ok: false; error: string }>;
    /** Pick a .crx / .zip file and unpack for review */
    prepareFromFile: () => Promise<{ ok: true; preview: ExtensionInstallPreview } | { ok: false; error?: string }>;
    commitInstall: (token: string) => Promise<{ ok: boolean; error?: string; extension?: BrowserExtensionInfo; updated?: boolean }>;
    cancelInstall: (token: string) => Promise<boolean>;
  };
  theme: {
    get: () => Promise<ThemeState>;
    set: (data: SetThemeData) => Promise<ThemeState>;
    onChanged?: (callback: (state: ThemeState) => void) => () => void;
  };
  tabs: {
    list: (spaceId: string) => Promise<Tab[]>;
    create: (data: CreateTabData) => Promise<Tab>;
    update: (id: string, data: UpdateTabData) => Promise<Tab>;
    remove: (id: string) => Promise<boolean>;
    reorder: (spaceId: string, orderedIds: string[]) => Promise<Tab[]>;
  };
  spaces: {
    list: () => Promise<Space[]>;
    create: (data: CreateSpaceData) => Promise<Space>;
    update: (id: string, data: UpdateSpaceData) => Promise<Space>;
    remove: (id: string) => Promise<boolean>;
    setActive: (id: string) => Promise<Space>;
  };
  groups: {
    list: (spaceId: string) => Promise<TabGroup[]>;
    create: (data: CreateTabGroupData) => Promise<{ group: TabGroup; tabs: Tab[] }>;
    update: (id: string, data: UpdateTabGroupData) => Promise<TabGroup>;
    /** closeTabs=false: children move up to the parent; true: the group's tabs are closed */
    remove: (id: string, closeTabs?: boolean) => Promise<{ groups: TabGroup[]; tabs: Tab[] }>;
  };
  splits: {
    list: () => Promise<SavedSplit[]>;
    save: (data: SaveSplitData) => Promise<SavedSplit>;
    remove: (id: string) => Promise<boolean>;
  };
  settings: {
    get: () => Promise<Settings>;
    update: (data: UpdateSettingsData) => Promise<Settings>;
    /** Another window changed a setting */
    onChanged: (callback: (settings: Settings) => void) => () => void;
  };
  window: {
    minimize: () => Promise<void>;
    /** Open a private window (only private tabs, Edge InPrivate style) */
    openPrivate?: (url?: string) => Promise<boolean>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    setTitle?: (title: string) => Promise<void>;
    toggleFullScreen?: () => Promise<boolean>;
    isFullScreen?: () => Promise<boolean>;
    setFullScreen?: (flag: boolean) => Promise<boolean>;
  };
  navigation: {
    openExternal: (url: string) => Promise<void>;
  };
  devtools: {
    open: (webContentsId?: number, bounds?: { x: number; y: number; width: number; height: number }) => Promise<void>;
    inspect: (webContentsId: number, x: number, y: number, bounds?: { x: number; y: number; width: number; height: number }) => Promise<void>;
    updateBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
    /** Open app menus/popovers: the docked DevTools hides while one overlaps it */
    setOverlayRects?: (rects: { x: number; y: number; width: number; height: number }[]) => Promise<void>;
    detach: () => Promise<void>;
    close: () => Promise<void>;
    getState: () => Promise<DevToolsState>;
    syncActiveTab: (webContentsId: number) => Promise<void>;
    onStateChanged: (callback: (state: DevToolsState) => void) => () => void;
  };
  webview: {
    call: (webContentsId: number, method: string, ...args: any[]) => Promise<any>;
    saveAs: (webContentsId: number) => Promise<boolean>;
    saveAsPdf: (webContentsId: number) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
    print: (webContentsId: number) => Promise<any>;
    captureScreenshot: (webContentsId: number) => Promise<boolean>;
  };
  contextMenu: {
    onOpen: (callback: (data: ContextMenuEventData) => void) => () => void;
    onClose: (callback: () => void) => () => void;
  };
  omnibox?: {
    onClose: (callback: () => void) => () => void;
  };
  shortcuts?: {
    onTrigger: (callback: (action: string) => void) => () => void;
  };
  privacy: {
    getState: () => Promise<PrivacyEngineState>;
    updatePrefs: (updates: Partial<PrivacyShieldPrefs>) => Promise<PrivacyEngineState>;
    getSiteStatus: (url: string) => Promise<SiteShieldStatus>;
    toggleSiteShield: (origin: string) => Promise<boolean>;
    getStats: () => Promise<PrivacyStats>;
    clearBrowsingData: () => Promise<{ success: boolean }>;
    testProxy: () => Promise<ProxyTestResult>;
    getReport: (days?: number) => Promise<PrivacyReport>;
    resetReport: () => Promise<boolean>;
    onHttpsFallback: (callback: (info: { host: string; url: string; webContentsId?: number }) => void) => () => void;
    onStateChanged: (callback: (state: PrivacyEngineState) => void) => () => void;
  };
  downloads: {
    selectDirectory: () => Promise<string | null>;
    getDefaultPath: () => Promise<string>;
    openFolder: (dirPath?: string) => Promise<boolean>;
    showInFolder: (filePath: string) => Promise<boolean>;
    openFile: (filePath: string) => Promise<boolean>;
    deleteFile: (id: string, filePath?: string) => Promise<boolean>;
    list: () => Promise<DownloadRecord[]>;
    clear: () => Promise<boolean>;
    pause: (id: string) => Promise<boolean>;
    resume: (id: string) => Promise<boolean>;
    cancel: (id: string) => Promise<boolean>;
    onStarted?: (callback: (data: DownloadCompleted) => void) => () => void;
    onProgress?: (callback: (data: DownloadProgress) => void) => () => void;
    onCompleted?: (callback: (data: DownloadCompleted) => void) => () => void;
    onFailed?: (callback: (data: { id: string; filename: string; reason: string }) => void) => () => void;
  };
  backup: {
    exportData: (options: ExportBackupOptions) => Promise<ExportBackupResult>;
    selectAndInspectFile: () => Promise<BackupInspectionResult | null>;
    inspectJsonString: (content: string) => Promise<BackupInspectionResult>;
    importData: (options: ImportBackupOptions) => Promise<ImportBackupResult>;
  };
  history: {
    recordVisit: (data: RecordVisitData) => Promise<HistoryEntry | null>;
    getHistory: (options?: HistoryFilterOptions) => Promise<HistoryListResult>;
    searchHistory: (query: string, limit?: number) => Promise<HistoryEntry[]>;
    deleteItem: (id: string) => Promise<boolean>;
    deleteByUrl: (url: string) => Promise<boolean>;
    clearHistory: (range?: HistoryClearRange) => Promise<boolean>;
  };
  notes: {
    get: (spaceId: string) => Promise<string>;
    save: (spaceId: string, content: string) => Promise<boolean>;
  };
  bookmarks: {
    list: () => Promise<BookmarkItem[]>;
    add: (data: AddBookmarkData) => Promise<BookmarkItem>;
    delete: (id: string) => Promise<boolean>;
    deleteByUrl: (url: string) => Promise<boolean>;
    toggleRead: (id: string) => Promise<boolean>;
    isBookmarked: (url: string) => Promise<boolean>;
    update?: (id: string, data: { title?: string; url?: string; folder?: string }) => Promise<BookmarkItem | null>;
    reorder?: (ids: string[]) => Promise<boolean>;
    renameFolder?: (from: string, to: string) => Promise<number>;
    deleteFolder?: (folder: string) => Promise<number>;
    /** Fires after any bookmark change (from any window or dialog) */
    onChanged?: (callback: () => void) => () => void;
  };
  site: {
    getInfo: (url: string, spaceId?: string) => Promise<SiteInfoResult>;
    clearData: (origin: string) => Promise<ClearSiteDataResult>;
  };
  system?: {
    getProcessMetrics: () => Promise<SystemMetricsResult>;
    killProcess: (data: { pid?: number; webContentsId?: number }) => Promise<boolean>;
    trimMemory: () => Promise<boolean>;
  };
  permissions: {
    respond: (id: string, allow: boolean, remember: boolean) => Promise<boolean>;
    onRequest: (callback: (req: PermissionPromptRequest) => void) => () => void;
    onDismiss: (callback: (id: string) => void) => () => void;
  };
  siteSettings: {
    list: () => Promise<SiteSettingsList>;
    setPermission: (origin: string, permission: SitePermission, decision: 'allow' | 'block' | null) => Promise<boolean>;
    resetPermissions: (origin: string) => Promise<boolean>;
  };
  session: {
    getRestoreInfo: () => Promise<{ crashed: boolean; restorableCount: number }>;
    restore: () => Promise<number>;
    dismiss: () => Promise<boolean>;
  };
  focus: {
    setBlock: (domains: string[] | null) => Promise<string[] | null>;
    onBlocked: (callback: (info: { url: string; host: string; webContentsId?: number }) => void) => () => void;
  };
  sync: {
    getConfig: () => Promise<SyncConfig>;
    configure: (opts: { enabled?: boolean; filePath?: string; passphrase?: string }) => Promise<SyncConfig>;
    chooseFile: () => Promise<string | null>;
    syncNow: () => Promise<{ success: boolean; error?: string; filePath?: string }>;
    readFile: () => Promise<string | null>;
    exportEncrypted: (passphrase: string) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
    decrypt: (content: string, passphrase: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  };
  thumbnails: {
    capture: (webContentsId: number) => Promise<string | null>;
  };
  browserImport: {
    detect: () => Promise<ImportSource[]>;
    run: (sourceId: string, bookmarks: boolean, history: boolean) => Promise<BrowserImportResult>;
    bookmarksHtml: () => Promise<BrowserImportResult | null>;
    arcDetect: () => Promise<ArcImportInfo>;
    arcImport: () => Promise<ArcImportResult>;
  };
  onOpenUrl: (callback: (payload: { url: string; active: boolean; sourceWebContentsId?: number; isPrivate?: boolean }) => void) => () => void;
  onExternalUrl?: (callback: (url: string) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

// --- Site permissions, sync, import, privacy report ---

export type SitePermission = 'camera' | 'microphone' | 'geolocation' | 'notifications' | 'clipboard-read' | 'midi';

export interface PermissionPromptRequest {
  id: string;
  origin: string;
  permissions: SitePermission[];
  isPrivate: boolean;
}

export interface SiteSettingsList {
  permissions: Record<string, Partial<Record<SitePermission, 'allow' | 'block'>>>;
  shieldDisabled: string[];
  blocked: Array<{ origin: string; ads: number; trackers: number; total: number }>;
}

export interface PrivacyReport {
  since: string;
  days: Array<{ date: string; ads: number; trackers: number; https: number }>;
  totals: { ads: number; trackers: number; https: number };
  topSites: Array<{ origin: string; ads: number; trackers: number; total: number }>;
}

export interface SyncConfig {
  enabled: boolean;
  filePath: string;
  hasPassphrase: boolean;
  lastSyncedAt?: string;
}

export interface ImportSource {
  id: string;
  browser: string;
  profileName: string;
  kind: 'chromium' | 'firefox';
  profilePath: string;
  hasBookmarks: boolean;
  hasHistory: boolean;
}

export interface BrowserImportResult {
  success: boolean;
  bookmarks: number;
  history: number;
  error?: string;
}
