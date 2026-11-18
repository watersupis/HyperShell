import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setShell } from "../../../../src/workbench/shared/shell";
import type { ShellApi } from "../../../../src/workbench/shared/shell";
import { WorkspaceCreator, workspacePresetLayout } from "../../../../src/workbench/shell/WorkspaceCreator";

const hosts = [{ id: "host-1", name: "Build host", hostname: "build.example", port: 22, username: "dev", identityFile: null, authProfileId: null, groupId: null, notes: null }];
const profiles = [{ id: "local-1", name: "PowerShell", executable: "pwsh.exe", args: [], startingDirectory: null, icon: "powershell", color: null, elevated: false, source: "detected", detectKey: null, isAvailable: true, isHidden: false, sortOrder: 0, claudeSession: false, claudeSessionMode: "continue" }];

afterEach(() => setShell(null));

describe("workspacePresetLayout", () => {
  it("splits selected terminals across columns and keeps the main pane larger", () => {
    const targets = Array.from({ length: 6 }, (_, index) => ({ transport: "local" as const, profileId: String(index), title: "Terminal " + index }));
    expect(workspacePresetLayout("columns-2", targets)).toMatchObject({ paneCount: 2, paneSizes: [50, 50] });
    expect(workspacePresetLayout("main-right", targets).paneSizes).toEqual([70, 30]);
    expect(workspacePresetLayout("main-bottom", targets).splitDirection).toBe("vertical");
  });
});

describe("WorkspaceCreator", () => {
  it("loads local and SSH targets and opens the selected layout", async () => {
    setShell({ listHosts: vi.fn().mockResolvedValue(hosts), listLocalProfiles: vi.fn().mockResolvedValue(profiles) } as unknown as ShellApi);
    const onOpen = vi.fn().mockResolvedValue(undefined);
    render(<WorkspaceCreator onCancel={vi.fn()} onOpen={onOpen} onSaveTemplate={vi.fn()} />);

    const local = await screen.findByRole("checkbox", { name: /PowerShell/ });
    const ssh = screen.getByRole("checkbox", { name: /Build host/ });
    fireEvent.click(local);
    fireEvent.click(ssh);
    fireEvent.click(screen.getByRole("button", { name: "2 columns" }));
    fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledOnce());
    expect(onOpen.mock.calls[0]?.[0]).toEqual([
      { transport: "local", profileId: "local-1", title: "PowerShell" },
      { transport: "ssh", profileId: "host-1", title: "Build host", hostId: "host-1" },
    ]);
    expect(onOpen.mock.calls[0]?.[1]).toBe("columns-2");
  });

  it("saves selected targets as a named template with layout metadata", async () => {
    setShell({ listHosts: vi.fn().mockResolvedValue([]), listLocalProfiles: vi.fn().mockResolvedValue(profiles) } as unknown as ShellApi);
    const onSaveTemplate = vi.fn().mockResolvedValue(undefined);
    render(<WorkspaceCreator onCancel={vi.fn()} onOpen={vi.fn()} onSaveTemplate={onSaveTemplate} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /PowerShell/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Template name" }), { target: { value: "Ops" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save template" }).at(-1)!);

    await waitFor(() => expect(onSaveTemplate).toHaveBeenCalledOnce());
    expect(onSaveTemplate.mock.calls[0]?.[0]).toBe("Ops");
    expect(onSaveTemplate.mock.calls[0]?.[1]).toMatchObject({ paneCount: 1, splitDirection: "horizontal", tabs: [{ profileId: "local-1", transport: "local" }] });
  });
});
