import { describe, expect, it } from "vitest";
import { itemNameSchema, normalizeName } from "./index.js";

describe("item names", () => {
  it("normalizes names for sibling uniqueness", () =>
    expect(normalizeName("  Résumé  ")).toBe("résumé"));
  it.each(["a/b", "a\0b", "a\nb"])("rejects unsafe name %j", (name) => {
    expect(itemNameSchema.safeParse(name).success).toBe(false);
  });
});
