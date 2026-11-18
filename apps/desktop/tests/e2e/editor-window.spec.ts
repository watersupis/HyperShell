import { expect, test } from "@playwright/test";

import {
  closeApp,
  createDataDir,
  launchApp,
  removeDataDir,
  type LaunchedApp
} from "./electronHarness";

let launched: LaunchedApp | undefined;
let dataDir: string | undefined;

test.beforeEach(async () => {
  dataDir = createDataDir();
  launched = await launchApp(dataDir);
});

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched.app);
    launched = undefined;
  }
  if (dataDir) {
    removeDataDir(dataDir);
    dataDir = undefined;
  }
});

test("editor:open spawns a second BrowserWindow", async () => {
  if (!launched) throw new Error("Electron app did not launch");
  expect(launched.app.windows()).toHaveLength(1);

  const editorWindow = launched.app.waitForEvent("window");

  await launched.page.evaluate(() =>
    window.hypershell.editorOpen({
      pluginId: "sftp",
      windowKey: "e2e-sftp-session",
      context: { sftpSessionId: "e2e-sftp-session" },
      payload: { remotePath: "/tmp/e2e-example.txt" }
    })
  );

  const editor = await editorWindow;
  await editor.waitForLoadState("domcontentloaded");

  expect(launched.app.windows().length).toBeGreaterThanOrEqual(2);
});

test("opening the same session twice reuses the editor window", async () => {
  if (!launched) throw new Error("Electron app did not launch");
  const firstWindow = launched.app.waitForEvent("window");
  await launched.page.evaluate(() =>
    window.hypershell.editorOpen({
      pluginId: "sftp",
      windowKey: "e2e-reuse",
      context: { sftpSessionId: "e2e-reuse" },
      payload: { remotePath: "/tmp/first.txt" }
    })
  );
  await (await firstWindow).waitForLoadState("domcontentloaded");

  const afterFirst = launched.app.windows().length;

  await launched.page.evaluate(() =>
    window.hypershell.editorOpen({
      pluginId: "sftp",
      windowKey: "e2e-reuse",
      context: { sftpSessionId: "e2e-reuse" },
      payload: { remotePath: "/tmp/second.txt" }
    })
  );

  // Same windowKey routes the file into the existing window rather than
  // stacking a new one per opened file. Give a would-be second window time to
  // appear before asserting that none did.
  await launched.page.waitForTimeout(1_500);
  expect(launched.app.windows().length).toBe(afterFirst);
});

test("rejects an editor request that fails schema validation", async () => {
  if (!launched) throw new Error("Electron app did not launch");
  const error = await launched.page.evaluate(async () => {
    try {
      await window.hypershell.editorOpen({
        pluginId: "sftp",
        windowKey: "e2e-invalid"
      } as never);
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  });

  expect(error).not.toBeNull();
});
