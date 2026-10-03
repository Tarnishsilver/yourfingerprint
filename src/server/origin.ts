import type { IncomingMessage } from 'node:http';

/**
 * Cross-origin guard for the collect endpoint.
 *
 * Why this exists: without it, any page on the internet could `fetch()` this
 * endpoint from a visitor's browser and the server would store that visitor's IP
 * and request headers. Neither the page's author nor the visitor intends that,
 * so the request is refused.
 *
 * How it works:
 *   - A browser sets `Origin` on cross-origin POSTs (and always sets
 *     `Sec-Fetch-Site` on modern browsers). Both are checked.
 *   - A non-browser client (curl, a script, mongosh, a server-side test) sends no
 *     `Origin`, so local tooling and scripted posts are unaffected.
 *   - On Vercel the page and the function share a domain, so a genuine
 *     same-origin request from your own deployment still passes.
 */
export function isCrossOriginSubmission(req: IncomingMessage, allowCrossOrigin: boolean): boolean {
  if (allowCrossOrigin) return false;

  const fetchSite = req.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string' && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return true;
  }

  const origin = req.headers.origin;
  if (typeof origin !== 'string' || origin === '') return false;

  const host = req.headers.host;
  if (typeof host !== 'string' || host === '') return true;

  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Whether forwarded headers should be trusted for the client IP.
 *
 * On Vercel this must be on: the function does not hold the client socket, it
 * receives the request through Vercel's proxy, and Vercel reports the real client
 * IP in `X-Forwarded-For` / `X-Real-IP` (which it overwrites rather than passing
 * through from the client). `req.socket.remoteAddress` on Vercel is an internal
 * address, so trusting nothing would store Vercel's IP instead of the visitor's.
 *
 * Elsewhere, keep it off unless you are behind a proxy you control - a
 * client-supplied header is trivially spoofed.
 */
export function shouldTrustProxy(env: NodeJS.ProcessEnv): boolean {
  if (env.TRUST_PROXY === '1') return true;
  // Vercel strips any inbound X-Forwarded-For and sets its own.
  return env.VERCEL === '1' || env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
}