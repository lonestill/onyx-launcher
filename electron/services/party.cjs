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
const fsp = require("node:fs/promises");
const path = require("node:path");
const { fetchJson, downloadFile, hashFile } = require("./network.cjs");
const { injectRoomServer, removeRoomServer } = require("./servers-dat.cjs");
const { checkE4mcStatus, installE4mc, convertVanillaToFabricAndInstallE4mc } = require("./e4mc.cjs");
const { setupUpnpTunnel, deletePortMapping } = require("./upnp.cjs");
const { startPlayitTunnel, stopPlayitTunnel } = require("./playit.cjs");

const DEFAULT_HUB_URL =
  process.env.SCOPE_HUB_URL ||
  process.env.ONYX_HUB_URL ||
  "https://scope-hub.vercel.app";
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

const VIRTUAL_IFACE_PATTERNS = [
  /^utun/i,
  /^tun/i,
  /^tap/i,
  /^wg/i,
  /^ppp/i,
  /^ipsec/i,
  /tailscale/i,
  /wireguard/i,
  /amnezia/i,
  /warp/i,
  /clash/i,
  /sing-box/i,
  /v2ray/i,
  /xray/i,
  /openvpn/i,
  /zerotier/i,
  /hamachi/i,
  /radmin/i,
  /docker/i,
  /veth/i,
  /br-/i,
  /vmnet/i,
  /vbox/i,
  /vethernet/i,
  /hyper-v/i,
  /loopback/i,
  /dummy/i,
];

function isVirtualInterface(name) {
  if (!name) return false;
  return VIRTUAL_IFACE_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Inspect system network interfaces, distinguishing physical LAN from virtual/TUN/VPN.
 */
function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  let physicalIp = null;
  let virtualIp = null;
  let hasVpn = false;

  for (const [name, ifaceList] of Object.entries(interfaces)) {
    const isVirt = isVirtualInterface(name);
    for (const iface of ifaceList || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        if (iface.address.startsWith("127.") || iface.address.startsWith("169.254.")) {
          continue;
        }
        if (isVirt) {
          hasVpn = true;
          if (!virtualIp) virtualIp = iface.address;
        } else {
          if (!physicalIp) physicalIp = iface.address;
        }
      }
    }
  }

  return {
    lanIp: physicalIp || virtualIp || "127.0.0.1",
    hasVpn,
    physicalIp,
    virtualIp,
  };
}

/**
 * Get active non-internal IPv4 address for local network play.
 * Prioritizes physical NIC over virtual TUN VPN to avoid broken LAN invites.
 */
