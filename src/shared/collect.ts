import type { FingerprintReport, ScanDiagnostic, ServerInfo } from '../shared/types.js';

/**
 * Payload sent by the browser to POST /api/collect.
 *
 * This is the complete client-side half of a collection: the 16-key
 * fingerprint object plus its hash and run metadata. The server adds the half
 * only it can see (IP, request headers) on the way into the database.
 */
export interface CollectPayload {
  /** The 16-key client signal object. */
  fingerprint: FingerprintReport;
  /** SHA-256 of canonicalJSON(fingerprint), computed client-side. */
  clientFingerprintHash: string;
  /** When the browser finished collecting. */
  clientGeneratedAt: string;
  /** Whether high-entropy client hints were requested. */
  highEntropyRequested: boolean;
  /** Individual probes that failed and degraded to "Not available". */
  diagnostics: ScanDiagnostic[];
}

/** What POST /api/collect returns. */
export interface CollectResponse {
  /** "stored" once the document is committed to MongoDB. */
  status: 'stored';
  /** Inserted document id as a string. */
  id: string;
  /** Server-side timestamp. */
  storedAt: string;
  /** MongoDB database and collection the document went to. */
  location: string;
}

/** Returned when the write did not happen, so the client can log it. */
export interface CollectErrorResponse {
  status: 'error';
  reason: string;
}

/** Connection state of the database, exposed for diagnostics. */
export type DatabaseState =
  | 'not configured'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'disconnected';

/** Optional per-document geo block, reused from the geoip module. */
export type GeoBlock = NonNullable<ServerInfo['geo']>;