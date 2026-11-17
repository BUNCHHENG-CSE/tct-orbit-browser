# TCT Orbit (`v0.1.0`)

A fast, clean, and modern web browser built for smooth navigation and distraction-free workflows. Powered by `electron-vite`, React 18, Tailwind CSS, Prisma, and 100% private local machine storage.

---

## Key Features

- **Vertical Spaces & Sidebar**: Collapsible vertical sidebar dock with custom workspaces (Spaces) including Personal, Work, and Research with custom icons and colors.
- **Spotlight Command Bar**: Instant omnibox (`Cmd/Ctrl+T` or `Cmd/Ctrl+L`) with real-time address detection, search engine switching (DuckDuckGo, Google, Bing), and tab switching.
- **Persistent WebViews**: Independent Chromium webviews for each tab preserving DOM state, form data, scroll positions, and audio playback across spaces.
- **100% Private Local Storage**: All browsing history, tabs, spaces, and preferences are stored exclusively on your machine with zero cloud telemetry.
- **Chromium Native User-Agent**: Sanitized User-Agent string removing Electron signatures for seamless Google Auth and Cloudflare verification.
- **Multi-Channel Release Isolation**: Run Stable, Nova, Deep, and Canary releases side-by-side with separate `userData` folders and isolated database instances.

---

## Release Channels

TCT Orbit supports four release channels configured via `APP_CHANNEL` or `VITE_APP_CHANNEL` (defaults to `stable`):

| Channel | Display Name | Application ID | User Data Directory | Target Audience |
|---|---|---|---|---|
| **`stable`** | `TCT Orbit` | `com.tctorbit.browser` | `tct-orbit` | Official production users |
| **`nova`** | `TCT Orbit Nova` | `com.tctorbit.browser.nova` | `tct-orbit-nova` | Public beta testers |
| **`deep`** | `TCT Orbit Deep` | `com.tctorbit.browser.deep` | `tct-orbit-deep` | Nightly bleeding-edge testers |
| **`canary`** | `TCT Orbit Canary` | `com.tctorbit.browser.canary` | `tct-orbit-canary` | Developer preview builds |

Channels automatically isolate their respective `userData` directory, state files, and SQLite databases. Pre-release channels render dedicated channel badges in the title bar and settings modal.

---

## Storage & Directory Layout

All application data is centralized around `app.getPath('userData')`:

