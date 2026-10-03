import type { ServerInfo } from '../shared/types.js';
import { GEO_LABEL, GEO_NOTE, normaliseGeoPayload } from './serverInfo.js';

/**
 * SECTION 17 - Optional IP geolocation.
 *
 * NOTHING HAPPENS UNLESS YOU CONFIGURE IT.
 * With no `GEOIP_ENDPOINT` set (the default) this module returns `null` and the
 * geolocation section is omitted entirely. There is no built-in provider, no
 * bundled database and no third-party call, so running this project out of the
 * box never sends your IP address anywhere.
 *
 * TO ENABLE IT
 * Point `GEOIP_ENDPOINT` at an HTTP service that answers with a JSON object
 * containing any of: country, region, city, isp/org, asn, timezone. The IP is
 * appended as the `ip` query parameter.
 *
 *   GEOIP_ENDPOINT="http://127.0.0.1:54321/ip/geo.json" npm start
 *
 * That endpoint is called once per page load, from the server, with the
 * visitor's IP - so only ever point it at a service you control or trust.
 *
 * THIS IS NOT GPS
 * The answer is a network-level approximation for the address the request came
 * from. No browser permission is requested and no positioning API is called.
 */

export interface GeoOptions {
  /** Base URL of the provider. When absent, the section is omitted. */
  endpoint?: string;
  /** Provider name shown in the UI. */
  provider?: string;
  /** Hard timeout in milliseconds. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2000;

/** Returns the geo block, or null when no provider is configured or it failed. */
export async function lookupGeo(
  ipAddress: string,
  options: GeoOptions,
): Promise<ServerInfo['geo'] | null> {
  const endpoint = options.endpoint?.trim();
  if (!endpoint) return null;
  if (!ipAddress || ipAddress === 'Not available') return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const url = new URL(endpoint);
    url.searchParams.set('ip', ipAddress);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;

    const payload: unknown = await response.json();
    return {
      label: GEO_LABEL,
      note: GEO_NOTE,
      provider: options.provider ?? new URL(endpoint).host,
      ...normaliseGeoPayload(payload),
    };
  } catch {
    // A geo lookup failure must never break the report, so it is simply omitted.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Reads the geo configuration out of the environment. */
export function geoOptionsFromEnv(env: NodeJS.ProcessEnv): GeoOptions {
  return {
    ...(env.GEOIP_ENDPOINT ? { endpoint: env.GEOIP_ENDPOINT } : {}),
    ...(env.GEOIP_PROVIDER ? { provider: env.GEOIP_PROVIDER } : {}),
    ...(env.GEOIP_TIMEOUT_MS
      ? { timeoutMs: Number.parseInt(env.GEOIP_TIMEOUT_MS, 10) }
      : {}),
  };
}