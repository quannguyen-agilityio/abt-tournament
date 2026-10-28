import { DEFAULT_SEASON_TIMEZONE } from './season';

export { DEFAULT_SEASON_TIMEZONE };

type AppLocale = 'vi' | 'en';

const INTL_TAGS: Record<AppLocale, string> = {
  vi: 'vi-VN',
  en: 'en-GB', // 24h, day-first; matches the mockups
};

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();

function dateFormatter(locale: AppLocale, timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = `d|${locale}|${timeZone}|${JSON.stringify(options)}`;
  let formatter = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(INTL_TAGS[locale], { ...options, timeZone });
    cache.set(key, formatter);
  }
  return formatter;
}

function numberFormatter(locale: AppLocale, options: Intl.NumberFormatOptions) {
  const key = `n|${locale}|${JSON.stringify(options)}`;
  let formatter = cache.get(key) as Intl.NumberFormat | undefined;
  if (!formatter) {
    formatter = new Intl.NumberFormat(INTL_TAGS[locale], options);
    cache.set(key, formatter);
  }
  return formatter;
}

export function formatNumber(value: number, locale: AppLocale, options?: Intl.NumberFormatOptions) {
  return numberFormatter(locale, options ?? {}).format(value);
}

/** Whole VND amount, e.g. "300.000 ₫" in vi. */
export function formatMoney(amount: number, locale: AppLocale) {
  return numberFormatter(locale, {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Date only, in the season timezone. */
export function formatDate(date: Date, locale: AppLocale, timeZone = DEFAULT_SEASON_TIMEZONE) {
  return dateFormatter(locale, timeZone, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** HH:mm (24h) in the season timezone, labeled "ICT". */
export function formatTime(date: Date, locale: AppLocale, timeZone = DEFAULT_SEASON_TIMEZONE) {
  const time = dateFormatter(locale, timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${time} ICT`;
}

export function formatDateTime(date: Date, locale: AppLocale, timeZone = DEFAULT_SEASON_TIMEZONE) {
  return `${formatDate(date, locale, timeZone)} ${formatTime(date, locale, timeZone)}`;
}

/** A calendar day (`YYYY-MM-DD`) with its weekday, e.g. "Saturday 09/01" in en. */
export function formatDay(day: string, locale: AppLocale) {
  return dateFormatter(locale, 'UTC', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(
    new Date(`${day}T00:00:00Z`),
  );
}
