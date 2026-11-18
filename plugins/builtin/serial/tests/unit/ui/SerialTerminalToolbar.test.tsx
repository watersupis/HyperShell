import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PluginTerminalToolbarProps } from "@hypershell/plugin-api";
import { SerialTerminalToolbar } from "../../../ui/SerialTerminalToolbar";

function renderToolbar(transport: string, setSignals = vi.fn().mockResolvedValue(undefined)) {
  const props = {
    session: {
      sessionId: "session-1",
      transport,
      profileId: "serial-profile-1",
      hostId: null,
      title: "Device",
      width: 80,
      height: 24,
      setSignals,
    },
    host: {},
  } as unknown as PluginTerminalToolbarProps;
  return { ...render(<SerialTerminalToolbar {...props} />), setSignals };
}

describe("SerialTerminalToolbar", () => {
  it("renders no serial controls for other session transports", () => {
    renderToolbar("ssh");

    expect(screen.queryByRole("button", { name: "DTR" })).toBeNull();
    expect(screen.queryByRole("button", { name: "RTS" })).toBeNull();
  });

  it("updates a serial signal through the generic session capability", async () => {
    const { setSignals } = renderToolbar("serial");

    await userEvent.click(screen.getByRole("button", { name: "DTR" }));

    expect(setSignals).toHaveBeenCalledWith({ dtr: false });
    expect(screen.getByRole("button", { name: "DTR" }).getAttribute("aria-pressed")).toBe("false");
  });
});
