import type { Locale } from "./types";

type FormattingLocale = Locale;

export function formatPlaytime(
  minutes: number,
  locale: FormattingLocale = "en",
) {
  const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
  if (locale === "ru") {
    if (safeMinutes < 60) return `${safeMinutes} мин`;
    const hours = Math.floor(safeMinutes / 60);
    if (hours < 24) return `${hours} ч`;
    return `${Math.floor(hours / 24)} д ${hours % 24} ч`;
  }
  if (safeMinutes < 60) return `${safeMinutes} min`;
  const hours = Math.floor(safeMinutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

export function compactNumber(
  value: number,
  locale: FormattingLocale = "en",
) {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatBytes(value = 0, locale: FormattingLocale = "en") {
  const units = ["B", "KB", "MB", "GB"];
  if (!value) return `0 ${units[0]}`;
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const numeric = value / 1024 ** index;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: index ? 1 : 0,
    minimumFractionDigits: 0,
  }).format(numeric);
  return `${formatted} ${units[index]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "";
  if (seconds > 60) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds)}s`;
}

export function isBuiltinPureGame(
  instance: { id?: string; name?: string } | null | undefined,
): boolean {
  if (!instance) return false;
  return (
    instance.id === "vanilla-start" &&
    (!instance.name || instance.name === "Pure Game" || instance.name === "Чистая игра")
  );
}

