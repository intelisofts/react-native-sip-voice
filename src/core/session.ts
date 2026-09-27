import type { CallEndReason } from "./types";

/**
 * Signalling-layer operations a {@link Call} delegates to. Implemented by the SIP.js adapter;
 * tests supply fakes. Keeping this seam narrow is what makes the core carrier-agnostic.
 */
export interface CallSession {
  /** SIP Call-ID once known. */
  readonly sipCallId?: string;
  hangup(): Promise<void>;
  answer(): Promise<void>;
  reject(): Promise<void>;
  setMuted(muted: boolean): void;
  setHold(hold: boolean): Promise<void>;
  sendDtmf(tone: string): Promise<void>;
}

/** Events a {@link CallSession} reports back to its {@link Call}. */
export interface CallSessionEvents {
  onRinging(): void;
  onAnswered(): void;
  onEnded(reason: CallEndReason, statusCode?: number): void;
}
