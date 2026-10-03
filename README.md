# Browser Fingerprint Lab — collector

A blank web page that runs a full browser fingerprint scan the moment it loads and
POSTs the result to a small Node server, which appends **one document per scan** to a
MongoDB collection.

No UI. No buttons. No results page. Open the URL, and the collection is already done.

```
browser loads  ──▶  15 signal modules run  ──▶  SHA-256 of canonical JSON
                                                        │
                                                        ▼
                                              POST /api/collect
                                                        │
                        server appends what it saw (IP, headers) + optional geo
                                                        │
                                                        ▼
                                            MongoDB: one document, append-only
```

---

## ⚠️ Read this before you expose it

This is a **collection endpoint**. Anyone whose browser loads the page produces a
permanent record, and the server also records the IP that request came from.

Three things in it are deliberate, not accidental:

1. **`HOST` defaults to `127.0.0.1`.** Nothing outside your machine can reach it unless
   you change that.
2. **`POST /api/collect` refuses cross-origin submissions.** If some unrelated page on the
   internet embeds a `fetch()` to your endpoint, the server rejects it. Without this
   check, any website could silently turn your collector into a beacon for its visitors
   and you would be storing their IPs without them knowing. Set `ALLOW_CROSS_ORIGIN=1`
   only if you deliberately want that.
3. **Nothing here compares fingerprints.** No dedup, no similarity scoring, no
   uniqueness estimate, no "have I seen this before". Documents are appended as they
   arrive. If you later add matching logic, you are building a tracking system, and
   that is a different project.

**No permission is ever requested.** `getUserMedia`, `getCurrentPosition`,
`Notification.requestPermission`, `permissions.request` and `RTCPeerConnection` appear
nowhere in the client bundle. A camera or microphone is never activated. There is no
WebRTC IP-leak technique here, and no cookie is set or read on either side.

---

## 1. Project structure

```
location_tracker/
├── package.json                 # runtime deps: mongodb, dotenv
├── vercel.json                  # Vercel build config (buildCommand, outputDirectory)
├── tsconfig.json                # strict typecheck for the browser code
├── tsconfig.server.json         # build config for the local Node server
├── tsconfig.api.json            # typecheck for the Vercel functions
├── .env                         # YOUR config (gitignored) - see .env.example
├── .env.example                 # documented template
├── .gitignore
├── README.md
│
├── api/                         # Vercel serverless functions
│   ├── collect.ts               # POST /api/collect
│   └── health.ts                # GET  /api/health
│
├── scripts/
│   └── inspect.mjs              # read-only CLI to look at what was stored
│
├── public/
│   ├── index.html               # blank page; loads the bundle and nothing else
│   └── assets/app.js            # BUILD OUTPUT (esbuild bundle, generated)
│
└── src/
    ├── shared/
    │   ├── types.ts             # every report interface
    │   └── collect.ts           # the POST payload / response contracts
    │
    ├── client/                  # runs in the browser, no UI
    │   ├── main.ts              # auto-runs on load: scan -> hash -> POST
    │   │
    │   ├── lib/
    │   │   ├── attempt.ts       # error boundary: "Not available" + diagnostics
    │   │   ├── sha256.ts        # SHA-256 (WebCrypto, with a pure-JS fallback)
    │   │   └── normalize.ts     # deterministic canonical JSON (recursive key sort)
    │   │
    │   └── modules/             # one module per signal category
    │       ├── index.ts         # aggregator
    │       ├── browser.ts       #  1. navigator identity
    │       ├── screen.ts        #  2. screen and viewport geometry
    │       ├── timezone.ts      #  3. Intl timezone and locale
    │       ├── hardware.ts      #  4. browser-exposed hardware
    │       ├── canvas.ts        #  5. canvas render test + SHA-256
    │       ├── webgl.ts         #  6. WebGL limits/extensions + render test
    │       ├── audio.ts         #  7. OfflineAudioContext render test + SHA-256
    │       ├── fonts.ts         #  8. font detection (two methods)
    │       ├── mediaDevices.ts  #  9. enumerateDevices(), no permission
    │       ├── capabilities.ts  # 10. API availability matrix
    │       ├── storage.ts       # 11. storage availability
    │       ├── network.ts       # 12. Network Information API
    │       ├── mediaCapabilities.ts # 13. codec and image format support
    │       ├── permissions.ts   # 14. permission state, read-only
    │       └── userAgentData.ts # 15. User-Agent Client Hints
    │
    └── server/                  # shared by both runtimes
        ├── index.ts             # LOCAL node:http server (npm start)
        ├── db.ts                # MongoDB connection + insert (globalThis-cached)
        ├── serverInfo.ts        # what the server observed on the request
        ├── origin.ts            # cross-origin guard + proxy-trust decision
        └── geoip.ts             # OPTIONAL IP geolocation (off by default)
```

