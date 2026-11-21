import type { Call } from "../core/Call";
import type { Subscription } from "../core/observable";
import type { SipVoiceClient } from "../core/SipVoiceClient";
import { CallState } from "../core/types";
import { createLogger, Logger } from "../core/utils";
import type { AudioRoute, NativeCallUI, NativeCallUIConfig, NativeEndReason } from "./NativeCallUI";

/**
 * Keeps each {@link Call} and the OS call UI (CallKit / ConnectionService) in sync, in both directions:
 * - call lifecycle → native reports (start, ringing, connected, ended, mute, hold)
 * - native actions (lock-screen end, Bluetooth mute, car-kit answer, …) → call methods
 */
const shared = new WeakMap<SipVoiceClient, NativeCallCoordinator>();

/**
 * The one coordinator for a client, shared by <SipVoiceProvider> and code that runs without React (the Android
 * incoming-call Headless JS task, see registerIncomingCallTask). Two coordinators would each handle every native
 * action. Null when the client was created with `nativeCallUI: false`.
 */
export function getNativeCallCoordinator(client: SipVoiceClient, native: NativeCallUI): NativeCallCoordinator | null {
  if (!client.nativeCallUIEnabled) return null;
  let coordinator = shared.get(client);
  if (!coordinator) {
    coordinator = new NativeCallCoordinator(client, native);
    shared.set(client, coordinator);
  }
  return coordinator;
}

export class NativeCallCoordinator {
  private readonly subs: Subscription[] = [];
  private readonly perCall = new Map<string, Subscription[]>();
  /** Calls we already told the system about. */
  private readonly reported = new Set<string>();
  /** Answer actions that arrived before the SIP INVITE (push flow). */
  private readonly pendingAnswers = new Set<string>();
  /** Declines that arrived before the SIP INVITE: rejected as soon as it arrives, so it does not ring again. */
  private readonly pendingDeclines = new Set<string>();
  private readonly log: Logger;
  private started = false;

  constructor(
    private readonly client: SipVoiceClient,
    private readonly native: NativeCallUI,
    logger?: Logger,
  ) {
    this.log = logger ?? createLogger(false, "[SipVoice:native]");
  }

  get isNativeAvailable(): boolean {
    return this.native.isAvailable;
  }

