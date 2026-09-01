# Contributing

Thank you for helping improve Onyx Launcher.

## Find something to work on

- Start with a curated [good first issue](../../issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22).
- Browse tasks marked [help wanted](../../issues?q=is%3Aissue%20is%3Aopen%20label%3A%22help%20wanted%22).
- Share larger product ideas in [GitHub Discussions](../../discussions/categories/ideas) before building them.

If an issue is open and unassigned, leave a short comment and start working on it. You do not need to wait for a formal assignment. Keep the first pull request small enough to review independently.

## Codebase map

- `src/pages/` contains the main React screens.
- `src/components/` contains reusable interface components and dialogs.
- `src/i18n.tsx` contains all user-facing English copy.
- `electron/main.cjs` owns the Electron lifecycle and IPC handlers.
- `electron/preload.cjs` exposes the narrow renderer API as `window.onyx`.
- `electron/services/` contains Minecraft, downloads, accounts, backups, diagnostics, and other domain logic.
- `tests/core.test.cjs` contains the Node test suite for service and platform behavior.
- `.github/workflows/` contains CI and release automation.

Renderer code must use the preload API instead of importing Node or Electron modules directly. Keep filesystem and network work in the Electron process or a focused service.

## Local setup

Requirements:

- Node.js 22 or newer.
- Windows 10/11 x64 or a modern x64 Linux distribution for full launcher testing.

```bash
git clone https://github.com/lonestill/onyx-launcher.git
cd onyx-launcher
npm ci
npm run dev
```

## Before opening a pull request

1. Create a focused branch from the current default branch.
2. Install locked dependencies with `npm ci`.
3. Keep source code, UI copy, tests, documentation, and screenshots in English.
4. Run the full verification suite:

```bash
npm run check
```

5. Regenerate screenshots with `npm run capture:screenshots` when a visible interface change affects the README gallery.

## Pull requests

Describe the problem, the implementation, and how the change was verified. Include before-and-after screenshots for visual changes. Keep unrelated refactors out of the same pull request.

Do not edit the package version for a normal contribution. A successful push to `main` or `master` automatically increments the patch version, creates a tag, builds packages, and publishes a GitHub Release.

## Security reports

Do not open a public issue for a suspected vulnerability. Follow the private reporting guidance in [SECURITY.md](SECURITY.md).
