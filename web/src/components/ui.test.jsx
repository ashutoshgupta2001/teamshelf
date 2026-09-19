import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Empty, Status } from "./ui.jsx";

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
