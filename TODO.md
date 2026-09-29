# Scope Launcher — Crash Auto-Fix Engine Roadmap & TODO

This document tracks all implemented and planned automated crash diagnosis and 1-click auto-fix mechanisms in Scope Launcher (`electron/services/crash-autofix.cjs`).

---

## 🎯 Current Status

### ✅ Implemented (Core & Extended)
1. **Memory Starvation (`increase-memory`)**:
   - Root Cause: `OutOfMemoryError: Java heap space` or `GC overhead limit exceeded`.
   - Action: Computes safe RAM increase (+2 GB, respecting total physical RAM limit) and saves to instance configuration with user confirmation.
2. **Missing Indium for Sodium (`install-indium`)**:
   - Root Cause: Sodium loaded with Fabric Rendering API dependent mods without Indium (`IndiumException`).
   - Action: Queries Modrinth API for compatible Indium build for current Minecraft version and installs directly in 1 click.
3. **Java Version Mismatch (`switch-java`)**:
   - Root Cause: `UnsupportedClassVersionError` (class file 65.0 -> Java 21, 61.0 -> Java 17, 60.0 -> Java 16, 52.0 -> Java 8) or MC 1.20.5+ running on Java 17.
   - Action: Clears obsolete custom java path, switches instance to matching Eclipse Temurin runtime.
4. **Invalid / Obsolete JVM Arguments (`reset-jvm-args`)**:
   - Root Cause: `Unrecognized VM option` (e.g. `-XX:+UseConcMarkSweepGC`), `Could not create the Java Virtual Machine`.
   - Action: Clears invalid flags and restores verified default JVM arguments.
5. **Corrupted ZIP / JAR Archive (`clean-corrupted-file`)**:
   - Root Cause: `ZipException: zip END header not found`, truncated jar file.
   - Action: Deletes corrupted JAR archive and triggers full asset/library integrity verification.
6. **Deep JAR Manifest Inspection (`disable-culprit-mod`)**:
   - Root Cause:
     - Loader Mismatch: Forge mod in Fabric instance or vice-versa (inspected via `fabric.mod.json`, `mods.toml`, `neoforge.mods.toml`).
     - Version Mismatch: Mod compiled for MC 1.16/1.19 placed in MC 1.20+ instance.
     - Known Culprit: Explicit crash report suspected culprit mod.
   - Action: Safely disables culprit file (`.jar.disabled`).
7. **Missing Dependency Auto-Downloader (`install-missing-dependency`)**:
   - Root Cause: Unmet dependencies (`requires {fabric-api}`, `fabric-language-kotlin`, `cloth-config`, `architectury`, `yacl`, etc.).
   - Action: Resolves missing mod ID, matches instance loader and Minecraft version via Modrinth API, and downloads companion library.
8. **Duplicate Mod Elimination (`remove-duplicate-mod`)**:
   - Root Cause: `DuplicateModsFoundException`, multiple versions of same mod or browser download copies (e.g. `mod (1).jar`).
   - Action: Identifies duplicate mod ID, compares timestamps/names, and disables the copy.
9. **Mutually Exclusive Mod Conflicts (`resolve-mod-conflict`)**:
   - Root Cause: Incompatible mods (OptiFine + Sodium/Iris, Phosphor + Starlight, Rubidium + Embeddium).
   - Action: Detects conflict pair and disables incompatible mod to avoid hard mixin crashes.
10. **Corrupted Config Recovery (`reset-corrupted-config`)**:
    - Root Cause: `JsonSyntaxException: MalformedJsonException`, `ParsingException`, or `ConfigException` in `config/*.json` / `*.toml`.
    - Action: Renames damaged config to `*.bak` and allows game to regenerate clean default configuration.

---

## 📋 Comprehensive Backlog: All Conceivable Auto-Fix Methods

### Category A: Graphics, Display & OpenGL Drivers
- [x] **A1. Shaderpack Startup Failure (`disable-active-shaderpack`)**:
  - *Trigger*: Crash during shader compilation or pipeline setup with Iris/Oculus/OptiFine (`Program link failed`, `Composite shader error`).
  - *Fix*: Set `shaderPack=OFF` in `optionsiris.txt` / `options.txt` without deleting the user-downloaded shader files.
- [x] **A2. OpenGL Context Creation Failure / GLFW Error 65542 (`repair-opengl-context`)**:
  - *Trigger*: `GLFW error 65542: WGL: The driver does not appear to support OpenGL`, or `Pixel format not accelerated`.
  - *Fix*:
    - Windows: Inject software Mesa3D (`opengl32.dll`) fallback or add `-Dsun.java2d.opengl=false`.
    - Detect multi-GPU laptops and advise high-performance GPU preference.
