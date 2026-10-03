import type { VercelRequest, VercelResponse } from '../src/server/vercelTypes.js';
import { databaseConfigFromEnv, getLastError, getState } from '../src/server/db.js';
import { geoOptionsFromEnv } from '../src/server/geoip.js';
import { shouldTrustProxy } from '../src/server/origin.js';

/**
 * GET /api/health - Vercel serverless function.
 *
 * Reports whether MONGODB_URI is actually visible to the function. This is the
 * first thing to check when a deployment returns 503: environment variables set
 * in a different Vercel environment (Preview vs Production) are not visible here.
 */
export default function handler(_req: VercelRequest, res: VercelResponse): void {
  const dbConfig = databaseConfigFromEnv(process.env);

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    database: {
      configured: dbConfig !== null,
      state: getState(),
      location: dbConfig ? `${dbConfig.database}.${dbConfig.collection}` : null,
      lastError: getLastError(),
    },
    geo: geoOptionsFromEnv(process.env).endpoint ?? 'not configured',
    crossOriginAllowed: process.env.ALLOW_CROSS_ORIGIN === '1',
    trustProxy: shouldTrustProxy(process.env),
    // Which Vercel environment this function is running in.
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}