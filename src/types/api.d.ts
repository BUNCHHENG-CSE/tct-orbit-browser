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
}

export interface DownloadCompleted {
  id: string;
  filename: string;
  savePath: string;
  totalBytes: number;
}

export type BackupCategory = 'settings' | 'spaces' | 'tabs' | 'privacy';

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
  hasSettings: boolean;
  hasPrivacy: boolean;
  categories: string[];
  rawContent: string;
  error?: string;
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
    settingsUpdated: boolean;
    privacyUpdated: boolean;
  };
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
    onStateChanged: (callback: (state: PrivacyEngineState) => void) => () => void;
  };
  downloads: {
    selectDirectory: () => Promise<string | null>;
    getDefaultPath: () => Promise<string>;
    openFolder: (dirPath?: string) => Promise<boolean>;
    showInFolder: (filePath: string) => Promise<boolean>;
    onProgress?: (callback: (data: DownloadProgress) => void) => () => void;
    onCompleted?: (callback: (data: DownloadCompleted) => void) => () => void;
  };
  backup: {
    exportData: (options: ExportBackupOptions) => Promise<ExportBackupResult>;
    selectAndInspectFile: () => Promise<BackupInspectionResult | null>;
    inspectJsonString: (content: string) => Promise<BackupInspectionResult>;
    importData: (options: ImportBackupOptions) => Promise<ImportBackupResult>;
  };
  onOpenUrl: (callback: (payload: { url: string; active: boolean; sourceWebContentsId?: number }) => void) => () => void;
  onExternalUrl?: (callback: (url: string) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
