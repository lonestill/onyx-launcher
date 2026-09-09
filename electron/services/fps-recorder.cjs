const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { fetchJson, downloadFile } = require('./network.cjs');

const PRESENTMON_RELEASE_ENDPOINT =
  'https://api.github.com/repos/GameTechDev/PresentMon/releases/latest';
const PRESENTMON_ASSET_NAME = /^PresentMon(?:-[A-Za-z0-9._-]+)?-x64\.exe$/i;

function selectPresentMonAsset(release) {
  const asset = Array.isArray(release?.assets)
    ? release.assets.find((candidate) => {
        if (!PRESENTMON_ASSET_NAME.test(String(candidate?.name || ''))) {
          return false;
        }
        const url = String(candidate?.browser_download_url || '');
        try {
          const parsed = new URL(url);
          return (
            parsed.protocol === 'https:' &&
            parsed.hostname === 'github.com' &&
            parsed.pathname.startsWith(
              '/GameTechDev/PresentMon/releases/download/',
            )
          );
        } catch {
          return false;
        }
      })
    : null;
  if (!asset || !Number.isFinite(Number(asset.size)) || asset.size < 1) {
    throw new Error('The official PresentMon release does not contain an x64 binary');
  }
  if (Number(asset.size) > 200 * 1024 * 1024) {
    throw new Error('The PresentMon file from the official release is too large');
  }
  return asset;
}

async function installPresentMon({
  destination,
  onProgress,
  fetchRelease = fetchJson,
  download = downloadFile,
} = {}) {
  if (!destination) throw new Error('The PresentMon installation path was not provided');
  const release = await fetchRelease(PRESENTMON_RELEASE_ENDPOINT);
  const asset = selectPresentMonAsset(release);
  const digest = String(asset.digest || '');
  const sha256 = /^sha256:([a-f0-9]{64})$/i.exec(digest)?.[1];
  await download({
    url: asset.browser_download_url,
    destination,
    size: Number(asset.size),
    sha256,
    onProgress,
  });
  return {
    destination,
    version: String(release.tag_name || asset.name),
  };
}

function executableCandidates(name, { platform = process.platform, env = process.env } = {}) {
  const extensions =
    platform === "win32"
      ? String(env.PATHEXT || ".EXE;.CMD;.BAT")
          .split(";")
          .filter(Boolean)
      : [""];
  const hasExtension = Boolean(path.extname(name));
  const names = hasExtension
    ? [name]
    : extensions.map((extension) => `${name}${extension.toLowerCase()}`);
  return String(env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((directory) => names.map((entry) => path.join(directory, entry)));
}

async function firstExecutable(candidates, platform = process.platform) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await fsp.access(
        candidate,
        platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK,
      );
      return path.resolve(candidate);
    } catch {
      // Try the next well-known location.
    }
  }
  return null;
}

const ONYX_AGENT_JAR = path.resolve(__dirname, "..", "tools", "onyx-fps-agent.jar");

