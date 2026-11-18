import { test, expect, type Page } from "@playwright/test";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

async function openCommandPalette(page: Page) {
  await page.goto("/");
  const activityBar = page.getByRole("navigation", { name: "Activity bar" });
  await expect(activityBar).toBeVisible();
  await activityBar.getByRole("button", { name: "Hosts" }).click();
  await page.keyboard.press(`${modifier}+Shift+P`);
  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("Command Palette", () => {
  test("opens with Ctrl+Shift+P and closes with Escape", async ({ page }) => {
    await openCommandPalette(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command Palette" })).not.toBeVisible();
  });

  test("filters commands by typing", async ({ page }) => {
    const dialog = await openCommandPalette(page);
    await dialog.getByPlaceholder("Search commands...").fill("settings");
    await expect(dialog.getByText("Open Settings")).toBeVisible();
  });

  test("shows 'No matching commands' for gibberish", async ({ page }) => {
    const dialog = await openCommandPalette(page);
    await dialog.getByPlaceholder("Search commands...").fill("zzzxxx999");
    await expect(dialog.getByText("No matching commands.")).toBeVisible();
  });

  test("executes command and closes palette", async ({ page }) => {
    const dialog = await openCommandPalette(page);
    await dialog.getByPlaceholder("Search commands...").fill("settings");
    await dialog.getByText("Open Settings").click();
    // Palette should close after execution (allow exit animation)
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test("shows shortcut badges on commands", async ({ page }) => {
    const dialog = await openCommandPalette(page);
    await dialog.getByPlaceholder("Search commands...").fill("Open Settings");
    await expect(dialog.getByText("Ctrl+,")).toBeVisible();
  });
});
