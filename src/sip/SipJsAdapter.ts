import {
  Invitation,
  Inviter,
  Registerer,
  Session,
  SessionState,
  UserAgent,
  UserAgentOptions,
  Web,
} from "sip.js";

import type { CallSession, CallSessionEvents } from "../core/session";
import type {
  IncomingInvite,
  OutgoingInviteRequest,
  SignalingAdapter,
  SignalingAdapterEvents,
} from "../core/signaling";
import { CallEndReason, ConnectionState, DtmfMode, SipCredentials } from "../core/types";
import { Logger, createLogger, reasonFromStatusCode } from "../core/utils";
import { ensureWebRTCGlobals, reactNativeMediaStreamFactory } from "./media";

const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

/** Header lines that carry a bearer token, or `[]` for digest credentials. */
export function tokenHeaderLines(credentials: SipCredentials): string[] {
  if (credentials.type !== "token") return [];
  const name = credentials.headerName ?? "Authorization";
  const scheme = credentials.headerScheme ?? (name.toLowerCase() === "authorization" ? "Bearer" : "");
  return [`${name}: ${scheme ? `${scheme} ` : ""}${credentials.token}`];
}

/** WebSocket URL with the token appended as a query parameter when configured. */
export function buildServerUrl(credentials: SipCredentials): string {
  if (credentials.type !== "token" || !credentials.wsQueryParam) return credentials.wsServer;
  const sep = credentials.wsServer.includes("?") ? "&" : "?";
  return `${credentials.wsServer}${sep}${encodeURIComponent(credentials.wsQueryParam)}=${encodeURIComponent(credentials.token)}`;
}

export interface SipJsAdapterOptions {
  logger?: Logger;
  /** ICE gathering timeout in ms. Default 2000; long gathering delays call setup on mobile. */
  iceGatheringTimeout?: number;
}

/** {@link SignalingAdapter} backed by SIP.js over WebSocket, with react-native-webrtc media. */
export class SipJsAdapter implements SignalingAdapter {
  private ua?: UserAgent;
  private registerer?: Registerer;
  private credentials?: SipCredentials;
  private events?: SignalingAdapterEvents;
  private readonly log: Logger;
  private readonly iceGatheringTimeout: number;

  constructor(options: SipJsAdapterOptions = {}) {
    this.log = options.logger ?? createLogger(false);
    this.iceGatheringTimeout = options.iceGatheringTimeout ?? 2000;
  }

  isConnected(): boolean {
    return this.ua?.isConnected() ?? false;
  }

  async connect(credentials: SipCredentials, events: SignalingAdapterEvents): Promise<void> {
    ensureWebRTCGlobals();
    if (this.ua) await this.disconnect();

    this.credentials = credentials;
    this.events = events;

    const user = credentials.username ?? "anonymous";
    const uri = UserAgent.makeURI(`sip:${user}@${credentials.domain}`);
    if (!uri) throw new Error(`Invalid SIP identity sip:${user}@${credentials.domain}`);

    const options: UserAgentOptions = {
      uri,
      displayName: credentials.displayName,
      userAgentString: credentials.userAgentString ?? "react-native-sip-voice",
      logBuiltinEnabled: !!credentials.traceSip,
      logLevel: credentials.traceSip ? "debug" : "error",
      transportOptions: {
        server: buildServerUrl(credentials),
        traceSip: !!credentials.traceSip,
        keepAliveInterval: 25,
      },
      sessionDescriptionHandlerFactory: Web.defaultSessionDescriptionHandlerFactory(
        reactNativeMediaStreamFactory,
      ),
      sessionDescriptionHandlerFactoryOptions: {
        peerConnectionConfiguration: {
          iceServers: credentials.iceServers ?? DEFAULT_ICE_SERVERS,
        },
        iceGatheringTimeout: this.iceGatheringTimeout,
      },
      delegate: {
        onConnect: () => events.onConnectionStateChange(ConnectionState.CONNECTED),
        onDisconnect: (error?: Error) => {
          // SIP.js puts the WebSocket close code in the message, e.g. "WebSocket closed wss://… (code: 1006)".
          if (error) this.log.warn("SBC connection lost:", error.message);
          events.onConnectionStateChange(error ? ConnectionState.ERROR : ConnectionState.DISCONNECTED, error);
        },
        onInvite: (invitation: Invitation) => this.handleInvite(invitation),
      },
    };
    if (credentials.type === "digest") {
      options.authorizationUsername = credentials.authorizationUsername ?? credentials.username;
      options.authorizationPassword = credentials.password;
    }

    events.onConnectionStateChange(ConnectionState.CONNECTING);
    const ua = new UserAgent(options);
    this.ua = ua;
    await ua.start();

    if (credentials.register) {
      this.registerer = new Registerer(ua, {
        expires: credentials.registerExpires ?? 600,
        extraHeaders: tokenHeaderLines(credentials),
      });
      await this.registerer.register();
    }
  }

