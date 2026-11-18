import { describe, expect, it } from "vitest";
import { openDatabase } from "../../../src";
import { createPluginStorageRepositoryFromDatabase } from "../../../src/repositories/pluginStorageRepository";

describe("plugin storage repository", () => {
  it("isolates collection records by plugin owner and supports upsert/remove", () => {
    const db = openDatabase(":memory:");
    const storage = createPluginStorageRepositoryFromDatabase(db);
    storage.upsert("com.example.first", "items", "one", { value: 1 });
    storage.upsert("com.example.first", "items", "one", { value: 2 });
    storage.upsert("com.example.second", "items", "one", { value: 3 });

    expect(storage.list("com.example.first", "items")).toMatchObject([{ key: "one", value: { value: 2 } }]);
    expect(storage.get("com.example.second", "items", "one")?.value).toEqual({ value: 3 });
    expect(storage.remove("com.example.first", "items", "one")).toBe(true);
    expect(storage.get("com.example.first", "items", "one")).toBeUndefined();
    expect(storage.get("com.example.second", "items", "one")?.value).toEqual({ value: 3 });
    db.close();
  });

  it("rejects invalid identifiers and values above the storage limit", () => {
    const db = openDatabase(":memory:");
    const storage = createPluginStorageRepositoryFromDatabase(db);
    expect(() => storage.list("bad/plugin", "items")).toThrow("Invalid plugin storage plugin ID");
    expect(() => storage.upsert("com.example.test", "items", "large", "x".repeat(64 * 1024)))
      .toThrow("64 KB limit");
    db.close();
  });

  it("moves declared legacy data into the requesting plugin's isolated namespace", () => {
    const db = openDatabase(":memory:");
    const storage = createPluginStorageRepositoryFromDatabase(db);
    db.prepare("INSERT INTO plugin_storage (plugin_id, collection, key, value_json) VALUES (?, ?, ?, ?)")
      .run("__legacy__", "hypershell.command-snippets.v1", "old-item", JSON.stringify({ name: "Old" }));

    expect(storage.claimLegacy("com.example.commands", "hypershell.command-snippets.v1", "snippets")).toBe(1);
    expect(storage.get("com.example.commands", "snippets", "old-item")?.value).toEqual({ name: "Old" });
    expect(storage.list("com.example.commands", "snippets")).toHaveLength(1);
    expect(storage.list("com.example.other", "snippets")).toEqual([]);
    db.close();
  });
});
