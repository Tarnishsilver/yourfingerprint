import type { CanPlayType, MediaCapabilitiesSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attempt, attemptSync } from '../lib/attempt.js';

/**
 * SECTION 13 - Codec and image format support.
 *
 * WHAT THIS IS
 * A support matrix: for each MIME type, can the browser decode/play it?
 *
 *   - `HTMLMediaElement.canPlayType()` returns "", "maybe" or "probably". These
 *     are the browser's own declarations of intent, which is why they are
 *     sometimes wrong (historically Chrome claimed "maybe" for things it could
 *     not decode). The result is reported exactly as given.
 *   - `MediaSource.isTypeSupported()` answers the same question for the Media
 *     Source Extensions path used by adaptive streaming players.
 *   - Image formats have no `canPlayType()`, so they are probed locally by
 *     asking a 1x1 canvas to encode to the format and checking the resulting
 *     data URL. That is a pure encode test - nothing is downloaded.
 *
 * WHY IT MATTERS
 * Codec support correlates with platform, region and browser build: H.265 on
 * desktop but not iOS, AVIF on modern Chromium but not Safari, VP9/Opus
 * everywhere but AV1 almost nowhere.
 */

/** Audio formats worth reporting. */
const AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp4; codecs="mp4a.40.2"',
  'audio/aac',
  'audio/ogg; codecs="vorbis"',
  'audio/ogg; codecs="opus"',
  'audio/ogg; codecs="flac"',
  'audio/webm; codecs="vorbis"',
  'audio/webm; codecs="opus"',
  'audio/wav; codecs="1"',
  'audio/flac',
  'audio/mp4; codecs="mp4a.40.5"',
];

/** Video formats worth reporting. */
const VIDEO_TYPES = [
  'video/mp4; codecs="avc1.42E01E"',
  'video/mp4; codecs="avc1.4D401E"',
  'video/mp4; codecs="hev1.1.6.L93.B0"',
  'video/mp4; codecs="av01.0.05M.08"',
  'video/webm; codecs="vp8, vorbis"',
  'video/webm; codecs="vp9"',
  'video/webm; codecs="av01.0.05M.08"',
  'video/ogg; codecs="theora"',
  'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
];

/** MSE container/codec combinations used by streaming players. */
const MSE_TYPES = [
  'video/mp4; codecs="avc1.42E01E"',
  'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
  'video/mp4; codecs="hev1.1.6.L93.B0"',
  'video/mp4; codecs="mp4a.40.2"',
  'audio/mp4; codecs="mp4a.40.2"',
  'audio/webm; codecs="opus"',
  'audio/webm; codecs="vorbis"',
  'video/webm; codecs="vp8"',
  'video/webm; codecs="vp9"',
  'video/webm; codecs="av01.0.05M.08"',
  'video/mp2t; codecs="avc1.42E01E,mp4a.40.2"',
];

/** Image formats probed through canvas encoding. */
const IMAGE_TYPES: Array<[string, string]> = [
  ['image/png', 'png'],
  ['image/jpeg', 'jpeg'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
  ['image/bmp', 'bmp'],
  ['image/x-icon', 'ico'],
  ['image/svg+xml', 'svg'],
];

/** Renders a throwaway element purely to read canPlayType() from it. */
function getCanPlayType(): (mimeType: string) => CanPlayType {
  const element = attemptSync<HTMLMediaElement | null>(
    'mediaCapabilities',
    'createElement',
    () => document.createElement('audio'),
    null,
  );
  if (!element || typeof element.canPlayType !== 'function') return () => '';
  return (mimeType: string) => element.canPlayType(mimeType) as CanPlayType;
}

function probeImage(mimeType: string): boolean {
  return attemptSync('mediaCapabilities', mimeType, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    // A silent encode test. No network request, no file read.
    const dataUrl = canvas.toDataURL(mimeType);
    return dataUrl.startsWith(`data:${mimeType}`);
  }, false);
}

export async function collectMediaCapabilities(): Promise<MediaCapabilitiesSignals> {
  const canPlayType = getCanPlayType();

  const audio: Record<string, CanPlayType> = {};
  for (const type of AUDIO_TYPES) {
    audio[type] = attemptSync('mediaCapabilities', type, () => canPlayType(type), '');
  }

  const video: Record<string, CanPlayType> = {};
  for (const type of VIDEO_TYPES) {
    video[type] = attemptSync('mediaCapabilities', type, () => canPlayType(type), '');
  }

  // MediaSource is missing in Safari < 17 and in some hardened builds.
  const mediaSource: Record<string, boolean> = {};
  const MediaSourceCtor = (window as unknown as { MediaSource?: typeof MediaSource })
    .MediaSource;
  for (const type of MSE_TYPES) {
    mediaSource[type] = attemptSync('mediaCapabilities', `mse:${type}`, () => {
      if (!MediaSourceCtor || typeof MediaSourceCtor.isTypeSupported !== 'function') {
        return NOT_AVAILABLE as unknown as boolean;
      }
      return MediaSourceCtor.isTypeSupported(type);
    }, false);
  }
  // Normalise the "MediaSource missing" sentinel away from a truthy-looking value.
  if (!MediaSourceCtor) {
    for (const key of Object.keys(mediaSource)) mediaSource[key] = false;
  }

  const images: Record<string, boolean> = {};
  for (const [mimeType, label] of IMAGE_TYPES) {
    images[label] = probeImage(mimeType);
  }

  return {
    audio,
    video,
    mediaSource,
    images,
    // Speaker/headset outputs. enumerateDevices() needs no permission prompt,
    // so this is a free extra bit of entropy (typically 1-3 on a laptop).
    audioOutputCount: await attempt<number>(
      'mediaCapabilities',
      'enumerateDevices audiooutput',
      async () => {
        if (
          !navigator.mediaDevices ||
          typeof navigator.mediaDevices.enumerateDevices !== 'function'
        ) {
          return NOT_AVAILABLE as unknown as number;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter((device) => device.kind === 'audiooutput').length;
      },
      NOT_AVAILABLE as unknown as number,
    ),
  };
}