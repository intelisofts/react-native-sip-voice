# Troubleshooting

First, turn on logging:

```ts
new SipVoiceClient({ debug: true });
// and in credentials:
{ ..., traceSip: true }
```

## `connect()` fails or hangs

| Symptom | Likely cause |
|---|---|
| `wsServer must be a ws:// or wss:// URL` | Wrong scheme (`https://`) |
| WebSocket error straight away | TLS certificate invalid or self-signed, wrong port, or a firewall. Test the URL in a browser with a SIP.js demo |
| `401` / `403` on REGISTER | Wrong credentials, or the SBC doesn't read your token header. Check `headerName` / `headerScheme` |
| Connects, then drops every ~30s | A proxy or load balancer idle timeout. SIP.js sends keep-alives every 25s, so raise the LB timeout above that |

## Call fails immediately

- `call.statusCode` tells you why: `403` forbidden (auth or caller ID), `404`/`484` bad number, `488` codec/SDP not acceptable, `503` SBC can't route.
- A `488 Not Acceptable Here` almost always means the SBC doesn't support WebRTC SDP (DTLS/ICE). See [SBC setup](sbc-setup.md).

## Call connects but there's no audio

1. **Both directions silent, on iOS:** another library is changing `AVAudioSession` (for example `react-native-incall-manager` or `expo-av` recording mode). Remove it during calls. Audio starts only after CallKit activates the session.
2. **No audio at all, on any platform:** ICE failed. Add a TURN server to `iceServers`, and check that the SBC advertises a public IP in its SDP candidates.
3. **One-way audio:** NAT, or the SBC not latching to the source address. Enable ICE / symmetric RTP on the SBC.
4. **Microphone permission denied:** check the system settings. On Android, request `RECORD_AUDIO` before the first call.

## Call drops when the app goes to the background

- **iOS:** make sure the plugin ran (`UIBackgroundModes` contains `voip` and `audio`) and that `nativeCallUI` isn't disabled.
- **Android:** the foreground service must start while the app is visible. Check logcat for `SipVoiceFgs`. On MIUI and ColorOS, disable battery optimisation for the app.

## Call keeps running on the SBC after the app hung up

On hangup the client fires BYE (answered) or CANCEL (ringing) without waiting for a reply, and `disconnect()` closes the WebSocket immediately. The SBC must end the call itself:

- **End dialogs when their WebSocket closes.** This is the main hangup signal: a CANCEL can't be sent before the SBC's first provisional response, and a killed app or lost network sends nothing.
- **Set an RTP inactivity timeout (30–60 s)** as a backstop.
- **Don't require client-side session timers.** SIP.js doesn't refresh `Session-Expires`; the SBC can be the refresher.
- **Bill from the SBC's CDR**, not from the app.

## CallKit doesn't show my app name

Since iOS 14, CallKit always uses the app's **bundle display name** (`CFBundleDisplayName`). `nativeConfig.appName` only affects Android.

## DTMF digits aren't recognised

react-native-webrtc can't send RTP DTMF, so digits go as SIP INFO. Configure your SBC or IVR to accept INFO DTMF (`dtmf_mode=info` in Asterisk), or have the SBC convert INFO to RFC 2833 towards the trunk.

## Landmark image doesn't show

- The device is offline or Wikimedia is blocked. The gradient fallback is expected.
- The number is in national format (no `+` or `00`), so the country can't be known. Normalise numbers to E.164 before dialling, or use `phoneNumberForCall` / `landmarkResolver`.

## Duplicate React / "Invalid hook call" with a linked package

If you consume the package via `file:` or `npm link`, Metro may bundle the package's own `react`. Block it in `metro.config.js`:

```js
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
const pkg = path.resolve(__dirname, "../react-native-sip-voice");
config.watchFolders = [pkg];
config.resolver.blockList = [new RegExp(`${pkg}/node_modules/(react|react-native|expo)(/.*)?$`)];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
module.exports = config;
```

Installs from npm don't need this.
