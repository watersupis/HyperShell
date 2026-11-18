import { beforeEach, describe, expect, it } from "vitest";
import { pluginPanelViewId, useWorkbenchPanelStore } from "../../../../src/workbench/panel/panelStore";

describe("workbench panel state", () => {
  beforeEach(() => {
    useWorkbenchPanelStore.setState({
      isOpen: false,
      activeViewId: null,
      height: 260,
      viewContexts: {},
    });
  });

  it("creates source-neutral plugin view keys", () => {
    expect(pluginPanelViewId("ssh", "output")).toBe("plugin:ssh:output");
    expect(pluginPanelViewId("com.example.tools")).toBe("plugin:com.example.tools:main");
  });

  it("opens a view with optional host context and switches views without losing it", () => {
    useWorkbenchPanelStore.getState().openView("external:sample", { hostId: "host-1" });
    useWorkbenchPanelStore.getState().activateView("builtin:logs");

    expect(useWorkbenchPanelStore.getState()).toMatchObject({
      isOpen: true,
      activeViewId: "builtin:logs",
      viewContexts: { "external:sample": { hostId: "host-1" } },
    });
  });

  it("clamps panel height and clears context when a contribution is disposed", () => {
    useWorkbenchPanelStore.getState().setHeight(900);
    useWorkbenchPanelStore.getState().openView("external:sample", { hostId: "host-1" });
    useWorkbenchPanelStore.getState().removeViewContext("external:sample");
    const expectedHeight = typeof window === "undefined" ? 640 : Math.max(120, Math.min(640, window.innerHeight - 200));

    expect(useWorkbenchPanelStore.getState()).toMatchObject({
      isOpen: true,
      activeViewId: "external:sample",
      height: expectedHeight,
      viewContexts: {},
    });
  });
});
