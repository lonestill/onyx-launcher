const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const zlib = require("node:zlib");
const {
  detectCrashAutoFix,
  applyCrashAutoFix,
  inspectJarMetadata,
  checkModCompatibility,
} = require("../electron/services/crash-autofix.cjs");

test("detectCrashAutoFix: detects OutOfMemoryError and proposes memory bump", async () => {
  const instance = {
    id: "inst-1",
    settings: { memory: 4 },
  };
  const logContent = `
[02:00:00] [main/INFO]: Loading Minecraft
[02:00:05] [main/ERROR]: java.lang.OutOfMemoryError: Java heap space
  at java.util.Arrays.copyOf(Arrays.java:3332)
`;
  const fix = await detectCrashAutoFix({
    instance,
    logContent,
    systemTotalRamMb: 16384, // 16 GB system
  });

  assert.ok(fix, "Expected fix to be detected");
  assert.equal(fix.type, "increase-memory");
  assert.equal(fix.payload.currentMemoryGiB, 4);
  assert.equal(fix.payload.targetMemoryGiB, 6);
});

test("detectCrashAutoFix: detects missing Indium when Sodium is present", async () => {
  const instance = {
    id: "inst-fabric",
    loader: "fabric",
    version: "1.20.1",
  };
  const logContent = `
[02:00:00] [main/ERROR]: IndiumException: Sodium has replaced the default block/fluid renderer, but another mod depends on the Fabric Rendering API! Indium is required.
`;
  const fix = await detectCrashAutoFix({
    instance,
    logContent,
  });

  assert.ok(fix);
  assert.equal(fix.type, "install-indium");
  assert.equal(fix.payload.projectId, "indium");
});

test("detectCrashAutoFix: detects UnsupportedClassVersionError (Java 21 requirement)", async () => {
  const instance = {
    id: "inst-2",
    version: "1.20.6",
  };
  const logContent = `
java.lang.UnsupportedClassVersionError: net/minecraft/client/main/Main has been compiled by a more recent version of the Java Runtime (class file version 65.0), this compiler only recognizes class file versions up to 61.0
`;
  const fix = await detectCrashAutoFix({
    instance,
    logContent,
  });

  assert.ok(fix);
  assert.equal(fix.type, "switch-java");
  assert.equal(fix.payload.requiredJavaMajor, 21);
});

test("detectCrashAutoFix: detects bad JVM arguments", async () => {
  const instance = { id: "inst-3" };
  const logContent = `
Unrecognized VM option 'UseConcMarkSweepGC'
Error: Could not create the Java Virtual Machine.
Error: A fatal exception has occurred. Program will exit.
`;
  const fix = await detectCrashAutoFix({
    instance,
    logContent,
  });

  assert.ok(fix);
  assert.equal(fix.type, "reset-jvm-args");
});

test("detectCrashAutoFix: detects corrupted jar archive from log", async () => {
  const instance = { id: "inst-4" };
  const logContent = `
java.util.zip.ZipException: zip END header not found
  at java.util.zip.ZipFile$Source.findEND(ZipFile.java:1469)
  reading /mods/broken-mod-1.0.jar
`;
  const fix = await detectCrashAutoFix({
    instance,
    logContent,
  });

  assert.ok(fix);
  assert.equal(fix.type, "clean-corrupted-file");
  assert.equal(fix.payload.fileName, "broken-mod-1.0.jar");
});

test("checkModCompatibility: detects Forge mod in Fabric instance", () => {
  const modMeta = {
    fileName: "forge-only-mod.jar",
    loader: "forge",
    mcVersionRange: "1.20.1",
    corrupted: false,
  };
  const instance = {
    loader: "fabric",
    version: "1.20.1",
  };
  const result = checkModCompatibility(modMeta, instance);
  assert.equal(result.incompatible, true);
  assert.equal(result.reason, "loader-mismatch");
  assert.equal(result.modLoader, "Forge");
  assert.equal(result.instanceLoader, "Fabric");
});

test("checkModCompatibility: detects incompatible Minecraft version", () => {
  const modMeta = {
    fileName: "legacy-mod.jar",
    loader: "fabric",
    mcVersionRange: "1.16.5",
    corrupted: false,
  };
  const instance = {
    loader: "fabric",
    version: "1.20.1",
  };
  const result = checkModCompatibility(modMeta, instance);
  assert.equal(result.incompatible, true);
  assert.equal(result.reason, "version-mismatch");
});

test("applyCrashAutoFix: increases memory and clears error state", async () => {
  const instance = {
    id: "inst-mem",
    settings: { memory: 4 },
    lastAutoFix: { type: "increase-memory" },
    lastDiagnosis: { code: "out-of-memory" },
  };
  const fixAction = {
    type: "increase-memory",
    payload: { targetMemoryGiB: 8 },
  };

  let saved = false;
  const result = await applyCrashAutoFix({
    fixAction,
    instance,
    saveStateFn: async () => {
      saved = true;
    },
  });

  assert.equal(result.success, true);
  assert.equal(instance.settings.memory, 8);
  assert.equal(instance.lastAutoFix, null);
  assert.equal(instance.lastDiagnosis, null);
  assert.equal(saved, true);
});

test("applyCrashAutoFix: disables culprit mod by renaming to .disabled", async () => {
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "scope-fix-test-"));
  const instId = "inst-culprit";
  const modsDir = path.join(tmpRoot, instId, "mods");
  await fsp.mkdir(modsDir, { recursive: true });

  const jarName = "bad-mod-1.0.jar";
  const jarPath = path.join(modsDir, jarName);
  await fsp.writeFile(jarPath, "dummy-jar-content");

  const instance = {
    id: instId,
    lastAutoFix: { type: "disable-culprit-mod" },
  };
  const fixAction = {
    type: "disable-culprit-mod",
    payload: { modFileName: jarName },
  };

  const result = await applyCrashAutoFix({
    fixAction,
    instance,
    instancesRoot: tmpRoot,
  });

  assert.equal(result.success, true);
  assert.equal(fs.existsSync(jarPath), false);
  assert.equal(fs.existsSync(`${jarPath}.disabled`), true);

  await fsp.rm(tmpRoot, { recursive: true, force: true });
});
