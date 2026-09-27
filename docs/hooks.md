# React hooks

All hooks must be used inside `<SipVoiceProvider>`. Hooks that take a `call` accept `null`, so you can call them unconditionally.

| Hook | Returns |
|---|---|
| `useSipVoice()` | `{ client, native, coordinator }` |
| `useConnectionState()` | `ConnectionState` |
| `useActiveCall()` | `Call \| null` |
| `useCalls()` | `Call[]` |
| `useCallState(call)` | `{ state, isMuted, isOnHold }` |
| `useCallDuration(call)` | seconds since answer, re-rendering every second while live |
| `useAudioRoute()` | `{ route, available, setRoute, toggleSpeaker, isSpeakerOn }` |
| `useStream(stream)` | current value of any `ReadonlyValueStream` |

## A complete custom call screen

```tsx
import { Pressable, Text, View } from "react-native";
import {
  CallState,
  formatDuration,
  useActiveCall,
  useAudioRoute,
  useCallDuration,
  useCallState,
} from "react-native-sip-voice";

export function MyCallScreen() {
  const call = useActiveCall();
  const { state, isMuted, isOnHold } = useCallState(call);
  const seconds = useCallDuration(call);
  const { isSpeakerOn, toggleSpeaker } = useAudioRoute();

  if (!call) return null;

  const status =
    state === CallState.RINGING ? "Ringing…" :
    state === CallState.ACTIVE ? formatDuration(seconds) :
    state === CallState.HELD ? "On hold" :
    state === CallState.ENDED ? "Call ended" :
    state === CallState.FAILED ? "Call failed" : "Calling…";

  return (
    <View style={{ flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: 28 }}>{call.displayName}</Text>
      <Text style={{ color: "#aaa", marginBottom: 40 }}>{status}</Text>

      <View style={{ flexDirection: "row", gap: 16 }}>
        <Pressable onPress={() => call.toggleMute()}><Text style={{ color: "#fff" }}>{isMuted ? "Unmute" : "Mute"}</Text></Pressable>
        <Pressable onPress={toggleSpeaker}><Text style={{ color: "#fff" }}>{isSpeakerOn ? "Earpiece" : "Speaker"}</Text></Pressable>
        <Pressable onPress={() => call.toggleHold()}><Text style={{ color: "#fff" }}>{isOnHold ? "Resume" : "Hold"}</Text></Pressable>
        <Pressable onPress={() => call.hangup()}><Text style={{ color: "red" }}>End</Text></Pressable>
      </View>
    </View>
  );
}
```

To show it as an overlay, render it inside the provider in place of `<CallOverlay />`. Alternatively, keep the overlay's banner/modal logic and pass `renderActiveCall` (see [Built-in call UI](ui.md#custom-screen-keep-the-overlay)).

## Connection indicator

```tsx
function ConnectionDot() {
  const state = useConnectionState();
  const color = { CONNECTED: "green", CONNECTING: "orange", RECONNECTING: "orange", ERROR: "red", DISCONNECTED: "grey" }[state];
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}
```

## Audio route picker (Bluetooth / speaker / earpiece)

```tsx
function AudioRoutePicker() {
  const { route, available, setRoute } = useAudioRoute();
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {available.map((r) => (
        <Pressable key={r} onPress={() => setRoute(r)}>
          <Text style={{ fontWeight: r === route ? "bold" : "normal" }}>{r}</Text>
        </Pressable>
      ))}
    </View>
  );
}
```

`toggleSpeaker()` switches between speaker and Bluetooth if a Bluetooth device is connected, otherwise between speaker and earpiece.

## Outside React

Every observable has `.value` and `.subscribe()`:

```ts
const sub = voice.activeCall$.subscribe((call) => {
  if (call) navigation.navigate("Call");
});
```
