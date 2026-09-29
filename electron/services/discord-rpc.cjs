"use strict";

const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const OPCODES = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
  PING: 3,
  PONG: 4,
};

const DEFAULT_CLIENT_ID = "1548737210139025568";
const DEFAULT_ICON_URL =
  "https://raw.githubusercontent.com/lonestill/onyx-launcher/master/build/icon.png";
const DEFAULT_MINECRAFT_ICON_URL =
  "https://img.icons8.com/color/512/minecraft-logo.png";
const GITHUB_REPO_URL = "https://github.com/lonestill/onyx-launcher";
const DISCORD_COMMUNITY_URL = "https://discord.gg/qHZCehveYp";

const LOADER_ICONS = {
  fabric: "https://avatars.githubusercontent.com/u/45097497?s=256",
  forge: "https://avatars.githubusercontent.com/u/1321727?s=256",
  neoforge: "https://avatars.githubusercontent.com/u/139369905?s=256",
  quilt: "https://avatars.githubusercontent.com/u/82915830?s=256",
  vanilla: "https://img.icons8.com/color/512/minecraft-logo.png",
};

/**
 * Resolves the primary icon for an instance:
 * 1. Custom/Modpack remote icon URL if present.
 * 2. Dedicated loader icon (Fabric / Forge / NeoForge / Quilt).
 * 3. Default high-res Minecraft 3D grass block icon.
 */
function resolveInstanceIcon(instance) {
  if (
    typeof instance?.iconUrl === "string" &&
    /^https?:\/\//i.test(instance.iconUrl)
  ) {
    return instance.iconUrl;
  }
  const loaderKey = String(instance?.loader || "").toLowerCase();
  return LOADER_ICONS[loaderKey] || DEFAULT_MINECRAFT_ICON_URL;
}

/**
 * Packs an IPC frame: [int32LE op, int32LE len, JSON string]
 */
function packFrame(op, data) {
  const json = JSON.stringify(data);
  const len = Buffer.byteLength(json);
  const buf = Buffer.alloc(8 + len);
  buf.writeInt32LE(op, 0);
  buf.writeInt32LE(len, 4);
  buf.write(json, 8, len, "utf8");
  return buf;
}

/**
 * Resolves available Discord IPC socket paths for the current platform.
 */
function getPotentialSocketPaths() {
  const paths = [];
  if (process.platform === "win32") {
    for (let i = 0; i < 10; i++) {
      paths.push(`\\\\?\\pipe\\discord-ipc-${i}`);
    }
  } else {
    const candidateDirs = [
      process.env.XDG_RUNTIME_DIR,
      process.env.TMPDIR,
      process.env.TMP,
      process.env.TEMP,
      "/tmp",
    ].filter(Boolean);

    for (const dir of candidateDirs) {
      for (let i = 0; i < 10; i++) {
        paths.push(path.join(dir, `discord-ipc-${i}`));
      }
    }
  }
  return paths;
}

/**
 * Finds the first active Discord IPC socket that exists on disk.
 */
function findActiveSocketPath() {
  if (process.platform === "win32") {
    return "\\\\?\\pipe\\discord-ipc-0";
  }
  const candidatePaths = getPotentialSocketPaths();
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // Ignore filesystem errors
    }
  }
  return null;
}

