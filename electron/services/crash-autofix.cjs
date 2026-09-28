const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const StreamZip = require("node-stream-zip");

/**
 * @typedef {'increase-memory' | 'switch-java' | 'install-indium' | 'install-missing-dependency' | 'disable-culprit-mod' | 'remove-duplicate-mod' | 'resolve-mod-conflict' | 'reset-corrupted-config' | 'reset-jvm-args' | 'clean-corrupted-file'} AutoFixType
 *
 * @typedef {Object} CrashAutoFix
 * @property {AutoFixType} type
 * @property {string} titleKey
 * @property {string} descKey
 * @property {Record<string, any>} payload
 */

const KNOWN_DEP_SLUGS = {
  "fabric-api": { slug: "fabric-api", name: "Fabric API" },
  "fabric": { slug: "fabric-api", name: "Fabric API" },
  "fabric-language-kotlin": { slug: "fabric-language-kotlin", name: "Fabric Language Kotlin" },
  "cloth-config": { slug: "cloth-config", name: "Cloth Config" },
  "cloth-config2": { slug: "cloth-config", name: "Cloth Config" },
  "cloth_config": { slug: "cloth-config", name: "Cloth Config" },
  "architectury": { slug: "architectury-api", name: "Architectury API" },
  "architectury-api": { slug: "architectury-api", name: "Architectury API" },
  "yet-another-config-lib": { slug: "yacl", name: "Yet Another Config Lib (YACL)" },
  "yet_another_config_lib": { slug: "yacl", name: "Yet Another Config Lib (YACL)" },
  "yet_another_config_lib_v3": { slug: "yacl", name: "Yet Another Config Lib (YACL)" },
  "yacl": { slug: "yacl", name: "Yet Another Config Lib (YACL)" },
  "pehkui": { slug: "pehkui", name: "Pehkui" },
  "geckolib": { slug: "geckolib", name: "GeckoLib" },
  "citresewn": { slug: "cit-resewn", name: "CIT Resewn" },
  "cit-resewn": { slug: "cit-resewn", name: "CIT Resewn" },
  "indium": { slug: "indium", name: "Indium" },
  "iris": { slug: "iris", name: "Iris Shaders" },
  "sodium": { slug: "sodium", name: "Sodium" },
  "ferritecore": { slug: "ferrite-core", name: "FerriteCore" },
  "modmenu": { slug: "modmenu", name: "Mod Menu" },
  "appleskin": { slug: "appleskin", name: "AppleSkin" },
  "kotlinforforge": { slug: "kotlin-for-forge", name: "Kotlin for Forge" },
  "balm": { slug: "balm", name: "Balm" },
  "balm-fabric": { slug: "balm", name: "Balm" },
  "puzzleslib": { slug: "puzzles-lib", name: "Puzzles Lib" },
  "collective": { slug: "collective", name: "Collective" },
  "curios": { slug: "curios", name: "Curios API" },
  "trinkets": { slug: "trinkets", name: "Trinkets" },
  "cardinal-components": { slug: "cardinal-components-api", name: "Cardinal Components API" },
  "cardinal-components-base": { slug: "cardinal-components-api", name: "Cardinal Components API" },
};

/**
 * Inspects a JAR file's internal manifests (fabric.mod.json, quilt.mod.json, mods.toml, mcmod.info)
 * without extracting the entire archive.
 */
