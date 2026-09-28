const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function guardRoot(instanceDirectory) {
  const scopeDir = path.join(instanceDirectory, ".scope", "guard");
  const onyxDir = path.join(instanceDirectory, ".onyx", "guard");
  return fs.existsSync(onyxDir) && !fs.existsSync(scopeDir) ? onyxDir : scopeDir;
}

function baselinePath(instanceDirectory) {
  return path.join(guardRoot(instanceDirectory), "mods-baseline.json");
}

function safeModName(value) {
  const name = String(value || "");
  if (
    !name ||
    name !== path.basename(name) ||
    !/\.jar$/i.test(name) ||
    name.endsWith(".disabled")
  ) {
    throw new Error("Invalid mod filename");
  }
  return name;
}

async function snapshotMods(instanceDirectory) {
  const modsDirectory = path.join(instanceDirectory, "mods");
  const entries = await fsp
    .readdir(modsDirectory, { withFileTypes: true })
    .catch(() => []);
  const mods = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /\.jar$/i.test(entry.name))
      .map(async (entry) => {
        const stats = await fsp.stat(path.join(modsDirectory, entry.name));
        return {
          name: entry.name,
          size: stats.size,
          modifiedAt: Math.trunc(stats.mtimeMs),
        };
      }),
  );
  return mods.sort((left, right) => left.name.localeCompare(right.name));
}

async function readModBaseline(instanceDirectory) {
  try {
    const value = JSON.parse(
      await fsp.readFile(baselinePath(instanceDirectory), "utf8"),
    );
    if (value?.schema !== 1 || !Array.isArray(value.mods)) return null;
    return {
      createdAt: value.createdAt,
      mods: value.mods
        .filter(
          (item) =>
            item &&
            typeof item.name === "string" &&
            Number.isFinite(item.size) &&
            Number.isFinite(item.modifiedAt),
        )
        .map((item) => ({
          name: safeModName(item.name),
          size: item.size,
          modifiedAt: item.modifiedAt,
        })),
    };
  } catch {
    return null;
  }
}

async function writeModBaseline(instanceDirectory, mods) {
  const directory = guardRoot(instanceDirectory);
  await fsp.mkdir(directory, { recursive: true });
  const destination = baselinePath(instanceDirectory);
  const staging = path.join(
    directory,
    `.mods-baseline-${crypto.randomUUID()}.tmp`,
  );
  await fsp.writeFile(
    staging,
    JSON.stringify(
      {
        schema: 1,
        createdAt: new Date().toISOString(),
        mods,
      },
      null,
      2,
    ),
    "utf8",
  );
  try {
    await fsp.rename(staging, destination);
  } catch (error) {
    await fsp.rm(staging, { force: true }).catch(() => undefined);
    throw error;
  }
}

function recentModChanges(baseline, current) {
  if (!baseline?.mods?.length) return [];
  const previous = new Map(baseline.mods.map((item) => [item.name, item]));
  return current
    .filter((item) => {
      const known = previous.get(item.name);
      return (
        !known ||
        known.size !== item.size ||
        known.modifiedAt !== item.modifiedAt
      );
    })
    .map((item) => item.name);
}

async function disableSuspectMods({
  instancesRoot,
  instanceId,
  names,
}) {
  const root = path.resolve(instancesRoot);
  const instanceDirectory = path.resolve(root, String(instanceId));
  if (!instanceDirectory.startsWith(`${root}${path.sep}`)) {
    throw new Error("The instance is outside the managed directory");
  }
  const modsDirectory = path.join(instanceDirectory, "mods");
  const disabled = [];
  const skipped = [];
  for (const value of [...new Set(Array.isArray(names) ? names : [])]) {
    const name = safeModName(value);
    const source = path.join(modsDirectory, name);
    const destination = `${source}.disabled`;
    const [sourceStats, destinationStats] = await Promise.all([
      fsp.stat(source).catch(() => null),
      fsp.stat(destination).catch(() => null),
    ]);
    if (!sourceStats?.isFile() || destinationStats) {
      skipped.push(name);
      continue;
    }
    await fsp.rename(source, destination);
    disabled.push(name);
  }
  return { disabled, skipped };
}

module.exports = {
  guardRoot,
  baselinePath,
  safeModName,
  snapshotMods,
  readModBaseline,
  writeModBaseline,
  recentModChanges,
  disableSuspectMods,
};
