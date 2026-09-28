"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");

const TAG = {
  END: 0,
  BYTE: 1,
  SHORT: 2,
  INT: 3,
  LONG: 4,
  FLOAT: 5,
  DOUBLE: 6,
  BYTE_ARRAY: 7,
  STRING: 8,
  LIST: 9,
  COMPOUND: 10,
  INT_ARRAY: 11,
  LONG_ARRAY: 12,
};

class NbtReader {
  constructor(buffer) {
    this.buf = buffer;
    this.offset = 0;
  }

  readByte() {
    const val = this.buf.readInt8(this.offset);
    this.offset += 1;
    return val;
  }

  readShort() {
    const val = this.buf.readInt16BE(this.offset);
    this.offset += 2;
    return val;
  }

  readInt() {
    const val = this.buf.readInt32BE(this.offset);
    this.offset += 4;
    return val;
  }

  readLong() {
    const val = this.buf.readBigInt64BE(this.offset);
    this.offset += 8;
    return val;
  }

  readFloat() {
    const val = this.buf.readFloatBE(this.offset);
    this.offset += 4;
    return val;
  }

  readDouble() {
    const val = this.buf.readDoubleBE(this.offset);
    this.offset += 8;
    return val;
  }

  readString() {
    const len = this.buf.readUInt16BE(this.offset);
    this.offset += 2;
    const str = this.buf.toString("utf8", this.offset, this.offset + len);
    this.offset += len;
    return str;
  }

  readPayload(type) {
    switch (type) {
      case TAG.BYTE:
        return this.readByte();
      case TAG.SHORT:
        return this.readShort();
      case TAG.INT:
        return this.readInt();
      case TAG.LONG:
        return this.readLong();
      case TAG.FLOAT:
        return this.readFloat();
      case TAG.DOUBLE:
        return this.readDouble();
      case TAG.BYTE_ARRAY: {
        const len = this.readInt();
        const slice = this.buf.subarray(this.offset, this.offset + len);
        this.offset += len;
        return Buffer.from(slice);
      }
      case TAG.STRING:
        return this.readString();
      case TAG.LIST: {
        const itemType = this.readByte();
        const len = this.readInt();
        const list = [];
        for (let i = 0; i < len; i++) {
          list.push(this.readPayload(itemType));
        }
        return { itemType, list };
      }
      case TAG.COMPOUND: {
        const compound = {};
        while (this.offset < this.buf.length) {
          const childType = this.readByte();
          if (childType === TAG.END) break;
          const name = this.readString();
          compound[name] = {
            type: childType,
            value: this.readPayload(childType),
          };
        }
        return compound;
      }
      case TAG.INT_ARRAY: {
        const len = this.readInt();
        const arr = [];
        for (let i = 0; i < len; i++) {
          arr.push(this.readInt());
        }
        return arr;
      }
      case TAG.LONG_ARRAY: {
        const len = this.readInt();
        const arr = [];
        for (let i = 0; i < len; i++) {
          arr.push(this.readLong());
        }
        return arr;
      }
      default:
        throw new Error(`Unknown NBT tag type: ${type} at offset ${this.offset}`);
    }
  }

  readRoot() {
    const rootType = this.readByte();
    if (rootType === TAG.END) return null;
    if (rootType !== TAG.COMPOUND) {
      throw new Error(`Expected compound root tag, got ${rootType}`);
    }
    const rootName = this.readString();
    const value = this.readPayload(TAG.COMPOUND);
    return { name: rootName, value };
  }
}

class NbtWriter {
  constructor() {
    this.chunks = [];
  }

  writeByte(val) {
    const b = Buffer.alloc(1);
    b.writeInt8(val, 0);
    this.chunks.push(b);
  }

  writeShort(val) {
    const b = Buffer.alloc(2);
    b.writeInt16BE(val, 0);
    this.chunks.push(b);
  }

  writeInt(val) {
    const b = Buffer.alloc(4);
    b.writeInt32BE(val, 0);
    this.chunks.push(b);
  }

  writeLong(val) {
    const b = Buffer.alloc(8);
    b.writeBigInt64BE(typeof val === "bigint" ? val : BigInt(val), 0);
    this.chunks.push(b);
  }

