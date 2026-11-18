import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityBar } from "../../../../src/workbench/activity-bar/ActivityBar";

describe("ActivityBar", () => {
  it("exposes host navigation state and global actions", () => {
    const onToggleSidebar = vi.fn();
    const onQuickConnect = vi.fn();
    const onOpenSettings = vi.fn();
    const onOpenHostMonitor = vi.fn();

    render(
      <ActivityBar
        pluginsOpen={false}
        onOpenPlugins={vi.fn()}
        sidebarOpen
        onToggleSidebar={onToggleSidebar}
        onQuickConnect={onQuickConnect}
        onOpenSettings={onOpenSettings}
        onOpenHostMonitor={onOpenHostMonitor}
      />
    );

    const activityBar = screen.getByRole("navigation", { name: "Activity bar" });
    const hostsButton = screen.getByRole("button", { name: "Hosts" });
    const pluginManagerButton = screen.getByRole("button", { name: "Plugin Manager" });
    const workspacesButton = screen.getByRole("button", { name: "Workspaces" });
    const hostMonitorButton = screen.getByRole("button", { name: "Host Monitor" });
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
    expect(onOpenHostMonitor).toHaveBeenCalledOnce();
  });
});
