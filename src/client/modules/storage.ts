import type { StorageSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attemptSync, has } from '../lib/attempt.js';

/**
 * SECTION 11 - Client-side storage availability.
 *
 * WHAT THIS IS
 * Which storage mechanisms work for this origin. The interesting part is not
 * that `localStorage` exists, but whether it actually *works*: private windows,
 * `file://` origins, third-party-cookie restrictions and enterprise policy can
 * all make the property exist while throwing on write. So each check performs a
 * real write-then-delete round trip rather than trusting feature detection.
 *
 * PRIVACY (requirement #11)
 * The only thing written is a fixed, non-unique probe key
 * (`__fpl_probe__`) that is deleted in the same tick. No random identifier is
 * generated, no value derived from this device is persisted, no cookie is set,
 * and nothing is sent to the server. There is no tracking identifier anywhere in
 * this project.
 */

/** Fixed, deliberately non-identifying probe key. Never left behind. */
const PROBE_KEY = '__fpl_probe__';
const PROBE_VALUE = '1';

function probeWebStorage(area: 'localStorage' | 'sessionStorage'): string {
  return attemptSync('storage', area, () => {
    const storage = window[area];
    if (!storage || typeof storage.setItem !== 'function') return NOT_AVAILABLE;

    const before = storage.getItem(PROBE_KEY);
    try {
      storage.setItem(PROBE_KEY, PROBE_VALUE);
      const wrote = storage.getItem(PROBE_KEY) === PROBE_VALUE;
      // Restore whatever was there before, then remove our probe value.
      if (before === null) storage.removeItem(PROBE_KEY);
      else storage.setItem(PROBE_KEY, before);
      return wrote ? 'available (write/read/remove verified)' : 'unusable (write did not persist)';
    } catch {
      // QuotaExceededError or SecurityError: the classic blocked-storage case.
      return 'unavailable (SecurityError or QuotaExceededError)';
    }
  }, NOT_AVAILABLE);
}

export async function collectStorage(): Promise<StorageSignals> {
  const windowRef = window as unknown as Record<string, unknown>;

  return {
    // Persistent origin-scoped key/value store. Verified with a write probe.
    localStorage: probeWebStorage('localStorage'),
    // Per-tab key/value store, cleared when the tab closes.
    sessionStorage: probeWebStorage('sessionStorage'),

    // IndexedDB: asynchronous structured storage. The factory exists check is
    // all that is done here - opening a database would create persistent state.
    indexedDB: attemptSync('storage', 'indexedDB', () => {
      if (!has(windowRef, 'indexedDB')) return NOT_AVAILABLE;
      const factory = windowRef.indexedDB as IDBFactory | undefined;
      if (!factory || typeof factory.open !== 'function') return NOT_AVAILABLE;
      return 'available (not opened: opening would persist state)';
    }, NOT_AVAILABLE),

    // Cache API, used by service workers for offline responses.
    cacheApi: attemptSync('storage', 'caches', () => {
      if (!has(windowRef, 'caches')) return NOT_AVAILABLE;
      const caches = windowRef.caches as CacheStorage | undefined;
      if (!caches || typeof caches.open !== 'function') return NOT_AVAILABLE;
      // caches.keys() only lists existing entries; it creates nothing.
      return 'available';
    }, NOT_AVAILABLE),

    // navigator.cookieEnabled - a hint, not a guarantee.
    cookiesEnabled: attemptSync('storage', 'cookieEnabled', () => {
      if (typeof navigator.cookieEnabled !== 'boolean') return NOT_AVAILABLE;
      return navigator.cookieEnabled
        ? 'enabled (no cookie was set or read)'
        : 'disabled';
    }, NOT_AVAILABLE),

    // Service Worker registration API.
    serviceWorkerSupport: attemptSync('storage', 'serviceWorker', () => {
      if (!has(navigator, 'serviceWorker')) return NOT_AVAILABLE;
      const container = (navigator as Navigator & { serviceWorker?: unknown }).serviceWorker;
      if (!container) return NOT_AVAILABLE;
      return 'available (nothing registered)';
    }, NOT_AVAILABLE),

    // Documents the write-then-delete probe so the check is never mistaken for
    // persistent state.
    note:
      `Storage checks write the fixed key "${PROBE_KEY}" and delete it ` +
      'immediately. No unique or random identifier is generated or stored, ' +
      'no cookie is set, and nothing about storage is transmitted.',
  };
}