async function detectFpsRecorder({
  platform = process.platform,
  env = process.env,
  presentMonPath = null,
} = {}) {
  const hasAgent = fs.existsSync(ONYX_AGENT_JAR);

  if (platform === "linux") {
    const executable = await firstExecutable(
      [
        env.ONYX_MANGOHUD_PATH,
        ...executableCandidates("mangohud", { platform, env }),
        "/usr/bin/mangohud",
        "/usr/local/bin/mangohud",
      ],
      platform,
    );
    if (executable) {
      return {
        available: true,
        provider: "mangohud",
        name: "MangoHud",
        executable,
        platform,
        installHint: "sudo pacman -S mangohud",
        installable: false,
      };
    }
    if (hasAgent) {
      return {
        available: true,
        provider: "onyx-agent",
        name: "Onyx Probe",
        executable: ONYX_AGENT_JAR,
        platform,
        installHint: null,
        installable: false,
      };
    }
    return {
      available: false,
      provider: null,
      name: "MangoHud",
      executable: null,
      platform,
      installHint: "sudo pacman -S mangohud",
      installable: false,
    };
  }

  if (platform === "win32") {
    const programFiles = env.ProgramFiles || env.PROGRAMFILES;
    const localAppData = env.LOCALAPPDATA;
    const executable = await firstExecutable(
      [
        env.ONYX_PRESENTMON_PATH,
        presentMonPath,
        ...executableCandidates("PresentMon.exe", { platform, env }),
        programFiles && path.join(programFiles, "Intel", "PresentMon", "PresentMon.exe"),
        programFiles && path.join(programFiles, "PresentMon", "PresentMon.exe"),
        localAppData &&
          path.join(localAppData, "Intel", "PresentMon", "PresentMon.exe"),
      ],
      platform,
    );
    if (executable) {
      return {
        available: true,
        provider: "presentmon",
        name: "PresentMon",
        executable,
        platform,
        installHint: "PresentMon",
        installable: false,
      };
    }
    if (hasAgent) {
      return {
        available: true,
        provider: "onyx-agent",
        name: "Onyx Probe",
        executable: ONYX_AGENT_JAR,
        platform,
        installHint: null,
        installable: false,
      };
    }
    return {
      available: false,
      provider: null,
      name: "PresentMon",
      executable: null,
      platform,
      installHint: "PresentMon",
      installable: true,
    };
  }

  if (hasAgent) {
    return {
      available: true,
      provider: "onyx-agent",
      name: "Onyx Probe",
      executable: ONYX_AGENT_JAR,
      platform,
      installHint: null,
      installable: false,
    };
  }

  return {
    available: false,
    provider: null,
    name: null,
    executable: null,
    platform,
    installHint: null,
    installable: false,
  };
}

function parseCsvLine(line) {
  const fields = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  fields.push(value.trim());
  return fields;
}

function normalizedColumn(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index];
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function downsampleFpsTimeline(values, limit = 80) {
  if (values.length <= limit) return values;
  const result = [];
  const bucketSize = values.length / limit;
  for (let bucket = 0; bucket < limit; bucket += 1) {
    const start = Math.floor(bucket * bucketSize);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * bucketSize));
    const slice = values.slice(start, end);
    result.push({
      atSeconds: slice[Math.floor(slice.length / 2)]?.atSeconds || 0,
      fps: average(slice.map((sample) => sample.fps)),
      frameTimeMs: average(slice.map((sample) => sample.frameTimeMs)),
    });
  }
  return result;
}

