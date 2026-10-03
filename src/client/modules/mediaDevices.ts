import type { MediaDevicesSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attempt } from '../lib/attempt.js';

/**
 * SECTION 9 - Media devices, without asking for anything.
 *
 * WHAT THIS IS
 * `navigator.mediaDevices.enumerateDevices()` is permissionless *to call*, but
 * heavily permission-gated *in what it returns*:
 *
 *   - BEFORE any media permission has ever been granted for this origin, every
 *     entry has `deviceId === ''` and `label === ''`. You get counts and kinds,
 *     nothing more.
 *   - Only once camera or microphone permission has been granted elsewhere does
 *     the browser start returning real labels and device ids.
 *
 * That asymmetry is itself a fingerprint: "this origin has never asked for the
 * microphone" is a genuinely differentiating bit of state.
 *
 * PRIVACY (requirement #9)
 * - `getUserMedia()` is never called.
 * - No camera or microphone is opened, activated or signalled.
 * - `enumerateDevices()` does not show any UI and does not start any hardware.
 *
 * This module also deliberately does NOT probe for WebRTC candidates, because
 * that is the classic IP-leak technique and it is out of scope for this project.
 */
export async function collectMediaDevices(): Promise<MediaDevicesSignals> {
  const fallback: MediaDevicesSignals = {
    available: false,
    enumerated: false,
    deviceCount: 0,
    devices: [],
    countsByKind: {},
    note: 'navigator.mediaDevices is not available in this browser.',
  };

  return attempt<MediaDevicesSignals>('mediaDevices', 'enumerateDevices', async () => {
    const devices = navigator.mediaDevices;
    if (!devices || typeof devices.enumerateDevices !== 'function') {
      return fallback;
    }

    const list = await devices.enumerateDevices();

    const countsByKind: Record<string, number> = {};
    const entries = list.map((device) => {
      const kind = device.kind;
      countsByKind[kind] = (countsByKind[kind] ?? 0) + 1;
      return {
        // "audioinput" | "audiooutput" | "videoinput".
        kind,
        // Empty string unless media permission was already granted.
        label: device.label === '' ? NOT_AVAILABLE : device.label,
        // Empty string (or a per-origin ephemeral value) without permission.
        deviceId: device.deviceId === '' ? NOT_AVAILABLE : device.deviceId,
      };
    });

    const anyLabelVisible = entries.some((entry) => entry.label !== NOT_AVAILABLE);

    return {
      available: true,
      enumerated: true,
      deviceCount: entries.length,
      devices: entries,
      countsByKind,
      note:
        'No permission was requested and no camera or microphone was opened. ' +
        'Counts and kinds come from enumerateDevices(), which needs no prompt. ' +
        (anyLabelVisible
          ? 'Labels are visible because this origin already holds media permission ' +
            'from a previous, unrelated site setting.'
          : 'Labels and device ids are hidden by the browser because this origin ' +
            'has no media permission, which is the expected result here.'),
    };
  }, fallback);
}