  async start(config: NativeCallUIConfig = {}): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      await this.native.configure(config);
    } catch (e) {
      this.log.warn("Native call UI configure failed; continuing without it", e);
    }

    this.subs.push(
      this.native.addListener("endCall", ({ callId }) => {
        const call = this.client.getCall(callId);
        if (call && !call.isTerminated) call.hangup("native_ui");
        else if (!call) this.pendingDeclines.add(callId);
        this.reported.delete(callId);
      }),
      this.native.addListener("answerCall", ({ callId }) => {
        const call = this.client.getCall(callId);
        if (call) call.answer().catch((e) => this.log.error("answer failed", e));
        else this.pendingAnswers.add(callId);
      }),
      this.native.addListener("setMuted", ({ callId, muted }) => {
        const call = this.client.getCall(callId);
        if (call && call.isMuted !== muted) call.setMuted(muted);
      }),
      this.native.addListener("setHeld", ({ callId, held }) => {
        const call = this.client.getCall(callId);
        if (call && call.isOnHold !== held) call.setHold(held).catch((e) => this.log.warn("hold failed", e));
      }),
      this.native.addListener("playDTMF", ({ callId, digits }) => {
        this.client.getCall(callId)?.sendDtmf(digits).catch((e) => this.log.warn("dtmf failed", e));
      }),
      this.native.addListener("pushIncomingCall", ({ callId, payload }) => {
        this.reported.add(callId);
        this.client.registerPushCall(callId, payload);
      }),
    );

    // Calls announced by push before JS was running.
    try {
      for (const p of await this.native.getPendingPushCalls()) {
        this.reported.add(p.callId);
        this.client.registerPushCall(p.callId, p.payload);
        // Answered on the lock screen / notification while JS was not running: answer once the INVITE arrives.
        if (p.declined) this.pendingDeclines.add(p.callId);
        else if (p.answered) this.pendingAnswers.add(p.callId);
      }
    } catch {
      // Older native builds may not implement this.
    }

    this.subs.push(this.client.calls$.subscribe((calls) => this.syncCalls(calls)));
  }

  private syncCalls(calls: Call[]): void {
    for (const call of calls) {
      if (!this.perCall.has(call.id)) this.track(call);
    }
    for (const [id, subs] of this.perCall) {
      if (!calls.some((c) => c.id === id)) {
        subs.forEach((s) => s.unsubscribe());
        this.perCall.delete(id);
        this.reported.delete(id);
        this.pendingAnswers.delete(id);
        this.pendingDeclines.delete(id);
      }
    }
  }

  private track(call: Call): void {
    const subs: Subscription[] = [];
    this.perCall.set(call.id, subs);

    // Declined on the system screen before the INVITE came: reject it (603), without showing it again.
    if (this.pendingDeclines.delete(call.id)) {
      this.pendingAnswers.delete(call.id);
      call.hangup("native_ui").catch((e) => this.log.warn("deferred decline failed", e));
      return;
    }

    if (!this.reported.has(call.id)) {
      this.reported.add(call.id);
      const handle = call.destination;
      const report =
        call.direction === "outgoing"
          ? this.native.startOutgoingCall(call.id, handle, call.displayName)
          : this.native.reportIncomingCall(call.id, handle, call.displayName);
      report.catch((e) => this.log.warn("Native call report failed; call continues without system UI", e));
    } else if (call.displayName !== call.destination) {
      this.native.updateDisplay(call.id, call.displayName, call.destination);
    }

    if (this.pendingAnswers.delete(call.id)) {
      call.answer().catch((e) => this.log.error("deferred answer failed", e));
    }

    let wasConnected = false;
    subs.push(
      call.callState$.subscribe((state) => {
        switch (state) {
          case CallState.RINGING:
            if (call.direction === "outgoing") {
              this.native.reportOutgoingCallConnecting(call.id);
              // Free app calls: the caller hears the ring-back from the phone. Paid calls get it from the network.
              if (call.metadata.kind === "app") this.native.startRingback(call.id);
            }
            break;
          case CallState.ACTIVE:
            this.native.stopRingback();
            if (!wasConnected) {
              wasConnected = true;
              this.native.reportCallConnected(call.id);
            }
            break;
          case CallState.ENDED:
          case CallState.FAILED:
            this.native.stopRingback();
            this.onTerminated(call);
            break;
          default:
            break;
        }
      }),
      call.isMuted$.subscribe((muted) => this.native.setMuted(call.id, muted)),
      call.isOnHold$.subscribe((held) => this.native.setHeld(call.id, held)),
    );
  }

  private onTerminated(call: Call): void {
    if (!this.reported.has(call.id)) return;
    this.reported.delete(call.id);
    if (call.endReason === "native_ui") return; // system already ended it
    if (call.endReason === "local_hangup") {
      this.native.endCall(call.id).catch(() => this.native.reportCallEnded(call.id, "remoteEnded"));
      return;
    }
    this.native.reportCallEnded(call.id, toNativeReason(call));
  }

  setAudioRoute(route: AudioRoute): Promise<void> {
    return this.native.setAudioRoute(route);
  }

  stop(): void {
    this.subs.splice(0).forEach((s) => s.unsubscribe());
    this.perCall.forEach((subs) => subs.forEach((s) => s.unsubscribe()));
    this.perCall.clear();
    this.reported.clear();
    this.pendingAnswers.clear();
    this.pendingDeclines.clear();
    this.started = false;
  }
}

function toNativeReason(call: Call): NativeEndReason {
  switch (call.endReason) {
    case "remote_hangup":
      return "remoteEnded";
    case "no_answer":
    case "timeout":
      return "unanswered";
    case "answered_elsewhere":
      return "answeredElsewhere";
    case "rejected":
    case "busy":
      return call.direction === "incoming" ? "declinedElsewhere" : "failed";
    default:
      return call.answeredAt !== undefined ? "remoteEnded" : "failed";
  }
}
