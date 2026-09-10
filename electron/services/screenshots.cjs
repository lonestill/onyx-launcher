const fsp = require("node:fs/promises");
const path = require("node:path");

const SAFE_FILE_NAME_REGEX = /^[a-zA-Z0-9_.-]{1,255}$/;
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function sanitizeInstanceId(instanceId) {
  const id = String(instanceId || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(id)) {
    throw new Error("Invalid instance ID");
  }
  return id;
}

function resolveScreenshotsDirectory(instancesRoot, instanceId) {
  const root = path.resolve(instancesRoot);
  const id = sanitizeInstanceId(instanceId);
  const dir = path.resolve(root, id, "screenshots");
  if (!dir.startsWith(`${root}${path.sep}`)) {
    throw new Error("Unsafe instance path traversal detected");
  }
  return dir;
}

function resolveScreenshotPath(instancesRoot, instanceId, fileName) {
  const name = String(fileName || "").trim();
  if (!SAFE_FILE_NAME_REGEX.test(name) || name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("Invalid screenshot file name");
  }
  const ext = path.extname(name).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error("Unsupported screenshot format");
  }
  const dir = resolveScreenshotsDirectory(instancesRoot, instanceId);
  const fullPath = path.resolve(dir, name);
  if (!fullPath.startsWith(`${dir}${path.sep}`)) {
    throw new Error("Unsafe screenshot path");
  }
  return fullPath;
}

async function listScreenshots(instancesRoot, instanceId) {
  const dir = resolveScreenshotsDirectory(instancesRoot, instanceId);
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      const fullPath = path.join(dir, entry.name);
      try {
        const stats = await fsp.stat(fullPath);
        items.push({
          name: entry.name,
          path: fullPath,
          size: stats.size,
          createdAt: stats.mtime.toISOString(),
          timestamp: stats.mtimeMs,
        });
      } catch {
        // Skip unreadable files
      }
    }

    // Sort newest first
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items.map(({ name, path: p, size, createdAt }) => ({
      name,
      path: p,
      size,
      createdAt,
    }));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readScreenshotBase64(instancesRoot, instanceId, fileName) {
  const fullPath = resolveScreenshotPath(instancesRoot, instanceId, fileName);
  const ext = path.extname(fileName).toLowerCase();
  const mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  const buffer = await fsp.readFile(fullPath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function copyScreenshotToClipboard(instancesRoot, instanceId, fileName, { clipboard, nativeImage }) {
  const fullPath = resolveScreenshotPath(instancesRoot, instanceId, fileName);
  const image = nativeImage.createFromPath(fullPath);
  if (image.isEmpty()) {
    throw new Error("Could not decode screenshot image");
  }
  clipboard.writeImage(image);
  return true;
}

async function showScreenshotInFolder(instancesRoot, instanceId, fileName, shell) {
  const fullPath = resolveScreenshotPath(instancesRoot, instanceId, fileName);
  shell.showItemInFolder(fullPath);
  return true;
}

async function deleteScreenshot(instancesRoot, instanceId, fileName, shell) {
  const fullPath = resolveScreenshotPath(instancesRoot, instanceId, fileName);
  if (shell && typeof shell.trashItem === "function") {
    await shell.trashItem(fullPath);
  } else {
    await fsp.unlink(fullPath);
  }
  return true;
}

module.exports = {
  SAFE_FILE_NAME_REGEX,
  SUPPORTED_EXTENSIONS,
  resolveScreenshotsDirectory,
  resolveScreenshotPath,
  listScreenshots,
  readScreenshotBase64,
  copyScreenshotToClipboard,
  showScreenshotInFolder,
  deleteScreenshot,
};
