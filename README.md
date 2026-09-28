# react-native-sip-voice

Carrier-agnostic voice calling for React Native and Expo. Bring your own SBC.

- **SIP over WebSocket** via [SIP.js](https://sipjs.com), **audio** via [react-native-webrtc](https://github.com/react-native-webrtc/react-native-webrtc).
- **Native call integration:** CallKit on iOS, and a self-managed `ConnectionService` plus a foreground service on Android. Calls appear on the lock screen, in the car, and on Bluetooth devices, and they survive backgrounding.
- **Pluggable auth:** SIP digest credentials, or a bearer token (RFC 8898) sent as a header or WebSocket query parameter.
- **Optional WhatsApp-style call UI** (`react-native-sip-voice/ui`). It includes a minimize-to-banner mode and a photo of a famous landmark in the destination country (the London Eye for `+44`, the Eiffel Tower for `+33`, and 87 others).
- Headless core with no RxJS. Fully typed, and 226 tests.

```
┌────────────── your app ──────────────┐
│  <SipVoiceProvider>   <CallOverlay/> │   react-native-sip-voice/ui (optional)
│        │                             │
│  SipVoiceClient ── Call ── hooks     │   core (headless)
│        │                             │
│  SignalingAdapter (SIP.js/WSS)       │──── wss:// ────► your SBC ──► PSTN / SIP trunk
│  react-native-webrtc (DTLS-SRTP)     │──── RTP/ICE ───►
│  NativeCallCoordinator               │
│        │                             │
│  Expo module: CallKit · PushKit ·    │
│  ConnectionService · FGS · audio     │
└──────────────────────────────────────┘
```

## Documentation

Full guides with copy-paste examples live in [`docs/`](docs/README.md):

[Getting started](docs/getting-started.md) · [Authentication](docs/authentication.md) · [Calls](docs/calls.md) · [Hooks](docs/hooks.md) · [Built-in UI](docs/ui.md) · [Native integration](docs/native.md) · [Incoming calls & push](docs/incoming-calls.md) · [SBC setup](docs/sbc-setup.md) · [API reference](docs/api-reference.md) · [Testing](docs/testing.md) · [Troubleshooting](docs/troubleshooting.md)

## Requirements

| | |
|---|---|
| React Native | New Architecture (0.76+) |
| Expo | SDK 53+ (bare or prebuild; not Expo Go) |
| iOS | 15.1+ |
| Android | API 24+ (ConnectionService on API 26+) |
| Peer deps | `react-native-webrtc`; for the UI: `expo-image`, `expo-blur`, `expo-linear-gradient`, `@expo/vector-icons`, `react-native-safe-area-context` |

### Your SBC must speak WebRTC

Browsers and react-native-webrtc only send **DTLS-SRTP over ICE**, never plain RTP. Your SBC, or a media relay in front of it, must support:

- SIP over **secure WebSocket** (`wss://`, RFC 7118)
- **ICE** (ICE-lite is fine), **DTLS-SRTP**, `rtcp-mux`, `BUNDLE`
- **Opus** or **PCMU/PCMA** audio

This works with Kamailio or OpenSIPS + rtpengine, FreeSWITCH (`mod_sofia` WSS + `mod_verto` media), Asterisk (`res_pjsip` with `webrtc=yes`), AudioCodes, Ribbon, Oracle, and others.

## Install

```sh
npx expo install react-native-sip-voice react-native-webrtc @config-plugins/react-native-webrtc
# for the built-in UI
npx expo install expo-image expo-blur expo-linear-gradient @expo/vector-icons react-native-safe-area-context
```

`app.json`:

```json
{
  "expo": {
    "plugins": [
      "@config-plugins/react-native-webrtc",
      ["react-native-sip-voice", { "microphonePermission": "Used for voice calls", "voipPush": false }]
    ]
  }
}
```

Then run `npx expo prebuild` or `npx expo run:ios` / `run:android`.

The plugin adds the `voip` and `audio` background modes and the microphone text on iOS. Android permissions and services merge in from the library manifest.

## Quick start

```tsx
import { SipVoiceClient, SipVoiceProvider } from "react-native-sip-voice";
import { CallOverlay } from "react-native-sip-voice/ui";

const client = new SipVoiceClient({
  // Called on connect() and when a connection needs to be re-established. Fetch short-lived creds from your backend.
  credentialsProvider: async () => {
    const r = await fetch("https://api.example.com/sip-credentials").then((x) => x.json());
    return { type: "token", wsServer: r.wsServer, domain: r.domain, username: r.user, token: r.token };
  },
});

export default function App() {
  return (
    <SipVoiceProvider client={client} nativeConfig={{ appName: "My App" }}>
      <Navigation />
      <CallOverlay />
    </SipVoiceProvider>
  );
}

// anywhere
await client.newCall({
  destination: "+447700900123",
  callerId: "+15550001111",       // → X-Caller-Id
  clientState: btoa(JSON.stringify({ plan: "gold" })), // → X-Client-State
  headers: { "X-Tenant": "acme" },
});
```

## Authentication

```ts
// SIP digest
{ type: "digest", wsServer: "wss://sbc.example.com:7443", domain: "sip.example.com",
  username: "1001", password: "secret" }

// Bearer token: Authorization: Bearer <token> on REGISTER and INVITE
{ type: "token", wsServer, domain, token }

// Custom header, and/or the token in the WebSocket URL
{ type: "token", wsServer, domain, token, headerName: "X-Auth-Token", wsQueryParam: "access_token" }
```

Common options: `iceServers` (STUN/TURN), `register` (send REGISTER; not needed for outgoing-only apps), `displayName`, `userAgentString`, `traceSip`.

## Client API

```ts
const client = new SipVoiceClient({
  debug?: boolean,
  nativeCallUI?: boolean,            // CallKit / ConnectionService (default true)
  callerIdHeader?: string,           // default "X-Caller-Id" (e.g. "P-Asserted-Identity")
  clientStateHeader?: string,        // default "X-Client-State"
  dtmfMode?: "auto" | "rfc2833" | "info", // default auto: RTP, then falls back to SIP INFO
  maxReconnectAttempts?: number,     // default 5, exponential back-off
  outgoingCallTimeoutMs?: number,    // default 60000
  credentialsProvider?: () => Promise<SipCredentials>,
});

client.connect(creds?)      client.disconnect()      client.newCall(opts)
client.connectionState$     client.calls$            client.activeCall$
client.on("incomingCall" | "callEnded" | "error", fn)
client.handleNetworkChange()   // the provider calls this when the app returns to the foreground

call.hangup()  call.answer()  call.reject()  call.mute()/unmute()/toggleMute()
call.hold()/resume()/toggleHold()  call.sendDtmf("1")
call.callState$  call.isMuted$  call.isOnHold$  call.durationSeconds  call.endReason
```

`CallState`: `CONNECTING → RINGING → ACTIVE ⇄ HELD`, `RECONNECTING`, `ENDED`, `FAILED`.

### Hooks

`useSipVoice()`, `useConnectionState()`, `useActiveCall()`, `useCalls()`, `useCallState(call)`, `useCallDuration(call)`, `useAudioRoute()`. The last one returns `{ route, available, setRoute, toggleSpeaker, isSpeakerOn }`, where `route` is earpiece, speaker, Bluetooth, or headset.

## UI

`<CallOverlay />` shows the full-screen call. The user can minimize it to a "Tap to return to call" banner, and it pops back to full screen when the call ends.

```tsx
<CallOverlay
  resolveDisplayName={async (call) => lookupContact(call.destination)}
  phoneNumberForCall={(call) => call.metadata.dialedNumber ?? call.destination}
  landmarkResolver={(number, match) => match?.iso === "GB" ? { imageUrl: myCdn("london.jpg") } : undefined}
  subtitle={() => "My App"}
  theme={{ accent: "#25D366" }}
  labels={{ end: "Raccrocher" }}
  allowMinimize
/>
```

Building blocks are exported too: `ActiveCallScreen`, `IncomingCallScreen`, `MinimizedCallBanner`, `DialPad`, `Avatar`, `ControlButton`, `LandmarkBackground`, `resolveLandmark`, `resolveCountry`.

### Landmark images

Images are **not bundled**. They load from Wikimedia and are cached on disk with `expo-image`. If a photo can't load (for example when offline), the screen shows a country-tinted gradient instead.

Every image is free-licensed (CC0, public domain, CC BY, CC BY-SA, FAL, or KOGL). Authors and licences are listed in [ATTRIBUTION.md](ATTRIBUTION.md), and a one-line credit appears on the call screen, as CC licences require. To serve images from your own CDN, pass `landmarkResolver`.

To regenerate the data:

```sh
node scripts/fetch-landmarks.mjs && node scripts/apply-overrides.mjs && node scripts/build-attribution.mjs
```

## Background behaviour

| | iOS | Android |
|---|---|---|
| System call UI | CallKit (lock screen, Recents, CarPlay, Watch) | Self-managed ConnectionService (car, Bluetooth, wearables) |
| While backgrounded | `voip` + `audio` background modes | Foreground service (`microphone|phoneCall`) with a CallStyle ongoing-call notification (chronometer, hang-up) |
| Audio session | WebRTC manual audio, enabled on `didActivate` (fixes one-way audio when answering from the lock screen) | Telecom sets `MODE_IN_COMMUNICATION`; `AudioManager` is the fallback |
| System actions → JS | end, answer, mute, hold, DTMF | end, answer, hold, mute (from audio state), DTMF |

## Incoming calls (push-ready)

- **iOS:** set `"voipPush": true` in the plugin options. PushKit then registers at launch, and you can send the token (`getNativeCallUI().getVoipPushToken()` or the `voipPushToken` event) to your backend. Each VoIP push must carry `call_id`, `caller_number`, and optionally `caller_name` and `call_uuid`. The native side reports the push to CallKit immediately, as iOS requires. When the SIP INVITE arrives with `X-Call-Id: <call_id>`, it attaches to the same call.
- **Android:** in your FCM handler, call `getNativeCallUI().reportIncomingCall(uuid, number, name)` and register the call with `client.registerPushCall(uuid, payload)`.
- Answering from the system UI before the INVITE arrives is handled: the answer is applied as soon as the call exists.

## Custom signalling

`SignalingAdapter` is a small interface. Implement it to use a different SIP stack, or anything else that can reach your SBC, and pass it as `new SipVoiceClient(opts, { adapter })`.

## Testing

```sh
npm test            # 226 tests: core, SIP adapter, native coordinator, hooks, UI, config plugin
npm run test:coverage
npm run typecheck
```

## Licence

MIT. Landmark photos are the property of their authors and used under the licences in [ATTRIBUTION.md](ATTRIBUTION.md).
