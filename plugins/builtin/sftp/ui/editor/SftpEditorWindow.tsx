import type { PluginWindowRendererProps } from "@hypershell/plugin-api";
import { EditorApp } from "./EditorApp";

export function SftpEditorWindow({ context, host }: PluginWindowRendererProps) {
  const sftpSessionId = context.sftpSessionId;
  if (typeof sftpSessionId !== "string" || sftpSessionId.length === 0) {
    return <main role="alert" className="p-4 text-sm text-danger">Missing SFTP session context.</main>;
  }

  return <EditorApp sftpSessionId={sftpSessionId} host={host} />;
}
