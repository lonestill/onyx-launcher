const test = require("node:test");
const assert = require("node:assert/strict");
const { TelemetryService, POSTHOG_CAPTURE_URL } = require("../electron/services/telemetry.cjs");

test("telemetry service: ensures anonymous id is generated and preserved", () => {
  const service = new TelemetryService();
  const id1 = service.ensureAnonymousId();
  assert.ok(typeof id1 === "string" && id1.length > 10);

  const existing = "custom-persisted-uuid";
  const id2 = service.ensureAnonymousId(existing);
  assert.equal(id2, existing);
});

test("telemetry service: skips tracking when enabled is false", async () => {
  let called = false;
  const service = new TelemetryService({
    fetchFn: async () => {
      called = true;
      return { ok: true, status: 200 };
    },
  });

  const res = await service.track("user-123", "app_launch", {}, { enabled: false });
  assert.equal(res.skipped, true);
  assert.equal(res.reason, "opt_out");
  assert.equal(called, false);
});

test("telemetry service: sends correct payload to capture URL", async () => {
  let capturedUrl = "";
  let capturedBody = null;

  const service = new TelemetryService({
    fetchFn: async (url, options) => {
      capturedUrl = url;
      capturedBody = JSON.parse(options.body);
      return { ok: true, status: 200 };
    },
  });

  const res = await service.track("user-456", "test_event", { foo: "bar" });
  assert.equal(res.success, true);
  assert.equal(capturedUrl, POSTHOG_CAPTURE_URL);
  assert.equal(capturedBody.event, "test_event");
  assert.equal(capturedBody.distinct_id, "user-456");
  assert.equal(capturedBody.properties.foo, "bar");
  assert.equal(capturedBody.properties.$lib, "onyx-telemetry");
});

test("telemetry service: handles network failure gracefully without throwing", async () => {
  const service = new TelemetryService({
    fetchFn: async () => {
      throw new Error("Network offline");
    },
  });

  const res = await service.track("user-789", "app_launch");
  assert.equal(res.success, false);
  assert.ok(res.error.includes("Network offline"));
});

test("telemetry service: trackAppLaunch sends app_launch and pageview, and trackGameLaunch sends game_launch", async () => {
  const events = [];
  const service = new TelemetryService({
    fetchFn: async (_url, options) => {
      events.push(JSON.parse(options.body));
      return { ok: true, status: 200 };
    },
  });

  await service.trackAppLaunch({
    distinctId: "client-1",
    version: "1.6.9",
    os: "win32",
    arch: "x64",
    locale: "en-US",
    isPackaged: true,
  });

  await service.trackGameLaunch({
    distinctId: "client-1",
    instanceId: "inst-1",
    minecraftVersion: "1.21.1",
    loader: "Fabric",
  });

  assert.equal(events.length, 3);
  const appLaunch = events.find((e) => e.event === "app_launch");
  const pageview = events.find((e) => e.event === "$pageview");
  const gameLaunch = events.find((e) => e.event === "game_launch");

  assert.ok(appLaunch);
  assert.equal(appLaunch.properties.launcher_version, "1.6.9");
  assert.equal(appLaunch.properties.platform, "win32");
  assert.equal(appLaunch.properties.$os, "Windows");
  assert.equal(appLaunch.properties.is_packaged, true);

  assert.ok(pageview);
  assert.equal(pageview.properties.$current_url, "https://onyx-launcher.app/v1.6.9");
  assert.equal(pageview.properties.$device_type, "Desktop");

  assert.ok(gameLaunch);
  assert.equal(gameLaunch.properties.instance_id, "inst-1");
  assert.equal(gameLaunch.properties.minecraft_version, "1.21.1");
  assert.equal(gameLaunch.properties.loader_type, "Fabric");
});
