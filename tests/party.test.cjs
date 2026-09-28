const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
  initStorage,
  savePartySession,
  loadPartySession,
  clearPartySession,
  diffManifest,
} = require("../electron/services/party.cjs");

test("party storage: saves, loads, and clears session metadata on disk", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onyx-party-test-"));
  try {
    initStorage(tmpDir);

    const testSession = {
      code: "TEST-123",
      peerId: "onyx-aabbccddeeff",
      isHost: true,
      displayName: "Tester",
      instanceId: "inst-456",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    savePartySession(testSession);
    const loaded = loadPartySession();

    assert.ok(loaded);
    assert.equal(loaded.code, "TEST-123");
    assert.equal(loaded.peerId, "onyx-aabbccddeeff");
    assert.equal(loaded.isHost, true);
    assert.equal(loaded.instanceId, "inst-456");

    clearPartySession();
    assert.equal(loadPartySession(), null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("party diffManifest: detects client-only mods and reports compatible: true", () => {
  const hostManifest = {
    loader: "fabric",
    minecraftVersion: "1.21.1",
    mods: [
      { fileName: "sodium-fabric-0.5.8.jar", enabled: true, sha1: "1111" },
      { fileName: "iris-fabric-1.7.0.jar", enabled: true, sha1: "2222" },
      { fileName: "create-fabric-0.5.1.jar", enabled: true, sha1: "3333" },
    ],
  };

  const localMods = [
    { fileName: "create-fabric-0.5.1.jar", enabled: true, sha1: "3333" },
    { fileName: "sodium-fabric-0.5.9.jar", enabled: true, sha1: "9999" },
  ];

  const diff = diffManifest(localMods, hostManifest);

  assert.equal(diff.identical, false);
  assert.equal(diff.compatible, true);
  assert.equal(diff.criticalMissing.length, 0);
  assert.equal(diff.missing.length, 2);
  assert.ok(diff.missing.some(m => m.fileName.includes("iris")));
  assert.equal(diff.missing[0].clientOnly, true);
});

test("party diffManifest: reports compatible: false when critical gameplay mod is missing", () => {
  const hostManifest = {
    loader: "fabric",
    minecraftVersion: "1.21.1",
    mods: [
      { fileName: "create-fabric-0.5.1.jar", enabled: true, sha1: "3333" },
      { fileName: "ae2-fabric-15.0.0.jar", enabled: true, sha1: "4444" },
    ],
  };

  const localMods = [
    { fileName: "create-fabric-0.5.1.jar", enabled: true, sha1: "3333" },
  ];

  const diff = diffManifest(localMods, hostManifest);

  assert.equal(diff.compatible, false);
  assert.equal(diff.criticalMissing.length, 1);
  assert.equal(diff.criticalMissing[0].fileName, "ae2-fabric-15.0.0.jar");
});

test("multi-client: generates distinct offline nicknames and UUIDs for concurrent clients", () => {
  const crypto = require("node:crypto");
  function offlineUuid(name) {
    const hash = crypto.createHash("md5").update(`OfflinePlayer:${name}`).digest();
    hash[6] = (hash[6] & 0x0f) | 0x30;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.toString("hex");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join("-");
  }

  const base = "Player";
  const client1 = { name: base, uuid: offlineUuid(base) };
  const client2 = { name: `${base}_2`, uuid: offlineUuid(`${base}_2`) };

  assert.notEqual(client1.name, client2.name);
  assert.notEqual(client1.uuid, client2.uuid);
  assert.equal(client2.name, "Player_2");
});
