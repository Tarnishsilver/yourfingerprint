import type { FontChecks, FontsSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attempt, attemptSync } from '../lib/attempt.js';

/**
 * SECTION 8 - Installed font detection.
 *
 * WHAT THIS IS
 * Font availability is a genuinely high-entropy signal: the set of fonts on a
 * machine separates a stock Windows PC from a Mac, a developer machine, or a
 * machine with a corporate font catalogue installed. Because that set is both
 * diverse and rarely changed, it is one of the strongest components in a real
 * fingerprint.
 *
 * TWO DETECTION METHODS, BOTH LOCAL
 *  1. `document.fonts.check()` - fast, but it returns `true` for anything the
 *     browser can resolve at all (including generic fallbacks and any font it
 *     could download), so it produces false positives.
 *  2. Metric comparison - render the same string in `"Candidate", monospace`,
 *     `"Candidate", serif` and `"Candidate", sans-serif`, and compare the
 *     measured width against the bare generic family. If a candidate changes the
 *     width of any baseline, the candidate font is actually installed.
 *
 * Method 2 is what populates the `detected` list; method 1 is reported alongside
 * it so you can see the discrepancy for yourself.
 *
 * SCOPE NOTE (requirement #8): no OS-level enumeration. There is no font-folder
 * listing, no registry read, no `FontFace` enumeration of installed families.
 */
export const FONT_CANDIDATES = [
  'Arial',
  'Helvetica',
  'Helvetica Neue',
  'Times New Roman',
  'Times',
  'Courier New',
  'Courier',
  'Verdana',
  'Georgia',
  'Trebuchet MS',
  'Segoe UI',
  'Roboto',
  'Noto Sans',
  'Noto Serif',
  'Inter',
  'Calibri',
  'Cambria',
  'Consolas',
  'Monaco',
  'Menlo',
  'Lucida Console',
  'Tahoma',
  'Verona',
  'Garamond',
  'Palatino Linotype',
  'Book Antiqua',
  'Century Gothic',
  'Arial Black',
  'Impact',
  'Comic Sans MS',
  'MS Gothic',
  'MS PGothic',
  'MS Mincho',
  'Malgun Gothic',
  'Microsoft JhengHei',
  'Microsoft YaHei',
  'PingFang SC',
  'PingFang TC',
  'Hiragino Sans',
  'Yu Gothic',
  'Yu Gothic UI',
  'Meiryo',
  'SimSun',
  'SimHei',
  'KaiTi',
  'FangSong',
  'Microsoft JhengHei UI',
  'Source Han Sans',
  'Noto Sans CJK SC',
  'Noto Color Emoji',
  'Apple Color Emoji',
  'Segoe UI Emoji',
  'Wingdings',
  'Webdings',
  'Symbol',
  'Courier New',
];

/** Generic baselines used for the metric comparison. */
const BASELINES = ['monospace', 'serif', 'sans-serif'] as const;

/**
 * Test string chosen for large, asymmetric glyph advance widths. The mix of
 * wide, narrow, ascender and descender characters maximises the metric
 * difference between fonts.
 */
const TEST_STRING = 'mmMwWLliI0OoQ@#%$&{}<>[]()';
const TEST_SIZE_PX = 72;

function measureTextWidth(fontSpec: string): number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for text measurement');
  // Assign through a property so a malformed spec cannot throw.
  ctx.font = `${TEST_SIZE_PX}px ${fontSpec}`;
  return ctx.measureText(TEST_STRING).width;
}

/** Runs one font candidate through both detection methods. */
function checkFont(family: string): FontChecks {
  const quoted = /[^a-zA-Z0-9]/.test(family) ? `"${family}"` : family;

  // Method 1 - the built-in check, reported verbatim.
  const fontsCheck = attemptSync<boolean | typeof NOT_AVAILABLE>(
    'fonts',
    family,
    () => {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (!fonts || typeof fonts.check !== 'function') return NOT_AVAILABLE;
      return fonts.check(`16px ${quoted}`);
    },
    NOT_AVAILABLE,
  );

  // Method 2 - metric comparison against each generic baseline.
  const { measuredPresent, widthDelta } = attemptSync<{
    measuredPresent: boolean | typeof NOT_AVAILABLE;
    widthDelta: Record<string, number> | typeof NOT_AVAILABLE;
  }>(
    'fonts',
    `${family}.metrics`,
    () => {
      const deltas: Record<string, number> = {};
      let present = false;
      for (const baseline of BASELINES) {
        const baselineWidth = measureTextWidth(baseline);
        const candidateWidth = measureTextWidth(`${quoted}, ${baseline}`);
        const delta = Number((candidateWidth - baselineWidth).toFixed(6));
        deltas[baseline] = delta;
        // Any measurable change means the candidate font actually loaded.
        if (delta !== 0) present = true;
      }
      return { measuredPresent: present, widthDelta: deltas };
    },
    { measuredPresent: NOT_AVAILABLE, widthDelta: NOT_AVAILABLE },
  );

  return { fontsCheck, measuredPresent, widthDelta };
}

export async function collectFonts(): Promise<FontsSignals> {
  return attempt<FontsSignals>('fonts', 'font detection', async () => {
    const detected: string[] = [];
    const checks: Record<string, FontChecks> = {};

    for (const family of FONT_CANDIDATES) {
      const result = checkFont(family);
      // Later duplicates (e.g. "Courier New" listed twice) overwrite cleanly.
      checks[family] = result;
      if (result.measuredPresent === true) detected.push(family);
    }

    return {
      // Sorted so the hash input does not depend on the candidate list order.
      detected: detected.sort((a, b) => a.localeCompare(b)),
      tested: [...FONT_CANDIDATES],
      checks,
      method:
        'Detected = text-metric comparison against monospace/serif/sans-serif ' +
        'baselines. document.fonts.check() is reported per font for comparison ' +
        'because it also returns true for generic fallbacks and downloadable ' +
        'fonts. No OS-level font enumeration is performed.',
    };
  }, {
    detected: [],
    tested: [...FONT_CANDIDATES],
    checks: {},
    method: NOT_AVAILABLE,
  });
}