import { SipVoiceClient } from "../../src/core/SipVoiceClient";
import { CallState, ConnectionState } from "../../src/core/types";
import { digestCreds, FakeAdapter, tokenCreds } from "../helpers/fakes";

const liveClients: SipVoiceClient[] = [];
afterEach(async () => {
  await Promise.all(liveClients.splice(0).map((c) => c.destroy()));
});

function setup(options: ConstructorParameters<typeof SipVoiceClient>[0] = {}) {
  const adapter = new FakeAdapter();
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const client = new SipVoiceClient(options, { adapter, logger });
  liveClients.push(client);
  return { client, adapter };
}

afterEach(() => {
  jest.useRealTimers();
});

describe("SipVoiceClient connection", () => {
  it("connects with explicit credentials", async () => {
    const { client, adapter } = setup();
    const states: ConnectionState[] = [];
    client.connectionState$.subscribe((s) => states.push(s));
    await client.connect(digestCreds);
    expect(adapter.connect).toHaveBeenCalledWith(digestCreds, expect.any(Object));
    expect(client.isConnected).toBe(true);
    expect(states).toEqual([ConnectionState.DISCONNECTED, ConnectionState.CONNECTING, ConnectionState.CONNECTED]);
  });

  it("uses the credentials provider when connect() has no args", async () => {
    const provider = jest.fn(async () => tokenCreds);
    const { client, adapter } = setup({ credentialsProvider: provider });
    await client.connect();
    expect(provider).toHaveBeenCalled();
    expect(adapter.lastCredentials).toBe(tokenCreds);
  });

  it("dedupes concurrent connect calls", async () => {
    const { client, adapter } = setup();
    await Promise.all([client.connect(digestCreds), client.connect(digestCreds)]);
    expect(adapter.connect).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ ...digestCreds, wsServer: "https://nope" }, "wsServer"],
    [{ ...digestCreds, domain: "" }, "domain"],
    [{ ...digestCreds, password: "" }, "username and password"],
    [{ ...tokenCreds, token: "" }, "token"],
  ])("rejects invalid credentials (%#)", async (creds, msg) => {
    const { client } = setup();
    await expect(client.connect(creds as any)).rejects.toThrow(msg);
  });

  it("throws without credentials or provider", async () => {
    const { client } = setup();
    await expect(client.connect()).rejects.toThrow("No SIP credentials");
  });

  it("reports ERROR and emits error when the adapter fails", async () => {
    const { client, adapter } = setup();
    const onError = jest.fn();
    client.on("error", onError);
    adapter.connect.mockRejectedValueOnce(new Error("401 Unauthorized"));
    await expect(client.connect(digestCreds)).rejects.toThrow("401");
    expect(client.currentConnectionState).toBe(ConnectionState.ERROR);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "401 Unauthorized" }));
  });

  it("disconnect hangs up live calls and closes the transport", async () => {
    const { client, adapter } = setup();
    await client.connect(digestCreds);
    const call = await client.newCall({ destination: "+447700900123" });
    await client.disconnect();
    expect(call.currentState).toBe(CallState.ENDED);
    expect(adapter.disconnect).toHaveBeenCalled();
    expect(client.currentConnectionState).toBe(ConnectionState.DISCONNECTED);
  });

  it("forgets credentials on disconnect: no silent re-login with an old token", async () => {
    const { client, adapter } = setup();
    await client.connect(tokenCreds);
    await client.disconnect();
    await expect(client.newCall({ destination: "+447700900123" })).rejects.toThrow("Not connected to SBC");
    adapter.connected = false;
    await client.handleNetworkChange();
    expect(adapter.connect).toHaveBeenCalledTimes(1);
    expect(adapter.reconnect).not.toHaveBeenCalled();
  });

  it("newCall asks the provider for fresh credentials each time it has to connect", async () => {
    let n = 0;
    const provider = jest.fn(async () => ({ ...tokenCreds, token: `t${++n}` }));
    const { client, adapter } = setup({ credentialsProvider: provider });
    await client.newCall({ destination: "+447700900123" });
    await client.disconnect();
    await client.newCall({ destination: "+447700900123" });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(adapter.lastCredentials).toMatchObject({ token: "t2" });
  });

  it("disconnect right after a hangup closes the transport without waiting for the SBC", async () => {
    const { client, adapter } = setup();
    await client.connect(digestCreds);
    const call = await client.newCall({ destination: "+447700900123" });
    adapter.lastInvite.session.hangup.mockImplementationOnce(() => new Promise<void>(() => {})); // no reply ever
    void call.hangup();
    expect(call.currentState).toBe(CallState.ENDED);
    await client.disconnect();
    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
    expect(client.currentConnectionState).toBe(ConnectionState.DISCONNECTED);
  });

  it("logout is an alias for disconnect", async () => {
    const { client, adapter } = setup();
    await client.connect(digestCreds);
    await client.logout();
    expect(adapter.disconnect).toHaveBeenCalled();
  });
});