- [x] **A3. Linux Wayland / GLX Display Crash (`apply-wayland-fix`)**:
  - *Trigger*: `GLFW error 65543: GLX: Failed to create context` or Wayland compositor termination.
  - *Fix*: Inject environment variable `GLFW_PLATFORM=x11` or JVM arg `-Dorg.lwjgl.glfw.libname=libglfw.so.3`.
- [x] **A4. Corrupted Video Options / Out-of-Bounds Display Resolution (`reset-video-options`)**:
  - *Trigger*: Game crashes on window initialization (`Display.create()` or `BadWindow`) due to stale resolution on unplugged monitor.
  - *Fix*: Reset `fullscreen:false`, `overrideWidth:854`, `overrideHeight:480`, `guiScale:0` in `options.txt`.
- [x] **A5. Outdated Resource Pack Texture Stitch Overflow (`disable-active-resourcepacks`)**:
  - *Trigger*: `TextureAtlasException` or `OutOfMemoryError: Stitching texture atlas` on high-res 512x packs.
  - *Fix*: Reset `resourcePacks:[]` in `options.txt`.

---

### Category B: Mod Loader & Runtime Versions
- [x] **B1. Outdated Mod Loader Version (`upgrade-loader-version`)**:
  - *Trigger*: `Mod requires fabricloader >=0.16.5, currently 0.15.11` or `neoforge version too low`.
  - *Fix*: Auto-update instance `loaderVersion` in instance metadata to newest compatible release without reinstalling whole pack.
- [x] **B2. Architecture Incompatibility on macOS Apple Silicon (`switch-arm64-java`)**:
  - *Trigger*: `UnsatisfiedLinkError: ...liblwjgl.dylib (mach-o file, but is an incompatible architecture (have x86_64, need arm64))`.
  - *Fix*: Switch instance from Rosetta x86_64 Java to native ARM64 Eclipse Temurin.
- [x] **B3. Missing JVM Module Directives (`inject-java-module-flags`)**:
  - *Trigger*: `InaccessibleObjectException: Unable to make protected final java.lang.Class ... accessible to module` (Java 16+ reflection barrier).
  - *Fix*: Auto-inject required `--add-opens` flags to JVM arguments (e.g. `--add-opens java.base/java.lang=ALL-UNNAMED`).
- [x] **B4. JavaFX / Missing Native OpenJFX (`install-openjfx`)**:
  - *Trigger*: `NoClassDefFoundError: javafx/...` (mods with embedded WebKit or media players).
  - *Fix*: Download OpenJFX modular SDK or switch to full Zulu FX JDK.

---

### Category C: World Data, Saves & Entity Ticking
- [x] **C1. Erroring Entity / Tile Entity Ticking Crash (`enable-forge-entity-removal`)**:
  - *Trigger*: `java.lang.NullPointerException: Ticking entity` / `Ticking block entity` at chunk coordinates (X, Y, Z).
  - *Fix*:
    - Forge: Set `removeErroringEntities = true` and `removeErroringTileEntities = true` in `forge.cfg` / `forge-common.toml`.
    - Fabric: Propose installing Neruina / SafeTicking companion mod.
- [x] **C2. Corrupted Playerdata NBT (`quarantine-playerdata`)**:
  - *Trigger*: `Failed to load player data: Corrupt NBT tag` or `ClassCastException` reading `playerdata/<uuid>.dat`.
  - *Fix*: Back up corrupted `<uuid>.dat` to `<uuid>.dat.bak` and create clean inventory seed.
- [x] **C3. World Decorator Loop Crash (`restore-world-snapshot`)**:
  - *Trigger*: `RuntimeException: Already decorating!!` or cascading worldgen chunk crash.
  - *Fix*: Offer 1-click restore from latest World Guard automatic world snapshot.

---

### Category D: System, File Locks & Process State
- [x] **D1. Zombie Minecraft Process Holding File Lock (`kill-zombie-process`)**:
  - *Trigger*: `FileAlreadyExistsException`, `AccessDeniedException` on `session.lock`, `logs/latest.log` locked by another process.
  - *Fix*: Locate lingering background `javaw.exe` / `java` PID associated with the instance and safely terminate it, clearing orphan `session.lock`.
- [x] **D2. Corrupted Mojang Asset / Library Cache (`repair-instance-assets`)**:
  - *Trigger*: `FileNotFoundException: assets/indexes/1.20.json`, hash mismatch on `client.jar`.
  - *Fix*: Re-download official assets index and libraries with SHA-1 validation.
