import type { CollectErrorResponse, CollectPayload, CollectResponse } from '../shared/collect.js';
import { canonicalJSON } from './lib/normalize.js';
import { sha256Text } from './lib/sha256.js';
import { collectDiagnostics, collectFingerprint } from './modules/index.js';

/**
 * Browser Fingerprint Lab - client entry point.
 *
 * There is no UI. This module runs the moment the blank page loads:
 *
 *   1. Collect every client-side signal (15 modules, each independently
 *      error-isolated so one failure cannot abort the scan).
 *   2. Hash the canonicalised fingerprint object with SHA-256.
 *   3. POST the result to the same-origin /api/collect endpoint, where the
 *      server appends what it observed (IP address, request headers) and writes
 *      one document to MongoDB.
 *
 * Still never done anywhere in this file: getUserMedia, getCurrentPosition,
 * Notification.requestPermission, permissions.request, RTCPeerConnection.
 */

const COLLECT_ENDPOINT = '/api/collect';

/**
 * Whether to ask for high-entropy User-Agent Client Hints.
 *
 * Set to false to keep the scan on low-entropy hints only. Note the trade-off:
 * requesting them makes the browser add Sec-CH-UA-Model / Sec-CH-UA-Arch /
 * Sec-CH-UA-Bitness headers to the POST below, and `model` can name the exact
 * device. Overridable at build time via the globalThis constant below.
 */
const REQUEST_HIGH_ENTROPY_HINTS = true;

async function buildPayload(): Promise<CollectPayload> {
  const { report } = await collectFingerprint({
    includeHighEntropy: REQUEST_HIGH_ENTROPY_HINTS,
  });

  // canonicalJSON recursively sorts every key, so the digest depends only on
  // signal values and never on the order the modules built their objects in.
  const clientFingerprintHash = await sha256Text(canonicalJSON(report));

  return {
    fingerprint: report,
    clientFingerprintHash,
    clientGeneratedAt: new Date().toISOString(),
    highEntropyRequested: report.userAgentData.highEntropyRequested === true,
    diagnostics: collectDiagnostics(),
  };
}

async function send(payload: CollectPayload): Promise<CollectResponse> {
  const response = await fetch(COLLECT_ENDPOINT, {
    method: 'POST',
    cache: 'no-store',
    // No cookies are needed or wanted: the server reads the IP from the socket.
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text === '' ? null : JSON.parse(text);
  } catch {
    throw new Error(`server returned a non-JSON response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    const reason =
      parsed !== null && typeof parsed === 'object' && 'reason' in parsed
        ? String((parsed as CollectErrorResponse).reason)
        : `HTTP ${response.status}`;
    throw new Error(reason);
  }

  return parsed as CollectResponse;
}

/**
 * Runs the scan and stores it. Exported so it can be awaited from tests or
 * re-invoked from the console without reloading the page.
 */
export async function runScanAndStore(): Promise<CollectResponse> {
  const started = performance.now();
  const payload = await buildPayload();

  const result = await send(payload);

  console.info(
    `[fingerprint-lab] stored ${result.id} in ${result.location} ` +
      `(${(performance.now() - started).toFixed(0)} ms, hash ${payload.clientFingerprintHash})`,
  );
  if (payload.diagnostics.length > 0) {
    console.warn(
      `[fingerprint-lab] ${payload.diagnostics.length} probe(s) degraded to "Not available":`,
      payload.diagnostics,
    );
  }

  return result;
}

// Auto-run on load. This is the entire client application.
try {
  void runScanAndStore().catch((error: unknown) => {
    console.error('[fingerprint-lab] scan failed:', error instanceof Error ? error.message : error);
  });
} catch (error) {
  console.error('[fingerprint-lab] could not start the scan:', error);
}