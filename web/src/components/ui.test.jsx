import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CopyButton, Empty, Status } from "./ui.jsx";

it("renders accessible empty and status states", () => {
  render(
    <>
      <Empty title="No documents" detail="Upload one" />
      <Status value="PENDING_UPLOAD" />
    </>,
  );
  expect(
    screen.getByRole("heading", { name: "No documents" }),
  ).toBeInTheDocument();
  expect(screen.getByText("PENDING UPLOAD")).toBeInTheDocument();
});

it("shows a successful state after copying", async () => {
  const writeText = vi.fn().mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<CopyButton value="https://app.example.test/invite?token=secret" />);

  fireEvent.click(screen.getByRole("button", { name: "Copy" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Copied" })).toHaveClass(
      "copied",
    ),
  );
  expect(writeText).toHaveBeenCalledWith(
    "https://app.example.test/invite?token=secret",
  );
});
