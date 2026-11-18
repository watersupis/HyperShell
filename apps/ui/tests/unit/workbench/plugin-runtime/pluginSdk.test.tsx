import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PluginLocale, PluginUiHostServices } from "@hypershell/plugin-api";
import { usePluginI18n, usePluginSettings } from "@hypershell/plugin-sdk";

describe("plugin SDK", () => {
  it("subscribes to host locale changes and translates with the current locale", () => {
    let locale: PluginLocale = "en";
    const listeners = new Set<() => void>();
    const host = {
      i18n: {
        getLocale: () => locale,
        translate: (key: string, targetLocale = locale) => `${targetLocale}:${key}`,
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    } as unknown as PluginUiHostServices;

    const { result } = renderHook(() => usePluginI18n(host));
    expect(result.current.locale).toBe("en");
    expect(result.current.t("Local")).toBe("en:Local");

    act(() => {
      locale = "zh-CN";
      listeners.forEach((listener) => listener());
    });

    expect(result.current.locale).toBe("zh-CN");
    expect(result.current.t("Local")).toBe("zh-CN:Local");
  });

  it("subscribes only to namespaced plugin settings", () => {
    let pluginSettings: Readonly<Record<string, unknown>> = {};
    const listeners = new Set<() => void>();
    const host = {
      settings: {
        getPlugin: () => pluginSettings,
        updatePlugin: async (_pluginId: string, partial: Readonly<Record<string, unknown>>) => {
          pluginSettings = { ...pluginSettings, ...partial };
          listeners.forEach((listener) => listener());
        },
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    } as unknown as PluginUiHostServices;
    const { result } = renderHook(() => usePluginSettings(host, "serial"));

    act(() => {
      void result.current.update({ showInSidebar: false });
    });
    expect(result.current.settings.showInSidebar).toBe(false);
  });
});
