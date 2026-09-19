import crypto from "node:crypto";

export class CryptoTokenGenerator {
  generate(bytes = 32) {
    return crypto.randomBytes(bytes).toString("base64url");
  }
  hash(value) {
    return crypto.createHash("sha256").update(value, "utf8").digest("hex");
  }
  id() {
    return crypto.randomUUID();
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
