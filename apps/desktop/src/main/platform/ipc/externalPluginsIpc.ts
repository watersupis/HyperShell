import { app, BrowserWindow, dialog } from "electron";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pluginPermissionSchema } from "@hypershell/plugin-api";
import { ipcChannels } from "@hypershell/shared";
import { createPluginStorageRepositoryFromDatabase, type SqliteDatabase } from "@hypershell/db";
import { internalPluginCatalog } from "../../plugin-runtime/internalPluginCatalog";
import { enableInternalPlugin } from "./internalPluginsIpc";
import type { SessionManager } from "@hypershell/session-core";
import { createExternalPluginManager } from "../../plugin-runtime/externalPluginManager";
import { probeHostStatus } from "../monitoring/hostStatusService";
import { getOrCreateHostsRepo } from "../storage/hostsRepositoryService";
import type { IpcMainLike } from "./registerIpc";

const setPermissionsRequestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/).max(80),
  permissions: z.array(pluginPermissionSchema).max(32),
}).strict();
const pluginIdSchema = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/).max(80);
const invokeRequestSchema = z.object({
  id: pluginIdSchema,
  method: z.enum([
    "hosts.list",
    "storage.list",
    "storage.upsert",
    "storage.remove",
    "storage.claimLegacy",
    "sessions.active",
    "sessions.broadcast",
    "monitoring.latest",
    "systems.inspect",
  ]),
  args: z.array(z.unknown()).max(8),
}).strict();
const sessionIdSchema = z.string().min(1).max(128);
const storageIdentifierSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);

type ExternalPluginServices = {
  sessionManager: SessionManager;
  getDatabase: () => SqliteDatabase;
};

