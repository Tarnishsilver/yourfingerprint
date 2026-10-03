/**
 * Shared type definitions for the fingerprint report.
 *
 * Everything in here describes data that a *normal website* can legitimately
 * observe about the browser it is running in. Nothing in this project stores,
 * correlates or compares any of it.
 */

/** A single scalar signal value. */
export type Signal = string | number | boolean | null;

/** Values that are exposed as the literal string "Not available". */
export type Unavailable = 'Not available';

/** Generic "maybe missing" wrapper used by most modules. */
export type Maybe<T> = T | Unavailable;

export interface BrowserSignals {
  /** Full UA string. Encodes browser name/version, OS, device class. */
  userAgent: Signal;
  /** UA string minus the "Mozilla/" prefix. */
  appVersion: Signal;
  /** Historical constant, almost always "Netscape". */
  appName: Signal;
  /** Historical constant, almost always "Mozilla". */
  appCodeName: Signal;
  /** Historical constant, usually "Gecko". */
  product: Signal;
  /** Historical constant, usually "20030107" (the Gecko engine date). */
  productSub: Signal;
  /** Browser vendor, e.g. "Google Inc.". */
  vendor: Signal;
  /** Vendor sub-string; deprecated, usually "". */
  vendorSub: Signal;
  /** OS platform, e.g. "Win32", "MacIntel", "Linux armv8l". */
  platform: Signal;
  /** Preferred UI language tag, e.g. "en-GB". */
  language: Signal;
  /** Ordered list of preferred languages (user ordered). */
  languages: string[] | Unavailable;
  /** Whether the browser accepts cookies for this origin. */
  cookieEnabled: Signal;
  /** Do Not Track preference. null / "1" / "unspecified". */
  doNotTrack: Signal;
  /** True when the page believes it is being automated (navigator.webdriver). */
  webdriver: Signal;
  /** Number of logical CPU cores the browser reports. */
  hardwareConcurrency: Signal;
  /** Approximate device RAM in GiB (coarse buckets only: .25/.5/1/2/4/8). */
  deviceMemory: Signal;
  /** Number of simultaneous touch points the screen supports. */
  maxTouchPoints: Signal;
  /** Whether the built-in PDF viewer plugin is enabled. */
  pdfViewerEnabled: Signal;
  /** Whether the browser believes it currently has network connectivity. */
  onLine: Signal;
}

export interface ScreenSignals {
  width: Signal;
  height: Signal;
  availWidth: Signal;
  availHeight: Signal;
  colorDepth: Signal;
  pixelDepth: Signal;
  innerWidth: Signal;
  innerHeight: Signal;
  outerWidth: Signal;
  outerHeight: Signal;
  devicePixelRatio: Signal;
  orientationType: Signal;
  orientationAngle: Signal;
  /** screen.availLeft / availTop where the browser exposes them. */
  availLeft: Signal;
  availTop: Signal;
}

export interface TimezoneSignals {
  /** IANA timezone name, e.g. "Europe/London". */
  timeZone: Signal;
  /** Minutes offset from UTC (east of Greenwich positive). */
  utcOffsetMinutes: Signal;
  /** Human readable rendering of the offset. */
  utcOffsetLabel: Signal;
  /** BCP-47 locale resolved from the browser default. */
  locale: Signal;
  /** Calendar system in use, e.g. "gregory". */
  calendar: Signal;
  /** Numbering system in use, e.g. "latn". */
  numberingSystem: Signal;
  /** Language subtag of the locale, e.g. "en". */
  language: Signal;
  /** Timezone reported by the Intl API of the first supported locale. */
  timeZoneName: Signal;
}

export interface HardwareSignals {
  /** Logical CPU cores. */
  cpuLogicalCores: Signal;
  /** Approximate RAM bucket in GiB. */
  deviceMemoryGiB: Signal;
  /** Maximum simultaneous touch points. */
  touchPoints: Signal;
  /** OS/platform string. */
  platform: Signal;
  /** "Win" | "Mac" | "Linux" | "Android" | "iOS" | "Other", derived. */
  platformFamily: Signal;
  /** CPU architecture, only when the browser volunteers it (client hints). */
  architecture: Signal;
  /** CPU bitness, only when the browser volunteers it (client hints). */
  bitness: Signal;
  /** Device model string, only when volunteered by client hints. */
  deviceModel: Signal;
  /** Device class derived from pointer/media queries. */
  mobileIndicator: Signal;
  /** "touch" | "no-touch" from the pointer media query. */
  pointerCoarse: Signal;
  /** Reduced-motion accessibility preference. */
  prefersReducedMotion: Signal;
  /** Colour-scheme preference ("dark" / "light"). */
  prefersColorScheme: Signal;
  /** Approximate colour gamut advertised via dynamic-range / P3 media queries. */
  colorGamut: Signal;
}

