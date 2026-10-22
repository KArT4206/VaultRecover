import crypto from "node:crypto";

const SECRET = process.env.DOWNLOAD_URL_SECRET || "dev-insecure-secret-change-me";

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** Produces an HMAC-signed, short-TTL download token. */
export function createSignedToken(downloadId: string, ttlMs: number): string {
  const exp = Date.now() + ttlMs;
  const payload = `${downloadId}.${exp}`;
  const sig = sign(payload);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifySignedToken(token: string): { downloadId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [downloadId, expStr, sig] = decoded.split(".");
    if (!downloadId || !expStr || !sig) return null;
    const expected = sign(`${downloadId}.${expStr}`);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const exp = Number(expStr);
    if (Date.now() > exp) return null;
    return { downloadId };
  } catch {
    return null;
  }
}
