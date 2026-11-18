import type { Client } from "ssh2";

export interface ResolvedAuth {
  type: "password" | "key" | "agent";
  password?: string;
  privateKey?: Buffer;
  passphrase?: string;
  agent?: string;
}

export interface Ssh2PoolTarget {
  hostname: string;
  port: number;
  username: string;
  auth: ResolvedAuth;
  keepAliveSeconds?: number;
}

export interface PooledConnection {
  connectionId: string;
  consumerId: string;
  client: Client;
}

export interface PoolStats {
  connectionId: string;
  hostname: string;
  port: number;
  username: string;
  consumerCount: number;
  createdAt: string;
}

export interface Ssh2ConnectionPool {
  acquire(target: Ssh2PoolTarget): Promise<PooledConnection>;
  release(connectionId: string, consumerId: string): void;
  destroy(connectionId: string): void;
  destroyAll(): void;
  getStats(): PoolStats[];
}
