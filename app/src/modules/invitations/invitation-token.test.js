import { describe, expect, it, vi } from "vitest";
import { resolveInvitationToken } from "./invitation-token.js";

describe("resolveInvitationToken", () => {
  it("resolves a signed platform invitation by id", async () => {
    const platform = { id: "platform-invitation-1" };
    const repository = {
      findActivePlatformById: vi.fn().mockResolvedValue(platform),
      findActiveByTokenHash: vi.fn(),
    };

    await expect(
      resolveInvitationToken({
        repository,
        tokens: {
          verifyInvitation: () => ({
            kind: "PLATFORM",
            id: platform.id,
          }),
        },
        rawToken: "signed-token",
        now: new Date("2026-01-01T00:00:00Z"),
      }),
    ).resolves.toEqual({
      invitation: null,
      platform,
      bootstrap: null,
    });
    expect(repository.findActiveByTokenHash).not.toHaveBeenCalled();
  });

  it("continues to resolve legacy opaque invitation tokens by hash", async () => {
    const invitation = { id: "workspace-invitation-1" };
    const repository = {
      findActiveByTokenHash: vi.fn().mockResolvedValue(invitation),
      findPlatformByTokenHash: vi.fn(),
      findBootstrapByTokenHash: vi.fn(),
    };

    await expect(
      resolveInvitationToken({
        repository,
        tokens: {
          verifyInvitation: () => null,
          hash: () => "legacy-token-hash",
        },
        rawToken: "legacy-token",
        now: new Date("2026-01-01T00:00:00Z"),
      }),
    ).resolves.toEqual({
      invitation,
      platform: null,
      bootstrap: null,
    });
  });
});
