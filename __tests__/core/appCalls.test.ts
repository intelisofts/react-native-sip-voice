import { SipVoiceClient } from "../../src/core/SipVoiceClient";
import { CallState, ConnectionState } from "../../src/core/types";
import { FakeAdapter, tokenCreds } from "../helpers/fakes";

const live: SipVoiceClient[] = [];
afterEach(async () => {
  jest.useRealTimers();
  await Promise.all(live.splice(0).map((c) => c.destroy()));
});

function setup() {
  const adapter = new FakeAdapter();
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const client = new SipVoiceClient({ nativeCallUI: false }, { adapter, logger });
  live.push(client);
  return { client, adapter };
}

const registering = { ...tokenCreds, register: true, registerExpires: 120 };

describe("registering while the app is open", () => {
  it("passes register and the expiry through to the adapter", async () => {
    const { client, adapter } = setup();
    await client.connect(registering);
    expect(adapter.lastCredentials).toMatchObject({ register: true, registerExpires: 120 });
  });

  it("refreshRegistration() re-registers on the open connection without reconnecting", async () => {
    const { client, adapter } = setup();
    await client.connect(registering);

    await client.refreshRegistration({ ...registering, token: "fresh" });

    expect(adapter.connect).toHaveBeenCalledTimes(1);
    expect(adapter.refreshRegistration).toHaveBeenCalledWith(expect.objectContaining({ token: "fresh" }));
  });

  it("refreshRegistration() connects when there is no connection", async () => {
    const { client, adapter } = setup();

    await client.refreshRegistration(registering);

    expect(adapter.connect).toHaveBeenCalledTimes(1);
    expect(adapter.refreshRegistration).not.toHaveBeenCalled();
  });

  it("unregister() un-registers, closes the connection and reports true when idle", async () => {
    const { client, adapter } = setup();
    await client.connect(registering);

    await expect(client.unregister()).resolves.toBe(true);

    expect(adapter.unregister).toHaveBeenCalledTimes(1);
    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
    expect(client.currentConnectionState).toBe(ConnectionState.DISCONNECTED);
  });

  it("unregister() leaves a live call alone and reports false", async () => {
    const { client, adapter } = setup();
    await client.connect(registering);
    await client.newCall({ destination: "+291712345678" });

    await expect(client.unregister()).resolves.toBe(false);

    expect(adapter.unregister).not.toHaveBeenCalled();
    expect(adapter.disconnect).not.toHaveBeenCalled();
    expect(client.isConnected).toBe(true);
  });

  it("unregister() does not wait forever for a slow server", async () => {
    jest.useFakeTimers();
    const { client, adapter } = setup();
    await client.connect(registering);
    adapter.unregister.mockImplementation(() => new Promise<void>(() => {})); // never answers

    const done = client.unregister();
    await jest.advanceTimersByTimeAsync(2000);

    await expect(done).resolves.toBe(true);
    expect(adapter.disconnect).toHaveBeenCalled();
  });

  it("unregister() still closes the connection when un-registering fails", async () => {
    const { client, adapter } = setup();
    await client.connect(registering);
    adapter.unregister.mockRejectedValueOnce(new Error("boom"));

    await expect(client.unregister()).resolves.toBe(true);
    expect(adapter.disconnect).toHaveBeenCalled();
  });

  it("unregister() when never connected is a harmless no-op", async () => {
    const { client } = setup();
    await expect(client.unregister()).resolves.toBe(true);
  });
});

describe("placing an app call", () => {
  it("sends the call id header and keeps the app call id in local metadata", async () => {
    const { client, adapter } = setup();
    await client.connect(registering);

    const call = await client.newCall({
      destination: "+291712345678",
      headers: { "X-Call-Id": "11111111-2222-3333-4444-555555555555" },
      metadata: { appCallId: "11111111-2222-3333-4444-555555555555", dialedNumber: "+291712345678" },
    });

    expect(adapter.lastInvite.request.extraHeaders).toContain("X-Call-Id: 11111111-2222-3333-4444-555555555555");
    expect(call.metadata.appCallId).toBe("11111111-2222-3333-4444-555555555555");
  });
});

describe("answer gate", () => {
  async function ringing() {
    const { client, adapter } = setup();
    await client.connect(registering);
    const session = adapter.incoming("+17712228370", { "x-call-id": "abc" });
    const call = client.currentCalls[0];
    return { client, call, session };
  }

  it("answers normally when no gate is set", async () => {
    const { call, session } = await ringing();
    await call.answer();
    expect(session.answer).toHaveBeenCalledTimes(1);
  });

  it("asks the gate first and answers when it allows the call", async () => {
    const { client, call, session } = await ringing();
    const gate = jest.fn(async () => true);
    client.setAnswerGate(gate);

    await call.answer();

    expect(gate).toHaveBeenCalledWith(call);
    expect(session.answer).toHaveBeenCalledTimes(1);
    expect(call.currentState).toBe(CallState.CONNECTING);
  });

  it("rejects the call and ends it as answered elsewhere when the gate refuses", async () => {
    const { client, call, session } = await ringing();
    client.setAnswerGate(async () => false);

    await call.answer();

    expect(session.answer).not.toHaveBeenCalled();
    expect(session.reject).toHaveBeenCalledTimes(1);
    expect(call.isTerminated).toBe(true);
    expect(call.endReason).toBe("answered_elsewhere");
  });

  it("turns the call down as busy (486) when the gate says this person is on another call", async () => {
    const { client, call, session } = await ringing();
    client.setAnswerGate(async () => "busy");

    await call.answer();

    expect(session.answer).not.toHaveBeenCalled();
    expect(session.reject).toHaveBeenCalledWith(486);
    expect(call.endReason).toBe("busy");
  });

  it("does not answer when the gate fails (for example no network to the backend)", async () => {
    const { client, call, session } = await ringing();
    client.setAnswerGate(async () => {
      throw new Error("offline");
    });

    await call.answer();

    expect(session.answer).not.toHaveBeenCalled();
    expect(call.isTerminated).toBe(true);
    expect(call.endReason).toBe("failed");
  });

  it("does not answer a call that ended while the gate was deciding", async () => {
    const { client, call, session } = await ringing();
    let release!: (v: boolean) => void;
    client.setAnswerGate(() => new Promise<boolean>((r) => (release = r)));

    const pending = call.answer();
    await call.hangup();
    release(true);
    await pending;

    expect(session.answer).not.toHaveBeenCalled();
  });

  it("can be removed again", async () => {
    const { client, call, session } = await ringing();
    client.setAnswerGate(async () => false);
    client.setAnswerGate(undefined);

    await call.answer();
    expect(session.answer).toHaveBeenCalledTimes(1);
  });

  it("applies to calls that were already ringing when the gate was set", async () => {
    const { client, adapter } = setup();
    await client.connect(registering);
    const session = adapter.incoming("+17712228370");
    const call = client.currentCalls[0];
    client.setAnswerGate(async () => false); // set after the call arrived

    await call.answer();
    expect(session.answer).not.toHaveBeenCalled();
  });

  it("is not used for outgoing calls", async () => {
    const { client } = setup();
    await client.connect(registering);
    const gate = jest.fn(async () => false);
    client.setAnswerGate(gate);
    await client.newCall({ destination: "+291712345678" });
    expect(gate).not.toHaveBeenCalled();
  });
});
