const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const {
  inspectCurseForgeInstance,
  inspectPrismInstance,
  inspectPrismFamilyInstance,
  inspectModrinthProfile,
  inspectVanillaRoot,
  inspectATLauncherInstance,
  inspectFeatherInstance,
  inspectDeepLogAndFolder,
  inspectCustomDirectory,
  inspectOnyxInstance,
  migrateInstanceFiles,
  createOnyxInstanceFromCandidate,
} = require("../electron/services/migration.cjs");

test("migration: parses CurseForge instance with minecraftinstance.json", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "cf-test-"));
  try {
    const cfManifest = {
      name: "Prominence II RPG",
      gameVersion: "1.20.1",
      baseModLoader: {
        name: "fabric-0.15.11",
      },
    };
    await fsp.writeFile(
      path.join(tmp, "minecraftinstance.json"),
      JSON.stringify(cfManifest),
    );
    await fsp.mkdir(path.join(tmp, "mods"), { recursive: true });
    await fsp.writeFile(path.join(tmp, "mods", "sodium.jar"), "dummy");
    await fsp.writeFile(path.join(tmp, "mods", "iris.jar"), "dummy");
    await fsp.mkdir(path.join(tmp, "saves", "NewWorld"), { recursive: true });

    const candidate = inspectCurseForgeInstance(tmp);
    assert.ok(candidate);
    assert.equal(candidate.name, "Prominence II RPG");
    assert.equal(candidate.version, "1.20.1");
    assert.equal(candidate.loader, "Fabric");
    assert.equal(candidate.modCount, 2);
    assert.equal(candidate.worldCount, 1);
    assert.equal(candidate.launcher, "curseforge");
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test("migration: parses Prism Launcher instance with instance.cfg and mmc-pack.json", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "prism-test-"));
  try {
    const cfg = "name=ATM9 High Tech\nIntendedVersion=1.20.1\niconKey=default\n";
    await fsp.writeFile(path.join(tmp, "instance.cfg"), cfg);

    const mmcPack = {
      components: [
        { uid: "net.minecraft", cachedVersion: "1.20.1" },
        { uid: "net.neoforged.neoforge", cachedVersion: "20.1.10" },
      ],
    };
    await fsp.writeFile(
      path.join(tmp, "mmc-pack.json"),
      JSON.stringify(mmcPack),
    );

    const dotMinecraft = path.join(tmp, ".minecraft");
    await fsp.mkdir(path.join(dotMinecraft, "mods"), { recursive: true });
    await fsp.writeFile(path.join(dotMinecraft, "mods", "mekanism.jar"), "dummy");
    await fsp.mkdir(path.join(dotMinecraft, "saves", "TechBase"), { recursive: true });

    const candidate = inspectPrismInstance(tmp);
    assert.ok(candidate);
    assert.equal(candidate.name, "ATM9 High Tech");
    assert.equal(candidate.version, "1.20.1");
    assert.equal(candidate.loader, "NeoForge");
    assert.equal(candidate.modCount, 1);
    assert.equal(candidate.worldCount, 1);
    assert.equal(candidate.launcher, "prism");
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test("migration: parses MultiMC / PolyMC instance with inspectPrismFamilyInstance", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "mmc-test-"));
  try {
    const cfg = "name=GregTech New Horizons\nIntendedVersion=1.7.10\n";
    await fsp.writeFile(path.join(tmp, "instance.cfg"), cfg);

    const dotMinecraft = path.join(tmp, ".minecraft");
    await fsp.mkdir(path.join(dotMinecraft, "mods"), { recursive: true });
    await fsp.writeFile(path.join(dotMinecraft, "mods", "gt5u.jar"), "dummy");

    const candidate = inspectPrismFamilyInstance(tmp, "multimc");
    assert.ok(candidate);
    assert.equal(candidate.name, "GregTech New Horizons");
    assert.equal(candidate.version, "1.7.10");
    assert.equal(candidate.launcher, "multimc");
    assert.equal(candidate.modCount, 1);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test("migration: parses ATLauncher instance with instance.json", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "atl-test-"));
  try {
    const atlJson = {
      name: "Crucial 2",
      minecraftVersion: "1.16.5",
      loader: "Forge",
      loaderVersion: "36.2.39",
    };
    await fsp.writeFile(path.join(tmp, "instance.json"), JSON.stringify(atlJson));
    await fsp.mkdir(path.join(tmp, "mods"), { recursive: true });
    await fsp.writeFile(path.join(tmp, "mods", "create.jar"), "dummy");
    await fsp.mkdir(path.join(tmp, "saves", "World1"), { recursive: true });

    const candidate = inspectATLauncherInstance(tmp);
    assert.ok(candidate);
    assert.equal(candidate.name, "Crucial 2");
    assert.equal(candidate.version, "1.16.5");
    assert.equal(candidate.loader, "Forge");
    assert.equal(candidate.loaderVersion, "36.2.39");
    assert.equal(candidate.launcher, "atlauncher");
    assert.equal(candidate.modCount, 1);
    assert.equal(candidate.worldCount, 1);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test("migration: parses Feather Client instance", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "feather-test-"));
  try {
    const featherJson = {
      name: "PvP Pack 1.20",
      version: "1.20.4",
      loader: "Fabric",
      loaderVersion: "0.15.7",
    };
    await fsp.writeFile(path.join(tmp, "feather.json"), JSON.stringify(featherJson));
    await fsp.mkdir(path.join(tmp, "mods"), { recursive: true });
    await fsp.writeFile(path.join(tmp, "mods", "sodium.jar"), "dummy");

    const candidate = inspectFeatherInstance(tmp);
    assert.ok(candidate);
    assert.equal(candidate.name, "PvP Pack 1.20");
    assert.equal(candidate.version, "1.20.4");
    assert.equal(candidate.loader, "Fabric");
    assert.equal(candidate.launcher, "feather");
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test("migration: deep log inspection extracts version and loader without manifests", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "deep-test-"));
  try {
    const logsDir = path.join(tmp, "logs");
    await fsp.mkdir(logsDir, { recursive: true });
    const sampleLog = `[12:00:01] [main/INFO]: Loading Minecraft 1.21.4 with Fabric Loader 0.16.10
[12:00:02] [main/INFO]: Loading 42 mods:
 - fabric-api 0.96.0
 - iris 1.7.0`;
    await fsp.writeFile(path.join(logsDir, "latest.log"), sampleLog);
    await fsp.mkdir(path.join(tmp, "mods"), { recursive: true });
    await fsp.writeFile(path.join(tmp, "mods", "fabric-api.jar"), "dummy");
    await fsp.mkdir(path.join(tmp, "saves", "MyTestWorld"), { recursive: true });

    const candidate = inspectDeepLogAndFolder(tmp, "custom");
    assert.ok(candidate);
    assert.equal(candidate.version, "1.21.4");
    assert.equal(candidate.loader, "Fabric");
    assert.equal(candidate.loaderVersion, "0.16.10");
    assert.equal(candidate.modCount, 1);
    assert.equal(candidate.worldCount, 1);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test("migration: parses Modrinth App profile.json", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "mr-test-"));
  try {
    const profile = {
      name: "Fabulously Optimized",
      game_version: "1.21.1",
      loader: "fabric",
      loader_version: "0.16.5",
    };
    await fsp.writeFile(path.join(tmp, "profile.json"), JSON.stringify(profile));
    await fsp.mkdir(path.join(tmp, "mods"), { recursive: true });
    await fsp.writeFile(path.join(tmp, "mods", "sodium.jar"), "dummy");

    const candidate = inspectModrinthProfile(tmp);
    assert.ok(candidate);
    assert.equal(candidate.name, "Fabulously Optimized");
    assert.equal(candidate.version, "1.21.1");
    assert.equal(candidate.loader, "Fabric");
    assert.equal(candidate.modCount, 1);
    assert.equal(candidate.launcher, "modrinth");
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test("migration: parses Vanilla launcher_profiles.json and falls back to root if empty", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "vanilla-test-"));
  try {
    const launcherProfiles = {
      profiles: {
        forgeProfile: {
          name: "My Forge World",
          lastVersionId: "1.20.1-forge-47.2.0",
        },
      },
    };
    await fsp.writeFile(
      path.join(tmp, "launcher_profiles.json"),
      JSON.stringify(launcherProfiles),
    );
    await fsp.mkdir(path.join(tmp, "mods"), { recursive: true });
    await fsp.writeFile(path.join(tmp, "mods", "jei.jar"), "dummy");

    const candidates = inspectVanillaRoot(tmp);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].name, "My Forge World");
    assert.equal(candidates[0].version, "1.20.1");
    assert.equal(candidates[0].loader, "Forge");
    assert.equal(candidates[0].modCount, 1);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test("migration: vanilla root fallback detects root .minecraft with saves without profiles", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "vanilla-root-test-"));
  try {
    // No launcher_profiles.json at all, but saves and options exist
    await fsp.mkdir(path.join(tmp, "saves", "SingleplayerSurvival"), { recursive: true });
    await fsp.writeFile(path.join(tmp, "options.txt"), "fov:90\n");

    const candidates = inspectVanillaRoot(tmp);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].name, "Default (.minecraft)");
    assert.equal(candidates[0].launcher, "vanilla");
    assert.equal(candidates[0].worldCount, 1);
    assert.equal(candidates[0].hasOptions, true);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test("migration: copies instance files and preserves saves", async () => {
  const source = await fsp.mkdtemp(path.join(os.tmpdir(), "src-inst-"));
  const dest = await fsp.mkdtemp(path.join(os.tmpdir(), "dest-inst-"));
  try {
    await fsp.mkdir(path.join(source, "mods"), { recursive: true });
    await fsp.writeFile(path.join(source, "mods", "mod1.jar"), "content-mod");
    await fsp.mkdir(path.join(source, "saves", "MySurvival"), { recursive: true });
    await fsp.writeFile(path.join(source, "saves", "MySurvival", "level.dat"), "world-data");
    await fsp.writeFile(path.join(source, "options.txt"), "fov:90\n");

    const progressEvents = [];
    await migrateInstanceFiles({
      sourceGameDir: source,
      destinationInstanceDir: dest,
      onProgress: (p) => progressEvents.push(p),
    });

    assert.ok(fs.existsSync(path.join(dest, "mods", "mod1.jar")));
    assert.ok(fs.existsSync(path.join(dest, "saves", "MySurvival", "level.dat")));
    assert.ok(fs.existsSync(path.join(dest, "options.txt")));
    assert.equal(
      await fsp.readFile(path.join(dest, "saves", "MySurvival", "level.dat"), "utf8"),
      "world-data",
    );
    assert.ok(progressEvents.length > 0);
  } finally {
    await fsp.rm(source, { recursive: true, force: true });
    await fsp.rm(dest, { recursive: true, force: true });
  }
});

