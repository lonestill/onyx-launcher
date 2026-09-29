const fsp = require("node:fs/promises");
const path = require("node:path");
const { fetchJson, downloadFile } = require("./network.cjs");

function isLoaderSupported(loader) {
  const norm = String(loader || "").toLowerCase();
  return ["fabric", "forge", "neoforge", "quilt"].some((l) => norm.includes(l));
}

function getCompatibleLoaders(loader) {
  const norm = String(loader || "").toLowerCase();
  if (norm.includes("neoforge")) return ["neoforge", "forge"];
  if (norm.includes("quilt")) return ["quilt", "fabric"];
  if (norm.includes("forge")) return ["forge"];
  if (norm.includes("fabric")) return ["fabric"];
  return [];
}

async function checkSkinLoaderStatus(instance, instancesRoot) {
  if (!instance) {
    return { installed: false, supported: false, loader: "", version: "", jarName: null };
  }
  const supported = isLoaderSupported(instance.loader);
  const instanceDir = path.join(instancesRoot, instance.id);
  const modsDir = path.join(instanceDir, "mods");
  
  let installedJar = null;
  try {
    const files = await fsp.readdir(modsDir);
    installedJar = files.find((f) => /^customskinloader.*\.jar$/i.test(f)) || null;
  } catch {
    installedJar = null;
  }

  return {
    installed: Boolean(installedJar),
    supported,
    loader: instance.loader || "Vanilla",
    version: instance.version || "1.21",
    jarName: installedJar,
  };
}

async function installCustomSkinLoader({ instance, instancesRoot, signal, onProgress }) {
  const compatible = getCompatibleLoaders(instance.loader);
  if (compatible.length === 0) {
    throw new Error(
      `Загрузчик ${instance.loader} не поддерживается для мода CustomSkinLoader.`
    );
  }
  const instanceDir = path.join(instancesRoot, instance.id);
  const modsDir = path.join(instanceDir, "mods");
  await fsp.mkdir(modsDir, { recursive: true });

  // 1. Try match for compatible loader + game version
  let versions = [];
  try {
    const url = `https://api.modrinth.com/v2/project/customskinloader/version?loaders=${encodeURIComponent(
      JSON.stringify(compatible),
    )}&game_versions=${encodeURIComponent(JSON.stringify([instance.version]))}`;
    versions = await fetchJson(url, { signal });
  } catch {
    versions = [];
  }

  // 2. Fallback: query versions specifically for compatible loaders
  if (!Array.isArray(versions) || versions.length === 0) {
    try {
      const url = `https://api.modrinth.com/v2/project/customskinloader/version?loaders=${encodeURIComponent(
        JSON.stringify(compatible),
      )}`;
      const all = await fetchJson(url, { signal });
      versions = Array.isArray(all) ? all : [];
    } catch (err) {
      throw new Error(`Не удалось загрузить CustomSkinLoader с Modrinth: ${err.message}`);
    }
  }

  // Find candidate that strictly matches any compatible loader
  const candidate = versions.find((v) =>
    Array.isArray(v.loaders) && v.loaders.some((l) => compatible.includes(l.toLowerCase()))
  );

  if (!candidate || !candidate.files || candidate.files.length === 0) {
    throw new Error(`Не найден подходящий файл CustomSkinLoader для ${instance.loader} ${instance.version}`);
  }

  const primaryFile = candidate.files.find((f) => f.primary) || candidate.files[0];
  const destination = path.join(modsDir, primaryFile.filename);

  await downloadFile({
    url: primaryFile.url,
    destination,
    sha1: primaryFile.hashes?.sha1,
    sha512: primaryFile.hashes?.sha512,
    size: primaryFile.size,
    signal,
    onProgress,
  });

  // Ensure default CustomSkinLoader.json is configured with LocalSkin priority
  await ensureCslConfig(instanceDir);

  return {
    success: true,
    fileName: primaryFile.filename,
    versionNumber: candidate.version_number,
  };
}

async function ensureCslConfig(instanceDir, variant = "auto") {
  const cslDir = path.join(instanceDir, "CustomSkinLoader");
  const configFile = path.join(cslDir, "CustomSkinLoader.json");
  await fsp.mkdir(cslDir, { recursive: true });

  const config = {
    version: "14.12",
    loadlist: [
      {
        name: "LocalSkin",
        type: "Legacy",
        checkPNG: false,
        skin: "CustomSkinLoader/LocalSkin/skins/{USERNAME}.png",
        model: variant === "slim" ? "slim" : variant === "classic" ? "default" : "auto",
        cape: "CustomSkinLoader/LocalSkin/capes/{USERNAME}.png"
      },
      {
        name: "Mojang",
        type: "Mojang"
      },
      {
        name: "ElyBy",
        type: "ElyBy"
      }
    ]
  };

  await fsp.writeFile(configFile, JSON.stringify(config, null, 2), "utf8");
}

async function syncOfflineSkin(profile, instanceDirectory, variant = "auto") {
  if (profile?.kind !== "offline") return false;
  const skin = profile.skins?.find((item) =>
    String(item?.url || "").startsWith("data:image/png;base64,"),
  );
  if (!skin) return false;

  const encoded = skin.url.slice("data:image/png;base64,".length);
  const skinDestination = path.join(
    instanceDirectory,
    "CustomSkinLoader",
    "LocalSkin",
    "skins",
    `${profile.name}.png`,
  );
  await fsp.mkdir(path.dirname(skinDestination), { recursive: true });
  await fsp.writeFile(skinDestination, Buffer.from(encoded, "base64"));

  // Check if cape is provided
  const cape = profile.capes?.find((item) =>
    String(item?.url || "").startsWith("data:image/png;base64,"),
  );
  if (cape) {
    const capeEncoded = cape.url.slice("data:image/png;base64,".length);
    const capeDestination = path.join(
      instanceDirectory,
      "CustomSkinLoader",
      "LocalSkin",
      "capes",
      `${profile.name}.png`,
    );
    await fsp.mkdir(path.dirname(capeDestination), { recursive: true });
    await fsp.writeFile(capeDestination, Buffer.from(capeEncoded, "base64"));
  }

  // Ensure config file exists with LocalSkin priority
  const detectedVariant = skin.variant || variant || "auto";
  await ensureCslConfig(instanceDirectory, detectedVariant);

  return true;
}

module.exports = {
  isLoaderSupported,
  checkSkinLoaderStatus,
  installCustomSkinLoader,
  syncOfflineSkin,
  ensureCslConfig,
};
