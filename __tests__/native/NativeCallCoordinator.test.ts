import { SipVoiceClient } from "../../src/core/SipVoiceClient";
import { CallState } from "../../src/core/types";
import { NativeCallCoordinator } from "../../src/native/NativeCallCoordinator";
import { digestCreds, FakeAdapter, FakeNative, flush } from "../helpers/fakes";

const liveClients: SipVoiceClient[] = [];
afterEach(async () => {
  await Promise.all(liveClients.splice(0).map((c) => c.destroy()));
});

async function setup() {
  const adapter = new FakeAdapter();
  const client = new SipVoiceClient({}, { adapter });
  liveClients.push(client);
  const native = new FakeNative();
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const coordinator = new NativeCallCoordinator(client, native, logger);
  await coordinator.start({ appName: "Noah Call" });
  await client.connect(digestCreds);
  return { adapter, client, native, coordinator, logger };
}

describe("NativeCallCoordinator", () => {
  it("configures the native layer once", async () => {
    const { native, coordinator } = await setup();
    await coordinator.start();
    expect(native.configure).toHaveBeenCalledTimes(1);
    expect(native.configure).toHaveBeenCalledWith({ appName: "Noah Call" });
    expect(coordinator.isNativeAvailable).toBe(true);
  });

  it("reports an outgoing call through its lifecycle", async () => {
    const { client, native } = await setup();
    const call = await client.newCall({ destination: "+447700900123", displayName: "Bob" });
    expect(native.startOutgoingCall).toHaveBeenCalledWith(call.id, "+447700900123", "Bob");

    call.onRinging();
    expect(native.reportOutgoingCallConnecting).toHaveBeenCalledWith(call.id);
    call.onAnswered();
    expect(native.reportCallConnected).toHaveBeenCalledTimes(1);
    await call.hold();
    await call.resume();
    expect(native.reportCallConnected).toHaveBeenCalledTimes(1);
    expect(native.setHeld).toHaveBeenCalledWith(call.id, true);
    expect(native.setHeld).toHaveBeenLastCalledWith(call.id, false);
  });

  it("asks the system to end the call on local hangup", async () => {
    const { client, native } = await setup();
    const call = await client.newCall({ destination: "+1" });
    await call.hangup();
    expect(native.endCall).toHaveBeenCalledWith(call.id);
    expect(native.reportCallEnded).not.toHaveBeenCalled();
  });

  it("falls back to reportCallEnded when endCall fails", async () => {
    const { client, native } = await setup();
    native.endCall.mockRejectedValueOnce(new Error("unknown call"));
    const call = await client.newCall({ destination: "+1" });
    await call.hangup();
    await flush();
    expect(native.reportCallEnded).toHaveBeenCalledWith(call.id, "remoteEnded");
  });

  it.each([
    ["remote_hangup", true, "remoteEnded"],
    ["no_answer", false, "unanswered"],
    ["timeout", false, "unanswered"],
    ["busy", false, "failed"],
    ["network_error", true, "remoteEnded"],
    ["failed", false, "failed"],
  ] as const)("maps %s (answered=%s) to %s", async (reason, answered, nativeReason) => {
    const { client, native } = await setup();
    const call = await client.newCall({ destination: "+1" });
    if (answered) call.onAnswered();
    call.onEnded(reason);
    expect(native.reportCallEnded).toHaveBeenCalledWith(call.id, nativeReason);
  });

  it("hangs up when the user ends from the system UI, without echoing back", async () => {
    const { client, native } = await setup();
    const call = await client.newCall({ destination: "+1" });
    native.emit("endCall", { callId: call.id });
    expect(call.currentState).toBe(CallState.ENDED);
    expect(call.endReason).toBe("native_ui");
    expect(native.endCall).not.toHaveBeenCalled();
    expect(native.reportCallEnded).not.toHaveBeenCalled();
  });

  it("syncs mute both ways without loops", async () => {
    const { client, native, adapter } = await setup();
    const call = await client.newCall({ destination: "+1" });
    call.onAnswered();
    native.emit("setMuted", { callId: call.id, muted: true });
    expect(call.isMuted).toBe(true);
    expect(adapter.lastInvite.session.setMuted).toHaveBeenCalledWith(true);
    expect(native.setMuted).toHaveBeenLastCalledWith(call.id, true);
    // Same value again from native: ignored.
    native.emit("setMuted", { callId: call.id, muted: true });
    expect(adapter.lastInvite.session.setMuted).toHaveBeenCalledTimes(1);
    call.unmute();
    expect(native.setMuted).toHaveBeenLastCalledWith(call.id, false);
  });

  it("applies hold and DTMF actions from the system", async () => {
    const { client, native, adapter } = await setup();
    const call = await client.newCall({ destination: "+1" });
    call.onAnswered();
    native.emit("setHeld", { callId: call.id, held: true });
    await flush();
    expect(call.isOnHold).toBe(true);
    await call.resume();
    native.emit("playDTMF", { callId: call.id, digits: "7" });
    await flush();
    expect(adapter.lastInvite.session.sendDtmf).toHaveBeenCalledWith("7");
  });

  it("reports incoming calls and answers from the system", async () => {
    const { adapter, native, client } = await setup();
    const session = adapter.incoming("+33123", {}, "Marie");
    const call = client.currentCalls[0];
    expect(native.reportIncomingCall).toHaveBeenCalledWith(call.id, "+33123", "Marie");
    native.emit("answerCall", { callId: call.id });
    expect(session.answer).toHaveBeenCalled();
  });

  it("does not re-report push calls, and applies an early answer when the INVITE arrives", async () => {
    const { adapter, native, client } = await setup();
    const id = "11111111-2222-4333-8444-555555555555";
    native.emit("pushIncomingCall", { callId: id, payload: { call_id: "abc" } });
    native.emit("answerCall", { callId: id }); // user tapped Answer on CallKit before SIP INVITE arrived
    const session = adapter.incoming("+1", { "x-call-id": "abc" });
    expect(client.currentCalls[0].id).toBe(id);
    expect(native.reportIncomingCall).not.toHaveBeenCalled();
    expect(session.answer).toHaveBeenCalled();
  });

  it("picks up push calls that arrived before JS started", async () => {
    const adapter = new FakeAdapter();
    const client = new SipVoiceClient({}, { adapter });
    liveClients.push(client);
    const native = new FakeNative();
    native.getPendingPushCalls.mockResolvedValueOnce([{ callId: "aaaaaaaa-0000-4000-8000-00000000000a", payload: {} }]);
    await new NativeCallCoordinator(client, native).start();
    await client.connect(digestCreds);
    adapter.incoming("+1");
    expect(client.currentCalls[0].id).toBe("aaaaaaaa-0000-4000-8000-00000000000a");
    expect(native.reportIncomingCall).not.toHaveBeenCalled();
  });

  it("keeps the call going when the native report fails", async () => {
    const { client, native, logger } = await setup();
    native.startOutgoingCall.mockRejectedValueOnce(new Error("CallKit busy"));
    const call = await client.newCall({ destination: "+1" });
    await flush();
    expect(call.isTerminated).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("continues when configure fails", async () => {
    const adapter = new FakeAdapter();
    const client = new SipVoiceClient({}, { adapter });
    liveClients.push(client);
    const native = new FakeNative();
    native.configure.mockRejectedValueOnce(new Error("no CallKit"));
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    await new NativeCallCoordinator(client, native, logger).start();
    await client.connect(digestCreds);
    await client.newCall({ destination: "+1" });
    expect(native.startOutgoingCall).toHaveBeenCalled();
  });

  it("forwards audio route changes and stops cleanly", async () => {
    const { coordinator, native, client } = await setup();
    await coordinator.setAudioRoute("speaker");
    expect(native.setAudioRoute).toHaveBeenCalledWith("speaker");
    coordinator.stop();
    await client.newCall({ destination: "+1" });
    expect(native.startOutgoingCall).not.toHaveBeenCalled();
  });
});
