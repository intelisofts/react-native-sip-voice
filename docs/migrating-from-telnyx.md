# Migrating from `@telnyx/react-voice-commons-sdk`

The shapes are deliberately close, so most apps migrate by renaming.

## Setup

```diff
- import { createTelnyxVoipClient, TelnyxVoiceApp } from "@telnyx/react-voice-commons-sdk";
- const voipClient = createTelnyxVoipClient({ enableAppStateManagement: true, debug: true });
- <TelnyxVoiceApp voipClient={voipClient}>…</TelnyxVoiceApp>
+ import { SipVoiceClient, SipVoiceProvider } from "react-native-sip-voice";
+ const voipClient = new SipVoiceClient({ debug: true });
+ <SipVoiceProvider client={voipClient}>…</SipVoiceProvider>
```

## Login

```diff
- const config = createTokenConfig(telnyxToken, { debug: true });
- await voipClient.loginWithToken(config);
+ await voipClient.connect({ type: "token", wsServer: "wss://your-sbc", domain: "sip.your-domain", token });
```

## Placing a call

```diff
- await voipClient.newCall(destination, "My App", callerNumber, {}, clientState);
+ await voipClient.newCall({ destination, callerName: "My App", callerId: callerNumber, clientState });
```

`clientState` arrives at your SBC as the `X-Client-State` header, where Telnyx previously delivered it in webhooks. Update your backend to read it from the SIP header or from your SBC's CDRs.

## Name mapping

| Telnyx | react-native-sip-voice |
|---|---|
| `useTelnyxVoice().voipClient` | `useSipVoice().client` |
| `TelnyxConnectionState.CONNECTED` | `ConnectionState.CONNECTED` |
| `TelnyxCallState.RINGING / CONNECTING / ACTIVE / HELD / ENDED / FAILED` | `CallState.*` (same names) |
| `TelnyxCallState.DROPPED` | `CallState.RECONNECTING` |
| `voipClient.connectionState$`, `activeCall$`, `calls$` | same names |
| `voipClient.currentConnectionState`, `currentActiveCall` | same names |
| `voipClient.logout()` | `disconnect()` (`logout()` is kept as an alias) |
| `call.callState$`, `call.currentState` | same names |
| `call.hangup() / answer() / mute() / unmute() / hold() / resume()` | same names |
| `call.destination`, `call.callId`, `call.isIncoming` | `destination`, `id`, `isIncoming` |
| `useCallKitCoordinator().setVoipClient(...)` | not needed; the provider wires CallKit automatically |
| `TelnyxVoipPushHandler` in `AppDelegate` | remove it and set `"voipPush": true` in the plugin |

## UI

Replace your hand-built `CurrentCall` / `ActiveCall` / `RingingCall` / `CallConnecting` components with a single `<CallOverlay />`, or build your own screen with the [hooks](hooks.md).

## Cleanup

- Remove `@telnyx/react-native-voice-sdk` and `@telnyx/react-voice-commons-sdk`.
- Remove `import TelnyxVoiceCommons` and the PushKit delegate methods from `AppDelegate.swift`.
- `react-native-incall-manager` is no longer needed for the speaker. Use `useAudioRoute()`, and remove incall-manager to avoid audio-session conflicts.