The client and the signal modules are identical in both runtimes. Only the two
request handlers differ (`src/server/index.ts` locally, `api/collect.ts` on
Vercel); `db.ts`, `serverInfo.ts`, `origin.ts` and `geoip.ts` are shared.

---

## 2. Installation

```bash
cd location_tracker
cp .env.example .env
# edit .env and put your MONGODB_URI in it
npm install
```

Runtime dependencies: `mongodb` and `dotenv`. Dev dependencies: `typescript`,
`esbuild`, `@types/node`. No third-party tracking or fingerprinting library is used —
everything is written against standard web APIs.

---

## 3. Running

```bash
npm run dev      # build, then start
# or
npm run build
npm start
```

Then open **<http://127.0.0.1:8787/>**. The page is blank. The scan runs
automatically. Open the browser console to see the outcome:

```
[fingerprint-lab] stored 6ac15c71c97679b2d510cace in fingerprint_lab.observations (112 ms, hash 0c9d9de3…)
[fingerprint-lab] 3 probe(s) degraded to "Not available": [{module: 'webgl', signal: 'context', …}]
```

### Seeing what was stored

```bash
npm run inspect                  # 5 most recent documents, full JSON
npm run inspect -- --summary     # compact table: time, hash, ip, platform, timezone
npm run inspect -- --count       # just the total
npm run inspect -- --limit 20
npm run inspect -- --id <_id>    # one document
```

Or with `mongosh` directly:

```javascript
use fingerprint_lab
db.observations.countDocuments()
db.observations.find().sort({ storedAt: -1 }).limit(10)
db.observations.findOne({}, { fingerprint: 1, server: 1 })
```

### Configuration

| Variable | Required | Default | Applies on | Meaning |
| --- | --- | --- | --- | --- |
| `MONGODB_URI` | **yes** | — | both | Connection string. Without it, `POST /api/collect` returns 503. **The only variable you must set on Vercel.** |
| `MONGODB_DATABASE` | no | `fingerprint_lab` | both | Database name. |
| `MONGODB_COLLECTION` | no | `observations` | both | Collection name. |
| `MONGODB_TIMEOUT_MS` | no | `5000` | both | Connect / server-selection timeout. Keep it below the function's `maxDuration`. |
| `HOST` | no | `127.0.0.1` | **local only** | Bind address for `npm start`. **Ignored on Vercel** — the platform assigns the listen address. |
| `PORT` | no | `8787` | **local only** | Same. |
| `TRUST_PROXY` | no | auto | both | `1` reads the client IP from `X-Forwarded-For`. **Automatically enabled on Vercel** (`VERCEL=1`), and it must be, or you would store Vercel's internal IP instead of the visitor's. |
| `GEOIP_ENDPOINT` | no | **off** | both | A JSON endpoint mapping IP → country/region/city/ISP/ASN/timezone. Unset ⇒ no `geo` key is stored at all. |
| `GEOIP_PROVIDER` | no | endpoint host | both | Label shown next to the geo block. |
| `GEOIP_TIMEOUT_MS` | no | `2000` | both | Geo lookup timeout. A geo failure never blocks the insert. |
| `ALLOW_CROSS_ORIGIN` | no | **off** | both | `1` allows third-party pages to POST. Not needed on Vercel (page and function share a domain). Leave it off. |

---

## 4. Deploying to Vercel

The app ships with both a local long-lived server and a Vercel serverless path.
They run the same signal collection and the same insert; only the request
plumbing differs.

