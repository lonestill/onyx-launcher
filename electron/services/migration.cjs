const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const SUPPORTED_LOADERS = ["Fabric", "Forge", "NeoForge", "Quilt", "Vanilla"];

function normalizeLoader(raw) {
  const str = String(raw || "").toLowerCase();
  if (str.includes("neoforge")) return "NeoForge";
  if (str.includes("fabric")) return "Fabric";
  if (str.includes("quilt")) return "Quilt";
  if (str.includes("forge")) return "Forge";
  return "Vanilla";
}

function parseVersionFromId(versionId) {
  const str = String(versionId || "");
  const match = str.match(/\b(1\.\d+(?:\.\d+)?)\b/);
  return match ? match[1] : "1.21.1";
}

function safeReadJsonSync(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function safeReadJson(filePath) {
  try {
    const data = await fsp.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function safeReadTextSync(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function countFilesInDirSync(dirPath, ext = ".jar") {
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    if (!ext) return entries.length;
    return entries.filter(
      (e) => e.isFile() && e.name.toLowerCase().endsWith(ext),
    ).length;
  } catch {
    return 0;
  }
}

function countDirsInDirSync(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

/**
 * Standard candidate roots across Windows, macOS, and Linux
 */
function getCandidateLauncherRoots() {
  const home = os.homedir();
  const platform = process.platform;
  const roots = [];

  // Onyx Launcher (Legacy)
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    roots.push({
      launcher: "onyx",
      rootPath: path.join(appData, ".onyx", "instances"),
    });
    roots.push({
      launcher: "onyx",
      rootPath: path.join(appData, "Onyx Launcher", "instances"),
    });
  } else if (platform === "darwin") {
    roots.push({
      launcher: "onyx",
      rootPath: path.join(home, "Library", "Application Support", "Onyx Launcher", "instances"),
    });
  } else {
    roots.push({
      launcher: "onyx",
      rootPath: path.join(home, ".local", "share", "onyx-launcher", "instances"),
    });
  }

  // CurseForge
  if (platform === "win32") {
    const userProfile = process.env.USERPROFILE || home;
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    roots.push({
      launcher: "curseforge",
      rootPath: path.join(userProfile, "curseforge", "minecraft", "Instances"),
    });
    roots.push({
      launcher: "curseforge",
      rootPath: path.join(appData, "curseforge", "minecraft", "Instances"),
    });
    roots.push({
      launcher: "curseforge",
      rootPath: path.join(localAppData, "curseforge", "minecraft", "Instances"),
    });
    for (const drive of ["D:", "E:", "F:", "G:"]) {
      roots.push({
        launcher: "curseforge",
        rootPath: path.join(drive, "curseforge", "minecraft", "Instances"),
      });
    }
  } else if (platform === "darwin") {
    roots.push({
      launcher: "curseforge",
      rootPath: path.join(home, "Documents", "curseforge", "minecraft", "Instances"),
    });
    roots.push({
      launcher: "curseforge",
      rootPath: path.join(home, "Library", "Application Support", "curseforge", "minecraft", "Instances"),
    });
    roots.push({
      launcher: "curseforge",
      rootPath: path.join(home, "curseforge", "minecraft", "Instances"),
    });
  } else {
    roots.push({
      launcher: "curseforge",
      rootPath: path.join(home, ".curseforge", "minecraft", "Instances"),
    });
    roots.push({
      launcher: "curseforge",
      rootPath: path.join(home, "curseforge", "minecraft", "Instances"),
    });
    roots.push({
      launcher: "curseforge",
      rootPath: path.join(home, ".local", "share", "curseforge", "minecraft", "Instances"),
    });
  }

  // Prism Launcher
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    roots.push({
      launcher: "prism",
      rootPath: path.join(appData, "PrismLauncher", "instances"),
    });
    for (const drive of ["D:", "E:", "F:"]) {
      roots.push({
        launcher: "prism",
        rootPath: path.join(drive, "PrismLauncher", "instances"),
      });
    }
  } else if (platform === "darwin") {
    roots.push({
      launcher: "prism",
      rootPath: path.join(home, "Library", "Application Support", "PrismLauncher", "instances"),
    });
  } else {
    roots.push({
      launcher: "prism",
      rootPath: path.join(home, ".local", "share", "PrismLauncher", "instances"),
    });
    roots.push({
      launcher: "prism",
      rootPath: path.join(home, ".var", "app", "org.prismlauncher.PrismLauncher", "data", "PrismLauncher", "instances"),
    });
  }

  // MultiMC & PolyMC
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const userProfile = process.env.USERPROFILE || home;
    roots.push({
      launcher: "multimc",
      rootPath: path.join(appData, "MultiMC", "instances"),
    });
    roots.push({
      launcher: "multimc",
      rootPath: path.join(userProfile, "MultiMC", "instances"),
    });
    roots.push({
      launcher: "multimc",
      rootPath: path.join(appData, "PolyMC", "instances"),
    });
    for (const drive of ["C:", "D:", "E:"]) {
      roots.push({
        launcher: "multimc",
        rootPath: path.join(drive, "MultiMC", "instances"),
      });
      roots.push({
        launcher: "multimc",
        rootPath: path.join(drive, "PolyMC", "instances"),
      });
    }
  } else if (platform === "darwin") {
    roots.push({
      launcher: "multimc",
      rootPath: path.join(home, "Library", "Application Support", "MultiMC", "instances"),
    });
    roots.push({
      launcher: "multimc",
      rootPath: path.join(home, "Library", "Application Support", "PolyMC", "instances"),
    });
    roots.push({
      launcher: "multimc",
      rootPath: "/Applications/MultiMC.app/Data/instances",
    });
  } else {
    roots.push({
      launcher: "multimc",
      rootPath: path.join(home, ".local", "share", "multimc", "instances"),
    });
    roots.push({
      launcher: "multimc",
      rootPath: path.join(home, ".multimc", "instances"),
    });
    roots.push({
      launcher: "multimc",
      rootPath: path.join(home, ".local", "share", "PolyMC", "instances"),
    });
    roots.push({
      launcher: "multimc",
      rootPath: path.join(home, ".var", "app", "org.polymc.PolyMC", "data", "PolyMC", "instances"),
    });
  }

  // ATLauncher
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const userProfile = process.env.USERPROFILE || home;
    roots.push({
      launcher: "atlauncher",
      rootPath: path.join(appData, "ATLauncher", "instances"),
    });
    roots.push({
      launcher: "atlauncher",
      rootPath: path.join(userProfile, "ATLauncher", "instances"),
    });
    for (const drive of ["C:", "D:", "E:"]) {
      roots.push({
        launcher: "atlauncher",
        rootPath: path.join(drive, "ATLauncher", "instances"),
      });
    }
  } else if (platform === "darwin") {
    roots.push({
      launcher: "atlauncher",
      rootPath: path.join(home, "Library", "Application Support", "ATLauncher", "instances"),
    });
    roots.push({
      launcher: "atlauncher",
      rootPath: path.join(home, "Downloads", "ATLauncher", "instances"),
    });
  } else {
    roots.push({
      launcher: "atlauncher",
      rootPath: path.join(home, ".local", "share", "ATLauncher", "instances"),
    });
    roots.push({
      launcher: "atlauncher",
      rootPath: path.join(home, "ATLauncher", "instances"),
    });
  }

  // Feather Client
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    roots.push({
      launcher: "feather",
      rootPath: path.join(appData, ".feather", "instances"),
    });
    roots.push({
      launcher: "feather",
      rootPath: path.join(appData, "feather", "instances"),
    });
    roots.push({
      launcher: "feather",
      rootPath: path.join(appData, ".minecraft", "feather", "instances"),
    });
  } else if (platform === "darwin") {
    roots.push({
      launcher: "feather",
      rootPath: path.join(home, "Library", "Application Support", ".feather", "instances"),
    });
    roots.push({
      launcher: "feather",
      rootPath: path.join(home, "Library", "Application Support", "feather", "instances"),
    });
    roots.push({
      launcher: "feather",
      rootPath: path.join(home, "Library", "Application Support", "minecraft", "feather", "instances"),
    });
  } else {
    roots.push({
      launcher: "feather",
      rootPath: path.join(home, ".feather", "instances"),
    });
    roots.push({
      launcher: "feather",
      rootPath: path.join(home, ".local", "share", "feather", "instances"),
    });
  }

  // Modrinth App
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    roots.push({
      launcher: "modrinth",
      rootPath: path.join(appData, "ModrinthApp", "profiles"),
    });
    roots.push({
      launcher: "modrinth",
      rootPath: path.join(appData, "Modrinth", "profiles"),
    });
    roots.push({
      launcher: "modrinth",
      rootPath: path.join(appData, "com.modrinth.theseus", "profiles"),
    });
    roots.push({
      launcher: "modrinth",
      rootPath: path.join(localAppData, "ModrinthApp", "profiles"),
    });
  } else if (platform === "darwin") {
    roots.push({
      launcher: "modrinth",
      rootPath: path.join(home, "Library", "Application Support", "ModrinthApp", "profiles"),
    });
    roots.push({
      launcher: "modrinth",
      rootPath: path.join(home, "Library", "Application Support", "Modrinth", "profiles"),
    });
    roots.push({
      launcher: "modrinth",
      rootPath: path.join(home, "Library", "Application Support", "com.modrinth.theseus", "profiles"),
    });
  } else {
    roots.push({
      launcher: "modrinth",
      rootPath: path.join(home, ".local", "share", "ModrinthApp", "profiles"),
    });
    roots.push({
      launcher: "modrinth",
      rootPath: path.join(home, ".local", "share", "Modrinth", "profiles"),
    });
    roots.push({
      launcher: "modrinth",
      rootPath: path.join(home, ".local", "share", "com.modrinth.theseus", "profiles"),
    });
    roots.push({
      launcher: "modrinth",
      rootPath: path.join(home, ".config", "ModrinthApp", "profiles"),
    });
    roots.push({
      launcher: "modrinth",
      rootPath: path.join(home, ".var", "app", "com.modrinth.ModrinthApp", "data", "ModrinthApp", "profiles"),
    });
  }

  // Vanilla / Standard Minecraft / TLauncher / TL Legacy
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    roots.push({
      launcher: "vanilla",
      rootPath: path.join(appData, ".minecraft"),
    });
    roots.push({
      launcher: "vanilla",
      rootPath: path.join(appData, ".tlauncher", "legacy", "Minecraft", "game"),
    });
  } else if (platform === "darwin") {
    roots.push({
      launcher: "vanilla",
      rootPath: path.join(home, "Library", "Application Support", "minecraft"),
    });
    roots.push({
      launcher: "vanilla",
      rootPath: path.join(home, "Library", "Application Support", "tlauncher", "legacy", "Minecraft", "game"),
    });
  } else {
    roots.push({
      launcher: "vanilla",
      rootPath: path.join(home, ".minecraft"),
    });
    roots.push({
      launcher: "vanilla",
      rootPath: path.join(home, ".tlauncher", "legacy", "Minecraft", "game"),
    });
  }

  return roots;
}

