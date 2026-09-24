# Onyx Launcher

[![CI](https://github.com/lonestill/onyx-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/lonestill/onyx-launcher/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/lonestill/onyx-launcher?color=22c55e&label=release)](https://github.com/lonestill/onyx-launcher/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Good First Issues](https://img.shields.io/github/issues/lonestill/onyx-launcher/good%20first%20issue?color=7057ff&label=good%20first%20issues)](https://github.com/lonestill/onyx-launcher/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
[![Hacktoberfest](https://img.shields.io/badge/Hacktoberfest-2026-ff7518?style=flat&logo=hacktoberfest&logoColor=white)](https://github.com/lonestill/onyx-launcher/issues?q=is%3Aissue+is%3Aopen+label%3Ahacktoberfest)
[![Scoop](https://img.shields.io/badge/Scoop-lonestill%2Fscoop--onyx-4b89dc)](https://github.com/lonestill/scoop-onyx)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/qHZCehveYp)

A modern, fast, zero-bloat Minecraft launcher for Windows and Linux, built with Electron, React, and TypeScript. Onyx features 1-click universal migration from all major launchers, built-in 3D skin & cape studio, automated crash bisect diagnostics, and isolated instance management.

[Download the latest release (v1.6.16)](https://github.com/lonestill/onyx-launcher/releases/latest) · [💬 Discord Community](https://discord.gg/qHZCehveYp) · [Good first issues](https://github.com/lonestill/onyx-launcher/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22) · [Contribute](CONTRIBUTING.md)

## 💬 Community & Support

Got questions, hit a crash, want to suggest a feature, or test upcoming beta builds? Join our official Discord server:

[![Join Discord](https://img.shields.io/badge/Discord-Join%20Onyx%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/qHZCehveYp)

- 🚨 **Instant Crash Troubleshooting**: Paste logs and get help directly from the developers.
- 🧪 **Beta Testing**: Test new engine updates, memory tweaks, and performance tools before release.
- 💡 **Ideas & Feedback**: Share suggestions and discuss what gets built next.

## Screenshots

| Home | Library |
| --- | --- |
| ![Onyx Launcher home screen](artifacts/home.png) | ![Minecraft instance library](artifacts/library.png) |

| Modrinth Catalog | CurseForge Official Catalog |
| --- | --- |
| ![Modrinth discovery catalog](artifacts/discover.png) | ![CurseForge official repository](artifacts/curseforge-discover.png) |

| Mod Details (Overview & Gallery) | Mod Versions & 1-Click Install |
| --- | --- |
| ![Mod detail overview and high-res gallery](artifacts/mod-detail-overview.png) | ![Mod versions, filters, and 1-click install](artifacts/mod-detail-versions.png) |

| Curated Onyx Picks | Universal 1-Click Migration |
| --- | --- |
| ![Curated Onyx Picks modpacks](artifacts/onyx-picks.png) | ![Universal migration from Prism, CurseForge, Modrinth](artifacts/migration.png) |

| Instance Details & Flight Recorder | 3D Skin & Cape Studio |
| --- | --- |
| ![Minecraft instance details and performance](artifacts/instance.png) | ![3D WebGL Three.js character & cape studio](artifacts/profiles-and-skins.png) |

| Settings & Live Auto-Updater |
| --- |
| ![Onyx Launcher settings and auto-updater](artifacts/settings.png) |

All screenshots are generated from the current English UI with `npm run capture:screenshots`.



## ⚡ Feature Comparison

| Feature | Onyx Launcher | Prism Launcher | CurseForge App | Modrinth App |
| :--- | :---: | :---: | :---: | :---: |
| **Automated Mod Bisect (Find Crash Culprit)** | **✅ Built-in** | ❌ | ❌ | ❌ |
| **Telemetry Flight Recorder & CSV Benchmark Export** | **✅ Built-in** | ❌ | ❌ | ❌ |
| **Native Crash Log Diagnostics** | **✅ Deep Analysis** | ⚠️ Basic | ❌ | ❌ |
| **1-Click Universal Migration (from 8+ launchers)** | **✅ Universal** | ⚠️ Partial | ❌ | ❌ |
| **Built-in 3D WebGL Skin & Cape Studio** | **✅ Three.js** | ❌ | ❌ | ❌ |
| **Dual Modrinth + CurseForge Search & 1-Click Install** | **✅ Both** | ✅ Both | ❌ CurseForge only | ❌ Modrinth only |
| **Discord Rich Presence (RPC)** | **✅ Built-in (IPC)** | 🔌 Third-party | ✅ Built-in | ✅ Built-in |
| **Full Multi-Language Localization (i18n)** | **✅ EN / RU** | ✅ Community | ⚠️ Partial | ⚠️ Partial |
| **Zero Bloat & Telemetry Opt-out** | **✅ Fully Offline-safe** | ✅ Clean | ❌ Ads & Overwolf | ✅ Clean |

## Highlights

### Minecraft and Java

- Official Mojang release and snapshot manifests.
- Vanilla, Fabric, Quilt, Forge, and NeoForge support.
- Shared asset and library caches without duplicating files between instances.
- Automatic Eclipse Temurin Java 8, 17, or 21 selection and installation.
- SHA-1, SHA-256, and SHA-512 verification for downloaded files.
- Official Minecraft demo mode without a Microsoft account.
- Per-instance memory, resolution, fullscreen, Java, JVM arguments, and Quick Join settings.
- Onyx AutoTune recommendations based on system memory, Java, and mod count.
- Launch progress, process controls, live logs, and actionable crash diagnostics.

### Instances and data safety

- Dedicated instance pages for health, sessions, content, servers, storage, and actions.
- Multiple saved servers per instance, DNS SRV support, status checks, and Quick Join.
- Ghost Mode releases the launcher window, WebContents, and GPU process while playing.
- Crash Bisect narrows a suspected mod conflict across controlled test launches.
- World Guard creates manual and automatic world snapshots with safe restoration.
- Update Preview shows added, changed, and removed modpack files before installation.
- Onyx Sync exports reproducible settings and exact Modrinth mod versions to `.onyxprofile`.
- Flight Recorder tracks memory, CPU, startup, GC pauses, and per-session performance.
- Optional FPS and frame-time recording powered by Onyx Probe (JVM agent) or MangoHud on Linux.
- Performance baselines compare FPS, 1% lows, memory, and startup time between sessions.
- Safe deletion through the operating-system trash, `.onyxpack` backups, and repair tools.
- Transactional mod profiles, mod update history, storage analysis, and safe cleanup.
- Safe instance-directory migration with verification and rollback.

### Modrinth, CurseForge, and Discovery

- Searchable Modrinth and CurseForge modpack & mod catalogs with official vector branding, filters, and pagination.
- Detailed mod and modpack view with high-res screenshot gallery, rich HTML/Markdown descriptions, environment sidebars, and 1-click version installers.
- Curated Onyx Picks with play-style and hardware match filters.
- Complete `.mrpack` and CurseForge manifest installation, dependency resolution, and updates.
- Universal 1-click migration from Prism, CurseForge, Modrinth App, MultiMC, PolyMC, ATLauncher, Feather Client, and Vanilla.
- Built-in GitHub Releases Auto-Updater with streaming downloads, byte-level progress bar, speed, ETA, and 1-click restart.
- Resumable HTTP downloads with cancellation and partial-file cleanup.
- Microsoft/Xbox device-code sign-in without exposing the account password to Onyx.
- Minecraft: Java Edition entitlement checks and multiple saved Microsoft accounts.
- Offline accounts and per-profile skin management with native 3D WebGL Three.js character & cape studio.
- Refresh-token encryption through Electron `safeStorage`; tokens remain memory-only when secure storage is unavailable.

## Install

### Windows

**Via Scoop:**

```powershell
scoop bucket add onyx https://github.com/lonestill/scoop-onyx
scoop install onyx/onyx-launcher
```

**Direct download:**

Download an installer or portable archive from the [latest GitHub Release](https://github.com/lonestill/onyx-launcher/releases/latest):
- NSIS installer: `Onyx.Launcher.Setup.1.6.16.exe`
- Portable executable: `Onyx.Launcher.1.6.16.exe`

Windows builds are unsigned, so SmartScreen may display a warning on first launch.

### Linux

**Arch Linux (AUR):**

```bash
yay -S onyx-launcher-bin
# or build manually with makepkg from packaging/aur
```

**Direct download:**

Download from the [latest GitHub Release](https://github.com/lonestill/onyx-launcher/releases/latest):
- AppImage: `Onyx-Launcher-1.6.16-x86_64.AppImage`
- Portable archive: `Onyx-Launcher-1.6.16-linux-x64.tar.gz`


### Verify a download

The SHA-256 checksum files attached to each release can be used to verify that a downloaded file matches the published release asset.

#### Windows

Open PowerShell in the directory containing the downloaded `.exe` file and run:

```powershell
Get-FileHash -Algorithm SHA256 .\*.exe
```

Compare the resulting `Hash` value with the matching entry in `SHA256SUMS-windows.txt`.

#### Linux

Open a terminal in the directory containing the downloaded AppImage and run:

```bash
sha256sum --ignore-missing --check SHA256SUMS-linux.txt
```

The command prints `OK` when the downloaded AppImage matches its entry in `SHA256SUMS-linux.txt`.

A matching SHA-256 checksum confirms that the downloaded file matches the published release asset. It does not provide a code signature or prove who created the file.



## ❓ Frequently Asked Questions (FAQ)

### How do I find which mod crashed my Minecraft instance?
Onyx Launcher features an automated **Crash Bisect** diagnostic engine. Instead of manually enabling and disabling dozens of mods by hand, open your instance, go to the **Bisect** tab, and start a session. Onyx performs a controlled binary search across test launches, isolating the exact culprit mod or conflict within minutes.

### How do I export Minecraft FPS and frame-time benchmarks to CSV?
Navigate to your instance, open the **Performance** tab, and click **Export CSV**. Onyx Launcher records FPS, 1% lows, frame times, memory allocation, and CPU usage during sessions, formatting everything into an RFC-4180 compliant CSV file for benchmarking and graphing.

### Can I migrate my worlds and modpacks from CurseForge, Prism, or Modrinth?
Yes! Onyx includes a **Universal 1-Click Migration** tool. Click the migration icon in your Library or Command Palette, select your current launcher (Prism, CurseForge, Modrinth App, MultiMC, ATLauncher, Feather, or Vanilla), and Onyx imports your instances, worlds, and configs without touching your original files.

### Does Onyx Launcher support Discord Rich Presence?
Yes, built-in natively via Discord IPC. It shows the instance name, modpack, and elapsed play time with customizable privacy options (such as hiding private server IPs).

## Contributing

Small, focused pull requests are welcome. You can start with a curated [good first issue](../../issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22), pick any task marked [help wanted](../../issues?q=is%3Aissue%20is%3Aopen%20label%3A%22help%20wanted%22), or discuss a larger change in [Ideas](../../discussions/categories/ideas).

The [contribution guide](CONTRIBUTING.md) contains the codebase map, local setup, and verification commands. If an issue is unassigned, leave a short comment and start working on it; you do not need to wait for a formal assignment.


## Development

Requirements:

- Node.js 22 or newer.
- Windows 10/11 x64 or a modern x64 Linux distribution.

```bash
npm ci
npm run dev
```

Run the complete local verification suite:

```bash
npm run check
```

Individual commands are also available:

```bash
npm run typecheck
npm run lint
npm test
npm run build:renderer
```

Regenerate every README screenshot from a deterministic local fixture:

```bash
npm run capture:screenshots
```

## Automated releases

The repository uses two GitHub Actions workflows:

- `CI` validates every pull request.
- `Release` batches merged changes into a weekly Friday release and can also be started manually for an urgent release. A scheduled run exits without creating a version when there are no commits since the latest tag.

A successful release workflow:

1. installs locked dependencies with `npm ci` and runs `npm run check`;
2. increments the patch version in `package.json` and `package-lock.json`;
3. commits the version as `chore(release): vX.Y.Z` and creates the matching Git tag;
4. builds Windows and Linux x64 packages on native runners;
5. generates SHA-256 checksum files and publishes a GitHub Release with generated notes.

Set **Settings → Actions → General → Workflow permissions** to **Read and write permissions**. If the release branch is protected, allow `github-actions[bot]` to push the release commit and tag.

## Local packaging

```bash
# Windows NSIS installer and portable executable
npm run dist:windows

# Linux AppImage
npm run dist:linux

# Linux portable tar.gz
npm run dist:linux:archive
```

Build output is written to `release/` and is intentionally excluded from Git.

## Data locations

On Windows:

- launcher state: `%APPDATA%\onyx-launcher\state.json`;
- encrypted accounts: `%APPDATA%\onyx-launcher\account.json`;
- instances: `%APPDATA%\.onyx\instances`;
- shared assets and libraries: `%APPDATA%\.onyx\shared`;
- Java runtimes: `%APPDATA%\.onyx\runtimes`;
- modpack cache: `%APPDATA%\.onyx\packs`;
- update backups: `%APPDATA%\.onyx\backups`.

On Linux, launcher state follows XDG under `~/.config/onyx-launcher`, while game data is stored in `~/.local/share/onyx`. A legacy `~/.config/.onyx` data directory is detected automatically.

## Architecture and security

- `src/` is an isolated React renderer without Node.js access.
- `electron/preload.cjs` exposes a narrow IPC bridge.
- `electron/main.cjs` owns windows, state, filesystem access, and system operations.
- `electron/services/` contains authentication, Minecraft installation, Modrinth, networking, backups, diagnostics, performance, and data-safety services.

The renderer uses `contextIsolation`, Electron sandboxing, and disabled `nodeIntegration`. Navigation, webviews, and browser permissions are restricted. Network and filesystem operations stay in the main process.

Diagnostic exports redact tokens, personal paths, email addresses, and server IPs. Please review [SECURITY.md](SECURITY.md) before reporting a vulnerability.

## Microsoft OAuth

Onyx currently defaults to the public Prism Launcher Microsoft OAuth client ID and its consumer device-code flow. A custom client ID can be supplied for development:

```powershell
$env:ONYX_MICROSOFT_CLIENT_ID="your-client-id"
npm run dev
```

Refresh tokens are tied to the client ID. Accounts must be added again after changing it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development and pull-request workflow.

## Legal

Onyx does not distribute Minecraft or bypass its license. Game files are downloaded directly from Mojang, and third-party content is downloaded from URLs provided by Modrinth APIs and manifests. A licensed Microsoft account is required for the full Minecraft: Java Edition experience.

Onyx Launcher is an independent project and is not affiliated with Microsoft, Mojang Studios, or Modrinth. Minecraft is a trademark of Microsoft.

Released under the [MIT License](LICENSE). Third-party attributions are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
