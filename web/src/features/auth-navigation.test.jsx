import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../lib/api.js", () => ({
  authClient: { session: vi.fn() },
  documentClient: {},
  invitationClient: {},
  itemClient: {},
  workspaceClient: {},
}));

import { authClient } from "../lib/api.js";
import { ProtectedRoute } from "./workspace-pages.jsx";

function renderProtectedRoute() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/workspaces"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/workspaces" element={<p>Workspace</p>} />
          </Route>
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("redirects an expired session directly to login", async () => {
  authClient.session.mockRejectedValue(
    Object.assign(new Error("Authentication is required."), { status: 401 }),
  );

  renderProtectedRoute();

  expect(await screen.findByText("Login page")).toBeInTheDocument();
  expect(screen.queryByText("Sign in required")).not.toBeInTheDocument();
});

it("keeps unexpected service errors visible instead of redirecting", async () => {
  authClient.session.mockRejectedValue(
    Object.assign(new Error("Service unavailable"), { status: 503 }),
  );

  renderProtectedRoute();

  expect(
    await screen.findByRole("heading", { name: "Unable to open TeamShelf" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Login page")).not.toBeInTheDocument();
});
