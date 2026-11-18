import { useRecordingStore } from "./ui/recordingStore";
import type { PluginUiCommand as Command, PluginUiContribution } from "@hypershell/plugin-api";

export const recordingUiContribution: PluginUiContribution = {
  id: "recording",
  loadTerminalToolbar: () =>
    import("./ui/RecordingTerminalToolbar").then((module) => ({
      default: module.RecordingTerminalToolbar,
    })),
  loadContribution: () =>
    import("./ui/RecordingPluginContribution").then((module) => ({
      default: module.RecordingPluginContribution,
    })),
  getCommands: (): Command[] => [
    {
      id: "recording.library",
      title: "Browse Session Recordings",
      category: "Recording",
      visible: () => true,
      execute: () => useRecordingStore.getState().openLibrary(),
      keywords: ["playback", "cast", "session", "history"],
    },
  ],
};