| | Local (`npm start`) | Vercel |
| --- | --- | --- |
| Server | `src/server/index.ts` — long-lived `node:http` | `api/collect.ts` — serverless function |
| Routing | own | `vercel.json` + `/api/*` convention |
| **HOST / PORT** | **used** | **ignored — the platform assigns the listen address** |
| Client IP source | socket | `X-Forwarded-For` (auto, see below) |
| Request body | read from the stream | already parsed into `req.body` |

### Answering the `HOST` question directly

**Do not set `HOST` (or `PORT`) on Vercel.** They are bind addresses for the
long-running `node:http` server used by `npm start`. On Vercel the app is a
stateless function and the platform owns the listen address, so those variables
are simply never read. Setting them changes nothing. (`vercel dev`, the local
Vercel emulator, does honour them and defaults to port 3000.)

What *does* matter on Vercel:

- **`MONGODB_URI` is the only variable you must set.** Everything else has a
  working default.
- **`TRUST_PROXY` is not needed.** The code turns proxy trust on automatically
  when `VERCEL=1`, which the platform sets for you. This is required for
  correctness, not security: a Vercel function sits behind Vercel's proxy, so
  `req.socket.remoteAddress` is an *internal* Vercel address. The real client IP
  arrives in `X-Forwarded-For` / `X-Real-IP`, which Vercel overwrites rather than
  passing through from the client. Without this you would silently store Vercel's
  IP instead of the visitor's.
- **`ALLOW_CROSS_ORIGIN` is not needed either.** On Vercel your page and your
  function share a domain, so a genuine same-origin request from your own
  deployment passes the guard normally.
- **`.env` is not deployed** — it is gitignored. Add the variables in
  **Project → Settings → Environment Variables**, and remember that Vercel
  environments are separate: a variable set on *Preview Only* is invisible to
  *Production* and vice versa. `/api/health` reports `vercelEnv` so you can
  confirm which one you are hitting.

### Steps

```bash
# 1. make sure it builds
npm run verify

# 2. deploy
npx vercel            # first time
npx vercel --prod     # subsequent deploys
```

`vercel.json` sets `buildCommand: "npm run build"` and `outputDirectory: "public"`,
so the client bundle is built and the blank page is served from there. Nothing
else is needed.

### MongoDB Atlas network access

If you use Atlas, its **Network Access** must allow Vercel's egress. Serverless
egress IPs are not a fixed range, so use an Access List entry of
`0.0.0.0/0` (plus `::/0`) or an IP Access List "allow all from anywhere". Keep
the database user credentialed — this endpoint is public once deployed.

### Things that will bite you

- **Cold starts.** The first request after a period of inactivity pays for
  loading the MongoDB driver and opening the TCP + TLS connection to Atlas. That
  can be several seconds. The connection is cached on `globalThis` with a small
  pool (`maxPoolSize: 5`) so warm invocations reuse it, but a cold start is
  unavoidable on serverless. `maxDuration` is set to 30 s for this reason; on the
  Hobby plan the real ceiling is lower, so make sure the connection timeout
  (`MONGODB_TIMEOUT_MS`) is comfortably below it.
- **MongoDB driver bundling.** `mongodb` uses dynamic `require`, so the function
  must be emitted as CommonJS (which is what `@vercel/node` does). Do not "fix"
  this by switching the project to ESM output for the API.
- **Region latency.** The function runs in Vercel's default region, which may be
  far from your Atlas cluster. Both requests and responses cross that gap on
  every scan. Set `regions` in `vercel.json` to co-locate with the database if
  latency matters.
- **No deduplication.** Every page load is a new document. Repeatedly reloading
  the page will grow the collection without limit.

### Verify a deployment

```bash
curl -s https://your-app.vercel.app/api/health | jq
```
`database.configured: true` and `trustProxy: true` are the two things to confirm
first. Then open the URL and check the console for
`[fingerprint-lab] stored <id> …`.

---

## 5. HTTP endpoints

| Endpoint | Method | Local | Vercel | Purpose |
| --- | --- | --- | --- | --- |
| `/` | GET | ✅ | ✅ | The blank page. Loads the bundle, which auto-runs the scan. |
| `/api/collect` | POST | ✅ | ✅ | Stores one observation. Returns `{ status, id, storedAt, location }`. |
| `/api/health` | GET | ✅ | ✅ | MongoDB state, geo config, cross-origin and proxy-trust settings, Vercel env. Debugging only. |