export interface CanvasSignals {
  /** SHA-256 over the rendered test image's raw RGBA bytes. */
  hash: Signal;
  /** Human readable description of exactly what was drawn. */
  testDescription: string;
  canvasWidth: Signal;
  canvasHeight: Signal;
  /** True when getContext('2d') + getImageData succeeded. */
  readable: Signal;
}

export interface WebGLParameters {
  MAX_TEXTURE_SIZE: Signal;
  MAX_VIEWPORT_DIMS: Signal;
  MAX_VERTEX_ATTRIBS: Signal;
  MAX_VARYING_VECTORS: Signal;
  MAX_TEXTURE_IMAGE_UNITS: Signal;
  MAX_VERTEX_UNIFORM_VECTORS: Signal;
  MAX_FRAGMENT_UNIFORM_VECTORS: Signal;
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: Signal;
  MAX_CUBE_MAP_TEXTURE_SIZE: Signal;
  MAX_RENDERBUFFER_SIZE: Signal;
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: Signal;
  ALIASED_LINE_WIDTH_RANGE: Signal;
  ALIASED_POINT_SIZE_RANGE: Signal;
  SUBPIXEL_BITS: Signal;
  RED_BITS: Signal;
  GREEN_BITS: Signal;
  BLUE_BITS: Signal;
  ALPHA_BITS: Signal;
  DEPTH_BITS: Signal;
  STENCIL_BITS: Signal;
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: Signal;
}

export interface WebGLSignals {
  /** "WebGL 1.0" / "WebGL 2.0" / "Not available". */
  version: Signal;
  /** GLSL shading language version string. */
  shadingLanguageVersion: Signal;
  /** GL_VENDOR from the context. */
  vendor: Signal;
  /** GL_RENDERER from the context. */
  renderer: Signal;
  /** Unmasked vendor via WEBGL_debug_renderer_info, when exposed. */
  unmaskedVendor: Signal;
  /** Unmasked renderer via WEBGL_debug_renderer_info, when exposed. */
  unmaskedRenderer: Signal;
  /** Which context flavour produced this data. */
  contextVersion: 'webgl' | 'webgl2' | Unavailable;
  /** True when WEBGL_debug_renderer_info is available. */
  debugRendererInfoAvailable: Signal;
  parameters: WebGLParameters;
  extensions: string[] | Unavailable;
  /** SHA-256 over the deterministic WebGL render test's raw RGBA bytes. */
  renderHash: Signal;
  /** Description of the deterministic render test. */
  renderTestDescription: string;
}

export interface AudioSignals {
  /** SHA-256 over the rendered offline audio sample data. */
  hash: Signal;
  /** Sample rate the OfflineAudioContext rendered at. */
  sampleRate: Signal;
  /** Number of samples per channel in the rendered buffer. */
  lengthSamples: Signal;
  /** Peak absolute sample value of the rendered buffer. */
  peakAmplitude: Signal;
  /** Root-mean-square level of the rendered buffer. */
  rmsAmplitude: Signal;
  /** Description of the deterministic audio graph that was rendered. */
  testDescription: string;
}

export interface FontChecks {
  /** Result of document.fonts.check() for this family. */
  fontsCheck: Signal;
  /** True when text metrics differ from the generic fallbacks. */
  measuredPresent: Signal;
  /** Raw per-baseline width deltas, for transparency. */
  widthDelta: Record<string, number> | Unavailable;
}

export interface FontsSignals {
  /** Detected font families (sorted). */
  detected: string[];
  /** Every family that was tested, in test order. */
  tested: string[];
  /** Per-family detail, keyed by family name. */
  checks: Record<string, FontChecks>;
  /** Explanation of how detection works and its known limits. */
  method: string;
}

export interface MediaDeviceEntry {
  /** "audioinput" | "audiooutput" | "videoinput". */
  kind: Signal;
  /**
   * Present only when the page already holds media permission.
   * Without permission browsers return "" here.
   */
  label: Signal;
  /** Ephemeral per-origin id, or "" when permission was not granted. */
  deviceId: Signal;
}

export interface MediaDevicesSignals {
  available: Signal;
  /** enumerateDevices() succeeded. */
  enumerated: Signal;
  deviceCount: number;
  devices: MediaDeviceEntry[];
  countsByKind: Record<string, number>;
  /** Explicit note that no permission was requested and labels are empty. */
  note: string;
}

export type CapabilityValue = Signal;

/** Everything here is a pure availability check. No API is invoked for real. */
export interface CapabilitiesSignals {
  webgl: CapabilityValue;
  webgl2: CapabilityValue;
  webgpu: CapabilityValue;
  webAssembly: CapabilityValue;
  webrtc: CapabilityValue;
  webSocket: CapabilityValue;
  webWorkers: CapabilityValue;
  sharedWorkers: CapabilityValue;
  serviceWorkers: CapabilityValue;
  indexedDB: CapabilityValue;
  cacheApi: CapabilityValue;
  broadcastChannel: CapabilityValue;
  notificationsApi: CapabilityValue;
  geolocationApi: CapabilityValue;
  clipboardApi: CapabilityValue;
  /** Extra contextual features, useful when reading the report. */
  intl: CapabilityValue;
  webglDebugRendererInfo: CapabilityValue;
  offscreenCanvas: CapabilityValue;
  webRtcDataChannel: CapabilityValue;
  webCodecs: CapabilityValue;
  mediaRecorder: CapabilityValue;
  speechSynthesis: CapabilityValue;
  vibrate: CapabilityValue;
  batteryStatus: CapabilityValue;
  networkInformation: CapabilityValue;
}

