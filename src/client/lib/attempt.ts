import type { ScanDiagnostic, Signal, Unavailable } from '../../shared/types.js';

/** The single string used everywhere a signal could not be collected. */
export const NOT_AVAILABLE: Unavailable = 'Not available';

/**
 * Diagnostics recorded when an individual probe throws.
 *
 * The whole design goal of this file is requirement #20: one failing
 * fingerprint test must never break the entire scan, so every module funnels
 * its risky calls through {@link attempt}.
 */
const diagnostics: ScanDiagnostic[] = [];

export function getDiagnostics(): ScanDiagnostic[] {
  return diagnostics.slice();
}

export function clearDiagnostics(): void {
  diagnostics.length = 0;
}

export function recordDiagnostic(module: string, signal: string, reason: string): void {
  diagnostics.push({ module, signal, reason });
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Runs `fn` and returns `fallback` if anything at all goes wrong.
 * This is the error boundary for every fingerprint category.
 */
export async function attempt<T>(
  module: string,
  signal: string,
  fn: () => T | Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    recordDiagnostic(module, signal, describeError(error));
    return fallback;
  }
}

/** Synchronous variant of {@link attempt}. */
export function attemptSync<T>(
  module: string,
  signal: string,
  fn: () => T,
  fallback: T,
): T {
  try {
    return fn();
  } catch (error) {
    recordDiagnostic(module, signal, describeError(error));
    return fallback;
  }
}

/**
 * Reads a possibly-missing property and coerces `undefined` / `null` into the
 * canonical "Not available" marker so every report field is always printable.
 */
export function read<T = Signal>(
  module: string,
  signal: string,
  holder: unknown,
  key: string,
): T | Unavailable {
  return attemptSync<T | Unavailable>(
    module,
    signal,
    () => {
      if (holder === null || holder === undefined) return NOT_AVAILABLE;
      const value = (holder as Record<string, unknown>)[key];
      if (value === undefined || value === null) return NOT_AVAILABLE;
      return value as T;
    },
    NOT_AVAILABLE,
  );
}

/** Feature detection helper: is the value a callable/usable object? */
export function has(target: unknown, key: string): boolean {
  return attemptSync('featureDetect', key, () => {
    if (target === null || target === undefined) return false;
    const value = (target as Record<string, unknown>)[key];
    return typeof value !== 'undefined' && value !== null;
  }, false);
}

/** Safe `typeof` that never throws (some host objects have throwing getters). */
export function typeOf(value: unknown): string {
  return attemptSync('featureDetect', 'typeof', () => typeof value, 'undefined');
}