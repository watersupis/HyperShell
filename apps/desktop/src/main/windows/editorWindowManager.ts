import type { BrowserWindow } from "electron";
import { ipcChannels, type EditorOpenRequest } from "@hypershell/shared";
import { createEditorWindow } from "./createEditorWindow";

interface ManagedEditorWindow {
  window: BrowserWindow;
  pluginId: string;
  windowKey: string;
}

export class EditorWindowManager {
  private editors: ManagedEditorWindow[] = [];
  private parentWindow: BrowserWindow | null = null;
  private rendererUrl = "";

  setParentWindow(window: BrowserWindow): void {
    this.parentWindow = window;
  }

  setRendererUrl(url: string): void {
    this.rendererUrl = url;
  }

  openEditor(request: EditorOpenRequest): void {
    if (!this.parentWindow || this.parentWindow.isDestroyed()) {
      return;
    }

    const existing = this.editors.find(
      (editor) => editor.pluginId === request.pluginId &&
        editor.windowKey === request.windowKey &&
        !editor.window.isDestroyed()
    );

    if (existing) {
      existing.window.webContents.send(ipcChannels.editor.openFile, {
        pluginId: request.pluginId,
        windowKey: request.windowKey,
        payload: request.payload,
      });
      existing.window.focus();
      return;
    }

    const window = createEditorWindow({
      pluginId: request.pluginId,
      pluginContext: request.context,
      parentWindow: this.parentWindow,
      rendererUrl: this.rendererUrl,
    });

    const entry: ManagedEditorWindow = {
      window,
      pluginId: request.pluginId,
      windowKey: request.windowKey,
    };
    this.editors.push(entry);

    window.webContents.once("did-finish-load", () => {
      window.webContents.send(ipcChannels.editor.openFile, {
        pluginId: request.pluginId,
        windowKey: request.windowKey,
        payload: request.payload,
      });
    });

    window.on("closed", () => {
      this.editors = this.editors.filter((e) => e !== entry);
    });
  }

  notifyWindowContextClosed(pluginId: string, windowKey: string): void {
    for (const editor of this.editors) {
      if (editor.pluginId === pluginId && editor.windowKey === windowKey && !editor.window.isDestroyed()) {
        editor.window.webContents.send(ipcChannels.editor.sessionClosed, {
          pluginId,
          windowKey,
        });
      }
    }
  }

  closeAll(): void {
    for (const editor of this.editors) {
      if (!editor.window.isDestroyed()) {
        editor.window.close();
      }
    }
    this.editors = [];
  }
}

export const editorWindowManager = new EditorWindowManager();
