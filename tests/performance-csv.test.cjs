const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPerformanceCsv,
  CSV_HEADER,
} = require("../electron/services/performance-csv.cjs");

test("performance csv: header only when no sessions", () => {
  assert.equal(buildPerformanceCsv([]), CSV_HEADER + "\r\n");
});

test("performance csv: skips sessions without recorded performance", () => {
  const csv = buildPerformanceCsv([
    { endedAt: "2026-01-01T00:00:00.000Z", durationMinutes: 5 },
    { endedAt: "2026-01-02T00:00:00.000Z", performance: { available: false } },
  ]);
  assert.equal(csv, CSV_HEADER + "\r\n");
});

test("performance csv: formats a full row with hardware and fps metrics", () => {
  const csv = buildPerformanceCsv([
    {
      endedAt: "2026-01-01T12:00:00.000Z",
      durationMinutes: 2.5,
      exitCode: 0,
      performance: {
        available: true,
        durationMs: 150_000,
        peakRssBytes: 1536 * 1024 * 1024,
        averageRssBytes: 800 * 1024 * 1024,
        averageCpuPercent: 166.1,
        peakCpuPercent: 437.4,
        startupMs: 10_000,
        worldReadyMs: 15_500,
        recommendedMemoryGiB: 2,
        gcEvents: 3,
        maxGcPauseMs: 12.4,
        fps: {
          available: true,
          averageFps: 119.6,
          onePercentLowFps: 87.2,
          provider: "mangohud",
        },
      },
    },
  ]);
  assert.equal(
    csv,
    `${CSV_HEADER}\r\n2026-01-01T12:00:00.000Z,150,1536,800,166.1,437.4,10,15.5,2,3,12,120,87,MangoHud,0\r\n`,
  );
});

test("performance csv: leaves FPS fields blank when FPS wasn't captured", () => {
  const csv = buildPerformanceCsv([
    {
      endedAt: "2026-01-01T12:00:00.000Z",
      durationMinutes: 1,
      exitCode: 0,
      performance: {
        available: true,
        durationMs: 25_000,
        peakRssBytes: 1500 * 1024 * 1024,
        averageRssBytes: 800 * 1024 * 1024,
        averageCpuPercent: 166.1,
        peakCpuPercent: 437.4,
        startupMs: 10_000,
        recommendedMemoryGiB: 2,
        gcEvents: 0,
        maxGcPauseMs: 0,
        fps: { available: false },
      },
    },
  ]);
  assert.equal(
    csv,
    `${CSV_HEADER}\r\n2026-01-01T12:00:00.000Z,25,1500,800,166.1,437.4,10,,2,0,0,,,,0\r\n`,
  );
});

test("performance csv: escapes commas and quotes per RFC-4180", () => {
  const csv = buildPerformanceCsv([
    {
      endedAt: 'weird,"date"',
      durationMinutes: 1,
      exitCode: 0,
      performance: {
        available: true,
        durationMs: 60_000,
        fps: { available: false },
      },
    },
  ]);
  assert.equal(
    csv,
    `${CSV_HEADER}\r\n"weird,""date""",60,,,,,,,,,,,,,0\r\n`,
  );
});

