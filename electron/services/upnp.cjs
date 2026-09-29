"use strict";

/**
 * upnp.cjs — Lightweight, zero-dependency UPnP IGD (Internet Gateway Device) client.
 *
 * Implements:
 *   1. SSDP M-SEARCH discovery on 239.255.255.250:1900
 *   2. Device description XML fetch & parse for WANIPConnection / WANPPPConnection
 *   3. SOAP actions:
 *      - GetExternalIPAddress: returns router's WAN IPv4 address
 *      - AddPortMapping: opens external port forwarded to local host
 *      - DeletePortMapping: tears down port mapping on shutdown
 */

const dgram = require("node:dgram");
const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

const SSDP_MCAST_ADDR = "239.255.255.250";
const SSDP_MCAST_PORT = 1900;

const SERVICE_TYPES = [
  "urn:schemas-upnp-org:service:WANIPConnection:1",
  "urn:schemas-upnp-org:service:WANIPConnection:2",
  "urn:schemas-upnp-org:service:WANPPPConnection:1",
];

function isPrivateOrCgnatIp(ip) {
  if (!ip || typeof ip !== "string") return true;
  const trimmed = ip.trim();
  if (
    trimmed.startsWith("10.") ||
    trimmed.startsWith("192.168.") ||
    trimmed.startsWith("127.") ||
    trimmed.startsWith("169.254.") ||
    trimmed === "0.0.0.0"
  ) {
    return true;
  }
  // 172.16.0.0 – 172.31.255.255
  const match172 = trimmed.match(/^172\.(\d+)\./);
  if (match172) {
    const octet = parseInt(match172[1], 10);
    if (octet >= 16 && octet <= 31) return true;
  }
  // CGNAT: 100.64.0.0 – 100.127.255.255
  const match100 = trimmed.match(/^100\.(\d+)\./);
  if (match100) {
    const octet = parseInt(match100[1], 10);
    if (octet >= 64 && octet <= 127) return true;
  }
  return false;
}

