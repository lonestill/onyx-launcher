const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseShareIdOrUrl,
  createSyncProfile,
  validateSyncProfile,
} = require("../electron/services/sync.cjs");

test("parseShareIdOrUrl extracts pack ID from various URL and string formats", () => {
  assert.equal(parseShareIdOrUrl("pk_abcdef12"), "pk_abcdef12");
  assert.equal(
    parseShareIdOrUrl("https://onyx-launcher-hub.vercel.app/pack/pk_abcdef12"),
    "pk_abcdef12",
  );
  assert.equal(
    parseShareIdOrUrl("http://localhost:3000/pack/pk_99887766"),
    "pk_99887766",
  );
  assert.equal(
    parseShareIdOrUrl("onyx://pack/pk_abcdef12"),
    "pk_abcdef12",
  );
  assert.equal(
    parseShareIdOrUrl("onyx://pack/custom-id-123"),
    "custom-id-123",
  );
  assert.equal(parseShareIdOrUrl("a1b2c3d4"), "pk_a1b2c3d4");
  assert.equal(parseShareIdOrUrl(""), "");
  assert.equal(parseShareIdOrUrl(null), "");
});

test("createSyncProfile builds a valid sync profile from instance and mods", () => {
  const instance = {
    name: "RPG Adventure",
    version: "1.20.1",
    loader: "fabric",
    description: "Fun pack",
    color: "violet",
    glyph: "RP",
    settings: {
      memory: 4096,
      servers: [{ name: "My Server", address: "mc.example.com" }],
    },
  };
  const mods = [
    {
      name: "sodium-fabric-0.5.8.jar",
      enabled: true,
      sha1: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      projectId: "AANobbMI",
      versionId: "12345678",
    },
    {
      name: "custom-local-mod.jar",
      enabled: false,
      sha1: "e56b4b0d3255bfef95601890afd80709da39a3ee",
      projectId: null,
      versionId: null,
    },
  ];

  const profile = createSyncProfile({ instance, mods });
  assert.equal(profile.schema, 1);
  assert.equal(profile.launcher, "onyx");
  assert.equal(profile.instance.name, "RPG Adventure");
  assert.equal(profile.instance.version, "1.20.1");
  assert.equal(profile.instance.loader, "fabric");
  assert.equal(profile.mods.length, 2);
  assert.equal(profile.mods[0].versionId, "12345678");

  const validated = validateSyncProfile(profile);
  assert.equal(validated.instance.name, "RPG Adventure");
  assert.equal(validated.mods.length, 2);
});

test("loaderVersionFromId correctly parses fabric and quilt versions", () => {
  const { MinecraftService } = require("../electron/services/minecraft.cjs");
  const ms = new MinecraftService({ rootDir: "/tmp/mock", sharedRoot: "/tmp/mock-shared" });
  assert.equal(
    ms.loaderVersionFromId("fabric", "fabric-loader-0.19.5-1.21"),
    "0.19.5",
  );
  assert.equal(
    ms.loaderVersionFromId("quilt", "quilt-loader-0.27.1-1.21"),
    "0.27.1",
  );
  assert.equal(
    ms.loaderVersionFromId("neoforge", "neoforge-21.1.65"),
    "21.1.65",
  );
});

