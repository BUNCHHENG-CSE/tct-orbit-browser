# TCT Orbit (`v0.1.2`)

A fast, clean, and modern web browser built for smooth navigation and distraction-free workflows. Powered by `electron-vite`, React 18, TypeScript, Tailwind CSS, Zustand, and 100% private local machine storage.

---

## Key Features

- **Edge-Style Context-Aware Menu**: Theme-aware right-click menu with context detection for Blank Pages, Hyperlinks, Media, Editable Fields, and Selected Text, featuring QR code generation, screenshot capture, and Developer Tools integration.
- **Docked Right-Side DevTools (`Inspect`)**: Docked DevTools powered by Chromium's `WebContentsView` with real-time DOM element inspection, interactive splitter handle, tab-switch sync, and detach-to-window capability.
- **Unified Theme Engine**: Zero-flash startup with pre-rendered blocking script, system sync, light/dark modes, 6 accent color presets (`Orbit Blue`, `Nebula Violet`, `Emerald`, `Amber`, `Rose`, `Monochrome`), and native website color scheme pass-through without CSS inversion filters.
- **Smart Link Navigation & Automatic Tab Opening**: Intercepts `target="_blank"` and `window.open()` to immediately open and activate new tabs next to the active tab, while middle-click or `Ctrl/Cmd+Click` opens background tabs smoothly without losing focus.
- **Spotlight Command Bar**: Instant omnibox (`Cmd/Ctrl+T` or `Cmd/Ctrl+L`) with real-time address detection, search engine switching (DuckDuckGo, Google, Bing), and tab switching.
- **Vertical Spaces & Sidebar**: Collapsible vertical sidebar dock with custom workspaces (Spaces) including Personal, Work, and Research with custom icons and colors.
- **100% Private Local Storage**: All browsing history, tabs, spaces, and preferences are stored exclusively on your machine with zero cloud telemetry.
- **Chromium Native User-Agent**: Sanitized User-Agent string removing Electron signatures for seamless Google Auth and Cloudflare verification.
- **Multi-Channel Release Isolation**: Run Stable, Nova, Deep, and Canary releases side-by-side with separate `userData` folders.

