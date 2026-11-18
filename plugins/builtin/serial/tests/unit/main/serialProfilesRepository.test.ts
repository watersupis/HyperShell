import { describe, expect, it } from "vitest";
import { openDatabase } from "@hypershell/db";
import { createSerialProfilesRepositoryFromDatabase } from "../../../main/serialProfilesRepository";

describe("serialProfilesRepository", () => {
  it("persists profiles with defaults and returns them ordered by name", () => {
    const repository = createSerialProfilesRepositoryFromDatabase(openDatabase(":memory:"));

    repository.create({ id: "z", name: "Zulu", path: "COM2" });
    repository.create({
      id: "a",
      name: "Alpha",
      path: "COM1",
      baudRate: 115200,
      localEcho: true,
    });

    expect(repository.list()).toEqual([
      expect.objectContaining({
        id: "a",
        baudRate: 115200,
        localEcho: true,
        dataBits: 8,
        dtr: true,
        rts: true,
      }),
      expect.objectContaining({
        id: "z",
        baudRate: 9600,
        localEcho: false,
        dataBits: 8,
      }),
    ]);
    expect(repository.get("z")?.path).toBe("COM2");
  });

  it("removes an existing profile", () => {
    const repository = createSerialProfilesRepositoryFromDatabase(openDatabase(":memory:"));
    repository.create({ id: "profile", name: "Profile", path: "COM3" });

    expect(repository.remove("profile")).toBe(true);
    expect(repository.get("profile")).toBeUndefined();
    expect(repository.remove("profile")).toBe(false);
  });
});
