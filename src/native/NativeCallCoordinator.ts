import type { Call } from "../core/Call";
import type { Subscription } from "../core/observable";
import type { SipVoiceClient } from "../core/SipVoiceClient";
import { CallState } from "../core/types";
import { createLogger, Logger, uuidv4 } from "../core/utils";
import { loadCallSystem, type CallEndedReason, type CallSession, type CallSystem } from "./callSystem";

/** Options for the system call integration. */
export interface NativeCallUIConfig {
  /** Whether calls can be put on hold from the system UI (needs SBC re-INVITE support). Default false. */
  supportsHolding?: boolean;
}

interface Removable {
  remove(): void;
}

const shared = new WeakMap<SipVoiceClient, NativeCallCoordinator>();

/**
 * The one coordinator for a client, shared by <SipVoiceProvider> and any code outside React. Two coordinators
 * would each handle every system action. Null when the client was created with `nativeCallUI: false` or the
 * system call layer (expo-callkit-telecom) is not available.
 */
export function getNativeCallCoordinator(
  client: SipVoiceClient,
  system: CallSystem | null = loadCallSystem(),
): NativeCallCoordinator | null {
  if (!client.nativeCallUIEnabled || !system) return null;
  let coordinator = shared.get(client);
  if (!coordinator) {
    coordinator = new NativeCallCoordinator(client, system);
    shared.set(client, coordinator);
  }
  return coordinator;
}

/**
 * Keeps each SIP {@link Call} and its system call (CallKit / Core-Telecom, via expo-callkit-telecom) in step,
 * both ways:
 * - call lifecycle → system (start, incoming, connected, ended, mute, hold)
 * - system actions (Answer / Decline / End on the system UI, lock screen, Bluetooth, car) → call methods
 *
 * Ids: a call announced by VoIP push is created natively, before JS runs, under the system's id; the matching SIP
 * INVITE (X-Call-Id = the push's serverCallId) takes that id, so both share it. Calls the app reports itself
 * (outgoing, or incoming without a push) get a system id of their own, mapped here.
 */
export class NativeCallCoordinator {
  private readonly subs: (Subscription | Removable)[] = [];
  private readonly perCall = new Map<string, Subscription[]>();
  /** Call id ↔ system call id, for calls whose ids differ. */
  private readonly sessionByCall = new Map<string, string>();
  private readonly callBySession = new Map<string, string>();
  /** Incoming calls we report ourselves, by the event id we gave them, until the system assigns its id. */
  private readonly reportedByEvent = new Map<string, string>();
  /** Calls the system knows about (by call id). */
  private readonly known = new Set<string>();
  /** Answer requests from the system UI, to fulfil once media is up (by system id). */
  private readonly answerRequests = new Map<string, string>();
  /** Answered / declined on the system UI before the SIP INVITE came (push flow), by system id. */
  private readonly pendingAnswers = new Set<string>();
  private readonly pendingDeclines = new Set<string>();
  /** Ended by the system, so not reported back to it (by system id). */
  private readonly endedBySystem = new Set<string>();
  /** Last mute / hold state each side has, to stop the two echoing each other (by system id). */
  private readonly muted = new Map<string, boolean>();
  private readonly held = new Map<string, boolean>();
  private config: NativeCallUIConfig = {};
  private readonly log: Logger;
  private started = false;

  constructor(
    private readonly client: SipVoiceClient,
    private readonly system: CallSystem,
    logger?: Logger,
  ) {
    this.log = logger ?? createLogger(false, "[SipVoice:native]");
  }

  /** Idempotent: the provider and code outside React may both start it. */
  async start(config: NativeCallUIConfig = {}): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.config = config;
    const s = this.system;

    this.subs.push(
      s.addCallSessionAddedListener(({ session }) => this.onSessionAdded(session)),
      s.addCallSessionRemovedListener(({ id }) => this.forgetSession(id)),
      s.addCallAnsweredListener(({ id, requestId }) => this.onSystemAnswer(id, requestId)),
      s.addCallEndedListener(({ id }) => this.onSystemEnd(id)),
      s.addSetMutedActionListener(({ id, isMuted }) => {
        this.muted.set(id, isMuted);
        const call = this.callFor(id);
        if (call && call.isMuted !== isMuted) call.setMuted(isMuted);
      }),
      s.addSetHeldActionListener(({ id, isOnHold }) => {
        this.held.set(id, isOnHold);
        const call = this.callFor(id);
        if (call && call.isOnHold !== isOnHold) call.setHold(isOnHold).catch((e) => this.log.warn("hold failed", e));
      }),
      s.addDTMFListener(({ id, digits }) => {
        this.callFor(id)?.sendDtmf(digits).catch((e) => this.log.warn("dtmf failed", e));
      }),
    );

