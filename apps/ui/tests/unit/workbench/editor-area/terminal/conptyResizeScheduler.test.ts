import { afterEach, describe, expect, it, vi } from "vitest";

import { createConptyResizeScheduler } from "../../../../../src/workbench/editor-area/terminal/conptyResizeScheduler";

describe("createConptyResizeScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies only the latest size after resizing settles", () => {
    vi.useFakeTimers();
    const resize = vi.fn();
    const scheduler = createConptyResizeScheduler(resize, 120);

    scheduler.schedule("s1", 120, 30);
    vi.advanceTimersByTime(80);
    scheduler.schedule("s1", 120, 22);
    vi.advanceTimersByTime(119);
    expect(resize).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(resize).toHaveBeenCalledOnce();
    expect(resize).toHaveBeenCalledWith("s1", 120, 22);
  });

  it("cancels a pending resize when disposed", () => {
    vi.useFakeTimers();
    const resize = vi.fn();
    const scheduler = createConptyResizeScheduler(resize, 120);

    scheduler.schedule("s1", 120, 22);
    scheduler.dispose();
    vi.advanceTimersByTime(120);

    expect(resize).not.toHaveBeenCalled();
  });
});
