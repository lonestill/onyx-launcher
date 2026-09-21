const CSV_HEADER = "Session Date,Duration (s),Average FPS,1% Low FPS,Provider";

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
      const fps = session.performance.fps;
      return [
        session.endedAt || session.startedAt || "",
        Math.round((session.durationMinutes || 0) * 60),
        fps?.available && fps.averageFps != null
          ? Math.round(fps.averageFps)
          : "",
        fps?.available && fps.onePercentLowFps != null
          ? Math.round(fps.onePercentLowFps)
          : "",
        fps?.available ? providerLabel(fps.provider) : "",
      ]
        .map(csvField)
        .join(",");
    });
  return [CSV_HEADER, ...rows].join("\r\n") + "\r\n";
}

module.exports = { buildPerformanceCsv, CSV_HEADER };
