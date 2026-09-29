const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn, exec } = require("node:child_process");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

let electron = null;
try {
  const e = require("electron");
  if (typeof e === "object" && e !== null) {
    electron = e;
  }
} catch {
  // Pure node environment
}

const { USER_AGENT, calculateSpeed, calculateEta } = require("./network.cjs");

const GITHUB_RELEASES_LATEST_URL =
  "https://api.github.com/repos/lonestill/scope-launcher/releases/latest";

function cleanVersion(v) {
  if (!v) return "0.0.0";
  return String(v).trim().replace(/^v/i, "");
}

function parseSemver(v) {
  const cleaned = cleanVersion(v);
  const [versionCore, prerelease] = cleaned.split("-");
  const parts = versionCore.split(".").map((p) => {
    const num = parseInt(p, 10);
    return Number.isNaN(num) ? 0 : num;
  });
  while (parts.length < 3) parts.push(0);
  return {
    major: parts[0],
    minor: parts[1],
    patch: parts[2],
    prerelease: prerelease ? prerelease.split(".") : null,
  };
}

function compareVersions(v1, v2) {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && !p2.prerelease) return -1;
  if (p1.prerelease && p2.prerelease) {
    const len = Math.max(p1.prerelease.length, p2.prerelease.length);
    for (let i = 0; i < len; i++) {
      if (p1.prerelease[i] === undefined) return -1;
      if (p2.prerelease[i] === undefined) return 1;
      const part1 = p1.prerelease[i];
      const part2 = p2.prerelease[i];
      const num1 = Number(part1);
      const num2 = Number(part2);
      if (!Number.isNaN(num1) && !Number.isNaN(num2)) {
        if (num1 !== num2) return num1 > num2 ? 1 : -1;
      } else {
        const cmp = String(part1).localeCompare(String(part2));
        if (cmp !== 0) return cmp > 0 ? 1 : -1;
      }
    }
  }
  return 0;
}

function normalizePlatform(platform = process.platform) {
  const p = String(platform || "").toLowerCase();
  if (p.startsWith("win")) return "win32";
  if (p.startsWith("mac") || p === "darwin") return "darwin";
  return "linux";
}

function selectAsset(assets = [], platform = process.platform) {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  const normPlatform = normalizePlatform(platform);

  if (normPlatform === "win32") {
    // Windows: .exe (installer or portable)
    const exes = assets.filter(
      (a) => a && typeof a.name === "string" && a.name.toLowerCase().endsWith(".exe")
    );
    if (exes.length === 0) return null;
    const setup = exes.find((a) => /setup|installer/i.test(a.name));
    return setup || exes[0];
  }

  if (normPlatform === "darwin") {
    // macOS: .dmg or .zip
    const dmgs = assets.filter(
      (a) => a && typeof a.name === "string" && a.name.toLowerCase().endsWith(".dmg")
    );
    if (dmgs.length > 0) return dmgs[0];
    const zips = assets.filter(
      (a) => a && typeof a.name === "string" && a.name.toLowerCase().endsWith(".zip")
    );
    return zips[0] || null;
  }

  if (normPlatform === "linux") {
    // Linux in-app updater strictly targets .AppImage because .tar.gz archives cannot be self-installed in-place.
    const appImages = assets.filter(
      (a) => a && typeof a.name === "string" && a.name.toLowerCase().endsWith(".appimage")
    );
    return appImages[0] || null;
  }

  return null;
}

function parseRelease(releaseData, currentVersion, platform = process.platform) {
  if (!releaseData || typeof releaseData !== "object") {
    throw new Error("Invalid release data");
  }
  const rawTag = releaseData.tag_name || releaseData.name || "";
  const latestVersion = cleanVersion(rawTag);
  const curVersion = cleanVersion(currentVersion);
  const updateAvailable = compareVersions(latestVersion, curVersion) > 0;
  const asset = selectAsset(releaseData.assets || [], platform);

  return {
    updateAvailable,
    currentVersion: curVersion,
    latestVersion,
    releaseName: releaseData.name || rawTag,
    releaseNotes: releaseData.body || "",
    publishedAt: releaseData.published_at || "",
    downloadUrl: asset ? asset.browser_download_url : null,
    assetName: asset ? asset.name : null,
    assetSize: asset ? Number(asset.size) || 0 : 0,
  };
}

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

