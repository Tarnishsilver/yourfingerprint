import type { AudioSignals } from '../../shared/types.js';
import { NOT_AVAILABLE, attempt, attemptSync } from '../lib/attempt.js';
import { sha256Hex } from '../lib/sha256.js';

/**
 * SECTION 7 - Audio fingerprint via the Web Audio API.
 *
 * WHAT THIS IS
 * `OfflineAudioContext` renders an audio graph faster than real time, with no
 * speakers involved and no microphone access. We build a fixed graph, render it,
 * and hash the resulting sample data.
 *
 * WHY THE OUTPUT VARIES
 * The `DynamicsCompressorNode` and `BiquadFilterNode` implementations are not
 * specified bit-exactly, so different CPU architectures, browser versions and
 * OS kernels quantise and smooth the signal slightly differently. The resulting
 * low-order bits of the samples are effectively a "CPU audio DSP fingerprint".
 *
 * PRIVACY NOTE (requirement #7 and #9)
 * There is no `getUserMedia()` call anywhere in this file. Nothing here asks for
 * microphone permission and nothing here can record the user.
 */
export const AUDIO_TEST_DESCRIPTION = [
  'Two deterministic graphs rendered with OfflineAudioContext at 44100 Hz for',
  '1 second, mono:',
  'a) OscillatorNode (triangle, 10000 Hz) -> gain(0.8) -> BiquadFilterNode',
  '   (lowpass, Q=0.8) -> DynamicsCompressorNode (threshold -50, knee 6, ratio',
  '   12, attack 0.003, release 0.25) -> destination',
  'b) OscillatorNode (sawtooth, 10000 Hz) -> gain(0.8) -> DynamicsCompressorNode',
  '   (threshold -50, knee 6, ratio 12, attack 0.01, release 0.1) -> destination',
  'The two rendered buffers are concatenated as raw little-endian Float32 bytes',
  'and hashed with SHA-256. No microphone, speaker or permission is involved.',
].join(' ');

const SAMPLE_RATE = 44100;
const DURATION_SECONDS = 1;

/** Resolves the OfflineAudioContext constructor with a vendor-prefix fallback. */
function getOfflineAudioContextCtor():
  | typeof OfflineAudioContext
  | null {
  return attemptSync<typeof OfflineAudioContext | null>(
    'audio',
    'OfflineAudioContext',
    () => {
      const scope = window as unknown as {
        OfflineAudioContext?: typeof OfflineAudioContext;
        webkitOfflineAudioContext?: typeof OfflineAudioContext;
      };
      return scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext ?? null;
    },
    null,
  );
}

/** Builds and renders one fixed graph, returning its raw sample bytes. */
async function renderGraph(
  Ctor: typeof OfflineAudioContext,
  variant: 'lowpass' | 'saturate',
): Promise<{ bytes: Uint8Array; peak: number; rms: number }> {
  const length = SAMPLE_RATE * DURATION_SECONDS;
  const ctx = new Ctor(1, length, SAMPLE_RATE);

  const oscillator = ctx.createOscillator();
  oscillator.type = variant === 'lowpass' ? 'triangle' : 'sawtooth';
  oscillator.frequency.value = 10000;

  const gain = ctx.createGain();
  gain.gain.value = 0.8;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -50;
  compressor.knee.value = 6;
  compressor.ratio.value = 12;
  compressor.attack.value = variant === 'lowpass' ? 0.003 : 0.01;
  compressor.release.value = variant === 'lowpass' ? 0.25 : 0.1;

  oscillator.connect(gain);

  if (variant === 'lowpass') {
    // Extra IIR stage: filter state rounding is very implementation specific.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4000;
    filter.Q.value = 0.8;
    gain.connect(filter);
    filter.connect(compressor);
  } else {
    gain.connect(compressor);
  }

  compressor.connect(ctx.destination);

  // start(0) / stop(duration) makes the render deterministic.
  oscillator.start(0);
  oscillator.stop(DURATION_SECONDS);

  const buffer = await ctx.startRendering();
  const channel = buffer.getChannelData(0);

  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < channel.length; i++) {
    const sample = channel[i];
    const magnitude = Math.abs(sample);
    if (magnitude > peak) peak = magnitude;
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, channel.length));

  // Copy out of the AudioBuffer into a plain byte array we can hash.
  const bytes = new Uint8Array(channel.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < channel.length; i++) {
    view.setFloat32(i * 4, channel[i], true);
  }

  return { bytes, peak, rms };
}

export async function collectAudio(): Promise<AudioSignals> {
  const fallback: AudioSignals = {
    hash: NOT_AVAILABLE,
    sampleRate: NOT_AVAILABLE,
    lengthSamples: NOT_AVAILABLE,
    peakAmplitude: NOT_AVAILABLE,
    rmsAmplitude: NOT_AVAILABLE,
    testDescription: AUDIO_TEST_DESCRIPTION,
  };

  return attempt<AudioSignals>('audio', 'OfflineAudioContext', async () => {
    const Ctor = getOfflineAudioContextCtor();
    if (!Ctor) throw new Error('OfflineAudioContext is not implemented in this browser');

    const first = await renderGraph(Ctor, 'lowpass');
    const second = await renderGraph(Ctor, 'saturate');

    // Concatenate both variants so the hash covers two different DSP paths.
    const combined = new Uint8Array(first.bytes.length + second.bytes.length);
    combined.set(first.bytes, 0);
    combined.set(second.bytes, first.bytes.length);

    const hash = await sha256Hex(combined);

    return {
      hash,
      sampleRate: SAMPLE_RATE,
      lengthSamples: SAMPLE_RATE * DURATION_SECONDS,
      peakAmplitude: round(Math.max(first.peak, second.peak)),
      rmsAmplitude: round(Math.max(first.rms, second.rms)),
      testDescription: AUDIO_TEST_DESCRIPTION,
    };
  }, fallback);
}

function round(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(8)) : 0;
}