async function inspectJarMetadata(jarPath) {
  let zip;
  try {
    zip = new StreamZip.async({ file: jarPath });
    const entries = await zip.entries();
    let modId = null;
    let name = null;
    let version = null;
    let loader = null;
    let mcVersionRange = null;

    if (entries["fabric.mod.json"]) {
      loader = "fabric";
      try {
        const data = await zip.entryData("fabric.mod.json");
        const json = JSON.parse(data.toString("utf8"));
        modId = json.id;
        name = json.name || json.id;
        version = json.version || null;
        mcVersionRange = json.depends?.minecraft || null;
      } catch {}
    } else if (entries["quilt.mod.json"]) {
      loader = "quilt";
      try {
        const data = await zip.entryData("quilt.mod.json");
        const json = JSON.parse(data.toString("utf8"));
        modId = json.quilt_loader?.id;
        name = json.quilt_loader?.metadata?.name || modId;
        version = json.quilt_loader?.metadata?.version || null;
        const mcDep = json.quilt_loader?.depends?.find(
          (d) => d.id === "minecraft" || (typeof d === "string" && d === "minecraft"),
        );
        mcVersionRange = mcDep ? (mcDep.versions || mcDep) : null;
      } catch {}
    } else if (entries["META-INF/neoforge.mods.toml"]) {
      loader = "neoforge";
      try {
        const data = await zip.entryData("META-INF/neoforge.mods.toml");
        const tomlText = data.toString("utf8");
        const modIdMatch = tomlText.match(/modId\s*=\s*["']([^"']+)["']/);
        modId = modIdMatch ? modIdMatch[1] : null;
        const verMatch = tomlText.match(/versionRange\s*=\s*["']([^"']+)["']/);
        mcVersionRange = verMatch ? verMatch[1] : null;
        const versionMatch = tomlText.match(/version\s*=\s*["']([^"']+)["']/);
        version = versionMatch ? versionMatch[1] : null;
      } catch {}
    } else if (entries["META-INF/mods.toml"]) {
      loader = "forge";
      try {
        const data = await zip.entryData("META-INF/mods.toml");
        const tomlText = data.toString("utf8");
        const modIdMatch = tomlText.match(/modId\s*=\s*["']([^"']+)["']/);
        modId = modIdMatch ? modIdMatch[1] : null;
        const verMatch = tomlText.match(/versionRange\s*=\s*["']([^"']+)["']/);
        mcVersionRange = verMatch ? verMatch[1] : null;
        const versionMatch = tomlText.match(/version\s*=\s*["']([^"']+)["']/);
        version = versionMatch ? versionMatch[1] : null;
      } catch {}
    } else if (entries["mcmod.info"]) {
      loader = "forge";
      try {
        const data = await zip.entryData("mcmod.info");
        const json = JSON.parse(data.toString("utf8"));
        const info = Array.isArray(json) ? json[0] : (json.modList?.[0] || json);
        modId = info.modid;
        name = info.name;
        version = info.version || null;
        mcVersionRange = info.mcversion;
      } catch {}
    }

    return {
      fileName: path.basename(jarPath),
      jarPath,
      modId,
      name,
      version,
      loader,
      mcVersionRange,
      corrupted: false,
    };
  } catch (err) {
    return {
      fileName: path.basename(jarPath),
      jarPath,
      corrupted: true,
      error: err.message,
    };
  } finally {
    if (zip) {
      await zip.close().catch(() => {});
    }
  }
}

/**
 * Checks whether an inspected mod is compatible with the target instance loader & Minecraft version.
 */
function checkModCompatibility(modMeta, instance) {
  if (modMeta.corrupted) {
    return {
      incompatible: true,
      reason: "corrupted",
    };
  }

  const instLoader = (instance.loader || "").toLowerCase();
  const instVersion = instance.version || instance.installProfile?.minecraftVersion || "";

  // 1. Check Loader Mismatch
  if (modMeta.loader) {
    const isFabricFamily = instLoader === "fabric" || instLoader === "quilt";
    const isForgeFamily = instLoader === "forge" || instLoader === "neoforge";

    if (isFabricFamily && (modMeta.loader === "forge" || modMeta.loader === "neoforge")) {
      return {
        incompatible: true,
        reason: "loader-mismatch",
        modLoader: modMeta.loader === "neoforge" ? "NeoForge" : "Forge",
        instanceLoader: instLoader === "quilt" ? "Quilt" : "Fabric",
      };
    }

    if (isForgeFamily && (modMeta.loader === "fabric" || modMeta.loader === "quilt")) {
      return {
        incompatible: true,
        reason: "loader-mismatch",
        modLoader: modMeta.loader === "quilt" ? "Quilt" : "Fabric",
        instanceLoader: instLoader === "neoforge" ? "NeoForge" : "Forge",
      };
    }
  }

  // 2. Check Minecraft Version Mismatch (major / minor comparison)
  if (modMeta.mcVersionRange && instVersion) {
    const range = String(modMeta.mcVersionRange).trim();
    const rangeVersions = range.match(/\b1\.\d+(?:\.\d+)?\b/g);
    if (rangeVersions && rangeVersions.length > 0) {
      const instParts = instVersion.split(".").map(Number);
      const instMinor = instParts[1];

      const hasMatchingMinor = rangeVersions.some((v) => {
        const parts = v.split(".").map(Number);
        return parts[1] === instMinor;
      });

      if (!hasMatchingMinor && rangeVersions.length > 0) {
        return {
          incompatible: true,
          reason: "version-mismatch",
          modVersion: rangeVersions.join(", "),
          instanceVersion: instVersion,
        };
      }
    }
  }

  return { incompatible: false };
}

