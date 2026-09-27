# Built-in call UI

`react-native-sip-voice/ui` is an optional, WhatsApp-style call experience:

- **Full-screen call:** a landmark photo of the destination country behind the call, plus avatar, name, number, and status/timer. Controls sit on a frosted panel: speaker, mute, keypad, hold, and end.
- **Minimized banner:** a green "Tap to return to call · 02:13" strip. The call keeps running while the user browses the app.
- **Incoming screen:** accept / decline (for SIP incoming calls when the app is open).
- **Call ended:** the screen pops back to full size and shows "Call ended · 01:05" for about 1.5 seconds.

Required peer deps: `expo-image`, `expo-blur`, `expo-linear-gradient`, `@expo/vector-icons`, and `react-native-safe-area-context`.

## `<CallOverlay />`

Place it **once**, inside `SipVoiceProvider` and a `SafeAreaProvider`, after your navigator.

```tsx
<SipVoiceProvider client={voice}>
  <Stack />
  <CallOverlay />
</SipVoiceProvider>
```

### All props

| Prop | Type | Default |
|---|---|---|
| `resolveDisplayName` | `(call) => string \| undefined \| Promise<…>` | `call.displayName` |
| `phoneNumberForCall` | `(call) => string` | `call.destination` |
| `landmarkResolver` | `(number, match) => Partial<Landmark> \| undefined` | built-in data |
| `disableLandmarks` | `boolean` | `false` |
| `subtitle` | `(call) => string \| undefined` | — |
| `theme` | `Partial<CallUITheme>` | WhatsApp-like dark |
| `labels` | `Partial<CallLabels>` | English |
| `allowMinimize` | `boolean` | `true` |
| `showIncomingScreen` | `boolean` | `true` |
| `renderActiveCall` | `({ call, displayName, minimize }) => ReactNode` | built-in screen |
| `blurRadius` | `number` | `0` |

### Show contact names

```tsx
import * as Contacts from "expo-contacts";

<CallOverlay
  resolveDisplayName={async (call) => {
    const { status } = await Contacts.getPermissionsAsync();
    if (status !== "granted") return undefined;
    const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
    const match = data.find((c) => c.phoneNumbers?.some((p) => p.number?.replace(/\D/g, "").endsWith(call.destination.replace(/\D/g, "").slice(-9))));
    return match?.name;
  }}
/>
```

The resolved name is also written back to `call.displayName`, so CallKit and the banner use it too.

### Dialling a routing number but showing the real one

If your backend makes you dial an access or routing number, keep the real number in `metadata` and tell the overlay about it:

```ts
await voice.newCall({ destination: routingNumber, displayName: dialed, metadata: { dialedNumber: dialed } });
```

```tsx
<CallOverlay phoneNumberForCall={(c) => (c.metadata.dialedNumber as string) ?? c.destination} />
```

The shown number and the landmark both follow `phoneNumberForCall`.

### Theme

```tsx
<CallOverlay
  theme={{
    accent: "#6C5CE7",           // banner + accept button
    danger: "#FF3B30",           // end / decline
    text: "#FFFFFF",
    textSecondary: "rgba(255,255,255,0.7)",
    controlBackground: "rgba(255,255,255,0.16)",
    controlActiveBackground: "#FFFFFF",
    controlActiveIcon: "#111",
    controlIcon: "#FFFFFF",
    panelTint: "dark",           // BlurView tint: "dark" | "light" | "default"
    fontFamily: "Inter",
  }}
/>
```

### Translations

```tsx
<CallOverlay
  labels={{
    calling: "Appel en cours…", ringing: "Ça sonne…", connecting: "Connexion…",
    reconnecting: "Reconnexion…", onHold: "En attente", ended: "Appel terminé", failed: "Échec de l'appel",
    incoming: "Appel vocal entrant", tapToReturn: "Toucher pour revenir à l'appel",
    speaker: "Haut-parleur", mute: "Muet", keypad: "Clavier", hold: "Attente", resume: "Reprendre",
    end: "Fin", hide: "Masquer", accept: "Accepter", decline: "Refuser",
  }}
/>
```

### Custom screen, keep the overlay

The overlay still handles the modal, the minimized banner, and incoming calls. You supply only the active-call screen.

```tsx
<CallOverlay
  renderActiveCall={({ call, displayName, minimize }) => (
    <MyCallScreen call={call} name={displayName} onMinimize={minimize} />
  )}
/>
```

## Landmark backgrounds

The destination country comes from the international prefix. For example, `+44` shows the London Eye, `+1 212` the Statue of Liberty, `+1 416` the CN Tower, and `+971` the Burj Khalifa. 89 countries are covered. National-format numbers (no `+` or `00`) fall back to a gradient.

```ts
import { resolveCountry, resolveLandmark, allLandmarks } from "react-native-sip-voice/ui";

resolveCountry("+447700900123");   // { iso: "GB", dial: "44" }
resolveLandmark("+447700900123");  // { landmark: "London Eye", city: "London", country: "United Kingdom", flag: "🇬🇧", imageUrl, author, license, colors, … }
```

### Use your own images

```tsx
const MY_IMAGES: Record<string, string> = {
  GB: "https://cdn.example.com/landmarks/london.jpg",
  FR: "https://cdn.example.com/landmarks/paris.jpg",
};

<CallOverlay
  landmarkResolver={(number, match) =>
    match && MY_IMAGES[match.iso]
      ? { imageUrl: MY_IMAGES[match.iso], author: undefined, license: undefined }
      : undefined // keep the built-in entry
  }
/>
```

Return `undefined` to keep the default. Return a partial object to override fields. For numbers the built-in data doesn't know, return a full entry (`iso`, `country`, `landmark`, `city`, `imageUrl`).

### Prefetch for instant display

```ts
import { Image } from "expo-image";
import { allLandmarks } from "react-native-sip-voice/ui";

Image.prefetch(allLandmarks().map((l) => l.imageUrl).filter(Boolean) as string[], "disk");
```

### Licensing

The built-in images are free-licensed Wikimedia photos. A one-line credit ("📍 London Eye, London · Photo: Author (CC BY-SA 3.0)") is shown by default, because CC BY / BY-SA licences require attribution. Keep it on unless you replace the images with your own (`landmarkResolver`), in which case set `author`/`license` as appropriate.

## Using the screens individually

```tsx
import { ActiveCallScreen, MinimizedCallBanner, IncomingCallScreen, resolveLandmark } from "react-native-sip-voice/ui";
import { useAudioRoute } from "react-native-sip-voice";

function CallRoute({ call }) {
  const { isSpeakerOn, toggleSpeaker } = useAudioRoute();
  return (
    <ActiveCallScreen
      call={call}
      displayName="Jane Doe"
      phoneNumber="+447700900123"
      landmark={resolveLandmark("+447700900123")}
      isSpeakerOn={isSpeakerOn}
      onToggleSpeaker={toggleSpeaker}
      onMinimize={() => navigation.goBack()}
      subtitle="Acme Support"
    />
  );
}
```

Also exported: `DialPad`, `Avatar`, `ControlButton`, `LandmarkBackground`, `statusText`, `initials`, `defaultLabels`, `defaultCallUITheme`, and `mergeTheme`.

Stable `testID`s for your E2E tests (Detox/Maestro): `call-name`, `call-number`, `call-status`, `call-mute`, `call-speaker`, `call-keypad`, `call-hold`, `call-end`, `call-minimize`, `minimized-call-banner`, `incoming-accept`, `incoming-decline`, and `dial-key-<digit>`.
