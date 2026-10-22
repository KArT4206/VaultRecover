import { describe, it, expect } from "vitest";
import { detectFormatFromBytes, validateUpload, sha256 } from "@/lib/security/fileValidation";

describe("detectFormatFromBytes", () => {
  it("detects PDF via magic bytes regardless of extension", () => {
    const buf = Buffer.from("%PDF-1.4\n...");
    expect(detectFormatFromBytes(buf, "txt")).toBe("PDF");
  });

  it("detects ZIP via magic bytes", () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(detectFormatFromBytes(buf, "zip")).toBe("ZIP");
  });

  it("classifies a ZIP-container as WORD when extension hints docx", () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(detectFormatFromBytes(buf, "docx")).toBe("WORD");
  });

  it("returns UNKNOWN for unrecognized content", () => {
    const buf = Buffer.from("just some plain text");
    expect(detectFormatFromBytes(buf, "pdf")).toBe("UNKNOWN");
  });
});

describe("validateUpload", () => {
  it("rejects files that exceed the size limit", () => {
    const buf = Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(100)]);
    const result = validateUpload(buf, "a.pdf", 10);
    expect(result.ok).toBe(false);
  });

  it("rejects a renamed file whose content does not match its extension", () => {
    const buf = Buffer.from("not a real pdf at all");
    const result = validateUpload(buf, "fake.pdf", 1_000_000);
    expect(result.ok).toBe(false);
  });

  it("accepts a genuine small PDF", () => {
    const buf = Buffer.from("%PDF-1.4\n%%EOF");
    const result = validateUpload(buf, "real.pdf", 1_000_000);
    expect(result.ok).toBe(true);
    expect(result.format).toBe("PDF");
  });
});

describe("sha256", () => {
  it("is deterministic", () => {
    const buf = Buffer.from("hello world");
    expect(sha256(buf)).toBe(sha256(Buffer.from("hello world")));
  });
});