The client posts to `/api/collect` in both runtimes — the path does not change, so
no client rebuild is needed when you switch between them.

### `POST /api/collect`

Request body:

```jsonc
{
  "fingerprint": { /* the 16-key client signal object */ },
  "clientFingerprintHash": "…64 hex chars…",
  "clientGeneratedAt": "2026-10-04T09:12:44.318Z",
  "highEntropyRequested": true,
  "diagnostics": [{ "module": "webgl", "signal": "context", "reason": "…" }]
}
```

Responses:

| Code | When |
| --- | --- |
| `201` | Stored. |
| `400` | Body missing, unparseable, or `clientFingerprintHash` is not 64 hex characters. |
| `403` | Cross-origin browser submission (see the warning at the top). |
| `405` | Wrong method. |
| `413` | Body over 4 MB. |
| `503` | `MONGODB_URI` unset, or the MongoDB write failed. The process stays up and retries on the next scan. |

---

## 6. Stored document

```jsonc
{
  "_id": ObjectId("6ac15c71c97679b2d510cace"),
  "storedAt": ISODate("2026-10-04T09:12:44.401Z"),   // server clock
  "clientGeneratedAt": "2026-10-04T09:12:44.318Z",    // browser clock

  // SHA-256 of canonicalJSON(fingerprint) — client-side signals only.
  "clientFingerprintHash": "7a3f91c0e5b248d6…",

  // The 16 keys, verbatim, exactly as the modules produced them.
  "fingerprint": {
    "browser": {}, "screen": {}, "timezone": {}, "hardware": {},
    "canvas": {}, "webgl": {}, "audio": {}, "fonts": [],
    "mediaDevices": {}, "capabilities": {}, "storage": {}, "network": {},
    "mediaCapabilities": {}, "permissions": {}, "userAgentData": {}
  },

  // What the server saw on THIS request. Not readable by the browser, and
  // deliberately NOT part of clientFingerprintHash.
  "server": {
    "ipLabel": "IP address observed by the server",
    "ip": "203.0.113.42",
    "ipVersion": "IPv4",
    "userAgent": "Mozilla/5.0 …",
    "accept": "application/json",
    "acceptLanguage": "en-GB,en;q=0.9",
    "acceptEncoding": "gzip, deflate, br",
    "referer": "http://127.0.0.1:8787/",
    "secChUa": "\"Chromium\";v=\"131\", \"Google Chrome\";v=\"131\", …",
    "secChUaMobile": "?0",
    "secChUaPlatform": "\"Windows\"",
    "secChUaPlatformVersion": "\"15.0.0\"",
    "secChUaFullVersionList": "Chromium=131.0.6778.86, …",
    "headers": { /* every other request header, verbatim; cookie excluded */ },
    "note": "…"
  },

  // Only when GEOIP_ENDPOINT is configured. Absent otherwise.
  "geo": {
    "label": "Approximate location derived from IP address",
    "note": "… It is NOT GPS …",
    "provider": "my-provider",
    "country": "GB", "region": "England", "city": "London",
    "isp": "…", "asn": "AS64500", "timezone": "Europe/London"
  },

  // Probes that failed and degraded to "Not available". Kept so silent
  // degradation is visible instead of looking like a real "Not available".
  "diagnostics": [{ "module": "webgl", "signal": "context", "reason": "…" }],

  "source": { "tool": "browser-fingerprint-lab", "userAgent": "Mozilla/5.0 …" }
}
```

The only index is on `storedAt` (descending), so you can slice the log by time while
debugging. There is deliberately **no index on the hash**: nothing in the application
queries by fingerprint, because querying by fingerprint is how collection turns into
tracking.

---

## 7. What every collected signal means

### Browser (`navigator`)

