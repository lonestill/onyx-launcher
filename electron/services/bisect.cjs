const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { safeModName, snapshotMods, guardRoot } = require("./guard.cjs");

function resolveInstance(instancesRoot, instanceId) {
  const root = path.resolve(instancesRoot);
  const instanceDirectory = path.resolve(root, String(instanceId));
  if (!instanceDirectory.startsWith(`${root}${path.sep}`)) {
    throw new Error("The instance is outside the managed directory");
  }
  return instanceDirectory;
}

function sessionPath(instanceDirectory) {
  return path.join(guardRoot(instanceDirectory), "bisect.json");
}

async function writeSession(instanceDirectory, session) {
  const destination = sessionPath(instanceDirectory);
  const directory = path.dirname(destination);
  const staging = path.join(directory, `.bisect-${crypto.randomUUID()}.tmp`);
  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(staging, JSON.stringify(session, null, 2), "utf8");
  try {
    await fsp.rm(destination, { force: true });
    await fsp.rename(staging, destination);
  } catch (error) {
    await fsp.rm(staging, { force: true }).catch(() => undefined);
    throw error;
  }
}

function sanitizeSession(value) {
  if (
    value?.schema !== 1 ||
    typeof value.id !== "string" ||
    !Array.isArray(value.candidates) ||
    !Array.isArray(value.testing)
  ) {
    return null;
  }
  try {
    return {
      schema: 1,
      id: value.id,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      round: Math.max(1, Math.trunc(value.round || 1)),
      originalCount: Math.max(
        value.candidates.length,
        Math.trunc(value.originalCount || 0),
      ),
      candidates: [...new Set(value.candidates.map(safeModName))],
      testing: [...new Set(value.testing.map(safeModName))],
      status: value.status === "found" ? "found" : "testing",
      culprit:
        value.status === "found" && value.culprit
          ? safeModName(value.culprit)
          : null,
    };
  } catch {
    return null;
  }
}

async function readBisectSession({ instancesRoot, instanceId }) {
  const instanceDirectory = resolveInstance(instancesRoot, instanceId);
  try {
    return sanitizeSession(
      JSON.parse(await fsp.readFile(sessionPath(instanceDirectory), "utf8")),
    );
  } catch {
    return null;
  }
}

async function setModEnabled(instanceDirectory, name, enabled) {
  const safeName = safeModName(name);
  const source = path.join(instanceDirectory, "mods", safeName);
  const disabled = `${source}.disabled`;
  const [sourceStats, disabledStats] = await Promise.all([
    fsp.stat(source).catch(() => null),
    fsp.stat(disabled).catch(() => null),
  ]);
  if (enabled && !sourceStats?.isFile() && disabledStats?.isFile()) {
    await fsp.rename(disabled, source);
    return true;
  }
  if (!enabled && sourceStats?.isFile() && !disabledStats) {
    await fsp.rename(source, disabled);
    return true;
  }
  return false;
}

async function restoreTesting(instanceDirectory, session) {
  for (const name of session?.testing || []) {
    await setModEnabled(instanceDirectory, name, true);
  }
}

async function prepareRound(instanceDirectory, session) {
  if (session.candidates.length <= 1) {
    session.status = "found";
    session.culprit = session.candidates[0] || null;
    session.testing = [];
    session.updatedAt = new Date().toISOString();
    await writeSession(instanceDirectory, session);
    return session;
  }
  const testingCount = Math.ceil(session.candidates.length / 2);
  session.testing = session.candidates.slice(0, testingCount);
  for (const name of session.testing) {
    await setModEnabled(instanceDirectory, name, false);
  }
  session.status = "testing";
  session.culprit = null;
  session.updatedAt = new Date().toISOString();
  await writeSession(instanceDirectory, session);
  return session;
}

async function startBisect({ instancesRoot, instanceId, names }) {
  const instanceDirectory = resolveInstance(instancesRoot, instanceId);
  const existing = await readBisectSession({ instancesRoot, instanceId });
  if (existing) return existing;
  const available = new Set(
    (await snapshotMods(instanceDirectory)).map((item) => item.name),
  );
  const requested = Array.isArray(names) && names.length ? names : [...available];
  const candidates = [
    ...new Set(requested.map(safeModName).filter((name) => available.has(name))),
  ].sort((left, right) => left.localeCompare(right));
  if (candidates.length < 2) {
    throw new Error("At least two enabled mods are required to find a conflict");
  }
  const now = new Date().toISOString();
  const session = {
    schema: 1,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    round: 1,
    originalCount: candidates.length,
    candidates,
    testing: [],
    status: "testing",
    culprit: null,
  };
  return prepareRound(instanceDirectory, session);
}

async function reportBisectResult({
  instancesRoot,
  instanceId,
  gameStarted,
}) {
  const instanceDirectory = resolveInstance(instancesRoot, instanceId);
  const session = await readBisectSession({ instancesRoot, instanceId });
  if (!session || session.status !== "testing") {
    throw new Error("No active mod check was found");
  }
  await restoreTesting(instanceDirectory, session);
  const testing = new Set(session.testing);
  session.candidates = gameStarted
    ? session.candidates.filter((name) => testing.has(name))
    : session.candidates.filter((name) => !testing.has(name));
  if (!session.candidates.length) {
    await fsp.rm(sessionPath(instanceDirectory), { force: true });
    throw new Error(
      "The results conflict. All mods were restored; start the check again.",
    );
  }
  session.round += 1;
  session.testing = [];
  return prepareRound(instanceDirectory, session);
}

async function cancelBisect({ instancesRoot, instanceId }) {
  const instanceDirectory = resolveInstance(instancesRoot, instanceId);
  const session = await readBisectSession({ instancesRoot, instanceId });
  if (session) await restoreTesting(instanceDirectory, session);
  await fsp.rm(sessionPath(instanceDirectory), { force: true });
  return { restored: session?.testing?.length || 0 };
}

async function finishBisect({ instancesRoot, instanceId, disableCulprit }) {
  const instanceDirectory = resolveInstance(instancesRoot, instanceId);
  const session = await readBisectSession({ instancesRoot, instanceId });
  if (!session || session.status !== "found" || !session.culprit) {
    throw new Error("The offending mod has not been identified yet");
  }
  if (disableCulprit) {
    await setModEnabled(instanceDirectory, session.culprit, false);
  }
  await fsp.rm(sessionPath(instanceDirectory), { force: true });
  return { culprit: session.culprit, disabled: Boolean(disableCulprit) };
}

module.exports = {
  sessionPath,
  readBisectSession,
  startBisect,
  reportBisectResult,
  cancelBisect,
  finishBisect,
};