/**
 * Deep inspection of any folder (or its .minecraft subfolder) using logs/latest.log,
 * folder flags (.fabric, .quilt), and mod jar naming patterns.
 */
function inspectDeepLogAndFolder(dirPath, defaultLauncher = "custom") {
  if (!fs.existsSync(dirPath)) return null;

  const dotMinecraft = path.join(dirPath, ".minecraft");
  const gameDir = fs.existsSync(dotMinecraft) ? dotMinecraft : dirPath;

  const modsDir = path.join(gameDir, "mods");
  const savesDir = path.join(gameDir, "saves");
  const optionsPath = path.join(gameDir, "options.txt");
  const logPath = path.join(gameDir, "logs", "latest.log");
  const hasFabricDir = fs.existsSync(path.join(gameDir, ".fabric"));
  const hasQuiltDir = fs.existsSync(path.join(gameDir, ".quilt"));

  const hasMods = fs.existsSync(modsDir);
  const hasSaves = fs.existsSync(savesDir);
  const hasOptions = fs.existsSync(optionsPath);
  const hasLog = fs.existsSync(logPath);

  if (!hasMods && !hasSaves && !hasOptions && !hasLog && !hasFabricDir && !hasQuiltDir) {
    return null;
  }

  const modCount = countFilesInDirSync(modsDir, ".jar");
  const worldCount = countDirsInDirSync(savesDir);

  let version = "1.21.1";
  let loader = hasFabricDir ? "Fabric" : hasQuiltDir ? "Quilt" : "Vanilla";
  let loaderVersion = null;

  // 1. Deep parse latest.log if present
  if (hasLog) {
    try {
      const logContent = fs.readFileSync(logPath, "utf8").slice(0, 16384);

      // Fabric / Quilt pattern: Loading Minecraft 1.21.4 with Fabric Loader 0.16.10
      const fabricMatch = logContent.match(
        /Loading Minecraft ([\d.]+) with (\w+) Loader ([\d.]+)/i,
      );
      if (fabricMatch) {
        version = fabricMatch[1];
        loader = normalizeLoader(fabricMatch[2]);
        loaderVersion = fabricMatch[3];
      } else {
        // Forge pattern: Forge Mod Loader version 47.2.0 for Minecraft 1.20.1
        const forgeMatch = logContent.match(
          /Forge Mod Loader version ([\d.]+) for Minecraft ([\d.]+)/i,
        );
        if (forgeMatch) {
          loader = "Forge";
          loaderVersion = forgeMatch[1];
          version = forgeMatch[2];
        } else {
          // NeoForge pattern
          const neoMatch = logContent.match(
            /NeoForge version ([\d.]+) for Minecraft ([\d.]+)/i,
          );
          if (neoMatch) {
            loader = "NeoForge";
            loaderVersion = neoMatch[1];
            version = neoMatch[2];
          } else {
            // General Minecraft Version
            const vMatch =
              logContent.match(/Minecraft Version: ([\d.]+)/i) ||
              logContent.match(/\[main\/INFO\].*?: Minecraft (\d+\.\d+(?:\.\d+)?)/i) ||
              logContent.match(/Starting minecraft server version (\d+\.\d+(?:\.\d+)?)/i);
            if (vMatch) {
              version = vMatch[1];
            }
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  // 2. Mod JAR name heuristics if loader is still Vanilla but mods exist
  if (loader === "Vanilla" && hasMods && modCount > 0) {
    try {
      const modFiles = fs.readdirSync(modsDir).map((f) => f.toLowerCase());
      if (
        modFiles.some(
          (f) =>
            f.includes("fabric-api") ||
            f.includes("fabric-loader") ||
            f.includes("fabric"),
        )
      ) {
        loader = "Fabric";
      } else if (modFiles.some((f) => f.includes("neoforge"))) {
        loader = "NeoForge";
      } else if (modFiles.some((f) => f.includes("forge"))) {
        loader = "Forge";
      } else if (modFiles.some((f) => f.includes("quilt"))) {
        loader = "Quilt";
      } else {
        loader = "Fabric";
      }

      // Check mod filenames for Minecraft version: e.g. jei-1.20.1-15.3.0.jar
      if (version === "1.21.1") {
        for (const f of modFiles) {
          const vMatch = f.match(/[-_+](1\.\d+(?:\.\d+)?)/);
          if (vMatch) {
            version = vMatch[1];
            break;
          }
        }
      }
    } catch {}
  }

  return {
    id: `${defaultLauncher}-${crypto.createHash("md5").update(dirPath).digest("hex").slice(0, 10)}`,
    name: path.basename(dirPath),
    launcher: defaultLauncher,
    sourceLauncher: defaultLauncher,
    sourcePath: dirPath,
    instancePath: dirPath,
    gameDir,
    version,
    loader,
    loaderVersion,
    modCount,
    worldCount,
    hasOptions,
  };
}

/**
 * Inspect a CurseForge instance directory
 */
function inspectCurseForgeInstance(dirPath) {
  const jsonPath = path.join(dirPath, "minecraftinstance.json");
  const data = safeReadJsonSync(jsonPath);

  if (!data) {
    return inspectDeepLogAndFolder(dirPath, "curseforge");
  }

  const rawLoader = data.baseModLoader?.name || data.modLoader || "";
  let loader = normalizeLoader(rawLoader);
  let version = String(data.gameVersion || "");
  const name = String(data.name || path.basename(dirPath));

  if (!version || loader === "Vanilla") {
    const deep = inspectDeepLogAndFolder(dirPath, "curseforge");
    if (deep) {
      if (!version && deep.version) version = deep.version;
      if (loader === "Vanilla" && deep.loader !== "Vanilla") loader = deep.loader;
    }
  }
  if (!version) version = "1.20.1";

  const modCount = countFilesInDirSync(path.join(dirPath, "mods"), ".jar");
  const worldCount = countDirsInDirSync(path.join(dirPath, "saves"));

  return {
    id: `cf-${crypto.createHash("md5").update(dirPath).digest("hex").slice(0, 10)}`,
    name,
    launcher: "curseforge",
    sourceLauncher: "curseforge",
    sourcePath: dirPath,
    instancePath: dirPath,
    gameDir: dirPath,
    version,
    loader,
    loaderVersion: typeof rawLoader === "string" ? rawLoader : null,
    modCount,
    worldCount,
    hasOptions: fs.existsSync(path.join(dirPath, "options.txt")),
  };
}

/**
 * Inspect a Prism Launcher / MultiMC / PolyMC instance directory
 */
function inspectPrismFamilyInstance(dirPath, defaultLauncher = "prism") {
  const cfgPath = path.join(dirPath, "instance.cfg");
  const mmcPackPath = path.join(dirPath, "mmc-pack.json");

  const hasCfg = fs.existsSync(cfgPath);
  const hasMmc = fs.existsSync(mmcPackPath);
  if (!hasCfg && !hasMmc) {
    return inspectDeepLogAndFolder(dirPath, defaultLauncher);
  }

  let name = path.basename(dirPath);
  let version = "";
  let loader = "Vanilla";
  let loaderVersion = null;

  if (hasCfg) {
    const text = safeReadTextSync(cfgPath) || "";
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("name=")) {
        name = trimmed.slice("name=".length).trim();
      } else if (trimmed.startsWith("IntendedVersion=")) {
        version = trimmed.slice("IntendedVersion=".length).trim();
      }
    }
  }

  if (hasMmc) {
    const pack = safeReadJsonSync(mmcPackPath);
    if (pack?.components && Array.isArray(pack.components)) {
      for (const comp of pack.components) {
        if (comp.uid === "net.minecraft" && comp.cachedVersion) {
          version = comp.cachedVersion;
        } else if (comp.uid && comp.uid.includes("fabric-loader")) {
          loader = "Fabric";
          loaderVersion = comp.cachedVersion || null;
        } else if (comp.uid && comp.uid.includes("neoforge")) {
          loader = "NeoForge";
          loaderVersion = comp.cachedVersion || null;
        } else if (comp.uid && comp.uid.includes("quilt-loader")) {
          loader = "Quilt";
          loaderVersion = comp.cachedVersion || null;
        } else if (comp.uid && comp.uid.includes("forge")) {
          loader = "Forge";
          loaderVersion = comp.cachedVersion || null;
        }
      }
    }
  }

  const dotMinecraft = path.join(dirPath, ".minecraft");
  const gameDir = fs.existsSync(dotMinecraft) ? dotMinecraft : dirPath;

  if (!version || loader === "Vanilla") {
    const deep = inspectDeepLogAndFolder(dirPath, defaultLauncher);
    if (deep) {
      if (!version && deep.version) version = deep.version;
      if (loader === "Vanilla" && deep.loader !== "Vanilla") loader = deep.loader;
    }
  }
  if (!version) version = "1.20.1";

  const modCount = countFilesInDirSync(path.join(gameDir, "mods"), ".jar");
  const worldCount = countDirsInDirSync(path.join(gameDir, "saves"));

  return {
    id: `${defaultLauncher}-${crypto.createHash("md5").update(dirPath).digest("hex").slice(0, 10)}`,
    name,
    launcher: defaultLauncher,
    sourceLauncher: defaultLauncher,
    sourcePath: dirPath,
    instancePath: dirPath,
    gameDir,
    version,
    loader,
    loaderVersion,
    modCount,
    worldCount,
    hasOptions: fs.existsSync(path.join(gameDir, "options.txt")),
  };
}

function inspectPrismInstance(dirPath) {
  return inspectPrismFamilyInstance(dirPath, "prism");
}

/**
 * Inspect an ATLauncher instance directory
 */
function inspectATLauncherInstance(dirPath) {
  const jsonPath = path.join(dirPath, "instance.json");
  const data = safeReadJsonSync(jsonPath);

  if (!data) {
    return inspectDeepLogAndFolder(dirPath, "atlauncher");
  }

  const name = String(data.name || path.basename(dirPath));
  let version = String(
    data.minecraftVersion || data.installedVersion || data.version || "",
  );
  let loader = normalizeLoader(
    data.loader || data.loaderType || data.modLoader || "Vanilla",
  );
  let loaderVersion = data.loaderVersion ? String(data.loaderVersion) : null;

  const dotMinecraft = path.join(dirPath, ".minecraft");
  const gameDir = fs.existsSync(dotMinecraft) ? dotMinecraft : dirPath;

  if (!version || loader === "Vanilla") {
    const deep = inspectDeepLogAndFolder(dirPath, "atlauncher");
    if (deep) {
      if (!version && deep.version) version = deep.version;
      if (loader === "Vanilla" && deep.loader !== "Vanilla") loader = deep.loader;
      if (!loaderVersion && deep.loaderVersion) loaderVersion = deep.loaderVersion;
    }
  }
  if (!version) version = "1.20.1";

  const modCount = countFilesInDirSync(path.join(gameDir, "mods"), ".jar");
  const worldCount = countDirsInDirSync(path.join(gameDir, "saves"));

  return {
    id: `atl-${crypto.createHash("md5").update(dirPath).digest("hex").slice(0, 10)}`,
    name,
    launcher: "atlauncher",
    sourceLauncher: "atlauncher",
    sourcePath: dirPath,
    instancePath: dirPath,
    gameDir,
    version,
    loader,
    loaderVersion,
    modCount,
    worldCount,
    hasOptions: fs.existsSync(path.join(gameDir, "options.txt")),
  };
}

/**
 * Inspect a Feather Client instance directory
 */
function inspectFeatherInstance(dirPath) {
  const data =
    safeReadJsonSync(path.join(dirPath, "feather.json")) ||
    safeReadJsonSync(path.join(dirPath, "config.json"));

  const dotMinecraft = path.join(dirPath, ".minecraft");
  const gameDir = fs.existsSync(dotMinecraft) ? dotMinecraft : dirPath;

  let name = path.basename(dirPath);
  let version = "";
  let loader = "Vanilla";
  let loaderVersion = null;

  if (data) {
    if (data.name) name = String(data.name);
    if (data.version || data.mcVersion || data.minecraftVersion) {
      version = String(data.version || data.mcVersion || data.minecraftVersion);
    }
    if (data.loader || data.loaderType) {
      loader = normalizeLoader(data.loader || data.loaderType);
    }
    if (data.loaderVersion) {
      loaderVersion = String(data.loaderVersion);
    }
  }

  if (!version || loader === "Vanilla") {
    const deep = inspectDeepLogAndFolder(dirPath, "feather");
    if (deep) {
      if (!version && deep.version) version = deep.version;
      if (loader === "Vanilla" && deep.loader !== "Vanilla") loader = deep.loader;
      if (!loaderVersion && deep.loaderVersion) loaderVersion = deep.loaderVersion;
    }
  }

  const modCount = countFilesInDirSync(path.join(gameDir, "mods"), ".jar");
  const worldCount = countDirsInDirSync(path.join(gameDir, "saves"));
  const hasOptions = fs.existsSync(path.join(gameDir, "options.txt"));

  if (!data && modCount === 0 && worldCount === 0 && !hasOptions) {
    return null;
  }

  return {
    id: `feather-${crypto.createHash("md5").update(dirPath).digest("hex").slice(0, 10)}`,
    name,
    launcher: "feather",
    sourceLauncher: "feather",
    sourcePath: dirPath,
    instancePath: dirPath,
    gameDir,
    version: version || "1.21.1",
    loader,
    loaderVersion,
    modCount,
    worldCount,
    hasOptions,
  };
}

/**
 * Inspect a legacy Onyx Launcher instance directory
 */
function inspectOnyxInstance(dirPath) {
  if (!fs.existsSync(dirPath)) return null;

  const instanceJsonPath = path.join(dirPath, "instance.json");
  const data = safeReadJsonSync(instanceJsonPath);

  let name = path.basename(dirPath);
  let version = "";
  let loader = "Vanilla";
  let loaderVersion = null;

  if (data) {
    if (data.name) name = String(data.name);
    if (data.version || data.gameVersion) version = String(data.version || data.gameVersion);
    if (data.loader) loader = normalizeLoader(data.loader);
    if (data.loaderVersion) loaderVersion = String(data.loaderVersion);
  }

  if (!version || loader === "Vanilla") {
    const deep = inspectDeepLogAndFolder(dirPath, "onyx");
    if (deep) {
      if (!version && deep.version) version = deep.version;
      if (loader === "Vanilla" && deep.loader !== "Vanilla") loader = deep.loader;
      if (!loaderVersion && deep.loaderVersion) loaderVersion = deep.loaderVersion;
    }
  }

  const modCount = countFilesInDirSync(path.join(dirPath, "mods"), ".jar");
  const worldCount = countDirsInDirSync(path.join(dirPath, "saves"));
  const hasOptions = fs.existsSync(path.join(dirPath, "options.txt"));

  if (!data && modCount === 0 && worldCount === 0 && !hasOptions && !fs.existsSync(path.join(dirPath, ".onyx"))) {
    return null;
  }

  return {
    id: `onyx-${crypto.createHash("md5").update(dirPath).digest("hex").slice(0, 10)}`,
    name,
    launcher: "onyx",
    sourceLauncher: "onyx",
    sourcePath: dirPath,
    instancePath: dirPath,
    gameDir: dirPath,
    version: version || "1.21.1",
    loader,
    loaderVersion,
    modCount,
    worldCount,
    hasOptions,
  };
}

/**
 * Read Modrinth App SQLite database (app.db) if available
 */
function readModrinthAppDb(appDbPath, profilesDir) {
  const candidates = [];
  try {
    let DatabaseSync;
    try {
      DatabaseSync = require("node:sqlite").DatabaseSync;
    } catch {
      DatabaseSync = null;
    }

    if (DatabaseSync && fs.existsSync(appDbPath)) {
      const db = new DatabaseSync(appDbPath, { readOnly: true });
      const rows = db
        .prepare(
          `SELECT i.id, i.name, i.path, cs.game_version, cs.loader, cs.loader_version, i.icon_path
           FROM instances i
           LEFT JOIN instance_content_sets cs ON i.id = cs.instance_id`,
        )
        .all();

      for (const row of rows) {
        if (!row.name) continue;
        const candidateDir = path.join(profilesDir, row.path || row.name);
        if (!fs.existsSync(candidateDir)) continue;

        const modCount = countFilesInDirSync(path.join(candidateDir, "mods"), ".jar");
        const worldCount = countDirsInDirSync(path.join(candidateDir, "saves"));

        candidates.push({
          id: `mr-${crypto.createHash("md5").update(candidateDir).digest("hex").slice(0, 10)}`,
          name: row.name,
          launcher: "modrinth",
          sourceLauncher: "modrinth",
          sourcePath: candidateDir,
          instancePath: candidateDir,
          gameDir: candidateDir,
          version: String(row.game_version || "1.21.1"),
          loader: normalizeLoader(row.loader || "Vanilla"),
          loaderVersion: row.loader_version ? String(row.loader_version) : null,
          iconUrl: row.icon_path && fs.existsSync(row.icon_path) ? `file://${row.icon_path}` : null,
          modCount,
          worldCount,
          hasOptions: fs.existsSync(path.join(candidateDir, "options.txt")),
        });
      }
      db.close();
    }
  } catch {
    // Ignore SQLite errors and fallback to directory scan
  }
  return candidates;
}

/**
 * Inspect a Modrinth App profile directory
 */
function inspectModrinthProfile(dirPath) {
  if (!fs.existsSync(dirPath)) return null;

  // 1. Check legacy profile.json
  const profilePath = path.join(dirPath, "profile.json");
  const data = safeReadJsonSync(profilePath);
  if (data) {
    const name = String(data.name || path.basename(dirPath));
    const version = String(data.game_version || "1.20.1");
    const loader = normalizeLoader(data.loader || "Vanilla");
    const loaderVersion = data.loader_version || null;

    const modCount = countFilesInDirSync(path.join(dirPath, "mods"), ".jar");
    const worldCount = countDirsInDirSync(path.join(dirPath, "saves"));

    return {
      id: `mr-${crypto.createHash("md5").update(dirPath).digest("hex").slice(0, 10)}`,
      name,
      launcher: "modrinth",
      sourceLauncher: "modrinth",
      sourcePath: dirPath,
      instancePath: dirPath,
      gameDir: dirPath,
      version,
      loader,
      loaderVersion,
      modCount,
      worldCount,
      hasOptions: fs.existsSync(path.join(dirPath, "options.txt")),
    };
  }

  // 2. Check if parent directory or grandparent has app.db
  const parentDir = path.dirname(dirPath);
  const grandparentDir = path.dirname(parentDir);
  const candidateAppDb = fs.existsSync(path.join(parentDir, "app.db"))
    ? path.join(parentDir, "app.db")
    : fs.existsSync(path.join(grandparentDir, "app.db"))
      ? path.join(grandparentDir, "app.db")
      : null;

  if (candidateAppDb) {
    const dbCandidates = readModrinthAppDb(candidateAppDb, parentDir);
    const match = dbCandidates.find(
      (c) => c.instancePath === dirPath || c.name === path.basename(dirPath),
    );
    if (match) return match;
  }

  // 3. Fallback: inspect folder structure (.fabric, logs/latest.log, mods, options)
  return inspectDeepLogAndFolder(dirPath, "modrinth");
}

/**
 * Inspect Vanilla launcher_profiles.json and launcher_profiles_microsoft_store.json
 */
function inspectVanillaRoot(dotMinecraftPath) {
  if (!fs.existsSync(dotMinecraftPath)) return [];

  const candidates = [];
  const seenKeys = new Set();

  const profileFiles = [
    path.join(dotMinecraftPath, "launcher_profiles.json"),
    path.join(dotMinecraftPath, "launcher_profiles_microsoft_store.json"),
  ];

  for (const profPath of profileFiles) {
    const data = safeReadJsonSync(profPath);
    if (!data?.profiles || typeof data.profiles !== "object") continue;

    for (const [key, profile] of Object.entries(data.profiles)) {
      if (!profile) continue;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const name = String(profile.name || key);
      const lastVersionId = String(profile.lastVersionId || "");
      const version = parseVersionFromId(lastVersionId);
      const loader = normalizeLoader(lastVersionId);

      const gameDir = profile.gameDir
        ? path.resolve(profile.gameDir)
        : dotMinecraftPath;

      if (!fs.existsSync(gameDir)) continue;

      const modCount = countFilesInDirSync(path.join(gameDir, "mods"), ".jar");
      const worldCount = countDirsInDirSync(path.join(gameDir, "saves"));

      // Skip unplayed empty profiles
      if (modCount === 0 && worldCount === 0 && !profile.gameDir) continue;

      candidates.push({
        id: `vanilla-${crypto.createHash("md5").update(`${dotMinecraftPath}-${key}`).digest("hex").slice(0, 10)}`,
        name,
        launcher: "vanilla",
        sourceLauncher: "vanilla",
        sourcePath: gameDir,
        instancePath: gameDir,
        gameDir,
        version,
        loader,
        loaderVersion: null,
        modCount,
        worldCount,
        hasOptions: fs.existsSync(path.join(gameDir, "options.txt")),
      });
    }
  }

  // Root fallback: if no candidate points directly to dotMinecraftPath, but root has mods or worlds or options
  const hasRootProfile = candidates.some(
    (c) => path.resolve(c.gameDir) === path.resolve(dotMinecraftPath),
  );
  if (!hasRootProfile) {
    const rootModCount = countFilesInDirSync(
      path.join(dotMinecraftPath, "mods"),
      ".jar",
    );
    const rootWorldCount = countDirsInDirSync(
      path.join(dotMinecraftPath, "saves"),
    );
    const hasOptions = fs.existsSync(path.join(dotMinecraftPath, "options.txt"));

    if (rootModCount > 0 || rootWorldCount > 0 || hasOptions) {
      const deep = inspectDeepLogAndFolder(dotMinecraftPath, "vanilla");
      const isTL = dotMinecraftPath.toLowerCase().includes("tlauncher");
      const displayName = isTL ? "TL Legacy (.minecraft)" : "Default (.minecraft)";

      candidates.push({
        id: `vanilla-root-${crypto.createHash("md5").update(dotMinecraftPath).digest("hex").slice(0, 10)}`,
        name: displayName,
        launcher: "vanilla",
        sourceLauncher: "vanilla",
        sourcePath: dotMinecraftPath,
        instancePath: dotMinecraftPath,
        gameDir: dotMinecraftPath,
        version: deep?.version || "1.21.1",
        loader: deep?.loader || (rootModCount > 0 ? "Fabric" : "Vanilla"),
        loaderVersion: deep?.loaderVersion || null,
        modCount: rootModCount,
        worldCount: rootWorldCount,
        hasOptions,
      });
    }
  }

  return candidates;
}

/**
 * Inspect an arbitrary user-chosen folder
 */
function inspectCustomDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return null;

  // 0. Check Onyx Launcher (Legacy)
  const onyx = inspectOnyxInstance(dirPath);
  if (
    onyx &&
    (fs.existsSync(path.join(dirPath, ".onyx")) ||
      fs.existsSync(path.join(dirPath, "instance.json")))
  ) {
    return { ...onyx, launcher: "onyx", sourceLauncher: "onyx" };
  }

  // 1. Check ATLauncher
  const atl = inspectATLauncherInstance(dirPath);
  if (atl && fs.existsSync(path.join(dirPath, "instance.json"))) {
    return { ...atl, launcher: "atlauncher", sourceLauncher: "atlauncher" };
  }

  // 2. Check CurseForge
  const cf = inspectCurseForgeInstance(dirPath);
  if (cf && fs.existsSync(path.join(dirPath, "minecraftinstance.json"))) {
    return { ...cf, launcher: "curseforge", sourceLauncher: "curseforge" };
  }

  // 3. Check Prism / MultiMC
  const prism = inspectPrismFamilyInstance(dirPath, "prism");
  if (
    prism &&
    (fs.existsSync(path.join(dirPath, "instance.cfg")) ||
      fs.existsSync(path.join(dirPath, "mmc-pack.json")))
  ) {
    return { ...prism, launcher: "prism", sourceLauncher: "prism" };
  }

  // 4. Check Modrinth
  const mr = inspectModrinthProfile(dirPath);
  if (mr && fs.existsSync(path.join(dirPath, "profile.json"))) {
    return { ...mr, launcher: "modrinth", sourceLauncher: "modrinth" };
  }

  // 5. Check Feather
  const feather = inspectFeatherInstance(dirPath);
  if (feather && fs.existsSync(path.join(dirPath, "feather.json"))) {
    return { ...feather, launcher: "feather", sourceLauncher: "feather" };
  }

  // 6. Check Vanilla root (.minecraft)
  const vanillaList = inspectVanillaRoot(dirPath);
  if (vanillaList.length > 0) {
    return vanillaList[0];
  }

  // 7. Deep inspection for any folder containing Minecraft files
  const deep = inspectDeepLogAndFolder(dirPath, "custom");
  if (deep) {
    return deep;
  }

  return null;
}

/**
 * Auto-detect all external instances installed on the computer
 */
async function detectAllInstalledInstances() {
  const roots = getCandidateLauncherRoots();
  const seenPaths = new Set();
  const results = [];

  for (const { launcher, rootPath } of roots) {
    if (!fs.existsSync(rootPath)) continue;

    if (launcher === "vanilla") {
      const vanillaProfiles = inspectVanillaRoot(rootPath);
      for (const inst of vanillaProfiles) {
        if (!seenPaths.has(inst.gameDir)) {
          seenPaths.add(inst.gameDir);
          results.push(formatCandidate(inst));
        }
      }
      continue;
    }

    if (launcher === "modrinth") {
      const parentDir = path.dirname(rootPath);
      const appDbPath = path.join(parentDir, "app.db");
      if (fs.existsSync(appDbPath)) {
        const dbCandidates = readModrinthAppDb(appDbPath, rootPath);
        for (const inst of dbCandidates) {
          if (!seenPaths.has(inst.instancePath)) {
            seenPaths.add(inst.instancePath);
            results.push(formatCandidate(inst));
          }
        }
      }
    }

    // Subdirectories for multi-instance launchers (CurseForge, Prism, MultiMC, ATLauncher, Feather, Modrinth)
    let subdirs = [];
    try {
      subdirs = await fsp.readdir(rootPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of subdirs) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(rootPath, entry.name);
      if (seenPaths.has(fullPath)) continue;

      let candidate = null;
      if (launcher === "onyx") {
        candidate = inspectOnyxInstance(fullPath);
      } else if (launcher === "curseforge") {
        candidate = inspectCurseForgeInstance(fullPath);
      } else if (launcher === "prism") {
        candidate = inspectPrismFamilyInstance(fullPath, "prism");
      } else if (launcher === "multimc") {
        candidate = inspectPrismFamilyInstance(fullPath, "multimc");
      } else if (launcher === "atlauncher") {
        candidate = inspectATLauncherInstance(fullPath);
      } else if (launcher === "feather") {
        candidate = inspectFeatherInstance(fullPath);
      } else if (launcher === "modrinth") {
        candidate = inspectModrinthProfile(fullPath);
      }

      if (candidate) {
        seenPaths.add(fullPath);
        results.push(formatCandidate(candidate));
      }
    }
  }

  const launcherDefs = [
    { id: "onyx", name: "Onyx Launcher (Legacy)" },
    { id: "curseforge", name: "CurseForge" },
    { id: "prism", name: "Prism Launcher" },
    { id: "modrinth", name: "Modrinth App" },
    { id: "vanilla", name: "Vanilla / TLauncher" },
    { id: "multimc", name: "MultiMC / PolyMC" },
    { id: "atlauncher", name: "ATLauncher" },
    { id: "feather", name: "Feather Client" },
  ];

  const launchers = launcherDefs.map((def) => {
    const instances = results.filter(
      (i) => i.launcher === def.id || i.sourceLauncher === def.id,
    );
    return {
      id: def.id,
      name: def.name,
      detected: instances.length > 0,
      instances,
    };
  });

  return {
    launchers,
    instances: results,
    totalInstances: results.length,
  };
}

function formatCandidate(candidate) {
  if (!candidate) return candidate;
  return {
    ...candidate,
    sourceLauncher: candidate.launcher || candidate.sourceLauncher,
    instancePath: candidate.sourcePath || candidate.instancePath || candidate.gameDir,
  };
}

/**
 * Folders and files to migrate into Onyx
 */
const IMPORTANT_ITEMS = [
  "mods",
  "saves",
  "resourcepacks",
  "shaderpacks",
  "config",
  "options.txt",
  "servers.dat",
  "defaultconfigs",
  "kubejs",
  "patchouli_books",
  "blueprints",
  "visualprospecting",
  "schematics",
  "screenshots",
  "stats",
  "journeymap",
  "XaeroWaypoints",
  "XaeroWorldMap",
  "crash-reports",
  "logs",
  "hotbar.nbt",
];

/**
 * Migrate selected external instance into destination Onyx directory
 */
async function migrateInstanceFiles(argsOrSource, destination, maybeProgress) {
  let sourceGameDir;
  let destinationInstanceDir;
  let onProgress;

  if (typeof argsOrSource === "object" && argsOrSource !== null && !destination) {
    sourceGameDir = argsOrSource.sourceGameDir;
    destinationInstanceDir = argsOrSource.destinationInstanceDir;
    onProgress = argsOrSource.onProgress;
  } else {
    sourceGameDir = argsOrSource;
    destinationInstanceDir = destination;
    onProgress = maybeProgress;
  }

  await fsp.mkdir(destinationInstanceDir, { recursive: true });

  const existingEntries = await fsp.readdir(sourceGameDir, { withFileTypes: true }).catch(() => []);
  const itemsToCopy = existingEntries.filter((entry) =>
    IMPORTANT_ITEMS.includes(entry.name.toLowerCase()),
  );

  let processed = 0;
  const total = itemsToCopy.length;

  for (const item of itemsToCopy) {
    const src = path.join(sourceGameDir, item.name);
    const dest = path.join(destinationInstanceDir, item.name);

    onProgress?.({
      status: `Copying ${item.name}...`,
      item: item.name,
      current: processed,
      total,
      percent: Math.round((processed / Math.max(total, 1)) * 100),
    });

    try {
      // Use COPYFILE_FICLONE for instant Copy-on-Write cloning where supported
      await fsp.cp(src, dest, {
        recursive: true,
        mode: fs.constants.COPYFILE_FICLONE || 0,
      });
    } catch {
      // Graceful fallback to regular copy if CoW is unsupported
      await fsp.cp(src, dest, { recursive: true });
    }

    processed += 1;
  }

  onProgress?.({
    status: "Finalizing instance...",
    item: "done",
    current: total,
    total,
    percent: 100,
  });
}

/**
 * Builds a clean Onyx GameInstance object from candidate metadata
 */
function createOnyxInstanceFromCandidate(candidate, instanceId) {
  const colorMap = {
    onyx: "lime",
    curseforge: "amber",
    prism: "cyan",
    modrinth: "lime",
    vanilla: "violet",
    multimc: "lime",
    atlauncher: "amber",
    feather: "cyan",
    custom: "rose",
  };

  const launcherKey = candidate.sourceLauncher || candidate.launcher || "custom";
  const color = colorMap[launcherKey] || "lime";
  const resolvedVersionId = candidate.resolvedVersionId || null;

  return {
    id: instanceId,
    name: candidate.name.slice(0, 48),
    version: candidate.version || "1.21.1",
    loader: candidate.loader || "Vanilla",
    loaderVersion: candidate.loaderVersion || null,
    resolvedVersionId,
    description: launcherKey === "onyx" ? "Migrated from Onyx Launcher" : `Migrated from ${launcherKey.toUpperCase()}`,
    color,
    glyph: candidate.name.slice(0, 2).toUpperCase(),
    favorite: false,
    status: resolvedVersionId ? "ready" : "setup",
    lastPlayed: "Never played",
    playtimeMinutes: 0,
    modCount: candidate.modCount || 0,
    importedAt: new Date().toISOString(),
    migratedFrom: launcherKey,
  };
}

module.exports = {
  detectAllInstalledInstances,
  inspectCustomDirectory,
  inspectOnyxInstance,
  inspectCurseForgeInstance,
  inspectPrismInstance,
  inspectPrismFamilyInstance,
  inspectModrinthProfile,
  inspectVanillaRoot,
  inspectATLauncherInstance,
  inspectFeatherInstance,
  inspectDeepLogAndFolder,
  migrateInstanceFiles,
  createOnyxInstanceFromCandidate,
  getCandidateLauncherRoots,
};
