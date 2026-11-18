import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const desktopRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const mainEntry = path.join(desktopRoot, "dist", "main", "main.js");

// The `electron` package's main export is the path to the platform binary.
const electronBinary = require("electron") as string;

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  dataDir: string;
}

/**
 * Each test gets a throwaway data directory. `HYPERSHELL_DATA_DIR` (see
 * src/main/platform/storage/appDataDir.ts) points the app's SQLite database, backups, and
 * recordings at it, so a run never touches the developer's real HyperShell
 * data — `--user-data-dir` alone would not, because the database lives under
 * `appData`, not `userData`.
 */
export function createDataDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hypershell-e2e-"));
}

export function removeDataDir(dataDir: string): void {
  // Windows can hold the SQLite file briefly after the process exits; a failed
  // cleanup of a temp directory must never fail the test.
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Best effort.
  }
}

export async function launchApp(
  dataDir: string,
  envOverrides: NodeJS.ProcessEnv = {}
): Promise<LaunchedApp> {
  if (!existsSync(mainEntry)) {
    throw new Error(
      `Missing ${mainEntry}. Run 'pnpm --filter @hypershell/desktop build:bundle' before the Electron E2E suite.`
    );
  }

  const appEnv = {
    ...process.env,
    ...envOverrides,
    HYPERSHELL_DATA_DIR: dataDir
  };
  delete appEnv.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    executablePath: electronBinary,
    args: [desktopRoot],
    cwd: desktopRoot,
    // The update service already no-ops when the app is unpackaged, which it
    // always is here, so nothing reaches the network.
    env: appEnv
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  // The preload bridge is the thing under test in most of these specs — wait
  // for it rather than assuming it landed.
  await page.waitForFunction(() => Boolean((window as Window).hypershell), null, {
    timeout: 30_000
  });

  return { app, page, dataDir };
}

export async function launchAppWithInternalPlugins(
  dataDir: string,
  pluginIds: string[],
  envOverrides: NodeJS.ProcessEnv = {}
): Promise<LaunchedApp> {
  const initial = await launchApp(dataDir, envOverrides);
  await initial.page.evaluate(async (ids) => {
    await Promise.all(ids.map((id) => window.hypershell.internalPluginsSetEnabled({ id, enabled: true })));
  }, pluginIds);
  await closeApp(initial.app);
  return launchApp(dataDir, envOverrides);
}

export async function closeApp(app: ElectronApplication): Promise<void> {
  await app.close();
}

/** Path of the SQLite database inside an isolated data dir. */
export function databasePath(dataDir: string): string {
  return path.join(dataDir, "HyperShell", "hypershell.db");
}
