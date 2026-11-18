import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabBar } from "../../../../src/workbench/editor-area/TabBar";

afterEach(() => vi.unstubAllGlobals());

describe("TabBar launcher placement", () => {
  it("keeps the new-tab launcher after tabs inside the scrollable tab list", () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    render(
      <TabBar
        tabs={[]}
        activeSessionId={null}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onCloseOthers={vi.fn()}
        onCloseToRight={vi.fn()}
        onSplit={vi.fn()}
        currentPaneId="pane-1"
        panes={[{ paneId: "pane-1", sessionId: null }]}
        onMoveToPane={vi.fn()}
        launcherContent={<button type="button">New tab</button>}
        rightContent={<button type="button">Workspace actions</button>}
      />
    );

    const launcher = screen.getByRole("button", { name: "New tab" });
    const actions = screen.getByRole("button", { name: "Workspace actions" });
    expect(launcher.closest('[data-testid="tab-scroll-container"]')).not.toBeNull();
    expect(actions.closest('[data-testid="tab-scroll-container"]')).toBeNull();
  });
});
