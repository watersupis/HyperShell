import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setShell } from "../../../../src/workbench/shared/shell";
import type { ShellApi } from "../../../../src/workbench/shared/shell";
import { WorkspaceMenu } from "../../../../src/workbench/shell/WorkspaceMenu";

afterEach(() => setShell(null));

describe("WorkspaceMenu", () => {
  const savedWorkspace = {
    name: "wsl",
    updatedAt: "2025-01-01T00:00:00.000Z",
    layout: {
      tabs: [{ profileId: "ubuntu", title: "Ubuntu", transport: "local", type: "terminal" }],
      paneCount: 1,
      splitDirection: "horizontal",
      paneSizes: [100],
    },
  };

  it("keeps the creator open while selecting a target", async () => {
    setShell({ workspaceList: vi.fn().mockResolvedValue([]), listHosts: vi.fn().mockResolvedValue([]), listLocalProfiles: vi.fn().mockResolvedValue([]) } as unknown as ShellApi);
    render(<WorkspaceMenu onClose={vi.fn()} onOpenTargets={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole("button", { name: "New Workspace" }));
    expect(await screen.findByRole("dialog", { name: "Open temporary workspace" })).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("dialog", { name: "Open temporary workspace" }));
    expect(screen.getByRole("dialog", { name: "Open temporary workspace" })).toBeTruthy();
  });

  it("starts collapsed and expands workspace details from the disclosure button", async () => {
    setShell({ workspaceList: vi.fn().mockResolvedValue([savedWorkspace]) } as unknown as ShellApi);
    render(<WorkspaceMenu onClose={vi.fn()} />);

    const disclosure = await screen.findByRole("button", { name: "Expand workspace wsl" });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("local:ubuntu")).toBeNull();

    fireEvent.click(disclosure);
    expect(screen.getByRole("button", { name: "Collapse workspace wsl" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("local:ubuntu")).toBeTruthy();
  });

  it("closes from the top-right close button", async () => {
    const onClose = vi.fn();
    setShell({ workspaceList: vi.fn().mockResolvedValue([]) } as unknown as ShellApi);
    render(<WorkspaceMenu onClose={onClose} />);

    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("offers edit and confirmed delete actions instead of deleting from the menu button", async () => {
    const workspaceRemove = vi.fn().mockResolvedValue(undefined);
    const workspaceList = vi.fn().mockResolvedValue([savedWorkspace]);
    setShell({ workspaceList, workspaceRemove, listHosts: vi.fn().mockResolvedValue([]), listLocalProfiles: vi.fn().mockResolvedValue([{ id: "ubuntu", name: "Ubuntu", isAvailable: true, isHidden: false }]) } as unknown as ShellApi);
    render(<WorkspaceMenu onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Workspace actions wsl" }));
    const menu = screen.getByRole("menu");
    expect(menu.className).not.toContain("absolute");
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit template" }));
    expect(await screen.findByRole("dialog", { name: "Edit workspace template" })).toBeTruthy();
    const nameInput = await screen.findByLabelText("Template name");
    const targetSearch = screen.getByPlaceholderText("Search local terminals or SSH hosts");
    expect(nameInput.compareDocumentPosition(targetSearch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((await screen.findByRole("checkbox", { name: /Ubuntu/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("requires confirmation before deleting a template", async () => {
    const workspaceRemove = vi.fn().mockResolvedValue(undefined);
    const workspaceList = vi.fn().mockResolvedValue([savedWorkspace]);
    setShell({ workspaceList, workspaceRemove } as unknown as ShellApi);
    render(<WorkspaceMenu onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Workspace actions wsl" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete template" }));
    expect(workspaceRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete template" }));
    await waitFor(() => expect(workspaceRemove).toHaveBeenCalledWith({ name: "wsl" }));
  });
});
