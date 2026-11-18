import { existsSync } from "node:fs";
import path from "node:path";
import { DEFAULT_SSH_KEEP_ALIVE_SECONDS } from "../sshDefaults";

export interface SshConnectionProfile {
  hostname: string;
  username?: string;
  port?: number;
  identityFile?: string;
  password?: string;
  proxyJump?: string;
  keepAliveSeconds?: number;
  requestTty?: boolean;
  extraArgs?: string[];
  envVars?: Record<string, string>;
}

export interface SshPtyCommand {
  command: string;
  args: string[];
}

export function buildSshArgs(profile: SshConnectionProfile): string[] {
  const args: string[] = [];

  if (profile.port != null) args.push("-p", String(profile.port));
  if (profile.identityFile) args.push("-i", profile.identityFile);

  if (profile.proxyJump) {
    if (!/^[\w.@:,[\]-]+$/.test(profile.proxyJump)) {
      throw new Error("Invalid proxyJump format");
    }
    args.push("-J", profile.proxyJump);
  }

  const keepAliveSeconds = profile.keepAliveSeconds ?? DEFAULT_SSH_KEEP_ALIVE_SECONDS;
  if (keepAliveSeconds > 0) {
    args.push("-o", `ServerAliveInterval=${keepAliveSeconds}`);
    args.push("-o", "ServerAliveCountMax=3");
  }

  if (profile.requestTty !== false) args.push("-tt");
  if (profile.extraArgs?.length) args.push(...profile.extraArgs);

  args.push(profile.username ? `${profile.username}@${profile.hostname}` : profile.hostname);
  return args;
}

export function buildSshPtyCommand(profile: SshConnectionProfile): SshPtyCommand {
  let command = "ssh";
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (systemRoot) {
      const bundledWindowsSshPath = path.join(systemRoot, "System32", "OpenSSH", "ssh.exe");
      if (existsSync(bundledWindowsSshPath)) command = bundledWindowsSshPath;
    }
  }

  return { command, args: buildSshArgs(profile) };
}
