const fsp = require("node:fs/promises");
const path = require("node:path");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LOG_RETENTION_MS = 7 * DAY_MS;
const PARTIAL_RETENTION_MS = HOUR_MS;

const CATEGORY_ORDER = [
  "worlds",
  "mods",
  "resourcepacks",
  "shaderpacks",
  "config",
  "screenshots",
  "recordings",
  "logs",
  "runtime",
  "metadata",
  "other",
];

const TOP_LEVEL_CATEGORIES = new Map([
  ["saves", "worlds"],
  ["mods", "mods"],
  ["resourcepacks", "resourcepacks"],
  ["shaderpacks", "shaderpacks"],
  ["config", "config"],
  ["defaultconfigs", "config"],
  ["kubejs", "config"],
  ["screenshots", "screenshots"],
  ["replay_recordings", "recordings"],
  ["recordings", "recordings"],
  ["logs", "logs"],
  ["crash-reports", "logs"],
  ["versions", "runtime"],
  ["libraries", "runtime"],
  ["assets", "runtime"],
  ["natives", "runtime"],
  [".scope", "metadata"],
  [".onyx", "metadata"],
]);

function instanceDirectory(instancesRoot, instanceId) {
  const root = path.resolve(instancesRoot);
  const id = String(instanceId || "");
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(id)) {
    throw new Error("Invalid instance ID");
  }
  const directory = path.resolve(root, id);
  if (!directory.startsWith(`${root}${path.sep}`)) {
    throw new Error("Unsafe instance path");
  }
  return directory;
}

function categoryFor(relativePath) {
  const topLevel = relativePath.split(/[\\/]/, 1)[0].toLowerCase();
  return TOP_LEVEL_CATEGORIES.get(topLevel) || "other";
}

function emptyCategories() {
  return Object.fromEntries(
    CATEGORY_ORDER.map((id) => [
      id,
      { id, bytes: 0, files: 0, directories: 0 },
    ]),
  );
}

async function scanInstance({ instancesRoot, instanceId }) {
  const root = instanceDirectory(instancesRoot, instanceId);
  const categories = emptyCategories();
  const records = [];
  const pending = [{ absolute: root, relative: "" }];
  let inaccessible = 0;
  let totalDirectories = 0;

  while (pending.length) {
    const current = pending.pop();
    let entries;
    try {
      entries = await fsp.readdir(current.absolute, {
        withFileTypes: true,
      });
    } catch (error) {
      if (error?.code !== "ENOENT") inaccessible += 1;
      continue;
    }

    const fileEntries = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const relative = current.relative
        ? path.join(current.relative, entry.name)
        : entry.name;
      const absolute = path.join(current.absolute, entry.name);
      if (entry.isDirectory()) {
        totalDirectories += 1;
        categories[categoryFor(relative)].directories += 1;
        pending.push({ absolute, relative });
      } else if (entry.isFile()) {
        fileEntries.push({ absolute, relative, name: entry.name });
      }
    }

    const stats = await Promise.all(
      fileEntries.map(async (entry) => ({
        ...entry,
        stat: await fsp.stat(entry.absolute).catch(() => null),
      })),
    );
    for (const record of stats) {
      if (!record.stat?.isFile()) {
        inaccessible += 1;
        continue;
      }
      const category = categoryFor(record.relative);
      categories[category].bytes += record.stat.size;
      categories[category].files += 1;
      records.push({
        absolute: record.absolute,
        relative: record.relative,
        name: record.name,
        category,
        size: record.stat.size,
        mtimeMs: record.stat.mtimeMs,
      });
    }
  }

  return {
    root,
    records,
    categories,
    inaccessible,
    totalDirectories,
  };
}

function cleanupCandidates(records, currentTime) {
  const candidates = new Map();
  const add = (record, group) => {
    candidates.set(record.absolute, { ...record, group });
  };

  for (const record of records) {
    const age = currentTime - record.mtimeMs;
    if (
      age >= PARTIAL_RETENTION_MS &&
      /\.(?:part|download)$/i.test(record.name)
    ) {
      add(record, "partial");
      continue;
    }
    if (
      age >= PARTIAL_RETENTION_MS &&
      [".scope", ".onyx"].includes(record.relative.split(/[\\/]/)[0].toLowerCase()) &&
      /(?:\.tmp(?:-|$)|\.partial$)/i.test(record.name)
    ) {
      add(record, "partial");
    }
  }

  const retainNewest = (items, retain, group) => {
    items
      .slice()
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(retain)
      .filter((record) => currentTime - record.mtimeMs >= LOG_RETENTION_MS)
      .forEach((record) => add(record, group));
  };
  retainNewest(
    records.filter(
      (record) =>
        record.relative.split(/[\\/]/)[0].toLowerCase() === "logs",
    ),
    3,
    "logs",
  );
  retainNewest(
    records.filter(
      (record) =>
        record.relative.split(/[\\/]/)[0].toLowerCase() ===
        "crash-reports",
    ),
    3,
    "crashReports",
  );
  retainNewest(
    records.filter(
      (record) =>
        !record.relative.includes(path.sep) &&
        /^hs_err_pid\d+\.log$/i.test(record.name),
    ),
    2,
    "crashReports",
  );

  return [...candidates.values()];
}

function summarizeScan(scan, candidates, generatedAt) {
  const cleanableGroups = {
    logs: { bytes: 0, files: 0 },
    crashReports: { bytes: 0, files: 0 },
    partial: { bytes: 0, files: 0 },
  };
  for (const candidate of candidates) {
    cleanableGroups[candidate.group].bytes += candidate.size;
    cleanableGroups[candidate.group].files += 1;
  }
  const categories = CATEGORY_ORDER.map((id) => scan.categories[id]).filter(
    (category) =>
      category.bytes > 0 ||
      category.files > 0 ||
      category.directories > 0,
  );
  return {
    generatedAt,
    totalBytes: categories.reduce(
      (total, category) => total + category.bytes,
      0,
    ),
    totalFiles: categories.reduce(
      (total, category) => total + category.files,
      0,
    ),
    totalDirectories: scan.totalDirectories,
    inaccessible: scan.inaccessible,
    categories,
    cleanable: {
      bytes: candidates.reduce((total, candidate) => total + candidate.size, 0),
      files: candidates.length,
      groups: cleanableGroups,
    },
  };
}

async function analyzeInstanceStorage({
  instancesRoot,
  instanceId,
  now = () => new Date(),
}) {
  const scan = await scanInstance({ instancesRoot, instanceId });
  const current = now();
  const candidates = cleanupCandidates(scan.records, current.getTime());
  return summarizeScan(scan, candidates, current.toISOString());
}

async function cleanupInstanceStorage({
  instancesRoot,
  instanceId,
  now = () => new Date(),
  removeFile = (filePath) => fsp.rm(filePath, { force: true }),
}) {
  const scan = await scanInstance({ instancesRoot, instanceId });
  const current = now();
  const candidates = cleanupCandidates(scan.records, current.getTime());
  let removedBytes = 0;
  let removedFiles = 0;
  const failed = [];

  for (const candidate of candidates) {
    try {
      await removeFile(candidate.absolute);
      removedBytes += candidate.size;
      removedFiles += 1;
    } catch {
      failed.push(candidate.relative);
    }
  }

  const report = await analyzeInstanceStorage({
    instancesRoot,
    instanceId,
    now,
  });
  return {
    removedBytes,
    removedFiles,
    failed: failed.length,
    report,
  };
}

module.exports = {
  analyzeInstanceStorage,
  cleanupCandidates,
  cleanupInstanceStorage,
};
