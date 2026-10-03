import type { PermissionState, PermissionsSignals } from '../../shared/types.js';

/**
 * SECTION 14 - Permission states (read-only).
 *
 * WHAT THIS IS
 * `navigator.permissions.query()` reports the *current state* of a permission
 * without triggering any prompt. It is a pure read: it tells you whether the
 * user already granted or denied something, it never asks them.
 *
 * IMPORTANT (requirement #14)
 * `requestPermission()` / `request()` is NEVER called in this project. There is
 * no permission-granting flow anywhere. If a permission is still undecided the
 * answer is "prompt", which means "a prompt would be shown if something asked"
 * - not that anything did.
 *
 * WHY IT IS FINGERPRINTABLE AT ALL
 * Permission state is persistent per-origin state, not a property of the device.
 * A user who has permanently denied notifications, or who has already granted
 * camera access to some site, carries that state into this one. In aggregate,
 * the set of granted/denied states is a meaningful behavioural signal.
 *
 * BROWSER SUPPORT
 * Support is uneven: Chrome supports `notifications`, `geolocation`,
 * `midi`, `camera`/`microphone` under different names or not at all; Firefox
 * supports `geolocation`, `notifications`, `camera`, `microphone`; Safari
 * supports only `notifications`. Anything the browser does not recognise throws
 * a TypeError from `query()`, which is reported as "unavailable".
 */

/** Permissions to inspect, in display order. */
export const PERMISSION_NAMES = [
  'geolocation',
  'camera',
  'microphone',
  'notifications',
] as const;

/**
 * Alternative descriptors used by browsers that gate camera/microphone behind a
 * Push/Permission name rather than a literal one. Tried in order and the first
 * one the browser accepts wins.
 */
const DESCRIPTOR_ALIASES: Record<string, Array<PermissionDescriptor>> = {
  geolocation: [{ name: 'geolocation' }],
  // Some browsers expose camera/microphone under their legacy names.
  camera: [{ name: 'camera' }, { name: 'video-capture' } as unknown as PermissionDescriptor],
  microphone: [
    { name: 'microphone' },
    { name: 'audio-capture' } as unknown as PermissionDescriptor,
  ],
  notifications: [{ name: 'notifications' }],
};

function isPermissionState(value: unknown): value is PermissionState {
  return value === 'granted' || value === 'denied' || value === 'prompt';
}

async function queryOne(name: string): Promise<PermissionState> {
  // No Permissions API at all.
  if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
    return 'unavailable';
  }

  const aliases = DESCRIPTOR_ALIASES[name] ?? [{ name }];
  let lastError: unknown = null;

  for (const descriptor of aliases) {
    try {
      const status = await navigator.permissions.query(descriptor);
      if (isPermissionState(status.state)) return status.state;
      lastError = new Error(`unexpected state "${String(status.state)}"`);
    } catch (error) {
      // A TypeError here just means "this browser does not know that name".
      lastError = error;
    }
  }

  // Distinguish "the browser refused to tell us" from "there is no such API".
  if (lastError instanceof TypeError) return 'unavailable';
  return 'unavailable';
}

export async function collectPermissions(): Promise<PermissionsSignals> {
  const results: PermissionsSignals = {};

  // Each permission is independent: one rejected query cannot affect the others.
  for (const name of PERMISSION_NAMES) {
    results[name] = await queryOne(name);
  }

  return results;
}

/** Explanatory text rendered under the PERMISSIONS section. */
export const PERMISSIONS_NOTE =
  'Permission state was READ with navigator.permissions.query(). Nothing was ' +
  'requested: requestPermission() is never called in this project, so no ' +
  'prompt was shown. "prompt" means a prompt WOULD be shown if something asked - ' +
  'nothing did. "unavailable" means the browser does not expose that permission ' +
  'name through the Permissions API at all.';