function getLocalIpAddress() {
  return getNetworkInfo().lanIp;
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
    this.instanceDirectory = null;

    // Live room state (refreshed by polling)
    this.roomState = null;

    // Local relay tunnel handle (host-side only)
    this._relayServer = null;
    this._relayPort = null;
    this._e4mcDomain = null;

    // Tunnel orchestration
    this.tunnelMode = "auto"; // "auto" | "e4mc" | "upnp" | "playit" | "local"
    this._upnpClient = null;
    this._upnpExtPort = null;
    this._playitActive = false;

    // LAN sniffer (host-side: auto-detects Minecraft Open to LAN)
    this._snifferSocket = null;
    this._detectedLanPort = null;
    this.onLanDetected = null; // ({ lanPort, relayPort, hostIp, isE4mc, tunnelType }) => void

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
   * Handle discovered Minecraft LAN server port using active tunnelMode.
   */
  async handleLanPortDetected(lanPort) {
    if (!this.isHost) return;
    this._detectedLanPort = lanPort;

    if (this._e4mcDomain) {
      await this.publishTunnel(this._e4mcDomain, MC_DEFAULT_PORT);
      this.onLanDetected?.({
        lanPort,
        relayPort: MC_DEFAULT_PORT,
        hostIp: this._e4mcDomain,
        isE4mc: true,
        tunnelType: "e4mc",
      });
      return;
    }

    const mode = this.tunnelMode || "auto";

    // 1. If UPnP is requested or in auto mode
    if (mode === "auto" || mode === "upnp") {
      try {
        console.log(`[party] Attempting UPnP port mapping for LAN port ${lanPort}...`);
        const localIp = getLocalIpAddress();
        const upnpRes = await setupUpnpTunnel({
          internalPort: lanPort,
          localIp,
        });
        if (upnpRes.success) {
          this._upnpClient = upnpRes.client;
          this._upnpExtPort = upnpRes.externalPort;
          console.log(`[party] UPnP successful: ${upnpRes.externalIp}:${upnpRes.externalPort}`);
          await this.publishTunnel(upnpRes.externalIp, upnpRes.externalPort);
          this.onLanDetected?.({
            lanPort,
            relayPort: upnpRes.externalPort,
            hostIp: upnpRes.externalIp,
            isE4mc: false,
            tunnelType: "upnp",
          });
          return;
        } else {
          console.warn("[party] UPnP failed:", upnpRes.error);
          if (mode === "upnp") {
            throw new Error(upnpRes.error || "UPnP mapping failed");
          }
        }
      } catch (err) {
        console.warn("[party] UPnP error:", err.message);
        if (mode === "upnp") {
          throw err;
        }
      }
    }

    // 2. If Playit is requested or fallback from failed UPnP in auto mode
    if (mode === "auto" || mode === "playit") {
      try {
        console.log(`[party] Starting Playit.gg tunnel for LAN port ${lanPort}...`);
        const storageRoot = _storageDir || os.homedir();
        const playitRes = await startPlayitTunnel({
          lanPort,
          storageRoot,
          onStatus: (st) => {
            console.log("[party:playit]", st.message);
          },
        });
        if (playitRes && playitRes.tunnelHost && playitRes.tunnelPort) {
          this._playitActive = true;
          console.log(`[party] Playit.gg tunnel active: ${playitRes.tunnelHost}:${playitRes.tunnelPort}`);
          await this.publishTunnel(playitRes.tunnelHost, playitRes.tunnelPort);
          this.onLanDetected?.({
            lanPort,
            relayPort: playitRes.tunnelPort,
            hostIp: playitRes.tunnelHost,
            isE4mc: false,
            tunnelType: "playit",
          });
          return;
        }
      } catch (err) {
        console.warn("[party] Playit.gg error:", err.message);
        if (mode === "playit") {
          throw err;
        }
      }
    }

    // 3. Fallback: local relay
    try {
      const assignedRelayPort = await this.startLocalRelay(lanPort);
      const hostIp = getLocalIpAddress();
      console.log(`[party] Falling back to local LAN relay: ${hostIp}:${assignedRelayPort}`);
      await this.publishTunnel(hostIp, assignedRelayPort);
      this.onLanDetected?.({
        lanPort,
        relayPort: assignedRelayPort,
        hostIp,
        isE4mc: false,
        tunnelType: "local",
      });
    } catch (err) {
      console.error("[party] Failed to start local relay:", err);
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
            this.onLanDetected({
              lanPort: MC_DEFAULT_PORT,
              relayPort: MC_DEFAULT_PORT,
              hostIp: domain,
              isE4mc: true,
              tunnelType: "e4mc",
            });
          }
        }
      }
    }

    // 2. Fallback console LAN port detection (host side)
    const lanMatch = text.match(/(?:Published LAN server on port|Started local server on|Started serving on)\s*(\d+)/i);
    if (lanMatch) {
      const lanPort = parseInt(lanMatch[1], 10);
      if (lanPort && lanPort !== this._detectedLanPort && !this._e4mcDomain) {
        console.log(`[party] Captured LAN server port from console log: ${lanPort}`);
        void this.handleLanPortDetected(lanPort);
      }
    }
  }

  // ─── Room state polling ─────────────────────────────────────────────────────

  async _pollRoom() {
    try {
      const url = `${this.hubUrl}/api/v1/party?code=${encodeURIComponent(this.code)}&peerId=${encodeURIComponent(this.peerId)}`;
      const data = await fetchJson(url);
      if (data && data.success) {
        this.roomState = { ...data, guestProxyPort: this.guestProxyPort || null };
        if (this.onRoomUpdate) this.onRoomUpdate(this.roomState);
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
          if (lanPort && lanPort !== this._detectedLanPort && !this._e4mcDomain) {
            console.log(`[party] Detected Minecraft LAN broadcast on port ${lanPort}`);
            void this.handleLanPortDetected(lanPort);
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
          if (this.roomState) {
            this.roomState = { ...this.roomState, guestProxyPort: this.guestProxyPort };
          }
          this.onRoomUpdate?.(this.roomState);
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
        `[MOTD]§a§l[Scope Room] §f${hostName}[/MOTD][AD]${this.guestProxyPort}[/AD]`,
        "utf8"
      );

      const sendBeacon = () => {
        if (!this._beaconSocket) return;
        this._beaconSocket.send(motdMsg, 0, motdMsg.length, MC_LAN_MCAST_PORT, MC_LAN_MCAST_GROUP, () => {});
      };

      sendBeacon();
      this._beaconTimer = setInterval(sendBeacon, 1500);
      console.log(`[party] Emitting LAN server beacon for Minecraft Multiplayer list`);

      // Inject server into instance servers.dat for instant display in Multiplayer menu
      if (this.instanceDirectory && this.guestProxyPort) {
        const hostName = this.roomState?.hostDisplayName || this.code;
        injectRoomServer(this.instanceDirectory, {
          code: this.code,
          address: `127.0.0.1:${this.guestProxyPort}`,
          hostName,
        }).catch((err) => console.warn("[party] Could not inject into servers.dat:", err.message));
      }
    } catch (err) {
      console.warn("[party] Failed to start guest proxy and beacon:", err.message);
    }
  }

  setGuestInstance(instanceId, instanceDirectory) {
    if (this.instanceDirectory && this.instanceDirectory !== instanceDirectory) {
      removeRoomServer(this.instanceDirectory, this.code).catch(() => {});
    }
    this.instanceId = instanceId || null;
    this.instanceDirectory = instanceDirectory || null;
    if (this.guestProxyPort && this.instanceDirectory) {
      const hostName = this.roomState?.hostDisplayName || this.code;
      injectRoomServer(this.instanceDirectory, {
        code: this.code,
        address: `127.0.0.1:${this.guestProxyPort}`,
        hostName,
      }).catch((err) => console.warn("[party] Could not inject into servers.dat:", err.message));
    }
  }

  // ─── Teardown ───────────────────────────────────────────────────────────────

  async destroy(closeRoom = false) {
    clearTimeout(this._roomPollTimer);
    clearTimeout(this._signalPollTimer);

    if (this.instanceDirectory && this.code) {
      removeRoomServer(this.instanceDirectory, this.code).catch(() => {});
    }

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

    if (this._upnpClient && this._upnpExtPort) {
      deletePortMapping(this._upnpClient, { externalPort: this._upnpExtPort }).catch(() => {});
      this._upnpClient = null;
      this._upnpExtPort = null;
    }

    if (this._playitActive) {
      stopPlayitTunnel();
      this._playitActive = false;
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
async function joinRoom({ code, displayName, instanceId, instanceDirectory, hubUrl = DEFAULT_HUB_URL } = {}) {
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
  _activeSession.instanceDirectory = instanceDirectory || null;

  if (data.tunnelHost && data.tunnelPort) {
    await _activeSession.ensureGuestProxyAndBeacon(data.tunnelHost, data.tunnelPort);
  }

  savePartySession({
    code,
    peerId: currentPeerId,
    isHost: false,
    displayName,
    instanceId: instanceId || null,
    hubUrl,
    expiresAt: data.expiresAt,
  });

  return getRoomState() || data;
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
  if (!_activeSession) return null;
  return {
    ..._activeSession.roomState,
    guestProxyPort: _activeSession.guestProxyPort || null,
  };
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

/**
 * Automatically download missing/outdated mods from Modrinth directly into instance mods folder.
 * @param {{ instanceDirectory: string, mods: Array<any>, onProgress?: Function }} param0
 */
async function syncMods({ instanceDirectory, mods = [], onProgress } = {}) {
  if (!instanceDirectory) throw new Error("instanceDirectory is required");
  const modsDir = path.join(instanceDirectory, "mods");
  await fsp.mkdir(modsDir, { recursive: true });

  const installed = [];
  const failed = [];
  const total = mods.length;

  for (let i = 0; i < total; i++) {
    const mod = mods[i];
    const modName = mod.fileName || `mod-${i + 1}.jar`;
    onProgress?.({ index: i, total, modName, percent: Math.round((i / total) * 100), status: "resolving" });

    const targetPath = path.join(modsDir, modName);

    // If file already exists and hash matches, skip
    try {
      if (mod.sha1) {
        const existingSha1 = await hashFile(targetPath, "sha1").catch(() => null);
        if (existingSha1 === mod.sha1) {
          installed.push(modName);
          continue;
        }
      }
    } catch { /**/ }

    let downloadUrl = null;
    let expectedSha1 = mod.sha1 || null;
    let expectedSize = mod.size || null;

    // 1. Try Modrinth hash lookup
    if (mod.sha1) {
      try {
        const fileInfo = await fetchJson(`https://api.modrinth.com/v2/version_file/${mod.sha1}?algorithm=sha1`);
        if (fileInfo && Array.isArray(fileInfo.files) && fileInfo.files.length > 0) {
          const matched = fileInfo.files.find((f) => f.hashes?.sha1 === mod.sha1) || fileInfo.files[0];
          downloadUrl = matched.url;
          expectedSha1 = matched.hashes?.sha1 || expectedSha1;
          expectedSize = matched.size || expectedSize;
        }
      } catch { /**/ }
    }

    // 2. Try Modrinth version lookup if versionId exists
    if (!downloadUrl && mod.versionId) {
      try {
        const verInfo = await fetchJson(`https://api.modrinth.com/v2/version/${mod.versionId}`);
        if (verInfo && Array.isArray(verInfo.files) && verInfo.files.length > 0) {
          const primary = verInfo.files.find((f) => f.primary) || verInfo.files[0];
          downloadUrl = primary.url;
          expectedSha1 = primary.hashes?.sha1 || expectedSha1;
          expectedSize = primary.size || expectedSize;
        }
      } catch { /**/ }
    }

    // 3. Fallback: Search Modrinth by cleaned name
    if (!downloadUrl && mod.fileName) {
      try {
        const cleanName = mod.fileName
          .replace(/\.jar(?:\.disabled)?$/i, "")
          .replace(/[-_]/g, " ")
          .replace(/\b(fabric|forge|neoforge|quilt|mc\d+(\.\d+)*|\d+(\.\d+)*)\b/gi, "")
          .trim();
        if (cleanName.length > 2) {
          const searchRes = await fetchJson(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(cleanName)}&limit=1`);
          if (searchRes && Array.isArray(searchRes.hits) && searchRes.hits.length > 0) {
            const hit = searchRes.hits[0];
            const versions = await fetchJson(`https://api.modrinth.com/v2/project/${hit.project_id}/version`);
            if (Array.isArray(versions) && versions.length > 0) {
              const primary = versions[0].files?.find((f) => f.primary) || versions[0].files?.[0];
              if (primary?.url) {
                downloadUrl = primary.url;
                expectedSha1 = primary.hashes?.sha1 || null;
              }
            }
          }
        }
      } catch { /**/ }
    }

    if (!downloadUrl) {
      failed.push({ fileName: modName, reason: "not-found" });
      continue;
    }

    onProgress?.({ index: i, total, modName, percent: Math.round(((i + 0.3) / total) * 100), status: "downloading" });

    try {
      await downloadFile({
        url: downloadUrl,
        destination: targetPath,
        sha1: expectedSha1 || undefined,
        size: expectedSize || undefined,
        onProgress: (p) => {
          if (p.total) {
            const filePct = p.transferred / p.total;
            onProgress?.({
              index: i,
              total,
              modName,
              percent: Math.round(((i + filePct) / total) * 100),
              status: "downloading",
            });
          }
        },
      });

      // If replacing an outdated mod with a different filename, disable old one
      if (mod.outdatedFileName && mod.outdatedFileName !== modName) {
        const oldPath = path.join(modsDir, mod.outdatedFileName);
        const disabledPath = `${oldPath}.disabled`;
        await fsp.rename(oldPath, disabledPath).catch(() => {});
      }

      installed.push(modName);
    } catch (err) {
      failed.push({ fileName: modName, reason: err.message });
    }
  }

  onProgress?.({ index: total, total, modName: "Done", percent: 100, status: "complete" });
  return { installed, failed };
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
  syncMods,
  getNetworkInfo,
  checkE4mcStatus,
  installE4mc,
  convertVanillaToFabricAndInstallE4mc,
  setupUpnpTunnel,
  setTunnelMode: (mode) => {
    if (_activeSession) _activeSession.tunnelMode = mode;
  },
  get tunnelMode() {
    return _activeSession?.tunnelMode || "auto";
  },
  setGuestInstance: (instanceId, instanceDirectory) => _activeSession?.setGuestInstance(instanceId, instanceDirectory),
  ensureGuestProxyAndBeacon: (host, port) => _activeSession?.ensureGuestProxyAndBeacon(host, port),
  ingestGameLog: (text) => _activeSession?.ingestGameLog(text),
  get activePeerId() { return getActivePeerId(); },
  get activeInstanceId() { return _activeSession?.instanceId ?? null; },
  get guestProxyPort() { return _activeSession?.guestProxyPort ?? null; },
  get isInRoom() { return _activeSession !== null; },
  get isHost() { return _activeSession?.isHost ?? false; },
};
