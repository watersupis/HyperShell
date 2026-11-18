export type HostEnvVarFormValue = {
  id: string;
  name: string;
  value: string;
  isEnabled: boolean;
  sortOrder: number;
};

export type HostFormValue = {
  name: string;
  hostname: string;
  port: number;
  username: string;
  identityFile: string;
  hostProfileId?: string;
  envVars: HostEnvVarFormValue[];
  group: string;
  tags: string;
  tagIds: string[];
  authMethod: "default" | "password" | "keyfile" | "agent" | "op-reference";
  agentKind: "system" | "pageant" | "1password";
  opReference: string;
  color?: string | null;
  proxyJump: string;
  proxyJumpHostIds: string;
  keepAliveInterval: string;
  autoReconnect: boolean;
  reconnectMaxAttempts: number;
  reconnectBaseInterval: number;
  password?: string;
  savePassword?: boolean;
  clearSavedPassword?: boolean;
  tmuxDetect: boolean;
  shellIntegration: boolean;
  hasSavedPassword?: boolean;
  passwordSavedAt?: string | null;
};

export type HostUiRecord = HostFormValue & {
  id: string;
  notes?: string;
  isFavorite?: boolean;
  sortOrder?: number | null;
  color?: string | null;
};