async function checkForUpdate(currentVersion, options = {}) {
  const url = options.url || GITHUB_RELEASES_LATEST_URL;
  const platform = options.platform || process.platform;
  const fetchFn = options.fetch || fetch;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const headers = {
        "User-Agent": options.userAgent || USER_AGENT,
        Accept: "application/vnd.github.v3+json",
        ...(options.headers || {}),
      };

      // Conditional request via ETag to avoid wasting rate limit
      if (options.etag) {
        headers["If-None-Match"] = options.etag;
      }

      const response = await fetchFn(url, {
        headers,
        signal: options.signal,
      });

      // GitHub rate limit exhausted
      if (response.status === 403) {
        const remaining = response.headers?.get?.("x-ratelimit-remaining");
        const resetEpoch = response.headers?.get?.("x-ratelimit-reset");
        if (remaining === "0" || remaining === 0) {
          const resetDate = resetEpoch ? new Date(Number(resetEpoch) * 1000) : null;
          const resetStr = resetDate ? ` Resets at ${resetDate.toLocaleTimeString()}.` : "";
          throw new Error(`GitHub API rate limit exceeded.${resetStr} Try again later.`);
        }
        throw new Error(`GitHub release check failed: HTTP 403 Forbidden`);
      }

      // 304 Not Modified — no new release since last ETag
      if (response.status === 304) {
        return { updateAvailable: false, notModified: true };
      }

      if (!response.ok) {
        // 5xx = retriable, 4xx (except 403/304) = not retriable
        if (response.status >= 500 && attempt < maxRetries) {
          lastError = new Error(`GitHub release check failed: HTTP ${response.status}`);
          await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`GitHub release check failed: HTTP ${response.status}`);
      }

      const releaseData = await response.json();
      const result = parseRelease(releaseData, currentVersion, platform);

      // Capture ETag for conditional requests
      const etag = response.headers?.get?.("etag");
      if (etag) {
        result.etag = etag;
      }

      return result;
    } catch (err) {
      // Don't retry AbortError or rate limit
      if (err.name === "AbortError" || /rate limit/i.test(err.message)) {
        throw err;
      }
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
        continue;
      }
    }
  }

  throw lastError || new Error("Update check failed after retries");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadUpdate({ assetUrl, destination, onProgress, signal, fetchFn = fetch }) {
  if (signal?.aborted) {
    const err = new Error("Download aborted");
    err.name = "AbortError";
    throw err;
  }

  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;
  await fsp.rm(temporary, { force: true }).catch(() => undefined);

  const response = await fetchFn(assetUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "*/*",
    },
    redirect: "follow",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to download update: HTTP ${response.status}`);
  }

  const total = Number(response.headers.get("content-length") || 0);
  let received = 0;
  let lastReport = 0;
  let speedSamples = [];
  let lastSpeedCheck = Date.now();
  let lastSpeedBytes = 0;

  const progressStream = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      const now = Date.now();
      if (now - lastReport > 100 || (total && received >= total)) {
        lastReport = now;
        const elapsed = (now - lastSpeedCheck) / 1000;
        const result = calculateSpeed(speedSamples, received, lastSpeedBytes, elapsed);
        lastSpeedCheck = now;
        lastSpeedBytes = received;
        if (result) speedSamples = result.samples;
        const safeSpeed = result?.speed ?? null;
        const eta = calculateEta(total, received, safeSpeed);
        const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
        onProgress?.({
          received,
          total,
          percent,
          speed: safeSpeed,
          eta,
        });
      }
      callback(null, chunk);
    },
  });

  const writeStream = fs.createWriteStream(temporary);

  const sourceStream =
    typeof Readable.fromWeb === "function" &&
    response.body &&
    !(response.body instanceof Readable)
      ? Readable.fromWeb(response.body)
      : response.body;

  try {
    await pipeline(
      sourceStream,
      progressStream,
      writeStream,
      ...(signal ? [{ signal }] : []),
    );
    await fsp.rm(destination, { force: true }).catch(() => undefined);
    await fsp.rename(temporary, destination);
    const finalPercent = 100;
    onProgress?.({
      received,
      total: total || received,
      percent: finalPercent,
      speed: 0,
      eta: 0,
    });
    return { destination, size: received };
  } catch (err) {
    await fsp.rm(temporary, { force: true }).catch(() => undefined);
    throw err;
  }
}

async function applyUpdate({ filePath, platform = process.platform }) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Update file not found: ${filePath}`);
  }

  const normPlatform = normalizePlatform(platform);

  if (normPlatform === "win32") {
    // Windows: launches installer silently with detached process and calls app.quit()
    const child = spawn(filePath, ["/S"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    if (electron?.app && typeof electron.app.quit === "function") {
      electron.app.quit();
    }
    return true;
  }

  if (normPlatform === "darwin") {
    // macOS: executes open <filePath> (mounts dmg) or opens download folder
    return new Promise((resolve, reject) => {
      exec(`open "${filePath}"`, (err) => {
        if (err) {
          if (electron?.shell && typeof electron.shell.showItemInFolder === "function") {
            electron.shell.showItemInFolder(filePath);
            resolve(true);
          } else {
            reject(err);
          }
        } else {
          resolve(true);
        }
      });
    });
  }

  if (normPlatform === "linux") {
    try {
      await fsp.chmod(filePath, 0o755);
    } catch {
      // ignore chmod error
    }

    if (filePath.toLowerCase().endsWith(".appimage")) {
      let targetLaunch = filePath;
      const currentAppImage = process.env.APPIMAGE;
      if (currentAppImage && fs.existsSync(currentAppImage)) {
        try {
          const backup = `${currentAppImage}.old-${Date.now()}`;
          await fsp.rename(currentAppImage, backup);
          await fsp.copyFile(filePath, currentAppImage);
          await fsp.chmod(currentAppImage, 0o755);
          await fsp.rm(backup, { force: true }).catch(() => undefined);
          targetLaunch = currentAppImage;
        } catch {
          // If in read-only location, launch downloaded file directly
        }
      }

      const child = spawn(targetLaunch, [], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();

      if (electron?.app && typeof electron.app.quit === "function") {
        electron.app.quit();
      }
      return true;
    } else {
      if (electron?.shell && typeof electron.shell.showItemInFolder === "function") {
        electron.shell.showItemInFolder(filePath);
      }
      throw new Error(`Downloaded update (${path.basename(filePath)}) is an archive and cannot be applied in-place. An .AppImage is required for Linux auto-updates.`);
    }
  }

  return false;
}

class UpdaterService {
  constructor({ downloadDirectory, currentVersion } = {}) {
    this.downloadDirectory = downloadDirectory || path.join(os.tmpdir(), "scope-updates");
    this.currentVersion = currentVersion || "0.0.0";
    this.lastCheckResult = null;
    this.downloadedFilePath = null;
    this.downloadAbortController = null;
    this._lastEtag = null;
  }

  async checkForUpdate(currentVersion = this.currentVersion) {
    const version = currentVersion || this.currentVersion;
    const result = await checkForUpdate(version, {
      etag: this._lastEtag,
    });

    // 304 Not Modified — return cached result or "up to date"
    if (result.notModified && this.lastCheckResult) {
      return this.lastCheckResult;
    }

    if (result.etag) {
      this._lastEtag = result.etag;
    }

    this.lastCheckResult = result;
    return result;
  }

  async downloadUpdate({ onProgress, signal } = {}) {
    if (!this.lastCheckResult || !this.lastCheckResult.downloadUrl) {
      const checkResult = await this.checkForUpdate();
      if (!checkResult || !checkResult.downloadUrl) {
        throw new Error("No update asset available to download");
      }
    }

    const { downloadUrl, assetName } = this.lastCheckResult;
    await fsp.mkdir(this.downloadDirectory, { recursive: true });
    const destination = path.join(this.downloadDirectory, assetName || "scope-update-binary");

    this.downloadAbortController = new AbortController();
    const activeSignal = signal || this.downloadAbortController.signal;

    const res = await downloadUpdate({
      assetUrl: downloadUrl,
      destination,
      onProgress,
      signal: activeSignal,
    });

    this.downloadedFilePath = destination;
    return res;
  }

  cancelDownload() {
    if (this.downloadAbortController) {
      this.downloadAbortController.abort();
      this.downloadAbortController = null;
    }
  }

  async applyUpdate(filePath = this.downloadedFilePath) {
    const targetPath = filePath || this.downloadedFilePath;
    if (!targetPath) {
      throw new Error("No update downloaded to install");
    }
    return applyUpdate({ filePath: targetPath, platform: process.platform });
  }
}

module.exports = {
  cleanVersion,
  parseSemver,
  compareVersions,
  normalizePlatform,
  selectAsset,
  parseRelease,
  checkForUpdate,
  downloadUpdate,
  applyUpdate,
  UpdaterService,
};
