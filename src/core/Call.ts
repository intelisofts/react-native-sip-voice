import { ReadonlyValueStream, ValueStream } from "./observable";
import type { CallSession, CallSessionEvents } from "./session";
import { CallDirection, CallEndReason, CallState } from "./types";
import { uuidv4 } from "./utils";

export interface CallInit {
  id?: string;
  direction: CallDirection;
  /** Remote party number / URI user. */
  destination: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
  initialState?: CallState;
  now?: () => number;
}

const TERMINAL: ReadonlySet<CallState> = new Set([CallState.ENDED, CallState.FAILED]);

/**
 * A single call. UI code observes {@link callState$}, {@link isMuted$} and {@link isOnHold$};
 * actions (`hangup`, `mute`, `hold`, …) are forwarded to the underlying signalling session.
 */
export class Call implements CallSessionEvents {
  /** Stable UUID; doubles as the CallKit / ConnectionService call identifier. */
  readonly id: string;
  readonly direction: CallDirection;
  readonly destination: string;
  readonly metadata: Record<string, unknown>;
  displayName: string;

  readonly createdAt: number;
  answeredAt?: number;
  endedAt?: number;
  endReason?: CallEndReason;
  /** Final SIP status code when the call failed or was rejected. */
  statusCode?: number;

  private readonly state = new ValueStream<CallState>(CallState.CONNECTING);
  private readonly muted = new ValueStream<boolean>(false);
  private readonly held = new ValueStream<boolean>(false);
  private session?: CallSession;
  private pendingHangup = false;
  private readonly now: () => number;
  /** State to restore after RECONNECTING. */
  private stateBeforeReconnect?: CallState;

  constructor(init: CallInit) {
    this.id = init.id ?? uuidv4();
    this.direction = init.direction;
    this.destination = init.destination;
    this.displayName = init.displayName ?? init.destination;
    this.metadata = init.metadata ?? {};
    this.now = init.now ?? Date.now;
    this.createdAt = this.now();
    if (init.initialState) this.state.next(init.initialState);
  }

  // ---- Observables -------------------------------------------------------

  get callState$(): ReadonlyValueStream<CallState> {
    return this.state;
  }
  get isMuted$(): ReadonlyValueStream<boolean> {
    return this.muted;
  }
  get isOnHold$(): ReadonlyValueStream<boolean> {
    return this.held;
  }

  get currentState(): CallState {
    return this.state.value;
  }
  get isMuted(): boolean {
    return this.muted.value;
  }
  get isOnHold(): boolean {
    return this.held.value;
  }
  get isIncoming(): boolean {
    return this.direction === "incoming";
  }
  get isTerminated(): boolean {
    return TERMINAL.has(this.state.value);
  }
  get sipCallId(): string | undefined {
    return this.session?.sipCallId;
  }

  /** Seconds since the call was answered (0 until then; frozen once ended). */
  get durationSeconds(): number {
    if (this.answeredAt === undefined) return 0;
    const end = this.endedAt ?? this.now();
    return Math.max(0, Math.floor((end - this.answeredAt) / 1000));
  }

  // ---- Actions -----------------------------------------------------------

  async hangup(reason: CallEndReason = "local_hangup"): Promise<void> {
    if (this.isTerminated) return;
    if (!this.session) {
      this.pendingHangup = true;
      this.finish(reason);
      return;
    }
    const session = this.session;
    // Update state first so UI reacts instantly even if the BYE/CANCEL is slow.
    this.finish(reason);
    try {
      await session.hangup();
    } catch {
      // Already torn down remotely; nothing to do.
    }
  }

  async answer(): Promise<void> {
    if (this.direction !== "incoming" || this.isTerminated) return;
    if (!this.session) throw new Error("Call has no signalling session yet");
    this.state.next(CallState.CONNECTING);
    await this.session.answer();
  }

  async reject(): Promise<void> {
    if (this.direction !== "incoming" || this.isTerminated) return;
    const session = this.session;
    this.finish("rejected");
    await session?.reject();
  }

  mute(): void {
    this.setMuted(true);
  }
  unmute(): void {
    this.setMuted(false);
  }
  toggleMute(): boolean {
    this.setMuted(!this.muted.value);
    return this.muted.value;
  }

  setMuted(muted: boolean): void {
    if (this.isTerminated) return;
    this.muted.next(muted);
    this.session?.setMuted(muted);
  }

  async hold(): Promise<void> {
    await this.setHold(true);
  }
  async resume(): Promise<void> {
    await this.setHold(false);
  }
  async toggleHold(): Promise<boolean> {
    await this.setHold(!this.held.value);
    return this.held.value;
  }

  async setHold(hold: boolean): Promise<void> {
    if (this.isTerminated || this.held.value === hold) return;
    const s = this.state.value;
    if (s !== CallState.ACTIVE && s !== CallState.HELD) return;
    if (!this.session) return;
    await this.session.setHold(hold);
    this.held.next(hold);
    this.state.next(hold ? CallState.HELD : CallState.ACTIVE);
  }

  async sendDtmf(tone: string): Promise<void> {
    if (!/^[0-9A-D#*,]+$/i.test(tone)) throw new Error(`Invalid DTMF tone: ${tone}`);
    if (this.state.value !== CallState.ACTIVE || !this.session) return;
    await this.session.sendDtmf(tone);
  }

  // ---- Internal: wiring from the client/session --------------------------

  /** @internal */
  _attachSession(session: CallSession): void {
    this.session = session;
    if (this.pendingHangup) {
      session.hangup().catch(() => {});
      return;
    }
    if (this.muted.value) session.setMuted(true);
  }

  /** @internal */
  _setReconnecting(reconnecting: boolean): void {
    if (this.isTerminated) return;
    if (reconnecting && this.state.value !== CallState.RECONNECTING) {
      this.stateBeforeReconnect = this.state.value;
      this.state.next(CallState.RECONNECTING);
    } else if (!reconnecting && this.state.value === CallState.RECONNECTING) {
      this.state.next(this.stateBeforeReconnect ?? CallState.ACTIVE);
      this.stateBeforeReconnect = undefined;
    }
  }

  onRinging(): void {
    if (this.isTerminated) return;
    if (this.state.value === CallState.CONNECTING) this.state.next(CallState.RINGING);
  }

  onAnswered(): void {
    if (this.isTerminated) return;
    this.answeredAt ??= this.now();
    this.state.next(this.held.value ? CallState.HELD : CallState.ACTIVE);
  }

  onEnded(reason: CallEndReason, statusCode?: number): void {
    this.statusCode = statusCode;
    this.finish(reason);
  }

  private finish(reason: CallEndReason): void {
    if (this.isTerminated) return;
    this.endReason = reason;
    this.endedAt = this.now();
    const failed = this.answeredAt === undefined && reason !== "local_hangup" && reason !== "remote_hangup" && reason !== "native_ui";
    this.state.next(failed ? CallState.FAILED : CallState.ENDED);
  }

  toJSON() {
    return {
      id: this.id,
      sipCallId: this.sipCallId,
      direction: this.direction,
      destination: this.destination,
      displayName: this.displayName,
      state: this.currentState,
      isMuted: this.isMuted,
      isOnHold: this.isOnHold,
      durationSeconds: this.durationSeconds,
      endReason: this.endReason,
    };
  }
}
