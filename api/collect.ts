import type { VercelRequest, VercelResponse } from '../src/server/vercelTypes.js';
import type { CollectErrorResponse, CollectPayload, CollectResponse } from '../src/shared/collect.js';
import {
  closeDatabase,
  databaseConfigFromEnv,
  insertObservation,
  type FingerprintDocument,
} from '../src/server/db.js';
import { geoOptionsFromEnv, lookupGeo } from '../src/server/geoip.js';
import { isCrossOriginSubmission, shouldTrustProxy } from '../src/server/origin.js';
import { collectServerInfo } from '../src/server/serverInfo.js';

/**
 * POST /api/collect - Vercel serverless function.
 *
 * Identical behaviour to the local `src/server/index.ts` handler, adapted to the
 * serverless request/response shape. The signal collection is unchanged: the
 * browser still posts the same payload to the same path.
 *
 * Serverless differences that matter here:
 *   1. NO HOST / PORT. Vercel assigns the listen address. The `HOST` and `PORT`
 *      variables in your `.env` are ignored on this platform and are only used
 *      by `npm start` locally.
 *   2. `req.socket.remoteAddress` is NOT the client. The function runs behind
 *      Vercel's proxy, so the real client IP must come from `X-Forwarded-For` /
 *      `X-Real-IP`. `shouldTrustProxy()` turns that on automatically when
 *      `VERCEL=1`, so you do not need to set TRUST_PROXY.
 *   3. The request body is already parsed by the platform into `req.body`.
 *   4. The MongoDB connection is cached on `globalThis` so warm invocations
 *      reuse it instead of exhausting the connection pool.
 */

/** Hard cap on the request body. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Reads the JSON payload.
 *
 * Vercel parses `application/json` bodies into `req.body` before the function
 * runs. The raw-stream path is only reached if that did not happen (for example
 * a missing Content-Type), because reading an already-consumed stream hangs.
 */
async function readPayload(req: VercelRequest): Promise<unknown> {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(buffer);
  }
  if (size === 0) throw new Error('empty request body');
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Structural check: enough shape to be worth inserting. */
function isValidPayload(value: unknown): value is CollectPayload {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<CollectPayload>;
  return (
    typeof candidate.clientFingerprintHash === 'string' &&
    candidate.clientFingerprintHash.length === 64 &&
    candidate.fingerprint !== null &&
    typeof candidate.fingerprint === 'object'
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const sendJson = (status: number, body: unknown): void => {
    // Disable the platform CDN cache: this response is per-request data.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(status).json(body);
  };

  const dbConfig = databaseConfigFromEnv(process.env);

  try {
    if (req.method !== 'POST') {
      sendJson(405, { status: 'error', reason: 'use POST' } satisfies CollectErrorResponse);
      return;
    }

    if (!dbConfig) {
      sendJson(503, {
        status: 'error',
        reason:
          'MONGODB_URI is not configured. Set it in the Vercel project environment ' +
          'variables (Settings > Environment Variables).',
      } satisfies CollectErrorResponse);
      return;
    }

    const allowCrossOrigin = process.env.ALLOW_CROSS_ORIGIN === '1';
    if (isCrossOriginSubmission(req, allowCrossOrigin)) {
      sendJson(403, {
        status: 'error',
        reason: 'cross-origin submissions are refused. Set ALLOW_CROSS_ORIGIN=1 to allow.',
      } satisfies CollectErrorResponse);
      return;
    }

    let payload: unknown;
    try {
      payload = await readPayload(req);
    } catch (error) {
      sendJson(400, {
        status: 'error',
        reason: error instanceof Error ? error.message : String(error),
      } satisfies CollectErrorResponse);
      return;
    }

    if (!isValidPayload(payload)) {
      sendJson(400, {
        status: 'error',
        reason:
          'payload must contain a 64-character clientFingerprintHash and a fingerprint object',
      } satisfies CollectErrorResponse);
      return;
    }

    // What the server observed on THIS request - the one carrying the data.
    const serverObserved = collectServerInfo(req, { trustProxy: shouldTrustProxy(process.env) });

    const document: FingerprintDocument = {
      storedAt: new Date(),
      clientGeneratedAt:
        typeof payload.clientGeneratedAt === 'string' ? payload.clientGeneratedAt : '',
      clientFingerprintHash: payload.clientFingerprintHash,
      fingerprint: payload.fingerprint as FingerprintDocument['fingerprint'],
      server: { ...serverObserved },
      diagnostics: Array.isArray(payload.diagnostics) ? payload.diagnostics : [],
      source: {
        tool: 'browser-fingerprint-lab',
        userAgent: typeof serverObserved.userAgent === 'string' ? serverObserved.userAgent : '',
      },
    };

    // Geo is attached only when a provider is configured; otherwise the key is
    // absent entirely.
    const geo = await lookupGeo(String(serverObserved.ip), geoOptionsFromEnv(process.env));
    if (geo) document.geo = geo;

    const id = await insertObservation(dbConfig, document);

    sendJson(201, {
      status: 'stored',
      id,
      storedAt: document.storedAt.toISOString(),
      location: `${dbConfig.database}.${dbConfig.collection}`,
    } satisfies CollectResponse);
  } catch (error) {
    sendJson(503, {
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    } satisfies CollectErrorResponse);
  }
}

/**
 * Serverless guidance: reuse the cached connection on container teardown rather
 * than leaving a socket dangling.
 */
export const config = { maxDuration: 30 };

process.on('beforeExit', () => {
  void closeDatabase();
});