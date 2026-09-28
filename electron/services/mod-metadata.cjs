const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const StreamZip = require("node-stream-zip");

const METADATA_LIMIT = 256 * 1024;
const DESCRIPTOR_NAMES = [
  "fabric.mod.json",
  "quilt.mod.json",
  "META-INF/mods.toml",
  "META-INF/neoforge.mods.toml",
];

function validModId(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{0,63}$/.test(id) ? id : null;
}

function parseTomlModIds(content) {
  const ids = [];
  const pattern = /^\s*modId\s*=\s*["']([^"']+)["']/gim;
  for (const match of String(content || "").matchAll(pattern)) {
    const id = validModId(match[1]);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function parseModDescriptor(name, content) {
  try {
    if (name === "fabric.mod.json") {
      const value = JSON.parse(content);
      const id = validModId(value.id);
      return {
        loader: "fabric",
        ids: id ? [id] : [],
        name: String(value.name || id || ""),
        version: String(value.version || ""),
      };
    }
    if (name === "quilt.mod.json") {
      const value = JSON.parse(content);
      const loader = value.quilt_loader || {};
      const id = validModId(loader.id);
      return {
        loader: "quilt",
        ids: id ? [id] : [],
        name: String(loader.metadata?.name || id || ""),
        version: String(loader.version || ""),
      };
    }
    if (
      name === "META-INF/mods.toml" ||
      name === "META-INF/neoforge.mods.toml"
    ) {
      return {
        loader:
          name === "META-INF/neoforge.mods.toml" ? "neoforge" : "forge",
        ids: parseTomlModIds(content),
        name: "",
        version: "",
      };
    }
  } catch {
    return { loader: "unknown", ids: [], name: "", version: "" };
  }
  return { loader: "unknown", ids: [], name: "", version: "" };
}

async function inspectModJar(filePath) {
  const zip = new StreamZip.async({ file: filePath });
  try {
    const entries = await zip.entries();
    const byNormalizedName = new Map(
      Object.values(entries).map((entry) => [
        entry.name.replaceAll("\\", "/").toLowerCase(),
        entry,
      ]),
    );
    for (const descriptorName of DESCRIPTOR_NAMES) {
      const entry = byNormalizedName.get(descriptorName.toLowerCase());
      if (!entry || entry.isDirectory || entry.size > METADATA_LIMIT) continue;
      const data = await zip.entryData(entry.name);
      return parseModDescriptor(descriptorName, data.toString("utf8"));
    }
    return { loader: "unknown", ids: [], name: "", version: "" };
  } finally {
    await zip.close();
  }
}

function duplicateModIds(mods) {
  const owners = new Map();
  for (const mod of mods) {
    for (const id of mod.ids || []) {
      if (!owners.has(id)) owners.set(id, []);
      owners.get(id).push(mod.file);
    }
  }
  return [...owners.entries()]
    .filter(([, files]) => new Set(files).size > 1)
    .map(([id, files]) => ({
      id,
      files: [...new Set(files)].sort((left, right) =>
        left.localeCompare(right),
      ),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function readCache(cachePath) {
  try {
    const value = JSON.parse(await fsp.readFile(cachePath, "utf8"));
    return value?.schema === 1 && Array.isArray(value.mods) ? value.mods : [];
  } catch {
    return [];
  }
}

async function writeCache(cachePath, mods) {
  await fsp.mkdir(path.dirname(cachePath), { recursive: true });
  const staging = `${cachePath}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(
    staging,
    JSON.stringify({ schema: 1, mods }, null, 2),
    "utf8",
  );
  await fsp.rm(cachePath, { force: true }).catch(() => undefined);
  await fsp.rename(staging, cachePath);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await mapper(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function scanInstanceMods(instanceDirectory) {
  const modsDirectory = path.join(instanceDirectory, "mods");
  const entries = await fsp
    .readdir(modsDirectory, { withFileTypes: true })
    .catch(() => []);
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /\.jar$/i.test(entry.name))
      .map(async (entry) => {
        const filePath = path.join(modsDirectory, entry.name);
        const stats = await fsp.stat(filePath);
        return {
          file: entry.name,
          filePath,
          size: stats.size,
          modifiedAt: Math.trunc(stats.mtimeMs),
        };
      }),
  );
  const cachePath = path.join(
    instanceDirectory,
    ".onyx",
    "guard",
    "mod-metadata-cache.json",
  );
  const cachedMods = await readCache(cachePath);
  const cache = new Map(cachedMods.map((mod) => [mod.file, mod]));
  let unreadableCount = 0;
  const mods = await mapWithConcurrency(candidates, 6, async (candidate) => {
    const cached = cache.get(candidate.file);
    if (
      cached?.size === candidate.size &&
      cached?.modifiedAt === candidate.modifiedAt &&
      Array.isArray(cached.ids)
    ) {
      return cached;
    }
    try {
      const metadata = await inspectModJar(candidate.filePath);
      return {
        file: candidate.file,
        size: candidate.size,
        modifiedAt: candidate.modifiedAt,
        ...metadata,
      };
    } catch {
      unreadableCount += 1;
      return {
        file: candidate.file,
        size: candidate.size,
        modifiedAt: candidate.modifiedAt,
        loader: "unknown",
        ids: [],
        name: "",
        version: "",
        unreadable: true,
      };
    }
  });
  await writeCache(cachePath, mods).catch(() => undefined);
  return {
    scannedCount: mods.length,
    recognizedCount: mods.filter((mod) => mod.ids.length > 0).length,
    unreadableCount: mods.filter((mod) => Boolean(mod.unreadable)).length,
    duplicates: duplicateModIds(mods),
    mods,
  };
}

module.exports = {
  DESCRIPTOR_NAMES,
  duplicateModIds,
  inspectModJar,
  parseModDescriptor,
  parseTomlModIds,
  scanInstanceMods,
  validModId,
};
