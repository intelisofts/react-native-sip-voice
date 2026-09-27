# Native call integration

With `nativeCallUI: true` (the default), every call is reported to the operating system's call framework. This is what makes VoIP calls behave like phone calls.

| | iOS (CallKit) | Android (self-managed ConnectionService) |
|---|---|---|
| System UI | Green status pill, lock screen, Recents, CarPlay, Apple Watch | Car, Bluetooth, wearables. The app draws its own call UI |
| Background | Keeps running via the `voip` + `audio` background modes | Foreground service (`microphone\|phoneCall`) with a CallStyle notification (name, timer, **Hang up**) |
| Interruptions | Other calls and media are handled by the system | Telecom manages audio focus |
| Audio | WebRTC audio starts only after CallKit activates the session | `MODE_IN_COMMUNICATION` set by Telecom |

## Configuration

```tsx
<SipVoiceProvider
  client={voice}
  nativeConfig={{
    appName: "My App",                 // Android label (iOS always uses the bundle display name)
    includesCallsInRecents: true,      // iOS Recents
    iconTemplateImageName: "CallIcon", // iOS: 40x40 template image in your asset catalog
    ringtoneSound: "ring.caf",         // iOS: bundled file for incoming calls
    supportsHolding: true,
    supportsDTMF: true,
    android: {
      channelName: "Ongoing calls",
      notificationIcon: "ic_notification", // drawable resource name
      useConnectionService: true,          // false = foreground service only
    },
  }}
>
```

To turn off native integration entirely, for example in a web or desktop build:

```ts
new SipVoiceClient({ nativeCallUI: false });
```

## What syncs automatically

The `NativeCallCoordinator` inside the provider keeps both sides in step.

| App → OS | OS → App |
|---|---|
| Call started / ringing / connected / ended | User taps **End** on the lock screen, car, watch, or notification → `call.hangup()` |
| Mute and hold changes | Mute toggled from the system UI or a Bluetooth headset → `call.setMuted()` |
| Display name updates (e.g. contact resolved) | Hold from the system → `call.setHold()` |
| | Keypad digits from CarPlay → `call.sendDtmf()` |
| | Answer from the system → `call.answer()` |

There's nothing to wire up yourself.

## Audio routing

```ts
const { route, available, setRoute, toggleSpeaker } = useAudioRoute();
await setRoute("speaker");   // "earpiece" | "speaker" | "bluetooth" | "headset"
```

Or, outside React:

```ts
import { getNativeCallUI } from "react-native-sip-voice";
await getNativeCallUI().setAudioRoute("bluetooth");
const { current, available } = await getNativeCallUI().getAudioRoutes();
```

`useAudioRoute` updates automatically when a headset is plugged in or removed, or when the route changes from the system.

## Why iOS audio "just works"

react-native-webrtc is switched to **manual audio**. The microphone and speaker only start once CallKit calls `provider(_:didActivate:)`. Starting audio before then is the classic cause of silent calls or one-way audio when a call is answered from the lock screen. Avoid other libraries that set the `AVAudioSession` category during calls, such as `react-native-incall-manager`.

## Android notes

- Self-managed ConnectionService needs API 26+. On older devices, or when Telecom refuses, the call still works with just the foreground service.
- On Android 13+, request `POST_NOTIFICATIONS` at runtime if you want the ongoing-call notification to be visible. The call works without it.
- The foreground service must start while the app is in the foreground. This is always true for user-initiated calls. For incoming calls it happens when the user answers.
- Some OEM builds (MIUI, ColorOS) restrict background services. Ask users to exempt the app from battery optimisation if calls drop in the background.

## Using the bridge directly

`getNativeCallUI()` returns the native bridge. On platforms without the module (web, Expo Go, Jest) it returns a no-op implementation, and `isAvailable` is `false`.

```ts
const native = getNativeCallUI();
if (native.isAvailable) {
  native.addListener("audioRouteChanged", ({ route }) => console.log("now on", route));
}
```
