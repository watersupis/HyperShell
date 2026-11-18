import type { PortForwardProfileValue, PortForwardProtocol } from "./PortForwardProfileForm";

export interface StoredPortForwardProfile extends PortForwardProfileValue {
  id: string;
}

const protocols = new Set<PortForwardProtocol>(["local", "remote", "dynamic"]);

function isProfile(value: unknown): value is StoredPortForwardProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.id === "string" && profile.id.length > 0 &&
    typeof profile.name === "string" && profile.name.trim().length > 0 &&
    typeof profile.hostname === "string" && profile.hostname.trim().length > 0 &&
    typeof profile.username === "string" && Number.isInteger(profile.sshPort) &&
    Number(profile.sshPort) >= 1 && Number(profile.sshPort) <= 65535 &&
    protocols.has(profile.protocol as PortForwardProtocol) &&
    typeof profile.localAddress === "string" && Number.isInteger(profile.localPort) &&
    Number(profile.localPort) >= 1 && Number(profile.localPort) <= 65535 &&
    typeof profile.remoteHost === "string" && Number.isInteger(profile.remotePort) &&
    Number(profile.remotePort) >= 0 && Number(profile.remotePort) <= 65535 &&
    typeof profile.description === "string";
}

export function readPortForwardProfiles(value: unknown): StoredPortForwardProfile[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isProfile);
}
