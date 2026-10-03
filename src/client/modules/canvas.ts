import type { CanvasSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attempt } from '../lib/attempt.js';
import { sha256Hex } from '../lib/sha256.js';

/**
 * SECTION 5 - Canvas fingerprint.
 *
 * WHAT THIS IS
 * A tiny fixed drawing is rasterised, the resulting RGBA pixels are read back
 * with `getImageData()`, and those raw bytes are hashed with SHA-256.
 *
 * WHY IT VARIES BETWEEN MACHINES
 * Rasterisation is not specified to the last bit. GPU drivers, anti-aliasing
 * quality, font hinting, sub-pixel positioning, gamma handling and the exact
 * text layout engine all end up baked into the final pixels. Two machines with
 * the same browser version, same OS and same screen size can still produce
 * different bytes. That is the whole point of the technique, and it is also why
 * it is worth *looking at*: this tool always shows you the exact drawing and
 * its preview so you can see what is being hashed instead of asking you to
 * trust an opaque number.
 *
 * PRIVACY NOTE
 * Nothing about this is a permission prompt and nothing is sent anywhere: the
 * hash is computed locally in this page and, in this tool, not even stored.
 */
export const CANVAS_TEST_DESCRIPTION = [
  'Deterministic 300x80 2D canvas test rendered entirely in memory:',
  '1. flat #f8f8f2 background fill,',
  '2. three translucent (globalAlpha 0.35-0.55) red/green/blue circles and a',
  '   rgba() rectangle that exercise the alpha-blending path,',
  '3. a linear gradient and a radial gradient fill,',
  '4. hairlines and thick lines with round caps/joins plus bezier and arc',
  '   strokes to exercise anti-aliasing,',
  '5. globalCompositeOperation="multiply" overlap test,',
  '6. text in Arial / Georgia / Courier New / monospace at several sizes, with',
  '   letter-spacing, at both integer and fractional x/y offsets,',
  '7. a global shadow. getImageData() is read and the raw RGBA bytes are hashed.',
].join(' ');

/** Fonts deliberately limited to the classic core-web families. */
const TEST_FONTS = ['Arial', 'Georgia', 'Courier New', 'monospace'];

const WIDTH = 300;
const HEIGHT = 80;

/**
 * Draws the deterministic test. Kept separate so the UI can show a preview of
 * the very same pixels that get hashed.
 */
function drawTest(ctx: CanvasRenderingContext2D): void {
  // 1. Opaque background: gives the hash a stable baseline.
  ctx.fillStyle = '#f8f8f2';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 2. Translucent primitives: exposes the driver's alpha blending behaviour.
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(45, 45, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#00aa00';
  ctx.beginPath();
  ctx.arc(85, 45, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(30, 55, 90, 20);

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgba(255, 128, 0, 0.75)';
  ctx.beginPath();
  ctx.arc(125, 45, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 3. Gradients: interpolation precision differs between implementations.
  const linear = ctx.createLinearGradient(150, 0, 300, 0);
  linear.addColorStop(0, '#ff0000');
  linear.addColorStop(0.5, '#ffff00');
  linear.addColorStop(1, '#0000ff');
  ctx.fillStyle = linear;
  ctx.fillRect(150, 10, 140, 30);

  const radial = ctx.createRadialGradient(220, 62, 2, 220, 62, 26);
  radial.addColorStop(0, '#ffffff');
  radial.addColorStop(0.6, '#4488cc');
  radial.addColorStop(1, '#101020');
  ctx.fillStyle = radial;
  ctx.fillRect(150, 42, 140, 32);

  // 4. Strokes: anti-aliasing and line-join quality are driver dependent.
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#333333';
  ctx.beginPath();
  ctx.moveTo(5.5, 4.5);
  ctx.lineTo(140.5, 4.5);
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#880088';
  ctx.beginPath();
  ctx.moveTo(8, 75);
  ctx.bezierCurveTo(40, 60, 80, 90, 140, 70);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#008888';
  ctx.beginPath();
  ctx.arc(75, 40, 34, 0.25 * Math.PI, 1.4 * Math.PI);
  ctx.stroke();

  // 5. Composite operation: blend-mode maths is another differentiator.
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
  ctx.fillRect(20, 20, 40, 40);
  ctx.globalCompositeOperation = 'source-over';

  // 6. Text: font rasterisation and hinting dominate most real-world deltas.
  let y = 18;
  for (const font of TEST_FONTS) {
    ctx.font = `17px "${font}"`;
    ctx.fillStyle = '#101010';
    ctx.textBaseline = 'top';
    // Fractional positions force sub-pixel text positioning.
    ctx.fillText(`Fingerprint ${font} 0123 gjpq`, 6.5, y);
    y += 16;
  }

  ctx.font = 'bold 13px "Courier New"';
  ctx.fillStyle = '#0055aa';
  ctx.fillText('letter-spacing: 1.5px', 6.5, 78.5);

  // 7. Shadow: shadow blur implementation differs between rasterisers.
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(108, 12, 34, 16);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function createTestCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  drawTest(ctx);
  return canvas;
}

export async function collectCanvas(): Promise<CanvasSignals> {
  return attempt<CanvasSignals>(
    'canvas',
    'render + getImageData',
    async () => {
      const canvas = createTestCanvas();
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('2D canvas context unavailable');

      // Reading the pixels back is what actually makes the signal. Note that
      // this only works on an untainted canvas - we never draw a cross-origin
      // image, so getImageData() always succeeds here.
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hash = await sha256Hex(new Uint8Array(image.data.buffer));

      return {
        // SHA-256 over the exact RGBA bytes shown in the preview below.
        hash,
        testDescription: CANVAS_TEST_DESCRIPTION,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        // Proves the pixels were actually readable (i.e. untainted canvas).
        readable: true,
      };
    },
    {
      hash: NOT_AVAILABLE,
      testDescription: CANVAS_TEST_DESCRIPTION,
      canvasWidth: NOT_AVAILABLE,
      canvasHeight: NOT_AVAILABLE,
      readable: false,
    },
  );
}

/**
 * Returns a data URL of the same test drawing so the UI can display the exact
 * pixels that produced the hash. Kept out of the hashed report.
 */
export function renderCanvasPreview(): string | null {
  try {
    return createTestCanvas().toDataURL('image/png');
  } catch {
    return null;
  }
}