import { expect, test } from "@playwright/test";

test("activity bar controls the independent primary sidebar", async ({ page }) => {
  await page.goto("/");

  const activityBar = page.getByRole("navigation", { name: "Activity bar" });
  const hostsButton = activityBar.getByRole("button", { name: "Hosts" });
  const sidebar = page.locator("#primary-sidebar");

  await expect(hostsButton).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar).toHaveCSS("width", "256px");

  await hostsButton.click();
  await expect(hostsButton).toHaveAttribute("aria-expanded", "false");
  await expect(sidebar).toHaveCSS("width", "0px");
  await expect(activityBar.getByRole("button", { name: "Quick Connect (Ctrl+K)" })).toBeVisible();
  await expect(activityBar.getByRole("button", { name: "Settings" })).toBeVisible();

  await hostsButton.click();
  await expect(hostsButton).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar).toHaveCSS("width", "256px");
});
