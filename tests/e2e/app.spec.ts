import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("renders heading and nav links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /summit of lies/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /play now/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /admin panel/i })).toBeVisible();
  });

  test("opens player selection panel from Play Now", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /play now/i }).click();
    // Panel dialog should open with "Who are you?" heading
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("Admin — unauthenticated redirect", () => {
  test("redirects /admin to /admin/login when not signed in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("Admin login", () => {
  test("shows a Back link that points to /", async ({ page }) => {
    await page.goto("/admin/login");
    const backLink = page.getByRole("link", { name: /back/i });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", "/");
  });
});
