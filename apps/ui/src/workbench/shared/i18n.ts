import { useEffect } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { messages as enMessages } from "./locales/en";
import { messages as zhCNMessages } from "./locales/zh-CN";

export type Locale = "en" | "zh-CN";

interface LocalizationState {
  locale: Locale;
  setLocale(locale: Locale): void;
}

export const localizationStore = createStore<LocalizationState>()((set) => ({
  locale: "en",
  setLocale: (locale) => set({ locale }),
}));

export function setLocale(locale: Locale): void {
  localizationStore.getState().setLocale(locale);
}

const dictionaries = {
  en: enMessages,
  "zh-CN": zhCNMessages,
} satisfies Record<Locale, Record<string, string>>;

export function translate(key: string, locale: Locale = "en"): string {
  return dictionaries[locale][key] ?? key;
}

export function useI18n(): { locale: Locale; t: (key: string) => string } {
  const locale = useStore(localizationStore, (state) => state.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return { locale, t: (key) => translate(key, locale) };
}
