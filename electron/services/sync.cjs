const path = require("node:path");
const crypto = require("node:crypto");
const { fetchJson, hashFile, downloadMany } = require("./network.cjs");
const {
  safeModrinthDownload,
  selectVersionFile,
} = require("./content.cjs");

const SYNC_SCHEMA = 1;

function cleanServers(servers) {
  if (!Array.isArray(servers)) return [];
  return servers
    .filter((server) => server && typeof server.address === "string")
    .slice(0, 24)
    .map((server) => ({
      id: String(server.id || crypto.randomUUID()).slice(0, 80),
      name: String(server.name || server.address).trim().slice(0, 48),
      address: server.address.trim().slice(0, 320),
    }))
    .filter((server) => server.address);
}

function createSyncProfile({ instance, mods }) {
  const servers = cleanServers(instance.settings?.servers);
  return {
    schema: SYNC_SCHEMA,
    launcher: "onyx",
    createdAt: new Date().toISOString(),
    instance: {
      name: String(instance.name).slice(0, 48),
      version: String(instance.version).slice(0, 40),
      loader: String(instance.loader).slice(0, 80),
      description: String(instance.description || "").slice(0, 180),
      color: instance.color,
      glyph: String(instance.glyph || "MC").slice(0, 2),
      iconUrl:
        typeof instance.iconUrl === "string" &&
        /^https:\/\//i.test(instance.iconUrl)
          ? instance.iconUrl
          : null,
      installProfile: instance.installProfile || null,
      settings: {
        memory: instance.settings?.memory,
        windowWidth: instance.settings?.windowWidth,
        windowHeight: instance.settings?.windowHeight,
        fullscreen: instance.settings?.fullscreen,
        recordFps: instance.settings?.recordFps,
        jvmArguments: Array.isArray(instance.settings?.jvmArguments)
          ? instance.settings.jvmArguments.slice(0, 24)
          : [],
        servers,
        selectedServerId: servers.some(
          (server) => server.id === instance.settings?.selectedServerId,
        )
          ? instance.settings.selectedServerId
          : servers[0]?.id || "",
      },
    },
    mods: mods.slice(0, 1000).map((mod) => ({
      name: String(mod.name).slice(0, 180),
      enabled: mod.enabled !== false,
      sha1: String(mod.sha1 || ""),
      projectId: mod.projectId ? String(mod.projectId) : null,
      versionId: mod.versionId ? String(mod.versionId) : null,
    })),
  };
}

function validateSyncProfile(value) {
  if (
    value?.schema !== SYNC_SCHEMA ||
    (value.launcher !== "onyx" && value.launcher !== "scope") ||
    !value.instance ||
    !Array.isArray(value.mods)
  ) {
    throw new Error("This is not a supported Scope Sync profile");
  }
  const source = value.instance;
  const name = String(source.name || "Imported profile")
    .trim()
    .slice(0, 48);
  const version = String(source.version || "").trim().slice(0, 40);
  if (!version) throw new Error("The profile does not specify a Minecraft version");
  const settings = source.settings || {};
  const servers = cleanServers(settings.servers);
  const installProfile = source.installProfile;
  const normalizedProfile =
    installProfile &&
    typeof installProfile.minecraftVersion === "string" &&
    typeof installProfile.loader === "string"
      ? {
          minecraftVersion: installProfile.minecraftVersion.slice(0, 40),
          loader: installProfile.loader.slice(0, 24),
          loaderVersion:
            typeof installProfile.loaderVersion === "string"
              ? installProfile.loaderVersion.slice(0, 80)
              : null,
        }
      : null;
  return {
    schema: SYNC_SCHEMA,
    launcher: "onyx",
    createdAt: value.createdAt,
    instance: {
      name,
      version,
      loader: String(source.loader || "Vanilla").slice(0, 80),
      description: String(source.description || "Scope Sync profile").slice(
        0,
        180,
      ),
      color: ["lime", "amber", "violet", "cyan", "rose"].includes(source.color)
        ? source.color
        : "cyan",
      glyph: String(source.glyph || name.slice(0, 2))
        .slice(0, 2)
        .toUpperCase(),
      iconUrl:
        typeof source.iconUrl === "string" &&
        /^https:\/\//i.test(source.iconUrl)
          ? source.iconUrl
          : null,
      installProfile: normalizedProfile,
      settings: {
        memory: Number.isFinite(settings.memory)
          ? Math.max(2, Math.min(64, Math.round(settings.memory)))
          : undefined,
        windowWidth: Number.isFinite(settings.windowWidth)
          ? Math.max(640, Math.min(7680, Math.round(settings.windowWidth)))
          : undefined,
        windowHeight: Number.isFinite(settings.windowHeight)
          ? Math.max(480, Math.min(4320, Math.round(settings.windowHeight)))
          : undefined,
        fullscreen:
          typeof settings.fullscreen === "boolean"
            ? settings.fullscreen
            : undefined,
        recordFps:
          typeof settings.recordFps === "boolean"
            ? settings.recordFps
            : undefined,
        jvmArguments: Array.isArray(settings.jvmArguments)
          ? settings.jvmArguments
              .filter((argument) => typeof argument === "string")
              .map((argument) => argument.trim().slice(0, 180))
              .filter(Boolean)
              .slice(0, 24)
          : [],
        servers,
        selectedServerId: servers.some(
          (server) => server.id === settings.selectedServerId,
        )
          ? settings.selectedServerId
          : servers[0]?.id || "",
      },
    },
    mods: value.mods
      .filter(
        (mod) =>
          mod &&
          typeof mod.name === "string" &&
          /^[a-f0-9]{40}$/i.test(mod.sha1 || ""),
      )
      .slice(0, 1000)
      .map((mod) => ({
        name: path.basename(mod.name).slice(0, 180),
        enabled: mod.enabled !== false,
        sha1: mod.sha1.toLowerCase(),
        projectId:
          typeof mod.projectId === "string"
            ? mod.projectId.slice(0, 100)
            : null,
        versionId:
          typeof mod.versionId === "string"
            ? mod.versionId.slice(0, 100)
            : null,
      })),
  };
}