| Signal | What it tells you |
| --- | --- |
| `userAgent` | Browser + version, engine, OS, device class, frozen into one string. The most over-used signal on the web, and the one browsers are shrinking. |
| `appVersion` | The UA string minus the `Mozilla/` prefix. |
| `appName` | Frozen 1994 constant, `"Netscape"` everywhere. Useful only to spot a rewritten UA. |
| `appCodeName` | Frozen constant, `"Mozilla"`. |
| `product` | Frozen constant, `"Gecko"` even in Chrome and Safari. |
| `productSub` | Frozen constant, `"20030107"`. |
| `vendor` | Browser maker: `"Google Inc."`, `"Apple Computer, Inc."`. |
| `vendorSub` | Deprecated, empty in modern browsers. |
| `platform` | OS platform: `Win32`, `MacIntel`, `Linux x86_64`, `Linux armv8l` — the last distinguishes ARM Linux from Intel. |
| `language` / `languages` | Preferred UI language and the full ordered list. The order is user-chosen, so it adds a little beyond the set. |
| `cookieEnabled` | `false` in Tor, some privacy modes, and Safari under strict ITP. |
| `doNotTrack` | DNT preference. `null` in Chromium, `"1"`/`"unspecified"` in Firefox. Presence or absence is itself a signal. |
| `webdriver` | `true` when the page suspects automation (headless Chrome, Selenium, Playwright). |
| `hardwareConcurrency` | Logical cores, **capped by the browser** (often at 8). A device-class signal, not a CPU. |
| `deviceMemory` | RAM in GiB, quantised to `0.25/0.5/1/2/4/8`. Chrome only. Six values by design. |
| `maxTouchPoints` | Simultaneous touch points. `0` desktop, `5` phone, `10` some iPads. |
| `pdfViewerEnabled` | Internal PDF viewer enabled. Always `true` in mainstream browsers. |
| `onLine` | The browser's own belief about connectivity. Coarse and often wrong. |

### Screen

`width`/`height` (screen size in CSS pixels — among the most stable and identifying raw
values available), `availWidth`/`availHeight` (minus OS chrome, so the taskbar/dock
shows up in the numbers), `colorDepth`/`pixelDepth` (24 vs 30 distinguishes sRGB from a
10-bit pipeline), `innerWidth`/`innerHeight` (viewport — volatile, but window-management
habits are distinctive), `outerWidth`/`outerHeight`, `devicePixelRatio`
(1/1.25/1.5/2/3 — separates a retina laptop from an external monitor),
`orientation.type`/`orientation.angle`, and `availLeft`/`availTop` (screen insets, a
multi-monitor hint when non-zero).

### Timezone and locale

`timeZone` (IANA zone from the OS — stronger than the offset, since `Europe/London` and
`Europe/Dublin` differ for part of the year), `utcOffsetMinutes`/`utcOffsetLabel`,
`locale`, `calendar` (`gregory`, `japanese`, `islamic`, `buddhist`, `hebrew`),
`numberingSystem` (`latn`, `arab`, `deva`, `thai`, `hanidec`), `language`.

### Hardware (browser-exposed only — no OS enumeration)

`cpuLogicalCores`, `deviceMemoryGiB`, `touchPoints`, `platform`, `platformFamily`,
`architecture`/`bitness`/`deviceModel` (only ever from high-entropy client hints the
browser volunteers), `mobileIndicator`, `pointerCoarse`, `prefersReducedMotion`,
`prefersColorScheme`, `colorGamut`.

### Canvas

A fixed 300×80 2D drawing — flat fill, four translucent primitives, a linear and a radial
gradient, hairline and thick strokes with bezier and arc paths, a `multiply` blend, four
font families at several sizes with letter-spacing at fractional offsets, and a shadow —
is rasterised, read back with `getImageData()`, and the raw RGBA bytes hashed.

Rasterisation is not specified to the bit: GPU drivers, anti-aliasing, font hinting,
sub-pixel positioning and gamma all end up in the pixels. That is exactly why the
technique works, and why `testDescription` is stored alongside the hash so the test is
self-documenting. `readable: false` means the canvas was tainted or unavailable.

### WebGL / GPU

Configuration: `VERSION`, `SHADING_LANGUAGE_VERSION`, `VENDOR`, `RENDERER`, unmasked
vendor/renderer from `WEBGL_debug_renderer_info` when permitted, the full
supported-extension list, and 22 limits (texture size, viewport dims, vertex
attributes, varying vectors, texture image units, vertex/fragment uniform vectors,
combined texture units, vertex texture units, cube-map and renderbuffer sizes,
anisotropic filtering, aliased line/point ranges, sub-pixel bits, R/G/B/A/depth/stencil
bit layout).