  async reconnect(): Promise<void> {
    if (!this.ua) throw new Error("Not connected");
    await this.ua.reconnect();
    if (this.registerer) await this.registerer.register();
  }

  /**
   * Closes the WebSocket immediately. The user agent is stopped afterwards in the background; with the
   * transport already down it sends nothing (no un-REGISTER, no BYE) and waits for nothing.
   */
  async disconnect(): Promise<void> {
    const ua = this.ua;
    this.ua = undefined;
    this.registerer = undefined;
    this.credentials = undefined;
    if (!ua) return;
    const closing = ua.transport.disconnect().catch((e) => this.log.debug("Transport close failed", e));
    void closing.finally(() => ua.stop().catch(() => {}));
  }


  invite(request: OutgoingInviteRequest, events: CallSessionEvents): CallSession {
    if (!this.ua || !this.credentials) throw new Error("Not connected to SBC");
    const target = UserAgent.makeURI(request.targetUri);
    if (!target) throw new Error(`Invalid target URI ${request.targetUri}`);

    // The SBC saves the INVITE's token for the call and requires the same one on every re-INVITE (hold/resume).
    const tokenHeaders = tokenHeaderLines(this.credentials);
    const inviter = new Inviter(this.ua, target, {
      extraHeaders: [...tokenHeaders, ...request.extraHeaders],
      params: request.fromDisplayName ? { fromDisplayName: request.fromDisplayName } : undefined,
      sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
      earlyMedia: true,
    });

    const session = new SipJsCallSession(inviter, events, request.dtmfMode, this.log, tokenHeaders);
    inviter
      .invite({
        requestDelegate: {
          onProgress: (response) => {
            const code = response.message.statusCode;
            if (code === 180 || code === 183) events.onRinging();
          },
          onReject: (response) => {
            const m = response.message;
            const reason = m.getHeader("Reason");
            this.log.info(`Call rejected ${m.statusCode} ${m.reasonPhrase}`, reason ? `Reason: ${reason}` : "");
            session.markRejected(m.statusCode);
          },
        },
      })
      .catch((error: unknown) => {
        this.log.error("INVITE failed", error);
        session.markRejected(undefined);
        events.onEnded("failed");
      });
    return session;
  }

  private handleInvite(invitation: Invitation): void {
    const request = invitation.request;
    const headers: Record<string, string> = {};
    for (const name of Object.keys(request.headers ?? {})) {
      const value = request.getHeader(name);
      if (value !== undefined) headers[name.toLowerCase()] = value;
    }
    const invite: IncomingInvite = {
      from: invitation.remoteIdentity.uri.user ?? "unknown",
      fromDisplayName: invitation.remoteIdentity.displayName || undefined,
      headers,
      createSession: (events, dtmfMode) =>
        new SipJsCallSession(invitation, events, dtmfMode, this.log),
    };
    this.events?.onIncomingInvite(invite);
  }
}

/** {@link CallSession} wrapping a SIP.js Inviter or Invitation. */
export class SipJsCallSession implements CallSession {
  private localHangup = false;
  private rejectedCode?: number;
  private muted = false;
  private wasEstablished = false;
  private ended = false;

  constructor(
    private readonly session: Session,
    private readonly events: CallSessionEvents,
    private readonly dtmfMode: DtmfMode,
    private readonly log: Logger,
    /** Token header(s) of the call's original INVITE; re-sent unchanged on re-INVITEs. */
    private readonly tokenHeaders: readonly string[] = [],
  ) {
    session.stateChange.addListener((state) => this.onStateChange(state));
    session.delegate = {
      ...session.delegate,
      onBye: (bye) => {
        const reason = bye.request.getHeader("Reason");
        this.log.info("SBC ended the call (BYE)", this.sipCallId ?? "", reason ? `Reason: ${reason}` : "(no Reason header)");
        bye.accept().catch(() => {});
      },
    };
  }

