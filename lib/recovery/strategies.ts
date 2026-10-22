import { COMMON_PASSWORDS } from "./wordlist";

export interface RecoveryStrategy {
  name: string;
  /** Yields candidate passwords lazily so huge spaces don't blow up memory. */
  candidates(hints: RecoveryHints): Generator<string>;
}

export interface RecoveryHints {
  knownWords?: string[];
  minLength?: number;
  maxLength?: number;
  includeDigits?: boolean;
  includeSymbols?: boolean;
}

/** Fast Check: bundled common-password list. */
export class CommonPasswordStrategy implements RecoveryStrategy {
  name = "common-password-list";
  *candidates(hints?: RecoveryHints): Generator<string> {
    void hints;
    for (const p of COMMON_PASSWORDS) yield p;
  }
}

/** Deep Recovery: user-supplied hint words tried as-is and with common suffixes. */
export class UserHintStrategy implements RecoveryStrategy {
  name = "user-hints";
  *candidates(hints: RecoveryHints): Generator<string> {
    const words = hints.knownWords ?? [];
    const suffixes = ["", "1", "12", "123", "!", "2024", "2025", "2026"];
    for (const w of words) {
      for (const s of suffixes) {
        yield `${w}${s}`;
      }
      yield w.toUpperCase();
      yield w.toLowerCase();
      yield w[0]?.toUpperCase() + w.slice(1);
    }
  }
}

/** Deep Recovery: bounded pattern generator over digits (PINs / short numeric passwords). */
export class PatternStrategy implements RecoveryStrategy {
  name = "numeric-pattern";
  *candidates(hints: RecoveryHints): Generator<string> {
    const min = hints.minLength ?? 4;
    const max = Math.min(hints.maxLength ?? 4, 6); // bounded — MVP, not full brute force
    for (let len = min; len <= max; len++) {
      const total = 10 ** len;
      const cap = Math.min(total, 20_000); // hard cap per length to keep MVP runtime bounded
      for (let i = 0; i < cap; i++) {
        yield i.toString().padStart(len, "0");
      }
    }
  }
}

/** Deep Recovery: simple leetspeak / case mutations of hint words. */
export class RuleBasedStrategy implements RecoveryStrategy {
  name = "rule-mutations";
  *candidates(hints: RecoveryHints): Generator<string> {
    const words = hints.knownWords ?? [];
    const leet = (w: string) =>
      w.replace(/a/gi, "@").replace(/e/gi, "3").replace(/i/gi, "1").replace(/o/gi, "0");
    for (const w of words) {
      yield leet(w);
      yield leet(w) + "!";
      yield `${w}${w}`;
      yield [...w].reverse().join("");
    }
  }
}

export function strategiesForMode(mode: "FAST_CHECK" | "DEEP_RECOVERY" | "LEGACY"): RecoveryStrategy[] {
  if (mode === "FAST_CHECK") return [new CommonPasswordStrategy()];
  // DEEP_RECOVERY and LEGACY (MVP: legacy reuses the same strategy set,
  // clearly labeled feasibility-dependent in the UI).
  return [
    new CommonPasswordStrategy(),
    new UserHintStrategy(),
    new RuleBasedStrategy(),
    new PatternStrategy(),
  ];
}
