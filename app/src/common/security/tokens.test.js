import { describe, expect, it } from "vitest";
import { CryptoTokenGenerator } from "./tokens.js";

describe("CryptoTokenGenerator", () => {
  it("creates high-entropy unique values and deterministic hashes", () => {
    const subject = new CryptoTokenGenerator();
    const a = subject.generate();
    const b = subject.generate();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(subject.hash(a)).toBe(subject.hash(a));
    expect(subject.hash(a)).not.toBe(a);
  });
});
