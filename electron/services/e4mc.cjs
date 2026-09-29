"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const { fetchJson, downloadFile } = require("./network.cjs");

function isLoaderSupported(loader) {
  const norm = String(loader || "").toLowerCase();
  return ["fabric", "forge", "neoforge", "quilt"].some((l) => norm.includes(l));
}

function resolveLoaderKey(loader) {
  const norm = String(loader || "").toLowerCase();
  if (norm.includes("quilt")) return "quilt";
  if (norm.includes("neoforge")) return "neoforge";
  if (norm.includes("forge")) return "forge";
  if (norm.includes("fabric")) return "fabric";
  return null;
}

async function checkE4mcStatus(instance, instancesRoot) {
  if (!instance) {
    return { installed: false, supported: false, loader: "", version: "", jarName: null };
  }
  const supported = isLoaderSupported(instance.loader);
  const instanceDir = path.join(instancesRoot, instance.id);
  const modsDir = path.join(instanceDir, "mods");

  let installedJar = null;
  try {
    const files = await fsp.readdir(modsDir);
    installedJar = files.find((f) => /^e4mc.*\.jar$/i.test(f)) || null;
  } catch {
    installedJar = null;
  }

  return {
    installed: Boolean(installedJar),
    supported,
    loader: instance.loader || "Vanilla",
    version: instance.version || "1.21",
    jarName: installedJar,
  };
}

async function ensureFabricApi({ gameVersion, modsDir, signal }) {
  try {
    const existing = await fsp.readdir(modsDir).catch(() => []);
    const hasFabricApi = existing.some((f) => /^fabric-api.*\.jar$/i.test(f));
    if (hasFabricApi) return;

    console.log(`[e4mc] fabric-api missing for Fabric ${gameVersion}, auto-downloading from Modrinth...`);
    const url = `https://api.modrinth.com/v2/project/fabric-api/version?loaders=${encodeURIComponent(
      JSON.stringify(["fabric", "quilt"])
    )}&game_versions=${encodeURIComponent(JSON.stringify([gameVersion]))}`;

    let versions = await fetchJson(url, { signal });
    if (!Array.isArray(versions) || versions.length === 0) {
      const allUrl = `https://api.modrinth.com/v2/project/fabric-api/version?loaders=${encodeURIComponent(
        JSON.stringify(["fabric"])
      )}`;
      versions = await fetchJson(allUrl, { signal });
    }

    if (Array.isArray(versions) && versions.length > 0) {
      const best = versions[0];
      const file = best.files?.find((f) => f.primary) || best.files?.[0];
      if (file && file.url) {
        const dest = path.join(modsDir, file.filename);
        await downloadFile({
          url: file.url,
          destination: dest,
          sha1: file.hashes?.sha1,
          size: file.size,
          signal,
        });
        console.log(`[e4mc] Successfully installed dependency: ${file.filename}`);
      }
    }
  } catch (err) {
    console.warn("[e4mc] Failed to auto-install fabric-api dependency:", err.message);
  }
}

async function installE4mc({ instance, instancesRoot, signal, onProgress }) {
  const supported = isLoaderSupported(instance.loader);
  if (!supported) {
    throw new Error(
      "Для мода e4mc требуется Fabric, Forge, NeoForge или Quilt."
    );
  }
  const loaderKey = resolveLoaderKey(instance.loader) || "fabric";
  const instanceDir = path.join(instancesRoot, instance.id);
  const modsDir = path.join(instanceDir, "mods");
  await fsp.mkdir(modsDir, { recursive: true });

  // 1. Try exact match for loader + game version
  let versions = [];
  try {
    const url = `https://api.modrinth.com/v2/project/e4mc/version?loaders=${encodeURIComponent(
      JSON.stringify([loaderKey])
    )}&game_versions=${encodeURIComponent(JSON.stringify([instance.version]))}`;
    versions = await fetchJson(url, { signal });
  } catch (err) {
    console.warn("[e4mc] Direct version lookup failed, will fallback:", err.message);
  }

  // 2. Fallback to any loader release
  if (!Array.isArray(versions) || versions.length === 0) {
    try {
      const url = `https://api.modrinth.com/v2/project/e4mc/version?loaders=${encodeURIComponent(
        JSON.stringify([loaderKey])
      )}`;
      const allVersions = await fetchJson(url, { signal });
      if (Array.isArray(allVersions)) {
        versions = allVersions;
      }
    } catch {
      versions = [];
    }
  }

  if (!versions || versions.length === 0) {
    throw new Error(`Не найден подходящий билд e4mc для ${instance.loader} ${instance.version}`);
  }

  const bestVersion = versions[0];
  const primaryFile = bestVersion.files?.find((f) => f.primary) || bestVersion.files?.[0];
  if (!primaryFile || !primaryFile.url) {
    throw new Error("Не удалось получить ссылку на скачивание e4mc");
  }

  // Remove existing older e4mc jars
  try {
    const existing = await fsp.readdir(modsDir);
    for (const file of existing) {
      if (/^e4mc.*\.jar(?:\.disabled)?$/i.test(file)) {
        await fsp.unlink(path.join(modsDir, file)).catch(() => {});
      }
    }
  } catch { /**/ }

  const destFile = path.join(modsDir, primaryFile.filename);
  await downloadFile({
    url: primaryFile.url,
    destination: destFile,
    sha1: primaryFile.hashes?.sha1,
    size: primaryFile.size,
    onProgress,
    signal,
  });

  // Automatically install fabric-api dependency for Fabric/Quilt if missing
  if (loaderKey === "fabric" || loaderKey === "quilt") {
    await ensureFabricApi({ gameVersion: instance.version, modsDir, signal });
  }

  return {
    installed: true,
    jarName: primaryFile.filename,
    versionNumber: bestVersion.version_number,
  };
}

async function convertVanillaToFabricAndInstallE4mc({ instance, instancesRoot, signal, onProgress }) {
  let loaderVersion = null;
  try {
    const loaders = await fetchJson(
      `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(instance.version)}`,
      { signal }
    );
    loaderVersion =
      loaders?.find?.((entry) => entry.loader?.stable)?.loader?.version ||
      loaders?.[0]?.loader?.version ||
      null;
  } catch {
    loaderVersion = null;
  }

  instance.loader = "Fabric";
  if (loaderVersion) {
    instance.loaderVersion = loaderVersion;
  }

  const installRes = await installE4mc({ instance, instancesRoot, signal, onProgress });

  return {
    success: true,
    loader: "Fabric",
    loaderVersion: instance.loaderVersion || null,
    jarName: installRes.jarName,
  };
}

module.exports = {
  isLoaderSupported,
  checkE4mcStatus,
  installE4mc,
  convertVanillaToFabricAndInstallE4mc,
};
