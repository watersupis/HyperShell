import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginSecondarySidebarViewProps } from "@hypershell/plugin-api";
import { TunnelManagerPanel } from "../../../ui/TunnelManagerPanel";
import { useTunnelStore } from "../../../ui/tunnelStore";

describe("TunnelManagerPanel saved profiles", () => {
  beforeEach(() => {
    useTunnelStore.setState({ activeForwards: [], selectedForwardId: null });
    vi.stubGlobal("crypto", { randomUUID: () => "profile-1" });
  });

  it("persists profiles in the plugin namespace and starts them through the host capability", async () => {
    let savedSettings: Record<string, unknown> = {
      portForwardProfiles: [{
        id: "saved-1",
        name: "Saved tunnel",
        hostname: "server.example",
        username: "dev",
        sshPort: 22,
        protocol: "local",
        localAddress: "127.0.0.1",
        localPort: 8080,
        remoteHost: "127.0.0.1",
        remotePort: 80,
        description: "",
      }],
    };
    const listeners = new Set<() => void>();
    const start = vi.fn().mockResolvedValue({ id: "forward-1" });
    const host = {
      i18n: {
        getLocale: () => "en",
        translate: (key: string) => key,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
      },
      settings: {
        getPlugin: (pluginId: string) => pluginId === "tunnels" ? savedSettings : {},
        updatePlugin: async (pluginId: string, partial: Record<string, unknown>) => {
          expect(pluginId).toBe("tunnels");
          savedSettings = { ...savedSettings, ...partial };
          listeners.forEach((listener) => listener());
        },
        subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
      },
      portForward: { list: vi.fn().mockResolvedValue([]), start, stop: vi.fn() },
    } as unknown as PluginSecondarySidebarViewProps["host"];

    const view = render(<TunnelManagerPanel host={host} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await userEvent.type(screen.getByLabelText("Name"), "Development API");
    await userEvent.type(screen.getByLabelText("SSH host"), "server.example");
    await userEvent.type(screen.getByLabelText("Local port"), "8080");
    await userEvent.type(screen.getByLabelText("Remote host"), "127.0.0.1");
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => expect(savedSettings.portForwardProfiles).toHaveLength(2));
    expect(screen.getByText("Saved tunnel")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      hostname: "server.example",
      port: 22,
      protocol: "local",
      localPort: 8080,
      remoteHost: "127.0.0.1",
      remotePort: 80,
    }));

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(savedSettings.portForwardProfiles).toEqual([]));
  });
});
