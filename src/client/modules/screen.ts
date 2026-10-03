import type { ScreenSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attemptSync, read } from '../lib/attempt.js';

/**
 * SECTION 2 - Screen and viewport geometry.
 *
 * Screen resolution is one of the most stable and most identifying raw signals
 * a browser hands out. Combined with `devicePixelRatio` it also distinguishes a
 * retina MacBook from an external monitor attached to the same machine, and
 * window size buckets are the basis of most "screen size" cohorts.
 *
 * Values that change on every resize (`innerWidth`/`innerHeight`) are still
 * collected because they reveal window management habits, but they are the most
 * volatile part of the whole report.
 */
export async function collectScreen(): Promise<ScreenSignals> {
  const screen = await attemptSync('screen', 'screen', () => window.screen, undefined);
  const win = await attemptSync('screen', 'window', () => window, undefined);

  // screen.orientation is optional (it is unavailable on some desktops).
  const orientation = attemptSync<ScreenOrientation | undefined>(
    'screen',
    'orientation',
    () => (screen ? screen.orientation : undefined),
    undefined,
  );

  return {
    // Full screen width in CSS pixels.
    width: read('screen', 'width', screen, 'width'),
    // Full screen height in CSS pixels.
    height: read('screen', 'height', screen, 'height'),
    // Screen width minus OS chrome (taskbar/dock), a layout-relevant value.
    availWidth: read('screen', 'availWidth', screen, 'availWidth'),
    // Screen height minus OS chrome.
    availHeight: read('screen', 'availHeight', screen, 'availHeight'),
    // Bits per colour channel: 24 or 30 most commonly.
    colorDepth: read('screen', 'colorDepth', screen, 'colorDepth'),
    // Bits per pixel; usually identical to colorDepth.
    pixelDepth: read('screen', 'pixelDepth', screen, 'pixelDepth'),
    // Viewport (content area) width - changes when the user resizes.
    innerWidth: read('screen', 'innerWidth', win, 'innerWidth'),
    // Viewport (content area) height - changes when the user resizes.
    innerHeight: read('screen', 'innerHeight', win, 'innerHeight'),
    // Outer window size including browser chrome, when exposed.
    outerWidth: read('screen', 'outerWidth', win, 'outerWidth'),
    outerHeight: read('screen', 'outerHeight', win, 'outerHeight'),
    // Physical pixels per CSS pixel: 1, 1.25, 1.5, 2, 3 ...
    devicePixelRatio: read('screen', 'devicePixelRatio', win, 'devicePixelRatio'),
    // "portrait-primary", "landscape-primary", ...
    orientationType: read('screen', 'orientation.type', orientation, 'type'),
    // 0, 90, 180 or 270 degrees.
    orientationAngle: read('screen', 'orientation.angle', orientation, 'angle'),
    // Left inset of the available area, where the browser exposes it.
    availLeft: read('screen', 'availLeft', screen, 'availLeft'),
    // Top inset of the available area, where the browser exposes it.
    availTop: read('screen', 'availTop', screen, 'availTop'),
  };
}

/** Formats the collected geometry into human readable rows for the UI. */
export function screenSummary(signals: ScreenSignals): {
  resolution: string;
  viewport: string;
  dpr: string;
  colorDepth: string;
  orientation: string;
} {
  const pair = (a: unknown, b: unknown): string =>
    typeof a === 'number' && typeof b === 'number' ? `${a} x ${b}` : NOT_AVAILABLE;

  return {
    resolution: pair(signals.width, signals.height),
    viewport: pair(signals.innerWidth, signals.innerHeight),
    dpr:
      typeof signals.devicePixelRatio === 'number'
        ? String(signals.devicePixelRatio)
        : NOT_AVAILABLE,
    colorDepth:
      typeof signals.colorDepth === 'number'
        ? `${signals.colorDepth}-bit`
        : NOT_AVAILABLE,
    orientation:
      typeof signals.orientationType === 'string'
        ? `${signals.orientationType} (${signals.orientationAngle} deg)`
        : NOT_AVAILABLE,
  };
}