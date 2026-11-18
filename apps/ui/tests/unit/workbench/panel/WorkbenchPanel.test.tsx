import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WorkbenchPanel } from "../../../../src/workbench/panel/WorkbenchPanel";
import { useWorkbenchPanelStore } from "../../../../src/workbench/panel/panelStore";

const originalSetPointerCapture = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "setPointerCapture");

describe("WorkbenchPanel resizing", () => {
  beforeEach(() => {
    useWorkbenchPanelStore.setState({
      isOpen: true,
      activeViewId: "plugin:fixture:main",
      height: 260,
      viewContexts: {},
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    if (originalSetPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, "setPointerCapture", originalSetPointerCapture);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
    }
  });

  it("resizes with the pointer and stops after pointer release", () => {
    render(<WorkbenchPanel views={[{ id: "plugin:fixture:main", title: "Fixture", content: <div>Panel content</div> }]} />);
    const separator = screen.getByRole("separator");

    fireEvent.pointerDown(separator, { pointerId: 7, clientY: 300 });
    fireEvent.pointerMove(separator, { pointerId: 7, clientY: 240 });
    expect(separator.getAttribute("aria-valuenow")).toBe("320");

    fireEvent.pointerUp(separator, { pointerId: 7 });
    fireEvent.pointerMove(separator, { pointerId: 7, clientY: 200 });
    expect(separator.getAttribute("aria-valuenow")).toBe("320");
  });

  it("resizes with the keyboard and respects the minimum height", () => {
    render(<WorkbenchPanel views={[{ id: "plugin:fixture:main", title: "Fixture", content: <div>Panel content</div> }]} />);
    const separator = screen.getByRole("separator");

    fireEvent.keyDown(separator, { key: "ArrowUp" });
    expect(separator.getAttribute("aria-valuenow")).toBe("284");

    for (let index = 0; index < 10; index += 1) {
      fireEvent.keyDown(separator, { key: "ArrowDown" });
    }
    expect(separator.getAttribute("aria-valuenow")).toBe("120");
  });
});
