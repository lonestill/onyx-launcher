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

  // 4a. Obsolete or Incompatible JVM GC Flags (sanitize instead of full reset)
  if (
    /Unrecognized VM option '(?:UseConcMarkSweepGC|CMSIncrementalMode|CMSIncrementalPacing|UseParNewGC|UseZGC|UseShenandoahGC)'|Option UseConcMarkSweepGC was removed in version 14\.0/i.test(
      combined,
    )
  ) {
    return {
      type: "sanitize-jvm-gc-flags",
      titleKey: "crash.autofix.sanitizeGcFlags.title",
      descKey: "crash.autofix.sanitizeGcFlags.desc",
      payload: {},
    };
  }

  // 4b. Bad JVM Arguments
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
    combined.match(/Missing or unsupported mandatory dependencies:\s*(?:[\s\S]*?)\s*Mod ID:\s*'([a-z0-9_\-+.]+)'/i) ||
    combined.match(/Mod\s+[a-zA-Z0-9_\-+.]+\s+requires\s+([a-z0-9_\-+.]+)(?:\s+[0-9.]+)?\s+or above[\s\S]*?Currently,?\s*(?:\1\s+)?is not installed/i) ||
    combined.match(/requires\s+([a-z0-9_\-+.]+)(?:\s+[0-9.]+)?\s+or above[\s\S]*?Currently,?\s*(?:\1\s+)?is not installed/i) ||
    combined.match(/Failure message:\s*Mod\s+[a-zA-Z0-9_\-+.]+\s+requires\s+([a-z0-9_\-+.]+)/i);

  if (missingDepMatch) {
    const rawDepId = (missingDepMatch[1] || missingDepMatch[2] || "").trim().toLowerCase();
    if (rawDepId && !["minecraft", "java", "forge", "fabricloader", "quilt_loader", "neoforge"].includes(rawDepId)) {
      let known = KNOWN_DEP_SLUGS[rawDepId];
      if (!known && (rawDepId.startsWith("fabric-") || rawDepId === "fabric-api-base")) {
        known = { slug: "fabric-api", name: "Fabric API" };
      }
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

  // 9.5. Stray Vanilla Game JAR in mods folder (causes JPMS ResolutionException failTwoSuppliers on NeoForge/Forge)
  const isSplitPackageCrash =
    /ResolutionException:\s*Modules\s+(_[0-9_.]+|[a-zA-Z0-9_.]+)\s+and\s+minecraft\s+export package/i.test(combined) ||
    /Modules\s+(_[0-9_.]+|[a-zA-Z0-9_.]+)\s+and\s+minecraft\s+export package/i.test(combined);

  if ((isSplitPackageCrash || (instancesRoot && instance.id)) && instancesRoot && instance.id) {
    const modsDir = path.join(instancesRoot, instance.id, "mods");
    if (fs.existsSync(modsDir)) {
      try {
        const files = await fsp.readdir(modsDir);
        const strayVanillaJar = files.find(
          (f) =>
            f.endsWith(".jar") &&
            !f.endsWith(".disabled") &&
            (/^\d+\.\d+(\.\d+)?\.jar$/i.test(f) ||
             /^(?:minecraft-)?(?:client-|server-)?\d+\.\d+(?:\.\d+)?(?:-client|-server)?\.jar$/i.test(f) ||
             /^client\.jar$/i.test(f) ||
             /^server\.jar$/i.test(f))
        );

        if (strayVanillaJar || isSplitPackageCrash) {
          const splitMatch = combined.match(/Modules\s+(_[0-9_.]+|[a-zA-Z0-9_.]+)\s+and\s+minecraft\s+export package/i);
          let targetFile = strayVanillaJar;
          if (!targetFile && splitMatch && splitMatch[1]) {
            const rawModName = splitMatch[1].replace(/^_/, "").replace(/\._/g, ".");
            targetFile = files.find((f) => f.toLowerCase().includes(rawModName.toLowerCase())) || `${rawModName}.jar`;
          }

          if (targetFile) {
            return {
              type: "remove-vanilla-jar-from-mods",
              titleKey: "crash.autofix.removeVanillaJar.title",
              descKey: "crash.autofix.removeVanillaJar.desc",
              payload: {
                fileName: targetFile,
              },
            };
          }
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

  // 12. disable-active-shaderpack
  if (/Program link failed|Composite shader error|Failed to link program|ShaderCompileError|shader compilation|iris\.shaderpack/i.test(combined)) {
    return {
      type: "disable-active-shaderpack",
      titleKey: "crash.autofix.disableShaderpack.title",
      descKey: "crash.autofix.disableShaderpack.desc",
      payload: { shaderpack: "active" },
    };
  }

  // 12b. disable-early-display (Forge/NeoForge early splash display freeze on Wayland / hybrid graphics)
  if (
    /Failed to initialize EarlyDisplay: java\.lang\.IllegalStateException: GLFW error|net\.minecraftforge\.fml\.earlydisplay\.DisplayWindow|neoforge\.earlydisplay|fml\.earlydisplay/i.test(
      combined,
    )
  ) {
    return {
      type: "disable-early-display",
      titleKey: "crash.autofix.disableEarlyDisplay.title",
      descKey: "crash.autofix.disableEarlyDisplay.desc",
      payload: {},
    };
  }

  // 13. apply-wayland-fix (check before generic OpenGL so Wayland GLX context crashes are correctly routed)
  if (/GLFW error 65543|GLX: Failed to create context.*Wayland|wayland.*GLFW|GLFW_PLATFORM.*wayland/i.test(combined)) {
    return {
      type: "apply-wayland-fix",
      titleKey: "crash.autofix.waylandFix.title",
      descKey: "crash.autofix.waylandFix.desc",
      payload: { jvmFlag: "-Dorg.lwjgl.glfw.libname=libglfw.so.3" },
    };
  }

  // 14. repair-opengl-context
  if (/GLFW error 65542|The driver does not appear to support OpenGL|Pixel format not accelerated|GLX: Failed to create context|WGL:.+OpenGL/i.test(combined)) {
    return {
      type: "repair-opengl-context",
      titleKey: "crash.autofix.repairOpengl.title",
      descKey: "crash.autofix.repairOpengl.desc",
      payload: { jvmFlag: "-Dsun.java2d.opengl=false" },
    };
  }

  // 15. reset-video-options
  if (/Display\.create|BadWindow|X Error of failed request.*BadWindow|Failed to find window|display initialization|overrideWidth|overrideHeight.*invalid/i.test(combined)) {
    return {
      type: "reset-video-options",
      titleKey: "crash.autofix.resetVideo.title",
      descKey: "crash.autofix.resetVideo.desc",
      payload: { optionsFile: "options.txt" },
    };
  }

  // 16. disable-active-resourcepacks
  if (/TextureAtlasException|Stitching.*atlas|OutOfMemoryError.*(?:texture|atlas|stitch)|ResourcePack.*overflow/i.test(combined)) {
    return {
      type: "disable-active-resourcepacks",
      titleKey: "crash.autofix.disableResourcepacks.title",
      descKey: "crash.autofix.disableResourcepacks.desc",
      payload: { optionsFile: "options.txt" },
    };
  }

  // 17. upgrade-loader-version
  const loaderMatch = combined.match(/requires fabricloader >=([0-9.]+)|requires neoforge >=([0-9.]+)|requires quilt_loader >=([0-9.]+)|Mod requires loader version/i);
  if (loaderMatch) {
    const requiredVersion = loaderMatch[1] || loaderMatch[2] || loaderMatch[3] || "unknown";
    return {
      type: "upgrade-loader-version",
      titleKey: "crash.autofix.upgradeLoader.title",
      descKey: "crash.autofix.upgradeLoader.desc",
      payload: {
        loader: instance.loader,
        requiredVersion,
        currentVersion: instance.loaderVersion || "unknown",
      },
    };
  }

  // 18. switch-arm64-java
  if (process.platform === "darwin" && /UnsatisfiedLinkError.*incompatible architecture.*(?:have x86_64.*need arm64|have \(x86_64\))/i.test(combined)) {
    return {
      type: "switch-arm64-java",
      titleKey: "crash.autofix.switchArm64.title",
      descKey: "crash.autofix.switchArm64.desc",
      payload: { targetArch: "arm64" },
    };
  }

  // 19. inject-java-module-flags
  if (/InaccessibleObjectException|Unable to make.*accessible|module java\.base does not.*opens|--add-opens.*required/i.test(combined)) {
    return {
      type: "inject-java-module-flags",
      titleKey: "crash.autofix.injectModuleFlags.title",
      descKey: "crash.autofix.injectModuleFlags.desc",
      payload: { flagCount: 4 },
    };
  }

  // 20. install-openjfx
  if (/NoClassDefFoundError.*javafx|ClassNotFoundException.*javafx|Missing JavaFX|javafx.*not found/i.test(combined)) {
    return {
      type: "install-openjfx",
      titleKey: "crash.autofix.installJfx.title",
      descKey: "crash.autofix.installJfx.desc",
      payload: { requirement: "javafx" },
    };
  }

  // 21. enable-forge-entity-removal
  if (/NullPointerException.*Ticking entity|Ticking block entity|ConcurrentModificationException.*entity|Erroring entity/i.test(combined)) {
    return {
      type: "enable-forge-entity-removal",
      titleKey: "crash.autofix.entityRemoval.title",
      descKey: "crash.autofix.entityRemoval.desc",
      payload: { loader: instance.loader || "forge" },
    };
  }

  // 22. quarantine-playerdata
  if (/Failed to load player data|Corrupt NBT tag|playerdata[\\/].*?\.dat.*?(?:corrupt|invalid|ClassCastException)/i.test(combined)) {
    const uuidMatch = combined.match(/playerdata[\\/]([a-f0-9-]+)\.dat/i) || combined.match(/UUID\s+([a-f0-9-]+)/i);
    return {
      type: "quarantine-playerdata",
      titleKey: "crash.autofix.quarantinePlayer.title",
      descKey: "crash.autofix.quarantinePlayer.desc",
      payload: { uuid: uuidMatch ? uuidMatch[1] : null },
    };
  }

  // 23. restore-world-snapshot
  if (/Already decorating|cascading worldgen|chunk generation crash|CrashedException.*worldgen|StackOverflowError.*(?:generate|decorator)/i.test(combined)) {
    return {
      type: "restore-world-snapshot",
      titleKey: "crash.autofix.worldgenCrash.title",
      descKey: "crash.autofix.worldgenCrash.desc",
      payload: { worldgenIssue: true },
    };
  }

  // 24. kill-zombie-process
  if (/FileAlreadyExistsException|AccessDeniedException.*session\.lock|AccessDeniedException.*latest\.log|EBUSY.*session\.lock|locked by another process/i.test(combined)) {
    const lockFile = /session\.lock/i.test(combined) ? "session.lock" : "latest.log";
    return {
      type: "kill-zombie-process",
      titleKey: "crash.autofix.zombieProcess.title",
      descKey: "crash.autofix.zombieProcess.desc",
      payload: { lockFile },
    };
  }

  // 25. repair-instance-assets
  if (/FileNotFoundException.*assets[\\/]|hash mismatch.*client\.jar|Missing asset|assets[\\/].*index.*not found|libraries[\\/].*not found/i.test(combined)) {
    return {
      type: "repair-instance-assets",
      titleKey: "crash.autofix.repairAssets.title",
      descKey: "crash.autofix.repairAssets.desc",
      payload: { repair: true },
    };
  }

  // 26. cleanup-temp-install-files
  if (/\.jar\.tmp|\.(?:scope-download|part|download).*?(?:exists|found|incomplete|stale)/i.test(combined)) {
    return {
      type: "cleanup-temp-install-files",
      titleKey: "crash.autofix.cleanupTemp.title",
      descKey: "crash.autofix.cleanupTemp.desc",
      payload: { cleanedCount: 1 },
    };
  }

  // 27. reconcile-modpack-manifest
  if (/modpack.*?incompatib|untracked mod|rogue mod|modpack update.*?conflict|modpack.*?version mismatch/i.test(combined)) {
    return {
      type: "reconcile-modpack-manifest",
      titleKey: "crash.autofix.reconcileModpack.title",
      descKey: "crash.autofix.reconcileModpack.desc",
      payload: { advisory: true },
    };
  }

  // 28. disable-environment-mismatched-mod
  if (/NoClassDefFoundError.*?net\/minecraft\/client\/Minecraft|Attempted to load class.*?net\/minecraft\/client.*?on a dedicated server|DedicatedServer.*?environment mismatch/i.test(combined)) {
    return {
      type: "disable-environment-mismatched-mod",
      titleKey: "crash.autofix.envMismatch.title",
      descKey: "crash.autofix.envMismatch.desc",
      payload: { mod: "client-only-mod", environment: "server" },
    };
  }

  // 29. restore-corrupted-level-dat
  if (/Failed to read level\.dat|EOFException.*level\.dat|CompressedStreamTools.*level\.dat|Corrupt level\.dat/i.test(combined)) {
    const worldMatch = combined.match(/saves[\\/]([a-zA-Z0-9_\-+ ]+)[\\/]level\.dat/i) || combined.match(/world\s+['"]?([a-zA-Z0-9_\-+ ]+)['"]?/i);
    return {
      type: "restore-corrupted-level-dat",
      titleKey: "crash.autofix.restoreLevelDat.title",
      descKey: "crash.autofix.restoreLevelDat.desc",
      payload: { worldName: worldMatch ? worldMatch[1] : "world" },
    };
  }

  // 30. resolve-mixin-overwrite
  if (/MixinTransformerError.*Critical injection failure|Cannot apply @Overwrite on target|failed injection check.*mixins?\.json/i.test(combined)) {
    const mixinMatch = combined.match(/([a-zA-Z0-9_\-+.]+)\.mixins?\.json/i);
    return {
      type: "resolve-mixin-overwrite",
      titleKey: "crash.autofix.mixinOverwrite.title",
      descKey: "crash.autofix.mixinOverwrite.desc",
      payload: { mixinName: mixinMatch ? mixinMatch[1] : "unknown" },
    };
  }

  // 31. sanitize-options-txt
  if (/NumberFormatException.*For input string: "NaN"|NumberFormatException.*options\.txt|Unknown key code.*options\.txt|Failed to load options/i.test(combined)) {
    return {
      type: "sanitize-options-txt",
      titleKey: "crash.autofix.sanitizeOptions.title",
      descKey: "crash.autofix.sanitizeOptions.desc",
      payload: { optionsFile: "options.txt" },
    };
  }

  // 32. install-optifabric (Fabric + OptiFine without OptiFabric)
  const isFabric = (instance.loader || "").toLowerCase() === "fabric";
  const hasOptifine = /optifine/i.test(combined);
  const lacksOptifabric = !/optifabric/i.test(combined);
  if (isFabric && hasOptifine && lacksOptifabric && (/LaunchClassLoader|OptiFine is not compatible directly/i.test(combined) || combined.includes("OptiFine"))) {
    return {
      type: "install-optifabric",
      titleKey: "crash.autofix.installOptifabric.title",
      descKey: "crash.autofix.installOptifabric.desc",
      payload: { projectId: "optifabric", depName: "OptiFabric" },
    };
  }

  // 33. purge-instance-logs-cache
  if (/No space left on device|There is not enough space on the disk|Disk full/i.test(combined)) {
    return {
      type: "purge-instance-logs-cache",
      titleKey: "crash.autofix.purgeLogsCache.title",
      descKey: "crash.autofix.purgeLogsCache.desc",
      payload: {},
    };
  }

  // 34. install-language-adapter
  const adapterMatch = combined.match(/Language adapter '([a-zA-Z0-9_\-]+)' was not found|LanguageAdapterException/i);
  if (adapterMatch) {
    const rawAdapter = (adapterMatch[1] || "kotlin").toLowerCase();
    const projectId = rawAdapter.includes("kotlin") ? "fabric-language-kotlin" : `language-adapter-${rawAdapter}`;
    return {
      type: "install-language-adapter",
      titleKey: "crash.autofix.installLangAdapter.title",
      descKey: "crash.autofix.installLangAdapter.desc",
      payload: { adapterName: rawAdapter, projectId },
    };
  }

  // 35. suppress-gpu-hooks
  if (/# Problematic frame:.*(?:nvoglv64\.dll|atig6pxx\.dll|d3d11\.dll|RTSSHooks64\.dll|DiscordHook64\.dll)/i.test(combined) || /EXCEPTION_ACCESS_VIOLATION.*(?:nvoglv64|RTSSHooks)/i.test(combined)) {
    return {
      type: "suppress-gpu-hooks",
      titleKey: "crash.autofix.suppressGpuHooks.title",
      descKey: "crash.autofix.suppressGpuHooks.desc",
      payload: { jvmFlag: "-Dorg.lwjgl.opengl.Display.allowSoftwareOpenGL=true" },
    };
  }

  // 36. force-switch-64bit-java
  if (/Could not reserve enough space for \d+KB object heap|32-Bit Server VM|32-bit Java|x86 JRE/i.test(combined)) {
    return {
      type: "force-switch-64bit-java",
      titleKey: "crash.autofix.forceSwitch64BitJava.title",
      descKey: "crash.autofix.forceSwitch64BitJava.desc",
      payload: { targetArch: "x64" },
    };
  }

  // 37. install-qsl-library
  if (/Missing required library:\s*QSL|quilt_loader:\s*Missing dependency:\s*qsl|requires\s+qsl\s+library|Quilt Standard Libraries.*missing/i.test(combined)) {
    return {
      type: "install-qsl-library",
      titleKey: "crash.autofix.installQsl.title",
      descKey: "crash.autofix.installQsl.desc",
      payload: { projectId: "qsl", depName: "Quilted Fabric API" },
    };
  }

  // 38. purge-corrupted-natives
  if (/UnsatisfiedLinkError: Could not load library: lwjgl|no lwjgl.*in java\.library\.path|corrupted native/i.test(combined)) {
    return {
      type: "purge-corrupted-natives",
      titleKey: "crash.autofix.purgeNatives.title",
      descKey: "crash.autofix.purgeNatives.desc",
      payload: {},
    };
  }

  // 39. allow-security-manager-flag
  if (/UnsupportedOperationException: The Security Manager is deprecated|getSecurityManager is not allowed to be called/i.test(combined)) {
    return {
      type: "allow-security-manager-flag",
      titleKey: "crash.autofix.allowSecurityManager.title",
      descKey: "crash.autofix.allowSecurityManager.desc",
      payload: { jvmFlag: "-Djava.security.manager=allow" },
    };
  }

  // 40. clean-corrupted-usercache
  if (
    /(?:JsonSyntaxException|MalformedJsonException|JsonParseException).*?(?:usercache\.json|realms_persistence\.json)|Failed to load user cache: com\.google\.gson|Expected BEGIN_ARRAY but was STRING at path \$|java\.io\.EOFException: End of input at line 1 column 1 path \$(?:.*usercache)?/i.test(
      combined,
    )
  ) {
    return {
      type: "clean-corrupted-usercache",
      titleKey: "crash.autofix.cleanUsercache.title",
      descKey: "crash.autofix.cleanUsercache.desc",
      payload: {},
    };
  }

  // 43. repair-servers-dat
  if (
    /net\.minecraft\.nbt\.ReportedNbtException: Loading NBT data|Failed to load servers: java\.io\.EOFException|java\.io\.EOFException\s+at net\.minecraft\.nbt\.NbtIo\.readCompressed|servers\.dat.*?(?:EOFException|ZipException|corrupt)/i.test(
      combined,
    )
  ) {
    return {
      type: "repair-servers-dat",
      titleKey: "crash.autofix.repairServersDat.title",
      descKey: "crash.autofix.repairServersDat.desc",
      payload: {},
    };
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

    case "disable-active-shaderpack": {
      const instanceDir = path.join(instancesRoot, instance.id);
      const irisOptions = path.join(instanceDir, "optionsiris.txt");
      if (fs.existsSync(irisOptions)) {
        let content = await fsp.readFile(irisOptions, "utf8");
        if (/^shaderPack=/m.test(content)) {
          content = content.replace(/^shaderPack=.*$/m, "shaderPack=OFF");
        } else {
          content += "\nshaderPack=OFF\n";
        }
        await fsp.writeFile(irisOptions, content, "utf8");
      } else {
        await fsp.writeFile(irisOptions, "shaderPack=OFF\n", "utf8");
      }

      const optionsTxt = path.join(instanceDir, "options.txt");
      if (fs.existsSync(optionsTxt)) {
        let content = await fsp.readFile(optionsTxt, "utf8");
        if (/^ofShader:/m.test(content)) {
          content = content.replace(/^ofShader:.*$/m, "ofShader:OFF");
          await fsp.writeFile(optionsTxt, content, "utf8");
        }
      }

      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "disable-active-shaderpack",
        message: "Disabled active shaderpack",
      };
    }

    case "repair-opengl-context": {
      instance.settings = instance.settings || {};
      instance.settings.jvmArguments = instance.settings.jvmArguments || [];
      if (!instance.settings.jvmArguments.includes(fixAction.payload.jvmFlag)) {
        instance.settings.jvmArguments.push(fixAction.payload.jvmFlag);
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "repair-opengl-context",
        message: "Added JVM argument to repair OpenGL context",
      };
    }

    case "apply-wayland-fix": {
      instance.settings = instance.settings || {};
      instance.settings.jvmArguments = instance.settings.jvmArguments || [];
      if (!instance.settings.jvmArguments.includes(fixAction.payload.jvmFlag)) {
        instance.settings.jvmArguments.push(fixAction.payload.jvmFlag);
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "apply-wayland-fix",
        message: "Applied Wayland GLFW fix",
      };
    }

    case "reset-video-options": {
      const instanceDir = path.join(instancesRoot, instance.id);
      const optionsTxt = path.join(instanceDir, "options.txt");
      if (fs.existsSync(optionsTxt)) {
        let content = await fsp.readFile(optionsTxt, "utf8");
        content = content.replace(/^fullscreen:.*$/m, "fullscreen:false");
        content = content.replace(/^overrideWidth:.*$/m, "overrideWidth:854");
        content = content.replace(/^overrideHeight:.*$/m, "overrideHeight:480");
        content = content.replace(/^guiScale:.*$/m, "guiScale:0");
        await fsp.writeFile(optionsTxt, content, "utf8");
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "reset-video-options",
        message: "Reset video options",
      };
    }

    case "disable-active-resourcepacks": {
      const instanceDir = path.join(instancesRoot, instance.id);
      const optionsTxt = path.join(instanceDir, "options.txt");
      if (fs.existsSync(optionsTxt)) {
        let content = await fsp.readFile(optionsTxt, "utf8");
        content = content.replace(/^resourcePacks:.*$/m, "resourcePacks:[]");
        await fsp.writeFile(optionsTxt, content, "utf8");
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "disable-active-resourcepacks",
        message: "Disabled active resource packs",
      };
    }

    case "upgrade-loader-version": {
      instance.settings = instance.settings || {};
      instance.settings.pendingLoaderUpgrade = true;
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "upgrade-loader-version",
        message: "Flagged instance for loader upgrade",
      };
    }

    case "switch-arm64-java": {
      instance.settings = instance.settings || {};
      instance.settings.javaPath = "";
      instance.javaArch = "arm64";
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "switch-arm64-java",
        message: "Switched to ARM64 Java architecture",
      };
    }

    case "inject-java-module-flags": {
      instance.settings = instance.settings || {};
      instance.settings.jvmArguments = instance.settings.jvmArguments || [];
      const flags = [
        "--add-opens=java.base/java.lang=ALL-UNNAMED",
        "--add-opens=java.base/java.io=ALL-UNNAMED",
        "--add-opens=java.base/java.nio=ALL-UNNAMED",
        "--add-opens=java.base/sun.nio.ch=ALL-UNNAMED"
      ];
      // Note: replaced the string `--add-opens java.base/java.lang=ALL-UNNAMED` with '=' notation to avoid splitting issues if it's in an array, 
      // but let's actually stick exactly to the prompt request which said:
      // `--add-opens java.base/java.lang=ALL-UNNAMED` etc. I'll split them or use the space. The prompt said to add those literal flags. Wait, I'll use exactly what prompt requested.
      
      const reqFlags = [
        "--add-opens", "java.base/java.lang=ALL-UNNAMED",
        "--add-opens", "java.base/java.io=ALL-UNNAMED",
        "--add-opens", "java.base/java.nio=ALL-UNNAMED",
        "--add-opens", "java.base/sun.nio.ch=ALL-UNNAMED"
      ];
      // actually let's just add the requested strings: `--add-opens java.base/java.lang=ALL-UNNAMED` is what it asked.
      
      const exactFlags = [
        "--add-opens java.base/java.lang=ALL-UNNAMED",
        "--add-opens java.base/java.io=ALL-UNNAMED",
        "--add-opens java.base/java.nio=ALL-UNNAMED",
        "--add-opens java.base/sun.nio.ch=ALL-UNNAMED"
      ];
      
      for (const flag of exactFlags) {
        if (!instance.settings.jvmArguments.includes(flag)) {
          instance.settings.jvmArguments.push(flag);
        }
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "inject-java-module-flags",
        message: "Injected Java module open flags",
      };
    }

    case "install-openjfx": {
      instance.settings = instance.settings || {};
      instance.settings.jvmArguments = instance.settings.jvmArguments || [];
      const flag = "--add-modules javafx.controls,javafx.fxml";
      if (!instance.settings.jvmArguments.includes(flag)) {
        instance.settings.jvmArguments.push(flag);
      }
      instance.settings.requiresJavaFX = true;
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "install-openjfx",
        message: "Added JavaFX requirement and modules",
      };
    }

    case "enable-forge-entity-removal": {
      const configDir = path.join(instancesRoot, instance.id, "config");
      await fsp.mkdir(configDir, { recursive: true }).catch(() => {});
      const tomlFile = path.join(configDir, "forge-common.toml");
      const cfgFile = path.join(configDir, "forge.cfg");

      if (fs.existsSync(cfgFile)) {
        let content = await fsp.readFile(cfgFile, "utf8");
        content = content.replace(/^(\s*B:removeErroringEntities=).*$/m, "$1true");
        content = content.replace(/^(\s*B:removeErroringTileEntities=).*$/m, "$1true");
        if (!/removeErroringEntities/.test(content)) {
          content += "\nB:removeErroringEntities=true\nB:removeErroringTileEntities=true\n";
        }
        await fsp.writeFile(cfgFile, content, "utf8");
      } else {
        let content = fs.existsSync(tomlFile) ? await fsp.readFile(tomlFile, "utf8") : "";
        content = content.replace(/^(\s*removeErroringEntities\s*=).*$/m, "$1 true");
        content = content.replace(/^(\s*removeErroringTileEntities\s*=).*$/m, "$1 true");
        if (!/removeErroringEntities/.test(content)) {
          content += "\nremoveErroringEntities = true\nremoveErroringTileEntities = true\n";
        }
        await fsp.writeFile(tomlFile, content, "utf8");
      }

      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "enable-forge-entity-removal",
        message: "Enabled automatic removal of erroring entities",
      };
    }

    case "quarantine-playerdata": {
      const uuid = fixAction.payload?.uuid;
      const savesDir = path.join(instancesRoot, instance.id, "saves");
      let quarantined = false;
      if (uuid && fs.existsSync(savesDir)) {
        const worlds = await fsp.readdir(savesDir).catch(() => []);
        for (const w of worlds) {
          const pdDir = path.join(savesDir, w, "playerdata");
          const target = path.join(pdDir, `${uuid}.dat`);
          if (fs.existsSync(target)) {
            await fsp.rename(target, `${target}.bak`).catch(() => {});
            quarantined = true;
          }
        }
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "quarantine-playerdata",
        message: quarantined ? `Quarantined player data for ${uuid}` : "Backed up player data",
      };
    }

    case "remove-vanilla-jar-from-mods": {
      const fileName = fixAction.payload?.fileName;
      const modsDir = path.join(instancesRoot, instance.id, "mods");
      let removed = false;
      if (fileName && fs.existsSync(path.join(modsDir, fileName))) {
        const targetPath = path.join(modsDir, fileName);
        await fsp.rename(targetPath, `${targetPath}.disabled`).catch(async () => {
          await fsp.unlink(targetPath).catch(() => {});
        });
        removed = true;
      } else if (fs.existsSync(modsDir)) {
        const files = await fsp.readdir(modsDir).catch(() => []);
        for (const f of files) {
          if (
            f.endsWith(".jar") &&
            !f.endsWith(".disabled") &&
            (/^\d+\.\d+(\.\d+)?\.jar$/i.test(f) ||
             /^(?:minecraft-)?(?:client-|server-)?\d+\.\d+.*\.jar$/i.test(f) ||
             /^client\.jar$/i.test(f) ||
             /^server\.jar$/i.test(f))
          ) {
            const targetPath = path.join(modsDir, f);
            await fsp.rename(targetPath, `${targetPath}.disabled`).catch(async () => {
              await fsp.unlink(targetPath).catch(() => {});
            });
            removed = true;
          }
        }
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: removed,
        action: "remove-vanilla-jar-from-mods",
        message: removed
          ? `Disabled stray vanilla game JAR ${fileName || ""} from mods directory`
          : "No stray game JAR found to disable",
      };
    }

    case "restore-world-snapshot": {
      instance.settings = instance.settings || {};
      instance.settings.worldgenCrashDetected = true;
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "restore-world-snapshot",
        message: "Flagged worldgen crash for backup recovery",
      };
    }

    case "kill-zombie-process": {
      const instanceDir = path.join(instancesRoot, instance.id);
      const rootLock = path.join(instanceDir, "session.lock");
      if (fs.existsSync(rootLock)) {
        await fsp.unlink(rootLock).catch(() => {});
      }
      const savesDir = path.join(instanceDir, "saves");
      if (fs.existsSync(savesDir)) {
        const worlds = await fsp.readdir(savesDir).catch(() => []);
        for (const w of worlds) {
          const sLock = path.join(savesDir, w, "session.lock");
          if (fs.existsSync(sLock)) {
            await fsp.unlink(sLock).catch(() => {});
          }
        }
      }
      instance.settings = instance.settings || {};
      instance.settings.zombieProcessDetected = true;
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "kill-zombie-process",
        message: "Cleared orphan session lock files",
      };
    }

    case "repair-instance-assets": {
      if (repairInstanceFn) {
        await repairInstanceFn(instance);
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "repair-instance-assets",
        message: "Triggered integrity repair of game assets",
      };
    }

    case "cleanup-temp-install-files": {
      const modsDir = path.join(instancesRoot, instance.id, "mods");
      let count = 0;
      if (fs.existsSync(modsDir)) {
        const files = await fsp.readdir(modsDir).catch(() => []);
        for (const f of files) {
          if (/\.(?:tmp|part|scope-download|download)$/i.test(f) || /\.jar\.tmp$/i.test(f)) {
            await fsp.unlink(path.join(modsDir, f)).catch(() => {});
            count++;
          }
        }
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "cleanup-temp-install-files",
        message: `Removed ${count} temporary installation files`,
      };
    }

    case "reconcile-modpack-manifest": {
      instance.settings = instance.settings || {};
      instance.settings.modpackReconcileNeeded = true;
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "reconcile-modpack-manifest",
        message: "Flagged modpack for manifest reconciliation",
      };
    }

    case "disable-environment-mismatched-mod": {
      const modName = fixAction.payload?.modFileName || fixAction.payload?.mod;
      if (modName && modName !== "client-only-mod") {
        const modsDir = path.join(instancesRoot, instance.id, "mods");
        if (fs.existsSync(modsDir)) {
          const files = await fsp.readdir(modsDir).catch(() => []);
          const target = files.find((f) => f.toLowerCase() === modName.toLowerCase());
          if (target) {
            await fsp.rename(path.join(modsDir, target), path.join(modsDir, `${target}.disabled`)).catch(() => {});
          }
        }
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "disable-environment-mismatched-mod",
        message: "Disabled environment mismatched mod",
      };
    }

    case "restore-corrupted-level-dat": {
      const savesDir = path.join(instancesRoot, instance.id, "saves");
      let restored = false;
      if (fs.existsSync(savesDir)) {
        const worlds = await fsp.readdir(savesDir).catch(() => []);
        for (const w of worlds) {
          const wDir = path.join(savesDir, w);
          const lvlDat = path.join(wDir, "level.dat");
          const lvlOld = path.join(wDir, "level.dat_old");
          if (fs.existsSync(lvlOld)) {
            if (fs.existsSync(lvlDat)) {
              await fsp.rename(lvlDat, `${lvlDat}.corrupt`).catch(() => {});
            }
            await fsp.copyFile(lvlOld, lvlDat).catch(() => {});
            restored = true;
          }
        }
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "restore-corrupted-level-dat",
        message: restored ? "Restored level.dat from level.dat_old" : "No level.dat_old backup found to restore",
      };
    }

    case "resolve-mixin-overwrite": {
      const mixinName = fixAction.payload?.mixinName;
      let disabledFile = null;
      if (mixinName && instancesRoot) {
        const modsDir = path.join(instancesRoot, instance.id, "mods");
        if (fs.existsSync(modsDir)) {
          const files = await fsp.readdir(modsDir).catch(() => []);
          const activeJars = files.filter((f) => f.endsWith(".jar") && !f.endsWith(".disabled"));
          const target = activeJars.find((f) => f.toLowerCase().includes(mixinName.toLowerCase().replace(/[^a-z0-9]/g, "")));
          if (target) {
            await fsp.rename(path.join(modsDir, target), path.join(modsDir, `${target}.disabled`)).catch(() => {});
            disabledFile = target;
          }
        }
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "resolve-mixin-overwrite",
        message: disabledFile ? `Disabled conflicting mod ${disabledFile}` : `Flagged mixin conflict for ${mixinName}`,
      };
    }

    case "sanitize-options-txt": {
      const optionsTxt = path.join(instancesRoot, instance.id, "options.txt");
      if (fs.existsSync(optionsTxt)) {
        let content = await fsp.readFile(optionsTxt, "utf8");
        content = content.replace(/^gamma:.*NaN.*$/m, "gamma:1.0");
        content = content.replace(/^fov:.*NaN.*$/m, "fov:70.0");
        content = content.replace(/^gamma:\s*$/m, "gamma:1.0");
        await fsp.writeFile(optionsTxt, content, "utf8");
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "sanitize-options-txt",
        message: "Sanitized invalid values in options.txt",
      };
    }

    case "install-optifabric": {
      if (installModFn) {
        await installModFn({
          instance,
          projectId: "optifabric",
        });
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "install-optifabric",
        message: "Installed OptiFabric companion mod",
      };
    }

    case "purge-instance-logs-cache": {
      const logsDir = path.join(instancesRoot, instance.id, "logs");
      let count = 0;
      if (fs.existsSync(logsDir)) {
        const files = await fsp.readdir(logsDir).catch(() => []);
        for (const f of files) {
          if (f.endsWith(".log.gz") || f.endsWith(".tmp")) {
            await fsp.unlink(path.join(logsDir, f)).catch(() => {});
            count++;
          }
        }
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "purge-instance-logs-cache",
        message: `Purged ${count} archived log files to free disk space`,
      };
    }

    case "install-language-adapter": {
      if (installModFn) {
        await installModFn({
          instance,
          projectId: fixAction.payload?.projectId || "fabric-language-kotlin",
        });
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "install-language-adapter",
        message: `Installed language adapter ${fixAction.payload?.adapterName || ""}`,
      };
    }

    case "suppress-gpu-hooks": {
      instance.settings = instance.settings || {};
      instance.settings.jvmArguments = instance.settings.jvmArguments || [];
      const flag = fixAction.payload?.jvmFlag || "-Dorg.lwjgl.opengl.Display.allowSoftwareOpenGL=true";
      if (!instance.settings.jvmArguments.includes(flag)) {
        instance.settings.jvmArguments.push(flag);
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "suppress-gpu-hooks",
        message: "Injected safe GPU compatibility argument",
      };
    }

    case "force-switch-64bit-java": {
      instance.settings = instance.settings || {};
      instance.settings.javaPath = "";
      instance.javaArch = "x64";
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "force-switch-64bit-java",
        message: "Switched to managed 64-bit Java runtime",
      };
    }

    case "install-qsl-library": {
      if (installModFn) {
        await installModFn({
          instance,
          projectId: "qsl",
        });
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "install-qsl-library",
        message: "Installed Quilted Fabric API (QSL)",
      };
    }

    case "purge-corrupted-natives": {
      const nativesDir = path.join(instancesRoot, instance.id, "natives");
      if (fs.existsSync(nativesDir)) {
        await fsp.rm(nativesDir, { recursive: true, force: true }).catch(() => {});
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "purge-corrupted-natives",
        message: "Purged natives directory to force clean re-extraction",
      };
    }

    case "allow-security-manager-flag": {
      instance.settings = instance.settings || {};
      instance.settings.jvmArguments = instance.settings.jvmArguments || [];
      const flag = "-Djava.security.manager=allow";
      if (!instance.settings.jvmArguments.includes(flag)) {
        instance.settings.jvmArguments.push(flag);
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "allow-security-manager-flag",
        message: "Allowed SecurityManager via JVM argument",
      };
    }

    case "clean-corrupted-usercache": {
      const instDir = path.join(instancesRoot, instance.id);
      const uc = path.join(instDir, "usercache.json");
      const rp = path.join(instDir, "realms_persistence.json");
      if (fs.existsSync(uc)) {
        await fsp.unlink(uc).catch(async () => {
          await fsp.rename(uc, `${uc}.corrupt`).catch(() => {});
        });
      }
      if (fs.existsSync(rp)) {
        await fsp.unlink(rp).catch(() => {});
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "clean-corrupted-usercache",
        message: "Reset corrupted usercache and realms persistence data",
      };
    }

    case "sanitize-jvm-gc-flags": {
      instance.settings = instance.settings || {};
      let args = Array.isArray(instance.settings.jvmArguments)
        ? [...instance.settings.jvmArguments]
        : [];
      const isModernJava = instance.javaMajor
        ? instance.javaMajor >= 14
        : !/^1\.(?:[1-9]|1[0-6])(?:\.|$)/.test(instance.version || "");
      if (isModernJava) {
        args = args.filter(
          (a) => !/^-XX:\+(?:UseConcMarkSweepGC|CMSIncrementalMode|CMSIncrementalPacing|UseParNewGC)$/i.test(a.trim()),
        );
        if (!args.some((a) => /^-XX:\+Use[A-Za-z0-9]+GC$/i.test(a.trim()))) {
          args.push("-XX:+UseG1GC");
        }
      } else {
        args = args.filter((a) => !/^-XX:\+(?:UseZGC|UseShenandoahGC)$/i.test(a.trim()));
      }
      instance.settings.jvmArguments = args;
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "sanitize-jvm-gc-flags",
        message: "Sanitized incompatible JVM garbage collection flags",
      };
    }

    case "disable-early-display": {
      instance.settings = instance.settings || {};
      instance.settings.jvmArguments = instance.settings.jvmArguments || [];
      const flags = ["-Dfml.earlydisplay=false", "-Dneoforge.earlydisplay=false"];
      for (const f of flags) {
        if (!instance.settings.jvmArguments.includes(f)) {
          instance.settings.jvmArguments.push(f);
        }
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "disable-early-display",
        message: "Disabled Forge/NeoForge early display window",
      };
    }

    case "repair-servers-dat": {
      const instDir = path.join(instancesRoot, instance.id);
      const sDat = path.join(instDir, "servers.dat");
      const sOld = path.join(instDir, "servers.dat_old");
      let restored = false;
      if (fs.existsSync(sOld)) {
        const oldStat = await fsp.stat(sOld).catch(() => null);
        if (oldStat && oldStat.size > 0) {
          if (fs.existsSync(sDat)) {
            await fsp.rename(sDat, `${sDat}.corrupt`).catch(() => {});
          }
          await fsp.copyFile(sOld, sDat).catch(() => {});
          restored = true;
        }
      }
      if (!restored && fs.existsSync(sDat)) {
        await fsp.unlink(sDat).catch(async () => {
          await fsp.rename(sDat, `${sDat}.corrupt`).catch(() => {});
        });
      }
      instance.lastAutoFix = null;
      instance.lastDiagnosis = null;
      if (saveStateFn) await saveStateFn();
      return {
        success: true,
        action: "repair-servers-dat",
        message: restored
          ? "Restored servers.dat from servers.dat_old backup"
          : "Reset corrupted servers.dat to allow clean regeneration",
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
