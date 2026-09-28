# Changelog

## Unreleased

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
