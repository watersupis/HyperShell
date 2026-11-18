import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityBar } from "../../../../src/workbench/activity-bar/ActivityBar";

const { pluginsList } = vi.hoisted(() => ({ pluginsList: vi.fn() }));

vi.mock("../../../../src/workbench/shared/shell", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/workbench/shared/shell")>();
  return {
    ...actual,
    getShell: () => ({ pluginsList }),
  };
});

describe("ActivityBar", () => {
  it("exposes host navigation state and global actions", async () => {
    const onToggleSidebar = vi.fn();
    const onQuickConnect = vi.fn();
    const onOpenSettings = vi.fn();
    const onOpenPlugin = vi.fn();
    pluginsList.mockResolvedValue([{
      manifest: {
        id: "com.hypershell.host-monitor",
        name: "Host Monitor",
        ui: { placement: "workspace.secondarySidebar", slots: ["sidebar.navigation", "workspace.tab", "workspace.secondarySidebar"] },
      },
    }]);

    render(
      <ActivityBar
        pluginsOpen={false}
        onOpenPlugins={vi.fn()}
        sidebarOpen
        onToggleSidebar={onToggleSidebar}
        onQuickConnect={onQuickConnect}
        onOpenSettings={onOpenSettings}
        onOpenPlugin={onOpenPlugin}
      />
    );

    const activityBar = screen.getByRole("navigation", { name: "Activity bar" });
    const hostsButton = screen.getByRole("button", { name: "Hosts" });
    const pluginManagerButton = screen.getByRole("button", { name: "Plugin Manager" });
    const workspacesButton = screen.getByRole("button", { name: "Workspaces" });
    const hostMonitorButton = await screen.findByRole("button", { name: "Host Monitor" });
    const quickConnectButton = screen.getByRole("button", { name: "Quick Connect (Ctrl+K)" });
    const settingsButton = screen.getByRole("button", { name: "Settings" });
    expect(hostsButton.getAttribute("aria-expanded")).toBe("true");
    expect(hostsButton.getAttribute("aria-controls")).toBe("primary-sidebar");
    expect(hostsButton.compareDocumentPosition(quickConnectButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(quickConnectButton.compareDocumentPosition(workspacesButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(workspacesButton.querySelector("svg")?.getAttribute("width")).toBe("18");
    expect(workspacesButton.compareDocumentPosition(hostMonitorButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hostMonitorButton.compareDocumentPosition(pluginManagerButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pluginManagerButton.compareDocumentPosition(settingsButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(hostsButton);
    fireEvent.click(screen.getByRole("button", { name: "Quick Connect (Ctrl+K)" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(hostMonitorButton);

    expect(activityBar.contains(hostsButton)).toBe(true);
    expect(onToggleSidebar).toHaveBeenCalledOnce();
    expect(onQuickConnect).toHaveBeenCalledOnce();
    expect(onOpenSettings).toHaveBeenCalledOnce();
    await waitFor(() => expect(onOpenPlugin).toHaveBeenCalledWith(
      "com.hypershell.host-monitor",
      "workspace.tab",
      "Host Monitor"
    ));
  });
});
