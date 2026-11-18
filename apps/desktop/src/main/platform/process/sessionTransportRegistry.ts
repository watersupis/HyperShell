import {
  type SessionTransportKind,
  type OpenSessionInput,
  type SessionTransportFactory,
  type OpenSessionRequest,
  type TransportHandle,
  type ExecCommandOptions,
} from "@hypershell/session-core";

const pluginTransportFactories = new Map<SessionTransportKind, SessionTransportFactory>();
const pluginCommandExecutors = new Map<SessionTransportKind, SessionCommandExecutor>();

export type SessionCommandExecutor = (
  input: OpenSessionInput,
  command: string,
  options?: ExecCommandOptions,
) => Promise<string>;

export function registerSessionTransport(
  transport: SessionTransportKind,
  factory: SessionTransportFactory,
): () => void {
  if (pluginTransportFactories.has(transport)) {
    throw new Error(`A transport factory is already registered for: ${transport}`);
  }

  pluginTransportFactories.set(transport, factory);

  return () => {
    if (pluginTransportFactories.get(transport) === factory) {
      pluginTransportFactories.delete(transport);
    }
  };
}

export function registerSessionCommandExecutor(
  transport: SessionTransportKind,
  executor: SessionCommandExecutor,
): () => void {
  if (pluginCommandExecutors.has(transport)) {
    throw new Error(`A command executor is already registered for: ${transport}`);
  }

  pluginCommandExecutors.set(transport, executor);
  return () => {
    if (pluginCommandExecutors.get(transport) === executor) {
      pluginCommandExecutors.delete(transport);
    }
  };
}

export function executeRegisteredSessionCommand(
  input: OpenSessionInput,
  command: string,
  options?: ExecCommandOptions,
): Promise<string> {
  const executor = pluginCommandExecutors.get(input.transport);
  if (!executor) {
    return Promise.reject(new Error(`No command executor registered for ${input.transport} sessions`));
  }
  return executor(input, command, options);
}

export function createRegisteredSessionTransport(request: OpenSessionRequest): TransportHandle {
  const factory = pluginTransportFactories.get(request.transport);
  if (!factory) {
    throw new Error(`No transport factory registered for ${request.transport} sessions`);
  }
  return factory(request);
}
