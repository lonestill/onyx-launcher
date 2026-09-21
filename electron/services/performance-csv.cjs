const CSV_HEADER = [
  "Session Date",
  "Duration (s)",
  "Peak RAM (MB)",
  "Avg RAM (MB)",
  "Avg CPU (%)",
  "Peak CPU (%)",
  "Client Startup (s)",
  "World Load (s)",
  "RAM Recommendation (GB)",
  "GC Events",
  "Max GC Pause (ms)",
  "Average FPS",
  "1% Low FPS",
  "FPS Provider",
  "Exit Code",
].join(",");

function csvField(value) {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function providerLabel(provider) {
  if (provider === "mangohud") return "MangoHud";
  if (provider === "onyx-agent") return "Onyx Probe";
  return "";
}

function buildPerformanceCsv(sessions) {
  const rows = (sessions || [])
    .filter((session) => session.performance?.available)
    .map((session) => {
      const perf = session.performance;
      const fps = perf?.fps;
      const durationSeconds = perf?.durationMs
        ? Math.round(perf.durationMs / 1000)
        : Math.round((session.durationMinutes || 0) * 60);

      return [
        session.endedAt || session.startedAt || "",
        durationSeconds,
        perf?.peakRssBytes ? Math.round(perf.peakRssBytes / (1024 * 1024)) : "",
        perf?.averageRssBytes ? Math.round(perf.averageRssBytes / (1024 * 1024)) : "",
        perf?.averageCpuPercent != null ? perf.averageCpuPercent : "",
        perf?.peakCpuPercent != null ? perf.peakCpuPercent : "",
        perf?.startupMs != null ? Number((perf.startupMs / 1000).toFixed(1)) : "",
        perf?.worldReadyMs != null ? Number((perf.worldReadyMs / 1000).toFixed(1)) : "",
        perf?.recommendedMemoryGiB != null ? perf.recommendedMemoryGiB : "",
        perf?.gcEvents != null ? perf.gcEvents : "",
        perf?.maxGcPauseMs != null ? Math.round(perf.maxGcPauseMs) : "",
        fps?.available && fps.averageFps != null ? Math.round(fps.averageFps) : "",
        fps?.available && fps.onePercentLowFps != null ? Math.round(fps.onePercentLowFps) : "",
        fps?.available ? providerLabel(fps.provider) : "",
        session.exitCode != null ? session.exitCode : "",
      ]
        .map(csvField)
        .join(",");
    });
  return [CSV_HEADER, ...rows].join("\r\n") + "\r\n";
}

module.exports = { buildPerformanceCsv, CSV_HEADER };