  writeFloat(val) {
    const b = Buffer.alloc(4);
    b.writeFloatBE(val, 0);
    this.chunks.push(b);
  }

  writeDouble(val) {
    const b = Buffer.alloc(8);
    b.writeDoubleBE(val, 0);
    this.chunks.push(b);
  }

  writeString(str) {
    const strBuf = Buffer.from(String(str || ""), "utf8");
    this.writeShort(strBuf.length);
    this.chunks.push(strBuf);
  }

  writePayload(type, val) {
    switch (type) {
      case TAG.BYTE:
        this.writeByte(Number(val));
        break;
      case TAG.SHORT:
        this.writeShort(Number(val));
        break;
      case TAG.INT:
        this.writeInt(Number(val));
        break;
      case TAG.LONG:
        this.writeLong(val);
        break;
      case TAG.FLOAT:
        this.writeFloat(Number(val));
        break;
      case TAG.DOUBLE:
        this.writeDouble(Number(val));
        break;
      case TAG.BYTE_ARRAY: {
        const buf = Buffer.isBuffer(val) ? val : Buffer.from(val);
        this.writeInt(buf.length);
        this.chunks.push(buf);
        break;
      }
      case TAG.STRING:
        this.writeString(val);
        break;
      case TAG.LIST: {
        const itemType = val.itemType || TAG.COMPOUND;
        const list = Array.isArray(val.list) ? val.list : (Array.isArray(val) ? val : []);
        this.writeByte(itemType);
        this.writeInt(list.length);
        for (const item of list) {
          if (itemType === TAG.COMPOUND) {
            this.writeCompoundPayload(item);
          } else {
            this.writePayload(itemType, item);
          }
        }
        break;
      }
      case TAG.COMPOUND: {
        this.writeCompoundPayload(val);
        break;
      }
      case TAG.INT_ARRAY: {
        const arr = Array.isArray(val) ? val : [];
        this.writeInt(arr.length);
        for (const num of arr) this.writeInt(num);
        break;
      }
      case TAG.LONG_ARRAY: {
        const arr = Array.isArray(val) ? val : [];
        this.writeInt(arr.length);
        for (const num of arr) this.writeLong(num);
        break;
      }
      default:
        throw new Error(`Cannot write NBT tag type: ${type}`);
    }
  }

  writeCompoundPayload(compound) {
    const entries = compound && typeof compound === "object" ? Object.entries(compound) : [];
    for (const [key, field] of entries) {
      const type = field.type;
      const value = field.value !== undefined ? field.value : field;
      this.writeByte(type);
      this.writeString(key);
      this.writePayload(type, value);
    }
    this.writeByte(TAG.END);
  }

  writeRoot(root) {
    this.writeByte(TAG.COMPOUND);
    this.writeString(root.name || "");
    this.writeCompoundPayload(root.value || {});
    return Buffer.concat(this.chunks);
  }
}

/**
 * Decode an NBT buffer, automatically decompressing gzip if needed.
 */
function decodeNbt(buffer) {
  if (!buffer || buffer.length === 0) return null;
  let uncompressed = buffer;
  // Check for gzip magic header (0x1f, 0x8b)
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    uncompressed = zlib.gunzipSync(buffer);
  }
  const reader = new NbtReader(uncompressed);
  return reader.readRoot();
}

/**
 * Encode a root NBT compound into a gzipped buffer.
 */
function encodeNbt(rootCompound, gzip = true) {
  const writer = new NbtWriter();
  const raw = writer.writeRoot(rootCompound);
  return gzip ? zlib.gzipSync(raw) : raw;
}

/**
 * Read and parse servers.dat from an instance directory.
 * @param {string} instanceDirectory
 * @returns {Promise<Array<{ name: string, ip: string, icon?: string, hidden?: number, acceptTextures?: number }>>}
 */
async function readServersDat(instanceDirectory) {
  const filePath = path.join(instanceDirectory, "servers.dat");
  try {
    const raw = await fsp.readFile(filePath);
    const nbt = decodeNbt(raw);
    if (!nbt || !nbt.value || !nbt.value.servers) return [];

    const serversList = nbt.value.servers.value?.list || [];
    return serversList.map((entry) => {
      const s = {};
      for (const [k, v] of Object.entries(entry)) {
        s[k] = v.value;
      }
      return {
        name: String(s.name || ""),
        ip: String(s.ip || ""),
        icon: s.icon ? String(s.icon) : undefined,
        hidden: s.hidden !== undefined ? Number(s.hidden) : 0,
        acceptTextures: s.acceptTextures !== undefined ? Number(s.acceptTextures) : undefined,
      };
    });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    console.warn(`[servers-dat] Failed to read ${filePath}:`, err.message);
    return [];
  }
}

