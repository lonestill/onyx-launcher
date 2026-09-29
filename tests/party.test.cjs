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
  getNetworkInfo,
  syncMods,
  checkE4mcStatus,
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

test("party getNetworkInfo: returns valid IPv4 and correctly detects network properties", () => {
  const info = getNetworkInfo();
  assert.ok(info);
  assert.ok(typeof info.lanIp === "string");
  assert.ok(info.lanIp.length > 0);
  assert.ok(typeof info.hasVpn === "boolean");
});

test("party syncMods: skips files that already exist with matching sha1", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onyx-syncmods-test-"));
  const modsDir = path.join(tmpDir, "mods");
  fs.mkdirSync(modsDir, { recursive: true });

  try {
    const dummyModPath = path.join(modsDir, "dummy-1.0.0.jar");
    fs.writeFileSync(dummyModPath, "fake jar content for testing");

    const crypto = require("node:crypto");
    const sha1 = crypto.createHash("sha1").update("fake jar content for testing").digest("hex");

    let progressCalls = 0;
    const res = await syncMods({
      instanceDirectory: tmpDir,
      mods: [
        { fileName: "dummy-1.0.0.jar", sha1 },
      ],
      onProgress: () => { progressCalls++; },
    });

    assert.deepEqual(res.installed, ["dummy-1.0.0.jar"]);
    assert.deepEqual(res.failed, []);
    assert.ok(progressCalls > 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("party checkE4mcStatus: correctly determines e4mc installation status", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onyx-e4mc-test-"));
  try {
    const instDir = path.join(tmpDir, "test-inst");
    const modsDir = path.join(instDir, "mods");
    fs.mkdirSync(modsDir, { recursive: true });

    const status1 = await checkE4mcStatus({ id: "test-inst", loader: "fabric", version: "1.21" }, tmpDir);
    assert.equal(status1.installed, false);
    assert.equal(status1.supported, true);

    fs.writeFileSync(path.join(modsDir, "e4mc-fabric-6.2.2.jar"), "dummy");
    const status2 = await checkE4mcStatus({ id: "test-inst", loader: "fabric", version: "1.21" }, tmpDir);
    assert.equal(status2.installed, true);
    assert.equal(status2.jarName, "e4mc-fabric-6.2.2.jar");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("party extractRoomCode: accurately parses code from URLs, protocols, and text", () => {
  function extractRoomCode(input) {
    if (!input) return "";
    const trimmed = String(input).trim();
    const urlMatch =
      trimmed.match(/(?:scope|onyx):\/\/(?:party\/)?([a-zA-Z0-9_-]+)/i) ||
      trimmed.match(/\/party\/([a-zA-Z0-9_-]+)/i);
    if (urlMatch) return urlMatch[1].toUpperCase();

    const codeMatch = trimmed.match(/\b([A-Za-z0-9]{3})[- ]([A-Za-z0-9]{3})\b/);
    if (codeMatch) return `${codeMatch[1]}-${codeMatch[2]}`.toUpperCase();

    const clean = trimmed
      .replace(/^(?:код|code|party|комната)[\s:]+/i, "")
      .replace(/^[^a-zA-Z0-9]+/, "")
      .replace(/[^a-zA-Z0-9_-].*$/, "");
    return clean.toUpperCase();
  }

  assert.equal(extractRoomCode("scope://party/COG-957"), "COG-957");
  assert.equal(extractRoomCode("onyx://party/COG-957"), "COG-957");
  assert.equal(extractRoomCode("scope://COG-957"), "COG-957");
  assert.equal(extractRoomCode("https://scope-hub.vercel.app/party/COG-957"), "COG-957");
  assert.equal(extractRoomCode("https://scope-hub.vercel.app/party/cog-957?ref=invite"), "COG-957");
  assert.equal(extractRoomCode("COG-957"), "COG-957");
  assert.equal(extractRoomCode("cog-957"), "COG-957");
  assert.equal(extractRoomCode("COG 957"), "COG-957");
  assert.equal(extractRoomCode("Код: COG-957"), "COG-957");
  assert.equal(extractRoomCode("Залетай в пати: COG-957 ждем"), "COG-957");
});

