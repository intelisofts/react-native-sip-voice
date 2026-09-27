# Making and managing calls

## Connection lifecycle

```ts
import { ConnectionState } from "react-native-sip-voice";

await voice.connect();            // or connect(creds)
voice.isConnected;                 // boolean
voice.currentConnectionState;      // ConnectionState.CONNECTED

const sub = voice.connectionState$.subscribe((state) => {
  // DISCONNECTED | CONNECTING | CONNECTED | RECONNECTING | ERROR
  console.log("SBC:", state);
});
sub.unsubscribe();

await voice.disconnect();          // hangs up live calls first
```

- Concurrent `connect()` calls share one attempt.
- Unexpected drops trigger automatic reconnection with exponential back-off (1s, 2s, 4s, … capped at 30s, 5 attempts by default). Live calls show `RECONNECTING` meanwhile.
- `SipVoiceProvider` calls `voice.handleNetworkChange()` whenever the app returns to the foreground, so recovery after the phone slept is immediate.

## Placing a call

```ts
const call = await voice.newCall({
  destination: "+44 7700 900123",   // normalised to +447700900123
  displayName: "Jane Doe",          // shown in CallKit / call screen
  callerName: "Acme Support",       // From display name sent to the SBC
  callerId: "+15550001111",         // sent as X-Caller-Id
  clientState: btoa(JSON.stringify({ orderId: 42 })), // sent as X-Client-State
  headers: { "X-Tenant": "acme" },  // any extra SIP headers
  metadata: { dialedFrom: "contacts" }, // local only, never sent
});
```

The destination can be:

| Input | Dialled URI |
|---|---|
| `+447700900123` | `sip:+447700900123@<domain>` |
| `0044 7700 900123` | `sip:+447700900123@<domain>` |
| `1001` | `sip:1001@<domain>` |
| `bob@other.example.com` | `sip:bob@other.example.com` |
| `sip:bob@other.example.com` | unchanged |

`newCall` resolves as soon as the INVITE is sent. It does **not** wait for an answer. Track progress with `callState$`.

## Sending data to your SBC

| Option | Header (default) | Change with |
|---|---|---|
| `callerId` | `X-Caller-Id: <value>` | `callerIdHeader` client option |
| `clientState` | `X-Client-State: <value>` | `clientStateHeader` client option |
| `headers` | as given | — |

```ts
const voice = new SipVoiceClient({
  callerIdHeader: "P-Asserted-Identity", // value becomes <sip:+1555…@domain>
  clientStateHeader: "X-App-State",
});
```

Header names are validated, and values containing CR/LF are rejected to prevent header injection.

## Call states

```
CONNECTING ──► RINGING ──► ACTIVE ◄──► HELD
     │             │          │
     │             │          └──► RECONNECTING ──► (back to ACTIVE/HELD)
     └─────────────┴──────────┴──► ENDED | FAILED
```

- `ENDED`: the call finished normally, or was cancelled by the local user before being answered.
- `FAILED`: the call never connected (busy, rejected, timeout, network error).

```ts
call.callState$.subscribe((state) => console.log(state));
call.currentState;      // CallState
call.durationSeconds;   // since answer; frozen after end
call.endReason;         // "local_hangup" | "remote_hangup" | "busy" | "rejected" | "no_answer" | "unavailable" | "timeout" | "network_error" | "native_ui" | "failed"
call.statusCode;        // e.g. 486 when rejected
call.direction;         // "outgoing" | "incoming"
call.id;                // UUID, also the CallKit / ConnectionService id
call.sipCallId;         // SIP Call-ID once known
```

## Controls

```ts
await call.hangup();

call.mute();  call.unmute();  call.toggleMute();   // returns new state
call.isMuted;  call.isMuted$

await call.hold();  await call.resume();  await call.toggleHold();
call.isOnHold;  call.isOnHold$

await call.sendDtmf("1");      // 0-9 * # A-D, or several: "123#"
```

- Hold sends a re-INVITE. If the far end rejects it, the promise rejects and the state is unchanged.
- DTMF uses RTP (RFC 2833) when possible, otherwise SIP INFO (`application/dtmf-relay`). You can force a mode with `dtmfMode: "rfc2833" | "info"`. react-native-webrtc currently has no RTP DTMF sender, so `auto` ends up using INFO. Make sure your SBC accepts INFO DTMF.

## Timeouts

Unanswered outgoing calls are hung up after `outgoingCallTimeoutMs`, which defaults to 60,000. They end with `endReason: "timeout"`.

## Events

```ts
voice.on("incomingCall", (call) => { /* ringing incoming call */ });
voice.on("callEnded", (call) => analytics.track("call_ended", call.toJSON()));
voice.on("error", (err) => Sentry.captureException(err));
```

## Several calls

`voice.calls$` holds every current call. `voice.activeCall$` points at the one the UI should focus on: the newest live call that isn't on hold. Ended calls stay in the list for about 1.5s so the UI can show "Call ended", then they're removed.

```ts
voice.currentCalls;        // Call[]
voice.getCall(id);         // Call | undefined
await voice.hangupAll();
```

## Recipe: enforce a maximum call length

```tsx
function useMaxDuration(minutes?: number) {
  const call = useActiveCall();
  const { state } = useCallState(call);
  const live = state === CallState.ACTIVE || state === CallState.HELD;

  useEffect(() => {
    if (!call || !live || !minutes || call.answeredAt === undefined) return;
    const left = minutes * 60_000 - (Date.now() - call.answeredAt);
    const t = setTimeout(() => call.hangup(), Math.max(0, left));
    return () => clearTimeout(t);
  }, [call, live, minutes]);
}
```

Basing the limit on `answeredAt` means hold and resume don't reset the timer.
