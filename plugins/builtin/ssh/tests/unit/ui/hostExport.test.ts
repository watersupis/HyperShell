import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginUiHostServices } from "@hypershell/plugin-api";
import { getHostExportActions } from "../../../ui/hostExport";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("SSH host export actions", () => {
  const showSaveDialog = vi.fn();
  const exportHosts = vi.fn();
  const host = {
    isAvailable: () => true,
    i18n: { translate: (key: string) => key },
    files: { showSaveDialog },
    hosts: { export: exportHosts },
  } as unknown as PluginUiHostServices;

  beforeEach(() => {
    vi.clearAllMocks();
    showSaveDialog.mockResolvedValue("C:/exports/hosts.json");
    exportHosts.mockResolvedValue({ exported: 2 });
  });

  it("exports through host capabilities after the user chooses a destination", async () => {
    const jsonAction = getHostExportActions(host)[0];
    await jsonAction.action();

    expect(showSaveDialog).toHaveBeenCalledWith({
      defaultPath: "hosts.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    expect(exportHosts).toHaveBeenCalledWith({
      format: "json",
      filePath: "C:/exports/hosts.json",
    });
  });

  it("does not invoke export when the save dialog is cancelled", async () => {
    showSaveDialog.mockResolvedValueOnce(null);
    await getHostExportActions(host)[0].action();

    expect(exportHosts).not.toHaveBeenCalled();
  });
});
