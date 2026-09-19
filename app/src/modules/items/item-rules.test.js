import { describe, expect, it } from "vitest";
import { assertMoveAllowed, prepareItemName } from "./item-rules.js";

describe("item rules", () => {
  it("trims and normalizes names", () =>
    expect(prepareItemName("  Q3 Plan  ")).toEqual({
      displayName: "Q3 Plan",
      normalizedName: "q3 plan",
    }));
  it("prevents folder cycles", () =>
    expect(() =>
      assertMoveAllowed(
        { id: "a", itemType: "FOLDER" },
        { id: "c", itemType: "FOLDER" },
        ["b", "c"],
      ),
    ).toThrow(/descendants/));
  it("protects the root item", () =>
    expect(() =>
      assertMoveAllowed(
        { id: "a", itemType: "ROOT" },
        { id: "b", itemType: "FOLDER" },
      ),
    ).toThrow(/root/));
});