/**
 * Inspects Minecraft crash logs, crash reports, instance metadata, and installed mods
 * to formulate an actionable 1-click fix proposal.
 */
async function detectCrashAutoFix({
  instance = {},
  logContent = "",
  crashReport = null,
  instancesRoot = null,
  systemTotalRamMb = null,
}) {
  const text = String(logContent || "").slice(-500_000);
  const crashText = crashReport ? `${crashReport.errorTitle || ""}\n${crashReport.stackTrace || ""}` : "";
  const combined = `${text}\n${crashText}`;

  // 1. Out of Memory Error (OOM)
  if (
    /OutOfMemoryError|Java heap space|GC overhead limit exceeded|There is insufficient memory for the Java Runtime/i.test(combined)
  ) {
    const currentMemory = Number(instance.settings?.memory) || 4;
    const totalRamMb = systemTotalRamMb || Math.floor(os.totalmem() / (1024 * 1024));
    const totalSystemGb = Math.floor(totalRamMb / 1024);
    const maxSafeGb = Math.max(4, totalSystemGb - 2);

    let targetGb = currentMemory + 2;
    if (currentMemory < 6 && maxSafeGb >= 6) {
      targetGb = 6;
    } else if (targetGb > maxSafeGb) {
      targetGb = maxSafeGb;
    }

    if (targetGb > currentMemory) {
      return {
        type: "increase-memory",
        titleKey: "crash.autofix.increaseMemory.title",
        descKey: "crash.autofix.increaseMemory.desc",
        payload: {
          currentMemoryGiB: currentMemory,
          targetMemoryGiB: targetGb,
        },
      };
    }
  }

  // 2. Missing Indium for Sodium / Fabric rendering crash
  if (
    /IndiumException|requires indium|Indium is required|Sodium has replaced the default block\/fluid renderer|requires: \{indium/i.test(combined)
  ) {
    return {
      type: "install-indium",
      titleKey: "crash.autofix.installIndium.title",
      descKey: "crash.autofix.installIndium.desc",
      payload: {
        projectId: "indium",
        modName: "Indium",
      },
    };
  }

  // 3. Java Version Mismatch (UnsupportedClassVersionError)
  const javaVersionMatch = combined.match(
    /UnsupportedClassVersionError.*?has been compiled by a more recent version of the Java Runtime \(class file version (\d+)\.0\).*?recognizes class file versions up to (\d+)\.0/i,
  );
  if (javaVersionMatch || /class file version 65\.0/i.test(combined) || /class file version 61\.0/i.test(combined)) {
    let targetMajor = 21;
    if (javaVersionMatch && javaVersionMatch[1]) {
      const classVersion = Number(javaVersionMatch[1]);
      if (classVersion >= 65) targetMajor = 21;
      else if (classVersion >= 61) targetMajor = 17;
      else if (classVersion >= 60) targetMajor = 16;
      else targetMajor = 8;
    } else if (/class file version 65\.0/i.test(combined)) {
      targetMajor = 21;
    } else if (/class file version 61\.0/i.test(combined)) {
      targetMajor = 17;
    }

    return {
      type: "switch-java",
      titleKey: "crash.autofix.switchJava.title",
      descKey: "crash.autofix.switchJava.desc",
      payload: {
        requiredJavaMajor: targetMajor,
      },
    };
  }

  // Check for MC 1.20.5+ running on older Java (requires Java 21)
  const mcVersion = instance.version || instance.installProfile?.minecraftVersion || "";
  const isMc21Required = /^1\.(?:20\.[5-9]|2[1-9])/.test(mcVersion);
  if (isMc21Required && /class file version 65\.0|Java 21 is required/i.test(combined)) {
    return {
      type: "switch-java",
      titleKey: "crash.autofix.switchJava.title",
      descKey: "crash.autofix.switchJava.desc",
      payload: {
        requiredJavaMajor: 21,
      },
    };
  }

  // 4. Bad JVM Arguments
  if (
    /Unrecognized VM option|Could not create the Java Virtual Machine|Invalid maximum heap size|Improperly specified VM option/i.test(combined)
  ) {
    return {
      type: "reset-jvm-args",
      titleKey: "crash.autofix.resetJvmArgs.title",
      descKey: "crash.autofix.resetJvmArgs.desc",
      payload: {},
    };
  }

  // 5. Corrupted Archive or ZIP Header detected in log
  if (
    /zip END header not found|invalid (?:LOC|CEN) header|zip file is empty|ZipException/i.test(combined)
  ) {
    const jarMatch = combined.match(/([a-zA-Z0-9_\-+.]+\.jar)/i);
    return {
      type: "clean-corrupted-file",
      titleKey: "crash.autofix.cleanCorruptFile.title",
      descKey: "crash.autofix.cleanCorruptFile.desc",
      payload: {
        fileName: jarMatch ? jarMatch[1] : null,
      },
    };
  }

  // 6. Missing Mod Dependency (Fabric API, Kotlin, Cloth Config, Architectury, etc.)
  const missingDepMatch =
    combined.match(/(?:Mod\s+'[^']+'\s+)?requires\s*\{([a-z0-9_\-+.]+)(?:\s*@\s*[^}]+)?\},\s*which is missing/i) ||
    combined.match(/requires\s*\{([a-z0-9_\-+.]+)(?:\s*@\s*[^}]+)?\},\s*which is missing/i) ||
    combined.match(/Mod\s+'[^']+'\s+requires\s+([a-z0-9_\-+.]+),\s+which is missing/i) ||
    combined.match(/Unmet dependency:\s*mod\s+'[^']+'\s+requires\s+([a-z0-9_\-+.]+)/i) ||
    combined.match(/A potential solution has been determined:\s*(?:\n|\r\n)\s*-\s*Install\s+([a-z0-9_\-+.]+)/i) ||
    combined.match(/Missing or unsupported mandatory dependencies:\s*(?:[\s\S]*?)\s*Mod ID:\s*'([a-z0-9_\-+.]+)'/i);

  if (missingDepMatch) {
    const rawDepId = (missingDepMatch[1] || missingDepMatch[2] || "").trim().toLowerCase();
    if (rawDepId && !["minecraft", "java", "forge", "fabricloader", "quilt_loader", "neoforge"].includes(rawDepId)) {
      const known = KNOWN_DEP_SLUGS[rawDepId];
      const projectId = known ? known.slug : rawDepId;
      const depName = known ? known.name : rawDepId;

      return {
        type: "install-missing-dependency",
        titleKey: "crash.autofix.installMissingDep.title",
        descKey: "crash.autofix.installMissingDep.desc",
        payload: {
          depId: rawDepId,
          projectId,
          depName,
        },
      };
    }
  }

  // 7. Corrupted Config File (MalformedJsonException / ParsingException / ConfigException)
  const isConfigCrash =
    /JsonSyntaxException|MalformedJsonException|ParsingException|ConfigException|Failed to load config|Error parsing config/i.test(
      combined,
    );

  if (isConfigCrash && instancesRoot && instance.id) {
    const instanceDir = path.join(instancesRoot, instance.id);
    const configPathMatch =
      combined.match(/config[\\/]([a-zA-Z0-9_\-+./]+\.(?:json5?|toml|ya?ml|cfg|ini))/i) ||
      combined.match(/['"]([a-zA-Z0-9_\-+.]+\.(?:json5?|toml|ya?ml|cfg|ini))['"]/i);

    if (configPathMatch && configPathMatch[1]) {
      const relConfig = configPathMatch[1].replace(/^[\\/]+/, "");
      const candidatePaths = [
        path.join(instanceDir, "config", relConfig),
        path.join(instanceDir, relConfig),
      ];

      for (const cand of candidatePaths) {
        if (fs.existsSync(cand)) {
          const relDisplay = path.relative(instanceDir, cand).replace(/\\/g, "/");
          return {
            type: "reset-corrupted-config",
            titleKey: "crash.autofix.resetConfig.title",
            descKey: "crash.autofix.resetConfig.desc",
            payload: {
              configFile: relDisplay,
              fullPath: cand,
            },
          };
        }
      }
    }
  }

  // 8. Mutually Exclusive Mod Conflicts (OptiFine + Sodium/Iris, Phosphor + Starlight)
  if (instancesRoot && instance.id) {
    const modsDir = path.join(instancesRoot, instance.id, "mods");
    if (fs.existsSync(modsDir)) {
      try {
        const files = await fsp.readdir(modsDir);
        const activeJars = files.filter((f) => f.endsWith(".jar") && !f.endsWith(".disabled"));

        const optifineJar = activeJars.find((f) => /optifine|optifabric/i.test(f));
        const sodiumJar = activeJars.find((f) => /sodium|iris|rubidium|embeddium/i.test(f));

        if (optifineJar && sodiumJar) {
          return {
            type: "resolve-mod-conflict",
            titleKey: "crash.autofix.resolveConflict.title",
            descKey: "crash.autofix.resolveConflict.desc",
            payload: {
              conflictingMod: optifineJar,
              incompatibleWith: sodiumJar,
              conflictReason: "rendering-pipeline",
            },
          };
        }

        const phosphorJar = activeJars.find((f) => /phosphor/i.test(f));
        const starlightJar = activeJars.find((f) => /starlight/i.test(f));
        if (phosphorJar && starlightJar) {
          return {
            type: "resolve-mod-conflict",
            titleKey: "crash.autofix.resolveConflict.title",
            descKey: "crash.autofix.resolveConflict.desc",
            payload: {
              conflictingMod: phosphorJar,
              incompatibleWith: starlightJar,
              conflictReason: "light-engine",
            },
          };
        }
      } catch {}
    }
  }

  // 9. Duplicate Mods from log
  const duplicateMatch =
    combined.match(/DuplicateModsFoundException:.*?\[([^\]]+)\]/i) ||
    combined.match(/Duplicate mods found:?\s*([a-zA-Z0-9_\-+.]+)/i) ||
    combined.match(/Duplicate mod ID:?\s*'([a-z0-9_\-+.]+)'/i);

  if (duplicateMatch && instancesRoot && instance.id) {
    const modsDir = path.join(instancesRoot, instance.id, "mods");
    if (fs.existsSync(modsDir)) {
      try {
        const files = await fsp.readdir(modsDir);
        const activeJars = files.filter((f) => f.endsWith(".jar") && !f.endsWith(".disabled"));
        const rawName = duplicateMatch[1].trim();
        const baseName = rawName.replace(/\.jar$/, "").toLowerCase();

        const matches = activeJars.filter((f) => f.toLowerCase().includes(baseName));
        if (matches.length >= 2) {
          const copyFile = matches.find((f) => /\(\d+\)|_copy|-copy/i.test(f));
          const disableFile = copyFile || matches[1];
          const keepFile = matches.find((f) => f !== disableFile) || matches[0];

          return {
            type: "remove-duplicate-mod",
            titleKey: "crash.autofix.removeDuplicateMod.title",
            descKey: "crash.autofix.removeDuplicateMod.desc",
            payload: {
              modId: rawName,
              keepFile,
              disableFile,
            },
          };
        }
      } catch {}
    }
  }

  // 10. Deep JAR inspection in instance mods folder (unpacking manifests to check version & loader & duplicates)
  if (instancesRoot && instance.id) {
    const modsDir = path.join(instancesRoot, instance.id, "mods");
    if (fs.existsSync(modsDir)) {
      try {
        const files = await fsp.readdir(modsDir);
        const jarFiles = files.filter(
          (f) => f.endsWith(".jar") && !f.endsWith(".disabled")
        );

        const seenModIds = new Map();

        for (const file of jarFiles) {
          const fullPath = path.join(modsDir, file);
          const meta = await inspectJarMetadata(fullPath);

          if (meta.corrupted) {
            return {
              type: "clean-corrupted-file",
              titleKey: "crash.autofix.cleanCorruptFile.title",
              descKey: "crash.autofix.cleanCorruptFile.desc",
              payload: {
                fileName: file,
              },
            };
          }

          // Check duplicate mod IDs inside mods folder
          if (meta.modId && meta.modId !== "minecraft") {
            if (seenModIds.has(meta.modId)) {
              const prevFile = seenModIds.get(meta.modId);
              const isCopy = /\(\d+\)|_copy|-copy/i.test(file);
              const disableFile = isCopy ? file : prevFile;
              const keepFile = disableFile === file ? prevFile : file;

              return {
                type: "remove-duplicate-mod",
                titleKey: "crash.autofix.removeDuplicateMod.title",
                descKey: "crash.autofix.removeDuplicateMod.desc",
                payload: {
                  modId: meta.modId,
                  keepFile,
                  disableFile,
                },
              };
            }
            seenModIds.set(meta.modId, file);
          }

          const compat = checkModCompatibility(meta, instance);
          if (compat.incompatible) {
            if (compat.reason === "loader-mismatch") {
              return {
                type: "disable-culprit-mod",
                titleKey: "crash.autofix.incompatibleLoader.title",
                descKey: "crash.autofix.incompatibleLoader.desc",
                payload: {
                  mod: file,
                  modFileName: file,
                  modLoader: compat.modLoader,
                  instanceLoader: compat.instanceLoader,
                },
              };
            }
            if (compat.reason === "version-mismatch") {
              return {
                type: "disable-culprit-mod",
                titleKey: "crash.autofix.incompatibleVersion.title",
                descKey: "crash.autofix.incompatibleVersion.desc",
                payload: {
                  mod: file,
                  modFileName: file,
                  modVersion: compat.modVersion,
                  instanceVersion: compat.instanceVersion,
                },
              };
            }
          }
        }
      } catch {}
    }
  }

  // 11. Culprit Mod from crash report
  if (crashReport && crashReport.suspectedCulprit) {
    const culprit = crashReport.suspectedCulprit;
    if (!culprit.includes("onyx-fps-agent")) {
      const finalName = culprit.endsWith(".jar") ? culprit : `${culprit}.jar`;
      return {
        type: "disable-culprit-mod",
        titleKey: "crash.autofix.disableMod.title",
        descKey: "crash.autofix.disableMod.desc",
        payload: {
          mod: finalName,
          modFileName: finalName,
        },
      };
    }
  }

  return null;
}

/**
 * Applies the proposed 1-click fix to the instance.
 */
async function applyCrashAutoFix({
  fixAction,
  instance,
  instancesRoot,
  installModFn = null,
  repairInstanceFn = null,
  saveStateFn = null,
}) {
  if (!fixAction || !fixAction.type || !instance) {
    throw new Error("Invalid fix action or instance");
  }

  switch (fixAction.type) {
    case "increase-memory": {
      instance.settings = instance.settings || {};
      instance.settings.memory = fixAction.payload.targetMemoryGiB;
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "increase-memory",
        message: `Allocated ${fixAction.payload.targetMemoryGiB} GB RAM`,
      };
    }

    case "switch-java": {
      instance.settings = instance.settings || {};
      instance.settings.javaPath = "";
      instance.javaMajor = fixAction.payload.requiredJavaMajor;
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "switch-java",
        message: `Switched to Java ${fixAction.payload.requiredJavaMajor}`,
      };
    }

    case "reset-jvm-args": {
      instance.settings = instance.settings || {};
      instance.settings.jvmArguments = [];
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "reset-jvm-args",
        message: "Reset custom JVM arguments to defaults",
      };
    }

    case "disable-culprit-mod": {
      const modName = fixAction.payload?.modFileName || fixAction.payload?.mod;
      if (!modName) throw new Error("Culprit mod file name missing");

      const modsDir = path.join(instancesRoot, instance.id, "mods");
      let disabledFile = null;
      if (fs.existsSync(modsDir)) {
        const files = await fsp.readdir(modsDir);
        const target = files.find((f) => {
          if (f.endsWith(".disabled")) return false;
          const cleanF = f.toLowerCase();
          const cleanTarget = modName.toLowerCase().replace(/\.jar$/, "");
          return cleanF === modName.toLowerCase() || cleanF.includes(cleanTarget);
        });

        if (target) {
          const src = path.join(modsDir, target);
          const dst = path.join(modsDir, `${target}.disabled`);
          await fsp.rename(src, dst);
          disabledFile = target;
        }
      }

      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "disable-culprit-mod",
        message: disabledFile ? `Disabled ${disabledFile}` : `Mod ${modName} was disabled or removed`,
      };
    }

    case "clean-corrupted-file": {
      const fileName = fixAction.payload?.fileName;
      if (fileName && instancesRoot) {
        const modsDir = path.join(instancesRoot, instance.id, "mods");
        const candidate = path.join(modsDir, fileName);
        if (fs.existsSync(candidate)) {
          await fsp.unlink(candidate);
        }
      }
      if (repairInstanceFn) {
        await repairInstanceFn(instance);
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "clean-corrupted-file",
        message: "Removed corrupted file and triggered repair",
      };
    }

    case "install-indium": {
      if (installModFn) {
        await installModFn({
          instance,
          projectId: fixAction.payload?.projectId || "indium",
        });
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "install-indium",
        message: "Installed Indium for Sodium compatibility",
      };
    }

    case "install-missing-dependency": {
      if (installModFn) {
        await installModFn({
          instance,
          projectId: fixAction.payload?.projectId || fixAction.payload?.depId,
        });
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "install-missing-dependency",
        message: `Installed missing dependency ${fixAction.payload?.depName || fixAction.payload?.depId}`,
      };
    }

    case "remove-duplicate-mod": {
      const disableFile = fixAction.payload?.disableFile;
      if (!disableFile) throw new Error("Duplicate mod file name missing");

      const modsDir = path.join(instancesRoot, instance.id, "mods");
      const src = path.join(modsDir, disableFile);
      const dst = path.join(modsDir, `${disableFile}.disabled`);
      if (fs.existsSync(src)) {
        await fsp.rename(src, dst);
      }

      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "remove-duplicate-mod",
        message: `Disabled duplicate mod ${disableFile}`,
      };
    }

    case "resolve-mod-conflict": {
      const conflictingMod = fixAction.payload?.conflictingMod;
      if (!conflictingMod) throw new Error("Conflicting mod file name missing");

      const modsDir = path.join(instancesRoot, instance.id, "mods");
      const src = path.join(modsDir, conflictingMod);
      const dst = path.join(modsDir, `${conflictingMod}.disabled`);
      if (fs.existsSync(src)) {
        await fsp.rename(src, dst);
      }

      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "resolve-mod-conflict",
        message: `Disabled conflicting mod ${conflictingMod}`,
      };
    }

    case "reset-corrupted-config": {
      const fullPath = fixAction.payload?.fullPath;
      if (fullPath && fs.existsSync(fullPath)) {
        const bakPath = `${fullPath}.bak`;
        try {
          await fsp.rename(fullPath, bakPath);
        } catch {
          await fsp.unlink(fullPath);
        }
      }

      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "reset-corrupted-config",
        message: `Reset damaged config file ${fixAction.payload?.configFile || ""}`,
      };
    }

    default:
      throw new Error(`Unsupported fix action type: ${fixAction.type}`);
  }
}

module.exports = {
  detectCrashAutoFix,
  applyCrashAutoFix,
  inspectJarMetadata,
  checkModCompatibility,
};
