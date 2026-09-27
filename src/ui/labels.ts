import { CallState } from "../core/types";
import { formatDuration } from "../core/utils";

export interface CallLabels {
  calling: string;
  ringing: string;
  connecting: string;
  reconnecting: string;
  onHold: string;
  ended: string;
  failed: string;
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
}

export const defaultLabels: CallLabels = {
  calling: "Calling…",
  ringing: "Ringing…",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  onHold: "On hold",
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
};

/** Human status line for the call screen, e.g. "Ringing…" or "02:13". */
export function statusText(
  state: CallState | null,
  durationSeconds: number,
  opts: { incoming?: boolean; labels?: CallLabels } = {},
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
      return l.failed;
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
