# Testing your app

The core is plain TypeScript with two injection points, so you can test call flows in Jest without a network, an SBC, or native modules:

- `new SipVoiceClient(options, { adapter })`: replace SIP.js with a fake.
- `<SipVoiceProvider native={...}>`: replace CallKit / ConnectionService with a fake, or with `NoopNativeCallUI`.

## Jest setup

```js
// jest.config.js
module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-native-sip-voice|sip\\.js)",
  ],
  moduleNameMapper: {
    // react-native-webrtc has no JS fallback; stub it
    "^react-native-webrtc$": "<rootDir>/__mocks__/react-native-webrtc.js",
  },
};
```

```js
// __mocks__/react-native-webrtc.js
module.exports = { registerGlobals: jest.fn(), mediaDevices: { getUserMedia: jest.fn() } };
```

## A fake signalling adapter

```ts
import type { SignalingAdapter } from "react-native-sip-voice";

export function fakeAdapter() {
  const session = {
    hangup: jest.fn(async () => {}), answer: jest.fn(async () => {}), reject: jest.fn(async () => {}),
    setMuted: jest.fn(), setHold: jest.fn(async () => {}), sendDtmf: jest.fn(async () => {}),
  };
  let connected = false;
  const adapter: SignalingAdapter & { session: typeof session } = {
    session,
    connect: jest.fn(async () => { connected = true; }),
    reconnect: jest.fn(async () => {}),
    disconnect: jest.fn(async () => { connected = false; }),
    isConnected: () => connected,
    invite: jest.fn(() => session),
  };
  return adapter;
}
```

## Testing a flow

```tsx
import { act, render, screen, fireEvent } from "@testing-library/react-native";
import { SipVoiceClient, SipVoiceProvider, NoopNativeCallUI } from "react-native-sip-voice";
import { CallOverlay } from "react-native-sip-voice/ui";

test("user can hang up", async () => {
  const adapter = fakeAdapter();
  const client = new SipVoiceClient({}, { adapter });
  await client.connect({ type: "token", wsServer: "wss://x", domain: "d", token: "t" });

  await render(
    <SipVoiceProvider client={client} native={new NoopNativeCallUI()}>
      <CallOverlay disableLandmarks />
    </SipVoiceProvider>,
  );

  let call;
  await act(async () => { call = await client.newCall({ destination: "+447700900123" }); });
  await act(() => call.onAnswered());        // simulate 200 OK
  expect(screen.getByTestId("call-status")).toHaveTextContent("00:00");

  await fireEvent.press(screen.getByTestId("call-end"));
  expect(adapter.session.hangup).toHaveBeenCalled();

  await client.destroy();
});
```

Simulating network events:

| To simulate | Call |
|---|---|
| Remote ringing (180) | `call.onRinging()` |
| Answer (200 OK) | `call.onAnswered()` |
| Remote hang-up / rejection | `call.onEnded("remote_hangup")` / `call.onEnded("busy", 486)` |

> With `@testing-library/react-native` v14, `render`, `act` and `fireEvent` are async: always `await` them.

Call `client.destroy()` after each test so timers (the call timeout, reconnects) don't leak between tests.
