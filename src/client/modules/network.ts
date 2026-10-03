import type { NetworkSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attemptSync, has } from '../lib/attempt.js';

/**
 * SECTION 12 - Network Information API.
 *
 * IMPORTANT PROVENANCE NOTE
 * Everything in this block is *browser-reported and self-declared*. It is not
 * measured by this page and not observed by the server:
 *
 *   - `effectiveType` is a coarse bucket ("4g", "3g", "2g", "slow-2g") derived
 *     by the browser from its own heuristics about the link.
 *   - `downlink` is an *estimate* in Mbit/s, rounded to 25 kbit/s steps.
 *   - `rtt` is a rounded estimate of the effective round-trip time in ms.
 *   - `type` describes the declared connection technology ("wifi", "cellular",
 *     "ethernet"), which may be wrong.
 *
 * Because the values are estimates, they are noisy, they change as the user
 * moves between networks, and they are trivially spoofable. Real-world sites
 * treat this as a hint about the *class* of connection, not as a measurement.
 *
 * The API is Chromium-only and has been removed from Firefox and Safari, so
 * "Not available" is the normal result on two of the three major engines.
 */

/** Firefox and legacy Chromium kept the old property names. */
interface LegacyConnection extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  downlinkMax?: number;
  rtt?: number;
  saveData?: boolean;
  type?: string;
}

function getConnection(): LegacyConnection | undefined {
  const nav = navigator as Navigator & {
    connection?: LegacyConnection;
    mozConnection?: LegacyConnection;
    webkitConnection?: LegacyConnection;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

/** Typed reader that turns "missing / wrong type" into "Not available". */
function pickString(value: unknown): string | typeof NOT_AVAILABLE {
  return typeof value === 'string' && value.length > 0 ? value : NOT_AVAILABLE;
}

function pickNumber(value: unknown): number | typeof NOT_AVAILABLE {
  return typeof value === 'number' && Number.isFinite(value) ? value : NOT_AVAILABLE;
}

function pickBoolean(value: unknown): string | typeof NOT_AVAILABLE {
  return typeof value === 'boolean' ? String(value) : NOT_AVAILABLE;
}

export async function collectNetwork(): Promise<NetworkSignals> {
  const connection = attemptSync<LegacyConnection | undefined>(
    'network',
    'navigator.connection',
    () => getConnection(),
    undefined,
  );

  return {
    // Rendered verbatim above the NETWORK section so it cannot be misread.
    source:
      'Browser-reported Network Information API values. These are estimates ' +
      'self-declared by the browser, not measurements taken by this page or by ' +
      'the server.',
    available: connection ? 'yes' : NOT_AVAILABLE,
    // Coarse link class: "slow-2g" | "2g" | "3g" | "4g".
    effectiveType: pickString(connection?.effectiveType),
    // Estimated downlink in Mbit/s, rounded to 0.025 steps.
    downlink: pickNumber(connection?.downlink),
    // Estimated maximum downlink for the connection type, when advertised.
    downlinkMax: pickNumber(connection?.downlinkMax),
    // Estimated effective round-trip time in milliseconds.
    rtt: pickNumber(connection?.rtt),
    // Whether the user asked for reduced data usage.
    saveData: pickBoolean(connection?.saveData),
    // Declared connection technology, e.g. "wifi", "cellular", "ethernet".
    type: pickString(connection?.type),
  };
}

/** Exposed so the UI can state plainly whether the API exists at all. */
export function hasNetworkInformation(): boolean {
  return has(getConnection(), 'effectiveType') || getConnection() !== undefined;
}