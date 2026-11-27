# TCT Orbit

A fast, clean, and modern web browser built for smooth navigation and distraction-free workflows. Powered by `electron-vite`, React 18, TypeScript, Tailwind CSS, Zustand, and 100% private local machine storage.

---

## Key Features

- **Edge-Style Context-Aware Menu**: Theme-aware right-click menu with context detection for Blank Pages, Hyperlinks, Media, Editable Fields, and Selected Text, featuring QR code generation, screenshot capture, and Developer Tools integration.
- **Docked Right-Side DevTools (`Inspect`)**: Docked DevTools powered by Chromium's `WebContentsView` with real-time DOM element inspection, interactive splitter handle, tab-switch sync, and detach-to-window capability.
- **Unified Theme Engine**: Zero-flash startup with pre-rendered blocking script, system sync, light/dark modes, 6 accent color presets (`Orbit Blue`, `Nebula Violet`, `Emerald`, `Amber`, `Rose`, `Monochrome`), and native website color scheme pass-through without CSS inversion filters.
- **Smart Link Navigation & Automatic Tab Opening**: Intercepts `target="_blank"` and `window.open()` to immediately open and activate new tabs next to the active tab, while middle-click or `Ctrl/Cmd+Click` opens background tabs smoothly without losing focus.
- **Spotlight Command Bar**: Instant search (`Cmd/Ctrl+K`) with real-time address detection, search engine switching (DuckDuckGo, Google, Bing), and tab switching.
- **Vertical Spaces & Sidebar**: Collapsible vertical sidebar dock with custom workspaces (Spaces) including Personal, Work, and Research with custom icons and colors.
- **100% Private Local Storage**: All browsing history, tabs, spaces, and preferences are stored exclusively on your machine with zero cloud telemetry.
- **Chromium Native User-Agent**: Sanitized User-Agent string removing Electron signatures for seamless Google Auth and Cloudflare verification.
- **Multi-Channel Release Isolation**: Run Stable, Nova, Deep, and Canary releases side-by-side with separate `userData` folders.

