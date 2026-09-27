# API reference

## `react-native-sip-voice`

### `new SipVoiceClient(options?, deps?)`

```ts
interface SipVoiceClientOptions {
  debug?: boolean;                    // false
  nativeCallUI?: boolean;             // true
  clientStateHeader?: string;         // "X-Client-State"
  callerIdHeader?: string;            // "X-Caller-Id"
  dtmfMode?: "auto" | "rfc2833" | "info"; // "auto"
  maxReconnectAttempts?: number;      // 5
  reconnectBaseDelayMs?: number;      // 1000
  outgoingCallTimeoutMs?: number;     // 60000
  credentialsProvider?: () => Promise<SipCredentials>;
}

interface SipVoiceClientDeps {        // for tests / custom stacks
  adapter: SignalingAdapter;          // default: SipJsAdapter
  logger?: Logger;
  now?: () => number;
}
```

| Member | Type |
|---|---|
| `connect(credentials?)` | `Promise<void>` |
| `disconnect()` / `logout()` | `Promise<void>` |
| `newCall(options: NewCallOptions)` | `Promise<Call>` |
| `hangupAll()` | `Promise<void>` |
| `getCall(id)` | `Call \| undefined` |
| `registerPushCall(callId, payload?)` | `void` |
| `handleNetworkChange()` | `Promise<void>` |
| `destroy()` | `Promise<void>` (instance can't be reused) |
| `on(event, handler)` | `Subscription`; events: `incomingCall`, `callEnded`, `error` |
| `connectionState$` / `currentConnectionState` / `isConnected` | `ConnectionState` |
| `calls$` / `currentCalls` | `Call[]` |
| `activeCall$` / `currentActiveCall` | `Call \| null` |
| `nativeCallUIEnabled` | `boolean` |

```ts
interface NewCallOptions {
  destination: string;
  displayName?: string;
  callerName?: string;
  callerId?: string;
  clientState?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
}
```

### `SipCredentials`

```ts
type SipCredentials = DigestCredentials | TokenCredentials;

interface SipServerConfig {
  wsServer: string; domain: string; username?: string; displayName?: string;
  iceServers?: { urls: string | string[]; username?: string; credential?: string }[];
  register?: boolean; registerExpires?: number; userAgentString?: string; traceSip?: boolean;
}
interface DigestCredentials extends SipServerConfig { type: "digest"; username: string; password: string; authorizationUsername?: string }
interface TokenCredentials extends SipServerConfig { type: "token"; token: string; headerName?: string; headerScheme?: string; wsQueryParam?: string }
```

### `Call`

| Member | Type |
|---|---|
| `id` | `string` (UUID) |
| `direction` | `"outgoing" \| "incoming"` |
| `destination` | `string` |
| `displayName` | `string` (writable) |
| `metadata` | `Record<string, unknown>` |
| `createdAt`, `answeredAt?`, `endedAt?` | epoch ms |
| `endReason?` | `CallEndReason` |
| `statusCode?` | `number` |
| `sipCallId?` | `string` |
| `currentState`, `callState$` | `CallState` |
| `isMuted`, `isMuted$` | `boolean` |
| `isOnHold`, `isOnHold$` | `boolean` |
| `isIncoming`, `isTerminated` | `boolean` |
| `durationSeconds` | `number` |
| `hangup(reason?)`, `answer()`, `reject()` | `Promise<void>` |
| `mute()`, `unmute()`, `setMuted(b)` | `void` |
| `toggleMute()` | `boolean` |
| `hold()`, `resume()`, `setHold(b)` | `Promise<void>` |
| `toggleHold()` | `Promise<boolean>` |
| `sendDtmf(tones)` | `Promise<void>` |
| `toJSON()` | plain object |

### Enums

```ts
enum CallState { CONNECTING, RINGING, ACTIVE, HELD, RECONNECTING, ENDED, FAILED }
enum ConnectionState { DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, ERROR }
type CallEndReason = "local_hangup" | "remote_hangup" | "rejected" | "busy" | "no_answer"
  | "unavailable" | "network_error" | "native_ui" | "timeout" | "failed";
type AudioRoute = "earpiece" | "speaker" | "bluetooth" | "headset";
```

### React

| Export | |
|---|---|
| `SipVoiceProvider` | props: `client`, `nativeConfig?`, `native?`, `reconnectOnForeground?` (true), `children` |
| `useSipVoice()` | `{ client, native, coordinator }` |
| `useConnectionState`, `useActiveCall`, `useCalls`, `useCallState`, `useCallDuration`, `useAudioRoute`, `useStream` | see [hooks](hooks.md) |

### Native

| Export | |
|---|---|
| `getNativeCallUI()` | `NativeCallUI` (singleton; no-op when unavailable) |
| `NoopNativeCallUI` | test double |
| `NativeCallCoordinator` | created by the provider; exported for custom setups |
| `NativeCallUIConfig` | see [native](native.md#configuration) |

`NativeCallUI` methods: `configure`, `startOutgoingCall`, `reportOutgoingCallConnecting`, `reportCallConnected`, `reportIncomingCall`, `reportCallEnded`, `endCall`, `setMuted`, `setHeld`, `updateDisplay`, `setAudioRoute`, `getAudioRoutes`, `registerVoipPush`, `getVoipPushToken`, `getPendingPushCalls`, `addListener`.

Events: `answerCall`, `endCall`, `setMuted`, `setHeld`, `playDTMF`, `startCall`, `audioSessionActivated`, `audioSessionDeactivated`, `audioRouteChanged`, `voipPushToken`, `pushIncomingCall`.

### Signalling (advanced)

| Export | |
|---|---|
| `SignalingAdapter` | interface: `connect`, `reconnect`, `disconnect`, `isConnected`, `invite` |
| `SipJsAdapter` | default implementation; options `{ logger?, iceGatheringTimeout? }` (2000 ms) |
| `CallSession` | per-call operations an adapter returns |
| `tokenHeaderLines(creds)`, `buildServerUrl(creds)` | helpers |

### Utilities

`formatDuration(seconds)`, `normalizePhoneNumber(s)`, `toSipUri(dest, domain)`, `uuidv4()`, `ValueStream`, `EventEmitter`.

## `react-native-sip-voice/ui`

| Export | |
|---|---|
| `CallOverlay` | see [UI](ui.md#all-props) |
| `ActiveCallScreen` | `call`, `displayName`, `phoneNumber?`, `landmark`, `isSpeakerOn`, `onToggleSpeaker`, `onMinimize?`, `subtitle?`, `theme?`, `labels?`, `showAttribution?`, `blurRadius?` |
| `IncomingCallScreen` | `call`, `displayName`, `landmark`, `theme?`, `labels?` |
| `MinimizedCallBanner` | `call`, `displayName`, `onPress`, `theme?`, `labels?` |
| `DialPad` | `onPress(digit)`, `entered?`, `theme?` |
| `Avatar` | `name`, `size?`, `pulsing?`, `color?`, `textColor?` |
| `ControlButton` | `icon`, `label`, `onPress`, `active?`, `disabled?`, `variant?`, `size?`, `theme?`, `iconRotation?` |
| `LandmarkBackground` | `landmark`, `blurRadius?`, `children` |
| `resolveCountry(number)` | `{ iso, dial } \| null` |
| `resolveLandmark(number, resolver?)` | `Landmark \| null` |
| `landmarkForIso(iso)`, `allLandmarks()`, `flagEmoji(iso)` | |
| `statusText(state, seconds, { incoming?, labels? })`, `initials(name)` | |
| `defaultCallUITheme`, `mergeTheme`, `defaultLabels`, `DEFAULT_LANDMARK_COLORS` | |

## Config plugin (`app.json`)

`["react-native-sip-voice", { microphonePermission?, voipPush?, apsEnvironment? }]`
