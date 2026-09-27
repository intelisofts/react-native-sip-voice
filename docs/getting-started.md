# Getting started

This guide takes a fresh Expo app to a working outgoing call.

## 1. Prerequisites

- An Expo SDK 53+ app with a **development build**. Expo Go can't load native modules.
- React Native New Architecture. It's the default from RN 0.76.
- An SBC reachable over `wss://` that supports WebRTC media (DTLS-SRTP + ICE). See [SBC setup](sbc-setup.md).
- A SIP account on that SBC, or a token it accepts.

## 2. Install

```sh
npx expo install react-native-sip-voice react-native-webrtc @config-plugins/react-native-webrtc

# Only if you want the built-in call screen:
npx expo install expo-image expo-blur expo-linear-gradient @expo/vector-icons react-native-safe-area-context
```

## 3. Configure `app.json`

```json
{
  "expo": {
    "plugins": [
      [
        "@config-plugins/react-native-webrtc",
        { "microphonePermission": "We use the microphone for voice calls." }
      ],
      [
        "react-native-sip-voice",
        { "microphonePermission": "We use the microphone for voice calls.", "voipPush": false }
      ]
    ]
  }
}
```

Then rebuild the native app:

```sh
npx expo prebuild --clean
npx expo run:ios      # or: npx expo run:android
```

| Plugin option | Default | Effect |
|---|---|---|
| `microphonePermission` | generic text | iOS `NSMicrophoneUsageDescription`, set only when missing |
| `voipPush` | `false` | Registers PushKit at launch. Turn this on only when your backend sends VoIP pushes; see [Incoming calls](incoming-calls.md) |
| `apsEnvironment` | `"development"` | `aps-environment` entitlement, added when `voipPush` is on |

## 4. Create the client once

Create a single `SipVoiceClient` for the lifetime of the app, outside any component.

```ts
// voice.ts
import { SipVoiceClient } from "react-native-sip-voice";

export const voice = new SipVoiceClient({
  debug: __DEV__,
  credentialsProvider: async () => ({
    type: "digest",
    wsServer: "wss://sbc.example.com:7443",
    domain: "sip.example.com",
    username: "1001",
    password: "secret",
  }),
});
```

> Don't ship passwords in the app. Fetch them from your backend. See [Authentication](authentication.md).

## 5. Wrap your app

```tsx
// App.tsx
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SipVoiceProvider } from "react-native-sip-voice";
import { CallOverlay } from "react-native-sip-voice/ui";
import { voice } from "./voice";

export default function App() {
  return (
    <SafeAreaProvider>
      <SipVoiceProvider client={voice} nativeConfig={{ appName: "My App" }}>
        <RootNavigator />
        {/* Renders the call screen / minimized banner whenever a call exists */}
        <CallOverlay />
      </SipVoiceProvider>
    </SafeAreaProvider>
  );
}
```

With **Expo Router**, put `<SipVoiceProvider>` and `<CallOverlay />` in `app/_layout.tsx`, around and after the `<Stack>`. Expo Router already provides a `SafeAreaProvider`.

## 6. Place a call

```tsx
import { Button } from "react-native";
import { useSipVoice } from "react-native-sip-voice";

export function CallButton({ number }: { number: string }) {
  const { client } = useSipVoice();
  return (
    <Button
      title={`Call ${number}`}
      onPress={async () => {
        try {
          await client.newCall({ destination: number }); // connects first if needed
        } catch (e) {
          console.warn("Call failed to start", e);
        }
      }}
    />
  );
}
```

When the call starts, you should see:

1. The CallKit / Android system call registered (on iOS, the green pill in the status bar).
2. The full-screen call UI showing "Calling…", then "Ringing…", then a running timer.
3. A landmark photo for the destination country.

If something doesn't work, turn on `traceSip: true` in your credentials and see [Troubleshooting](troubleshooting.md).

## Next steps

- Show contact names and customise the screen: [Built-in call UI](ui.md)
- Build a completely custom screen: [React hooks](hooks.md)
- Send billing/tenant data to your SBC: [Making calls → headers](calls.md#sending-data-to-your-sbc)
