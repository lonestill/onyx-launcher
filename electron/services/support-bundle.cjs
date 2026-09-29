const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { ZipArchive } = require("archiver");

const SUPPORT_FORMAT_VERSION = 1;

function sanitizeSupportText(content, maxLength = 120_000) {
  return String(content || "")
    .replace(
      /(--(?:accessToken|username|uuid|userProperties)(?:=|\s+))(?:"[^"]*"|\S+)/gi,
      "$1<redacted>",
    )
    .replace(
      /("(?:access_token|refresh_token|client_secret|authorization|token)"\s*:\s*)"[^"]*"/gi,
      '$1"<redacted>"',
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>")
    .replace(/[A-Za-z]:\\Users\\[^\\\s"']+/gi, "C:\\Users\\<user>")
    .replace(/\/(?:home|Users)\/[^/\s"']+/g, "/home/<user>")
    .replace(/([?&](?:code|token|access_token|refresh_token)=)[^&\s]+/gi, "$1<redacted>")
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "<email>",
    )
    .replace(
      /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
      "<ip>",
    )
    .slice(-Math.max(1, maxLength));
}

function sanitizeValue(value) {
  if (typeof value === "string") return sanitizeSupportText(value, 20_000);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !/(?:access|refresh|client.?secret|authorization|account|profile.?name)/i.test(
            key,
          ),
      )
      .map(([key, item]) => [key, sanitizeValue(item)]),
  );
}

function safeInstance(instance) {
  const settings = instance?.settings || {};
  return sanitizeValue({
    id: instance.id,
    name: instance.name,
    minecraftVersion: instance.version,
    loader: instance.loader,
    resolvedVersionId: instance.resolvedVersionId || null,
    status: instance.status,
    modCount: instance.modCount,
    lastExitCode: instance.lastExitCode ?? null,
    lastError: instance.lastError || null,
    installedAt: instance.installedAt || null,
    settings: {
      memory: settings.memory,
      windowWidth: settings.windowWidth,
      windowHeight: settings.windowHeight,
      fullscreen: settings.fullscreen,
      recordFps: settings.recordFps,
      jvmArguments: settings.jvmArguments,
    },
    health: instance.health || null,
    lastDiagnosis: instance.lastDiagnosis || null,
    lastPerformance: instance.lastPerformance || null,
  });
}

function safeDiagnostics(diagnostics) {
  if (!diagnostics) return null;
  return sanitizeValue({
    generatedAt: diagnostics.generatedAt,
    launcher: diagnostics.launcher,
    system: diagnostics.system,
    storage: diagnostics.storage,
    java: diagnostics.java,
    profile: {
      kind: diagnostics.profile?.kind || "unknown",
    },
    counts: diagnostics.counts,
    endpoints: diagnostics.endpoints,
  });
}

function buildSupportManifest({
  instance,
  sessions = [],
  diagnostics,
  analysis = [],
  now = () => new Date(),
}) {
  return {
    formatVersion: SUPPORT_FORMAT_VERSION,
    launcher: "onyx",
    exportedAt: now().toISOString(),
    privacy: {
      accountTokensIncluded: false,
      accountNameIncluded: false,
      serverListIncluded: false,
      personalPathsRedacted: true,
      logLimitBytes: 120_000,
    },
    instance: safeInstance(instance),
    analysis: sanitizeValue(analysis),
    recentSessions: sessions.slice(0, 10).map((session) =>
      sanitizeValue({
        id: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationMinutes: session.durationMinutes,
        exitCode: session.exitCode,
        performance: session.performance || null,
      }),
    ),
    diagnostics: safeDiagnostics(diagnostics),
  };
}

async function createSupportBundle({
  destination,
  instance,
  sessions,
  diagnostics,
  logContent,
  analysis,
  now,
}) {
  const outputPath = path.resolve(destination);
  const temporaryPath = `${outputPath}.part`;
  const manifest = buildSupportManifest({
    instance,
    sessions,
    diagnostics,
    analysis,
    now,
  });
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.rm(temporaryPath, { force: true }).catch(() => {});

  try {
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(temporaryPath);
      const archive = new ZipArchive({ zlib: { level: 6 } });
      output.once("close", resolve);
      output.once("error", reject);
      archive.once("error", reject);
      archive.pipe(output);
      archive.append(`${JSON.stringify(manifest, null, 2)}\n`, {
        name: "onyx-support.json",
      });
      archive.append(
        sanitizeSupportText(logContent) || "No launch log was available.\n",
        { name: "latest-launch.log.txt" },
      );
      archive.append(
        [
          "Scope Launcher support bundle",
          "",
          "This archive is safe to share for troubleshooting.",
          "Account tokens, the account name, saved servers, and personal home paths are not included.",
          "onyx-support.json contains system and launch metadata.",
          "latest-launch.log.txt contains the sanitized tail of the latest game log.",
          "",
        ].join("\n"),
        { name: "README.txt" },
      );
      void archive.finalize();
    });
    await fsp.rm(outputPath, { force: true }).catch(() => {});
    await fsp.rename(temporaryPath, outputPath);
    const stat = await fsp.stat(outputPath);
    return {
      path: outputPath,
      bytes: stat.size,
      files: 3,
    };
  } catch (error) {
    await fsp.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = {
  buildSupportManifest,
  createSupportBundle,
  sanitizeSupportText,
};
