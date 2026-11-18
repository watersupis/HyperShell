import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import { FileList } from "../../../../ui/components/FileList";
import { renderWithSftpHost, resetSftpTestHost, sftpTestHost } from "../testUtils";

if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

const viewportHeight = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(220);
const viewportWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);

afterAll(() => {
  viewportHeight.mockRestore();
  viewportWidth.mockRestore();
});

afterEach(() => {
  resetSftpTestHost();
});

function createDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    effectAllowed: "none",
    dropEffect: "none",
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? ""
  } as unknown as DataTransfer;
}

function fireDragOver(element: Element, dataTransfer: DataTransfer, clientX: number, clientY: number) {
  const event = new Event("dragover", { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientX: { value: clientX },
    clientY: { value: clientY }
  });
  fireEvent(element, event);
}
function renderFileList(
  paneType: "local" | "remote",
  onInternalDrop = vi.fn(),
  onInternalMove = vi.fn(),
  onSelect = vi.fn(),
  sftpSessionId?: string,
  singleSelection = false,
  entryCount = 3
) {
  const baseEntries = [
    { name: "one.txt", path: "/files/one.txt", size: 1, modifiedAt: "2026-10-01T00:00:00.000Z", isDirectory: false },
    { name: "two.txt", path: "/files/two.txt", size: 2, modifiedAt: "2026-10-01T00:00:00.000Z", isDirectory: false },
    { name: "folder", path: "/files/folder", size: 0, modifiedAt: "2026-10-01T00:00:00.000Z", isDirectory: true }
  ];
  const entries = entryCount <= baseEntries.length
    ? baseEntries.slice(0, entryCount)
    : [
        ...baseEntries,
        ...Array.from({ length: entryCount - baseEntries.length }, (_, index) => ({
          name: `file-${index + baseEntries.length}.txt`,
          path: `/files/file-${index + baseEntries.length}.txt`,
          size: index,
          modifiedAt: "2026-10-01T00:00:00.000Z",
          isDirectory: false
        }))
      ];
  const view = renderWithSftpHost(
    <FileList
      entries={entries}
      currentPath="/files"
      selection={new Set(singleSelection ? [entries[0].path] : entries.slice(0, 2).map((entry) => entry.path))}
      sortBy={{ column: "name", direction: "asc" }}
      isLoading={false}
      error={null}
      onNavigate={() => {}}
      onSelect={onSelect}
      onSort={() => {}}
      onInternalDrop={onInternalDrop}
      onInternalMove={onInternalMove}
      onExternalDrop={() => {}}
      onContextMenu={() => {}}
      paneType={paneType}
      cursorIndex={0}
      sftpSessionId={sftpSessionId}
    />
  );
  return { ...view, onInternalDrop, onInternalMove, onSelect };
}

