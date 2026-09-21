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

test("performance csv: formats a full row", () => {
  const csv = buildPerformanceCsv([
    {
      endedAt: "2026-01-01T12:00:00.000Z",
      durationMinutes: 2.5,
      performance: {
        available: true,
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
    `${CSV_HEADER}\r\n2026-01-01T12:00:00.000Z,150,120,87,MangoHud\r\n`,
  );
});

test("performance csv: leaves FPS fields blank when FPS wasn't captured", () => {
  const csv = buildPerformanceCsv([
    {
      endedAt: "2026-01-01T12:00:00.000Z",
      durationMinutes: 1,
      performance: { available: true, fps: { available: false } },
    },
  ]);
  assert.equal(csv, `${CSV_HEADER}\r\n2026-01-01T12:00:00.000Z,60,,,\r\n`);
});

test("performance csv: escapes commas and quotes per RFC-4180", () => {
  const csv = buildPerformanceCsv([
    {
      endedAt: 'weird,"date"',
      durationMinutes: 1,
      performance: { available: true, fps: { available: false } },
    },
  ]);
  assert.equal(
    csv,
    `${CSV_HEADER}\r\n"weird,""date""",60,,,\r\n`,
  );
});
