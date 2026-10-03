import type { WebGLParameters, WebGLSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attempt, attemptSync } from '../lib/attempt.js';
import { sha256Hex } from '../lib/sha256.js';

/**
 * SECTION 6 - WebGL / GPU fingerprint.
 *
 * WHAT THIS IS
 * Two independent signals are collected:
 *
 *  1. CONFIGURATION - limits and extensions reported by the GL driver. These
 *     narrow the field enormously (a 16384 texture limit with anisotropic
 *     filtering, 32 varying vectors, a particular set of extensions).
 *  2. RENDER HASH - a fixed shader is rendered and the pixels are read back
 *     with `readPixels()`. Floating-point precision, `mediump` handling, blend
 *     and interpolation rounding all show up in the output, so two GPUs can
 *     report identical configuration strings and still hash differently.
 *
 * `WEBGL_debug_renderer_info` is the extension that unmasks the real vendor and
 * renderer strings ("Apple M2", "ANGLE (NVIDIA, GeForce RTX 3080 ...)"). It is
 * gated behind a privacy setting in current browsers, so "Not available" is a
 * completely normal result and is reported honestly rather than worked around.
 *
 * No WebRTC, no network probing: this is purely the rendering API.
 */
export const WEBGL_TEST_DESCRIPTION = [
  'Deterministic 200x120 WebGL render test: two full-viewport triangles draw a',
  'position-interpolated fragment shader that combines a sin() wave, a disc',
  'distance test and gl_FragCoord-free math at mediump precision. The colour',
  'buffer is read back with readPixels() and the raw RGBA bytes are hashed.',
  'mediump precision and blending rounding differ per GPU, which is what makes',
  'the output device specific.',
].join(' ');

const RENDER_WIDTH = 200;
const RENDER_HEIGHT = 120;

const VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vPos;
void main() {
  vPos = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 vPos;
uniform float uPhase;
void main() {
  float wave = 0.5 + 0.5 * sin((vPos.x + vPos.y) * 12.0 + uPhase);
  float disc = length(vPos - vec2(0.35, -0.1));
  if (disc < 0.55) {
    gl_FragColor = vec4(wave, 1.0 - wave, vPos.x * 0.5 + 0.5, 1.0);
  } else {
    gl_FragColor = vec4(wave * 0.5, disc, 0.25, 1.0);
  }
}`;

/** Reads a GL parameter and coerces it to a report-safe scalar. */
function readParam(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  name: string,
): string | number | null | typeof NOT_AVAILABLE {
  return attemptSync('webgl', name, () => {
    const enumValue = (gl as unknown as Record<string, number>)[name];
    if (typeof enumValue !== 'number') return NOT_AVAILABLE;
    const value: unknown = gl.getParameter(enumValue);
    if (value === null || value === undefined) return NOT_AVAILABLE;
    if (value instanceof Float32Array || Array.isArray(value)) {
      const parts = Array.from(value as ArrayLike<number>).map(
        (n) => Number(n.toFixed(4)),
      );
      return parts.join(', ');
    }
    if (typeof value === 'object') return String(value);
    return value as string | number;
  }, NOT_AVAILABLE);
}

function collectParameters(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): WebGLParameters {
  // Anisotropic filtering is an optional extension, so its limit is only
  // available when the extension itself is present.
  const aniso = attemptSync(
    'webgl',
    'EXT_texture_filter_anisotropic',
    () => gl.getExtension('EXT_texture_filter_anisotropic'),
    null,
  );
  const anisoLimit =
    aniso && typeof (aniso as { MAX_TEXTURE_MAX_ANISOTROPY_EXT?: number }).MAX_TEXTURE_MAX_ANISOTROPY_EXT === 'number'
      ? ((aniso as unknown as Record<string, number>).MAX_TEXTURE_MAX_ANISOTROPY_EXT as number)
      : NOT_AVAILABLE;

  return {
    // Largest square texture the GPU can allocate, e.g. 16384.
    MAX_TEXTURE_SIZE: readParam(gl, 'MAX_TEXTURE_SIZE'),
    // Usable framebuffer size, usually "[16384,16384]".
    MAX_VIEWPORT_DIMS: readParam(gl, 'MAX_VIEWPORT_DIMS'),
    // Vertex attributes available in a vertex shader, typically 16.
    MAX_VERTEX_ATTRIBS: readParam(gl, 'MAX_VERTEX_ATTRIBS'),
    // Interpolated varyings available in a fragment shader, typically 15-32.
    MAX_VARYING_VECTORS: readParam(gl, 'MAX_VARYING_VECTORS'),
    // Texture image units usable in the fragment shader.
    MAX_TEXTURE_IMAGE_UNITS: readParam(gl, 'MAX_TEXTURE_IMAGE_UNITS'),
    // Uniform vectors usable in the vertex shader.
    MAX_VERTEX_UNIFORM_VECTORS: readParam(gl, 'MAX_VERTEX_UNIFORM_VECTORS'),
    // Uniform vectors usable in the fragment shader.
    MAX_FRAGMENT_UNIFORM_VECTORS: readParam(gl, 'MAX_FRAGMENT_UNIFORM_VECTORS'),
    // Combined texture image units across all shader stages.
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: readParam(gl, 'MAX_COMBINED_TEXTURE_IMAGE_UNITS'),
    // Largest cube-map face dimension.
    MAX_CUBE_MAP_TEXTURE_SIZE: readParam(gl, 'MAX_CUBE_MAP_TEXTURE_SIZE'),
    // Largest renderbuffer dimension.
    MAX_RENDERBUFFER_SIZE: readParam(gl, 'MAX_RENDERBUFFER_SIZE'),
    // Texture sampling allowed in the vertex shader (0 on many mobile GPUs).
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: readParam(gl, 'MAX_VERTEX_TEXTURE_IMAGE_UNITS'),
    // Widest line the driver will rasterise, e.g. "1, 1024".
    ALIASED_LINE_WIDTH_RANGE: readParam(gl, 'ALIASED_LINE_WIDTH_RANGE'),
    // Point size range, e.g. "1, 255".
    ALIASED_POINT_SIZE_RANGE: readParam(gl, 'ALIASED_POINT_SIZE_RANGE'),
    // Sub-pixel precision of the rasteriser, usually 4 or 5 bits.
    SUBPIXEL_BITS: readParam(gl, 'SUBPIXEL_BITS'),
    // Colour buffer bit layout, a strong driver/class hint.
    RED_BITS: readParam(gl, 'RED_BITS'),
    GREEN_BITS: readParam(gl, 'GREEN_BITS'),
    BLUE_BITS: readParam(gl, 'BLUE_BITS'),
    ALPHA_BITS: readParam(gl, 'ALPHA_BITS'),
    DEPTH_BITS: readParam(gl, 'DEPTH_BITS'),
    STENCIL_BITS: readParam(gl, 'STENCIL_BITS'),
    // Highest anisotropic filtering level, when the extension exists.
    MAX_TEXTURE_MAX_ANISOTROPY_EXT: anisoLimit,
  };
}

/**
 * Compiles the fixed shaders and draws the fixed geometry. Shared by the hash
 * path and the on-screen preview so both show byte-identical output.
 */
function drawScene(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
  const program = gl.createProgram();
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  if (!program || !vertex || !fragment) throw new Error('could not create GL objects');

  gl.shaderSource(vertex, VERTEX_SHADER);
  gl.compileShader(vertex);
  if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS)) {
    throw new Error(`vertex shader failed: ${gl.getShaderInfoLog(vertex) ?? 'unknown'}`);
  }

  gl.shaderSource(fragment, FRAGMENT_SHADER);
  gl.compileShader(fragment);
  if (!gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) {
    throw new Error(`fragment shader failed: ${gl.getShaderInfoLog(fragment) ?? 'unknown'}`);
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program) ?? 'unknown'}`);
  }
  gl.useProgram(program);

  // Full-viewport triangle strip: deterministic clip-space geometry.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const phaseLocation = gl.getUniformLocation(program, 'uPhase');
  if (phaseLocation) gl.uniform1f(phaseLocation, 0.75);

  gl.viewport(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  // Fixed clear colour: the clear itself also contributes to the hashed bytes.
  gl.clearColor(0.133, 0.133, 0.133, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.finish();
}

/** Renders the fixed test scene and hashes the resulting RGBA bytes. */
async function runRenderTest(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): Promise<string> {
  drawScene(gl);

  const pixels = new Uint8Array(RENDER_WIDTH * RENDER_HEIGHT * 4);
  gl.readPixels(0, 0, RENDER_WIDTH, RENDER_HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  return sha256Hex(pixels);
}

export async function collectWebGL(): Promise<WebGLSignals> {
  return attempt<WebGLSignals>(
    'webgl',
    'context',
    async () => {
      const canvas = document.createElement('canvas');
      canvas.width = RENDER_WIDTH;
      canvas.height = RENDER_HEIGHT;

      // WebGL2 is preferred when available; asking for 'webgl2' and getting null
      // does not prevent a subsequent 'webgl' request on the same canvas.
      const webgl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
      const gl: WebGLRenderingContext | WebGL2RenderingContext | null =
        webgl2 ??
        (canvas.getContext('webgl') as WebGLRenderingContext | null) ??
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

      if (!gl) throw new Error('no WebGL context');

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as {
        UNMASKED_VENDOR_WEBGL: number;
        UNMASKED_RENDERER_WEBGL: number;
      } | null;

      const unmaskedVendor = debugInfo
        ? (gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string)
        : NOT_AVAILABLE;
      const unmaskedRenderer = debugInfo
        ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string)
        : NOT_AVAILABLE;

      const extensions = gl.getSupportedExtensions();

      const renderHash = await runRenderTest(gl);

      return {
        // "WebGL 1.0" or "WebGL 2.0".
        version: String(gl.getParameter(gl.VERSION)),
        // e.g. "WebGL GLSL ES 3.00 (OpenGL ES 3.0 ...)".
        shadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
        // GL_VENDOR, usually the browser vendor rather than the GPU vendor.
        vendor: String(gl.getParameter(gl.VENDOR)),
        // GL_RENDERER, usually a masked/generic string.
        renderer: String(gl.getParameter(gl.RENDERER)),
        // Real GPU vendor, only when the debug extension is permitted.
        unmaskedVendor,
        // Real GPU renderer string, only when the debug extension is permitted.
        unmaskedRenderer,
        contextVersion: webgl2 ? 'webgl2' : 'webgl',
        debugRendererInfoAvailable: debugInfo !== null,
        parameters: collectParameters(gl),
        // The full supported-extension list is a strong fingerprint on its own.
        extensions: extensions ? extensions.slice().sort() : NOT_AVAILABLE,
        // Hash of the fixed render test.
        renderHash,
        renderTestDescription: WEBGL_TEST_DESCRIPTION,
      };
    },
    // Fallback when there is no WebGL context at all, or the probe threw.
    {
      version: NOT_AVAILABLE,
      shadingLanguageVersion: NOT_AVAILABLE,
      vendor: NOT_AVAILABLE,
      renderer: NOT_AVAILABLE,
      unmaskedVendor: NOT_AVAILABLE,
      unmaskedRenderer: NOT_AVAILABLE,
      contextVersion: NOT_AVAILABLE,
      debugRendererInfoAvailable: false,
      parameters: {
        MAX_TEXTURE_SIZE: NOT_AVAILABLE,
        MAX_VIEWPORT_DIMS: NOT_AVAILABLE,
        MAX_VERTEX_ATTRIBS: NOT_AVAILABLE,
        MAX_VARYING_VECTORS: NOT_AVAILABLE,
        MAX_TEXTURE_IMAGE_UNITS: NOT_AVAILABLE,
        MAX_VERTEX_UNIFORM_VECTORS: NOT_AVAILABLE,
        MAX_FRAGMENT_UNIFORM_VECTORS: NOT_AVAILABLE,
        MAX_COMBINED_TEXTURE_IMAGE_UNITS: NOT_AVAILABLE,
        MAX_CUBE_MAP_TEXTURE_SIZE: NOT_AVAILABLE,
        MAX_RENDERBUFFER_SIZE: NOT_AVAILABLE,
        MAX_VERTEX_TEXTURE_IMAGE_UNITS: NOT_AVAILABLE,
        ALIASED_LINE_WIDTH_RANGE: NOT_AVAILABLE,
        ALIASED_POINT_SIZE_RANGE: NOT_AVAILABLE,
        SUBPIXEL_BITS: NOT_AVAILABLE,
        RED_BITS: NOT_AVAILABLE,
        GREEN_BITS: NOT_AVAILABLE,
        BLUE_BITS: NOT_AVAILABLE,
        ALPHA_BITS: NOT_AVAILABLE,
        DEPTH_BITS: NOT_AVAILABLE,
        STENCIL_BITS: NOT_AVAILABLE,
        MAX_TEXTURE_MAX_ANISOTROPY_EXT: NOT_AVAILABLE,
      },
      extensions: NOT_AVAILABLE,
      renderHash: NOT_AVAILABLE,
      renderTestDescription: WEBGL_TEST_DESCRIPTION,
    },
  );
}

/** Returns a data URL of the WebGL render test, or null when unavailable. */
export function renderWebGLPreview(): string | null {
  return attemptSync<string | null>(
    'webgl',
    'preview',
    () => {
      const canvas = document.createElement('canvas');
      canvas.width = RENDER_WIDTH;
      canvas.height = RENDER_HEIGHT;
      const gl = (canvas.getContext('webgl2') ??
        canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
      if (!gl) return null;
      drawScene(gl);
      return canvas.toDataURL('image/png');
    },
    null,
  );
}
