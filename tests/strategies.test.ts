import { describe, it, expect } from "vitest";
import {
  CommonPasswordStrategy,
  UserHintStrategy,
  strategiesForMode,
} from "@/lib/recovery/strategies";

describe("CommonPasswordStrategy", () => {
  it("yields a non-empty bundled candidate list", () => {
    const strategy = new CommonPasswordStrategy();
    const candidates = [...strategy.candidates({})];
    expect(candidates.length).toBeGreaterThan(10);
    expect(candidates).toContain("password123");
  });
});

describe("UserHintStrategy", () => {
  it("generates suffix and case mutations from hint words", () => {
    const strategy = new UserHintStrategy();
    const candidates = [...strategy.candidates({ knownWords: ["shadow"] })];
    expect(candidates).toContain("shadow123");
    expect(candidates).toContain("SHADOW");
  });

  it("yields nothing when no hints are given", () => {
    const strategy = new UserHintStrategy();
    expect([...strategy.candidates({})]).toHaveLength(0);
  });
});

describe("strategiesForMode", () => {
  it("FAST_CHECK uses only the common password list", () => {
    expect(strategiesForMode("FAST_CHECK")).toHaveLength(1);
  });

  it("DEEP_RECOVERY uses multiple strategies", () => {
    expect(strategiesForMode("DEEP_RECOVERY").length).toBeGreaterThan(1);
  });
});
