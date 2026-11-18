import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeApp, createDataDir, launchApp, launchAppWithInternalPlugins, removeDataDir } from "./electronHarness";

// Reproduces the reported failure end to end: a workspace saved with a tab that
// was running a Claude conversation must, after a restart, offer that
// conversation and type `claude --resume` into the restored shell.
//
// The terminal is read through session events rather than the DOM: with the
// WebGL renderer the rows are painted to a canvas and never appear as text.
const CONVERSATION = "9b5c76c7-ce88-49c8-976d-e482c9db9581";

test("a restored local tab resumes the Claude conversation it was running", async () => {
  const dataDir = createDataDir();
  const claudeProjectsDir = path.join(dataDir, ".claude", "projects", "e2e-project");
  mkdirSync(claudeProjectsDir, { recursive: true });
  writeFileSync(
    path.join(claudeProjectsDir, `${CONVERSATION}.jsonl`),
    `${JSON.stringify({ type: "user", cwd: dataDir, message: { content: "Resume fixture" } })}\n`
  );
  const envOverrides = { USERPROFILE: dataDir };

  try {
    // First run: find a real PowerShell profile and save a workspace that looks
    // like one where the user had typed `claude` in that tab.
    const first = await launchAppWithInternalPlugins(dataDir, ["local-terminal"], envOverrides);
    const profileId = await first.page.evaluate(async () => {
      const profiles = await window.hypershell!.listLocalProfiles!();
      const shell = profiles.find((profile) =>
        /powershell|pwsh/i.test(profile.executable)
      );
      return shell?.id ?? null;
    });
    expect(profileId, "no PowerShell profile was detected").not.toBeNull();

    await first.page.evaluate(
      async ({ profileId, conversation }) => {
        await window.hypershell!.workspaceSaveLast!({
          tabs: [
            {
              transport: "local",
              profileId: profileId!,
              title: "PowerShell",
              type: "terminal",
              claudeSessionId: conversation,
            },
          ],
          splitDirection: "horizontal",
          paneSizes: [100],
          paneCount: 1,
        });
      },
      { profileId, conversation: CONVERSATION }
    );
    await closeApp(first.app);

    // Second run: the restore banner, then the Claude prompt, then the command.
    const second = await launchApp(dataDir, envOverrides);
    const savedWorkspace = await second.page.evaluate(() => window.hypershell.workspaceLoadLast());
    expect(savedWorkspace?.layout.tabs[0]?.claudeSessionId).toBe(CONVERSATION);
    const sessionInfo = await second.page.evaluate(
      (sessionId) => window.hypershell.internalPluginsInvoke({
        pluginId: "local-terminal",
        method: "claude.sessionInfo",
        payload: { sessionId },
      }),
      CONVERSATION
    );
    expect((sessionInfo as { info?: { sessionId?: string } }).info?.sessionId).toBe(CONVERSATION);
    await second.page.evaluate(() => {
      const bucket = { text: "" };
      (window as unknown as { __ptyOutput: typeof bucket }).__ptyOutput = bucket;
      window.hypershell!.onSessionEvent!((event) => {
        if (event.type === "data") {
          // PSReadLine colours each token as the shell echoes it, so the
          // command is only contiguous once the escape sequences are gone.
          bucket.text += event.data.replace(/\[[0-9;?]*[ -/]*[@-~]/g, "");
        }
      });
    });

    await second.page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(second.page.getByText("Claude session")).toBeVisible();
    await second.page.getByRole("button", { name: "Resume it" }).click();

    await expect
      .poll(
        () =>
          second.page.evaluate(
            () => (window as unknown as { __ptyOutput: { text: string } }).__ptyOutput.text
          ),
        { timeout: 30_000, message: "the resume command was never typed into the shell" }
      )
      .toContain("claude --resume");

    await closeApp(second.app);
  } finally {
    removeDataDir(dataDir);
  }
});
