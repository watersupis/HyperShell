import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SftpEvent } from "@hypershell/plugin-api";
import { sftpTestHost } from "./testUtils";

import {
  __resetTransferEventCoordinatorForTests,
  refreshTransfers,
  startTransferEventCoordinator,
  subscribeToDirectoryInvalidation,
  subscribeToTransferEvents
} from "../../../ui/transferEventCoordinator";
import { transferStore } from "../../../ui/transferStore";

interface Deferred {
  promise: Promise<{ transfers: [] }>;
  resolve: () => void;
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<{ transfers: [] }>((res) => {
    resolve = () => res({ transfers: [] });
  });
  return { promise, resolve };
}

function completedEvent(sftpSessionId: string, transferId: string): SftpEvent {
  return { kind: "transfer-complete", sftpSessionId, transferId, status: "completed" };
}

describe("transferEventCoordinator", () => {
  let bridgeListeners: Array<(event: SftpEvent) => void>;
  let unsubscribeCalls: number;
  let transferListCalls: number;

  beforeEach(() => {
    bridgeListeners = [];
    unsubscribeCalls = 0;
    transferListCalls = 0;

    sftpTestHost.sftp.onEvent = (listener: (event: SftpEvent) => void) => {
          bridgeListeners.push(listener);
          return () => {
            unsubscribeCalls += 1;
          };
        };
    sftpTestHost.sftp.transferList = async () => {
          transferListCalls += 1;
          return { transfers: [] };
        };

    transferStore.getState().setTransfers([]);
    for (const id of [...transferStore.getState().conflictIds]) {
      transferStore.getState().clearConflict(id);
    }
  });

  afterEach(() => {
    __resetTransferEventCoordinatorForTests();
    sftpTestHost.sftp.onEvent = () => () => {};
    sftpTestHost.sftp.transferList = async () => ({ transfers: [] });
  });

  function emit(event: SftpEvent): void {
    for (const listener of bridgeListeners) {
      listener(event);
    }
  }

  it("installs exactly one bridge listener regardless of how many views are open", () => {
    const stopA = startTransferEventCoordinator(sftpTestHost);
    const stopB = startTransferEventCoordinator(sftpTestHost);

    expect(bridgeListeners).toHaveLength(1);

    stopA();
    expect(unsubscribeCalls).toBe(0);

    stopB();
    expect(unsubscribeCalls).toBe(1);
  });

  it("is idempotent when the same teardown runs twice", () => {
    const stop = startTransferEventCoordinator(sftpTestHost);
    stop();
    stop();

    expect(unsubscribeCalls).toBe(1);

    // A fresh start must still be able to re-subscribe.
    startTransferEventCoordinator(sftpTestHost);
    expect(bridgeListeners).toHaveLength(2);
  });

  it("invalidates only the SFTP session that owns the completed transfer", () => {
    startTransferEventCoordinator(sftpTestHost);

    const sessionA = vi.fn();
    const sessionB = vi.fn();
    subscribeToDirectoryInvalidation("sftp-a", sessionA);
    subscribeToDirectoryInvalidation("sftp-b", sessionB);

    emit(completedEvent("sftp-a", "tx-1"));

    expect(sessionA).toHaveBeenCalledTimes(1);
    expect(sessionB).not.toHaveBeenCalled();
  });

  it("does not invalidate directories for failed transfers", () => {
    startTransferEventCoordinator(sftpTestHost);

    const listener = vi.fn();
    subscribeToDirectoryInvalidation("sftp-a", listener);

    emit({
      kind: "transfer-complete",
      sftpSessionId: "sftp-a",
      transferId: "tx-1",
      status: "failed",
      error: "boom"
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying a session after it unsubscribes", () => {
    startTransferEventCoordinator(sftpTestHost);

    const listener = vi.fn();
    const unsubscribe = subscribeToDirectoryInvalidation("sftp-a", listener);
    unsubscribe();

    emit(completedEvent("sftp-a", "tx-1"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("forwards conflict and completion events to view-level subscribers", () => {
    startTransferEventCoordinator(sftpTestHost);

    const listener = vi.fn();
    subscribeToTransferEvents(listener);

    emit({
      kind: "transfer-conflict",
      transferId: "tx-1",
      remotePath: "/remote/file",
      localPath: "C:/local/file"
    });
    emit(completedEvent("sftp-a", "tx-1"));

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0][0].kind).toBe("transfer-conflict");
    expect(listener.mock.calls[1][0].kind).toBe("transfer-complete");
  });

  it("ignores progress events for other event kinds", () => {
    startTransferEventCoordinator(sftpTestHost);

    const listener = vi.fn();
    subscribeToTransferEvents(listener);

    emit({ kind: "status", sftpSessionId: "sftp-a", state: "connected" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("coalesces overlapping transfer-list refreshes into a single follow-up", async () => {
    const deferred = createDeferred();
    let pendingCalls = 0;

    sftpTestHost.sftp.transferList = () => {
      pendingCalls += 1;
      return pendingCalls === 1 ? deferred.promise : Promise.resolve({ transfers: [] });
    };
    startTransferEventCoordinator(sftpTestHost);

    const first = refreshTransfers();
    void refreshTransfers();
    void refreshTransfers();

    expect(pendingCalls).toBe(1);

    deferred.resolve();
    await first;

    // Three callers, two requests: the in-flight one plus one follow-up that
    // covers everything that arrived while it was running.
    expect(pendingCalls).toBe(2);
  });

  it("survives a transfer-list request that rejects", async () => {
    vi.stubGlobal("window", {
      hypershell: {
        onSftpEvent: () => () => {},
        sftpTransferList: () => Promise.reject(new Error("bridge down"))
      }
    });

    await expect(refreshTransfers()).resolves.toBeUndefined();

    // The failed attempt must not wedge the coalescing latch.
    await expect(refreshTransfers()).resolves.toBeUndefined();
  });

  it("refetches once on start so views do not each fetch their own snapshot", async () => {
    startTransferEventCoordinator(sftpTestHost);
    startTransferEventCoordinator(sftpTestHost);
    startTransferEventCoordinator(sftpTestHost);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transferListCalls).toBe(1);
  });

  it("records a conflict in the store, not in a component", () => {
    startTransferEventCoordinator(sftpTestHost);

    emit({
      kind: "transfer-conflict",
      transferId: "t1",
      remotePath: "/r/f",
      localPath: "/l/f"
    });

    expect(transferStore.getState().conflictIds.has("t1")).toBe(true);
  });

  it("clears the conflict once the transfer makes progress again", () => {
    startTransferEventCoordinator(sftpTestHost);

    emit({
      kind: "transfer-conflict",
      transferId: "t1",
      remotePath: "/r/f",
      localPath: "/l/f"
    });

    emit({
      kind: "transfer-progress",
      transferId: "t1",
      bytesTransferred: 1,
      totalBytes: 10,
      speed: 1,
      status: "active"
    });

    expect(transferStore.getState().conflictIds.has("t1")).toBe(false);
  });

  it("resets the filter to \"all\" when a conflict arrives, so the panel can't hide it", () => {
    startTransferEventCoordinator(sftpTestHost);
    transferStore.getState().setFilter("completed");

    emit({
      kind: "transfer-conflict",
      transferId: "t1",
      remotePath: "/r/f",
      localPath: "/l/f"
    });

    expect(transferStore.getState().filter).toBe("all");
  });

  it("clears the conflict when the transfer completes", () => {
    startTransferEventCoordinator(sftpTestHost);

    emit({
      kind: "transfer-conflict",
      transferId: "t1",
      remotePath: "/r/f",
      localPath: "/l/f"
    });

    emit(completedEvent("s1", "t1"));

    expect(transferStore.getState().conflictIds.has("t1")).toBe(false);
  });
});