describe("SipVoiceClient outgoing calls", () => {
  it("sends INVITE with target URI, caller id, client state and custom headers", async () => {
    const { client, adapter } = setup();
    await client.connect(digestCreds);
    const call = await client.newCall({
      destination: "0044 7700 900123",
      callerName: "Noah Call",
      callerId: "+15550001111",
      clientState: "eyJhIjoxfQ==",
      headers: { "X-Tenant": "acme" },
      displayName: "Bob",
      metadata: { plan: "gold" },
    });
    const { request } = adapter.lastInvite;
    expect(request.targetUri).toBe("sip:+447700900123@sip.example.com");
    expect(request.fromDisplayName).toBe("Noah Call");
    expect(request.extraHeaders).toEqual([
      "X-Caller-Id: +15550001111",
      "X-Client-State: eyJhIjoxfQ==",
      "X-Tenant: acme",
    ]);
    expect(request.dtmfMode).toBe("auto");
    expect(call.destination).toBe("+447700900123");
    expect(call.displayName).toBe("Bob");
    expect(call.metadata).toEqual({ plan: "gold" });
    expect(call.direction).toBe("outgoing");
  });

  it("honours custom header names and formats P-Asserted-Identity as a URI", async () => {
    const { client, adapter } = setup({ callerIdHeader: "P-Asserted-Identity", clientStateHeader: "X-State" });
    await client.connect(digestCreds);
    await client.newCall({ destination: "+1", callerId: "+15550001111", clientState: "s" });
    expect(adapter.lastInvite.request.extraHeaders).toEqual([
      "P-Asserted-Identity: <sip:+15550001111@sip.example.com>",
      "X-State: s",
    ]);
  });

  it("rejects header injection", async () => {
    const { client } = setup();
    await client.connect(digestCreds);
    await expect(client.newCall({ destination: "+1", headers: { "X-A": "x\r\nEvil: 1" } })).rejects.toThrow(
      "line break",
    );
    await expect(client.newCall({ destination: "+1", headers: { "Bad Name": "x" } })).rejects.toThrow(
      "Invalid SIP header name",
    );
  });

  it("auto-connects through the provider when not connected", async () => {
    const { client, adapter } = setup({ credentialsProvider: async () => digestCreds });
    await client.newCall({ destination: "+1234" });
    expect(adapter.connect).toHaveBeenCalled();
    expect(adapter.invite).toHaveBeenCalled();
  });

  it("throws when not connected and no provider", async () => {
    const { client } = setup();
    await expect(client.newCall({ destination: "+1" })).rejects.toThrow("Not connected");
  });

  it("requires a destination", async () => {
    const { client } = setup();
    await expect(client.newCall({ destination: " " })).rejects.toThrow("destination");
  });

  it("marks the call failed when the adapter throws synchronously", async () => {
    const { client, adapter } = setup();
    await client.connect(digestCreds);
    adapter.invite.mockImplementationOnce(() => {
      throw new Error("bad uri");
    });
    await expect(client.newCall({ destination: "+1" })).rejects.toThrow("bad uri");
    expect(client.currentCalls[0].currentState).toBe(CallState.FAILED);
  });

  it("exposes the call as active and removes it shortly after it ends", async () => {
    jest.useFakeTimers();
    const { client } = setup();
    await client.connect(digestCreds);
    const ended = jest.fn();
    client.on("callEnded", ended);
    const call = await client.newCall({ destination: "+1" });
    expect(client.currentActiveCall).toBe(call);
    expect(client.getCall(call.id)).toBe(call);

    call.onAnswered();
    call.onEnded("remote_hangup");
    expect(ended).toHaveBeenCalledWith(call);
    // Lingers so the UI can show "Call ended".
    expect(client.currentActiveCall).toBe(call);
    jest.advanceTimersByTime(1600);
    expect(client.currentActiveCall).toBeNull();
    expect(client.currentCalls).toHaveLength(0);
  });

  it("times out unanswered outgoing calls", async () => {
    jest.useFakeTimers();
    const { client, adapter } = setup({ outgoingCallTimeoutMs: 5000 });
    await client.connect(digestCreds);
    const call = await client.newCall({ destination: "+1" });
    jest.advanceTimersByTime(5001);
    expect(call.endReason).toBe("timeout");
    expect(call.currentState).toBe(CallState.FAILED);
    expect(adapter.lastInvite.session.hangup).toHaveBeenCalled();
  });

  it("does not time out answered calls", async () => {
    jest.useFakeTimers();
    const { client } = setup({ outgoingCallTimeoutMs: 5000 });
    await client.connect(digestCreds);
    const call = await client.newCall({ destination: "+1" });
    call.onAnswered();
    jest.advanceTimersByTime(10_000);
    expect(call.currentState).toBe(CallState.ACTIVE);
  });

  it("prefers a live un-held call as the active call", async () => {
    const { client } = setup();
    await client.connect(digestCreds);
    const a = await client.newCall({ destination: "+1" });
    a.onAnswered();
    const b = await client.newCall({ destination: "+2" });
    b.onAnswered();
    expect(client.currentActiveCall).toBe(b);
    await b.hold();
    expect(client.currentActiveCall).toBe(a);
  });

  it("hangupAll ends every live call", async () => {
    const { client } = setup();
    await client.connect(digestCreds);
    const a = await client.newCall({ destination: "+1" });
    const b = await client.newCall({ destination: "+2" });
    await client.hangupAll();
    expect([a.currentState, b.currentState]).toEqual([CallState.ENDED, CallState.ENDED]);
  });
});

