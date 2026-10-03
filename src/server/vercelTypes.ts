import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Minimal structural types for the Vercel serverless function signature.
 *
 * WHY NOT `import type { VercelRequest, VercelResponse } from '@vercel/node'`?
 * That package exists to run the Vercel *build toolchain* (esbuild, undici,
 * ts-morph, path-to-regexp, ajv) and it drags in a long tail of transitive
 * advisories for what is only two type aliases. At deploy time Vercel uses its
 * own builder anyway, so installing it locally buys nothing and costs a large
 * `node_modules` plus `npm audit` noise.
 *
 * These declarations are structurally compatible with the real ones: a Vercel
 * function receives an `IncomingMessage`-shaped request (with `body` already
 * parsed for JSON content types) and returns an `http.ServerResponse`-shaped
 * object with the `status().json()` helpers added by the platform.
 */
export interface VercelRequest extends IncomingMessage {
  /**
   * The parsed request body. Vercel parses `application/json` before the
   * function runs, so this is normally already an object and the raw stream
   * must NOT be read.
   */
  body?: unknown;
  /** Parsed query string. */
  query: Record<string, string | string[] | undefined>;
}

export interface VercelResponse extends ServerResponse {
  /** Sets the status code and returns `this` for chaining. */
  status(code: number): VercelResponse;
  /** Sends a JSON response. */
  json(payload: unknown): void;
  /** Sends an arbitrary response body. */
  send(body?: unknown): void;
}