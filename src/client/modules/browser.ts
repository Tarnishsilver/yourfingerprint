import type { BrowserSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attempt, attemptSync, read } from '../lib/attempt.js';

/**
 * SECTION 1 - Browser identity signals.
 *
 * These come straight from the `navigator` object. They are the least
 * interesting and the most stable signals: they identify the *family* of
 * browser and OS, not a person. Several of them (appCodeName, productSub,
 * vendorSub) are frozen 1990s Netscape constants that only exist for
 * compatibility, but they are still useful for spotting broken/rewritten
 * user-agent strings.
 */
export async function collectBrowser(): Promise<BrowserSignals> {
  // `navigator` is guarded because a few exotic contexts expose no navigator.
  const nav = await attempt('browser', 'navigator', () => navigator, undefined);

  return {
    // Full UA string: browser name + version, engine, OS, device class.
    userAgent: read('browser', 'userAgent', nav, 'userAgent'),
    // UA with the leading "Mozilla/" token removed.
    appVersion: read('browser', 'appVersion', nav, 'appVersion'),
    // Historical constant, effectively always "Netscape".
    appName: read('browser', 'appName', nav, 'appName'),
    // Historical constant, effectively always "Mozilla".
    appCodeName: read('browser', 'appCodeName', nav, 'appCodeName'),
    // Historical constant, effectively always "Gecko".
    product: read('browser', 'product', nav, 'product'),
    // Historical constant, effectively always "20030107".
    productSub: read('browser', 'productSub', nav, 'productSub'),
    // Browser vendor string, e.g. "Google Inc." or "Apple Computer, Inc.".
    vendor: read('browser', 'vendor', nav, 'vendor'),
    // Deprecated vendor sub-string, empty in every modern browser.
    vendorSub: read('browser', 'vendorSub', nav, 'vendorSub'),
    // Operating-system platform, e.g. "Win32", "MacIntel", "Linux x86_64".
    platform: read('browser', 'platform', nav, 'platform'),
    // Preferred UI language tag, e.g. "en-GB".
    language: read('browser', 'language', nav, 'language'),
    // Full ordered language preference list (user configurable).
    languages: read<string[]>('browser', 'languages', nav, 'languages'),
    // Whether cookies are accepted for this origin.
    cookieEnabled: read('browser', 'cookieEnabled', nav, 'cookieEnabled'),
    // Do Not Track preference: null, "1" or "unspecified".
    doNotTrack: read('browser', 'doNotTrack', nav, 'doNotTrack'),
    // True when the page suspects it is automated (headless Chrome, Selenium).
    webdriver: read('browser', 'webdriver', nav, 'webdriver'),
    // Logical CPU core count reported by the browser (often capped at 8).
    hardwareConcurrency: read('browser', 'hardwareConcurrency', nav, 'hardwareConcurrency'),
    // Approximate RAM in GiB, deliberately coarse (.25/.5/1/2/4/8).
    deviceMemory: read('browser', 'deviceMemory', nav, 'deviceMemory'),
    // Number of simultaneous touch points the digitiser supports.
    maxTouchPoints: read('browser', 'maxTouchPoints', nav, 'maxTouchPoints'),
    // Whether the internal PDF viewer is enabled.
    pdfViewerEnabled: read('browser', 'pdfViewerEnabled', nav, 'pdfViewerEnabled'),
    // Whether the browser believes it has network connectivity right now.
    onLine: read('browser', 'onLine', nav, 'onLine'),
  };
}

/**
 * Derives a coarse browser family from the UA string.
 * Purely informational and used for the "Browser:" UI row.
 */
export function summariseBrowser(userAgent: string): string {
  return attemptSync('browser', 'summary', () => {
    if (!userAgent) return NOT_AVAILABLE;
    const candidates: Array<[RegExp, string]> = [
      [/Edg\/([\d.]+)/, 'Edge'],
      [/OPR\/([\d.]+)/, 'Opera'],
      [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
      [/Firefox\/([\d.]+)/, 'Firefox'],
      [/Chrome\/([\d.]+)/, 'Chrome'],
      [/Version\/([\d.]+).*Safari/, 'Safari'],
      [/MSIE ([\d.]+)/, 'Internet Explorer'],
      [/Trident\/.*rv:([\d.]+)/, 'Internet Explorer'],
    ];
    for (const [pattern, name] of candidates) {
      const match = pattern.exec(userAgent);
      if (match) return `${name} ${match[1]}`;
    }
    return 'Unrecognised user agent';
  }, NOT_AVAILABLE);
}