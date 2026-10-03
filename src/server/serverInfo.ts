import type { IncomingMessage } from 'node:http';
import type { ServerGeoInfo, ServerInfo, Signal } from '../shared/types.js';

/**
 * SECTION 16 - What the server naturally sees.
 *
 * Every value in this file is something any web server receives on every single
 * request, whether or not it is interested in fingerprinting. That is why this
 * block is kept visually and structurally separate from the browser-collected
 * signals: the browser cannot read any of it directly, and the server cannot see
 * any of the browser-side APIs.
 *
 * NOT COLLECTED, ON PURPOSE
 *   - The `Cookie` header is deliberately NOT captured. Cookies carry session
 *     identifiers, and there is no reason for a fingerprint collector to record them.
 *   - No cookies are set on any response, and no session state is kept.
 *   - There is no IP tracking, rate limiting or correlation. The IP is stored once,
 *     as part of the observation it arrived with, and is never used to look
 *     anything up or to link one observation to another.
 */

/** The exact label the UI must show for the IP row. */
export const IP_LABEL = 'IP address observed by the server';

const SERVER_NOTE =
  'This block is what the HTTP server received on the POST /api/collect request ' +
  'that carried the fingerprint. It describes the request, not the browser, and ' +
  'it is not part of clientFingerprintHash - which covers client-side signals ' +
  'only. The IP address is the address the connection came from, obtained from ' +
  'the socket (or from proxy headers only when TRUST_PROXY=1). The Cookie ' +
  'header is deliberately not captured.';

/** Where the client IP is taken from when running behind a proxy. */
export interface ServerInfoOptions {
  /**
   * Honour X-Forwarded-For / X-Real-IP.
   *
   * Off by default. When the server is bound to loopback (the default), no
   * untrusted client can set these headers, so they are safe to ignore; when it
   * is exposed to a network you must enable this deliberately, because a
   * client-supplied header is trivially spoofed.
   */
  trustProxy: boolean;
}

/** Strips the IPv4-mapped IPv6 prefix and the IPv6 zone/scope suffix. */
export function normaliseAddress(address: string | undefined | null): string {
  if (!address) return 'Not available';
  let value = address.trim();
  // Node reports IPv4 clients as "::ffff:127.0.0.1".
  if (value.toLowerCase().startsWith('::ffff:')) value = value.slice(7);
  // Drop any scope id such as "%eth0".
  const zoneIndex = value.indexOf('%');
  if (zoneIndex !== -1) value = value.slice(0, zoneIndex);
  return value === '' ? 'Not available' : value;
}

/** "IPv4", "IPv6" or "Not available". */
export function addressVersion(address: string | null): string {
  if (!address) return 'Not available';
  if (address.includes(':')) return 'IPv6';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) return 'IPv4';
  return 'Not available';
}

/** First hop of a comma-separated forwarding header list. */
function firstForwardedHop(value: string): string | null {
  const first = value.split(',')[0]?.trim() ?? '';
  return first === '' ? null : first;
}

/** Resolves the client address from the socket, or from proxy headers if trusted. */
export function resolveClientAddress(
  req: IncomingMessage,
  options: ServerInfoOptions,
): string {
  if (options.trustProxy) {
    const forwarded = firstForwardedHop(String(req.headers['x-forwarded-for'] ?? ''));
    if (forwarded) return normaliseAddress(forwarded);
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp !== '') return normaliseAddress(realIp);
  }
  return normaliseAddress(req.socket.remoteAddress);
}

/** Reads a header, mapping empty/missing values to the standard marker. */
function header(req: IncomingMessage, name: string): Signal {
  const value = req.headers[name];
  if (value === undefined) return 'Not available';
  if (Array.isArray(value)) return value.join(', ');
  return value === '' ? 'Not available' : value;
}

/** Builds the server-observed half of the report for one request. */
export function collectServerInfo(
  req: IncomingMessage,
  options: ServerInfoOptions,
): ServerInfo {
  const ip = resolveClientAddress(req, options);

  // Every header the server received, verbatim and in the order Node exposes
  // them. Cookies are stripped out.
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (name.toLowerCase() === 'cookie') continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : String(value);
  }

  return {
    ipLabel: IP_LABEL,
    ip,
    ipVersion: addressVersion(ip),
    // The UA string as it arrives over HTTP.
    userAgent: header(req, 'user-agent'),
    // Acceptable content types.
    accept: header(req, 'accept'),
    // Preferred content languages, sent on every navigation.
    acceptLanguage: header(req, 'accept-language'),
    // Compression the client accepts.
    acceptEncoding: header(req, 'accept-encoding'),
    // Where the user came from, when the page was reached by navigation.
    referer: header(req, 'referer'),
    // User-Agent Client Hints: brand list, mobile flag, platform.
    secChUa: header(req, 'sec-ch-ua'),
    secChUaMobile: header(req, 'sec-ch-ua-mobile'),
    secChUaPlatform: header(req, 'sec-ch-ua-platform'),
    secChUaPlatformVersion: header(req, 'sec-ch-ua-platform-version'),
    secChUaFullVersionList: header(req, 'sec-ch-ua-full-version-list'),
    headers,
    note: SERVER_NOTE,
  };
}

/** Label used by the geo block, per the spec. */
export const GEO_LABEL = 'Approximate location derived from IP address';

/** Explains what the geo block is and is not. */
export const GEO_NOTE =
  'This is an approximate network-level estimate produced by looking up the IP ' +
  'address in a geolocation database. It is NOT GPS: no location permission was ' +
  'requested, no device positioning API was called, and the answer can be wrong ' +
  'by hundreds of kilometres when the IP belongs to a VPN, a mobile carrier ' +
  'CGNAT pool, a corporate gateway or a residential proxy.';

/**
 * Maps an arbitrary provider payload onto the report shape.
 * Provider name is added by the caller.
 */
export function normaliseGeoPayload(payload: unknown): ServerGeoInfo {
  const source = (payload ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]): Signal => {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value !== '') return value;
      if (typeof value === 'number') return String(value);
    }
    return 'Not available';
  };

  return {
    country: pick('country', 'country_name', 'countryCode'),
    region: pick('region', 'region_name', 'regionCode', 'state'),
    city: pick('city', 'locality'),
    isp: pick('isp', 'org', 'organization', 'asn_org', 'connection', 'isp_name'),
    asn: pick('asn', 'autonomous_system', 'as', 'asn_number'),
    timezone: pick('timezone', 'time_zone', 'tz'),
  };
}