import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerQuickCommandCenterPlugin } from "../../../main";
import { extractFigStaticCommands } from "../../../figSpecSnapshot";
import { localizeFigDescription } from "../../../ui/figDescription";

const { storage, rows } = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  storage: {
    claimLegacy: vi.fn(),
    get: vi.fn((pluginId: string, collection: string, key: string) => {
      const value = rows.get(`${pluginId}:${collection}:${key}`);
      return value === undefined ? undefined : { key, value, updatedAt: "now" };
    }),
    list: vi.fn((pluginId: string, collection: string) => [...rows.entries()]
      .filter(([key]) => key.startsWith(`${pluginId}:${collection}:`))
      .map(([key, value]) => ({ key: key.slice(`${pluginId}:${collection}:`.length), value, updatedAt: "now" }))),
    upsert: vi.fn((pluginId: string, collection: string, key: string, value: unknown) => {
      rows.set(`${pluginId}:${collection}:${key}`, value);
    }),
    remove: vi.fn((pluginId: string, collection: string, key: string) => rows.delete(`${pluginId}:${collection}:${key}`)),
  },
}));

vi.mock("@hypershell/db", () => ({ createPluginStorageRepositoryFromDatabase: () => storage }));

describe("Fig description localization", () => {
  it("uses the selected language and localizes common descriptions", () => {
    expect(localizeFigDescription("Show help message", "zh-CN")).toBe("显示帮助信息。");
    expect(localizeFigDescription("Show help message", "en")).toBe("Show help message");
  });

  it("translates known descriptions and preserves the source text when no translation exists", () => {
    expect(localizeFigDescription("Display system-wide information", "zh-CN")).toBe("显示系统范围的信息。");
    expect(localizeFigDescription("Long English Fig description", "zh-CN")).toBe("Long English Fig description");
    expect(localizeFigDescription(undefined, "zh-CN")).toBeUndefined();
  });
});

