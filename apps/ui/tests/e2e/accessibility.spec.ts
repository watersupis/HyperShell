import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installFakeBridge } from "./support/fakeBridge";

// Color contrast is a theme-wide concern tracked separately from the structural
// a11y contract these tests lock in (roles, names, focus management). Scanning
// for it here would turn every palette tweak into a test failure.
const DISABLED_RULES = ["color-contrast"];

async function scan(page: Page, selector?: string) {
  let builder = new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(DISABLED_RULES);

  if (selector) {
    builder = builder.include(selector);
  }

  return builder.analyze();
}

async function openSettings(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).first().click();
  return page.getByRole("dialog", { name: "Settings" });
}

test("welcome view has no accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /hypershell/i })).toBeVisible();

  const results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("modal exposes a labelled dialog with a named close button", async ({ page }) => {
  const dialog = await openSettings(page);

  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("button", { name: "Close Settings" })).toBeVisible();

  const results = await scan(page, '[role="dialog"]');
  expect(results.violations).toEqual([]);
});

test("optional plugin controls have accessible names", async ({ page }) => {
  await page.addInitScript(installFakeBridge, {
    profiles: [],
    internalPlugins: [
      { id: "ssh", enabled: true, kind: "core" },
      { id: "sftp", enabled: false, kind: "optional" },
      { id: "local-terminal", enabled: false, kind: "optional" },
      { id: "serial", enabled: false, kind: "optional" },
      { id: "recording", enabled: false, kind: "optional" },
      { id: "tunnels", enabled: false, kind: "optional" },
    ],
  });
  const dialog = await openSettings(page);
  await dialog.getByRole("button", { name: "Plugins" }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(dialog.getByText("Installed Plugins")).toBeVisible();
  const localTerminalToggle = dialog.getByRole("checkbox", { name: "Local Terminal: Enabled" });
  await expect(localTerminalToggle).toBeVisible();
  await expect(localTerminalToggle).toHaveAttribute("aria-label", "Local Terminal: Enabled");
});

test("modal traps Tab focus and restores it on close", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Settings" }).first();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();

  // Focus starts inside the dialog rather than back at the document root.
  await expect
    .poll(() => dialog.evaluate((node) => node.contains(document.activeElement)))
    .toBe(true);

  // Tabbing many times must never escape the dialog.
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement))
    ).toBe(true);
  }

  // Shift+Tab stays trapped too.
  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement))
    ).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await expect
    .poll(() => trigger.evaluate((node) => node === document.activeElement))
    .toBe(true);
});