function parseFpsCsv(text, { provider = null, sampleIntervalMs = 500 } = {}) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  let headerIndex = -1;
  let columns = [];
  for (let index = 0; index < lines.length; index += 1) {
    const candidate = parseCsvLine(lines[index]).map(normalizedColumn);
    if (
      candidate.some((column) =>
        [
          "fps",
          "msbetweenpresents",
          "frametime",
          "frametimems",
          "displayedtime",
        ].includes(column),
      )
    ) {
      headerIndex = index;
      columns = candidate;
      break;
    }
  }
  if (headerIndex < 0) return null;

  const indexOf = (...names) =>
    columns.findIndex((column) => names.includes(column));
  const fpsIndex = indexOf("fps");
  const frameTimeIndex = indexOf(
    "msbetweenpresents",
    "frametime",
    "frametimems",
    "displayedtime",
  );
  const secondsIndex = indexOf("timeinseconds", "elapsedseconds", "seconds");
  const samples = [];
  let firstSeconds = null;

  for (const line of lines.slice(headerIndex + 1)) {
    const row = parseCsvLine(line);
    const directFps = fpsIndex >= 0 ? Number(row[fpsIndex]) : Number.NaN;
    const directFrameTime =
      frameTimeIndex >= 0 ? Number(row[frameTimeIndex]) : Number.NaN;
    const fps =
      Number.isFinite(directFps) && directFps > 0
        ? directFps
        : Number.isFinite(directFrameTime) && directFrameTime > 0
          ? 1_000 / directFrameTime
          : Number.NaN;
    if (!Number.isFinite(fps) || fps <= 0 || fps > 2_000) continue;
    const frameTimeMs =
      Number.isFinite(directFrameTime) && directFrameTime > 0
        ? directFrameTime
        : 1_000 / fps;
    const seconds =
      secondsIndex >= 0 ? Number(row[secondsIndex]) : Number.NaN;
    if (Number.isFinite(seconds) && firstSeconds == null) firstSeconds = seconds;
    samples.push({
      atSeconds:
        Number.isFinite(seconds) && firstSeconds != null
          ? Math.max(0, seconds - firstSeconds)
          : (samples.length * sampleIntervalMs) / 1_000,
      fps,
      frameTimeMs,
    });
  }
  if (!samples.length) return null;

  const fpsValues = samples.map((sample) => sample.fps);
  const sortedFps = [...fpsValues].sort((left, right) => left - right);
  const sortedFrameTimes = samples
    .map((sample) => sample.frameTimeMs)
    .sort((left, right) => left - right);
  const slowSampleCount = Math.max(1, Math.ceil(sortedFps.length * 0.01));
  const medianFrameTimeMs = percentile(sortedFrameTimes, 0.5);
  const stutterThresholdMs = Math.max(50, medianFrameTimeMs * 2.5);

  return {
    requested: true,
    available: true,
    provider,
    averageFps: average(fpsValues),
    onePercentLowFps: average(sortedFps.slice(0, slowSampleCount)),
    minimumFps: sortedFps[0],
    frameTimeP99Ms: percentile(sortedFrameTimes, 0.99),
    stutterCount: sortedFrameTimes.filter(
      (frameTime) => frameTime > stutterThresholdMs,
    ).length,
    sampleCount: samples.length,
    timeline: downsampleFpsTimeline(samples),
    error: null,
  };
}

function buildFpsInsights(summary) {
  if (!summary?.available) return [];
  const insights = [];
  if (summary.averageFps < 45) {
    insights.push({
      code: "low-fps",
      severity: "warning",
      value: summary.averageFps,
    });
  }
  if (
    summary.averageFps >= 30 &&
    summary.onePercentLowFps < summary.averageFps * 0.55
  ) {
    insights.push({
      code: "fps-instability",
      severity: "warning",
      value: summary.onePercentLowFps,
    });
  }
  if (
    summary.sampleCount >= 100 &&
    summary.stutterCount / summary.sampleCount >= 0.02
  ) {
    insights.push({
      code: "frame-stutters",
      severity: "warning",
      value: summary.stutterCount,
    });
  }
  return insights;
}

async function listCsvFiles(directory) {
  try {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listCsvFiles(fullPath)));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv")) {
        const stats = await fsp.stat(fullPath).catch(() => null);
        if (stats) files.push({ path: fullPath, modifiedAt: stats.mtimeMs });
      }
    }
    return files;
  } catch {
    return [];
  }
}

class FpsRecorder {
  constructor({
    enabled = false,
    outputDirectory,
    platform = process.platform,
    env = process.env,
    presentMonPath = null,
    sampleIntervalMs = 500,
  }) {
    this.enabled = Boolean(enabled);
    this.outputDirectory = outputDirectory;
    this.platform = platform;
    this.env = env;
    this.presentMonPath = presentMonPath;
    this.sampleIntervalMs = sampleIntervalMs;
    this.status = null;
    this.presentMon = null;
    this.presentMonClosed = null;
    this.outputFile = path.join(outputDirectory, "presentmon.csv");
  }