- **Windows**: `%APPDATA%\<channel>\` (e.g. `%APPDATA%\tct-orbit\`)
- **macOS**: `~/Library/Application Support/<channel>/`
- **Linux**: `~/.config/<channel>/`

### Folder Hierarchy

```
tct-orbit/
├── User Data/
│   └── Default/
│       ├── state.json       # Primary JSON state (tabs, spaces, settings) with atomic writes
│       └── orbit.db         # Channel-isolated SQLite database (Prisma)
└── Logs/                    # Native application logs (app.setAppLogsPath)
```

### Storage Resilience & Migration

1. **Atomic File Writes**: All mutations to `state.json` write to a temporary file (`state.json.<timestamp>.<rand>.tmp`) on the same volume before performing an atomic `fs.renameSync`, preventing corruptions during unexpected power loss.
2. **Safe Startup Migration**: On first launch of `v0.1.0`, the browser automatically checks for legacy `%APPDATA%\TCT Orbit Browser\tct-orbit-data.json` or legacy SQLite databases. If found and `User Data/Default/state.json` does not exist, files are safely migrated to `User Data/Default/` without deleting the original backup.
3. **Directory Overrides**: You can override the user data directory before launch using:
   - CLI Switch: `--user-data-dir="C:/path/to/custom/dir"`
   - Environment Variable: `TCT_ORBIT_DATA_DIR="C:/path/to/custom/dir"`

---

## Custom User-Agent

To ensure seamless compatibility with Google Authentication, Cloudflare Turnstile, and modern web applications, TCT Orbit configures `app.userAgentFallback` and all `BrowserWindow` / `<webview>` instances to strip out `Electron/<version>` and raw application tokens:

```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.137 Safari/537.36 TCTOrbit/0.1.0
```

---

## Project Structure

```
electron-app/
├── electron/
│   ├── main.ts                    # Main process entry, switches, protocols & User-Agent
│   ├── preload.ts                 # Preload bridge exposing window.api and app metadata
│   ├── storage/
│   │   ├── paths.ts               # Centralized path helper, migration & DB URL configuration
│   │   └── localStorage.ts        # Atomic JSON storage service for spaces, tabs & settings
│   ├── windows/
│   │   └── mainWindow.ts          # BrowserWindow setup with dynamic channel titles
│   └── ipc/
│       ├── index.ts               # IPC handler aggregation & app metadata
│       ├── tabs.ts                # Tab management handlers
│       ├── spaces.ts              # Space management handlers
│       └── settings.ts            # Settings & webview theme synchronizer
├── shared/
│   └── brand.ts                   # Centralized brand constants, domains & channel definitions
├── src/
│   ├── main.tsx                   # React root entry point
│   ├── App.tsx                    # Main browser layout, title sync & global shortcuts
│   ├── constants/
│   │   └── brand.ts               # Re-exported brand constants for renderer
│   ├── components/
│   │   ├── TitleBar/              # Frameless title bar with Omnibox & channel badge
│   │   ├── Sidebar/               # Collapsible sidebar with Spaces dock
│   │   ├── CommandBar/            # Spotlight search & engine switcher
│   │   ├── WebView/               # Multi-tab webview manager
│   │   └── SettingsModal/         # Dynamic settings & About modal with version info
│   ├── hooks/                     # Custom React hooks (useTabs, useSpaces, useSettings)
│   ├── store/                     # Zustand global client store (useBrowserStore)
│   └── types/
│       └── api.d.ts               # ElectronAPI, AppInfo, and domain type declarations
├── prisma/
│   ├── schema.prisma              # Database schema
│   ├── migrations/                # Database migrations
│   └── seed.ts                    # Default seeding script
├── electron-builder.yml           # electron-builder packaging configuration
├── dev-app-update.yml             # Electron auto-updater development configuration
├── electron.vite.config.ts        # electron-vite configuration with @ and @shared aliases
├── package.json                   # Scripts, dependencies, and v0.1.0 metadata
└── README.md                      # Project documentation
```

---

## Packaging & Installer Artifacts

Configured in `electron-builder.yml` with update feed at `https://updates.tctorbit.com`:

| Platform | Format | Output Artifact Name (`v0.1.0`) |
|---|---|---|
| **Windows** | NSIS Installer | `tct-orbit-0.1.0-setup.exe` |
| **Windows** | Portable Executable | `tct-orbit-0.1.0-portable.exe` |
| **macOS** | Apple Disk Image | `tct-orbit-0.1.0.dmg` |
| **Linux** | AppImage | `tct-orbit-0.1.0.AppImage` |
| **Linux** | Debian Package | `tct-orbit-0.1.0.deb` |

---

## Available Scripts

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `electron-vite dev` | Start development mode with Hot Module Replacement |
| `npm run build` | `electron-vite build` | Build production bundles for default channel (`stable`) |
| `npm run build:stable` | `cross-env APP_CHANNEL=stable ...` | Build production bundles for Stable channel |
| `npm run build:nova` | `cross-env APP_CHANNEL=nova ...` | Build production bundles for Nova (Beta) channel |
| `npm run build:deep` | `cross-env APP_CHANNEL=deep ...` | Build production bundles for Deep (Nightly) channel |
| `npm run build:canary` | `cross-env APP_CHANNEL=canary ...` | Build production bundles for Canary channel |
| `npm run typecheck` | `tsc --noEmit && ...` | Run TypeScript type checks across root, node, and web |
| `npm run dist` | `electron-vite build && electron-builder` | Package production installer for your platform |
| `npm run db:generate` | `prisma generate` | Generate Prisma client bindings |
| `npm run db:migrate` | `prisma migrate dev` | Run database migrations |
| `npm run db:seed` | `prisma db seed` | Run database seed script |
