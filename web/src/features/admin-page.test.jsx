import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../lib/api.js", () => ({
  authClient: { session: vi.fn() },
  adminClient: {
    users: vi.fn(),
    invitations: vi.fn(),
    updateRole: vi.fn(),
    invite: vi.fn(),
    resendInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
  },
}));

import { adminClient, authClient } from "../lib/api.js";
import { AdminPage } from "./admin-page.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("shows the invitation link and copy action from a list response", async () => {
  const url =
    "https://app.example.test/invite?token=iv1.p.invitation-id.signature";
  authClient.session.mockResolvedValue({
    user: {
      id: "admin-1",
      displayName: "Admin",
      platformRole: "ADMIN",
    },
  });
  adminClient.users.mockResolvedValue([]);
  adminClient.invitations.mockResolvedValue([
    {
      id: "invitation-1",
      email: "new-user@example.com",
      expiresAt: "2026-09-26T00:00:00.000Z",
      acceptedAt: null,
      revokedAt: null,
      url,
    },
  ]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole("tab", { name: /Invitations\s+1/ }));

  expect(
    screen.getByRole("textbox", {
      name: "Invitation link for new-user@example.com",
    }),
  ).toHaveValue(url);
  expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
});
