const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const electron = require("electron");
const fixtureRoot = path.join(projectRoot, ".capture-data");
const artifactsRoot = path.join(projectRoot, "artifacts");

const performance = {
  available: true,
  durationMs: 4_860_000,
  sampleCount: 162,
  peakRssBytes: 5_046_599_680,
  averageRssBytes: 3_543_348_224,
  averageCpuPercent: 31.4,
  peakCpuPercent: 79.2,
  startupMs: 18_400,
  worldReadyMs: 31_200,
  gcEvents: 14,
  maxGcPauseMs: 86,
  outOfMemory: false,
  recommendedMemoryGiB: 6,
  timeline: [
    { atSeconds: 0, rssBytes: 1_610_612_736, cpuPercent: 62 },
    { atSeconds: 20, rssBytes: 3_006_676_992, cpuPercent: 48 },
    { atSeconds: 60, rssBytes: 3_650_158_592, cpuPercent: 29 },
    { atSeconds: 120, rssBytes: 4_187_914_240, cpuPercent: 24 },
    { atSeconds: 180, rssBytes: 4_080_541_696, cpuPercent: 22 },
  ],
  fps: {
    requested: true,
    available: true,
    provider: "onyx-agent",
    averageFps: 146,
    onePercentLowFps: 92,
    minimumFps: 71,
    frameTimeP99Ms: 10.8,
    stutterCount: 3,
    sampleCount: 2_140,
    timeline: [
      { atSeconds: 0, fps: 118, frameTimeMs: 8.5 },
      { atSeconds: 20, fps: 142, frameTimeMs: 7.1 },
      { atSeconds: 40, fps: 156, frameTimeMs: 6.4 },
      { atSeconds: 60, fps: 149, frameTimeMs: 6.7 },
      { atSeconds: 80, fps: 164, frameTimeMs: 6.1 },
    ],
    error: null,
  },
  insights: [{ code: "stable-session", severity: "info", value: 1 }],
};

const state = {
  profile: { name: "Alex", kind: "local" },
  settings: {
    language: "en",
    memory: 6,
    gameDirectory: "",
    javaPath: "",
    closeOnLaunch: false,
    keepLauncherOpen: true,
    ghostMode: false,
    hardwareAcceleration: true,
    showSnapshots: false,
    notifications: true,
    autoCheckUpdates: true,
    reducedMotion: false,
    onboardingComplete: true,
    accent: "lime",
    windowWidth: 1280,
    windowHeight: 720,
    fullscreen: false,
    launcherBounds: { width: 1440, height: 900 },
    launcherMaximized: false,
  },
  instances: [
    {
      id: "vanilla-start",
      name: "Pure Game",
      version: "1.21.1",
      loader: "Vanilla",
      description: "Minecraft without modifications",
      color: "lime",
      glyph: "MC",
      favorite: true,
      status: "ready",
      lastPlayed: "Today, 10:42",
      playtimeMinutes: 2_940,
      modCount: 0,
      resolvedVersionId: "1.21.1",
      installedAt: "2026-07-01T10:00:00.000Z",
      javaMajor: 21,
      settings: {
        memory: 6,
        recordFps: true,
        performanceBaselineSessionId: "session-1",
        servers: [
          { id: "server-1", name: "Community SMP", address: "play.example.net" },
          { id: "server-2", name: "Creative Lab", address: "creative.example.net" },
        ],
        selectedServerId: "server-1",
      },
      lastPerformance: performance,
      health: {
        instanceId: "vanilla-start",
        checkedAt: "2026-07-30T07:45:00.000Z",
        status: "healthy",
        canLaunch: true,
        blocker: null,
        requiresInstall: false,
        repairNeeded: false,
        checks: [
          { code: "java", status: "pass" },
          { code: "disk", status: "pass" },
          { code: "memory", status: "pass" },
        ],
      },
    },
    {
      id: "create-perfect",
      name: "Create: Perfect World",
      version: "1.20.1",
      loader: "Fabric",
      description: "Engineering, exploration, and automation",
      color: "cyan",
      glyph: "CR",
      favorite: false,
      status: "ready",
      lastPlayed: "Yesterday",
      playtimeMinutes: 1_420,
      modCount: 96,
      resolvedVersionId: "fabric-loader-0.16.14-1.20.1",
      installedAt: "2026-07-12T14:30:00.000Z",
      javaMajor: 17,
    },
    {
      id: "cobblemon",
      name: "Cobblemon",
      version: "1.21.1",
      loader: "Fabric",
      description: "Explore, collect, and battle",
      color: "violet",
      glyph: "CB",
      favorite: false,
      status: "setup",
      lastPlayed: "Never played",
      playtimeMinutes: 0,
      modCount: 0,
    },
  ],
  downloads: [
    {
      id: "download-1",
      name: "Sodium",
      subtitle: "Installed in Pure Game",
      progress: 100,
      status: "done",
      createdAt: "2026-07-30T07:20:00.000Z",
    },
  ],
  sessions: [
    {
      id: "session-1",
      instanceId: "vanilla-start",
      instanceName: "Pure Game",
      startedAt: "2026-07-30T06:20:00.000Z",
      endedAt: "2026-07-30T07:41:00.000Z",
      durationMinutes: 81,
      exitCode: 0,
      performance,
    },
    {
      id: "session-2",
      instanceId: "vanilla-start",
      instanceName: "Pure Game",
      startedAt: "2026-07-28T17:00:00.000Z",
      endedAt: "2026-07-28T17:54:00.000Z",
      durationMinutes: 54,
      exitCode: 0,
      performance: {
        ...performance,
        peakRssBytes: 4_724_465_664,
        averageCpuPercent: 28.1,
        startupMs: 19_100,
        fps: { ...performance.fps, averageFps: 139, onePercentLowFps: 88 },
      },
    },
  ],
};

const shots = [
  ["home.png", ""],
  ["library.png", "Library"],
  ["discover.png", "Discover"],
  ["onyx-picks.png", "Onyx Picks"],
  ["instance.png", "Library>instance-vanilla-start"],
  ["settings.png", "Settings"],
  ["profiles-and-skins.png", "Profiles & skins"],
];

fs.rmSync(fixtureRoot, { recursive: true, force: true });
fs.mkdirSync(fixtureRoot, { recursive: true });
fs.mkdirSync(artifactsRoot, { recursive: true });
fs.writeFileSync(path.join(fixtureRoot, "state.json"), JSON.stringify(state, null, 2));
fs.writeFileSync(
  path.join(fixtureRoot, "account.json"),
  JSON.stringify(
    {
      version: 4,
      activeId: null,
      accounts: [
        {
          profile: { name: "Alex", kind: "offline", skins: [] },
          signedInAt: "2026-07-30T07:00:00.000Z",
        },
      ],
    },
    null,
    2,
  ),
);

for (const [filename, target] of shots) {
  const destination = path.join(artifactsRoot, filename);
  const result = spawnSync(electron, [projectRoot], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ONYX_USER_DATA: fixtureRoot,
      ONYX_DATA_ROOT: path.join(fixtureRoot, "data"),
      ONYX_CAPTURE_PATH: destination,
      ONYX_CAPTURE_TARGET: target,
    },
    encoding: "utf8",
    timeout: 45_000,
  });

  if (result.status !== 0 || !fs.existsSync(destination)) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`Failed to capture ${filename}`);
  }
  process.stdout.write(`Captured ${path.relative(projectRoot, destination)}\n`);
}

fs.rmSync(fixtureRoot, { recursive: true, force: true });