export interface StorageSignals {
  localStorage: Signal;
  sessionStorage: Signal;
  indexedDB: Signal;
  cacheApi: Signal;
  cookiesEnabled: Signal;
  serviceWorkerSupport: Signal;
  /** Explicit note that probes are written and deleted immediately. */
  note: string;
}

export interface NetworkSignals {
  /** Always documents the provenance of this block. */
  source: string;
  available: Signal;
  effectiveType: Signal;
  downlink: Signal;
  downlinkMax: Signal;
  rtt: Signal;
  saveData: Signal;
  type: Signal;
}

export type CanPlayType = 'probably' | 'maybe' | '';

export interface MediaCapabilitiesSignals {
  /** HTMLMediaElement.canPlayType() results for audio MIME types. */
  audio: Record<string, CanPlayType>;
  /** HTMLMediaElement.canPlayType() results for video MIME types. */
  video: Record<string, CanPlayType>;
  /** MediaSource.isTypeSupported() results for MSE MIME types. */
  mediaSource: Record<string, boolean>;
  /** Image format support probed locally via canvas.toDataURL / ImageDecoder. */
  images: Record<string, boolean>;
  /** Number of distinct audio/video speakers discoverable. */
  audioOutputCount: Signal;
}

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable';

export type PermissionsSignals = Record<string, PermissionState>;

export interface BrandEntry {
  brand: Signal;
  version: Signal;
}

export interface UserAgentDataSignals {
  available: Signal;
  brands: BrandEntry[] | Unavailable;
  mobile: Signal;
  platform: Signal;
  /** High-entropy hints, only requested when the user opts in. */
  highEntropy: Record<string, Signal> | Unavailable;
  /** True when the high-entropy request was actually sent. */
  highEntropyRequested: Signal;
  /** Explains that high-entropy hints are volunteered by the browser. */
  note: string;
}

/** The client-side half of the report. Exactly the keys named in the spec. */
export interface FingerprintReport {
  browser: BrowserSignals;
  screen: ScreenSignals;
  timezone: TimezoneSignals;
  hardware: HardwareSignals;
  canvas: CanvasSignals;
  webgl: WebGLSignals;
  audio: AudioSignals;
  fonts: string[];
  mediaDevices: MediaDevicesSignals;
  capabilities: CapabilitiesSignals;
  storage: StorageSignals;
  network: NetworkSignals;
  mediaCapabilities: MediaCapabilitiesSignals;
  permissions: PermissionsSignals;
  userAgentData: UserAgentDataSignals;
}

/** Diagnostics about probes that threw. Never blocks the scan. */
export interface ScanDiagnostic {
  module: string;
  signal: string;
  reason: string;
}

export interface ServerGeoInfo {
  country: Signal;
  region: Signal;
  city: Signal;
  isp: Signal;
  asn: Signal;
  timezone: Signal;
}

/** Server-observed request data. Deliberately kept out of the client hash. */
export interface ServerInfo {
  /** Label used verbatim in the UI. */
  ipLabel: string;
  /** "IP address observed by the server". */
  ip: Signal;
  /** "IPv4" | "IPv6". */
  ipVersion: Signal;
  userAgent: Signal;
  accept: Signal;
  acceptLanguage: Signal;
  acceptEncoding: Signal;
  referer: Signal;
  secChUa: Signal;
  secChUaMobile: Signal;
  secChUaPlatform: Signal;
  secChUaPlatformVersion: Signal;
  secChUaFullVersionList: Signal;
  /** Every other request header the server received, verbatim. */
  headers: Record<string, string>;
  /** Omitted entirely when no provider is configured. */
  geo?: ServerGeoInfo & { label: string; note: string; provider: string };
  /** Provenance notice rendered above the SERVER section. */
  note: string;
}

/** The complete payload the UI renders, downloads and copies. */
export interface FullReport {
  /** Metadata about this run. Not part of the client fingerprint hash. */
  meta: {
    tool: string;
    generatedAt: string;
    durationMs: number;
    clientFingerprintHash: string;
    hashNotice: string;
    highEntropyRequested: boolean;
    diagnostics: ScanDiagnostic[];
    privacyNotice: string;
  };
  /** Hash input: client-side signals only. */
  fingerprint: FingerprintReport;
  /** Shown in a visually separate section. Never hashed. */
  server: ServerInfo | null;
  /** Error text if the server-side lookup failed. */
  serverError?: string;
}