    // A call announced by push before JS was running (its answer, if any, is replayed to the listener above).
    try {
      const session = await s.getActiveCallSession();
      if (session) this.onSessionAdded(session);
    } catch (e) {
      this.log.warn("Could not read the active system call", e);
    }

    this.subs.push(this.client.calls$.subscribe((calls) => this.syncCalls(calls)));
  }

  /** Speaker on or off for the current call (the system routes to Bluetooth / headset when connected). */
  setSpeaker(on: boolean): void {
    this.system.setAudioSessionPortOverride(on);
  }

  stop(): void {
    this.subs.splice(0).forEach((s) => ("unsubscribe" in s ? s.unsubscribe() : s.remove()));
    this.perCall.forEach((subs) => subs.forEach((s) => s.unsubscribe()));
    this.perCall.clear();
    for (const m of [this.sessionByCall, this.callBySession, this.reportedByEvent, this.answerRequests, this.muted, this.held])
      m.clear();
    for (const set of [this.known, this.pendingAnswers, this.pendingDeclines, this.endedBySystem]) set.clear();
    this.started = false;
    if (shared.get(this.client) === this) shared.delete(this.client);
  }

  // ---- System → calls ------------------------------------------------------

  private onSessionAdded(session: CallSession): void {
    if (session.origin !== "incoming") return;
    const event = session.incomingCallEvent;
    const ours = event ? this.reportedByEvent.get(event.eventId) : undefined;
    if (ours) {
      // An incoming call we reported ourselves (no push): now we know its system id.
      this.reportedByEvent.delete(event!.eventId);
      this.link(ours, session.id);
      return;
    }
    if (this.known.has(session.id)) return;
    // Announced by VoIP push: the SIP INVITE for it takes the system's id (matched on serverCallId).
    this.known.add(session.id);
    this.client.registerPushCall(session.id, {
      ...(event?.metadata ?? {}),
      call_id: event?.serverCallId,
    });
  }

  private onSystemAnswer(sessionId: string, requestId: string): void {
    this.answerRequests.set(sessionId, requestId);
    const call = this.callFor(sessionId);
    if (!call) {
      this.pendingAnswers.add(sessionId); // the INVITE has not arrived yet
      return;
    }
    // Already answering (e.g. from the app's own screen): the request is fulfilled once media is up.
    if (call.currentState === CallState.RINGING) call.answer().catch((e) => this.log.error("answer failed", e));
  }

  private onSystemEnd(sessionId: string): void {
    this.endedBySystem.add(sessionId);
    const call = this.callFor(sessionId);
    if (call && !call.isTerminated) call.hangup("native_ui");
    else if (!call) this.pendingDeclines.add(sessionId); // declined before the INVITE came: reject it then
  }

  // ---- Calls → system ------------------------------------------------------

  private syncCalls(calls: Call[]): void {
    for (const call of calls) if (!this.perCall.has(call.id)) this.track(call);
    for (const [id, subs] of this.perCall) {
      if (calls.some((c) => c.id === id)) continue;
      subs.forEach((s) => s.unsubscribe());
      this.perCall.delete(id);
      this.known.delete(id);
      const sessionId = this.sessionId(id);
      this.sessionByCall.delete(id);
      this.callBySession.delete(sessionId);
    }
  }

  private track(call: Call): void {
    const subs: Subscription[] = [];
    this.perCall.set(call.id, subs);
    const sid = this.sessionId(call.id);

    // Declined on the system UI before the INVITE came: reject it (603), without showing it again.
    if (this.pendingDeclines.delete(sid)) {
      this.pendingAnswers.delete(sid);
      call.hangup("native_ui").catch((e) => this.log.warn("deferred decline failed", e));
      return;
    }

    if (!this.known.has(call.id)) {
      this.known.add(call.id);
      this.report(call);
    }

    if (this.pendingAnswers.delete(sid)) call.answer().catch((e) => this.log.error("deferred answer failed", e));

    let connected = false;
    subs.push(
      call.callState$.subscribe((state) => {
        const id = this.sessionId(call.id);
        switch (state) {
          case CallState.CONNECTING:
            // Answered in the app rather than on the system UI: tell the system, which then asks us to fulfil.
            if (call.isIncoming && !this.answerRequests.has(id)) this.system.answerCall(id).catch(() => {});
            break;
          case CallState.ACTIVE:
            if (connected) break;
            connected = true;
            if (call.isIncoming) {
              const requestId = this.answerRequests.get(id);
              if (requestId) this.system.fulfillIncomingCallConnected(requestId).catch(() => {});
            } else {
              this.system.reportOutgoingCallConnected(id).catch(() => {});
            }
            break;
          case CallState.ENDED:
          case CallState.FAILED:
            this.onTerminated(call);
            break;
          default:
            break;
        }
      }),
      call.isMuted$.subscribe((muted) => {
        const id = this.sessionId(call.id);
        if ((this.muted.get(id) ?? false) === muted) return;
        this.muted.set(id, muted);
        this.system.setMuted(id, muted).catch(() => {});
      }),
      call.isOnHold$.subscribe((held) => {
        const id = this.sessionId(call.id);
        if ((this.held.get(id) ?? false) === held) return;
        this.held.set(id, held);
        this.system.setHeld(id, held).catch(() => {});
      }),
    );
  }

  /** Tells the system about a call it does not know yet (outgoing, or incoming without a push). */
  private report(call: Call): void {
    const participant = { id: call.destination, displayName: call.displayName, phoneNumber: e164(call.destination) };
    const options = { hasVideo: false, supportsHolding: !!this.config.supportsHolding, supportsDTMF: true };
    if (call.direction === "outgoing") {
      this.system
        .startOutgoingCall(participant, options)
        .then((sessionId) => this.link(call.id, sessionId))
        .catch((e) => this.log.warn("System call report failed; call continues without system UI", e));
      return;
    }
    const eventId = uuidv4();
    this.reportedByEvent.set(eventId, call.id);
    const headerId = (call.metadata.headers as Record<string, string> | undefined)?.["x-call-id"];
    this.system
      .reportIncomingCall({ eventId, serverCallId: headerId ?? call.id, caller: participant, ...options })
      .catch((e) => {
        this.reportedByEvent.delete(eventId);
        this.log.warn("System call report failed; call continues without system UI", e);
      });
  }

  private onTerminated(call: Call): void {
    const id = this.sessionId(call.id);
    const requestId = this.answerRequests.get(id);
    this.answerRequests.delete(id);
    if (this.endedBySystem.delete(id) || call.endReason === "native_ui") return; // the system already ended it
    if (!this.known.has(call.id)) return;
    // Answered on the system UI but never connected (another phone took it, busy, no media): fail the answer.
    if (requestId && call.answeredAt === undefined) {
      this.system.failIncomingCallConnected(id, requestId).catch(() => {});
      return;
    }
    if (call.endReason === "local_hangup") {
      this.system.endCall(id).catch(() => this.system.reportCallEnded(id, "remoteEnded").catch(() => {}));
      return;
    }
    this.system.reportCallEnded(id, toSystemReason(call)).catch(() => {});
  }

  // ---- Ids -----------------------------------------------------------------

  private link(callId: string, sessionId: string): void {
    this.sessionByCall.set(callId, sessionId);
    this.callBySession.set(sessionId, callId);
    const call = this.client.getCall(callId);
    // Ended before the system gave its id (e.g. hung up while the system was still accepting the call).
    if (!call || call.isTerminated) {
      this.system.endCall(sessionId).catch(() => {});
      return;
    }
    // Requests that came for the system id before it was linked.
    if (this.pendingAnswers.delete(sessionId)) call.answer().catch(() => {});
  }

  private sessionId(callId: string): string {
    return this.sessionByCall.get(callId) ?? callId;
  }

  private callFor(sessionId: string): Call | undefined {
    return this.client.getCall(this.callBySession.get(sessionId) ?? sessionId);
  }

  private forgetSession(sessionId: string): void {
    this.answerRequests.delete(sessionId);
    this.pendingAnswers.delete(sessionId);
    this.endedBySystem.delete(sessionId);
    this.muted.delete(sessionId);
    this.held.delete(sessionId);
  }
}

/** E.164 when the destination looks like a phone number, so CallKit can list it in Recents. */
function e164(destination: string): string | undefined {
  const digits = destination.replace(/[^\d+]/g, "");
  return /^\+?\d{6,15}$/.test(digits) ? (digits.startsWith("+") ? digits : `+${digits}`) : undefined;
}

function toSystemReason(call: Call): CallEndedReason {
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
