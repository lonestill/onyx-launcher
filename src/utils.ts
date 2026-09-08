type FormattingLocale = "en";

export function formatPlaytime(
  minutes: number,
  _locale: FormattingLocale = "en",
) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

export function compactNumber(
  value: number,
  _locale: FormattingLocale = "en",
) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatBytes(
  value = 0,
  _locale: FormattingLocale = "en",
) {
  const units = ["B", "KB", "MB", "GB"];
  if (!value) return `0 ${units[0]}`;
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1_000_000) return `${(bytesPerSec / 1_000_000).toFixed(1)} MB/s`
  return `${(bytesPerSec / 1_000).toFixed(0)} KB/s`
}

export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "";
  if (seconds > 60) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
  return `${Math.floor(seconds)}s`
}
