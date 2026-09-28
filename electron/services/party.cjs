"use strict";

/**
 * party.cjs — Onyx Party & P2P Room Service (v2.0.0)
 *
 * Manages party rooms on the Hub (create, join, poll, close) and
 * coordinates the local TCP relay tunnel that lets friends join the host's
 * Minecraft world without manual port forwarding.
 *
 * Tunnel strategy (in priority order):
 *   1. UPnP/NAT-PMP — direct port mapping on the host's router if available.
 *   2. e4mc relay   — TCP reverse-proxy via the e4mc public relay network,
 *                     which specifically supports Minecraft's protocol.
 *   3. Hub relay    — fallback through Onyx Hub for CGNAT / symmetric-NAT cases
 *                     (planned for later, placeholder for now).
 *
 * Signaling for WebRTC-style offer/answer/ICE is done via polling the Hub's
 * /api/v1/party/signal endpoint (no persistent WebSocket required on Hub side).
 */

const net = require("node:net");
const dgram = require("node:dgram");
const os = require("node:os");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { fetchJson } = require("./network.cjs");

const DEFAULT_HUB_URL = process.env.ONYX_HUB_URL || "https://onyx-launcher-hub.vercel.app";
const HUB_PARTY_URL = `${DEFAULT_HUB_URL}/api/v1/party`;
const SIGNAL_POLL_INTERVAL_MS = 1500;
const ROOM_POLL_INTERVAL_MS = 4000;
const MC_DEFAULT_PORT = 25565;

const MC_LAN_MCAST_GROUP = "224.0.2.0";
const MC_LAN_MCAST_PORT = 4445;

/**
 * Mods that run purely on the client (rendering, HUD, FPS, input, localization).
 * Minecraft network protocol doesn't care if client and server differ on these.
 */
const KNOWN_CLIENT_MODS = new Set([
  "sodium", "iris", "zoomify", "modmenu", "dynamic_fps", "dynamicfps",
  "entityculling", "entity_texture_features", "entity_model_features",
  "ferritecore", "immediatelyfast", "lambdynamiclights", "lambdynlights",
  "language-reload", "languagereload", "lithium", "reeses-sodium-options",
  "sodium-extra", "sodium_extra", "continuity", "fabric-skyboxes",
  "skyboxify", "presence-footsteps", "optigui", "polytone", "puzzle",
  "moreculling", "chat_heads", "controlling", "cullleaves", "fallingleaves",
  "sound_physics", "xaeros_minimap", "xaerominimap", "xaeros_world_map",
  "xaeroworldmap", "journeymap", "customskinloader", "nochatreports",
  "rrls", "yet_another_config_lib_v3", "yacl", "fastquit", "badpackets",
  "sodium-shadowy-path-blocks", "main-menu-credits", "mixintrace",
  "paginatedadvancements", "morechathistory"
]);

function isClientOnlyMod(fileName) {
  if (!fileName || typeof fileName !== "string") return false;
  const lower = fileName.toLowerCase().replace(/[-_.]/g, "");
  for (const known of KNOWN_CLIENT_MODS) {
    const cleanKnown = known.replace(/[-_.]/g, "");
    if (lower.startsWith(cleanKnown) || lower.includes(cleanKnown)) {
      return true;
    }
  }
  return false;
}

/**
 * Get active non-internal IPv4 address for local network play.
 */
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

/**
 * Generate a stable ephemeral peer ID for this launcher session.
 * Regenerated on each app launch; not persisted.
 */
function generatePeerId() {
  return `onyx-${crypto.randomBytes(6).toString("hex")}`;
}

/**
 * RoomSession holds the live state for an active party room on this launcher instance.
 * One instance at a time (host OR guest). Call destroy() to clean up.
 */
