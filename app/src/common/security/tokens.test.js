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

  it("signs reconstructable invitation tokens and rejects tampering", () => {
    const subject = new CryptoTokenGenerator("test-signing-secret");
    const id = "5d06b947-ea4b-48ab-aea1-2c00f7dcd779";
    const token = subject.signInvitation("PLATFORM", id);

    expect(subject.verifyInvitation(token)).toEqual({
      kind: "PLATFORM",
      id,
    });
    expect(subject.verifyInvitation(`${token}tampered`)).toBeNull();
    expect(
      new CryptoTokenGenerator("different-secret").verifyInvitation(token),
    ).toBeNull();
  });
});