class DiscordRpcService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.clientId = options.clientId || DEFAULT_CLIENT_ID;
    this.version = options.version || "2.0.2";
    this.socket = null;
    this.connected = false;
    this.connecting = false;
    this.currentUser = null;
    this.currentActivity = null;
    this.reconnectTimer = null;
    this.buffer = Buffer.alloc(0);
    this.enabled = true;
    this.launcherStartTime = Math.floor(Date.now() / 1000);
    this.currentRunningInstance = null;
    this.currentRunningStartTime = null;
    this.currentPage = "library";
    this.instanceGameStates = new Map();
  }

  /**
   * Connect to Discord desktop client.
   */
  connect() {
    if (!this.enabled || this.connected || this.connecting) {
      return;
    }

    this.connecting = true;
    this._clearReconnectTimer();

    const socketPath = findActiveSocketPath();
    if (!socketPath) {
      this.connecting = false;
      this._scheduleReconnect(15000);
      return;
    }

    try {
      const socket = net.createConnection(socketPath);
      this.socket = socket;

      socket.on("connect", () => {
        this.connecting = false;
        this.buffer = Buffer.alloc(0);
        // Send Opcode 0: Handshake
        this._send(OPCODES.HANDSHAKE, {
          v: 1,
          client_id: this.clientId,
        });
      });

      socket.on("data", (chunk) => {
        this._handleData(chunk);
      });

      socket.on("error", () => {
        this._cleanupSocket();
      });

      socket.on("close", () => {
        this._cleanupSocket();
      });
    } catch {
      this._cleanupSocket();
    }
  }

  /**
   * Gracefully close socket and clean up state.
   */
  disconnect() {
    this.enabled = false;
    this._clearReconnectTimer();
    this._cleanupSocket();
  }

  /**
   * Enable service and connect.
   */
  enable() {
    this.enabled = true;
    this.connect();
  }

  /**
   * Disable service, clear activity and close socket.
   */
  disable() {
    this.clearActivity();
    this.disconnect();
  }

  /**
   * Cleans internal socket state and schedules reconnect if still enabled.
   */
  _cleanupSocket() {
    const wasConnected = this.connected;
    this.connected = false;
    this.connecting = false;
    this.currentUser = null;
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {
        // Ignore destroy error
      }
      this.socket = null;
    }
    this.buffer = Buffer.alloc(0);

    if (wasConnected) {
      this.emit("disconnected");
    }

    if (this.enabled) {
      this._scheduleReconnect(15000);
    }
  }

  _scheduleReconnect(delayMs) {
    this._clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (this.enabled && !this.connected && !this.connecting) {
        this.connect();
      }
    }, delayMs);
  }

  _clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Internal frame sender.
   */
  _send(op, data) {
    if (!this.socket || this.socket.destroyed) return;
    try {
      const frame = packFrame(op, data);
      this.socket.write(frame);
    } catch {
      this._cleanupSocket();
    }
  }

  /**
   * Ingest incoming binary stream from Discord IPC socket.
   */
  _handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 8) {
      const op = this.buffer.readInt32LE(0);
      const len = this.buffer.readInt32LE(4);

      if (this.buffer.length < 8 + len) {
        // Incomplete frame, wait for more chunks
        break;
      }

      const payloadBuf = this.buffer.subarray(8, 8 + len);
      this.buffer = this.buffer.subarray(8 + len);

      try {
        const payload = JSON.parse(payloadBuf.toString("utf8"));
        this._handlePayload(op, payload);
      } catch {
        // Malformed payload
      }
    }
  }

  /**
   * Dispatch parsed Discord IPC frame.
   */
  _handlePayload(op, payload) {
    if (op === OPCODES.FRAME) {
      if (payload.cmd === "DISPATCH" && payload.evt === "READY") {
        this.connected = true;
        this.currentUser = payload.data?.user?.username || "Discord User";
        this.emit("connected", { user: this.currentUser });
        this.refreshPresence();
      } else if (payload.cmd === "SET_ACTIVITY") {
        this.emit("activity_updated", payload);
      }
    } else if (op === OPCODES.PING) {
      this._send(OPCODES.PONG, payload);
    } else if (op === OPCODES.CLOSE) {
      this._cleanupSocket();
    }
  }

  /**
   * Set raw activity to Discord client.
   */
  setActivity(activity) {
    this.currentActivity = activity;
    if (!this.connected) {
      if (this.enabled && !this.connecting) {
        this.connect();
      }
      return;
    }

    this._send(OPCODES.FRAME, {
      cmd: "SET_ACTIVITY",
      args: {
        pid: process.pid,
        activity: activity || null,
      },
      nonce: `onyx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
  }

  /**
   * Clear active Rich Presence status.
   */
  clearActivity() {
    this.currentActivity = null;
    if (this.connected) {
      this.setActivity(null);
    }
  }

  /**
   * Set activity to "Playing Instance" state.
   */
  setPlaying(instance, options = {}) {
    this.currentRunningInstance = instance;
    if (!this.currentRunningStartTime || options.isNewLaunch) {
      this.currentRunningStartTime = options.startTime || Math.floor(Date.now() / 1000);
    }

    const showGame = options.showGame !== false;
    const showTime = options.showTime !== false;
    const showServer = options.showServer !== false;
    const showWorld = options.showWorld !== false;
    const hideServerIp = options.hideServerIp === true;

    const gameState = instance
      ? this.instanceGameStates.get(instance.id)
      : null;

    let details = "Playing Minecraft";
    let state = "In Game";

    if (showGame && instance) {
      details = `Playing ${instance.name || "Minecraft"}`;
      const loaderPart = instance.loader || "Vanilla";
      const verPart = instance.version || "";
      const baseInfo = `${loaderPart} ${verPart}`.trim();

      if (gameState?.mode === "multiplayer" && showServer) {
        if (hideServerIp || !gameState.server) {
          state = `${baseInfo} • Multiplayer`;
        } else {
          const customAlias =
            instance.settings?.serverName ||
            instance.settings?.discordRpcServerAlias;
          const serverLabel = customAlias || gameState.server;
          state = `${baseInfo} • Server: ${serverLabel}`;
        }
      } else if (gameState?.mode === "singleplayer" && showWorld) {
        const worldLabel = gameState.world
          ? ` • World: ${gameState.world}`
          : " • Singleplayer";
        state = `${baseInfo}${worldLabel}`;
      } else if (gameState?.mode === "loading") {
        state = `${baseInfo} • Loading...`;
      } else if (gameState?.mode === "menu") {
        state = `${baseInfo} • Main Menu`;
      } else {
        const modCount = instance.modCount || 0;
        const modPart = modCount > 0 ? ` • ${modCount} mods` : "";
        state = `${baseInfo}${modPart}`.trim();
      }
    }

    const largeImage = resolveInstanceIcon(instance);
    const largeText = instance
      ? `${instance.name} (${instance.loader || "Vanilla"} ${instance.version || ""})`
      : "Minecraft";

    const activity = {
      details,
      state,
      assets: {
        large_image: largeImage,
        large_text: largeText,
        small_image: DEFAULT_ICON_URL,
        small_text: `Scope Launcher v${this.version}`,
      },
      buttons: [
        { label: "Scope Launcher", url: GITHUB_REPO_URL },
        { label: "Discord Community", url: DISCORD_COMMUNITY_URL },
      ],
    };

    if (showTime && this.currentRunningStartTime) {
      activity.timestamps = {
        start: this.currentRunningStartTime,
      };
    }

    this.setActivity(activity);
  }

  /**
   * Ingests real-time Minecraft log lines to detect server connections,
   * singleplayer worlds, loading states, and title screen transitions.
   */
  ingestGameLog(instanceId, logLine, settings = {}) {
    if (
      !this.enabled ||
      !this.currentRunningInstance ||
      this.currentRunningInstance.id !== instanceId ||
      typeof logLine !== "string"
    ) {
      return;
    }

    let state = this.instanceGameStates.get(instanceId);
    if (!state) {
      state = { mode: "loading", server: null, world: null };
      this.instanceGameStates.set(instanceId, state);
    }

    const previousMode = state.mode;
    const previousServer = state.server;
    const previousWorld = state.world;
    let changed = false;

    // 1. Connecting to multiplayer server: "Connecting to <host>, <port>"
    const connectMatch = logLine.match(
      /Connecting to\s+([a-zA-Z0-9.\-_]+)(?:,\s*(\d+))?/i,
    );
    if (connectMatch) {
      state.mode = "multiplayer";
      state.server = connectMatch[1];
      changed = true;
    }

    // 2. Preparing singleplayer world: 'Preparing level "<worldName>"'
    const levelMatch = logLine.match(/Preparing level\s+"([^"]+)"/i);
    if (levelMatch) {
      state.mode = "singleplayer";
      state.world = levelMatch[1];
      changed = true;
    } else if (logLine.includes("Starting integrated minecraft server")) {
      state.mode = "singleplayer";
      changed = true;
    }

    // 3. Disconnecting or returning to Title Screen
    if (
      logLine.includes("Stopping server") ||
      logLine.includes("Saving worlds") ||
      logLine.includes("Disconnected from server") ||
      logLine.includes("Disconnecting from") ||
      logLine.includes("Leaving world")
    ) {
      state.mode = "menu";
      state.server = null;
      state.world = null;
      changed = true;
    } else if (
      state.mode === "loading" &&
      (logLine.includes("Sound engine started") ||
        logLine.includes("OpenAL initialized") ||
        logLine.includes("Backend library: LWJGL"))
    ) {
      state.mode = "menu";
      changed = true;
    }

    if (
      changed &&
      (state.mode !== previousMode ||
        state.server !== previousServer ||
        state.world !== previousWorld)
    ) {
      this.refreshPresence(settings);
    }
  }

  /**
   * Set activity to "Idle in Launcher" state.
   */
  setIdle(page = "library", options = {}) {
    this.currentRunningInstance = null;
    this.currentRunningStartTime = null;
    this.currentPage = page;

    const pageLabels = {
      home: "Main Dashboard",
      library: "Browsing Instances",
      discover: "Exploring Mods & Packs",
      skins: "In 3D Skin Studio",
      settings: "Customizing Settings",
      picks: "Curated Modpacks",
    };

    const stateDesc = pageLabels[page] || "Browsing Instances";

    const activity = {
      details: "In Scope Launcher",
      state: stateDesc,
      assets: {
        large_image: DEFAULT_ICON_URL,
        large_text: `Scope Launcher v${this.version}`,
      },
      buttons: [
        { label: "Scope Launcher", url: GITHUB_REPO_URL },
        { label: "Discord Community", url: DISCORD_COMMUNITY_URL },
      ],
    };

    if (options.showTime !== false) {
      activity.timestamps = {
        start: this.launcherStartTime,
      };
    }

    this.setActivity(activity);
  }

  /**
   * Refreshes presence according to current state (playing game or idle).
   */
  refreshPresence(settings = {}) {
    if (!this.enabled) {
      this.clearActivity();
      return;
    }

    if (this.currentRunningInstance) {
      this.setPlaying(this.currentRunningInstance, {
        showGame: settings.discordRpcShowGame !== false,
        showTime: settings.discordRpcShowTime !== false,
        showServer: settings.discordRpcShowServer !== false,
        showWorld: settings.discordRpcShowWorld !== false,
        hideServerIp: settings.discordRpcHideServerIp === true,
      });
    } else {
      this.setIdle(this.currentPage, {
        showTime: settings.discordRpcShowTime !== false,
      });
    }
  }

  /**
   * Get current RPC service status.
   */
  getStatus() {
    return {
      connected: this.connected,
      connecting: this.connecting,
      enabled: this.enabled,
      user: this.currentUser,
    };
  }
}

module.exports = {
  DiscordRpcService,
  packFrame,
  getPotentialSocketPaths,
  findActiveSocketPath,
  resolveInstanceIcon,
  OPCODES,
  DEFAULT_CLIENT_ID,
  DEFAULT_ICON_URL,
  DEFAULT_MINECRAFT_ICON_URL,
  LOADER_ICONS,
  GITHUB_REPO_URL,
  DISCORD_COMMUNITY_URL,
};