  async prepare() {
    if (!this.enabled) return { wrapper: null, status: null };
    this.status = await detectFpsRecorder({
      platform: this.platform,
      env: this.env,
      presentMonPath: this.presentMonPath,
    });
    if (!this.status.available) {
      return { wrapper: null, status: this.status };
    }
    await fsp.mkdir(this.outputDirectory, { recursive: true });
    if (this.status.provider === "mangohud") {
      const config = [
        "no_display",
        "autostart_log=1",
        `log_interval=${this.sampleIntervalMs}`,
        `fps_sampling_period=${this.sampleIntervalMs}`,
        `output_folder=${this.outputDirectory}`,
      ].join(",");
      return {
        status: this.status,
        wrapper: {
          executable: this.status.executable,
          argsBeforeExecutable: ["--dlsym"],
          env: {
            MANGOHUD: "1",
            MANGOHUD_DLSYM: "1",
            MANGOHUD_CONFIG: config,
          },
        },
        extraJvmArguments: [],
      };
    }
    if (this.status.provider === "onyx-agent") {
      return {
        status: this.status,
        wrapper: null,
        extraJvmArguments: [
          `-javaagent:${this.status.executable}=${this.outputFile}`,
        ],
      };
    }
    return { wrapper: null, status: this.status, extraJvmArguments: [] };
  }

  attach(pid) {
    if (
      !this.enabled ||
      !this.status?.available ||
      this.status.provider !== "presentmon" ||
      !Number.isInteger(pid) ||
      pid <= 0
    ) {
      return;
    }
    try {
      this.presentMon = spawn(
        this.status.executable,
        [
          "--process_id",
          String(pid),
          "--output_file",
          this.outputFile,
          "--no_console_stats",
          "--exclude_dropped",
          "--terminate_on_proc_exit",
          "--v1_metrics",
        ],
        {
          windowsHide: true,
          stdio: "ignore",
          env: { ...this.env },
        },
      );
      this.presentMonClosed = new Promise((resolve) => {
        this.presentMon.once("close", resolve);
        this.presentMon.once("error", resolve);
      });
    } catch {
      this.presentMon = null;
      this.presentMonClosed = null;
    }
  }

  async stop() {
    const finish = async (summary) => {
      await fsp
        .rm(this.outputDirectory, { recursive: true, force: true })
        .catch(() => undefined);
      return summary;
    };
    if (!this.enabled) {
      return {
        requested: false,
        available: false,
        provider: null,
        error: null,
      };
    }
    if (!this.status?.available) {
      return finish({
        requested: true,
        available: false,
        provider: null,
        error: "provider-unavailable",
      });
    }
    if (this.presentMon && this.presentMon.exitCode == null) {
      if (this.presentMonClosed) {
        await Promise.race([
          this.presentMonClosed,
          new Promise((resolve) => setTimeout(resolve, 1_000)),
        ]);
      }
      if (this.presentMon.exitCode == null) {
        this.presentMon.kill();
        if (this.presentMonClosed) {
          await Promise.race([
            this.presentMonClosed,
            new Promise((resolve) => setTimeout(resolve, 1_000)),
          ]);
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    const csvFiles =
      this.status.provider === "presentmon" ||
      this.status.provider === "onyx-agent"
        ? [{ path: this.outputFile, modifiedAt: Date.now() }]
        : await listCsvFiles(this.outputDirectory);
    csvFiles.sort((left, right) => right.modifiedAt - left.modifiedAt);
    for (const file of csvFiles) {
      const text = await fsp.readFile(file.path, "utf8").catch(() => "");
      const summary = parseFpsCsv(text, {
        provider: this.status.provider,
        sampleIntervalMs: this.sampleIntervalMs,
      });
      if (summary) return finish(summary);
    }
    return finish({
      requested: true,
      available: false,
      provider: this.status.provider,
      error: "no-fps-data",
    });
  }
}

module.exports = {
  PRESENTMON_RELEASE_ENDPOINT,
  selectPresentMonAsset,
  installPresentMon,
  detectFpsRecorder,
  parseCsvLine,
  parseFpsCsv,
  downsampleFpsTimeline,
  buildFpsInsights,
  FpsRecorder,
};