/**
 * Write a list of servers to servers.dat in the instance directory.
 * @param {string} instanceDirectory
 * @param {Array<{ name: string, ip: string, icon?: string, hidden?: number, acceptTextures?: number }>} servers
 */
async function writeServersDat(instanceDirectory, servers) {
  const filePath = path.join(instanceDirectory, "servers.dat");
  const serverEntries = (servers || []).map((s) => {
    const entry = {
      name: { type: TAG.STRING, value: String(s.name || "") },
      ip: { type: TAG.STRING, value: String(s.ip || "") },
    };
    if (s.icon) {
      entry.icon = { type: TAG.STRING, value: String(s.icon) };
    }
    if (s.hidden !== undefined) {
      entry.hidden = { type: TAG.BYTE, value: Number(s.hidden) };
    }
    if (s.acceptTextures !== undefined) {
      entry.acceptTextures = { type: TAG.BYTE, value: Number(s.acceptTextures) };
    }
    return entry;
  });

  const root = {
    name: "",
    value: {
      servers: {
        type: TAG.LIST,
        value: {
          itemType: TAG.COMPOUND,
          list: serverEntries,
        },
      },
    },
  };

  const gzipped = encodeNbt(root, true);
  await fsp.mkdir(instanceDirectory, { recursive: true });
  await fsp.writeFile(filePath, gzipped);
}

/**
 * Inject an Onyx Party room server at the top of servers.dat.
 * If an entry for this room code already exists, update its address/name.
 *
 * @param {string} instanceDirectory
 * @param {{ code: string, address: string, hostName?: string }} params
 */
async function injectRoomServer(instanceDirectory, { code, address, hostName = "Host" }) {
  if (!instanceDirectory || !code || !address) return;
  const servers = await readServersDat(instanceDirectory);

  const cleanCode = code.toUpperCase();
  const serverName = `§d§l[Scope Room] §f${hostName} §7(${cleanCode})`;

  const existingIdx = servers.findIndex(
    (s) =>
      s.ip === address ||
      (s.name && s.name.includes(`(${cleanCode})`)) ||
      (s.name && (s.name.includes("[Scope Room]") || s.name.includes("[Onyx Room]")) && s.name.includes(cleanCode))
  );

  const newEntry = {
    name: serverName,
    ip: address,
    hidden: 0,
  };

  if (existingIdx >= 0) {
    servers[existingIdx] = newEntry;
  } else {
    // Put at the very beginning so the user immediately sees it in Minecraft Multiplayer list
    servers.unshift(newEntry);
  }

  await writeServersDat(instanceDirectory, servers);
  console.log(`[servers-dat] Injected Scope Room server into ${instanceDirectory}/servers.dat -> ${address}`);
}

/**
 * Remove a Scope/Onyx Room server from servers.dat by room code.
 *
 * @param {string} instanceDirectory
 * @param {string} code
 */
async function removeRoomServer(instanceDirectory, code) {
  if (!instanceDirectory || !code) return;
  const servers = await readServersDat(instanceDirectory);
  const cleanCode = code.toUpperCase();

  const filtered = servers.filter(
    (s) =>
      !(
        (s.name && s.name.includes(`(${cleanCode})`)) ||
        (s.name && (s.name.includes("[Scope Room]") || s.name.includes("[Onyx Room]")) && s.name.includes(cleanCode))
      )
  );

  if (filtered.length !== servers.length) {
    await writeServersDat(instanceDirectory, filtered);
    console.log(`[servers-dat] Removed Scope Room ${cleanCode} from servers.dat`);
  }
}

module.exports = {
  TAG,
  NbtReader,
  NbtWriter,
  decodeNbt,
  encodeNbt,
  readServersDat,
  writeServersDat,
  injectRoomServer,
  removeRoomServer,
};
