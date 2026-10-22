import { describe, it, expect } from "vitest";
import { createSignedToken, verifySignedToken } from "@/lib/security/signedUrl";

describe("signed download URLs", () => {
  it("verifies a freshly created token", () => {
    const token = createSignedToken("download-123", 60_000);
    const result = verifySignedToken(token);
    expect(result?.downloadId).toBe("download-123");
  });

  it("rejects an expired token", () => {
    const token = createSignedToken("download-123", -1);
    expect(verifySignedToken(token)).toBeNull();
  });

  it("rejects a tampered token", () => {
    const token = createSignedToken("download-123", 60_000);
    const tampered = token.slice(0, -2) + "xx";
    expect(verifySignedToken(tampered)).toBeNull();
  });
});