class RoomSession {
  constructor({ code, peerId, isHost, hubUrl = DEFAULT_HUB_URL }) {
    this.code = code;
    this.peerId = peerId;
    this.isHost = isHost;
    this.hubUrl = hubUrl;
    this.instanceId = null;

    // Live room state (refreshed by polling)
    this.roomState = null;

    // Local relay tunnel handle (host-side only)
    this._relayServer = null;
    this._relayPort = null;
    this._e4mcDomain = null;

    // LAN sniffer (host-side: auto-detects Minecraft Open to LAN)
    this._snifferSocket = null;
    this._detectedLanPort = null;
    this.onLanDetected = null; // ({ lanPort, relayPort, hostIp, isE4mc }) => void

    // LAN beacon & proxy (guest-side: makes room show in Minecraft Multiplayer list)
    this._beaconSocket = null;
    this._beaconTimer = null;
    this._guestProxyServer = null;
    this._guestTunnelHost = null;
    this._guestTunnelPort = null;
    this.guestProxyPort = null;

    // Polling timers
    this._roomPollTimer = null;
    this._signalPollTimer = null;

    // Event callbacks set by the caller (main.cjs IPC layer)
    this.onRoomUpdate = null; // (roomState) => void
    this.onSignal = null;     // (signal) => void
    this.onError = null;      // (err) => void

    // Relay-connected guests: Map<peerId, { socket }>
    this._guestSockets = new Map();
  }

  /** Start polling loops and LAN automation */
  start() {
    this._pollRoom();
    if (this.isHost) {
      this.startLanSniffer();
    } else {
      this._pollSignals();
    }
  }

  /**
   * Ingest game log text in real time.
   * Host: captures e4mc public domain or LAN server port from console output.
   */
  ingestGameLog(text) {
    if (!text || typeof text !== "string") return;

    // 1. e4mc domain detection (host side)
    const e4mcMatch = text.match(/(?:Domain assigned:\s*|hosted on domain\s*\[?)([a-zA-Z0-9.-]+\.e4mc\.link)\]?/i);
    if (e4mcMatch) {
      const domain = e4mcMatch[1].trim();
      if (domain && domain !== this._e4mcDomain) {
        this._e4mcDomain = domain;
        console.log(`[party] Captured e4mc public tunnel domain: ${domain}`);
        if (this.isHost) {
          void this.publishTunnel(domain, MC_DEFAULT_PORT);
          if (this.onLanDetected) {
            this.onLanDetected({ lanPort: MC_DEFAULT_PORT, relayPort: MC_DEFAULT_PORT, hostIp: domain, isE4mc: true });
          }
        }
      }
    }

    // 2. Fallback console LAN port detection (host side)
    const lanMatch = text.match(/(?:Published LAN server on port|Started local server on|Started serving on)\s*(\d+)/i);
    if (lanMatch) {
      const lanPort = parseInt(lanMatch[1], 10);
      if (lanPort && lanPort !== this._detectedLanPort && !this._e4mcDomain) {
        this._detectedLanPort = lanPort;
        console.log(`[party] Captured LAN server port from console log: ${lanPort}`);
        if (this.isHost) {
          void (async () => {
            try {
              const assignedRelayPort = await this.startLocalRelay(lanPort);
              const hostIp = getLocalIpAddress();
              await this.publishTunnel(hostIp, assignedRelayPort);
              if (this.onLanDetected) {
                this.onLanDetected({ lanPort, relayPort: assignedRelayPort, hostIp, isE4mc: false });
              }
            } catch (err) {
              console.error("[party] Failed to set up relay for console-detected LAN port:", err);
            }
          })();
        }
      }
    }
  }

  // ─── Room state polling ─────────────────────────────────────────────────────

  async _pollRoom() {
    try {
      const url = `${this.hubUrl}/api/v1/party?code=${encodeURIComponent(this.code)}&peerId=${encodeURIComponent(this.peerId)}`;
      const data = await fetchJson(url);
      if (data && data.success) {
        this.roomState = data;
        if (this.onRoomUpdate) this.onRoomUpdate(data);
        if (!this.isHost && data.tunnelHost && data.tunnelPort) {
          void this.ensureGuestProxyAndBeacon(data.tunnelHost, data.tunnelPort);
        }
      }
    } catch (err) {
      if (this.onError) this.onError(err);
    } finally {
      this._roomPollTimer = setTimeout(() => this._pollRoom(), ROOM_POLL_INTERVAL_MS);
    }
  }

