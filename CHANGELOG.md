# Changelog

## 0.4.0 (breaking)

The native layer (CallKit, PushKit, ConnectionService, notifications, call screens, call audio session, FCM handling) is now [expo-callkit-telecom](https://expo-callkit-telecom.mfairley.com/), a peer dependency (`^1.0.1`). All Swift and Kotlin call code, the Headless JS task, `NativeCallUI`, `getNativeCallUI`, `NoopNativeCallUI`, `androidCallSetup` and `registerIncomingCallTask` are removed.

- `NativeCallCoordinator` drives expo-callkit-telecom. A call announced by VoIP push keeps the system's call id, and its SIP INVITE (matched on the push's `serverCallId` = `X-Call-Id`) takes it. Answer taps are fulfilled once media is up, or failed when this phone may not take the call. An Answer or Decline made before the INVITE arrives is applied when it does.
- `SipVoiceProvider`: `native` prop replaced by `callSystem` (tests; `null` runs without system call UI). `nativeConfig` is now `{ supportsHolding }`.
- `useAudioRoute()` returns `{ isSpeakerOn, setSpeaker, toggleSpeaker }`; routing between earpiece, Bluetooth and headset is the system's.
- Config plugin applies expo-callkit-telecom (voice only, 45 s ring window) and registers `SipVoiceCallEventReceiver`, which posts to the push's `metadata.declineUrl` when a call is declined while the app is closed.
- Push payloads change to expo-callkit-telecom's format (`incomingCall` object on iOS; `messageType` + JSON string on Android). Android's incoming call screen is now the system's, branded only by icon and strings.

## 0.3.0

- `unregister()`: stops being reachable (REGISTER with expiry 0, then closes the connection). For when the app goes to the background. Does nothing and returns `false` while a call is live. A slow server never delays closing (1.5 s limit).
- `setAnswerGate(gate)`: runs when the user accepts an incoming call, before it is answered. Returning `false` or throwing gives the call up, so an app can ask its backend whether another device already took the call. The call ends with the new reason `"answered_elsewhere"` (or `"failed"` when the check could not run), and CallKit / ConnectionService show it as answered elsewhere. Also applies to calls already ringing.
- New `CallEndReason`: `"answered_elsewhere"`. New exported type `AnswerGate`.
- `SignalingAdapter.unregister?()` (optional); `SipJsAdapter` implements it.
- No change for apps that do not use these. Android incoming-call pushes are still delivered by the app's own handler, which calls `reportIncomingCall` and `registerPushCall`.

## 0.2.1

- Active call screen: the destination, status and timer sit on a frosted translucent panel so they stay readable over any landmark photo. Larger, bolder text: the number (36, or 26 under a contact name), the call stage in words ("Calling…", "Ringing…", "Connected" with a green dot, "On hold", "Call ended"; 24) and the timer on its own line (46).
- `callPhase()` (exported from `/ui`): the call stage without the timer; new optional `connected` label (default "Connected").
- Landmarks: Eritrea (+291), Fiat Tagliero Building in Asmara.

## 0.2.0

- Hold/resume re-INVITEs carry the same token header as the call's original INVITE (SBCs that bind a token to the call check it); rejections log the status code.
- Hold is now opt-in (`showHold` on `ActiveCallScreen`/`CallOverlay`, `supportsHolding` in native config, both default false). It sends re-INVITEs (sendonly/recvonly), which many SBCs don't handle; CallKit no longer offers "Hold & Accept" by default.
- Credentials are never kept past a session: `disconnect()` and giving up on reconnects forget them.
- Hanging up sends BYE/CANCEL best-effort without waiting for a reply, and `disconnect()` closes the WebSocket immediately (no un-REGISTER or BYE round trips); the SBC ends dialogs when the socket closes.
- `newCall()` on a disconnected client connects only via `credentialsProvider` (fresh credentials) and otherwise throws, instead of re-using the last credentials.

## 0.1.0

First release.

- `SipVoiceClient`: SIP.js over WSS with react-native-webrtc audio, digest or bearer-token auth, custom headers, reconnection with back-off, and outgoing-call timeout.
- Expo native module: CallKit + PushKit (iOS); self-managed ConnectionService, foreground service and CallStyle notifications (Android); audio routing.
- `NativeCallCoordinator`: two-way sync between calls and the OS call UI.
- React bindings: `SipVoiceProvider` and hooks.
- `react-native-sip-voice/ui`: WhatsApp-style call screen, incoming-call screen, minimized banner, dial pad, and destination landmark backgrounds for 89 countries.
- Expo config plugin.
