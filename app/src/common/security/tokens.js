import crypto from "node:crypto";

export class CryptoTokenGenerator {
  constructor(signingSecret = null) {
    this.signingSecret = signingSecret;
  }
  generate(bytes = 32) {
    return crypto.randomBytes(bytes).toString("base64url");
  }
  hash(value) {
    return crypto.createHash("sha256").update(value, "utf8").digest("hex");
  }
  id() {
    return crypto.randomUUID();
  }
  signInvitation(kind, id) {
    if (!this.signingSecret)
      throw new Error("An invitation signing secret is required.");
    const code = kind === "WORKSPACE" ? "w" : kind === "PLATFORM" ? "p" : null;
    if (!code) throw new Error("Unsupported invitation kind.");
    const signature = crypto
      .createHmac("sha256", this.signingSecret)
      .update(`teamshelf-invitation:v1:${code}:${id}`, "utf8")
      .digest("base64url");
    return `iv1.${code}.${id}.${signature}`;
  }
  verifyInvitation(value) {
    if (!this.signingSecret) return null;
    const [version, code, id, signature, ...extra] = String(value).split(".");
    if (
      version !== "iv1" ||
      !["w", "p"].includes(code) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      !signature ||
      extra.length
    )
      return null;
    const expected = crypto
      .createHmac("sha256", this.signingSecret)
      .update(`teamshelf-invitation:v1:${code}:${id}`, "utf8")
      .digest("base64url");
    const suppliedBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (
      suppliedBytes.length !== expectedBytes.length ||
      !crypto.timingSafeEqual(suppliedBytes, expectedBytes)
    )
      return null;
    return { kind: code === "w" ? "WORKSPACE" : "PLATFORM", id };
  }
}

export class SystemClock {
  now() {
    return new Date();
  }
  addDays(days, from = this.now()) {
    return new Date(from.getTime() + days * 86_400_000);
  }
}
