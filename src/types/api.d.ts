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
  updatedAt: string | Date;
}

export interface CreateSpaceData {
  name: string;
  color?: string;
  icon?: string;
  order?: number;
  initialUrl?: string;
  initialTitle?: string;
}

export interface UpdateSpaceData {
  name?: string;
  color?: string;
  icon?: string;
  order?: number;
  isActive?: boolean;
}

export interface CreateTabData {
  spaceId: string;
  url: string;
  title?: string;
  favicon?: string | null;
  isPinned?: boolean;
  order?: number;
  isPrivate?: boolean;
}

export interface UpdateTabData {
  url?: string;
  title?: string;
  favicon?: string | null;
  isPinned?: boolean;
  order?: number;
  spaceId?: string;
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

export type BackupCategory = 'settings' | 'spaces' | 'tabs' | 'privacy' | 'history';

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
}

export interface SystemMetricsResult {
  processes: ProcessMetricInfo[];
  totalAppMemoryMB: number;
  systemFreeMemoryMB: number;
  systemTotalMemoryMB: number;
}

export interface ElectronAPI {
  app: {
    getInfo: () => Promise<AppInfo>;
    getInfoSync: () => AppInfo;
    getVersion: () => string;
    getName: () => string;
    getChannel: () => ReleaseChannel;
  };
  appInfo: AppInfo;
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
  settings: {
    get: () => Promise<Settings>;
    update: (data: UpdateSettingsData) => Promise<Settings>;
  };
  window: {
    minimize: () => Promise<void>;
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
  };
  site: {
    getInfo: (url: string) => Promise<SiteInfoResult>;
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
