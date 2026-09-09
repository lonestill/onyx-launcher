import type { Locale } from "../types";
import { en } from "./en";
import { ru } from "./ru";

export { en, ru };
export type { TranslationKey } from "./en";

export const SUPPORTED_LOCALES: ReadonlyArray<{
  id: Locale;
  label: string;
  nativeLabel: string;
}> = [
  { id: "en", label: "English", nativeLabel: "English" },
  { id: "ru", label: "Russian", nativeLabel: "Русский" },
];

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ru";
}

export const locales: Record<Locale, Partial<Record<string, string>>> = {
  en,
  ru,
};
