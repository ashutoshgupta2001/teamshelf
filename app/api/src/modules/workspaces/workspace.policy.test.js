import { describe, expect, it } from "vitest";
import { WorkspacePolicy } from "./workspace.policy.js";

const policy = new WorkspacePolicy();
const context = (ownerUserId = "owner", userId = "member") => ({
  workspace: { ownerUserId, status: "ACTIVE" },
  membership: {},
  userId,
});

describe("WorkspacePolicy", () => {
  it("lets members read workspace content", () =>
    expect(() => policy.requireMember(context())).not.toThrow());
  it("restricts owner operations", () =>
    expect(() => policy.requireOwner(context())).toThrow(/permission/));
  it("lets the owner manage any content", () =>
    expect(() =>
      policy.requireContentEditor(context("owner", "owner"), {
        createdBy: "other",
      }),
    ).not.toThrow());
  it("lets members edit only their own content", () => {
    expect(() =>
      policy.requireContentEditor(context(), { createdBy: "member" }),
    ).not.toThrow();
    expect(() =>
      policy.requireContentEditor(context(), { createdBy: "other" }),
    ).toThrow(/permission/);
  });
});
