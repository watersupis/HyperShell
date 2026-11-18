import type { IpcMainInvokeEvent } from "electron";
import { ipcChannels, editorOpenRequestSchema } from "@hypershell/shared";
import { editorWindowManager } from "../../windows/editorWindowManager";

export function registerEditorIpc(
  ipcMain: {
    handle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void;
    removeHandler?(channel: string): void;
  }
): () => void {
  const handleOpenEditor = (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = editorOpenRequestSchema.parse(rawRequest);
    editorWindowManager.openEditor(request);
  };

  ipcMain.handle(ipcChannels.editor.openEditor, handleOpenEditor);

  return () => ipcMain.removeHandler?.(ipcChannels.editor.openEditor);
}