- **Screen sharing, spellcheck and sign-in prompts**: pick a screen or window for every call, local spellchecking, HTTP and proxy sign-in.
- **Safer browsing**: phishing and malware lists checked on your computer, "Leave site?" warnings, crashed-tab recovery.
- **Page tools**: web capture with drawing, highlights saved to Space Notes, boosts (custom CSS, hidden elements), page translation.
- **Ask this page**: questions answered by a model on your own computer ([Ollama](https://ollama.com)); pages never leave it.
- **Windows and routing**: several windows, tabs that move between them, and sites that always open in a chosen Space.
- **Downloads you can see**: a message and a toolbar progress button when a download starts; pause, resume and automatic retry after a lost connection.
- **Favorites**: favorites bar with folders.
- **Ad and tracker blocking**: filter lists checked on your computer.
- **Make it yours**: custom keyboard shortcuts; interface in English, Spanish, French or German.

---

## Install

Download the file for your computer from the [latest release](https://github.com/arzurlab/tct-orbit-browser/releases/latest). In the names below, `<version>` is the release number.

| System | File | Notes |
|---|---|---|
| **Windows 10 / 11** (x64) | `tct-orbit-<version>-x64-setup.exe` | If SmartScreen appears: **More info → Run anyway** |
| **macOS 13+, Apple Silicon** (M series) | `tct-orbit-<version>-arm64.dmg` | See [First start on a Mac](#first-start-on-a-mac) |
| **macOS 13+, Intel** | `tct-orbit-<version>-x64.dmg` | See [First start on a Mac](#first-start-on-a-mac) |
| **Ubuntu / Debian** (x64) | `tct-orbit-<version>-amd64.deb` | `sudo apt install ./tct-orbit-<version>-amd64.deb` |
| **Other Linux** (x64) | `tct-orbit-<version>-x86_64.AppImage` | `chmod +x` the file, then run it |

### First start on a Mac

The Mac app is not notarized by Apple, so macOS asks once for each version:

1. Drag **TCT Orbit** into Applications and open it. macOS shows a warning; close it.
2. Open **System Settings → Privacy & Security** and choose **Open Anyway**.

Versions up to 0.1.8 were not signed, so macOS calls them "damaged". Install a newer version.

### Linux notes

- Use the `.deb` on Ubuntu 24.04 and newer. These systems only allow Chromium's sandbox to packages that ask for it, which the `.deb` does. There the AppImage starts **without the sandbox**.
- Only the `.deb` can become the default browser.

### Updates

| Version | Updates |
|---|---|
| Windows installer, Linux AppImage | Automatic, from GitHub Releases |
| macOS, Linux `.deb` | Download the new version |

---

## Publishing an update

```bash
npm version patch -m "release: v%s"
git push origin main --follow-tags
```

The `v*` tag starts CI, which attaches the installers and their `latest*.yml` files to the GitHub Release that installed copies read. The tag must match `version` in `package.json`, and the repository must stay **public**.

Before publishing, CI checks that:

- the Mac apps (Apple Silicon and Intel) are validly signed and start (`build/verify-mac.sh`),
- the `.deb` installs, and the `.deb` and the AppImage start (`build/verify-linux.sh`).

Automatic Mac updates and a start without "Open Anyway" need an Apple Developer ID; `electron-builder.yml` says what to change then.

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

- **Windows**: `%LOCALAPPDATA%\TCTOrbit\User Data\`
- **macOS**: `~/Library/Application Support/TCTOrbit/`
- **Linux**: `~/.config/tct-orbit/`

Other channels use their own folder. Data from older locations is moved once, on the first start.

### Folder Hierarchy

```
<data folder>/
├── Default/
│   ├── state.json           # Tabs, spaces, tab groups and settings (atomic writes)
│   ├── bookmarks.json       # Bookmarks and reading list
│   └── notes.json           # Space Notes
├── passwords.json, addresses.json   # Encrypted with the OS account
├── boosts.json, highlights.json, space-routes.json
├── safe-browsing/           # Phishing and malware lists (checked locally)
└── Logs/                    # Native application logs (app.setAppLogsPath)
```

### Storage Resilience & Migration

1. **Atomic File Writes**: All mutations to `state.json` write to a temporary file (`state.json.<timestamp>.<rand>.tmp`) on the same volume before performing an atomic `fs.renameSync`, preventing corruptions during unexpected power loss.
2. **Safe Startup Migration**: Data from older versions and folders is moved to the current folder once.
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
| `Cmd/Ctrl + T` | New tab |
| `Cmd/Ctrl + K` | Command bar |
| `Cmd/Ctrl + W` | Close active tab |
| `Cmd/Ctrl + Shift + T` | Reopen last closed tab |
| `Cmd/Ctrl + L` | Focus address bar / Omnibox |
| `Cmd/Ctrl + S` | Toggle sidebar rail |
| `Cmd/Ctrl + R` or `F5` | Reload active tab |
| `Cmd/Ctrl + Shift + R` | Hard reload & clear cache |
| `Cmd/Ctrl + N` | New window |
| `Alt + Shift + N` | New private window |
| `Cmd/Ctrl + J` | Downloads |
| `Cmd/Ctrl + Shift + S` | Web capture (copies the visible page, opens the editor) |
| `Cmd/Ctrl + Shift + Y` | Ask this page |
| `F12` or `Cmd/Ctrl + Shift + I` | Toggle docked Developer Tools |
| `Cmd/Ctrl + ,` | Open browser settings |
| `Cmd/Ctrl + 1..8` | Switch directly to tab N |
| `Cmd/Ctrl + 9` | Go to the last tab |
| `Cmd/Ctrl + /` | All shortcuts (they can be changed in Settings) |

---

## Packaging & Installer Artifacts

Configured in `electron-builder.yml`. CI publishes these:

| Platform | Architecture | Format |
|---|---|---|
| **Windows** | x64 | NSIS installer (`.exe`) |
| **macOS 13+** | Apple Silicon, Intel | Disk image (`.dmg`), ad-hoc signed |
| **Linux** | x64 | `.deb`, AppImage |

The `dist:*` scripts in `package.json` can also build Windows ARM64, a universal Mac app, and `.rpm` and pacman packages for Linux. CI does not publish or test those.

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

---

## License

Copyright (C) 2026 TCT

TCT Orbit is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License, version 3 only, as published by the Free Software Foundation. It comes without any warranty. See [LICENSE](LICENSE).

Code published before this change was released under the MIT License and stays available under it. Third-party components keep their own licenses. The TCT Orbit name and logo may not be used in a way that suggests a modified version is official.
