import { describe, expect, it } from "vitest";
import { expandSnippetCommand } from "../../src/commandTemplate";

describe("expandSnippetCommand", () => {
  it("expands repeated named parameters", () => {
    expect(expandSnippetCommand("restart ${service}; status ${service}", { service: "api" }))
      .toBe("restart api; status api");
  });

  it("rejects missing, blank, and unused parameters", () => {
    expect(() => expandSnippetCommand("deploy ${service}", {})).toThrow("Missing: service");
    expect(() => expandSnippetCommand("deploy ${service}", { service: "  " })).toThrow("Missing: service");
    expect(() => expandSnippetCommand("deploy ${service}", { service: "api", region: "west" }))
      .toThrow("unknown: region");
  });

  it("enforces the expanded command length limit", () => {
    expect(() => expandSnippetCommand("echo ${value}", { value: "x".repeat(4096) }))
      .toThrow("4096 character limit");
  });
});
