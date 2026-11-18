import { describe, expect, it } from "vitest";
import { getCommandSuggestions, type CommandLibraryEntry } from "../../../../../src/workbench/editor-area/terminal/commandLibrary";

const library: CommandLibraryEntry[] = [
  { prefix: "git status", command: "git status", description: "Show status" },
  { prefix: "git stash", command: "git stash", description: "Stash changes" },
  { prefix: "docker ps", command: "docker ps", description: "List containers" },
];

describe("command suggestions", () => {
  it("matches public commands by the text already typed", () => {
    expect(getCommandSuggestions("git", library).map((item) => item.command)).toEqual([
      "git status",
      "git stash",
    ]);
    expect(getCommandSuggestions("git st", library).map((item) => item.command)).toEqual([
      "git status",
      "git stash",
    ]);
  });

  it("does not show unrelated or non-command input", () => {
    expect(getCommandSuggestions("powershell", library)).toEqual([]);
    expect(getCommandSuggestions("git; rm", library)).toEqual([]);
  });
});
