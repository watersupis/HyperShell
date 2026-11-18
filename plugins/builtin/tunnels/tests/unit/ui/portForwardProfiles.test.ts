import { describe, expect, it } from "vitest";
import { readPortForwardProfiles } from "../../../ui/portForwardProfiles";

const profile = {
  id: "profile-1",
  name: "Development",
  hostname: "server.example",
  username: "dev",
  sshPort: 22,
  protocol: "local",
  localAddress: "127.0.0.1",
  localPort: 8080,
  remoteHost: "127.0.0.1",
  remotePort: 80,
  description: "Local web service",
};

describe("readPortForwardProfiles", () => {
  it("accepts well-formed plugin-owned profiles", () => {
    expect(readPortForwardProfiles([profile])).toEqual([profile]);
  });

  it("ignores malformed saved values and unsupported protocols", () => {
    expect(readPortForwardProfiles([profile, null, { ...profile, protocol: "exec" }])).toEqual([profile]);
    expect(readPortForwardProfiles({ profile })).toEqual([]);
  });
});
