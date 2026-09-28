const fs = require("node:fs");
const path = require("node:path");

function minecraftOsName(platform = process.platform) {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "osx";
  return "linux";
}

function adoptiumOsName(platform = process.platform) {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "mac";
  return "linux";
}

function adoptiumArchitecture(architecture = process.arch, majorVersion = 21) {
  if (process.platform === "darwin" && Number(majorVersion) <= 8) {
    return "x64";
  }
  if (architecture === "arm64") return "aarch64";
  if (architecture === "ia32") return "x86";
  return "x64";
}

function minecraftArchitecture(architecture = process.arch) {
  if (architecture === "x64") return "x86_64";
  if (architecture === "ia32") return "x86";
  return architecture;
}

function nativeArchitectureToken(architecture = process.arch) {
  return architecture.includes("64") ? "64" : "32";
}

function javaExecutableNames(platform = process.platform) {
  return platform === "win32" ? ["javaw.exe", "java.exe"] : ["java"];
}

function isJavaExecutableName(name, platform = process.platform) {
  const normalized = String(name || "").toLowerCase();
  return javaExecutableNames(platform).includes(normalized);
}

function javaConsoleExecutable(executable, platform = process.platform) {
  return platform === "win32"
    ? executable.replace(/javaw\.exe$/i, "java.exe")
    : executable;
}

function defaultDataRoot({
  platform = process.platform,
  env = process.env,
  home,
  appData,
}) {
  if (env.SCOPE_DATA_ROOT || env.ONYX_DATA_ROOT) return path.resolve(env.SCOPE_DATA_ROOT || env.ONYX_DATA_ROOT);
  if (platform === "win32") {
    const scopeDir = path.join(appData, ".scope");
    const onyxDir = path.join(appData, ".onyx");
    return fs.existsSync(onyxDir) && !fs.existsSync(scopeDir) ? onyxDir : scopeDir;
  }
  if (platform === "darwin") {
    const scopeDir = path.join(appData, "Scope Launcher");
    const onyxDir = path.join(appData, "Onyx Launcher");
    return fs.existsSync(onyxDir) && !fs.existsSync(scopeDir) ? onyxDir : scopeDir;
  }
  if (env.XDG_DATA_HOME && path.isAbsolute(env.XDG_DATA_HOME)) {
    const scopeDir = path.join(env.XDG_DATA_HOME, "scope-launcher");
    const onyxDir = path.join(env.XDG_DATA_HOME, "onyx-launcher");
    return fs.existsSync(onyxDir) && !fs.existsSync(scopeDir) ? onyxDir : scopeDir;
  }
  const scopeDir = path.join(home, ".local", "share", "scope-launcher");
  const onyxDir = path.join(home, ".local", "share", "onyx-launcher");
  return fs.existsSync(onyxDir) && !fs.existsSync(scopeDir) ? onyxDir : scopeDir;
}

function azulOsName(platform = process.platform) {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  return "linux";
}

function azulArchitecture(architecture = process.arch, majorVersion = 21) {
  if (process.platform === "darwin" && Number(majorVersion) <= 8) {
    return "x64";
  }
  if (architecture === "arm64") return "arm64";
  if (architecture === "ia32") return "x86";
  return "x64";
}

module.exports = {
  minecraftOsName,
  adoptiumOsName,
  adoptiumArchitecture,
  azulOsName,
  azulArchitecture,
  minecraftArchitecture,
  nativeArchitectureToken,
  javaExecutableNames,
  isJavaExecutableName,
  javaConsoleExecutable,
  defaultDataRoot,
};