Plus a fixed 200×120 shader scene rendered and read back with `readPixels()` and hashed.
The shader combines a `sin()` wave, a disc distance test and `mediump` arithmetic —
mediump precision and blending rounding differ per GPU, so two cards can report identical
configuration and still hash differently.

`WEBGL_debug_renderer_info` is gated behind a privacy setting in current browsers, so
`"Not available"` there is the expected, honest result.

### Audio

Two fixed graphs through `OfflineAudioContext` at 44 100 Hz for one second, mono:

1. triangle 10 kHz → gain(0.8) → lowpass biquad (Q 0.8) → compressor (threshold −50,
   knee 6, ratio 12, attack 0.003, release 0.25)
2. sawtooth 10 kHz → gain(0.8) → compressor (attack 0.01, release 0.1)

Concatenated as little-endian `Float32` bytes and hashed. `DynamicsCompressorNode` and
`BiquadFilterNode` are not specified bit-exactly, so different CPUs, browser versions and
OS kernels round differently and the low-order sample bits become a CPU-audio-DSP
fingerprint. Peak and RMS are stored so the output is auditable.

**No `getUserMedia()` exists in this module.** `OfflineAudioContext` uses no hardware.

### Fonts

Two local methods. `document.fonts.check()` is recorded per family but over-reports (it
also returns `true` for generic fallbacks and downloadable fonts). **Metric comparison**
is what populates the detected list: render the same string in `"Candidate", monospace`,
`serif` and `sans-serif` and compare against the bare generic family; any measurable
change means the candidate is genuinely installed.

52 families are tested — including all 16 required ones plus CJK and emoji families, which
is what makes the signal worthwhile outside a Latin-script system. No OS-level font
enumeration.

### Media devices

