import type { ButtonHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PluginHostContext, PluginUiHostServices } from "@hypershell/plugin-api";
import type { ConnectionHistoryRecord } from "../../../connectionHistory";
import { ConnectionHistoryDialog } from "../../../ui/ConnectionHistoryDialog";

function TestModal({ open, title, children }: { open: boolean; title: string; children: ReactNode }) {
  return open ? <div role="dialog" aria-label={title}>{children}</div> : null;
}

function TestButton({
  children,
  variant: _variant,
  size: _size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) {
  return <button {...props}>{children}</button>;
}

function makeRecord(overrides: Partial<ConnectionHistoryRecord> = {}): ConnectionHistoryRecord {
  return {
    id: "history-1",
    hostId: "host-1",
    hostName: "Production",
    connectedAt: "2026-11-13T10:00:00.000Z",
    disconnectedAt: "2026-11-13T10:01:05.000Z",
    wasSuccessful: true,
    errorMessage: null,
    ...overrides,
  };
}

function renderDialog(invoke: ReturnType<typeof vi.fn>, open = true) {
  const services = {
    isAvailable: () => true,
    Modal: TestModal,
    ui: { Button: TestButton },
    pluginMain: { invoke },
  } as unknown as PluginUiHostServices;

  render(
    <ConnectionHistoryDialog
      open={open}
      host={{ id: "host-1", name: "Production" } as PluginHostContext}
      services={services}
      onClose={vi.fn()}
    />
  );
}

describe("ConnectionHistoryDialog", () => {
  it("loads records for the selected host and renders result summary and durations", async () => {
    const invoke = vi.fn().mockResolvedValue([
      makeRecord(),
      makeRecord({
        id: "history-2",
        wasSuccessful: false,
        disconnectedAt: null,
        errorMessage: "Authentication failed",
      }),
      makeRecord({ id: "history-3", disconnectedAt: null }),
    ]);

    renderDialog(invoke);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "ssh",
        "connectionHistory.listByHost",
        { hostId: "host-1", limit: 200 },
      );
    });
    expect(await screen.findByText("Success: 2 · Failed: 1")).toBeTruthy();
    expect(screen.getByText("1:05")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Authentication failed")).toBeTruthy();
  });

  it("reloads records when Refresh is clicked", async () => {
    const invoke = vi.fn().mockResolvedValue([]);
    renderDialog(invoke);

    await screen.findByText("No connection history yet.");
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  });

  it("shows a host capability error and does not fetch while closed", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("History unavailable"));
    renderDialog(invoke);

    expect(await screen.findByText("History unavailable")).toBeTruthy();

    const closedInvoke = vi.fn();
    renderDialog(closedInvoke, false);
    expect(closedInvoke).not.toHaveBeenCalled();
  });
});
