import { CallEndReason, CallState } from "../core/types";
import { formatDuration } from "../core/utils";

export interface CallLabels {
  calling: string;
  ringing: string;
  connecting: string;
  reconnecting: string;
  onHold: string;
  /** Status once answered, shown above the timer. Optional so existing custom label sets keep working. */
  connected?: string;
  ended: string;
  failed: string;
  /** Caption above the duration of an answered call that has ended, e.g. "Call duration". */
  callSummary?: string;
  incoming: string;
  tapToReturn: string;
  speaker: string;
  mute: string;
  keypad: string;
  hold: string;
  resume: string;
  end: string;
  hide: string;
  accept: string;
  decline: string;
  /** Shown on the incoming screen when the person is already on another call. Optional for older label sets. */
  busy?: string;
  /** Shown when this phone could not take the call (answered on another device, or the check failed). */
  answerFailed?: string;
  /** Shown instead of "Call failed" when the person you called is busy on another call. */
  calleeBusy?: string;
  /** Shown instead of "Call failed" when the person you called declined. */
  callDeclined?: string;
  /** Shown instead of "Call failed" when nobody picked up. */
  noAnswer?: string;
  /** Prompt above the thumbs up/down on the post-call panel. */
  rateCall?: string;
  rateGood?: string;
  rateBad?: string;
  /** Shown in place of the thumbs once the person has rated. */
  rateThanks?: string;
  /** "Call someone else" button on the post-call panel. */
  callAgain?: string;
  /** Closes the post-call panel. */
  close?: string;
  /** Shown on the preparing screen when the person being called is already online. */
  online?: string;
}

export const defaultLabels: CallLabels = {
  calling: "Calling…",
  ringing: "Ringing…",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  onHold: "On hold",
  connected: "Connected",
  ended: "Call ended",
  failed: "Call failed",
  incoming: "Incoming voice call",
  tapToReturn: "Tap to return to call",
  speaker: "Speaker",
  mute: "Mute",
  keypad: "Keypad",
  hold: "Hold",
  resume: "Resume",
  end: "End",
  hide: "Hide",
  accept: "Accept",
  decline: "Decline",
  busy: "You're already on a call",
  answerFailed: "Couldn't answer this call. Try again.",
  calleeBusy: "They're busy right now",
  callDeclined: "Call declined",
  noAnswer: "No answer",
  rateCall: "How was the call?",
  rateGood: "Good",
  rateBad: "Bad",
  rateThanks: "Thanks for the feedback",
  callAgain: "Call someone else",
  close: "Close",
  online: "Online",
};

/** The specific line for a call that never connected, in place of the generic "Call failed". */
function failureText(l: CallLabels, reason?: CallEndReason): string {
  switch (reason) {
    case "busy":
      return l.calleeBusy ?? defaultLabels.calleeBusy!;
    case "rejected":
      return l.callDeclined ?? defaultLabels.callDeclined!;
    case "no_answer":
    case "timeout":
      return l.noAnswer ?? defaultLabels.noAnswer!;
    default:
      return l.failed;
  }
}

/** The call's stage as a word ("Ringing…", "Connected", "On hold"…), without the timer. */
export function callPhase(
  state: CallState | null,
  opts: { incoming?: boolean; labels?: CallLabels; reason?: CallEndReason } = {},
): string {
  const l = opts.labels ?? defaultLabels;
  switch (state) {
    case CallState.CONNECTING:
      return opts.incoming ? l.connecting : l.calling;
    case CallState.RINGING:
      return opts.incoming ? l.incoming : l.ringing;
    case CallState.ACTIVE:
      return l.connected ?? defaultLabels.connected!;
    case CallState.HELD:
      return l.onHold;
    case CallState.RECONNECTING:
      return l.reconnecting;
    case CallState.ENDED:
      return l.ended;
    case CallState.FAILED:
      return failureText(l, opts.reason);
    default:
      return "";
  }
}

/** Human status line for the call screen, e.g. "Ringing…" or "02:13". */
export function statusText(
  state: CallState | null,
  durationSeconds: number,
  opts: { incoming?: boolean; labels?: CallLabels; reason?: CallEndReason } = {},
): string {
  const l = opts.labels ?? defaultLabels;
  switch (state) {
    case CallState.CONNECTING:
      return opts.incoming ? l.connecting : l.calling;
    case CallState.RINGING:
      return opts.incoming ? l.incoming : l.ringing;
    case CallState.ACTIVE:
      return formatDuration(durationSeconds);
    case CallState.HELD:
      return `${l.onHold} · ${formatDuration(durationSeconds)}`;
    case CallState.RECONNECTING:
      return l.reconnecting;
    case CallState.ENDED:
      return durationSeconds > 0 ? `${l.ended} · ${formatDuration(durationSeconds)}` : l.ended;
    case CallState.FAILED:
      return failureText(l, opts.reason);
    default:
      return "";
  }
}

/** Up to two initials for the avatar; `#` for bare numbers. */
export function initials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned || /^[+\d\s()-]+$/.test(cleaned)) return "#";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
