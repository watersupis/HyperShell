import { describe, expect, it } from "vitest";
import { createSessionInputRouterStore, getActiveInputRelayTargets } from "../../../../src/workbench/plugin-runtime/sessionInputRouter";

describe("session input router", () => {
  it("starts with no routes", () => {
    const store = createSessionInputRouterStore();
    expect(store.getState().routes).toEqual({});
  });

  it("deduplicates targets and updates an owner's enabled state", () => {
    const store = createSessionInputRouterStore();
    store.getState().setRoute("plugin.one", false, ["s1", "s1", "s2"]);
    store.getState().setRouteEnabled("plugin.one", true);
    expect(store.getState().routes["plugin.one"]).toEqual({
      enabled: true,
      targetSessionIds: ["s1", "s2"],
    });
  });

  it("collects unique targets from enabled routes only", () => {
    const store = createSessionInputRouterStore();
    store.getState().setRoute("plugin.one", true, ["s1", "s2"]);
    store.getState().setRoute("plugin.two", true, ["s2", "s3"]);
    store.getState().setRoute("plugin.off", false, ["s4"]);
    expect(getActiveInputRelayTargets(store.getState().routes)).toEqual(["s1", "s2", "s3"]);
  });

  it("removes inactive sessions and owners", () => {
    const store = createSessionInputRouterStore();
    store.getState().setRoute("plugin.one", true, ["s1", "s2"]);
    store.getState().setRoute("plugin.two", true, ["s2"]);
    store.getState().cleanTargets(["s2"]);
    expect(store.getState().routes["plugin.one"]?.targetSessionIds).toEqual(["s2"]);
    store.getState().cleanOwners(["plugin.one"]);
    expect(Object.keys(store.getState().routes)).toEqual(["plugin.one"]);
  });
});
