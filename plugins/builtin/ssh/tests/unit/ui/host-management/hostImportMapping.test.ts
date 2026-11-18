import { describe, expect, it } from "vitest";
import { DEFAULT_RECONNECT_BASE_INTERVAL, DEFAULT_RECONNECT_MAX_ATTEMPTS } from "@hypershell/shared";
import { puttySessionToHost, sshConfigImportToHost } from "../../../../ui/host-management/hostImportMapping";

describe("host import mapping", () => {
  it("maps pasted SSH config entries to standard SSH host records", () => {
    expect(sshConfigImportToHost({ alias: "web", hostName: "web.example.test", user: "admin", port: 2200 }, "host-1")).toEqual({
      id: "host-1",
      name: "web",
      hostname: "web.example.test",
      port: 2200,
      username: "admin",
      group: "Imported",
      tags: "ssh-config",
      authMethod: "default",
      agentKind: "system",
      autoReconnect: false,
      reconnectMaxAttempts: DEFAULT_RECONNECT_MAX_ATTEMPTS,
      reconnectBaseInterval: DEFAULT_RECONNECT_BASE_INTERVAL,
      tmuxDetect: false,
      shellIntegration: true,
    });
  });

  it("preserves PuTTY credentials metadata and sets the import group", () => {
    expect(puttySessionToHost({ name: "db", hostname: "db.example.test", port: 2222, username: "root", keyFile: "C:/keys/db.ppk" }, "host-2")).toMatchObject({
      id: "host-2",
      name: "db",
      hostname: "db.example.test",
      port: 2222,
      username: "root",
      identityFile: "C:/keys/db.ppk",
      group: "PuTTY Import",
      tags: "putty",
    });
  });
});
