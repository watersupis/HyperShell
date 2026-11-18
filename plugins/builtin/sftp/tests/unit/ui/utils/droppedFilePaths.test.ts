import { describe, expect, it, vi } from "vitest";
import { sftpTestHost } from "../testUtils";
import { extractDroppedPaths } from "../../../../ui/utils/droppedFilePaths";

function dataTransfer(files: File[]): DataTransfer {
  return { files } as unknown as DataTransfer;
}

describe("extractDroppedPaths", () => {
  it("resolves OS file paths through the injected host capability", () => {
    const host = {
      ...sftpTestHost,
      files: {
        ...sftpTestHost.files,
        getPathForFile: vi.fn((file: File) => file.name === "skip" ? "" : `/files/${file.name}`),
      },
    };

    expect(extractDroppedPaths(host, dataTransfer([new File([], "one.txt"), new File([], "skip")]))).toEqual([
      "/files/one.txt",
    ]);
    expect(host.files.getPathForFile).toHaveBeenCalledTimes(2);
  });

  it("returns no paths when the transfer or host bridge is unavailable", () => {
    expect(extractDroppedPaths(sftpTestHost, null)).toEqual([]);
    expect(extractDroppedPaths({ ...sftpTestHost, isAvailable: () => false }, dataTransfer([new File([], "one.txt")]))).toEqual([]);
  });
});
