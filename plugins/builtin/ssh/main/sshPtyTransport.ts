import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OpenSessionRequest, TransportHandle } from "@hypershell/session-core";
import type { ExecCommandOptions, OpenSessionInput, SessionCommandExecutor } from "@hypershell/session-core";
import { ENV_VAR_NAME_REGEX } from "@hypershell/shared";
import { buildSshPtyCommand, type SshConnectionProfile, type SshPtyCommand } from "@hypershell/session-core";
import {
  createPtyProcess,
  type DisposableLike,
  type PtyExitEvent,
  type PtyProcessLike,
  type PtySpawn,
  type PtySpawnOptions
} from "@hypershell/session-core";

export { buildSshArgs, buildSshPtyCommand } from "@hypershell/session-core";
export type { SshConnectionProfile, SshPtyCommand } from "@hypershell/session-core";

// Preserved names for existing importers.
export type SshPtySpawnOptions = PtySpawnOptions;
export type SshPtyExitEvent = PtyExitEvent;
export type SshPtyProcess = PtyProcessLike;
export type SshPtySpawn = PtySpawn;
export type { DisposableLike };

const execFileAsync = promisify(execFile);

export interface CreateSshPtyTransportDeps {
  spawnPty?: SshPtySpawn;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  termName?: string;
}

export interface SshPtyTransport extends TransportHandle {
  command: SshPtyCommand;
  request: OpenSessionRequest;
}

function buildPtyEnv(
  baseEnv: NodeJS.ProcessEnv,
  envVars?: Record<string, string>
): NodeJS.ProcessEnv {
  if (!envVars || Object.keys(envVars).length === 0) {
    return { ...baseEnv };
  }

  const merged: NodeJS.ProcessEnv = { ...baseEnv };
  for (const [name, value] of Object.entries(envVars)) {
    if (!ENV_VAR_NAME_REGEX.test(name)) {
      continue;
    }
    merged[name] = String(value);
  }
  return merged;
}

// Matching control characters is the entire purpose of these patterns.
/* eslint-disable no-control-regex */
function normalizePromptText(value: string): string {
  return value
    // CSI/OSC/escape sequences that can wrap prompts.
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[@-Z\\-_]/g, "")
    // Keep tabs/newlines/carriage returns/spaces; drop other controls.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}
/* eslint-enable no-control-regex */

function isPasswordPrompt(value: string): boolean {
  return /\b(?:password|passphrase|verification code|security code|otp)\b[^:\r\n]{0,120}:\s*$/i.test(
    normalizePromptText(value)
  );
}

export function createSshPtyTransport(
  request: OpenSessionRequest,
  profile: SshConnectionProfile,
  deps: CreateSshPtyTransportDeps = {}
): SshPtyTransport {
  const command = buildSshPtyCommand(profile);
  let authSecretSent = false;
  let promptBuffer = "";

  const handle = createPtyProcess(
    request,
    {
      command: command.command,
      args: command.args,
      cols: request.cols,
      rows: request.rows,
      cwd: deps.cwd,
      env: buildPtyEnv(deps.env ?? process.env, profile.envVars),
      termName: deps.termName
    },
    {
      spawnPty: deps.spawnPty,
      onData(data, pty) {
        if (authSecretSent || !profile.password) {
          return;
        }

        promptBuffer = `${promptBuffer}${data}`.slice(-512);
        if (!isPasswordPrompt(promptBuffer)) {
          return;
        }

        authSecretSent = true;
        pty.write(`${profile.password}\r`);
        // Clear password from memory after transmission
        profile.password = undefined;
      }
    }
  );

  return { ...handle, command, request };
}

export function createSshSessionTransport(request: OpenSessionRequest, spawnPty: PtySpawn): SshPtyTransport {
  const options = request.sshOptions ?? { hostname: request.profileId };
  return createSshPtyTransport(request, {
    hostname: options.hostname,
    username: options.username,
    port: options.port,
    identityFile: options.identityFile,
    password: options.password,
    proxyJump: options.proxyJump,
    keepAliveSeconds: options.keepAliveSeconds,
    envVars: options.envVars,
  }, { spawnPty });
}

export const executeSshSessionCommand: SessionCommandExecutor = async (
  input: OpenSessionInput,
  command: string,
  options: ExecCommandOptions = {},
): Promise<string> => {
  if (input.transport !== "ssh") {
    throw new Error("SSH command executor received a non-SSH session");
  }

  const connection = input.sshOptions ?? { hostname: input.profileId };
  const ssh = buildSshPtyCommand({
    hostname: connection.hostname,
    username: connection.username,
    port: connection.port,
    identityFile: connection.identityFile,
    proxyJump: connection.proxyJump,
    keepAliveSeconds: connection.keepAliveSeconds,
    requestTty: false,
    extraArgs: ["-o", "BatchMode=yes"],
  });
  ssh.args.push(command);

  const { stdout } = await execFileAsync(ssh.command, ssh.args, {
    timeout: options.timeoutMs ?? 10_000,
    windowsHide: true,
  });
  return stdout;
};