async function identifySyncMods(items) {
  const hashes = await Promise.all(items.map((item) => hashFile(item.path, "sha1")));
  let versions = {};
  if (hashes.length) {
    versions = await fetchJson("https://api.modrinth.com/v2/version_files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes, algorithm: "sha1" }),
    }).catch(() => ({}));
  }
  return items.map((item, index) => {
    const version = versions?.[hashes[index]];
    return {
      name: item.name,
      enabled: item.enabled,
      sha1: hashes[index],
      projectId: version?.project_id || null,
      versionId: version?.id || null,
    };
  });
}

async function installSyncMods({
  profile,
  instanceDirectory,
  signal,
  onProgress,
}) {
  const requested = profile.mods.filter((mod) => mod.versionId);
  if (!requested.length) {
    return { installed: 0, skipped: profile.mods.length };
  }
  const versionIds = [...new Set(requested.map((mod) => mod.versionId))];
  const batches = [];
  for (let index = 0; index < versionIds.length; index += 100) {
    batches.push(versionIds.slice(index, index + 100));
  }
  const versions = (
    await Promise.all(
      batches.map((ids) =>
        fetchJson(
          `https://api.modrinth.com/v2/versions?ids=${encodeURIComponent(
            JSON.stringify(ids),
          )}`,
          { signal },
        ),
      ),
    )
  ).flat();
  const byId = new Map((versions || []).map((version) => [version.id, version]));
  const downloads = [];
  let skipped = profile.mods.length - requested.length;
  const usedNames = new Set();
  for (const mod of requested) {
    const version = byId.get(mod.versionId);
    const exactFile =
      version?.files?.find((file) => file.hashes?.sha1 === mod.sha1) ||
      selectVersionFile(version);
    if (
      !exactFile ||
      exactFile.hashes?.sha1 !== mod.sha1 ||
      !/\.jar$/i.test(exactFile.filename)
    ) {
      skipped += 1;
      continue;
    }
    let safeName = path.basename(exactFile.filename).replace(
      /[^a-zA-Z0-9._+-]/g,
      "_",
    );
    if (usedNames.has(safeName.toLowerCase())) {
      safeName = `${path.basename(safeName, ".jar")}-${mod.sha1.slice(
        0,
        8,
      )}.jar`;
    }
    usedNames.add(safeName.toLowerCase());
    downloads.push({
      url: safeModrinthDownload(exactFile.url),
      destination: path.join(
        instanceDirectory,
        "mods",
        `${safeName}${mod.enabled ? "" : ".disabled"}`,
      ),
      sha1: mod.sha1,
      size: exactFile.size,
    });
  }
  await downloadMany(downloads, {
    concurrency: 8,
    signal,
    onProgress,
  });
  return { installed: downloads.length, skipped };
}

const DEFAULT_HUB_URL =
  process.env.SCOPE_HUB_URL ||
  process.env.ONYX_HUB_URL ||
  "https://scope-hub.vercel.app";

function parseShareIdOrUrl(input) {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  if (
    trimmed.startsWith("scope://party/") ||
    trimmed.startsWith("onyx://party/") ||
    trimmed.includes("/party/")
  )
    return "";
  const deepMatch = trimmed.match(/^(?:scope|onyx):\/\/pack\/([a-zA-Z0-9_-]+)/i);
  if (deepMatch) return deepMatch[1];
  const urlMatch = trimmed.match(/\/pack\/([a-zA-Z0-9_-]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed.startsWith("pk_") ? trimmed : `pk_${trimmed}`;
  }
  return trimmed;
}

async function uploadShareProfile(profile, { hubUrl = DEFAULT_HUB_URL, author = null, signal } = {}) {
  const endpoint = `${hubUrl.replace(/\/+$/, "")}/api/v1/share`;
  return fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, author }),
    signal,
  });
}

async function fetchShareProfile(idOrUrl, { hubUrl = DEFAULT_HUB_URL, signal } = {}) {
  const id = parseShareIdOrUrl(idOrUrl);
  if (!id) throw new Error("Invalid share link or pack ID");
  const endpoint = `${hubUrl.replace(/\/+$/, "")}/api/v1/share?id=${encodeURIComponent(id)}`;
  return fetchJson(endpoint, { signal });
}

module.exports = {
  SYNC_SCHEMA,
  DEFAULT_HUB_URL,
  createSyncProfile,
  validateSyncProfile,
  identifySyncMods,
  installSyncMods,
  parseShareIdOrUrl,
  uploadShareProfile,
  fetchShareProfile,
};
