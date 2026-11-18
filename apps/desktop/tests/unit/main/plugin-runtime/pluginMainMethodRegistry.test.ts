import { describe, expect, it, vi } from "vitest";
import { createPluginMainMethodRegistry } from "../../../../src/main/plugin-runtime/pluginMainMethodRegistry";

describe("plugin main method registry", () => {
  it("dispatches the payload only to the registered owner and method", async () => {
    const registry = createPluginMainMethodRegistry();
    const handler = vi.fn(async (payload: unknown) => ({ received: payload }));
    registry.register("example.plugin", "session.info", handler);

    await expect(registry.invoke("example.plugin", "session.info", { id: "s1" }))
      .resolves.toEqual({ received: { id: "s1" } });
    expect(handler).toHaveBeenCalledTimes(1);
    await expect(registry.invoke("other.plugin", "session.info", {}))
      .rejects.toThrow("Plugin main method is unavailable: other.plugin.session.info");
  });

  it("rejects duplicate or malformed registrations and unregisters on disposal", async () => {
    const registry = createPluginMainMethodRegistry();
    const handler = vi.fn(() => true);
    const dispose = registry.register("local-terminal", "session-info", handler);

    expect(() => registry.register("local-terminal", "session-info", handler))
      .toThrow("Plugin main method already registered: local-terminal.session-info");
    expect(() => registry.register("Invalid ID", "session-info", handler))
      .toThrow("Invalid plugin main method registration");

    dispose();
    await expect(registry.invoke("local-terminal", "session-info", {}))
      .rejects.toThrow("Plugin main method is unavailable: local-terminal.session-info");
  });
});
