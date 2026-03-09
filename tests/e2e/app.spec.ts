import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("renders heading and nav links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /summit of lies/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /play now/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /admin panel/i })).toBeVisible();
  });

  test("navigates to game page from Play Now", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /play now/i }).click();
    await expect(page).toHaveURL(/\/game/);
  });
});

test.describe("Game / Player login flow", () => {
  test("shows nickname form", async ({ page }) => {
    await page.goto("/game");
    await expect(page.getByRole("heading", { name: /join the game/i })).toBeVisible();
    await expect(page.getByLabel(/nickname/i)).toBeVisible();
  });
});

test.describe("Admin — unauthenticated redirect", () => {
  test("redirects /admin to /admin/login when not signed in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
