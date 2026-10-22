export interface StorageProvider {
  /** Writes a buffer under a fully-qualified object key. Returns the key. */
  put(key: string, data: Buffer): Promise<string>;
  /** Reads an object fully into memory. Throws if missing. */
  get(key: string): Promise<Buffer>;
  /** Returns a filesystem path usable by CLI tools (qpdf) for this key. */
  getLocalPath(key: string): Promise<string>;
  /** Deletes an object. No-op if missing. */
  delete(key: string): Promise<void>;
  /** Whether an object exists. */
  exists(key: string): Promise<boolean>;
}

export function newObjectKey(prefix: string, uuid: string, ext: string): string {
  // Random UUID-derived key only — never derived from user-supplied filenames,
  // and never containing path-traversal-relevant characters.
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8);
  return `${prefix}/${uuid}${safeExt ? "." + safeExt : ""}`;
}