- [x] **D3. Stale Temporary Update Files (`cleanup-temp-install-files`)**:
  - *Trigger*: Unfinished mod update left `mod.jar.tmp` or `.scope-download`.
  - *Fix*: Purge incomplete download fragments from `mods/`.

---

### Category E: Modpack Manifest Reconciliation
- [x] **E1. Untracked Rogue Mods in Strict Modpacks (`reconcile-modpack-manifest`)**:
  - *Trigger*: Modpack updated from CurseForge/Modrinth but manually added user mods cause incompatibility.
  - *Fix*: Compare current `mods/` contents with original modpack manifest, flag untracked mods, and offer 1-click quarantine to `mods_disabled/`.
- [x] **E2. Client-Only Mod on Server or Vice-Versa (`disable-environment-mismatched-mod`)**:
  - *Trigger*: `NoClassDefFoundError: net/minecraft/client/Minecraft` in dedicated server environment.
  - *Fix*: Inspect manifest environment tag (`client` vs `server`) and disable mismatched mod.

---

### Category F: World Integrity, Mixins & Configurations
- [x] **F1. Corrupted `level.dat` Recovery (`restore-corrupted-level-dat`)**:
  - *Trigger*: `Failed to read level.dat`, `EOFException reading level.dat`, truncated 0-byte world descriptor.
  - *Fix*: Back up damaged file to `level.dat.corrupt` and revive world from automatic `level.dat_old` snapshot.
- [x] **F2. Mixin `@Overwrite` Collision Resolution (`resolve-mixin-overwrite`)**:
  - *Trigger*: `MixinTransformerError: Critical injection failure: Cannot apply @Overwrite`.
  - *Fix*: Pinpoint offending mixin JSON configuration and disable conflicting mod JAR.
- [x] **F3. Corrupted `options.txt` NaN Sanitizer (`sanitize-options-txt`)**:
  - *Trigger*: `NumberFormatException: For input string: "NaN"` in `options.txt`.
  - *Fix*: Reset invalid float numbers (gamma, fov) and corrupt keybinds to verified defaults.

---

### Category G: Advanced Modding Ecosystem & Native Runtimes
- [x] **G1. OptiFine on Fabric without OptiFabric (`install-optifabric`)**:
  - *Trigger*: OptiFine JAR dropped into Fabric without companion bridge or `LaunchClassLoader` error.
  - *Fix*: 1-click install compatible `OptiFabric` from Modrinth.
- [x] **G2. Out of Disk Space & Log Archive Purge (`purge-instance-logs-cache`)**:
  - *Trigger*: `java.io.IOException: There is not enough space on the disk`.
  - *Fix*: Purge old compressed log archives (`*.log.gz`) and stale temp files.
- [x] **G3. Missing Language Adapter (`install-language-adapter`)**:
  - *Trigger*: `Language adapter 'kotlin' was not found` or missing Scala/Clojure adapters.
  - *Fix*: 1-click install companion language adapter (`fabric-language-kotlin`, `language-adapter-scala`).
- [x] **G4. GPU Driver / RTSS Overlay Hook Crash (`suppress-gpu-hooks`)**:
  - *Trigger*: Access violation in `nvoglv64.dll`, `atig6pxx.dll`, `RTSSHooks64.dll`, `DiscordHook64.dll`.
  - *Fix*: Inject `-Dorg.lwjgl.opengl.Display.allowSoftwareOpenGL=true` to bypass incompatible third-party hooks.
- [x] **G5. 32-Bit Java Runtime Memory Barrier (`force-switch-64bit-java`)**:
  - *Trigger*: `Could not reserve enough space for ... object heap on 32-Bit Server VM`.
  - *Fix*: Reset obsolete 32-bit Java path and switch to managed 64-bit Eclipse Temurin.
- [x] **G6. Quilt Standard Libraries / QSL (`install-qsl-library`)**:
  - *Trigger*: `Missing required library: QSL` on Quilt modloader.
  - *Fix*: 1-click install `quilted-fabric-api` from Modrinth.
- [x] **G7. Corrupted Natives Extraction Cache (`purge-corrupted-natives`)**:
  - *Trigger*: `UnsatisfiedLinkError: Could not load library: lwjgl` or zero-byte native DLLs.
  - *Fix*: Wipe instance `natives/` folder to force clean re-extraction from library cache.
- [x] **G8. SecurityManager Deprecation Barrier on Java 18+ (`allow-security-manager-flag`)**:
  - *Trigger*: `UnsupportedOperationException: The Security Manager is deprecated` on legacy 1.16/1.18 mods.
  - *Fix*: Auto-inject JVM launch flag `-Djava.security.manager=allow`.

