"use strict";

/**
 * playit.cjs — Playit.gg Tunnel Manager for Scope Party
 *
 * Provides a universal zero-port-forwarding TCP tunnel for Minecraft LAN worlds
 * when UPnP is unavailable and the host is running pure Vanilla without mods.
 *
 * Supports:
 *   - Auto-downloading standalone playit binary on Windows & Linux
 *   - System PATH detection for macOS/Linux (brew install playit)
 *   - Child process management with graceful shutdown
 *   - Output parsing for assigned tunnel domain and claim URL
 */

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { spawn, execFile } = require("node:child_process");
const { downloadFile } = require("./network.cjs");

const PLAYIT_VERSION = "v1.0.10";
const PLAYIT_BASE_URL = `https://github.com/playit-cloud/playit-agent/releases/download/${PLAYIT_VERSION}`;

let activeProcess = null;
let activeTunnel = null; // { host, port, claimUrl }

function getPlayitBinaryInfo() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "win32") {
    return {
      fileName: "playit-windows-x86_64.exe",
      url: `${PLAYIT_BASE_URL}/playit-windows-x86_64.exe`,
      isExecutable: true,
      supported: true,
    };
  }

  if (platform === "linux") {
    const binName = arch === "arm64" ? "playit-linux-aarch64" : "playit-linux-amd64";
    return {
      fileName: binName,
      url: `${PLAYIT_BASE_URL}/${binName}`,
      isExecutable: true,
      supported: true,
    };
  }

  if (platform === "darwin") {
    // macOS releases are distributed via brew or cargo
    return {
      fileName: "playit",
      url: null,
      isExecutable: true,
      supported: false, // will use system PATH if available
    };
  }

  return { fileName: null, url: null, supported: false };
}

async function findSystemPlayit() {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "where" : "which";
    execFile(cmd, ["playit"], (err, stdout) => {
      if (!err && stdout.trim()) {
        const first = stdout.trim().split(/\r?\n/)[0].trim();
        if (first && fs.existsSync(first)) {
          resolve(first);
          return;
        }
      }
      resolve(null);
    });
  });
}

async function ensurePlayitBinary(storageRoot, onProgress) {
  const systemBin = await findSystemPlayit();
  if (systemBin) return systemBin;

  const binInfo = getPlayitBinaryInfo();
  if (!binInfo.url) {
    throw new Error(
      "Для macOS требуется установить playit через Homebrew: brew install playit-cloud/playit/playit"
    );
  }

  const toolsDir = path.join(storageRoot, "tools", "playit");
  await fsp.mkdir(toolsDir, { recursive: true });
  const targetPath = path.join(toolsDir, binInfo.fileName);

  if (fs.existsSync(targetPath)) {
    try {
      if (process.platform !== "win32") {
        await fsp.chmod(targetPath, 0o755);
      }
      return targetPath;
    } catch { /**/ }
  }

  await downloadFile({
    url: binInfo.url,
    destination: targetPath,
    onProgress,
  });

  if (process.platform !== "win32") {
    await fsp.chmod(targetPath, 0o755).catch(() => {});
  }

  return targetPath;
}

/**
 * Start playit tunnel pointing to the local Minecraft LAN port.
 * @param {{ lanPort: number, storageRoot: string, secret?: string, onStatus?: Function }} opts
 * @returns {Promise<{ tunnelHost: string, tunnelPort: number, claimUrl?: string }>}
 */
async function startPlayitTunnel({ lanPort, storageRoot, secret = null, onStatus = null }) {
  stopPlayitTunnel();

  onStatus?.({ stage: "preparing", message: "Подготовка агента playit.gg..." });
  const binaryPath = await ensurePlayitBinary(storageRoot, (p) => {
    if (p.total) {
      onStatus?.({
        stage: "downloading",
        percent: Math.round((p.transferred / p.total) * 100),
        message: "Скачивание агента playit.gg...",
      });
    }
  });

  const args = ["run"];
  if (secret) {
    args.push("--secret", secret);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let claimUrl = null;
    let tunnelHost = null;
    let tunnelPort = null;

    try {
      const proc = spawn(binaryPath, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      activeProcess = proc;

      const handleOutput = (chunk) => {
        const text = chunk.toString("utf8");
        // 1. Detect claim url
        const claimMatch = text.match(/(https:\/\/playit\.gg\/claim\/[a-zA-Z0-9_-]+)/i);
        if (claimMatch) {
          claimUrl = claimMatch[1];
          onStatus?.({ stage: "claim", claimUrl, message: `Требуется подтверждение: ${claimUrl}` });
        }

        // 2. Detect tunnel host:port
        const tunnelMatch =
          text.match(/(?:tunnel|address|connect):\s*([a-zA-Z0-9.-]+\.ply\.gg):(\d+)/i) ||
          text.match(/\b([a-zA-Z0-9.-]+\.ply\.gg):(\d+)\b/i) ||
          text.match(/\b([a-zA-Z0-9.-]+\.gl\.at\.ply\.gg):(\d+)\b/i);

        if (tunnelMatch && !settled) {
          tunnelHost = tunnelMatch[1];
          tunnelPort = parseInt(tunnelMatch[2], 10);
          settled = true;
          activeTunnel = { tunnelHost, tunnelPort, claimUrl };
          onStatus?.({ stage: "ready", tunnelHost, tunnelPort, message: `Туннель активен: ${tunnelHost}:${tunnelPort}` });
          resolve(activeTunnel);
        }
      };

      proc.stdout.on("data", handleOutput);
      proc.stderr.on("data", handleOutput);

      proc.on("error", (err) => {
        if (!settled) {
          settled = true;
          activeProcess = null;
          reject(err);
        }
      });

      proc.on("exit", (code) => {
        activeProcess = null;
        if (!settled) {
          settled = true;
          reject(new Error(`playit завершился с кодом ${code}`));
        }
      });

      // Timeout if no tunnel is assigned within 15 seconds (unless claim is needed)
      setTimeout(() => {
        if (!settled) {
          if (claimUrl) {
            // Still waiting for user claim in browser
            return;
          }
          settled = true;
          stopPlayitTunnel();
          reject(new Error("Таймаут подключения к сети playit.gg"));
        }
      }, 15000);
    } catch (err) {
      reject(err);
    }
  });
}

function stopPlayitTunnel() {
  if (activeProcess) {
    try {
      activeProcess.kill("SIGTERM");
    } catch { /**/ }
    activeProcess = null;
  }
  activeTunnel = null;
}

module.exports = {
  getPlayitBinaryInfo,
  findSystemPlayit,
  ensurePlayitBinary,
  startPlayitTunnel,
  stopPlayitTunnel,
  getActiveTunnel: () => activeTunnel,
};
