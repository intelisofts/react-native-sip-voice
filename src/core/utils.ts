import type { CallEndReason } from "./types";

/** RFC 4122 v4 UUID. CallKit requires UUIDs for call identifiers. */
export function uuidv4(random: () => number = Math.random): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Normalise a dialled string: strip spaces/dashes/brackets and turn a leading `00` into `+`. */
export function normalizePhoneNumber(input: string): string {
  const trimmed = input.trim();
  // SIP URIs and user@host addresses are not phone numbers; leave them alone.
  if (/^sips?:/i.test(trimmed) || trimmed.includes("@")) return trimmed;
  let n = trimmed.replace(/[\s\-().]/g, "");
  if (n.startsWith("00")) n = "+" + n.slice(2);
  return n;
}

/** Build a SIP URI for a destination on the given domain. Full `sip:`/`sips:` URIs pass through. */
export function toSipUri(destination: string, domain: string): string {
  const d = normalizePhoneNumber(destination);
  if (/^sips?:/i.test(d)) return d;
  if (d.includes("@")) return `sip:${d}`;
  return `sip:${d}@${domain}`;
}

/** Map a final SIP response code to an end reason. */
export function reasonFromStatusCode(code: number | undefined): CallEndReason {
  switch (code) {
    // 603 Decline is the callee turning the call down: shown as busy, not as a failure.
    case 486:
    case 600:
    case 603:
      return "busy";
    case 403:
      return "rejected";
    // 408: the callee's phone did not answer the SIP call (offline, no internet, or rang out). Not a decline.
    case 408:
    // The SBC sends 480 when the callee's phone had no registration and did not wake in time.
    case 480:
    case 404:
    case 410:
    case 484:
    case 503:
      return "unavailable";
    default:
      return "failed";
  }
}

/** `mm:ss`, or `h:mm:ss` past an hour. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = sec.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export function createLogger(enabled: boolean, prefix = "[SipVoice]"): Logger {
  const noop = () => {};
  return {
    debug: enabled ? (...a) => console.log(prefix, ...a) : noop,
    info: enabled ? (...a) => console.info(prefix, ...a) : noop,
    warn: (...a) => console.warn(prefix, ...a),
    error: (...a) => console.error(prefix, ...a),
  };
}
