import { describe, expect, it } from "vitest";
import { exportHostsToCsv, exportHostsToJson, exportHostsToSshConfig } from "../../../main/hostExport";

const sampleHost = {
  id: "h1",
  name: "web-1",
  hostname: "192.168.1.1",
  port: 22,
  username: "admin",
  identityFile: null,
  hostProfileId: null,
  authProfileId: null,
  groupId: null,
  notes: "production server",
  authMethod: "default",
  agentKind: "system",
  opReference: null,
  isFavorite: false,
  sortOrder: null,
  color: null,
  proxyJump: null,
  proxyJumpHostIds: null,
  keepAliveInterval: null,
  autoReconnect: false,
  reconnectMaxAttempts: 5,
  reconnectBaseInterval: 1,
  tmuxDetect: false,
  shellIntegration: true,
};

describe("SSH host export", () => {
  it("exports hosts as JSON", () => {
    expect(JSON.parse(exportHostsToJson([sampleHost]))).toMatchObject([
      { name: "web-1", hostname: "192.168.1.1" },
    ]);
  });

  it("exports hosts to CSV", () => {
    const csv = exportHostsToCsv([sampleHost]);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("hostname");
    expect(lines[1]).toContain("web-1");
    expect(lines[1]).toContain("192.168.1.1");
  });

  it("quotes CSV fields containing commas", () => {
    const csv = exportHostsToCsv([{ ...sampleHost, notes: "server, production" }]);
    expect(csv).toContain('"server, production"');
  });

  it("neutralizes formula-like CSV cells", () => {
    const csv = exportHostsToCsv([{ ...sampleHost, name: "=cmd|' /C calc'!A0" }]);
    expect(csv).toContain("'=cmd|' /C calc'!A0");
  });

  it("neutralizes formulas after leading control characters", () => {
    const dangerous = exportHostsToCsv([{ ...sampleHost, name: "\t=cmd|' /C calc'!A0" }]);
    expect(dangerous.split("\n")[1]).toMatch(/^'\t=cmd\|' \/C calc'!A0,/);
  });

  it("quotes CSV fields containing carriage returns", () => {
    const csv = exportHostsToCsv([{ ...sampleHost, notes: "line one\rline two" }]);
    expect(csv).toContain('"line one\rline two"');
  });

  it("exports SSH config values", () => {
    const config = exportHostsToSshConfig([{
      ...sampleHost,
      identityFile: "~/.ssh/id_ed25519",
      proxyJump: "bastion",
      keepAliveInterval: 30,
    }]);
    expect(config).toContain("Host web-1");
    expect(config).toContain("HostName 192.168.1.1");
    expect(config).toContain("Port 22");
    expect(config).toContain("User admin");
    expect(config).toContain("IdentityFile ~/.ssh/id_ed25519");
    expect(config).toContain("ProxyJump bastion");
    expect(config).toContain("ServerAliveInterval 30");
  });
});
