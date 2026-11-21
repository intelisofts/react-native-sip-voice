import { SipVoiceClient } from "../../src/core/SipVoiceClient";
import { getNativeCallCoordinator, NativeCallCoordinator } from "../../src/native/NativeCallCoordinator";
import { digestCreds, FakeAdapter, FakeCallSystem, flush, pushSession } from "../helpers/fakes";

const liveClients: SipVoiceClient[] = [];
afterEach(async () => {
  await Promise.all(liveClients.splice(0).map((c) => c.destroy()));
});

async function setup(prepare?: (system: FakeCallSystem) => void) {
  const adapter = new FakeAdapter();
  const client = new SipVoiceClient({}, { adapter });
  liveClients.push(client);
  const system = new FakeCallSystem();
  prepare?.(system);
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const coordinator = new NativeCallCoordinator(client, system as any, logger);
  await coordinator.start({ supportsHolding: true });
  await client.connect(digestCreds);
  return { adapter, client, system, coordinator, logger };
}

describe("NativeCallCoordinator (expo-callkit-telecom)", () => {
  it("starts once", async () => {
    const { system, coordinator } = await setup();
    await coordinator.start();
    expect(system.listenerCount("answered")).toBe(1);
    expect(system.getActiveCallSession).toHaveBeenCalledTimes(1);
  });

  it("reports an outgoing call to the system and follows it to the end", async () => {
    const { client, system } = await setup();
    const call = await client.newCall({ destination: "+447700900123", displayName: "Bob" });
    expect(system.startOutgoingCall).toHaveBeenCalledWith(
      { id: "+447700900123", displayName: "Bob", phoneNumber: "+447700900123" },
      { hasVideo: false, supportsHolding: true, supportsDTMF: true },
    );
    await flush();
    call.onRinging();
    call.onAnswered();
    call.onAnswered();
    expect(system.reportOutgoingCallConnected).toHaveBeenCalledTimes(1);
    expect(system.reportOutgoingCallConnected).toHaveBeenCalledWith("sys-1");
    await call.hold();
    await call.resume();
    expect(system.setHeld).toHaveBeenCalledWith("sys-1", true);
    expect(system.setHeld).toHaveBeenLastCalledWith("sys-1", false);
    await call.hangup();
    expect(system.endCall).toHaveBeenCalledWith("sys-1");
  });

  it("reports a remote hang-up with its reason", async () => {
    const { client, system } = await setup();
    const call = await client.newCall({ destination: "+447700900123", displayName: "Bob" });
    await flush();
    call.onAnswered();
    call.onEnded("remote_hangup");
    expect(system.reportCallEnded).toHaveBeenCalledWith("sys-1", "remoteEnded");
    expect(system.endCall).not.toHaveBeenCalled();
  });

  it("ends the system call when the call is over before the system gave its id", async () => {
    const { client, system } = await setup();
    let resolve!: (id: string) => void;
    system.startOutgoingCall.mockImplementationOnce(() => new Promise<string>((r) => (resolve = r)));
    const call = await client.newCall({ destination: "+447700900123", displayName: "Bob" });
    await call.hangup();
    resolve("sys-late");
    await flush();
    expect(system.endCall).toHaveBeenCalledWith("sys-late");
  });

  it("gives a push call's INVITE the system id, without reporting it again, and fulfils the system answer", async () => {
    const { adapter, client, system } = await setup();
    system.emit("sessionAdded", { session: pushSession("os-1", "abc") });
    const session = adapter.incoming("+1", { "x-call-id": "abc" });
    const call = client.currentCalls[0];
    expect(call.id).toBe("os-1");
    expect(system.reportIncomingCall).not.toHaveBeenCalled();

    system.emit("answered", { id: "os-1", requestId: "req-1" });
    expect(session.answer).toHaveBeenCalled();
    call.onAnswered();
    expect(system.fulfillIncomingCallConnected).toHaveBeenCalledWith("req-1");
    expect(system.answerCall).not.toHaveBeenCalled(); // the system answered, not the app
  });

  it("answers once the INVITE arrives when Answer was tapped before it (closed app)", async () => {
    const { adapter, client, system } = await setup();
    system.emit("sessionAdded", { session: pushSession("os-2", "def") });
    system.emit("answered", { id: "os-2", requestId: "req-2" });
    const session = adapter.incoming("+1", { "x-call-id": "def" });
    expect(client.currentCalls[0].id).toBe("os-2");
    expect(session.answer).toHaveBeenCalled();
  });

  it("rejects the INVITE of a call declined on the system screen before it arrived, without ringing again", async () => {
    const { adapter, client, system } = await setup();
    system.emit("sessionAdded", { session: pushSession("os-3", "ghi") });
    system.emit("ended", { id: "os-3", session: {} });
    const session = adapter.incoming("+1", { "x-call-id": "ghi" });
    expect(session.hangup).toHaveBeenCalled();
    expect(session.answer).not.toHaveBeenCalled();
    expect(system.reportIncomingCall).not.toHaveBeenCalled();
    expect(client.currentCalls[0].endReason).toBe("native_ui");
  });

  it("hangs up when the call is ended on the system UI, without echoing it back", async () => {
    const { adapter, client, system } = await setup();
    system.emit("sessionAdded", { session: pushSession("os-4", "jkl") });
    const session = adapter.incoming("+1", { "x-call-id": "jkl" });
    system.emit("ended", { id: "os-4", session: {} });
    expect(session.hangup).toHaveBeenCalled();
    expect(client.currentCalls[0].endReason).toBe("native_ui");
    expect(system.endCall).not.toHaveBeenCalled();
    expect(system.reportCallEnded).not.toHaveBeenCalled();
  });

  it("reports an incoming call that came without a push, and follows the system's id for it", async () => {
    const { adapter, client, system } = await setup();
    const session = adapter.incoming("+447700900555", { "x-call-id": "mno" });
    const call = client.currentCalls[0];
    expect(system.reportIncomingCall).toHaveBeenCalledWith(
      expect.objectContaining({ serverCallId: "mno", caller: expect.objectContaining({ phoneNumber: "+447700900555" }) }),
    );
    const { eventId } = system.reportIncomingCall.mock.calls[0][0];
    system.emit("sessionAdded", {
      session: pushSession("os-9", "mno", { incomingCallEvent: { eventId, serverCallId: "mno", caller: { id: "x" } } }),
    });
    system.emit("answered", { id: "os-9", requestId: "req-9" });
    expect(session.answer).toHaveBeenCalled();
    call.onAnswered();
    expect(system.fulfillIncomingCallConnected).toHaveBeenCalledWith("req-9");
  });

  it("tells the system when the call is answered in the app instead of the system UI", async () => {
    const { adapter, client, system } = await setup();
    system.emit("sessionAdded", { session: pushSession("os-5", "pqr") });
    adapter.incoming("+1", { "x-call-id": "pqr" });
    await client.currentCalls[0].answer();
    expect(system.answerCall).toHaveBeenCalledWith("os-5");
  });

  it("fails the system answer when this phone may not take the call (answered elsewhere, busy)", async () => {
    const { adapter, client, system } = await setup();
    client.setAnswerGate(async () => false);
    system.emit("sessionAdded", { session: pushSession("os-6", "stu") });
    adapter.incoming("+1", { "x-call-id": "stu" });
    system.emit("answered", { id: "os-6", requestId: "req-6" });
    await flush();
    expect(system.failIncomingCallConnected).toHaveBeenCalledWith("os-6", "req-6");
    expect(system.fulfillIncomingCallConnected).not.toHaveBeenCalled();
  });

  it("syncs mute both ways without loops, and sends DTMF from the system", async () => {
    const { adapter, client, system } = await setup();
    system.emit("sessionAdded", { session: pushSession("os-7", "vwx") });
    const session = adapter.incoming("+1", { "x-call-id": "vwx" });
    const call = client.currentCalls[0];
    system.emit("muted", { id: "os-7", isMuted: true });
    expect(call.isMuted).toBe(true);
    expect(system.setMuted).not.toHaveBeenCalled();
    call.setMuted(false);
    expect(system.setMuted).toHaveBeenCalledWith("os-7", false);
    expect(system.setMuted).toHaveBeenCalledTimes(1);
    call.onAnswered();
    system.emit("dtmf", { id: "os-7", digits: "5" });
    await flush();
    expect(session.sendDtmf).toHaveBeenCalledWith("5");
  });

  it("picks up a call announced by push before JS started (cold start)", async () => {
    const { adapter, client, system } = await setup((s) => {
      s.activeSession = pushSession("os-8", "yz");
    });
    adapter.incoming("+1", { "x-call-id": "yz" });
    expect(client.currentCalls[0].id).toBe("os-8");
    expect(system.reportIncomingCall).not.toHaveBeenCalled();
  });

  it("turns the speaker on and off through the system", async () => {
    const { coordinator, system } = await setup();
    coordinator.setSpeaker(true);
    expect(system.setAudioSessionPortOverride).toHaveBeenCalledWith(true);
  });

  it("stops listening when stopped", async () => {
    const { coordinator, system } = await setup();
    coordinator.stop();
    expect(system.listenerCount("answered")).toBe(0);
  });

  it("shares one coordinator per client, and none without the system layer or with nativeCallUI off", () => {
    const system = new FakeCallSystem() as any;
    const a = new SipVoiceClient({}, { adapter: new FakeAdapter() });
    const b = new SipVoiceClient({}, { adapter: new FakeAdapter() });
    const off = new SipVoiceClient({ nativeCallUI: false }, { adapter: new FakeAdapter() });
    liveClients.push(a, b, off);
    expect(getNativeCallCoordinator(a, system)).toBe(getNativeCallCoordinator(a, system));
    expect(getNativeCallCoordinator(a, system)).not.toBe(getNativeCallCoordinator(b, system));
    expect(getNativeCallCoordinator(off, system)).toBeNull();
    expect(getNativeCallCoordinator(b, null)).toBeNull();
  });
});
