import type { HardwareSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attempt, attemptSync, read } from '../lib/attempt.js';

/**
 * SECTION 4 - Hardware the browser chooses to expose.
 *
 * Scope note (requirement #4): everything here comes from a web API. No OS
 * enumeration, no serial numbers, no MAC addresses, no USB or PCI probing.
 *
 * `navigator.hardwareConcurrency` and `navigator.deviceMemory` are deliberately
 * low resolution - browsers cap cores at 8 and memory at coarse buckets - so
 * they identify a *class* of device ("8-core laptop"), not a specific machine.
 * `architecture` and `bitness` exist only as optional high-entropy client
 * hints; they stay "Not available" unless the browser volunteers them, which is
 * why they are threaded in from the userAgentData module.
 */
export async function collectHardware(
  highEntropy: Record<string, unknown> | undefined,
): Promise<HardwareSignals> {
  const nav = await attempt('hardware', 'navigator', () => navigator, undefined);
  const ua = (nav?.userAgent as string | undefined) ?? '';

  return {
    // Logical CPU cores exposed by the browser (usually capped at 8).
    cpuLogicalCores: read('hardware', 'hardwareConcurrency', nav, 'hardwareConcurrency'),
    // Approximate RAM in GiB from the coarse deviceMemory bucket.
    deviceMemoryGiB: read('hardware', 'deviceMemory', nav, 'deviceMemory'),
    // Number of simultaneous touch points the digitiser reports.
    touchPoints: read('hardware', 'maxTouchPoints', nav, 'maxTouchPoints'),
    // Operating-system platform string.
    platform: read('hardware', 'platform', nav, 'platform'),
    // Coarse platform family derived from platform + user agent.
    platformFamily: attemptSync(
      'hardware',
      'platformFamily',
      () => derivePlatformFamily(nav?.platform, ua),
      NOT_AVAILABLE,
    ),
    // CPU architecture: only present via high-entropy client hints.
    architecture: pick(highEntropy?.architecture),
    // CPU bitness (32/64): only present via high-entropy client hints.
    bitness: pick(highEntropy?.bitness),
    // Device model string: only present via high-entropy client hints.
    deviceModel: pick(highEntropy?.model),
    // Device class derived from the UA and pointer capabilities.
    mobileIndicator: attemptSync(
      'hardware',
      'mobileIndicator',
      () => deriveMobileIndicator(nav, ua),
      NOT_AVAILABLE,
    ),
    // "touch" or "no-touch", from the primary pointer media query.
    pointerCoarse: attemptSync(
      'hardware',
      'pointerCoarse',
      () => (matchMedia('(pointer: coarse)').matches ? 'coarse (touch)' : 'fine (mouse)'),
      NOT_AVAILABLE,
    ),
    // Accessibility preference; partitions the population into two groups.
    prefersReducedMotion: attemptSync(
      'hardware',
      'prefers-reduced-motion',
      () => String(matchMedia('(prefers-reduced-motion: reduce)').matches),
      NOT_AVAILABLE,
    ),
    // Dark/light theme preference.
    prefersColorScheme: attemptSync(
      'hardware',
      'prefers-color-scheme',
      () => {
        if (matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
        if (matchMedia('(prefers-color-scheme: light)').matches) return 'light';
        return 'no preference';
      },
      NOT_AVAILABLE,
    ),
    // Display gamut support, an indirect signal for the display hardware.
    colorGamut: attemptSync(
      'hardware',
      'color-gamut',
      () => {
        if (matchMedia('(color-gamut: p3)').matches) return 'p3';
        if (matchMedia('(color-gamut: rec2020)').matches) return 'rec2020';
        if (matchMedia('(color-gamut: srgb)').matches) return 'srgb';
        return 'unknown';
      },
      NOT_AVAILABLE,
    ),
  };
}

/** Normalises an optional hint value into a report-safe scalar. */
function pick(value: unknown): string | number | null | typeof NOT_AVAILABLE {
  if (value === undefined || value === null) return NOT_AVAILABLE;
  if (typeof value === 'string' || typeof value === 'number') return value;
  return NOT_AVAILABLE;
}

/** Maps navigator.platform + UA onto a coarse OS family. */
function derivePlatformFamily(platform: unknown, ua: string): string {
  const p = typeof platform === 'string' ? platform : '';
  if (/iPhone|iPad|iPod/.test(ua) || /iOS/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Win/.test(p) || /Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(p) || /Macintosh|Mac OS X/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux|X11/.test(p) || /Linux/.test(ua)) return 'Linux';
  return 'Other';
}

/** Mobile / tablet / desktop classification from UA and input capabilities. */
function deriveMobileIndicator(nav: Navigator | undefined, ua: string): string {
  const touchPoints = Number(nav?.maxTouchPoints ?? 0);
  if (/Mobi|Android|iPhone|iPod|Windows Phone/.test(ua)) return 'mobile';
  if (/iPad|Tablet|PlayBook|Silk/.test(ua) || (/Mac/.test(nav?.platform ?? '') && touchPoints > 1)) {
    return 'tablet';
  }
  if (/Android/.test(ua) && !/Mobi/.test(ua)) return 'mobile (Android tablet-class)';
  return touchPoints > 0 ? 'desktop with touch' : 'desktop';
}