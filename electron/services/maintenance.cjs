const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { ZipArchive } = require("archiver");
const { readZipJson, extractZip } = require("./archive.cjs");

const BACKUP_FORMAT_VERSION = 1;

function safeChild(root, child) {
  const rootPath = path.resolve(root);
  const destination = path.resolve(rootPath, child);
  if (
    destination === rootPath ||
    !destination.startsWith(`${rootPath}${path.sep}`)
  ) {
    throw new Error("Unsafe instance path");
  }
  return destination;
}

async function directoryStats(root) {
  let bytes = 0;
  let files = 0;
  let directories = 0;
  const pending = [path.resolve(root)];

  while (pending.length) {
    const current = pending.pop();
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        directories += 1;
        pending.push(candidate);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = await fsp.stat(candidate);
        bytes += stat.size;
        files += 1;
      } catch {
        // A concurrently changing cache entry is safe to skip.
      }
    }
  }

  return { bytes, files, directories };
}

function backupManifest(instance) {
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    launcher: "onyx",
    exportedAt: new Date().toISOString(),
    instance: {
      name: instance.name,
      version: instance.version,
      loader: instance.loader,
      description: instance.description,
      color: instance.color,
      glyph: instance.glyph,
      iconUrl: instance.iconUrl || null,
      sourceProjectId: instance.sourceProjectId,
      sourceVersionId: instance.sourceVersionId,
      packVersion: instance.packVersion,
      installProfile: instance.installProfile,
      settings: instance.settings,
    },
  };
}

async function createInstanceBackup({
  instance,
  instancesRoot,
  destination,
  onProgress,
}) {
  const source = safeChild(instancesRoot, instance.id);
  const stat = await fsp.stat(source).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error("The instance folder has not been created yet");
  }
  const totals = await directoryStats(source);
  await fsp.mkdir(path.dirname(destination), { recursive: true });

  const temporary = `${destination}.part`;
  await fsp.rm(temporary, { force: true }).catch(() => undefined);

  try {
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(temporary);
      const archive = new ZipArchive({ zlib: { level: 6 } });
      output.on("close", resolve);
      output.on("error", reject);
      archive.on("warning", (error) => {
        if (error.code !== "ENOENT") reject(error);
      });
      archive.on("error", reject);
      archive.on("progress", (progress) => {
        const processed = Number(progress.fs.processedBytes || 0);
        onProgress?.({
          processed,
          total: totals.bytes,
          progress: totals.bytes
            ? Math.min(99, Math.round((processed / totals.bytes) * 100))
            : 50,
        });
      });
      archive.pipe(output);
      archive.append(JSON.stringify(backupManifest(instance), null, 2), {
        name: "onyx-instance.json",
      });
      archive.directory(source, "game");
      void archive.finalize();
    });
    await fsp.rm(destination, { force: true }).catch(() => undefined);
    await fsp.rename(temporary, destination);
    const result = await fsp.stat(destination);
    onProgress?.({
      processed: totals.bytes,
      total: totals.bytes,
      progress: 100,
    });
    return {
      path: destination,
      bytes: result.size,
      sourceBytes: totals.bytes,
      files: totals.files,
    };
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function cleanImportedInstance(manifest, instanceId) {
  const source = manifest?.instance || {};
  const name = String(source.name || "Imported instance").slice(0, 48);
  const sourceSettings =
    source.settings && typeof source.settings === "object"
      ? source.settings
      : {};
  const importedSettings = {
    memory: Number.isFinite(sourceSettings.memory)
      ? Math.max(2, Math.min(64, Math.round(sourceSettings.memory)))
      : undefined,
    windowWidth: Number.isFinite(sourceSettings.windowWidth)
      ? Math.max(640, Math.min(7680, Math.round(sourceSettings.windowWidth)))
      : undefined,
    windowHeight: Number.isFinite(sourceSettings.windowHeight)
      ? Math.max(480, Math.min(4320, Math.round(sourceSettings.windowHeight)))
      : undefined,
    fullscreen:
      typeof sourceSettings.fullscreen === "boolean"
        ? sourceSettings.fullscreen
        : undefined,
    jvmArguments: Array.isArray(sourceSettings.jvmArguments)
      ? sourceSettings.jvmArguments
          .filter((argument) => typeof argument === "string")
          .map((argument) => argument.trim().slice(0, 180))
          .filter(Boolean)
          .slice(0, 24)
      : undefined,
  };
  return {
    id: instanceId,
    name,
    version: String(source.version || "1.21.1"),
    loader: String(source.loader || "Vanilla"),
    description: String(
      source.description || "Instance restored from a Scope backup",
    ).slice(0, 180),
    color: ["lime", "amber", "violet", "cyan", "rose"].includes(source.color)
      ? source.color
      : "violet",
    glyph: String(source.glyph || name.slice(0, 2)).slice(0, 2).toUpperCase(),
    iconUrl:
      typeof source.iconUrl === "string" && /^https:\/\//i.test(source.iconUrl)
        ? source.iconUrl
        : null,
    sourceProjectId: source.sourceProjectId,
    sourceVersionId: source.sourceVersionId,
    packVersion: source.packVersion,
    installProfile: source.installProfile,
    settings: importedSettings,
    favorite: false,
    status: "setup",
    lastPlayed: "Never played",
    playtimeMinutes: 0,
    modCount: 0,
    importedAt: new Date().toISOString(),
  };
}

async function importInstanceBackup({
  backupPath,
  instancesRoot,
  instanceId = crypto.randomUUID(),
  onProgress,
}) {
  const manifest = await readZipJson(backupPath, "onyx-instance.json");
  if (
    (manifest?.launcher !== "onyx" && manifest?.launcher !== "scope") ||
    manifest?.formatVersion !== BACKUP_FORMAT_VERSION
  ) {
    throw new Error("This is not a supported Scope backup");
  }

  const destination = safeChild(instancesRoot, instanceId);
  await fsp.mkdir(destination, { recursive: true });
  try {
    await extractZip(backupPath, destination, {
      mapPath: (entryName) => {
        const normalized = entryName.replaceAll("\\", "/");
        if (!normalized.startsWith("game/")) return null;
        const relative = normalized.slice("game/".length);
        return relative || null;
      },
      onProgress: ({ extracted, count, current }) =>
        onProgress?.({
          progress: Math.round((extracted / Math.max(count, 1)) * 100),
          current,
          extracted,
          count,
        }),
    });
    return cleanImportedInstance(manifest, instanceId);
  } catch (error) {
    await fsp.rm(destination, { recursive: true, force: true }).catch(
      () => undefined,
    );
    throw error;
  }
}

async function removePartialFiles(root) {
  let bytes = 0;
  let files = 0;
  const pending = [path.resolve(root)];
  while (pending.length) {
    const current = pending.pop();
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        pending.push(candidate);
      } else if (entry.isFile() && entry.name.endsWith(".part")) {
        const stat = await fsp.stat(candidate).catch(() => null);
        await fsp.rm(candidate, { force: true }).catch(() => undefined);
        bytes += stat?.size || 0;
        files += 1;
      }
    }
  }
  return { bytes, files };
}

module.exports = {
  BACKUP_FORMAT_VERSION,
  safeChild,
  directoryStats,
  backupManifest,
  cleanImportedInstance,
  createInstanceBackup,
  importInstanceBackup,
  removePartialFiles,
};
