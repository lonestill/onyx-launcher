/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Locale as BaseLocale } from "./types";
import { en } from "./locales/en";
import { ru } from "./locales/ru";
import { isLocale } from "./locales/index";

export type Locale = BaseLocale;
export type TranslationValues = Record<string, string | number>;
export type { TranslationKey } from "./locales/en";
import type { TranslationKey } from "./locales/en";

const dictionaries: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  en,
  ru,
};

const STORAGE_KEY = "onyx.locale";

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // localStorage may be unavailable (private mode, SSR); fall through.
  }
  return "en";
}

function interpolate(message: string, values?: TranslationValues) {
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: TranslationValues,
) {
  const active = dictionaries[locale]?.[key];
  const fallback = en[key] ?? key;
  return interpolate(active ?? fallback, values);
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (initialLocale && isLocale(initialLocale)) return initialLocale;
    if (typeof window === "undefined") return "en";
    return readStoredLocale();
  });

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore persistence failures; in-memory locale still updates.
    }
    document.documentElement.lang = next;
    document.documentElement.dataset.locale = next;
  }, []);

  useEffect(() => {
    if (initialLocale && isLocale(initialLocale)) {
      setLocaleState(initialLocale);
    }
  }, [initialLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Ignore persistence failures.
    }
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      translate(locale, key, values),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
