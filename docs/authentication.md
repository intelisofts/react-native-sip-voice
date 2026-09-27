# Authentication

The client needs `SipCredentials`: where your SBC is, and how to prove who you are. There are two types.

## Digest (username / password)

Classic SIP authentication. The SBC challenges with 401/407 and SIP.js answers.

```ts
const creds: DigestCredentials = {
  type: "digest",
  wsServer: "wss://sbc.example.com:7443",
  domain: "sip.example.com",
  username: "1001",
  password: "s3cret",
  authorizationUsername: "1001-auth", // optional, when it differs from username
};
```

## Token (bearer)

Sends a token on every REGISTER and INVITE. By default that's `Authorization: Bearer <token>`, as in RFC 8898. Use this when your backend already issues JWTs.

```ts
const creds: TokenCredentials = {
  type: "token",
  wsServer: "wss://sbc.example.com",
  domain: "sip.example.com",
  token: jwt,
  username: "+447700900123",      // optional, defaults to "anonymous"
};
```

Variations:

```ts
// Custom header, no scheme: X-Auth-Token: <jwt>
{ type: "token", wsServer, domain, token: jwt, headerName: "X-Auth-Token" }

// Keep the Authorization header but drop the "Bearer " prefix
{ type: "token", wsServer, domain, token: jwt, headerScheme: "" }

// Also put the token in the WebSocket URL: wss://sbc.example.com/ws?access_token=<jwt>
{ type: "token", wsServer: "wss://sbc.example.com/ws", domain, token: jwt, wsQueryParam: "access_token" }
```

## Options shared by both types

| Field | Default | Notes |
|---|---|---|
| `wsServer` | required | Must start with `ws://` or `wss://`. Use `wss://` in production |
| `domain` | required | Host part of SIP URIs (`sip:+44…@domain`) |
| `username` | `anonymous` (token) | AOR user part |
| `displayName` | — | From display name when a call doesn't set `callerName` |
| `iceServers` | Google STUN | Add TURN for users behind strict NAT |
| `register` | `false` | Send REGISTER after connecting. Needed only to **receive** calls |
| `registerExpires` | `600` | Seconds |
| `userAgentString` | `react-native-sip-voice` | `User-Agent` header |
| `traceSip` | `false` | Logs every SIP message. Great for debugging |

## Where credentials come from

### Option A: a credentials provider (recommended)

The client calls the provider whenever `connect()` is called without arguments. That includes the automatic connect inside `newCall()`.

```ts
const voice = new SipVoiceClient({
  credentialsProvider: async () => {
    const res = await fetch("https://api.example.com/voice/credentials", {
      headers: { Authorization: `Bearer ${await getSessionToken()}` },
    });
    if (!res.ok) throw new Error("Could not get voice credentials");
    const body = await res.json();
    return {
      type: "token",
      wsServer: body.wsServer,
      domain: body.domain,
      username: body.username,
      token: body.token,
      iceServers: body.iceServers,
    };
  },
});

await voice.newCall({ destination: "+447700900123" }); // provider runs automatically
```

### Option B: per-call credentials

This fits when your backend authorises each call separately, for example after a balance check.

```ts
async function startCall(number: string) {
  const permission = await api.authoriseCall(number);  // your backend
  if (!permission.allowed) return Alert.alert("Not allowed");

  if (!voice.isConnected) {
    await voice.connect({
      type: "token",
      wsServer: permission.wsServer,
      domain: permission.domain,
      token: permission.token,
    });
  }
  await voice.newCall({ destination: number, clientState: permission.clientState });
}
```

## Token expiry

- An existing WebSocket stays open after the token expires, because the SBC only checks the token on requests.
- New calls reuse the connection. If your SBC rejects expired tokens on INVITE, reconnect with a fresh token before dialling:

```ts
await voice.disconnect();
await voice.connect(); // provider fetches a fresh token
```

- Automatic reconnects after a network drop reuse the same transport and credentials. If they keep failing, the client ends up in `ConnectionState.ERROR`. Calling `connect()` again then fetches new credentials.

## Security checklist

- Always use `wss://` (TLS).
- Issue **short-lived** tokens or per-device SIP passwords from your backend. Never hard-code them.
- On the SBC, validate that the token's caller matches the `From` / caller-ID header.
- Treat `X-Client-State` as untrusted input on the server side. Sign it if it drives billing.
