import dotenv from "dotenv";
import convict from "convict";
import convictFormatWithValidator from "convict-format-with-validator";
import { fileURLToPath } from "node:url";
import { configSchema } from "./schema.js";

const rootEnvPath = fileURLToPath(new URL("../../../../.env", import.meta.url));
dotenv.config({ path: rootEnvPath, quiet: true });
convict.addFormats(convictFormatWithValidator);
convict.addFormat({
  name: "database-url",
  validate(value) {
    const parsed = new URL(value);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol))
      throw new Error("must be a PostgreSQL URL");
  },
});
const instance = convict(configSchema);
instance.validate({ allowed: "strict" });

if (instance.get("env") === "production") {
  for (const key of ["session.secret", "session.csrfSecret"]) {
    if (instance.get(key).startsWith("development-only"))
      throw new Error(`${key} must be set in production`);
  }
}

export const config = instance;