describe("Quick Command Center plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows.clear();
  });

  it("claims and clears legacy snippets without seeding sample commands", async () => {
    rows.set("com.hypershell.quick-command-center:snippets:old-command", {
      id: "old-command",
      name: "Old command",
      body: "echo old",
    });
    const methods = new Map<string, (payload: unknown) => unknown>();
    registerQuickCommandCenterPlugin({
      getDatabase: () => ({} as never),
      sessions: { listSessions: () => [], write: vi.fn() } as never,
      pluginMainMethods: {
        register: (pluginId, method, handler) => {
          methods.set(`${pluginId}.${method}`, handler);
          return () => methods.delete(`${pluginId}.${method}`);
        },
      },
    });

    expect(storage.claimLegacy).toHaveBeenCalledWith(
      "com.hypershell.quick-command-center",
      "hypershell.command-snippets.v1",
      "snippets",
    );
    const listed = await methods.get("com.hypershell.quick-command-center.commands.list")?.(undefined) as unknown[];
    expect(listed).toHaveLength(0);
    expect(storage.get("com.hypershell.quick-command-center", "state", "initial-commands-cleared-v1")?.value).toBe(true);
    expect(methods.get("com.hypershell.quick-command-center.knowledgeBase.list")?.(undefined)).toHaveLength(3679);
    expect(() => methods.get("com.hypershell.quick-command-center.commands.save")?.({ id: "fig-git-status", name: "x", body: "x" })).toThrow("read-only");
    expect(() => methods.get("com.hypershell.quick-command-center.commands.remove")?.({ id: "fig-git-status" })).toThrow("read-only");
    expect(await methods.get("com.hypershell.quick-command-center.knowledgeBase.status")?.(undefined)).toMatchObject({
      version: "aef52acff84c45edde61ae610cc2c964802b9a38",
      entryCount: 3679,
      license: "MIT",
    });
  });

  it("saves and lists commands with their group", () => {
    const methods = new Map<string, (payload: unknown) => unknown>();
    registerQuickCommandCenterPlugin({
      getDatabase: () => ({} as never),
      sessions: { listSessions: () => [], write: vi.fn() } as never,
      pluginMainMethods: {
        register: (pluginId, method, handler) => {
          methods.set(`${pluginId}.${method}`, handler);
          return () => methods.delete(`${pluginId}.${method}`);
        },
      },
    });

    const saved = methods.get("com.hypershell.quick-command-center.commands.save")?.({
      id: "deploy-prod",
      name: "Deploy production",
      body: "./deploy.sh production",
      group: "Deployment",
    });
    expect(saved).toMatchObject({ id: "deploy-prod", group: "Deployment" });
    expect(methods.get("com.hypershell.quick-command-center.commands.list")?.(undefined)).toContainEqual(saved);
  });

  it("replaces the legacy 36-command Fig catalog with the bundled snapshot", () => {
    rows.set("com.hypershell.quick-command-center:fig-knowledge:current", {
      version: "2026.11.15.1",
      updatedAt: "Bundled",
      entryCount: 36,
      source: "Fig autocomplete specs",
      license: "MIT",
    });
    rows.set("com.hypershell.quick-command-center:fig-knowledge:fig-legacy-command", {
      id: "legacy-command",
      name: "legacy",
      prefix: "legacy",
      body: "legacy",
      description: "old entry",
    });
    registerQuickCommandCenterPlugin({
      getDatabase: () => ({} as never),
      sessions: { listSessions: () => [], write: vi.fn() } as never,
      pluginMainMethods: { register: () => () => undefined },
    });

    expect(storage.get("com.hypershell.quick-command-center", "fig-knowledge", "current")?.value).toMatchObject({
      version: "aef52acff84c45edde61ae610cc2c964802b9a38",
      entryCount: 3679,
    });
    expect(storage.get("com.hypershell.quick-command-center", "fig-knowledge", "fig-legacy-command")).toBeUndefined();
  });

  it("validates and installs a downloaded snapshot", async () => {
    const methods = new Map<string, (payload: unknown) => unknown>();
    const pluginMainMethods = {
      register: (pluginId: string, method: string, handler: (payload: unknown) => unknown) => {
        methods.set(`${pluginId}.${method}`, handler);
        return () => methods.delete(`${pluginId}.${method}`);
      },
    };
    registerQuickCommandCenterPlugin({
      getDatabase: () => ({} as never),
      sessions: { listSessions: () => [], write: vi.fn() } as never,
      pluginMainMethods,
      fetchKnowledgeBase: async () => ({
        schemaVersion: 1,
        version: "2026.11.16.1",
        source: "Fig autocomplete specs",
        sourceUrl: "https://github.com/withfig/autocomplete",
        license: "MIT",
        commands: [{ id: "git-status-new", name: "Git status", prefix: "git status", body: "git status", description: "Show status" }],
      }),
    });
    const update = methods.get("com.hypershell.quick-command-center.knowledgeBase.update")!;

    await expect(update(undefined)).resolves.toMatchObject({
      updated: true,
      status: { version: "2026.11.16.1", entryCount: 1, license: "MIT" },
    });
    expect(storage.get("com.hypershell.quick-command-center", "fig-knowledge", "fig-git-status-new")).toBeDefined();
    expect(storage.get("com.hypershell.quick-command-center", "fig-knowledge", "fig-git-status")).toBeUndefined();
  });

  it("keeps the installed snapshot when an update payload is invalid", async () => {
    const methods = new Map<string, (payload: unknown) => unknown>();
    registerQuickCommandCenterPlugin({
      getDatabase: () => ({} as never),
      sessions: { listSessions: () => [], write: vi.fn() } as never,
      pluginMainMethods: {
        register: (pluginId, method, handler) => {
          methods.set(`${pluginId}.${method}`, handler);
          return () => methods.delete(`${pluginId}.${method}`);
        },
      },
      fetchKnowledgeBase: async () => ({ schemaVersion: 99, version: "bad", commands: [] }),
    });
    const update = methods.get("com.hypershell.quick-command-center.knowledgeBase.update")!;

    await expect(update(undefined)).rejects.toThrow();
    expect(methods.get("com.hypershell.quick-command-center.knowledgeBase.status")?.(undefined)).toMatchObject({
      version: "aef52acff84c45edde61ae610cc2c964802b9a38",
      entryCount: 3679,
    });
  });
describe("Fig static extraction", () => {
  it("reads non-exported completionSpec declarations without executing dynamic fields", () => {
    const source = `
      const baseOptions: Fig.Option[] = [{ name: "--help", description: "Print help" }, ...dynamicOptions()];
      const commands: Fig.Subcommand[] = [
        { name: "status", description: "Show status", options: [
          { name: "--short", description: "Short output" },
          { name: "--branch", args: { name: "branch" } },
        ] },
        { name: dynamicSubcommand() },
      ];
      const completionSpec: Fig.Spec = {
        name: "git",
        options: baseOptions,
        subcommands: commands,

      };
      export default completionSpec;
    `;
    const commands = extractFigStaticCommands(source, "git");
    expect(commands.map(({ prefix }) => prefix)).toEqual(["git --help", "git status", "git status --short"]);
  });
});
});
