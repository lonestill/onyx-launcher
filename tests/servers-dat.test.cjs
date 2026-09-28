"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const {
  decodeNbt,
  encodeNbt,
  readServersDat,
  writeServersDat,
  injectRoomServer,
  removeRoomServer,
} = require("../electron/services/servers-dat.cjs");

test("servers-dat: roundtrip encode/decode NBT", () => {
  const sample = {
    name: "",
    value: {
      servers: {
        type: 9,
        value: {
          itemType: 10,
          list: [
            {
              name: { type: 8, value: "Hypixel" },
              ip: { type: 8, value: "mc.hypixel.net" },
              hidden: { type: 1, value: 0 },
            },
          ],
        },
      },
    },
  };

  const gzipped = encodeNbt(sample, true);
  assert.ok(gzipped.length > 0);
  assert.equal(gzipped[0], 0x1f);
  assert.equal(gzipped[1], 0x8b);

  const decoded = decodeNbt(gzipped);
  assert.ok(decoded);
  assert.equal(decoded.name, "");
  assert.ok(decoded.value.servers);
  assert.equal(decoded.value.servers.value.list.length, 1);
  assert.equal(decoded.value.servers.value.list[0].name.value, "Hypixel");
  assert.equal(decoded.value.servers.value.list[0].ip.value, "mc.hypixel.net");
});

test("servers-dat: read, write, inject and remove room server", async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "onyx-servers-test-"));
  try {
    // 1. Initially empty
    const initial = await readServersDat(tmpDir);
    assert.deepEqual(initial, []);

    // 2. Pre-populate with existing server
    await writeServersDat(tmpDir, [
      { name: "My Server", ip: "play.example.com", hidden: 0 },
    ]);
    const readBack = await readServersDat(tmpDir);
    assert.equal(readBack.length, 1);
    assert.equal(readBack[0].name, "My Server");
    assert.equal(readBack[0].ip, "play.example.com");

    // 3. Inject Onyx Room
    await injectRoomServer(tmpDir, {
      code: "ARC-123",
      address: "127.0.0.1:49152",
      hostName: "Alex",
    });

    const afterInject = await readServersDat(tmpDir);
    assert.equal(afterInject.length, 2);
    // Injected at top
    assert.ok(afterInject[0].name.includes("ARC-123"));
    assert.ok(afterInject[0].name.includes("Alex"));
    assert.equal(afterInject[0].ip, "127.0.0.1:49152");
    assert.equal(afterInject[1].name, "My Server");

    // 4. Update existing injection (e.g. port changed)
    await injectRoomServer(tmpDir, {
      code: "ARC-123",
      address: "127.0.0.1:51234",
      hostName: "Alexey",
    });
    const afterUpdate = await readServersDat(tmpDir);
    assert.equal(afterUpdate.length, 2);
    assert.equal(afterUpdate[0].ip, "127.0.0.1:51234");
    assert.ok(afterUpdate[0].name.includes("Alexey"));

    // 5. Remove room
    await removeRoomServer(tmpDir, "ARC-123");
    const afterRemove = await readServersDat(tmpDir);
    assert.equal(afterRemove.length, 1);
    assert.equal(afterRemove[0].name, "My Server");
    assert.equal(afterRemove[0].ip, "play.example.com");
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});
