import { expect, test } from "@playwright/test";

test("renders the invite-only sign-in experience", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Your team's knowledge, together." }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("TeamShelf is invite-only")).toBeVisible();
});