export function registerExternalPluginsIpc(
  ipc: IpcMainLike,
  services: ExternalPluginServices,
  rootDirectory = app.getPath("userData") + "/plugins",
  selectPackage = async (event: Electron.IpcMainInvokeEvent): Promise<string | null> => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: Electron.OpenDialogOptions = {
      title: "Install HyperShell Plugin",
      properties: ["openFile"],
      filters: [{ name: "HyperShell Plugin Package", extensions: ["hspkg"] }],
    };
    const selection = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (selection.canceled || !selection.filePaths[0]) return null;
    return selection.filePaths[0];
  }
): void {
  const manager = createExternalPluginManager(rootDirectory);
  const internalPluginIds = new Set(internalPluginCatalog.map((plugin) => plugin.id));
  const replacedExternalPluginIds = new Set(["com.hypershell.quick-command-center"]);
  const recentInvocations = new Map<string, number[]>();
  const pendingPackages = new Map<string, { path: string; pluginId: string; senderId: number; expiresAt: number }>();
  ipc.handle(ipcChannels.plugins.list, async () => {
    const installed = await manager.list();
    const replaced = installed.filter(({ manifest }) => replacedExternalPluginIds.has(manifest.id));
    if (replaced.length > 0) {
      enableInternalPlugin(services.getDatabase(), "com.hypershell.quick-command-center");
    }
    await Promise.all(replaced.map(({ manifest }) => manager.uninstall(manifest.id)));
    return installed.filter(({ manifest }) => !replacedExternalPluginIds.has(manifest.id));
  });
  ipc.handle(ipcChannels.plugins.restart, () => {
    app.relaunch();
    setImmediate(() => app.quit());
  });
  ipc.handle(ipcChannels.plugins.update, async (event, rawId: unknown) => {
    const id = pluginIdSchema.parse(rawId);
    if (internalPluginIds.has(id)) throw new Error("Built-in plugins update with HyperShell");
    const selectedPath = await selectPackage(event as Electron.IpcMainInvokeEvent);
    if (!selectedPath) return null;
    return manager.install(selectedPath, id);
  });
  ipc.handle(ipcChannels.plugins.install, async (event, rawLocale: unknown) => {
    const selectedPath = await selectPackage(event as Electron.IpcMainInvokeEvent);
    if (!selectedPath) return null;
    const manifest = await manager.readManifest(selectedPath);
    if (internalPluginIds.has(manifest.id)) {
      throw new Error("This plugin is built into HyperShell and cannot be installed as an external plugin");
    }
    const existing = (await manager.list()).some((plugin) => plugin.manifest.id === manifest.id);
    z.enum(["en", "zh-CN"]).catch("en").parse(rawLocale);
    const token = randomUUID();
    const sender = (event as Electron.IpcMainInvokeEvent).sender;
    pendingPackages.set(token, { path: selectedPath, pluginId: manifest.id, senderId: sender.id, expiresAt: Date.now() + 5 * 60_000 });
    for (const [key, pending] of pendingPackages) if (pending.expiresAt <= Date.now()) pendingPackages.delete(key);
    return { token, manifest, action: existing ? "update" as const : "install" as const };
  });
  ipc.handle(ipcChannels.plugins.installSelected, async (event, rawToken: unknown) => {
    const token = z.string().uuid().parse(rawToken);
    const pending = pendingPackages.get(token);
    pendingPackages.delete(token);
    if (!pending || pending.expiresAt <= Date.now() || pending.senderId !== (event as Electron.IpcMainInvokeEvent).sender.id) {
      throw new Error("Plugin package selection expired");
    }
    const existing = (await manager.list()).some((plugin) => plugin.manifest.id === pending.pluginId);
    return manager.install(pending.path, existing ? pending.pluginId : undefined);
  });
  ipc.handle(ipcChannels.plugins.cancelInstall, (event, rawToken: unknown) => {
    const token = z.string().uuid().parse(rawToken);
    const pending = pendingPackages.get(token);
    if (pending?.senderId === (event as Electron.IpcMainInvokeEvent).sender.id) pendingPackages.delete(token);
  });
  ipc.handle(ipcChannels.plugins.runtime, async (_event, id: unknown) => manager.runtime(pluginIdSchema.parse(id)));
  ipc.handle(ipcChannels.plugins.invoke, async (event, rawRequest: unknown) => {
    const request = invokeRequestSchema.parse(rawRequest);
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const now = Date.now();
    const invocationKey = `${request.id}:${request.method}`;
    const recent = (recentInvocations.get(invocationKey) ?? []).filter((timestamp) => now - timestamp < 60_000);
    if (recent.length >= 60) throw new Error("Plugin RPC rate limit exceeded");
    recent.push(now);
    recentInvocations.set(invocationKey, recent);
    const plugin = (await manager.list()).find(({ manifest }) => manifest.id === request.id);
    if (!plugin) throw new Error("Plugin is not installed");
    const permissionByMethod = {
      "hosts.list": "hosts.read",
      "storage.list": "storage.read",
      "storage.upsert": "storage.write",
      "storage.remove": "storage.write",
      "storage.claimLegacy": "storage.write",
      "sessions.active": "sessions.read",
      "sessions.broadcast": "sessions.broadcast",
      "monitoring.latest": "monitoring.read",
      "systems.inspect": "processes.read",
    } as const;
    const requiredPermission = permissionByMethod[request.method];
    if (request.method !== "systems.inspect" && !plugin.grantedPermissions.includes(requiredPermission)) {
      throw new Error(`Plugin lacks permission: ${requiredPermission}`);
    }

    if (request.method === "hosts.list") {
      if (request.args.length !== 0) throw new Error("Invalid hosts.list arguments");
      return getOrCreateHostsRepo().list().map(({ id, name }) => ({ id, name }));
    }
    if (request.method === "monitoring.latest") {
      if (request.args.length > 1) throw new Error("Invalid monitoring.latest arguments");
      const hostIds = request.args.length === 0
        ? undefined
        : z.array(z.string().min(1).max(128)).max(32).parse(request.args[0]);
      if (hostIds && hostIds.length !== new Set(hostIds).size) throw new Error("Duplicate host IDs are not allowed");
      const hosts = getOrCreateHostsRepo().list()
        .filter((host) => !hostIds || hostIds.includes(host.id))
        .slice(0, 32);
      return Promise.all(hosts.map(async (host) => {
        const status = await probeHostStatus({ hostId: host.id, hostname: host.hostname, port: host.port });
        return { hostId: host.id, hostName: host.name, ...status, checkedAt: new Date().toISOString() };
      }));
    }
    if (request.method.startsWith("storage.")) {
      const storage = createPluginStorageRepositoryFromDatabase(services.getDatabase());
      if (request.method === "storage.list") {
        if (request.args.length !== 1) throw new Error("Invalid storage.list arguments");
        const collection = storageIdentifierSchema.parse(request.args[0]);
        return storage.list(plugin.manifest.id, collection).map(({ key, value }) => ({ key, value }));
      }
      if (request.method === "storage.upsert") {
        if (request.args.length !== 3) throw new Error("Invalid storage.upsert arguments");
        const [rawCollection, rawKey, value] = request.args;
        const collection = storageIdentifierSchema.parse(rawCollection);
        const key = storageIdentifierSchema.parse(rawKey);
        storage.upsert(plugin.manifest.id, collection, key, value);
        return;
      }
      if (request.method === "storage.remove") {
        if (request.args.length !== 2) throw new Error("Invalid storage.remove arguments");
        const [rawCollection, rawKey] = request.args;
        storage.remove(plugin.manifest.id, storageIdentifierSchema.parse(rawCollection), storageIdentifierSchema.parse(rawKey));
        return;
      }
      if (request.method === "storage.claimLegacy") {
        if (request.args.length !== 2) throw new Error("Invalid storage.claimLegacy arguments");
        const [rawSource, rawCollection] = request.args;
        const source = storageIdentifierSchema.parse(rawSource);
        const collection = storageIdentifierSchema.parse(rawCollection);
        if (!plugin.manifest.dataImports?.includes(source)) throw new Error("Plugin did not declare this data import");
        return storage.claimLegacy(plugin.manifest.id, source, collection);
      }
    }

    const hosts = getOrCreateHostsRepo().list();
    const activeSessions = services.sessionManager.listSessions()
      .filter((session) => session.transport === "ssh" && session.state === "connected")
      .map((session) => {
        const host = hosts.find((item) => item.id === session.profileId || item.hostname === session.profileId || item.name === session.profileId || (item.username && `${item.username}@${item.hostname}` === session.profileId));
        return host ? { id: session.sessionId, hostId: host.id, hostName: host.name } : null;
      })
      .filter((session): session is { id: string; hostId: string; hostName: string } => session !== null);

    if (request.method === "systems.inspect") {
      if (request.args.length < 2 || request.args.length > 3) throw new Error("Invalid systems.inspect arguments");
      const [rawSessionId, rawOperation, rawTarget] = request.args;
      const sessionId = sessionIdSchema.parse(rawSessionId);
      const operation = z.enum(["processes", "ports", "docker", "images", "volumes", "networks", "compose", "metrics", "disk-details", "terminate-process", "start-container", "stop-container"]).parse(rawOperation);
      const target = rawTarget === undefined ? undefined : z.string().max(128).parse(rawTarget);
      const requiredPermission = operation === "metrics" || operation === "disk-details" ? "monitoring.read"
        : operation === "terminate-process" ? "processes.terminate"
          : operation === "start-container" || operation === "stop-container" ? "docker.manage"
            : "processes.read";
      if (!plugin.grantedPermissions.includes(requiredPermission)) throw new Error(`Plugin lacks permission: ${requiredPermission}`);
      if (!activeSessions.some((session) => session.id === sessionId)) throw new Error("Target SSH session is not connected");

      let command: string;
      switch (operation) {
        case "processes":
          command = "ps -eo pid=,user=,%cpu=,%mem=,etime=,args= --sort=-%cpu | head -n 201";
          break;
        case "ports":
          command = "ss -lntup 2>/dev/null || netstat -lntup 2>/dev/null || true";
          break;
        case "docker":
          command = "docker ps -a --no-trunc --format '{{json .}}' 2>&1";
          break;
        case "images":
          command = "docker images --no-trunc --format '{{json .}}' 2>&1";
          break;
        case "volumes":
          command = "docker volume ls --format '{{json .}}' 2>&1";
          break;
        case "networks":
          command = "docker network ls --no-trunc --format '{{json .}}' 2>&1";
          break;
        case "compose":
          command = "docker compose ls --format json 2>&1";
          break;
        case "disk-details":
          command = "df -hP -x tmpfs -x devtmpfs 2>/dev/null | awk 'NR>1 {print $1 \"\\t\" $2 \"\\t\" $3 \"\\t\" $4 \"\\t\" $5 \"\\t\" $6}'";
          break;
        case "metrics":
          command = "read cpu u n s idle w irq sirq st rest < /proc/stat; total1=$((u+n+s+idle+w+irq+sirq+st)); idle1=$((idle+w)); sleep 1; read cpu u n s idle w irq sirq st rest < /proc/stat; total2=$((u+n+s+idle+w+irq+sirq+st)); idle2=$((idle+w)); cpu=$(awk -v t1=$total1 -v t2=$total2 -v i1=$idle1 -v i2=$idle2 'BEGIN { if (t2==t1) print 0; else printf \"%.1f\", 100*(1-(i2-i1)/(t2-t1)) }'); mem=$(awk '/MemTotal:/ {t=$2} /MemAvailable:/ {a=$2} END {if(t) printf \"%.1f\",100*(t-a)/t; else print 0}' /proc/meminfo); memTotal=$(awk '/MemTotal:/ {print $2}' /proc/meminfo); memAvailable=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo); cores=$(grep -c '^processor' /proc/cpuinfo); load1=$(awk '{print $1}' /proc/loadavg); uptime=$(awk '{printf \"%d\",$1}' /proc/uptime); disk=$(df -P / | awk 'NR==2 {gsub(/%/,\"\",$5); print $5+0}'); net=$(awk -F'[: ]+' 'NR>2 {rx+=$3; tx+=$11} END {printf \"%d %d\",rx,tx}' /proc/net/dev); set -- $net; printf '{\"cpuPercent\":%s,\"memoryPercent\":%s,\"diskPercent\":%s,\"networkRxBytes\":%s,\"networkTxBytes\":%s,\"memoryTotalKb\":%s,\"memoryAvailableKb\":%s,\"cpuCores\":%s,\"load1\":%s,\"uptimeSeconds\":%s}' \"$cpu\" \"$mem\" \"$disk\" \"${1:-0}\" \"${2:-0}\" \"${memTotal:-0}\" \"${memAvailable:-0}\" \"${cores:-0}\" \"${load1:-0}\" \"${uptime:-0}\"";
          break;
        case "terminate-process":
          if (!target || !/^\d{1,10}$/.test(target) || Number(target) < 1) throw new Error("Invalid process ID");
          command = `kill -TERM -- ${Number(target)} 2>&1`;
          break;
        case "start-container":
        case "stop-container":
          if (!target || !/^[a-fA-F0-9][a-fA-F0-9_.-]{0,127}$/.test(target)) throw new Error("Invalid container ID");
          command = `docker ${operation === "start-container" ? "start" : "stop"} ${target} 2>&1`;
          break;
      }
      return services.sessionManager.execCommand(sessionId, command, { timeoutMs: operation === "metrics" ? 7000 : 12000 });
    }

    if (request.method === "sessions.active") {
      if (request.args.length !== 0) throw new Error("Invalid sessions.active arguments");
      return activeSessions;
    }

    if (request.args.length !== 2) throw new Error("Invalid sessions.broadcast arguments");
    const [rawSessionIds, rawText] = request.args;
    const sessionIds = z.array(sessionIdSchema).min(1).max(20).parse(rawSessionIds);
    if (sessionIds.length !== new Set(sessionIds).size) throw new Error("Duplicate target sessions are not allowed");
    const text = z.string().trim().min(1).max(4096).parse(rawText);
    const selected = sessionIds.map((sessionId) => activeSessions.find((session) => session.id === sessionId));
    if (selected.some((session) => !session)) throw new Error("One or more target sessions are not connected");
    const details = selected.map((session) => session!.hostName).join("\n");
    const confirmationOptions: Electron.MessageBoxOptions = {
      type: "warning", buttons: ["Send", "Cancel"], defaultId: 1, cancelId: 1,
      title: selected.length === 1 ? "Confirm command" : "Confirm multi-session command",
      message: `Send this command to ${selected.length} ${selected.length === 1 ? "session" : "sessions"}?`,
      detail: `${details}\n\n${text}`,
    };
    const confirmation = parentWindow
      ? await dialog.showMessageBox(parentWindow, confirmationOptions)
      : await dialog.showMessageBox(confirmationOptions);
    if (confirmation.response !== 0) return { sent: 0 };
    for (const sessionId of sessionIds) services.sessionManager.write(sessionId, `${text}\r`);
    return { sent: sessionIds.length };
  });
  ipc.handle(ipcChannels.plugins.setPermissions, (_event, request: unknown) => {
    const parsed = setPermissionsRequestSchema.parse(request);
    return manager.setPermissions(parsed.id, parsed.permissions);
  });
  ipc.handle(ipcChannels.plugins.uninstall, (_event, id: unknown) => {
    return manager.uninstall(pluginIdSchema.parse(id));
  });
}