describe("SipVoiceClient reconnection", () => {
  it("reconnects with back-off and restores calls", async () => {
    jest.useFakeTimers();
    const { client, adapter } = setup({ reconnectBaseDelayMs: 100 });
    await client.connect(digestCreds);
    const call = await client.newCall({ destination: "+1" });
    call.onAnswered();

    adapter.drop();
    expect(client.currentConnectionState).toBe(ConnectionState.RECONNECTING);
    expect(call.currentState).toBe(CallState.RECONNECTING);

    await jest.advanceTimersByTimeAsync(100);
    expect(adapter.reconnect).toHaveBeenCalledTimes(1);
    expect(client.currentConnectionState).toBe(ConnectionState.CONNECTED);
    expect(call.currentState).toBe(CallState.ACTIVE);
  });

  it("gives up after max attempts and fails live calls", async () => {
    jest.useFakeTimers();
    const { client, adapter } = setup({ reconnectBaseDelayMs: 10, maxReconnectAttempts: 2 });
    const onError = jest.fn();
    client.on("error", onError);
    await client.connect(digestCreds);
    const call = await client.newCall({ destination: "+1" });
    call.onAnswered();
    adapter.reconnect.mockRejectedValue(new Error("down"));

    adapter.drop();
    await jest.advanceTimersByTimeAsync(10); // attempt 1
    await jest.advanceTimersByTimeAsync(20); // attempt 2
    expect(adapter.reconnect).toHaveBeenCalledTimes(2);
    expect(client.currentConnectionState).toBe(ConnectionState.ERROR);
    expect(call.endReason).toBe("network_error");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Lost connection to SBC" }));
  });

  it("does not reconnect after an intentional disconnect", async () => {
    jest.useFakeTimers();
    const { client, adapter } = setup();
    await client.connect(digestCreds);
    await client.disconnect();
    adapter.drop();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(adapter.reconnect).not.toHaveBeenCalled();
    expect(client.currentConnectionState).toBe(ConnectionState.DISCONNECTED);
  });

  it("handleNetworkChange reconnects immediately when the socket is down", async () => {
    jest.useFakeTimers();
    const { client, adapter } = setup({ reconnectBaseDelayMs: 50 });
    await client.connect(digestCreds);
    adapter.connected = false;
    await client.handleNetworkChange();
    await jest.advanceTimersByTimeAsync(50);
    expect(adapter.reconnect).toHaveBeenCalled();
  });

  it("handleNetworkChange is a no-op while connected", async () => {
    const { client, adapter } = setup();
    await client.connect(digestCreds);
    await client.handleNetworkChange();
    expect(adapter.reconnect).not.toHaveBeenCalled();
  });
});