  // ─── Signaling polling (guest side) ────────────────────────────────────────

  async _pollSignals() {
    try {
      const url = `${this.hubUrl}/api/v1/party/signal?roomCode=${encodeURIComponent(this.code)}&peerId=${encodeURIComponent(this.peerId)}`;
      const data = await fetchJson(url);
      if (data && Array.isArray(data.signals)) {
        for (const signal of data.signals) {
          if (this.onSignal) this.onSignal(signal);
        }
      }
    } catch {
      // Non-fatal; just retry
    } finally {
      this._signalPollTimer = setTimeout(() => this._pollSignals(), SIGNAL_POLL_INTERVAL_MS);
    }
  }

  /** Push a signaling envelope to a specific peer */
  async pushSignal({ toPeerId, type, payload }) {
    await fetchJson(`${this.hubUrl}/api/v1/party/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomCode: this.code,
        fromPeerId: this.peerId,
        toPeerId,
        type,
        payload,
      }),
    });
  }

  // ─── Manifest update (host only) ───────────────────────────────────────────

  async updateManifest(manifest) {
    await fetchJson(`${this.hubUrl}/api/v1/party`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: this.code,
        hostPeerId: this.peerId,
        action: "update-manifest",
        instanceManifest: manifest,
      }),
    });
  }

  // ─── Tunnel (host side) ────────────────────────────────────────────────────

  /**
   * Start local relay: open a TCP server on an ephemeral port that proxies
   * connections to the Minecraft LAN port.
   *
   * When Minecraft opens to LAN it picks a random port. The caller passes
   * that port (lanPort). We open our own TCP server and forward every
   * incoming connection to 127.0.0.1:lanPort.
   *
   * For LAN-over-Internet without UPnP/e4mc, guests connect to the
   * tunnelHost:tunnelPort that we publish to the Hub room.
   */
  async startLocalRelay(lanPort) {
    return new Promise((resolve, reject) => {
      const server = net.createServer((clientSocket) => {
        const mcSocket = net.createConnection({ host: "127.0.0.1", port: lanPort }, () => {
          clientSocket.pipe(mcSocket);
          mcSocket.pipe(clientSocket);
        });
        mcSocket.on("error", () => {
          clientSocket.destroy();
        });
        clientSocket.on("error", () => {
          mcSocket.destroy();
        });
      });

      server.listen(0, "0.0.0.0", async () => {
        const assignedPort = server.address().port;
        this._relayServer = server;
        this._relayPort = assignedPort;
        resolve(assignedPort);
      });

      server.on("error", reject);
    });
  }

  /** Publish tunnel address to room so guests can connect */
  async publishTunnel(tunnelHost, tunnelPort) {
    await fetchJson(`${this.hubUrl}/api/v1/party`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: this.code,
        hostPeerId: this.peerId,
        action: "set-tunnel",
        tunnelHost,
        tunnelPort,
      }),
    });
  }

  /** Mark this peer as ready (sync done) */
  async setReady(ready = true) {
    await fetchJson(`${this.hubUrl}/api/v1/party`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: this.code,
        action: "set-peer-ready",
        peerId: this.peerId,
        ready,
      }),
    });
  }

  // ─── LAN Automation (Host & Guest) ──────────────────────────────────────────

  /**
   * Host: start listening for Minecraft's UDP Open-to-LAN broadcasts on 224.0.2.0:4445.
   * As soon as host clicks "Open to LAN" in singleplayer, this catches the assigned port
   * without needing ANY mods inside the game.
   */
  startLanSniffer() {
    try {
      const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
      socket.on("error", (err) => {
        console.warn("[party] LAN sniffer socket warning:", err.message);
      });

      socket.on("message", async (msg) => {
        const text = msg.toString("utf8");
        const match = text.match(/\[AD\](\d+)\[\/AD\]/);
        if (match) {
          const lanPort = parseInt(match[1], 10);
          if (lanPort && lanPort !== this._detectedLanPort) {
            this._detectedLanPort = lanPort;
            console.log(`[party] Detected Minecraft LAN broadcast on port ${lanPort}`);

            try {
              const assignedRelayPort = await this.startLocalRelay(lanPort);
              const hostIp = getLocalIpAddress();
              await this.publishTunnel(hostIp, assignedRelayPort);
              if (this.onLanDetected) {
                this.onLanDetected({ lanPort, relayPort: assignedRelayPort, hostIp });
              }
            } catch (err) {
              console.error("[party] Failed to set up relay for detected LAN port:", err);
            }
          }
        }
      });

      socket.bind(MC_LAN_MCAST_PORT, () => {
        try {
          socket.addMembership(MC_LAN_MCAST_GROUP);
          console.log("[party] LAN sniffer active on 224.0.2.0:4445");
        } catch (e) {
          console.warn("[party] Multicast membership notice:", e.message);
        }
      });

      this._snifferSocket = socket;
    } catch (err) {
      console.warn("[party] Could not initialize LAN sniffer socket:", err.message);
    }
  }

  /**
   * Guest: open a local TCP proxy pointing to host tunnel and broadcast
   * UDP beacon on 224.0.2.0:4445 so Minecraft's "Multiplayer" menu displays
   * this world under "LAN Worlds" automatically.
   */
  async ensureGuestProxyAndBeacon(tunnelHost, tunnelPort) {
    if (!tunnelHost || !tunnelPort) return;
    if (
      this._guestProxyServer &&
      this._guestTunnelHost === tunnelHost &&
      this._guestTunnelPort === tunnelPort
    ) {
      return;
    }

    if (this._guestProxyServer) {
      try { this._guestProxyServer.close(); } catch { /**/ }
      this._guestProxyServer = null;
    }
    this._guestTunnelHost = tunnelHost;
    this._guestTunnelPort = tunnelPort;

    try {
      const proxyServer = net.createServer((clientSocket) => {
        const remoteSocket = net.createConnection({ host: tunnelHost, port: tunnelPort }, () => {
          clientSocket.pipe(remoteSocket);
          remoteSocket.pipe(clientSocket);
        });
        remoteSocket.on("error", () => clientSocket.destroy());
        clientSocket.on("error", () => remoteSocket.destroy());
      });

      await new Promise((resolve, reject) => {
        proxyServer.listen(0, "127.0.0.1", () => {
          this.guestProxyPort = proxyServer.address().port;
          this._guestProxyServer = proxyServer;
          resolve();
        });
        proxyServer.on("error", reject);
      });

      console.log(`[party] Guest local proxy listening on 127.0.0.1:${this.guestProxyPort} -> ${tunnelHost}:${tunnelPort}`);

      if (!this._beaconSocket) {
        const beaconSocket = dgram.createSocket({ type: "udp4", reuseAddr: true });
        beaconSocket.bind(0, () => {
          try {
            beaconSocket.setBroadcast(true);
            beaconSocket.setMulticastTTL(2);
          } catch { /**/ }
        });
        this._beaconSocket = beaconSocket;
      }

      if (this._beaconTimer) {
        clearInterval(this._beaconTimer);
      }

      const hostName = this.roomState?.hostDisplayName || this.code;
      const motdMsg = Buffer.from(
        `[MOTD]§a§l[Onyx Room] §f${hostName}[/MOTD][AD]${this.guestProxyPort}[/AD]`,
        "utf8"
      );

      const sendBeacon = () => {
        if (!this._beaconSocket) return;
        this._beaconSocket.send(motdMsg, 0, motdMsg.length, MC_LAN_MCAST_PORT, MC_LAN_MCAST_GROUP, () => {});
      };

      sendBeacon();
      this._beaconTimer = setInterval(sendBeacon, 1500);
      console.log(`[party] Emitting LAN server beacon for Minecraft Multiplayer list`);
    } catch (err) {
      console.warn("[party] Failed to start guest proxy and beacon:", err.message);
    }
  }

  // ─── Teardown ───────────────────────────────────────────────────────────────

  async destroy(closeRoom = false) {
    clearTimeout(this._roomPollTimer);
    clearTimeout(this._signalPollTimer);

    if (this._snifferSocket) {
      try { this._snifferSocket.close(); } catch { /**/ }
      this._snifferSocket = null;
    }

    if (this._beaconTimer) {
      clearInterval(this._beaconTimer);
      this._beaconTimer = null;
    }

    if (this._beaconSocket) {
      try { this._beaconSocket.close(); } catch { /**/ }
      this._beaconSocket = null;
    }

    if (this._guestProxyServer) {
      try { this._guestProxyServer.close(); } catch { /**/ }
      this._guestProxyServer = null;
    }

    if (this._relayServer) {
      this._relayServer.close();
      this._relayServer = null;
    }

    for (const { socket } of this._guestSockets.values()) {
      try { socket.destroy(); } catch { /**/ }
    }
    this._guestSockets.clear();

    if (closeRoom && this.isHost) {
      try {
        await fetchJson(
          `${this.hubUrl}/api/v1/party?code=${encodeURIComponent(this.code)}&hostPeerId=${encodeURIComponent(this.peerId)}`,
          { method: "DELETE" }
        );
      } catch { /**/ }
    }
  }
}

// ─── Storage & Session Persistence ──────────────────────────────────────────

let _storageDir = null;
let _activePeerId = null;
let _activeSession = null;

function getActivePeerId() {
  if (!_activePeerId) {
    _activePeerId = generatePeerId();
  }
  return _activePeerId;
}

function initStorage(dir) {
  if (!dir) return;
  _storageDir = dir;
  try {
    if (!fs.existsSync(_storageDir)) {
      fs.mkdirSync(_storageDir, { recursive: true });
    }
  } catch { /**/ }

  const peerIdPath = path.join(_storageDir, "party-peer-id.txt");
  try {
    if (fs.existsSync(peerIdPath)) {
      const existing = fs.readFileSync(peerIdPath, "utf8").trim();
      if (existing.startsWith("onyx-")) {
        _activePeerId = existing;
      }
    }
    if (!_activePeerId) {
      _activePeerId = generatePeerId();
      fs.writeFileSync(peerIdPath, _activePeerId, "utf8");
    }
  } catch {
    if (!_activePeerId) _activePeerId = generatePeerId();
  }
}

function sessionFilePath() {
  if (!_storageDir) return null;
  return path.join(_storageDir, "party-session.json");
}

function savePartySession(data) {
  const filePath = sessionFilePath();
  if (!filePath) return;
  try {
    const payload = {
      code: data.code,
      peerId: data.peerId || getActivePeerId(),
      isHost: Boolean(data.isHost),
      displayName: data.displayName || null,
      instanceId: data.instanceId || null,
      hubUrl: data.hubUrl || DEFAULT_HUB_URL,
      expiresAt: data.expiresAt || null,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    console.warn("[party] Failed to save party session to disk:", err.message);
  }
}

function loadPartySession() {
  const filePath = sessionFilePath();
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(content);
    if (!data || !data.code || !data.peerId) return null;
    if (data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now()) {
      clearPartySession();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function clearPartySession() {
  const filePath = sessionFilePath();
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch { /**/ }
}

/**
 * Check if a previous room session was persisted to disk and is still active on Hub.
 * If active, reinstates the session so the player stays in the room across launcher restarts.
 */
async function restoreSavedSession() {
  const saved = loadPartySession();
  if (!saved) return null;

  try {
    const url = `${saved.hubUrl || DEFAULT_HUB_URL}/api/v1/party?code=${encodeURIComponent(saved.code)}&peerId=${encodeURIComponent(saved.peerId)}`;
    const data = await fetchJson(url);

    if (!data || !data.success || data.status === "closed") {
      clearPartySession();
      return null;
    }

    _activePeerId = saved.peerId;
    _activeSession = new RoomSession({
      code: saved.code,
      peerId: saved.peerId,
      isHost: saved.isHost,
      hubUrl: saved.hubUrl || DEFAULT_HUB_URL,
    });
    _activeSession.roomState = data;
    _activeSession.instanceId = saved.instanceId || null;

    savePartySession({
      ...saved,
      expiresAt: data.expiresAt || saved.expiresAt,
    });

    return {
      session: _activeSession,
      roomState: data,
      isHost: saved.isHost,
      code: saved.code,
      instanceId: saved.instanceId,
    };
  } catch (err) {
    console.warn("[party] Failed to verify room with Hub during restore:", err.message);
    return null;
  }
}

/** Create a new party room (host). Returns { code, deepLink, expiresAt } */
async function createRoom({ displayName, instanceId, instanceManifest, hubUrl = DEFAULT_HUB_URL } = {}) {
  if (_activeSession) await leaveRoom();

  const currentPeerId = getActivePeerId();
  const data = await fetchJson(`${hubUrl}/api/v1/party`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hostPeerId: currentPeerId,
      hostDisplayName: displayName || null,
      instanceManifest: instanceManifest || null,
    }),
  });

  if (!data || !data.success) {
    throw new Error(data?.error || "Failed to create party room");
  }

  _activeSession = new RoomSession({
    code: data.code,
    peerId: currentPeerId,
    isHost: true,
    hubUrl,
  });
  _activeSession.instanceId = instanceId || null;

  savePartySession({
    code: data.code,
    peerId: currentPeerId,
    isHost: true,
    displayName,
    instanceId: instanceId || null,
    hubUrl,
    expiresAt: data.expiresAt,
  });

  return { code: data.code, deepLink: data.deepLink, webLink: data.webLink, expiresAt: data.expiresAt };
}

/** Join an existing room (guest). Returns initial roomState */
async function joinRoom({ code, displayName, instanceId, hubUrl = DEFAULT_HUB_URL } = {}) {
  if (_activeSession) await leaveRoom();

  const currentPeerId = getActivePeerId();
  const url = `${hubUrl}/api/v1/party?code=${encodeURIComponent(code)}&peerId=${encodeURIComponent(currentPeerId)}&displayName=${encodeURIComponent(displayName || "")}`;
  const data = await fetchJson(url);

  if (!data || !data.success) {
    throw new Error(data?.error || "Room not found");
  }

  _activeSession = new RoomSession({
    code,
    peerId: currentPeerId,
    isHost: false,
    hubUrl,
  });
  _activeSession.roomState = data;
  _activeSession.instanceId = instanceId || null;

  savePartySession({
    code,
    peerId: currentPeerId,
    isHost: false,
    displayName,
    instanceId: instanceId || null,
    hubUrl,
    expiresAt: data.expiresAt,
  });

  return data;
}

/** Start polling loops for the active session */
function startSession({ onRoomUpdate, onSignal, onError, onLanDetected } = {}) {
  if (!_activeSession) throw new Error("No active room session");
  _activeSession.onRoomUpdate = onRoomUpdate || null;
  _activeSession.onSignal = onSignal || null;
  _activeSession.onError = onError || null;
  if (onLanDetected) _activeSession.onLanDetected = onLanDetected;
  _activeSession.start();
}

/** Get current room state (cached from last poll) */
function getRoomState() {
  return _activeSession ? _activeSession.roomState : null;
}

/** Update instance manifest in the room (host only) */
async function updateRoomManifest(manifest) {
  if (!_activeSession || !_activeSession.isHost) throw new Error("Not hosting a room");
  await _activeSession.updateManifest(manifest);
}

/** Start relay, get assigned port. Host must publish the tunnel separately. */
async function startRelay(lanPort) {
  if (!_activeSession || !_activeSession.isHost) throw new Error("Not hosting a room");
  return _activeSession.startLocalRelay(lanPort);
}

/** Publish tunnel address to Hub room */
async function publishTunnel(tunnelHost, tunnelPort) {
  if (!_activeSession || !_activeSession.isHost) throw new Error("Not hosting a room");
  await _activeSession.publishTunnel(tunnelHost, tunnelPort);
}

/** Mark current peer as ready */
async function setReady(ready = true) {
  if (!_activeSession) throw new Error("No active room session");
  await _activeSession.setReady(ready);
}

/** Leave / close room */
async function leaveRoom(closeIfHost = false) {
  clearPartySession();
  if (!_activeSession) return;
  await _activeSession.destroy(closeIfHost && _activeSession.isHost);
  _activeSession = null;
}

/**
 * Build a RoomManifest from a GameInstance + its mod list.
 * Guests compare this against their local state to detect drift.
 */
async function buildManifest(instance, mods = []) {
  const { hashFile } = require("./network.cjs");
  const modEntries = await Promise.allSettled(
    mods.map(async (mod) => ({
      fileName: mod.fileName,
      sha1: await hashFile(mod.path, "sha1").catch(() => null),
      modrinthId: mod.projectId || null,
      versionId: mod.versionId || null,
      enabled: mod.enabled !== false,
    }))
  );
  return {
    schema: 1,
    loader: instance.loader,
    loaderVersion: instance.loaderVersion || null,
    minecraftVersion: instance.version,
    mods: modEntries
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Diff a local instance against a host RoomManifest.
 * Returns { identical, compatible, criticalMissing[], criticalOutdated[], missing[], outdated[], extra[], loaderMismatch, hostManifest }
 */
function diffManifest(localMods, hostManifest) {
  if (!hostManifest || !Array.isArray(hostManifest.mods)) {
    return {
      identical: false,
      compatible: false,
      criticalMissing: [],
      criticalOutdated: [],
      missing: [],
      outdated: [],
      extra: [],
      loaderMismatch: false,
      hostManifest: hostManifest || null,
    };
  }

  const localBySha1 = new Map(localMods.map((m) => [m.sha1, m]));
  const localByName = new Map(localMods.map((m) => [m.fileName, m]));

  const missing = [];
  const outdated = [];

  for (const hostMod of hostManifest.mods) {
    if (!hostMod.enabled) continue;
    if (localBySha1.has(hostMod.sha1)) continue;
    const localByFileName = localByName.get(hostMod.fileName);
    const clientOnly = isClientOnlyMod(hostMod.fileName);
    if (localByFileName) {
      outdated.push({ local: localByFileName, remote: hostMod, clientOnly });
    } else {
      missing.push({ ...hostMod, clientOnly });
    }
  }

  const hostFileNames = new Set(hostManifest.mods.filter((m) => m.enabled).map((m) => m.fileName));
  const extra = localMods
    .filter((m) => m.enabled !== false && !hostFileNames.has(m.fileName))
    .map((m) => ({ ...m, clientOnly: isClientOnlyMod(m.fileName) }));

  const criticalMissing = missing.filter((m) => !m.clientOnly);
  const criticalOutdated = outdated.filter((m) => !m.clientOnly);

  return {
    identical: missing.length === 0 && outdated.length === 0,
    compatible: criticalMissing.length === 0,
    criticalMissing,
    criticalOutdated,
    missing,
    outdated,
    extra,
    loaderMismatch: false,
    hostManifest,
  };
}

module.exports = {
  initStorage,
  restoreSavedSession,
  savePartySession,
  loadPartySession,
  clearPartySession,
  createRoom,
  joinRoom,
  startSession,
  getRoomState,
  updateRoomManifest,
  startRelay,
  publishTunnel,
  setReady,
  leaveRoom,
  buildManifest,
  diffManifest,
  ensureGuestProxyAndBeacon: (host, port) => _activeSession?.ensureGuestProxyAndBeacon(host, port),
  ingestGameLog: (text) => _activeSession?.ingestGameLog(text),
  get activePeerId() { return getActivePeerId(); },
  get activeInstanceId() { return _activeSession?.instanceId ?? null; },
  get guestProxyPort() { return _activeSession?.guestProxyPort ?? null; },
  get isInRoom() { return _activeSession !== null; },
  get isHost() { return _activeSession?.isHost ?? false; },
};
