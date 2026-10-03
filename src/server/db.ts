import { MongoClient, type Collection, type Document } from 'mongodb';
import type { DatabaseState, GeoBlock } from '../shared/collect.js';

/**
 * MongoDB persistence.
 *
 * WHAT THIS IS FOR
 * One document per fingerprint run, appended to a single collection. That is the
 * whole storage model: a flat, append-only log of observations. There is no user
 * table, no session table, no cross-run lookup and no derived data.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *   - No deduplication. Documents are inserted as they arrive; two identical runs
 *     produce two documents.
 *   - No fingerprint comparison. Nothing ever reads back a previously stored
 *     fingerprint and compares it to a new one.
 *   - No uniqueness, similarity or entropy scoring.
 *   - No updates or deletes. The collection is append-only by convention.
 *   - No raw request logging beyond the fields stored on the document itself.
 *
 * The only index created is on `storedAt`, which exists so you can slice the log
 * by time while debugging. It is a time index, not a fingerprint index: nothing in
 * the application queries by hash.
 */

/** One stored observation. */
export interface FingerprintDocument extends Document {
  /** Server-side insert time. */
  storedAt: Date;
  /** Browser-reported collection time. */
  clientGeneratedAt: string;
  /** SHA-256 of the canonicalised client fingerprint object. */
  clientFingerprintHash: string;
  /** The 16-key client signal object, verbatim. */
  fingerprint: Document;
  /** What the server observed on the POST that carried this data. */
  server: Document;
  /** Present only when GEOIP_ENDPOINT is configured. */
  geo?: GeoBlock;
  /** Probes that failed and degraded to "Not available". */
  diagnostics: Document[];
  /** Tool identifier and version. */
  source: {
    tool: string;
    userAgent: string;
  };
}

export interface DatabaseConfig {
  uri: string;
  database: string;
  collection: string;
  /** Fail fast at startup instead of retrying on the first request. */
  connectTimeoutMs: number;
}

let state: DatabaseState = 'not configured';
let lastError: string | null = null;
let connecting: Promise<Collection<Document>> | null = null;

/**
 * Serverless note (Vercel / Lambda).
 *
 * The connection is pinned to `globalThis` rather than to a module-level `let`.
 * Module state already survives between warm invocations, but pinning to the
 * global guarantees the connection is reused even when the module registry is
 * re-entered. Without it, every cold invocation opens a new MongoDB connection
 * and quickly exhausts the server's connection limit.
 */
interface ConnectionCache {
  client: MongoClient | null;
  collection: Collection<Document> | null;
}

const globalCache = globalThis as typeof globalThis & {
  __fplMongo?: ConnectionCache;
};
const cache: ConnectionCache = (globalCache.__fplMongo ??= { client: null, collection: null });

/** Builds the config from the environment, or null when unconfigured. */
export function databaseConfigFromEnv(env: NodeJS.ProcessEnv): DatabaseConfig | null {
  const uri = env.MONGODB_URI?.trim();
  if (!uri) return null;

  return {
    uri,
    database: env.MONGODB_DATABASE?.trim() || 'fingerprint_lab',
    collection: env.MONGODB_COLLECTION?.trim() || 'observations',
    connectTimeoutMs: Number.parseInt(env.MONGODB_TIMEOUT_MS ?? '5000', 10),
  };
}

export function getState(): DatabaseState {
  return state;
}

export function getLastError(): string | null {
  return lastError;
}

/**
 * Opens the connection if it is not already open.
 * Concurrent callers share one in-flight attempt; a failed attempt is not cached,
 * so the next request retries rather than being permanently poisoned.
 */
export async function getCollection(
  config: DatabaseConfig,
): Promise<Collection<Document>> {
  if (cache.collection && cache.client) return cache.collection;
  if (connecting) return connecting;

  state = 'connecting';

  connecting = (async () => {
    const created = new MongoClient(config.uri, {
      serverSelectionTimeoutMS: config.connectTimeoutMs,
      connectTimeoutMS: config.connectTimeoutMs,
      // Keep the pool small: a serverless instance handles one request at a
      // time, and a large pool just exhausts the server's connection limit.
      maxPoolSize: 5,
      minPoolSize: 0,
    });
    await created.connect();
    const db = created.db(config.database);
    const target = db.collection(config.collection);

    // Time index for slicing the log while debugging. No fingerprint index.
    await target.createIndex({ storedAt: -1 }, { name: 'storedAt_desc' });

    cache.client = created;
    cache.collection = target;
    state = 'connected';
    lastError = null;
    return target;
  })();

  try {
    return await connecting;
  } catch (error) {
    state = 'error';
    lastError = error instanceof Error ? error.message : String(error);
    cache.client = null;
    cache.collection = null;
    throw error;
  } finally {
    connecting = null;
  }
}

/** Inserts one observation. No dedup, no comparison, no update. */
export async function insertObservation(
  config: DatabaseConfig,
  document: FingerprintDocument,
): Promise<string> {
  const target = await getCollection(config);
  const result = await target.insertOne(document as Document);
  return String(result.insertedId);
}

/** Closes the connection on shutdown. */
export async function closeDatabase(): Promise<void> {
  if (cache.client) {
    await cache.client.close().catch(() => undefined);
  }
  cache.client = null;
  cache.collection = null;
  state = 'disconnected';
}