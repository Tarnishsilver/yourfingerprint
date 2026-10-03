import type { BrandEntry, UserAgentDataSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attempt } from '../lib/attempt.js';

/**
 * SECTION 15 - User-Agent Client Hints (UA-CH).
 *
 * WHAT THIS IS
 * `navigator.userAgentData` is the structured replacement for the frozen UA
 * string. The low-entropy part (`brands`, `mobile`, `platform`) is exposed by
 * default and is the modern, low-detail identity surface that sites are meant to
 * use instead of UA sniffing.
 *
 * HIGH-ENTROPY HINTS (labelled explicitly below)
 * `brands`, `mobile` and `platform` deliberately give away almost nothing.
 * Extra fields - `architecture`, `bitness`, `model`, `platformVersion`,
 * `fullVersionList` - require an explicit `getHighEntropyValues()` call:
 *
 *   - It is opt-in. The UI exposes a checkbox and the request is only made when
 *     the user ticks it, so the data sent to the server is visible up front.
 *   - The browser decides whether to honour it. Firefox and Safari do not
 *     implement it; Chromium honours it.
 *   - The call does add a `Sec-CH-UA-Arch`, `Sec-CH-UA-Bitness`,
 *     `Sec-CH-UA-Model`, `Sec-CH-UA-Platform-Version`, `Sec-CH-UA-Full-Version-List`
 *     and `Sec-CH-UA-WoW64` header to the *next request the browser makes to
 *     this origin*. That is a genuine trade-off: the values become visible to
 *     the server, which is why this tool says so plainly rather than doing it
 *     silently.
 *
 * `model` is the most identifying of these ("Pixel 8 Pro"), which is exactly why
 * it is gated.
 */

/** High-entropy hints requested when the user opts in. */
export const HIGH_ENTROPY_HINTS = [
  'architecture',
  'bitness',
  'model',
  'platformVersion',
  'fullVersionList',
  'wow64',
] as const;

interface UADataBrandVersion {
  brand: string;
  version: string;
}

interface UAData {
  brands?: UADataBrandVersion[];
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (
    hints: string[],
  ) => Promise<Record<string, unknown> | null>;
}

function getUAData(): UAData | undefined {
  return (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
}

function toBrands(brands: UADataBrandVersion[] | undefined): BrandEntry[] | typeof NOT_AVAILABLE {
  if (!Array.isArray(brands)) return NOT_AVAILABLE;
  // GREASE brand entries (randomly ordered, e.g. "Not)A;Brand") are included
  // deliberately: their presence and ordering vary by browser build, so they
  // are part of the signal rather than noise to be stripped.
  return brands.map((entry) => ({ brand: entry.brand, version: entry.version }));
}

export async function collectUserAgentData(
  includeHighEntropy: boolean,
): Promise<UserAgentDataSignals> {
  const fallback: UserAgentDataSignals = {
    available: false,
    brands: NOT_AVAILABLE,
    mobile: NOT_AVAILABLE,
    platform: NOT_AVAILABLE,
    highEntropy: NOT_AVAILABLE,
    highEntropyRequested: false,
    note:
      'navigator.userAgentData is not implemented here (Firefox and Safari do ' +
      'not support User-Agent Client Hints). Fall back to navigator.userAgent.',
  };

  return attempt<UserAgentDataSignals>('userAgentData', 'userAgentData', async () => {
    const uaData = getUAData();
    if (!uaData) return fallback;

    const base: UserAgentDataSignals = {
      available: true,
      brands: toBrands(uaData.brands),
      mobile: typeof uaData.mobile === 'boolean' ? uaData.mobile : NOT_AVAILABLE,
      platform: typeof uaData.platform === 'string' ? uaData.platform : NOT_AVAILABLE,
      highEntropy: NOT_AVAILABLE,
      highEntropyRequested: false,
      note: '',
    };

    if (!includeHighEntropy) {
      base.note =
        'Low-entropy client hints only. High-entropy hints were NOT requested ' +
        'because the opt-in box was unticked.';
      return base;
    }

    if (typeof uaData.getHighEntropyValues !== 'function') {
      base.note =
        'High-entropy hints were requested but this browser does not implement ' +
        'getHighEntropyValues().';
      return base;
    }

    base.highEntropyRequested = true;
    base.highEntropy = await attempt<Record<string, string | number | boolean | null>>(
      'userAgentData',
      'getHighEntropyValues',
      async () => {
        const values = await uaData.getHighEntropyValues!([...HIGH_ENTROPY_HINTS]);
        // Coerce to scalars so the value is JSON-serialisable and hashable.
        const result: Record<string, string | number | boolean | null> = {};
        for (const [key, value] of Object.entries(values ?? {})) {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            result[key] = value;
          } else if (Array.isArray(value)) {
            result[key] = value.map((entry) => String(entry)).join(', ');
          } else {
            result[key] = null;
          }
        }
        return result;
      },
      {},
    );
    base.note =
      'HIGH-ENTROPY HINTS: explicitly requested by the user via the opt-in ' +
      'checkbox. Because the browser volunteers these values to the origin, it ' +
      'added Sec-CH-UA-Arch / Sec-CH-UA-Bitness / Sec-CH-UA-Model / ' +
      'Sec-CH-UA-Platform-Version / Sec-CH-UA-Full-Version-List headers to this ' +
      'request. "model" in particular can name the exact device. No further ' +
      'high-entropy hints can be requested after the page has finished loading.';

    return base;
  }, fallback);
}

/**
 * Extracts the high-entropy hints that belong in the HARDWARE section.
 * These are the same values the browser volunteered above - no new request.
 */
export function hardwareHintsFromUAData(
  signals: UserAgentDataSignals,
): Record<string, unknown> | undefined {
  if (signals.highEntropy === NOT_AVAILABLE || typeof signals.highEntropy !== 'object') {
    return undefined;
  }
  return signals.highEntropy;
}