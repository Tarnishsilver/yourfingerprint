import type { FingerprintReport, FontsSignals } from '../../shared/types.js';
import { clearDiagnostics, getDiagnostics } from '../lib/attempt.js';
import { collectAudio } from './audio.js';
import { collectBrowser } from './browser.js';
import { collectCapabilities } from './capabilities.js';
import { collectCanvas } from './canvas.js';
import { collectFonts } from './fonts.js';
import { collectHardware } from './hardware.js';
import { collectMediaCapabilities } from './mediaCapabilities.js';
import { collectMediaDevices } from './mediaDevices.js';
import { collectNetwork } from './network.js';
import { collectPermissions } from './permissions.js';
import { collectScreen } from './screen.js';
import { collectStorage } from './storage.js';
import { collectTimezone } from './timezone.js';
import { collectUserAgentData, hardwareHintsFromUAData } from './userAgentData.js';
import { collectWebGL } from './webgl.js';

export interface CollectOptions {
  /**
   * Opt-in request for high-entropy User-Agent Client Hints.
   * These add request headers to this origin, so they are never requested
   * implicitly.
   */
  includeHighEntropy: boolean;
}

export interface CollectResult {
  report: FingerprintReport;
  /**
   * Per-font detection detail. Deliberately NOT part of `report`, because the
   * hashed `fonts` field is specified as a plain array of family names. This
   * detail is rendered in the FONTS section and excluded from the hash.
   */
  fontDetails: FontsSignals;
}

/**
 * Runs every fingerprint module and assembles the client-side report.
 *
 * Ordering note: userAgentData is collected first because the HARDWARE module
 * reuses its high-entropy hints (architecture / bitness / model) rather than
 * issuing a second request. Everything else is independent and runs concurrently.
 *
 * Failure isolation: each module is individually wrapped in `attempt(...)`, so a
 * module that throws contributes "Not available" values and a diagnostic entry
 * instead of aborting the scan.
 */
export async function collectFingerprint(options: CollectOptions): Promise<CollectResult> {
  clearDiagnostics();

  // Must run first: HARDWARE reads its architecture/bitness/model values from
  // this result rather than making its own high-entropy request.
  const userAgentData = await collectUserAgentData(options.includeHighEntropy);

  const [
    browser,
    screen,
    timezone,
    hardware,
    canvas,
    webgl,
    audio,
    fonts,
    mediaDevices,
    capabilities,
    storage,
    network,
    mediaCapabilities,
    permissions,
  ] = await Promise.all([
    collectBrowser(),
    collectScreen(),
    collectTimezone(),
    collectHardware(hardwareHintsFromUAData(userAgentData)),
    collectCanvas(),
    collectWebGL(),
    collectAudio(),
    collectFonts(),
    collectMediaDevices(),
    collectCapabilities(),
    collectStorage(),
    collectNetwork(),
    collectMediaCapabilities(),
    collectPermissions(),
  ]);

  return {
    report: {
      browser,
      screen,
      timezone,
      hardware,
      canvas,
      webgl,
      audio,
      // The hashed report keeps `fonts` as a plain sorted array of family
      // names, per the spec. Per-font check detail stays in the UI.
      fonts: fonts.detected,
      mediaDevices,
      capabilities,
      storage,
      network,
      mediaCapabilities,
      permissions,
      userAgentData,
    },
    fontDetails: fonts,
  };
}

/** Diagnostic list captured during the last {@link collectFingerprint} call. */
export function collectDiagnostics() {
  return getDiagnostics();
}

export {
  collectAudio,
  collectBrowser,
  collectCapabilities,
  collectCanvas,
  collectFonts,
  collectHardware,
  collectMediaCapabilities,
  collectMediaDevices,
  collectNetwork,
  collectPermissions,
  collectScreen,
  collectStorage,
  collectTimezone,
  collectUserAgentData,
  collectWebGL,
};