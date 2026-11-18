export interface SftpConnectionOptions {
  hostname: string;
  port?: number;
  username?: string;
  authMethod: "password" | "key" | "agent";
  password?: string;
  privateKeyPath?: string;
  fallbackKeyPaths?: string[];
  agentPath?: string;
  passphrase?: string;
  proxyJump?: string;
  keepAliveSeconds?: number;
}

export interface SftpSecurityOptions {
  trustedHostFingerprints?: string[];
}