function fetchText(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const client = parsed.protocol === "https:" ? https : http;
    const req = client.request(
      parsed,
      {
        method: options.method || "GET",
        headers: options.headers || {},
        timeout: options.timeout || 3500,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          }
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * Discover IGD on local network using SSDP M-SEARCH.
 * Returns { serviceType, controlUrl, locationUrl } or null.
 */
async function discoverIgd(timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        try { socket.close(); } catch { /**/ }
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    socket.on("error", () => {
      cleanup();
      clearTimeout(timer);
      resolve(null);
    });

    socket.on("message", async (msg) => {
      const text = msg.toString("utf8");
      const locationMatch = text.match(/LOCATION:\s*([^\r\n]+)/i);
      if (!locationMatch) return;

      const locationUrl = locationMatch[1].trim();
      try {
        const client = await parseDeviceDescription(locationUrl);
        if (client && !resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanup();
          resolve(client);
        }
      } catch { /**/ }
    });

    socket.bind(0, () => {
      try {
        const query =
          "M-SEARCH * HTTP/1.1\r\n" +
          `HOST: ${SSDP_MCAST_ADDR}:${SSDP_MCAST_PORT}\r\n` +
          'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n' +
          'MAN: "ssdp:discover"\r\n' +
          "MX: 2\r\n\r\n";
        const buf = Buffer.from(query, "utf8");
        socket.send(buf, 0, buf.length, SSDP_MCAST_PORT, SSDP_MCAST_ADDR);

        // Also query WANIPConnection directly as fallback
        const query2 =
          "M-SEARCH * HTTP/1.1\r\n" +
          `HOST: ${SSDP_MCAST_ADDR}:${SSDP_MCAST_PORT}\r\n` +
          'ST: urn:schemas-upnp-org:service:WANIPConnection:1\r\n' +
          'MAN: "ssdp:discover"\r\n' +
          "MX: 2\r\n\r\n";
        const buf2 = Buffer.from(query2, "utf8");
        socket.send(buf2, 0, buf2.length, SSDP_MCAST_PORT, SSDP_MCAST_ADDR);
      } catch {
        cleanup();
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

/**
 * Fetch router device description XML and find WANIPConnection / WANPPPConnection controlURL.
 */
async function parseDeviceDescription(locationUrl) {
  const xml = await fetchText(locationUrl, { timeout: 2500 });
  const base = new URL(locationUrl);

  for (const st of SERVICE_TYPES) {
    const serviceBlockRegex = new RegExp(
      `<service>([\\s\\S]*?<serviceType>\\s*${st}\\s*<\\/serviceType>[\\s\\S]*?)<\\/service>`,
      "i",
    );
    const match = xml.match(serviceBlockRegex);
    if (match) {
      const block = match[1];
      const ctlMatch = block.match(/<controlURL>\s*([^<\s]+)\s*<\/controlURL>/i);
      if (ctlMatch) {
        const rawCtl = ctlMatch[1].trim();
        const controlUrl = new URL(rawCtl, base).toString();
        return {
          serviceType: st,
          controlUrl,
          locationUrl,
        };
      }
    }
  }
  return null;
}

/**
 * Send SOAP Action to router control URL.
 */
async function sendSoapAction({ controlUrl, serviceType, action, args = {} }) {
  let argsXml = "";
  for (const [k, v] of Object.entries(args)) {
    argsXml += `<${k}>${v ?? ""}</${k}>`;
  }

  const soapBody =
    '<?xml version="1.0" encoding="utf-8"?>\r\n' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\r\n' +
    "  <s:Body>\r\n" +
    `    <u:${action} xmlns:u="${serviceType}">\r\n` +
    `      ${argsXml}\r\n` +
    `    </u:${action}>\r\n` +
    "  </s:Body>\r\n" +
    "</s:Envelope>";

  const resXml = await fetchText(controlUrl, {
    method: "POST",
    headers: {
      "Content-Type": 'text/xml; charset="utf-8"',
      SOAPAction: `"${serviceType}#${action}"`,
    },
    body: soapBody,
    timeout: 3000,
  });

  return resXml;
}

/**
 * Query external WAN IP of the router.
 */
async function getExternalIp(client) {
  const res = await sendSoapAction({
    controlUrl: client.controlUrl,
    serviceType: client.serviceType,
    action: "GetExternalIPAddress",
  });
  const match = res.match(/<NewExternalIPAddress>\s*([^<\s]+)\s*<\/NewExternalIPAddress>/i);
  return match ? match[1].trim() : null;
}

/**
 * Add UPnP port mapping on router.
 */
async function addPortMapping(client, { internalPort, externalPort, internalClient, description = "Scope Party", protocol = "TCP", leaseDuration = 0 }) {
  await sendSoapAction({
    controlUrl: client.controlUrl,
    serviceType: client.serviceType,
    action: "AddPortMapping",
    args: {
      NewRemoteHost: "",
      NewExternalPort: externalPort,
      NewProtocol: protocol,
      NewInternalPort: internalPort,
      NewInternalClient: internalClient,
      NewEnabled: "1",
      NewPortMappingDescription: description,
      NewLeaseDuration: leaseDuration,
    },
  });
  return true;
}

/**
 * Delete UPnP port mapping from router.
 */
async function deletePortMapping(client, { externalPort, protocol = "TCP" }) {
  try {
    await sendSoapAction({
      controlUrl: client.controlUrl,
      serviceType: client.serviceType,
      action: "DeletePortMapping",
      args: {
        NewRemoteHost: "",
        NewExternalPort: externalPort,
        NewProtocol: protocol,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * High-level UPnP helper:
 * Attempts to discover IGD, checks if external IP is public, and maps the port.
 * Returns { success: boolean, externalIp: string, externalPort: number, error?: string }
 */
async function setupUpnpTunnel({ internalPort, externalPort = null, localIp }) {
  try {
    const client = await discoverIgd(2500);
    if (!client) {
      return { success: false, error: "UPnP Internet Gateway Device not found on local network" };
    }

    const wanIp = await getExternalIp(client);
    if (!wanIp) {
      return { success: false, error: "Router did not return external IP" };
    }

    if (isPrivateOrCgnatIp(wanIp)) {
      return {
        success: false,
        externalIp: wanIp,
        isCgnat: true,
        error: `Router has private or CGNAT IP (${wanIp}), direct port forwarding cannot route from the internet`,
      };
    }

    const targetExtPort = externalPort || internalPort;
    await addPortMapping(client, {
      internalPort,
      externalPort: targetExtPort,
      internalClient: localIp,
      description: "Scope Party Minecraft World",
      protocol: "TCP",
      leaseDuration: 0,
    });

    return {
      success: true,
      client,
      externalIp: wanIp,
      externalPort: targetExtPort,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || "UPnP setup failed",
    };
  }
}

module.exports = {
  discoverIgd,
  getExternalIp,
  addPortMapping,
  deletePortMapping,
  setupUpnpTunnel,
  isPrivateOrCgnatIp,
};