  get sipCallId(): string | undefined {
    return (this.session as Inviter | Invitation).request?.callId;
  }

  /** @internal */
  markRejected(statusCode: number | undefined): void {
    this.rejectedCode = statusCode ?? this.rejectedCode;
  }

  private onStateChange(state: SessionState): void {
    this.log.debug("SIP session state", state);
    switch (state) {
      case SessionState.Established:
        this.wasEstablished = true;
        this.applyMute();
        this.events.onAnswered();
        break;
      case SessionState.Terminated:
        if (this.ended) return;
        this.ended = true;
        this.events.onEnded(this.endReason(), this.rejectedCode);
        break;
      default:
        break;
    }
  }

  private endReason(): CallEndReason {
    if (this.localHangup) return "local_hangup";
    if (this.wasEstablished) return "remote_hangup";
    if (this.rejectedCode) return reasonFromStatusCode(this.rejectedCode);
    return "failed";
  }

  /**
   * Best-effort BYE (answered) / CANCEL (ringing) / reject (incoming), sent without waiting for the SBC's
   * reply; the app closes the WebSocket right after and the SBC ends the dialog when the socket closes.
   */
  async hangup(): Promise<void> {
    this.localHangup = true;
    const s = this.session;
    const ignore = (e: unknown) => this.log.debug("Hangup signalling not sent", e);
    switch (s.state) {
      case SessionState.Initial:
      case SessionState.Establishing:
        if (s instanceof Inviter) void s.cancel().catch(ignore);
        else if (s instanceof Invitation) void s.reject().catch(ignore);
        break;
      case SessionState.Established:
        void s.bye().catch(ignore);
        break;
      default:
        break;
    }
  }

  async answer(): Promise<void> {
    if (!(this.session instanceof Invitation)) throw new Error("Only incoming calls can be answered");
    await this.session.accept({
      sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
    });
  }

  async reject(): Promise<void> {
    this.localHangup = true;
    if (this.session instanceof Invitation && this.session.state === SessionState.Initial) {
      await this.session.reject({ statusCode: 603 });
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMute();
  }

  private applyMute(): void {
    const pc = this.peerConnection();
    pc?.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === "audio") sender.track.enabled = !this.muted;
    });
  }

  private peerConnection(): RTCPeerConnection | undefined {
    const sdh = this.session.sessionDescriptionHandler as
      | (Web.SessionDescriptionHandler & { peerConnection?: RTCPeerConnection })
      | undefined;
    return sdh?.peerConnection;
  }

  /**
   * Hold / resume with an in-dialog re-INVITE: the offer is `a=sendonly` to hold and `a=sendrecv` to resume.
   * It carries the same token header as the original INVITE, which the SBC checks against the call.
   */
  async setHold(hold: boolean): Promise<void> {
    if (this.session.state !== SessionState.Established) throw new Error("Call not established");
    const sdhOptions = { hold } as Web.SessionDescriptionHandlerOptions;
    this.session.sessionDescriptionHandlerOptionsReInvite = sdhOptions;
    await new Promise<void>((resolve, reject) => {
      this.session
        .invite({
          requestOptions: { extraHeaders: [...this.tokenHeaders] },
          requestDelegate: {
            onAccept: () => resolve(),
            onReject: (response) => {
              const code = response.message.statusCode;
              this.log.warn(`${hold ? "Hold" : "Resume"} re-INVITE rejected: ${code} ${response.message.reasonPhrase}`);
              reject(new Error(`${hold ? "Hold" : "Resume"} rejected (${code})`));
            },
          },
          sessionDescriptionHandlerOptions: sdhOptions,
        })
        .catch(reject);
    });
  }

  async sendDtmf(tone: string): Promise<void> {
    if (this.dtmfMode !== "info") {
      const sdh = this.session.sessionDescriptionHandler;
      const sent = sdh?.sendDtmf(tone) ?? false;
      if (sent) return;
      if (this.dtmfMode === "rfc2833") throw new Error("RTP DTMF not supported on this device");
    }
    for (const signal of tone) {
      await this.session.info({
        requestOptions: {
          body: {
            contentDisposition: "render",
            contentType: "application/dtmf-relay",
            content: `Signal=${signal}\r\nDuration=160`,
          },
        },
      });
    }
  }
}
