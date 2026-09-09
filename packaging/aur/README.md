# Onyx Launcher AUR Package (`onyx-launcher-bin`)

Arch Linux package build files for [Onyx Launcher](https://lonestill.github.io).

## Testing locally on Arch Linux

```bash
cd packaging/aur
makepkg -si
```

## Publishing to AUR

1. Clone your AUR repository:
   ```bash
   git clone ssh://aur@aur.archlinux.org/onyx-launcher-bin.git aur-repo
   ```
2. Copy `PKGBUILD` and `.SRCINFO` into the repo:
   ```bash
   cp packaging/aur/PKGBUILD packaging/aur/.SRCINFO aur-repo/
   ```
3. Commit and push:
   ```bash
   cd aur-repo
   git add PKGBUILD .SRCINFO
   git commit -m "chore: update to 1.6.8"
   git push origin master
   ```
