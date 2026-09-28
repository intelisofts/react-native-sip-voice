# Changelog

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
