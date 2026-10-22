/**
 * Pure-TypeScript verification of traditional PKWARE (ZipCrypto) ZIP encryption.
 *
 * This exists so the hosted (serverless) deployment can verify a candidate
 * password against the user's own ZIP without shelling out to the `unzip`
 * binary, which is not available in that runtime. Local deployments keep using
 * the binary path in `./zip.ts`.
 *
 * It verifies the same way the binary does: a candidate is only ever reported
 * as correct after the entry is decrypted, inflated and its CRC-32 matches the
 * value stored in the archive. The 1-byte header check alone has a ~1/256
 * false-positive rate, so it is used only as a fast pre-filter before the CRC
 * check. WinZip AES entries (compression method 99) are out of scope here and
 * reported as not verifiable rather than guessed.
 *
 * Reference: PKWARE APPNOTE.TXT, section 6.1 (traditional encryption).
 */
import { createReadStream } from "node:fs";
import { inflateRawSync } from "node:zlib";
import yauzl from "yauzl";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32Byte(crc: number, b: number): number {
  return ((crc >>> 8) ^ CRC_TABLE[(crc ^ b) & 0xff]) >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crc32Byte(crc, buf[i]);
  return (crc ^ 0xffffffff) >>> 0;
}

/** PKWARE key-schedule state, cheap to clone so one target can test many passwords. */
class Keys {
  k0 = 0x12345678;
  k1 = 0x23456789;
  k2 = 0x34567890;

  update(b: number): void {
    this.k0 = crc32Byte(this.k0, b);
    this.k1 = (this.k1 + (this.k0 & 0xff)) >>> 0;
    this.k1 = (Math.imul(this.k1, 134775813) + 1) >>> 0;
    this.k2 = crc32Byte(this.k2, (this.k1 >>> 24) & 0xff);
  }

  streamByte(): number {
    const temp = (this.k2 | 2) & 0xffff;
    return (Math.imul(temp, temp ^ 1) >>> 8) & 0xff;
  }
}

/**
 * Everything needed to test passwords against one encrypted entry, read once.
 * `encHeader` is the 12-byte encryption header; `cipher` is the encrypted
 * compressed data that follows it.
 */
export interface ZipCryptoTarget {
  encHeader: Buffer;
  cipher: Buffer;
  crc32: number;
  compressionMethod: number;
  /** Expected value of the 12th decrypted header byte. */
  checkByte: number;
  entryName: string;
}

interface CentralEntry {
  generalPurposeBitFlag: number;
  compressionMethod: number;
  crc32: number;
  lastModFileTime: number;
  compressedSize: number;
  relativeOffsetOfLocalHeader: number;
  fileName: string;
}

function readWholeFile(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    createReadStream(filePath)
      .on("data", (c) => chunks.push(c as Buffer))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .on("error", reject);
  });
}

function firstEncryptedEntry(filePath: string): Promise<CentralEntry | null> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error("failed to open zip"));
      let found: CentralEntry | null = null;
      zipfile.on("entry", (e: yauzl.Entry) => {
        const encrypted = (e.generalPurposeBitFlag & 0x1) !== 0;
        const isAes = e.compressionMethod === 99;
        if (encrypted && !isAes && !found) {
          found = {
            generalPurposeBitFlag: e.generalPurposeBitFlag,
            compressionMethod: e.compressionMethod,
            crc32: e.crc32 >>> 0,
            lastModFileTime: e.lastModFileTime,
            compressedSize: e.compressedSize,
            relativeOffsetOfLocalHeader: e.relativeOffsetOfLocalHeader,
            fileName: e.fileName,
          };
          zipfile.close();
          return resolve(found);
        }
        zipfile.readEntry();
      });
      zipfile.on("end", () => resolve(found));
      zipfile.on("error", reject);
      zipfile.readEntry();
    });
  });
}

const LOCAL_SIG = 0x04034b50;

/**
 * Reads the first traditional-PKWARE-encrypted entry and returns a reusable
 * target, or null when the archive has no such entry (unencrypted, or AES).
 */
export async function loadZipCryptoTarget(filePath: string): Promise<ZipCryptoTarget | null> {
  const entry = await firstEncryptedEntry(filePath);
  if (!entry) return null;
  const buf = await readWholeFile(filePath);
  const lh = entry.relativeOffsetOfLocalHeader;
  if (buf.readUInt32LE(lh) !== LOCAL_SIG) return null;
  // Local header name/extra lengths can differ from the central directory, so
  // read them from the local header itself (fixed part is 30 bytes).
  const nameLen = buf.readUInt16LE(lh + 26);
  const extraLen = buf.readUInt16LE(lh + 28);
  const dataStart = lh + 30 + nameLen + extraLen;
  const encHeader = buf.subarray(dataStart, dataStart + 12);
  const cipher = buf.subarray(dataStart + 12, dataStart + entry.compressedSize);
  if (encHeader.length < 12) return null;
  // Streamed entries (bit 3) check against the high byte of the mod time;
  // otherwise against the high byte of the CRC-32.
  const checkByte =
    (entry.generalPurposeBitFlag & 0x08) !== 0
      ? (entry.lastModFileTime >>> 8) & 0xff
      : (entry.crc32 >>> 24) & 0xff;
  return {
    encHeader: Buffer.from(encHeader),
    cipher: Buffer.from(cipher),
    crc32: entry.crc32,
    compressionMethod: entry.compressionMethod,
    checkByte,
    entryName: entry.fileName,
  };
}

function initKeys(password: string): Keys {
  const keys = new Keys();
  const pw = Buffer.from(password, "latin1");
  for (let i = 0; i < pw.length; i++) keys.update(pw[i]);
  return keys;
}

/**
 * Tests one password against a loaded target. Fast header pre-filter first,
 * then a full decrypt + inflate + CRC check so a reported match is definitive.
 */
export function verifyPassword(target: ZipCryptoTarget, password: string): boolean {
  const keys = initKeys(password);
  const header = Buffer.allocUnsafe(12);
  for (let i = 0; i < 12; i++) {
    const c = target.encHeader[i] ^ keys.streamByte();
    keys.update(c);
    header[i] = c;
  }
  if (header[11] !== target.checkByte) return false;

  // Header passed (~1/256 by chance); confirm by decrypting the body.
  const plain = Buffer.allocUnsafe(target.cipher.length);
  for (let i = 0; i < target.cipher.length; i++) {
    const c = target.cipher[i] ^ keys.streamByte();
    keys.update(c);
    plain[i] = c;
  }
  try {
    const data = target.compressionMethod === 8 ? inflateRawSync(plain) : plain;
    return crc32(data) === target.crc32;
  } catch {
    return false; // wrong key -> malformed deflate stream
  }
}

/** Convenience one-shot: open the file and test a single password. */
export async function verifyZipCryptoPassword(filePath: string, password: string): Promise<boolean> {
  const target = await loadZipCryptoTarget(filePath);
  if (!target) return false;
  return verifyPassword(target, password);
}
