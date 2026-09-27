# SBC setup

Mobile WebRTC media is always **encrypted (DTLS-SRTP) and negotiated with ICE**. An SBC that only speaks plain SIP/RTP can't talk to the app directly. It needs WebRTC support, or a media relay such as rtpengine in front of it.

## Checklist

| Requirement | Why |
|---|---|
| SIP over **WSS** (RFC 7118), valid public TLS certificate | Signalling transport. Self-signed certificates fail on devices |
| **ICE** (ICE-lite is fine) | NAT traversal |
| **DTLS-SRTP** | WebRTC mandates media encryption |
| `rtcp-mux`, `BUNDLE` | Standard WebRTC SDP |
| Opus and/or PCMU/PCMA | Audio codecs offered by the app |
| SIP INFO DTMF (`application/dtmf-relay`) | Keypad digits. RTP DTMF isn't available from react-native-webrtc |
| re-INVITE hold (`sendonly` / `inactive`) | Hold / resume |
| Accepts `X-Caller-Id`, `X-Client-State` (or your names) | App metadata |
| Validates `Authorization: Bearer` (token mode) or digest | Auth |

For users behind symmetric NAT, run a **TURN** server (for example coturn) and pass it via `iceServers`.

## Kamailio + rtpengine (sketch)

```
# kamailio.cfg
listen=tls:0.0.0.0:7443
loadmodule "websocket.so"
loadmodule "rtpengine.so"

event_route[xhttp:request] {
    if ($hdr(Upgrade) =~ "websocket" && ws_handle_handshake()) exit;
}

route[MEDIA] {
    if (proto == WS || proto == WSS) {
        # From WebRTC client towards SIP trunk: decrypt to RTP
        rtpengine_manage("RTP/AVP replace-origin replace-session-connection ICE=remove");
    } else {
        # From trunk towards WebRTC client: encrypt
        rtpengine_manage("UDP/TLS/RTP/SAVPF ICE=force rtcp-mux-offer DTLS=passive");
    }
}

# Read app headers
$var(state) = $hdr(X-Client-State);
```

## FreeSWITCH

```xml
<!-- sip_profiles/internal.xml -->
<param name="wss-binding" value=":7443"/>
<param name="tls-cert-dir" value="/etc/freeswitch/tls"/>
<param name="apply-candidate-acl" value="rfc1918.auto"/>
```

Read headers in the dialplan with `${sip_h_X-Client-State}` and `${sip_h_X-Caller-Id}`.

## Asterisk (PJSIP)

```ini
[transport-wss]
type=transport
protocol=wss
bind=0.0.0.0

[webrtc-endpoint](!)
type=endpoint
webrtc=yes           ; enables ICE, DTLS-SRTP, rtcp-mux, AVPF
dtmf_mode=info
allow=!all,opus,ulaw
```

In the dialplan: `${PJSIP_HEADER(read,X-Client-State)}`.

## Token authentication on the SBC

In token mode the app sends:

```
INVITE sip:+447700900123@sip.example.com SIP/2.0
Authorization: Bearer eyJhbGciOi...
X-Caller-Id: +15550001111
X-Client-State: eyJ1c2VyIjoi...
```

Validate the JWT (signature, `exp`, and a subject that matches the caller) in your proxy. With Kamailio, for example, use `jwt_verify()` or an HTTP call to your auth service via `http_async_client`. Reject with `401` or `403` when it's invalid.

## Testing without the app

Try the SBC from a browser first, for example with [SIP.js demos](https://sipjs.com/guides/) or JsSIP's tryit, using the same `wss://` URL and credentials. If a browser can make the call, the app can too.