`enumerateDevices()` needs no permission and shows no prompt. Without prior media
permission every entry has an empty `deviceId` and `label`, so you get counts and kinds
only — and that asymmetry is itself a signal ("this origin has never held media
permission"). No `getUserMedia()`, no WebRTC candidate probing.

### Capabilities

A pure `does this API exist` matrix: WebGL, WebGL2, WebGPU, WebAssembly, WebRTC,
WebSocket, Web Workers, Shared Workers, Service Workers, IndexedDB, Cache API,
BroadcastChannel, Notifications, Geolocation, Clipboard, plus Intl,
`WEBGL_debug_renderer_info`, OffscreenCanvas, WebRTC DataChannel, WebCodecs,
MediaRecorder, SpeechSynthesis, Vibration, Battery Status, Network Information.

Only the property read needed to answer the question is performed:
`navigator.geolocation` is not called, `navigator.clipboard` is not read or written,
`Notification.requestPermission()` is never called, and no `RTCPeerConnection` is
constructed — so no ICE gathering and no IP leak.

### Storage

`localStorage` and `sessionStorage` are checked with a **real write-then-delete** on the
fixed key `__fpl_probe__`, because feature detection alone lies: private windows,
`file://` origins and enterprise policy all leave the property present while throwing on
write. IndexedDB, Cache API and Service Worker support are presence-checked only —
opening a database would create persistent state. No unique identifier is generated.

### Network

`effectiveType`, `downlink`, `downlinkMax`, `rtt`, `saveData`, `type` from
`navigator.connection`. **Browser-reported estimates**, self-declared about the link, not
measured by the page or the server — `effectiveType` is a coarse bucket, `downlink` is
rounded to 25 kbit/s, `rtt` is rounded, `type` can simply be wrong. Chromium-only.

### Media capabilities

`canPlayType()` for 11 audio and 10 video MIME types (the exact `""`/`"maybe"`/`"probably"`
strings are stored), `MediaSource.isTypeSupported()` for 11 MSE combinations, image
formats (`png`, `jpeg`, `webp`, `avif`, `gif`, `bmp`, `ico`, `svg`) probed by asking a
1×1 canvas to encode each one — a pure local test, no download — and the `audiooutput`
device count from the permissionless `enumerateDevices()`.

### Permissions

`navigator.permissions.query()` for `geolocation`, `camera`, `microphone`, `notifications`
→ `granted` / `denied` / `prompt` / `unavailable`. Legacy aliases are tried; anything the
browser rejects with a `TypeError` is reported as `unavailable` rather than guessed.
Permission state is persistent per-origin state, not a device property, so it is
meaningful behavioural data. **`request()` is never called** — `prompt` means a prompt
*would* appear if something asked, and nothing did.

### Client hints

`navigator.userAgentData`: `brands` (GREASE entries included — their presence and
ordering vary by build), `mobile`, `platform`.

**High-entropy hints are requested unconditionally in this build.** There is no UI, so
there is no checkbox — the toggle is the `REQUEST_HIGH_ENTROPY_HINTS` constant at the top
of `src/client/main.ts`; set it to `false` to stay on low-entropy only.

Be clear about what that costs: requesting them makes the browser add `Sec-CH-UA-Arch`,
`Sec-CH-UA-Bitness`, `Sec-CH-UA-Model`, `Sec-CH-UA-Platform-Version`,
`Sec-CH-UA-Full-Version-List` and `Sec-CH-UA-WoW64` to the POST — and `model` can name
the exact device. That is stored under `fingerprint.userAgentData.highEntropy`, labelled
`highEntropyRequested`, and visible in `server.secChUaFullVersionList`.

### Server-observed

IP address (labelled verbatim **"IP address observed by the server"**), IPv4/IPv6,
`User-Agent`, `Accept`, `Accept-Language`, `Accept-Encoding`, `Referer`, `Sec-CH-UA`,
`Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform`, `Sec-CH-UA-Platform-Version`,
`Sec-CH-UA-Full-Version-List`, and every other request header verbatim.

The `Cookie` header is **not captured**. The IP comes from the socket, or from
`X-Forwarded-For` only when `TRUST_PROXY=1`.

### IP geolocation (optional, off by default)

With no `GEOIP_ENDPOINT` configured, no `geo` key is stored at all — no bundled
database, no default provider, no third-party call. When configured, it is stored under
the label **"Approximate location derived from IP address"** with an explicit note that
this is not GPS: no permission is requested, no positioning API is called, and the answer
can be hundreds of kilometres wrong behind a VPN, CGNAT, a corporate gateway or a
residential proxy. A geo failure or timeout never blocks the insert.

---

## 8. Client signals vs. server signals

**Collected by JavaScript in the browser — stored under `fingerprint`, hashed into
`clientFingerprintHash`:**

`browser`, `screen`, `timezone`, `hardware`, `canvas`, `webgl`, `audio`, `fonts`,
`mediaDevices`, `capabilities`, `storage`, `network`, `mediaCapabilities`, `permissions`,
`userAgentData`.

**Observed by the HTTP server — stored under `server`, never hashed:**

IP address and version, plus the request headers.

These are properties of the HTTP *request*, not of the browser. They are gathered on the
server side and never enter the fingerprint hash, so the two halves never contaminate
each other. `User-Agent` and the `Sec-CH-UA*` headers sit in both: sent by the browser,
observed by the server — which is why requesting high-entropy hints is a server-visible
trade-off.

The hash is a **representation of the collected signals, not a unique identifier**.
Millions of people share the same browser, screen size, GPU and font set. Two runs on
one machine can differ (viewport, window size, RTT); two different machines can match.

---

## 9. Implementation notes

- **TypeScript everywhere**, strict, with `noUnusedLocals` and `noImplicitOverride`.
- **One module per category**, 15 modules plus an aggregator.
- **Feature detection on every API.** Anything unsupported becomes the literal string
  `"Not available"` — never `null`, never silently omitted.
- **Error isolation.** Every risky call goes through `attempt()`, which catches, records
  a diagnostic, and returns a fallback. One failing test degrades one signal; it cannot
  abort the scan. Degradations are stored in `diagnostics` so they are visible instead of
  looking like genuine "Not available" values.
- **Deterministic hashing.** `canonicalJSON()` recursively sorts keys before SHA-256, so
  the digest depends on values only. SHA-256 uses WebCrypto when available and a
  self-contained JS implementation otherwise, so it works even when the page is served
  over plain HTTP on a LAN address.
- **No third-party fingerprinting library.** Two runtime deps: `mongodb`, `dotenv`.
- **Append-only storage.** No dedup, no comparison, no scoring, no updates or deletes.
- **Comments on everything.** Every module opens with a header comment explaining what
  the signal is, why it varies between machines, and what is deliberately not done.