- **Screen sharing, spellcheck and sign-in prompts**: pick a screen or window for every call, local spellchecking, HTTP and proxy sign-in.
- **Safer browsing**: phishing and malware lists checked on your computer, "Leave site?" warnings, crashed-tab recovery.
- **Page tools**: web capture with drawing, highlights saved to Space Notes, boosts (custom CSS, hidden elements), page translation.
- **Ask this page**: questions answered by a model on your own computer ([Ollama](https://ollama.com)); pages never leave it.
- **Windows and routing**: several windows, tabs that move between them, and sites that always open in a chosen Space.
- **Make it yours**: custom keyboard shortcuts; interface in English, Spanish, French or German.

---

## Publishing an update

Push a `v*` tag. CI attaches the installers and their `latest*.yml` files to the GitHub Release, which installed copies read. The repository (or a separate releases repository set in `electron-builder.yml`) must be **public**, and macOS updates need a signed app.

---

## Release Channels

TCT Orbit supports four release channels configured via `APP_CHANNEL` or `VITE_APP_CHANNEL` (defaults to `stable`):

| Channel | Display Name | Application ID | User Data Directory | Target Audience |
|---|---|---|---|---|
| **`stable`** | `TCT Orbit` | `com.tctorbit.browser` | `tct-orbit` | Official production users |
| **`nova`** | `TCT Orbit Nova` | `com.tctorbit.browser.nova` | `tct-orbit-nova` | Public beta testers |
| **`deep`** | `TCT Orbit Deep` | `com.tctorbit.browser.deep` | `tct-orbit-deep` | Nightly bleeding-edge testers |
| **`canary`** | `TCT Orbit Canary` | `com.tctorbit.browser.canary` | `tct-orbit-canary` | Developer preview builds |

Channels automatically isolate their respective `userData` directory, state files and browsing data. Pre-release channels render dedicated channel badges in the title bar and settings modal.

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
│       ├── state.json       # Tabs, spaces, tab groups and settings (atomic writes)
│       ├── bookmarks.json   # Bookmarks and reading list
│       └── notes.json       # Space Notes
├── passwords.json, addresses.json   # Encrypted with the OS account
├── boosts.json, highlights.json, space-routes.json
├── safe-browsing/           # Phishing and malware lists (checked locally)
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
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/<bundled Chromium version> Safari/537.36
```

---

## Edge-Style Context Menu & Inspect DevTools

Right-clicking inside any webpage or tab triggers a context-aware menu:
- **Blank Page**: Back, Forward, Refresh, Save as..., Print..., Create QR Code, Screenshot, More tools (DevTools, Hard reload, Copy URL, External browser, Bookmark), View page source, Inspect.
- **Link**: Open in new tab (next to current tab), Open in new window, Copy link address, Save link as..., Create QR Code for link, Inspect.
- **Image**: Open image in new tab, Save image as..., Copy image, Copy image address, Inspect.
- **Selection**: Copy, Search web for query in new tab, Print..., Inspect.
- **Editable Input**: Spelling suggestions, Undo, Redo, Cut, Copy, Paste, Paste as plain text, Select all, Inspect.
- **Inspect Element**: Directly opens the docked right-side DevTools `WebContentsView` (or detached window) and highlights the exact clicked DOM node via `inspectElement(x, y)`.

---

## Keyboard Shortcuts

| Shortcut | Description |
|---|---|
| `Cmd/Ctrl + T` | Open new tab & spotlight command bar |
| `Cmd/Ctrl + W` | Close active tab |
| `Cmd/Ctrl + Shift + T` | Reopen last closed tab |
| `Cmd/Ctrl + L` | Focus address bar / Omnibox |
| `Cmd/Ctrl + S` | Toggle sidebar rail |
| `Cmd/Ctrl + R` | Reload active tab |
| `Cmd/Ctrl + Shift + R` | Hard reload & clear cache |
| `Cmd/Ctrl + N` | New window |
| `Cmd/Ctrl + Shift + S` | Web capture (copies the visible page, opens the editor) |
| `Cmd/Ctrl + Shift + Y` | Ask this page |
| `F12` or `Cmd/Ctrl + Shift + I` | Toggle docked Developer Tools |
| `Cmd/Ctrl + ,` | Open browser settings |
| `Cmd/Ctrl + 1..9` | Switch directly to tab N |

---

## Packaging & Installer Artifacts

Configured in `electron-builder.yml` with updates from GitHub Releases:

| Platform | Architecture | Format | Output Artifact Name (`v0.1.2`) |
|---|---|---|---|
| **Windows** | x64, ARM64 | NSIS Installer | `tct-orbit-0.1.2-${arch}-setup.exe` |
| **Windows** | x64, ARM64 | Portable Executable | `tct-orbit-0.1.2-${arch}-portable.exe` |
| **macOS** | Apple Silicon, Intel, Universal | Apple Disk Image (LZMA) | `tct-orbit-0.1.2-${arch}.dmg` |
| **macOS** | Apple Silicon, Intel, Universal | Compressed Archive | `tct-orbit-0.1.2-${arch}.zip` |
| **Linux** | x64, ARM64 | AppImage | `tct-orbit-0.1.2-${arch}.AppImage` |
| **Linux** | x64, ARM64 | Debian Package (Ubuntu/Debian) | `tct-orbit-0.1.2-${arch}.deb` |
| **Linux** | x64, ARM64 | RPM Package (Fedora/RHEL/openSUSE) | `tct-orbit-0.1.2-${arch}.rpm` |
| **Linux** | x64, ARM64 | Pacman Package (Arch Linux) | `tct-orbit-0.1.2-${arch}.pkg.tar.zst` |
| **Linux** | x64, ARM64 | Tarball | `tct-orbit-0.1.2-${arch}.tar.gz` |

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
| `npm test` | `vitest run` | Run unit tests |