describe("FileList drag and drop", () => {
  it("renders only visible rows for large directories", () => {
    const { container } = renderFileList("local", undefined, undefined, undefined, undefined, false, 1000);
    const renderedRows = container.querySelectorAll("tbody tr[data-index]");

    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(30);
  });

  it("shows a pointer-following move target when drag data is protected", () => {
    const source = renderFileList("remote");
    const dataTransfer = createDataTransfer();
    const sourceRow = within(source.container).getByText("one.txt").closest("tr")!;
    fireEvent.dragStart(sourceRow, { dataTransfer });
    dataTransfer.getData = () => "";

    const target = renderFileList("remote");
    const folderRow = within(target.container).getByText("folder").closest("tr")!;
    fireDragOver(folderRow, dataTransfer, 160, 80);

    const hint = target.container.querySelector(".fixed");
    expect(hint?.textContent).toContain("Move to /files/folder");
    expect(within(target.container).getAllByText("Move to /files/folder")).toHaveLength(1);
    expect((hint as HTMLElement | null)?.style.left).toBe("174px");
    expect((hint as HTMLElement | null)?.style.top).toBe("100px");
    fireEvent.dragEnd(sourceRow, { dataTransfer });
  });

  it.each([
    ["local", "remote", "Upload to remote folder /files/folder"],
    ["remote", "local", "Download to local folder /files/folder"]
  ] as const)("shows the %s-to-%s transfer target", (sourcePane, targetPane, expectedHint) => {
    const source = renderFileList(sourcePane);
    const dataTransfer = createDataTransfer();
    const sourceRow = within(source.container).getByText("one.txt").closest("tr")!;
    fireEvent.dragStart(sourceRow, { dataTransfer });
    dataTransfer.getData = () => "";

    const target = renderFileList(targetPane);
    const folderRow = within(target.container).getByText("folder").closest("tr")!;
    fireDragOver(folderRow, dataTransfer, 200, 120);

    expect(target.container.querySelector(".fixed")?.textContent).toContain(expectedHint);
    fireEvent.dragEnd(sourceRow, { dataTransfer });
  });

  it("keeps ordinary remote drags internal instead of starting OS drag-out", () => {
    const dragOut = vi.fn().mockResolvedValue({ tempPath: "C:\\temp\\one.txt" });
    sftpTestHost.sftp.dragOut = dragOut;
    const { onInternalMove } = renderFileList("remote", undefined, undefined, undefined, "sftp-1", true);
    const dataTransfer = createDataTransfer();
    const sourceRow = screen.getByText("one.txt").closest("tr");
    const targetRow = screen.getByText("folder").closest("tr");

    fireEvent.dragStart(sourceRow!, { dataTransfer });
    fireEvent.drop(targetRow!, { dataTransfer });

    expect(onInternalMove).toHaveBeenCalled();
    expect(dragOut).not.toHaveBeenCalled();
  });

  it("moves same-pane drops into the target folder", () => {
    const { onInternalMove, onInternalDrop } = renderFileList("remote");
    const dataTransfer = createDataTransfer();
    const sourceRow = screen.getByText("one.txt").closest("tr");
    const targetRow = screen.getByText("folder").closest("tr");

    fireEvent.dragStart(sourceRow!, { dataTransfer });
    fireEvent.drop(targetRow!, { dataTransfer });

    expect(onInternalMove).toHaveBeenCalledWith(["/files/one.txt", "/files/two.txt"], "/files/folder");
    expect(onInternalDrop).not.toHaveBeenCalled();
  });

  it("ignores same-pane drops on the empty area", () => {
    const { onInternalMove } = renderFileList("remote");
    const dataTransfer = createDataTransfer();
    const sourceRow = screen.getByText("one.txt").closest("tr");
    const list = screen.getByRole("table").parentElement;

    fireEvent.dragStart(sourceRow!, { dataTransfer });
    fireEvent.drop(list!, { dataTransfer });

    expect(onInternalMove).not.toHaveBeenCalled();
  });

  it("keeps cross-pane transfers enabled", () => {
    const dataTransfer = createDataTransfer();
    const { unmount } = renderFileList("remote");
    fireEvent.dragStart(screen.getByText("one.txt").closest("tr")!, { dataTransfer });
    unmount();

    const { onInternalDrop } = renderFileList("local");
    fireEvent.drop(screen.getByRole("table").parentElement!, { dataTransfer });

    expect(onInternalDrop).toHaveBeenCalledWith(["/files/one.txt", "/files/two.txt"]);
  });

  it("starts drag selection from blank space at either end of the list", () => {
    const { onSelect } = renderFileList("local");
    const list = screen.getByRole("table").parentElement!;
    const rows = Array.from(list.querySelectorAll<HTMLTableRowElement>("tbody tr"));
    rows.forEach((row, index) => {
      vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
        top: 20 + index * 24,
        bottom: 44 + index * 24,
        height: 24,
        width: 200,
        left: 0,
        right: 200,
        x: 0,
        y: 20 + index * 24,
        toJSON: () => ({})
      } as DOMRect);
    });

    fireEvent.mouseDown(list, { button: 0, clientY: 5 });
    fireEvent.mouseEnter(rows[1]!);
    expect(onSelect).toHaveBeenLastCalledWith(new Set(["/files/folder", "/files/one.txt"]));

    fireEvent.mouseDown(list, { button: 0, clientY: 120 });
    fireEvent.mouseEnter(rows[1]!);
    expect(onSelect).toHaveBeenLastCalledWith(new Set(["/files/one.txt", "/files/two.txt"]));
  });
});
