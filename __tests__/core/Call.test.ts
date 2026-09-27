import { Call } from "../../src/core/Call";
import { CallState } from "../../src/core/types";
import { FakeSession } from "../helpers/fakes";

function makeCall(opts: Partial<ConstructorParameters<typeof Call>[0]> = {}) {
  let now = 1_000_000;
  const clock = { advance: (ms: number) => (now += ms) };
  const call = new Call({ direction: "outgoing", destination: "+447700900123", now: () => now, ...opts });
  const session = new FakeSession(call);
  call._attachSession(session);
  return { call, session, clock };
}

describe("Call", () => {
  it("starts CONNECTING with a UUID id and destination as display name", () => {
    const { call } = makeCall();
    expect(call.currentState).toBe(CallState.CONNECTING);
    expect(call.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(call.displayName).toBe("+447700900123");
    expect(call.sipCallId).toBe("sip-call-id-1");
  });

  it("moves CONNECTING -> RINGING -> ACTIVE and records answer time", () => {
    const { call, clock } = makeCall();
    const states: CallState[] = [];
    call.callState$.subscribe((s) => states.push(s));
    call.onRinging();
    clock.advance(2000);
    call.onAnswered();
    expect(states).toEqual([CallState.CONNECTING, CallState.RINGING, CallState.ACTIVE]);
    expect(call.answeredAt).toBe(1_002_000);
  });

  it("computes duration from answer and freezes it when ended", () => {
    const { call, clock } = makeCall();
    call.onAnswered();
    clock.advance(65_000);
    expect(call.durationSeconds).toBe(65);
    call.onEnded("remote_hangup");
    clock.advance(10_000);
    expect(call.durationSeconds).toBe(65);
    expect(call.currentState).toBe(CallState.ENDED);
  });

  it("local hangup ends immediately and sends BYE/CANCEL", async () => {
    const { call, session } = makeCall();
    await call.hangup();
    expect(call.currentState).toBe(CallState.ENDED);
    expect(call.endReason).toBe("local_hangup");
    expect(session.hangup).toHaveBeenCalledTimes(1);
    await call.hangup();
    expect(session.hangup).toHaveBeenCalledTimes(1);
  });

  it("an unanswered rejected call is FAILED with the status code", () => {
    const { call } = makeCall();
    call.onEnded("busy", 486);
    expect(call.currentState).toBe(CallState.FAILED);
    expect(call.statusCode).toBe(486);
  });

  it("hangup before a session is attached is applied on attach", async () => {
    const call = new Call({ direction: "outgoing", destination: "1" });
    await call.hangup();
    const session = new FakeSession();
    call._attachSession(session);
    expect(session.hangup).toHaveBeenCalled();
  });

  it("mute state is re-applied to a late session", () => {
    const call = new Call({ direction: "outgoing", destination: "1" });
    call.mute();
    const session = new FakeSession();
    call._attachSession(session);
    expect(session.setMuted).toHaveBeenCalledWith(true);
  });

  it("toggles mute and forwards to the session", () => {
    const { call, session } = makeCall();
    expect(call.toggleMute()).toBe(true);
    expect(call.isMuted).toBe(true);
    expect(call.toggleMute()).toBe(false);
    expect(session.setMuted.mock.calls).toEqual([[true], [false]]);
  });

  it("hold / resume only while active and updates state", async () => {
    const { call, session } = makeCall();
    await call.hold();
    expect(session.setHold).not.toHaveBeenCalled();

    call.onAnswered();
    await call.hold();
    expect(call.currentState).toBe(CallState.HELD);
    expect(call.isOnHold).toBe(true);
    await call.toggleHold();
    expect(call.currentState).toBe(CallState.ACTIVE);
    expect(session.setHold.mock.calls).toEqual([[true], [false]]);
  });

  it("keeps state when hold is rejected by the far end", async () => {
    const { call, session } = makeCall();
    call.onAnswered();
    session.setHold.mockRejectedValueOnce(new Error("rejected"));
    await expect(call.hold()).rejects.toThrow("rejected");
    expect(call.currentState).toBe(CallState.ACTIVE);
    expect(call.isOnHold).toBe(false);
  });

  it("validates DTMF and only sends while active", async () => {
    const { call, session } = makeCall();
    await expect(call.sendDtmf("x")).rejects.toThrow("Invalid DTMF");
    await call.sendDtmf("1");
    expect(session.sendDtmf).not.toHaveBeenCalled();
    call.onAnswered();
    await call.sendDtmf("#");
    expect(session.sendDtmf).toHaveBeenCalledWith("#");
  });

  it("RECONNECTING restores the previous state", () => {
    const { call } = makeCall();
    call.onAnswered();
    call._setReconnecting(true);
    expect(call.currentState).toBe(CallState.RECONNECTING);
    call._setReconnecting(false);
    expect(call.currentState).toBe(CallState.ACTIVE);
  });

  it("incoming calls can be answered and rejected", async () => {
    const { call, session } = makeCall({ direction: "incoming", initialState: CallState.RINGING });
    expect(call.isIncoming).toBe(true);
    await call.answer();
    expect(session.answer).toHaveBeenCalled();
    expect(call.currentState).toBe(CallState.CONNECTING);

    const other = makeCall({ direction: "incoming", initialState: CallState.RINGING });
    await other.call.reject();
    expect(other.session.reject).toHaveBeenCalled();
    expect(other.call.currentState).toBe(CallState.FAILED);
    expect(other.call.endReason).toBe("rejected");
  });

  it("outgoing calls ignore answer()", async () => {
    const { call, session } = makeCall();
    await call.answer();
    expect(session.answer).not.toHaveBeenCalled();
  });

  it("ignores events after termination", () => {
    const { call } = makeCall();
    call.onEnded("remote_hangup");
    call.onAnswered();
    call.onRinging();
    call.mute();
    expect(call.currentState).toBe(CallState.ENDED);
    expect(call.isMuted).toBe(false);
  });

  it("serialises to JSON", () => {
    const { call } = makeCall({ displayName: "Bob" });
    expect(call.toJSON()).toMatchObject({ destination: "+447700900123", displayName: "Bob", state: "CONNECTING" });
  });
});
