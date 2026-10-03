import type { TimezoneSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attempt, attemptSync } from '../lib/attempt.js';

/**
 * SECTION 3 - Timezone and locale.
 *
 * The IANA timezone name is a surprisingly strong signal: it comes from the OS
 * and it is far more specific than the UTC offset, because it distinguishes
 * `Europe/London` from `Europe/Dublin` - two places that share an offset year
 * round except for a few weeks a year. Sites with a multi-language audience use
 * it to distinguish "English speaker in Lisbon" from "English speaker in
 * London".
 *
 * The locale, calendar and numbering system reveal regional settings
 * (e.g. `ja-JP-u-ca-japanese`, or Arabic/Hindi digit systems).
 */
export async function collectTimezone(): Promise<TimezoneSignals> {
  // Intl.DateTimeFormat is universally available; the resolvedOptions() call is
  // the only way to read the effective locale without touching the DOM.
  const resolved = await attempt(
    'timezone',
    'Intl.DateTimeFormat',
    () => Intl.DateTimeFormat().resolvedOptions(),
    undefined as Intl.ResolvedDateTimeFormatOptions | undefined,
  );

  // The locale's own Intl instance may carry a different calendar than the
  // default one (e.g. when the user overrides just the numbering system).
  const localeResolved = await attempt(
    'timezone',
    'Intl(locale)',
    () => Intl.DateTimeFormat(resolved?.locale ?? undefined).resolvedOptions(),
    undefined as Intl.ResolvedDateTimeFormatOptions | undefined,
  );

  // Offset is derived from the clock rather than from Intl, which does not
  // expose an offset directly. getTimezoneOffset() is minutes *behind* UTC,
  // so it is negated here to keep the conventional east-of-greenwich sign.
  const offsetMinutes = await attempt('timezone', 'getTimezoneOffset', () => {
    const raw = new Date().getTimezoneOffset();
    return Number.isFinite(raw) ? -raw : NOT_AVAILABLE;
  }, NOT_AVAILABLE);

  const offsetLabel =
    typeof offsetMinutes === 'number' ? formatUtcOffset(offsetMinutes) : NOT_AVAILABLE;

  const locale = resolved?.locale ?? NOT_AVAILABLE;

  return {
    // IANA zone name taken from the OS, e.g. "Europe/London".
    timeZone: resolved?.timeZone ?? NOT_AVAILABLE,
    // Minutes east of UTC, so UTC+05:30 is 330.
    utcOffsetMinutes: offsetMinutes,
    // "UTC+05:30" style rendering of the offset above.
    utcOffsetLabel: offsetLabel,
    // Effective BCP-47 locale, e.g. "en-GB-u-ca-gregory".
    locale,
    // Calendar in force, e.g. "gregory", "japanese", "islamic".
    calendar: resolved?.calendar ?? NOT_AVAILABLE,
    // Decimal digit system, e.g. "latn", "arab", "deva".
    numberingSystem: resolved?.numberingSystem ?? NOT_AVAILABLE,
    // Language subtag only, e.g. "en".
    language: deriveLanguage(locale),
    // Zone reported when the locale itself is instantiated.
    timeZoneName: localeResolved?.timeZone ?? NOT_AVAILABLE,
  };
}

/** "UTC+05:30" / "UTC-08:00" / "UTC". */
export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const rest = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${rest}`;
}

/** Splits "en-GB-u-ca-gregory" down to just "en". */
function deriveLanguage(locale: string): string {
  return attemptSync('timezone', 'language', () => {
    if (typeof locale !== 'string' || locale.length === 0) return NOT_AVAILABLE;
    return locale.split('-')[0] ?? NOT_AVAILABLE;
  }, NOT_AVAILABLE);
}