test("migration: createOnyxInstanceFromCandidate builds valid Onyx metadata", () => {
  const candidate = {
    name: "Pixelmon Legends",
    version: "1.20.2",
    loader: "Forge",
    loaderVersion: "48.1.0",
    modCount: 45,
    launcher: "curseforge",
  };
  const inst = createOnyxInstanceFromCandidate(candidate, "uuid-12345");
  assert.equal(inst.id, "uuid-12345");
  assert.equal(inst.name, "Pixelmon Legends");
  assert.equal(inst.version, "1.20.2");
  assert.equal(inst.loader, "Forge");
  assert.equal(inst.modCount, 45);
  assert.equal(inst.status, "setup");
  assert.equal(inst.migratedFrom, "curseforge");
});

test("migration: parses legacy Onyx instance with instance.json and saves", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "onyx-inst-test-"));
  try {
    const instMeta = {
      name: "Legacy Onyx Pack",
      version: "1.20.1",
      loader: "Fabric",
      loaderVersion: "0.15.11",
    };
    await fsp.writeFile(path.join(tmp, "instance.json"), JSON.stringify(instMeta));
    await fsp.mkdir(path.join(tmp, "mods"), { recursive: true });
    await fsp.writeFile(path.join(tmp, "mods", "sodium.jar"), "dummy");
    await fsp.mkdir(path.join(tmp, "saves", "World1"), { recursive: true });
    await fsp.writeFile(path.join(tmp, "options.txt"), "fov:90");

    const candidate = inspectOnyxInstance(tmp);
    assert.ok(candidate);
    assert.equal(candidate.name, "Legacy Onyx Pack");
    assert.equal(candidate.version, "1.20.1");
    assert.equal(candidate.loader, "Fabric");
    assert.equal(candidate.modCount, 1);
    assert.equal(candidate.worldCount, 1);
    assert.equal(candidate.launcher, "onyx");

    const onyxMeta = createOnyxInstanceFromCandidate(candidate, "uuid-migrated-1");
    assert.equal(onyxMeta.name, "Legacy Onyx Pack");
    assert.equal(onyxMeta.migratedFrom, "onyx");
    assert.equal(onyxMeta.description, "Migrated from Onyx Launcher");
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});
