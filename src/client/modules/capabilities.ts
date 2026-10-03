import type { CapabilitiesSignals } from '../../shared/types.js';
import { attemptSync, has, typeOf } from '../lib/attempt.js';

/**
 * SECTION 10 - Browser capability detection.
 *
 * WHAT THIS IS
 * A pure availability matrix: "does this API exist in this browser?". Each value
 * is the string "yes" / "no" / "n/a".
 *
 * WHAT THIS IS NOT
 * Nothing here is invoked beyond the bare minimum needed to answer "does it
 * exist":
 *   - `navigator.geolocation` is *not* called - only the property is read.
 *   - `navigator.clipboard` is not read or written.
 *   - `Notification.requestPermission()` is never called.
 *   - No RTCPeerConnection is constructed, so no ICE gathering and no IP leak.
 *   - Nothing is sent over the network.
 *
 * This combination is informative: a modern Chromium, a modern Safari and a
 * Firefox all answer "yes" to a different subset, and plenty of hardened or
 * enterprise browsers remove individual APIs on purpose.
 */
export async function collectCapabilities(): Promise<CapabilitiesSignals> {
  const yes = 'yes';
  const no = 'no';

  // A WebGL context is only obtainable by asking for one; creating an
  // offscreen context touches no display and opens no permission prompt.
  const webgl = attemptSync('capabilities', 'webgl', () => {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl') !== null ? yes : no;
  }, no);

  const webgl2 = attemptSync('capabilities', 'webgl2', () => {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null ? yes : no;
  }, no);

  // navigator.gpu is only non-null in secure contexts; its presence is enough.
  const webgpu = has(navigator, 'gpu') ? yes : no;

  const windowRef = window as unknown as Record<string, unknown>;

  return {
    // 2D/3D canvas rendering support.
    webgl,
    // WebGL2 support (compute shaders, instancing, MRT).
    webgl2,
    // WebGPU adapter access (explicit GPU compute/rendering API).
    webgpu,
    // WebAssembly: widely supported, often blocked by policy in enterprises.
    webAssembly: typeOf(windowRef.WebAssembly) === 'object' ? yes : no,
    // RTCPeerConnection exists. NOT constructed - no ICE, no IP leak.
    webrtc: typeOf(windowRef.RTCPeerConnection) === 'function' ? yes : no,
    // WebSocket transport support.
    webSocket: typeOf(windowRef.WebSocket) === 'function' ? yes : no,
    // Dedicated Web Workers.
    webWorkers: typeOf(windowRef.Worker) === 'function' ? yes : no,
    // Shared Workers (cross-tab shared background script).
    sharedWorkers: typeOf(windowRef.SharedWorker) === 'function' ? yes : no,
    // Service Workers: offline-capable background fetch.
    serviceWorkers:
      has(navigator, 'serviceWorker') && has(windowRef, 'ServiceWorkerContainer')
        ? yes
        : no,
    // IndexedDB: structured client-side database.
    indexedDB: has(windowRef, 'indexedDB') ? yes : no,
    // Cache API: request/response cache used by service workers.
    cacheApi: has(windowRef, 'caches') ? yes : no,
    // Cross-document messaging channel.
    broadcastChannel: has(windowRef, 'BroadcastChannel') ? yes : no,
    // Notifications API. requestPermission() is NEVER called.
    notificationsApi: typeOf(windowRef.Notification) === 'function' ? yes : no,
    // Geolocation API. The property is read; getCurrentPosition() is NOT called.
    geolocationApi: has(navigator, 'geolocation') ? yes : no,
    // Async Clipboard API. Nothing is read or written.
    clipboardApi: has(navigator, 'clipboard') ? yes : no,

    // Additional contextual features that help interpret the rest of the report.
    // Locale/timezone formatting.
    intl: has(windowRef, 'Intl') ? yes : no,
    // Whether WebGL will unmask the real GPU strings.
    webglDebugRendererInfo: attemptSync('capabilities', 'webglDebugRendererInfo', () => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      return gl && gl.getExtension('WEBGL_debug_renderer_info') ? yes : no;
    }, no),
    // Offscreen rendering in a worker.
    offscreenCanvas: has(windowRef, 'OffscreenCanvas') ? yes : no,
    // SCTP data channels. Feature only, no connection attempt.
    webRtcDataChannel: typeOf(windowRef.RTCDataChannel) === 'function' ? yes : no,
    // WebCodecs low-level encode/decode.
    webCodecs: has(windowRef, 'VideoEncoder') || has(windowRef, 'AudioEncoder') ? yes : no,
    // Screen/audio recording API. Nothing is recorded.
    mediaRecorder: typeOf(windowRef.MediaRecorder) === 'function' ? yes : no,
    // Speech synthesis.
    speechSynthesis: has(windowRef, 'speechSynthesis') ? yes : no,
    // Vibration motor access on supported devices.
    vibrate: typeOf(navigator.vibrate) === 'function' ? yes : no,
    // Battery Status API (deprecated and removed in most browsers).
    batteryStatus: has(navigator, 'getBattery') ? yes : no,
    // Network Information API.
    networkInformation: has(navigator, 'connection') ? yes : no,
  };
}