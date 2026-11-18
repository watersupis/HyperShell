import { afterEach, describe, expect, it, vi } from "vitest";

import type { PluginUiHostServices } from "@hypershell/plugin-api";
import { useTunnelStore } from "../../../ui/tunnelStore";

const createHost = (list = vi.fn().mockResolvedValue([])) => ({
  portForward: {
    list,
    start: vi.fn(),
    stop: vi.fn(),
  },
}) as unknown as Pick<PluginUiHostServices, "portForward">;

afterEach(() => {
  useTunnelStore.setState({ activeForwards: [], selectedForwardId: null });
});

describe("tunnelStore.refresh", () => {
  it("reads active forwards through the injected host capability", async () => {
    const host = createHost(vi.fn().mockResolvedValue([
      {
        id: "fwd-1",
        hostname: "db",
        protocol: "local",
        localAddress: "127.0.0.1",
        localPort: 5432,
        remoteHost: "127.0.0.1",
        remotePort: 5432,
      },
    ]));

    await useTunnelStore.getState().refresh(host);

    expect(useTunnelStore.getState().activeForwards).toEqual([
      { status: "active", id: "fwd-1", hostname: "db", protocol: "local", localAddress: "127.0.0.1", localPort: 5432, remoteHost: "127.0.0.1", remotePort: 5432 },
    ]);
  });

  it("leaves state untouched when the host capability rejects", async () => {
    const host = createHost(vi.fn().mockRejectedValue(new Error("unavailable")));
    await useTunnelStore.getState().refresh(host);
    expect(useTunnelStore.getState().activeForwards).toEqual([]);
  });
});
