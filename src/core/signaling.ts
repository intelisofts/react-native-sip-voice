import type { CallSession, CallSessionEvents } from "./session";
import type { ConnectionState, DtmfMode, SipCredentials } from "./types";

export interface OutgoingInviteRequest {
  /** Full target URI, e.g. `sip:+447700900123@sbc.example.com`. */
  targetUri: string;
  /** Extra headers as `Name: value` lines. */
  extraHeaders: string[];
  fromDisplayName?: string;
  dtmfMode: DtmfMode;
}

export interface IncomingInvite {
  /** Remote user part (usually the caller number). */
  from: string;
  fromDisplayName?: string;
  /** Request headers, lower-cased names. */
  headers: Record<string, string>;
  /** Bind the pending invitation to a call. */
  createSession(events: CallSessionEvents, dtmfMode: DtmfMode): CallSession;
}

export interface SignalingAdapterEvents {
  onConnectionStateChange(state: ConnectionState, error?: Error): void;
  onIncomingInvite(invite: IncomingInvite): void;
}

/**
 * Transport + SIP stack abstraction. The default implementation uses SIP.js
 * ({@link SipJsAdapter}); anything that can speak to your SBC can implement this.
 */
export interface SignalingAdapter {
  connect(credentials: SipCredentials, events: SignalingAdapterEvents): Promise<void>;
  /** Re-open the transport after an unexpected drop, keeping existing sessions. */
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  invite(request: OutgoingInviteRequest, events: CallSessionEvents): CallSession;
}
