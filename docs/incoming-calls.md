# Incoming calls and push

Receiving calls has three parts:

1. **Be reachable:** `register: true` in your credentials, so the SBC knows where to send INVITEs while the app is connected.
2. **Wake the app** when it's backgrounded or killed: a VoIP push (iOS) or a high-priority FCM message (Android).
3. **Match** the push to the SIP INVITE that follows, so the system call UI and the SIP session are the same call.

## While the app is open (no push)

```ts
const voice = new SipVoiceClient({ credentialsProvider });
await voice.connect(); // credentials include register: true

voice.on("incomingCall", (call) => {
  console.log("Incoming from", call.destination, call.displayName);
  // <CallOverlay /> already shows accept / decline; or:
  // await call.answer();  /  await call.reject();
});
```

The call is also reported to CallKit / ConnectionService automatically, so the system ringing UI appears too.

## iOS: VoIP push (PushKit)

**1. Enable it in the plugin:**

```json
["react-native-sip-voice", { "voipPush": true, "apsEnvironment": "production" }]
```

This registers PushKit in `didFinishLaunching` through an Expo AppDelegate subscriber. No AppDelegate code is needed.

**2. Send the token to your backend:**

```ts
import { getNativeCallUI } from "react-native-sip-voice";

const native = getNativeCallUI();
native.registerVoipPush();
const token = await native.getVoipPushToken();         // may be null on first launch
native.addListener("voipPushToken", ({ token }) => api.saveVoipToken(token));
if (token) api.saveVoipToken(token);
```

**3. Send the push from your backend** (APNs, `apns-push-type: voip`, topic `<bundle-id>.voip`):

```json
{
  "call_id": "c-8f2a",
  "caller_number": "+447700900123",
  "caller_name": "Jane Doe",
  "call_uuid": "6f1c1a52-3c4e-4d7a-9c55-0d7a1f3b9e11"
}
```

The same fields may also be nested under `"metadata"`. `call_uuid` is optional; one is generated if you leave it out.

**4. Send the INVITE with a matching header:**

```
X-Call-Id: c-8f2a
```

What happens next:

1. iOS wakes the app. The native side reports the call to CallKit **before JavaScript even starts**, as iOS 13+ requires.
2. JS starts, and the provider picks up the pending push call.
3. Your app connects (for example with `voice.connect()` in a startup effect). The SBC delivers the INVITE, and the client attaches it to the same call id.
4. If the user already tapped **Answer** on the lock screen, the answer is applied as soon as the INVITE arrives.

```tsx
// Make sure you connect on launch when push is enabled:
useEffect(() => { voice.connect().catch(console.warn); }, []);
```

> **Important:** every VoIP push **must** result in a call. iOS terminates apps that receive VoIP pushes without reporting a call. Only send VoIP pushes for real incoming calls.

## Android: FCM

The package doesn't bundle Firebase. Use your existing FCM setup (for example `@react-native-firebase/messaging`) and hand the data to the package:

```ts
import messaging from "@react-native-firebase/messaging";
import { getNativeCallUI, uuidv4 } from "react-native-sip-voice";
import { voice } from "./voice";

messaging().setBackgroundMessageHandler(async (msg) => {
  if (msg.data?.type !== "incoming_call") return;
  const id = (msg.data.call_uuid as string) ?? uuidv4();
  await getNativeCallUI().reportIncomingCall(id, msg.data.caller_number as string, (msg.data.caller_name as string) ?? "");
  voice.registerPushCall(id, { call_id: msg.data.call_id });
  await voice.connect(); // receive the INVITE
});
```

Send FCM **data** messages with `priority: high`. The package shows the system incoming-call UI through ConnectionService, or a full-screen CallStyle notification as a fallback.

## Matching rules

When an INVITE arrives, the client looks for a push registered in the last 60 seconds:

1. One whose `payload.call_id` equals the INVITE's `X-Call-Id` header.
2. Otherwise, the oldest pending push.

The matched call reuses the push's id. `call.metadata.fromPush` is `true`, and `call.metadata.pushPayload` holds the payload.
