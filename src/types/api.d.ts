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

export interface Settings {
  id: string;
  userId: string;
  defaultSearchEngine: "duckduckgo" | "google" | "bing" | string;
  theme: string;
  sidebarCollapsed: boolean;
  accentColor?: string;
  accentPreset?: AccentPreset;
  webColorScheme?: WebColorScheme;
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
}

export type ReleaseChannel = 'stable' | 'nova' | 'deep' | 'canary';

export interface AppInfo {
  name: string;
  version: string;
  channel: ReleaseChannel;
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
  onExternalUrl?: (callback: (url: string) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
