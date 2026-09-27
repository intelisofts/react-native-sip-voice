/** Lifecycle of a single call. */
export enum CallState {
  /** Created locally, INVITE not yet sent / not yet ringing. */
  CONNECTING = "CONNECTING",
  /** Remote party is being alerted (180/183 for outgoing, INVITE received for incoming). */
  RINGING = "RINGING",
  /** Media is flowing. */
  ACTIVE = "ACTIVE",
  /** Call is on hold (local hold). */
  HELD = "HELD",
  /** Signalling transport dropped mid-call; attempting to recover. */
  RECONNECTING = "RECONNECTING",
  /** Call finished normally. */
  ENDED = "ENDED",
  /** Call could not be established or was rejected. */
  FAILED = "FAILED",
}

/** State of the signalling connection (WebSocket + optional REGISTER) to the SBC. */
export enum ConnectionState {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  RECONNECTING = "RECONNECTING",
  ERROR = "ERROR",
}

export type CallDirection = "outgoing" | "incoming";

export type CallEndReason =
  | "local_hangup"
  | "remote_hangup"
  | "rejected"
  | "busy"
  | "no_answer"
  | "unavailable"
  | "network_error"
  | "native_ui"
  | "timeout"
  | "failed";

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Settings shared by every credential type: where the SBC is and how to talk to it. */
export interface SipServerConfig {
  /** WebSocket URL of your SBC, e.g. `wss://sbc.example.com:7443`. */
  wsServer: string;
  /** SIP domain / realm used in request URIs, e.g. `sip.example.com`. */
  domain: string;
  /** SIP user part of the From/AOR. Required for digest; optional for token auth (defaults to `anonymous`). */
  username?: string;
  /** Display name sent in the From header. */
  displayName?: string;
  /** STUN/TURN servers. Defaults to Google STUN when omitted. */
  iceServers?: IceServer[];
  /** Send REGISTER after connecting. Not required for outgoing-only apps. Default `false`. */
  register?: boolean;
  /** REGISTER expiry in seconds. Default 600. */
  registerExpires?: number;
  /** Custom `User-Agent` header. */
  userAgentString?: string;
  /** Log raw SIP messages. */
  traceSip?: boolean;
}

/** Classic SIP digest authentication (username/password challenge). */
export interface DigestCredentials extends SipServerConfig {
  type: "digest";
  username: string;
  password: string;
  /** Authorization user when it differs from the AOR user. */
  authorizationUsername?: string;
}

/**
 * Bearer-token authentication (RFC 8898 style). The token is attached to REGISTER and INVITE
 * requests as a header and, optionally, to the WebSocket URL as a query parameter.
 */
export interface TokenCredentials extends SipServerConfig {
  type: "token";
  token: string;
  /** Header name. Default `Authorization`. Use e.g. `X-Auth-Token` if your SBC expects that. */
  headerName?: string;
  /** Scheme prefix. Default `Bearer` when headerName is `Authorization`, otherwise none. Pass `""` for none. */
  headerScheme?: string;
  /** If set, the token is also appended to the WebSocket URL as `?<param>=<token>`. */
  wsQueryParam?: string;
}

export type SipCredentials = DigestCredentials | TokenCredentials;

/**
 * Supplies credentials on demand. Called on every {@link SipVoiceClient.connect} without explicit
 * credentials and on reconnects, so short-lived tokens can be refreshed.
 */
export type CredentialsProvider = () => Promise<SipCredentials>;

export interface NewCallOptions {
  /** Number or SIP user to dial. `+447700900123` becomes `sip:+447700900123@<domain>`. A full `sip:` URI is used as-is. */
  destination: string;
  /** Name shown in the From header display-name. */
  callerName?: string;
  /** Caller ID to present. Sent in the configured caller-id header (default `X-Caller-Id`). */
  callerId?: string;
  /** Opaque, usually base64, state for your backend. Sent in the configured client-state header (default `X-Client-State`). */
  clientState?: string;
  /** Any additional SIP headers for the INVITE (`{ "X-Tenant": "acme" }`). */
  headers?: Record<string, string>;
  /** Name shown in CallKit / Android call UI and the in-app screen. Defaults to destination. */
  displayName?: string;
  /** Local-only metadata attached to the {@link Call} (never sent over the wire). */
  metadata?: Record<string, unknown>;
}

export type DtmfMode = "auto" | "rfc2833" | "info";

export interface SipVoiceClientOptions {
  /** Verbose console logging. */
  debug?: boolean;
  /** Report calls to CallKit / ConnectionService. Default `true`. */
  nativeCallUI?: boolean;
  /** Header used for {@link NewCallOptions.clientState}. Default `X-Client-State`. */
  clientStateHeader?: string;
  /** Header used for {@link NewCallOptions.callerId}. Default `X-Caller-Id`. Set to `P-Asserted-Identity` if your SBC trusts it. */
  callerIdHeader?: string;
  /** DTMF transport. `auto` tries RTP (RFC 2833) and falls back to SIP INFO. Default `auto`. */
  dtmfMode?: DtmfMode;
  /** Attempts to recover the WebSocket after an unexpected drop. Default 5. */
  maxReconnectAttempts?: number;
  /** Base back-off in ms between reconnect attempts (doubles each time, capped at 30s). Default 1000. */
  reconnectBaseDelayMs?: number;
  /** Fail an outgoing call that has not been answered after this many ms. Default 60000. */
  outgoingCallTimeoutMs?: number;
  /** Provider used when {@link SipVoiceClient.connect} is called without credentials. */
  credentialsProvider?: CredentialsProvider;
}
