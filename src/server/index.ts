import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CollectErrorResponse, CollectPayload, CollectResponse } from '../shared/collect.js';
import {
  closeDatabase,
  databaseConfigFromEnv,
  getLastError,
  getState,
  insertObservation,
  type FingerprintDocument,
} from './db.js';
import { geoOptionsFromEnv, lookupGeo, type GeoOptions } from './geoip.js';
import { collectServerInfo, type ServerInfoOptions } from './serverInfo.js';

/**
 * Browser Fingerprint Lab - collector server.
 *
 * ENDPOINTS
 *   GET  /                Blank page. The scan runs automatically in the browser
 *                         on load and POSTs the result to /api/collect.
 *   POST /api/collect     Stores one fingerprint observation in MongoDB.
 *   GET  /api/health      Connection state, for debugging only.
 *
 * STORAGE MODEL
 * One document per run, appended to a single collection. Append-only. No user
 * table, no sessions, no derived data, no reads-back-for-comparison, no dedup,
 * no uniqueness or similarity scoring.
 *
 * EXPOSURE
 * Binds to 127.0.0.1 by default, so nothing outside this machine can reach it.
 * POST /api/collect additionally refuses cross-origin browser submissions unless
 * ALLOW_CROSS_ORIGIN=1, so this endpoint cannot be turned into a third-party
 * page's silent collection beacon by accident.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
// dist/server/ -> project root -> public/
const PUBLIC_ROOT = resolve(HERE, '..', '..', 'public');

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);

const serverInfoOptions: ServerInfoOptions = {
  trustProxy: process.env.TRUST_PROXY === '1',
};

const geoOptions: GeoOptions = geoOptionsFromEnv(process.env);
const dbConfig = databaseConfigFromEnv(process.env);
const allowCrossOrigin = process.env.ALLOW_CROSS_ORIGIN === '1';

/** Hard cap on the request body, so a malformed client cannot exhaust memory. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(body, null, 2));
}

function sendText(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(message);
}

/** Serves one static file, refusing anything that escapes PUBLIC_ROOT. */
async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  urlPath: string,
): Promise<void> {
  // `normalize` collapses any "../" segments before the prefix check.
  const relative = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  let filePath = resolve(PUBLIC_ROOT, relative);

  if (filePath !== PUBLIC_ROOT && !filePath.startsWith(PUBLIC_ROOT + sep)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const stats = await stat(filePath);
    if (stats.isDirectory()) filePath = join(filePath, 'index.html');
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) throw new Error('not a file');

    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': fileStats.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

/** Reads a JSON request body with a hard size limit. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
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

/**
 * Rejects browser submissions initiated by another origin.
 *
 * Without this, any page on the internet could POST to this endpoint from a
 * visitor's browser and have the server record their IP, headers and the signals
 * the page manages to collect. A non-browser client (curl, a script, this very
 * page served from here) sends no Origin header and is unaffected.
 */
function isCrossOriginSubmission(req: IncomingMessage): boolean {
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

async function handleCollect(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!dbConfig) {
    sendJson(res, 503, {
      status: 'error',
      reason: 'MONGODB_URI is not configured. Set it in .env and restart the server.',
    } satisfies CollectErrorResponse);
    return;
  }

  if (isCrossOriginSubmission(req)) {
    sendJson(res, 403, {
      status: 'error',
      reason: 'cross-origin submissions are refused. Set ALLOW_CROSS_ORIGIN=1 to allow.',
    } satisfies CollectErrorResponse);
    return;
  }

  let payload: unknown;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    } satisfies CollectErrorResponse);
    return;
  }

  if (!isValidPayload(payload)) {
    sendJson(res, 400, {
      status: 'error',
      reason: 'payload must contain a 64-character clientFingerprintHash and a fingerprint object',
    } satisfies CollectErrorResponse);
    return;
  }

  // What the server observed on THIS request - the one that carried the data.
  const serverObserved = collectServerInfo(req, serverInfoOptions);

  const document: FingerprintDocument = {
    storedAt: new Date(),
    clientGeneratedAt: typeof payload.clientGeneratedAt === 'string' ? payload.clientGeneratedAt : '',
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
  const geo = await lookupGeo(String(serverObserved.ip), geoOptions);
  if (geo) document.geo = geo;

  try {
    const id = await insertObservation(dbConfig, document);
    sendJson(res, 201, {
      status: 'stored',
      id,
      storedAt: document.storedAt.toISOString(),
      location: `${dbConfig.database}.${dbConfig.collection}`,
    } satisfies CollectResponse);
  } catch (error) {
    sendJson(res, 503, {
      status: 'error',
      reason: `MongoDB write failed: ${error instanceof Error ? error.message : String(error)}`,
    } satisfies CollectErrorResponse);
  }
}

const server = createServer((req, res) => {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/collect') {
    if (method !== 'POST') {
      sendJson(res, 405, { status: 'error', reason: 'use POST' } satisfies CollectErrorResponse);
      return;
    }
    void handleCollect(req, res).catch(() => {
      if (!res.headersSent) sendText(res, 500, 'Internal server error');
      else res.end();
    });
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(res, 200, {
      database: {
        configured: dbConfig !== null,
        state: getState(),
        location: dbConfig ? `${dbConfig.database}.${dbConfig.collection}` : null,
        lastError: getLastError(),
      },
      geo: geoOptions.endpoint ?? 'not configured',
      crossOriginAllowed: allowCrossOrigin,
    });
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return;
  }

  const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  void serveStatic(req, res, filePath);
});

server.listen(PORT, HOST, () => {
  const lines = [
    '',
    '  Browser Fingerprint Lab - collector',
    '  -----------------------------------',
    `  URL            http://${HOST}:${PORT}/`,
    `  Public folder  ${PUBLIC_ROOT}`,
    `  Collect        POST http://${HOST}:${PORT}/api/collect`,
    `  Health         GET  http://${HOST}:${PORT}/api/health`,
    `  Database       ${
      dbConfig
        ? `${dbConfig.database}.${dbConfig.collection}`
        : 'NOT CONFIGURED - set MONGODB_URI in .env'
    }`,
    `  Trust proxy    ${serverInfoOptions.trustProxy ? 'yes' : 'no'}`,
    `  IP geolocation ${geoOptions.endpoint ?? 'not configured'}`,
    `  Cross-origin   ${allowCrossOrigin ? 'ALLOWED' : 'refused'}`,
    '',
    '  One document per scan, appended to one collection. No dedup, no',
    '  comparison of stored fingerprints, no uniqueness or similarity scoring.',
    '  Press Ctrl+C to stop.',
    '',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);

  // Fail fast on a bad connection string so the problem is visible immediately,
  // rather than on the first scan.
  if (dbConfig) {
    void import('./db.js')
      .then((module) => module.getCollection(dbConfig))
      .then(() => process.stdout.write(`  MongoDB connected.\n\n`))
      .catch((error: unknown) => {
        process.stdout.write(
          `  MongoDB NOT reachable yet: ${
            error instanceof Error ? error.message : String(error)
          }\n  Retries will happen on each scan.\n\n`,
        );
      });
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void closeDatabase().finally(() => process.exit(0));
    });
  });
}