describe("SipVoiceClient incoming calls and push", () => {
  it("creates a ringing incoming call and emits incomingCall", async () => {
    const { client, adapter } = setup();
    const onIncoming = jest.fn();
    client.on("incomingCall", onIncoming);
    await client.connect(digestCreds);
    const session = adapter.incoming("+33123456789", { "x-foo": "bar" }, "Marie");
    const call = onIncoming.mock.calls[0][0];
    expect(call.direction).toBe("incoming");
    expect(call.currentState).toBe(CallState.RINGING);
    expect(call.displayName).toBe("Marie");
    expect(call.metadata.fromPush).toBe(false);
    await call.answer();
    expect(session.answer).toHaveBeenCalled();
  });

  it("reuses the push call id when the X-Call-Id header matches", async () => {
    const { client, adapter } = setup();
    await client.connect(digestCreds);
    client.registerPushCall("aaaaaaaa-0000-4000-8000-000000000001", { call_id: "one" });
    client.registerPushCall("aaaaaaaa-0000-4000-8000-000000000002", { call_id: "two" });
    const onIncoming = jest.fn();
    client.on("incomingCall", onIncoming);
    adapter.incoming("+1", { "x-call-id": "two" });
    expect(onIncoming.mock.calls[0][0].id).toBe("aaaaaaaa-0000-4000-8000-000000000002");
    expect(onIncoming.mock.calls[0][0].metadata.fromPush).toBe(true);
    adapter.incoming("+1");
    expect(onIncoming.mock.calls[1][0].id).toBe("aaaaaaaa-0000-4000-8000-000000000001");
  });

  it("ignores stale push registrations", async () => {
    let now = 0;
    const adapter = new FakeAdapter();
    const client = new SipVoiceClient({}, { adapter, now: () => now });
    await client.connect(digestCreds);
    client.registerPushCall("aaaaaaaa-0000-4000-8000-000000000009");
    now = 120_000;
    const onIncoming = jest.fn();
    client.on("incomingCall", onIncoming);
    adapter.incoming("+1");
    expect(onIncoming.mock.calls[0][0].id).not.toBe("aaaaaaaa-0000-4000-8000-000000000009");
  });
});

describe("SipVoiceClient destroy", () => {
  it("cannot be reused after destroy", async () => {
    const { client } = setup();
    await client.connect(digestCreds);
    await client.destroy();
    await expect(client.connect(digestCreds)).rejects.toThrow("destroyed");
  });
});
