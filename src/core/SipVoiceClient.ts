import { Call } from "./Call";
import { EventEmitter, ReadonlyValueStream, Subscription, ValueStream } from "./observable";
import type { IncomingInvite, SignalingAdapter } from "./signaling";
import {
  CallState,
  ConnectionState,
  DtmfMode,
  NewCallOptions,
  SipCredentials,
  SipVoiceClientOptions,
} from "./types";
import { Logger, createLogger, normalizePhoneNumber, toSipUri } from "./utils";

export interface SipVoiceClientEvents extends Record<string, unknown> {
  incomingCall: Call;
  callEnded: Call;
  error: Error;
}

export interface PendingPushCall {
  callId: string;
  payload: Record<string, unknown>;
  receivedAt: number;
}

interface ResolvedOptions {
  debug: boolean;
  nativeCallUI: boolean;
  clientStateHeader: string;
  callerIdHeader: string;
  dtmfMode: DtmfMode;
  maxReconnectAttempts: number;
  reconnectBaseDelayMs: number;
  outgoingCallTimeoutMs: number;
  endedCallLingerMs: number;
}

export interface SipVoiceClientDeps {
  adapter: SignalingAdapter;
  logger?: Logger;
  /** Time source; overridable for tests. */
  now?: () => number;
}

const PUSH_MATCH_WINDOW_MS = 60_000;

function assertHeaderSafe(name: string, value: string): void {
  if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) {
    throw new Error(`SIP header ${name} contains a line break`);
  }
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) {
    throw new Error(`Invalid SIP header name: ${name}`);
  }
}

/**
 * Carrier-agnostic VoIP client. Connects to any SBC that speaks SIP over WebSocket.
 *
 * ```ts
 * const client = new SipVoiceClient({ credentialsProvider: fetchSipCreds });
 * await client.connect();
 * const call = await client.newCall({ destination: "+447700900123" });
 * ```
 */
export class SipVoiceClient {
  private readonly options: ResolvedOptions;
  private readonly adapter: SignalingAdapter;
  private readonly log: Logger;
  private readonly now: () => number;
  private readonly credentialsProvider?: SipVoiceClientOptions["credentialsProvider"];

  private readonly connection = new ValueStream<ConnectionState>(ConnectionState.DISCONNECTED);
  private readonly callsStream = new ValueStream<Call[]>([]);
  private readonly activeCallStream = new ValueStream<Call | null>(null);
  private readonly emitter = new EventEmitter<SipVoiceClientEvents>();

  private credentials?: SipCredentials;
  private intentionalDisconnect = false;
  private reconnectAttempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private connectPromise?: Promise<void>;
  private readonly callSubscriptions = new Map<string, Subscription>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly setupTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingPushCalls: PendingPushCall[] = [];
  private destroyed = false;

  constructor(options: SipVoiceClientOptions = {}, deps?: Partial<SipVoiceClientDeps>) {
    this.options = {
      debug: options.debug ?? false,
      nativeCallUI: options.nativeCallUI ?? true,
      clientStateHeader: options.clientStateHeader ?? "X-Client-State",
      callerIdHeader: options.callerIdHeader ?? "X-Caller-Id",
      dtmfMode: options.dtmfMode ?? "auto",
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 1000,
      outgoingCallTimeoutMs: options.outgoingCallTimeoutMs ?? 60_000,
      endedCallLingerMs: 1500,
    };
    this.credentialsProvider = options.credentialsProvider;
    this.log = deps?.logger ?? createLogger(this.options.debug);
    this.now = deps?.now ?? Date.now;
    this.adapter = deps?.adapter ?? SipVoiceClient.defaultAdapter(this.log);
  }

  private static defaultAdapter(logger: Logger): SignalingAdapter {
    // Lazy so tests / custom adapters never load SIP.js or react-native-webrtc.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SipJsAdapter } = require("../sip/SipJsAdapter") as typeof import("../sip/SipJsAdapter");
    return new SipJsAdapter({ logger });
  }

  // ---- Observables -------------------------------------------------------

  get connectionState$(): ReadonlyValueStream<ConnectionState> {
    return this.connection;
  }
  /** All calls not yet removed (ended calls linger briefly so UIs can show "Call ended"). */
  get calls$(): ReadonlyValueStream<Call[]> {
    return this.callsStream;
  }
  /** The call the UI should focus on, or null. */
  get activeCall$(): ReadonlyValueStream<Call | null> {
    return this.activeCallStream;
  }
  get currentConnectionState(): ConnectionState {
    return this.connection.value;
  }
  get currentActiveCall(): Call | null {
    return this.activeCallStream.value;
  }
  get currentCalls(): Call[] {
    return this.callsStream.value;
  }
  get isConnected(): boolean {
    return this.connection.value === ConnectionState.CONNECTED;
  }
  get nativeCallUIEnabled(): boolean {
    return this.options.nativeCallUI;
  }

  on<K extends keyof SipVoiceClientEvents>(event: K, handler: (payload: SipVoiceClientEvents[K]) => void) {
    return this.emitter.on(event, handler);
  }

  // ---- Connection --------------------------------------------------------

  /**
   * Connect to the SBC. With no argument the configured `credentialsProvider` is used.
   * Resolves when the WebSocket is open (and REGISTER succeeded, if enabled).
   */
  async connect(credentials?: SipCredentials): Promise<void> {
    if (this.destroyed) throw new Error("Client destroyed");
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.doConnect(credentials).finally(() => {
      this.connectPromise = undefined;
    });
    return this.connectPromise;
  }

  private async doConnect(credentials?: SipCredentials): Promise<void> {
    const creds = credentials ?? (this.credentialsProvider ? await this.credentialsProvider() : undefined);
    if (!creds) throw new Error("No SIP credentials: pass them to connect() or set credentialsProvider");
    validateCredentials(creds);

    this.clearReconnect();
    this.intentionalDisconnect = false;
    this.credentials = creds;
    this.connection.next(ConnectionState.CONNECTING);
    try {
      await this.adapter.connect(creds, {
        onConnectionStateChange: (state, error) => this.onTransportState(state, error),
        onIncomingInvite: (invite) => this.onIncomingInvite(invite),
      });
      this.connection.next(ConnectionState.CONNECTED);
      this.reconnectAttempt = 0;
      this.log.info("Connected to", creds.wsServer);
    } catch (error) {
      this.connection.next(ConnectionState.ERROR);
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitter.emit("error", err);
      throw err;
    }
  }

  /** Close the connection. Active calls are hung up first. */
  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.clearReconnect();
    await Promise.all(this.liveCalls().map((c) => c.hangup()));
    await this.adapter.disconnect();
    this.connection.next(ConnectionState.DISCONNECTED);
  }

  /** Alias kept for parity with the Telnyx SDK API. */
  logout(): Promise<void> {
    return this.disconnect();
  }

  private onTransportState(state: ConnectionState, error?: Error): void {
    this.log.debug("Transport state", state, error?.message ?? "");
    if (state === ConnectionState.CONNECTED) {
      if (this.connection.value === ConnectionState.RECONNECTING) {
        this.reconnectAttempt = 0;
        this.liveCalls().forEach((c) => c._setReconnecting(false));
      }
      this.connection.next(ConnectionState.CONNECTED);
      return;
    }
    if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
      if (this.intentionalDisconnect || this.destroyed) {
        this.connection.next(ConnectionState.DISCONNECTED);
        return;
      }
      // Unexpected drop (network change, SBC restart, app resumed after suspension).
      if (this.connection.value === ConnectionState.CONNECTED || this.connection.value === ConnectionState.RECONNECTING) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempt >= this.options.maxReconnectAttempts) {
      this.log.warn("Giving up reconnecting");
      this.connection.next(ConnectionState.ERROR);
      this.liveCalls().forEach((c) => c.onEnded("network_error"));
      this.emitter.emit("error", new Error("Lost connection to SBC"));
      return;
    }
    this.connection.next(ConnectionState.RECONNECTING);
    this.liveCalls().forEach((c) => c._setReconnecting(true));
    const delay = Math.min(30_000, this.options.reconnectBaseDelayMs * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.log.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      try {
        await this.adapter.reconnect();
        this.onTransportState(ConnectionState.CONNECTED);
      } catch (error) {
        this.log.warn("Reconnect failed", error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /** Call when the app returns to the foreground or the network changes, to recover faster than the back-off. */
  async handleNetworkChange(): Promise<void> {
    if (this.intentionalDisconnect || !this.credentials) return;
    if (this.adapter.isConnected()) return;
    this.clearReconnect();
    this.reconnectAttempt = 0;
    this.connection.next(ConnectionState.RECONNECTING);
    this.scheduleReconnect();
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  // ---- Calls -------------------------------------------------------------

  /**
   * Place an outgoing call. Connects first when needed and a credentials provider is configured.
   */
  async newCall(options: NewCallOptions): Promise<Call> {
    if (!options.destination?.trim()) throw new Error("destination is required");
    if (!this.isConnected) {
      if (this.connection.value === ConnectionState.CONNECTING && this.connectPromise) await this.connectPromise;
      else if (this.credentialsProvider || this.credentials) await this.connect(this.credentialsProvider ? undefined : this.credentials);
      else throw new Error("Not connected to SBC");
    }
    const creds = this.credentials!;
    const destination = normalizePhoneNumber(options.destination);
    const extraHeaders = this.buildHeaders(options, creds.domain);

    const call = new Call({
      direction: "outgoing",
      destination,
      displayName: options.displayName ?? destination,
      metadata: options.metadata,
      now: this.now,
    });
    this.addCall(call);

    try {
      const session = this.adapter.invite(
        {
          targetUri: toSipUri(destination, creds.domain),
          extraHeaders,
          fromDisplayName: options.callerName ?? creds.displayName,
          dtmfMode: this.options.dtmfMode,
        },
        call,
      );
      call._attachSession(session);
    } catch (error) {
      call.onEnded("failed");
      throw error;
    }

    if (!call.isTerminated && call.answeredAt === undefined) {
      const timeout = setTimeout(() => {
        this.setupTimeouts.delete(call.id);
        if (call.answeredAt === undefined && !call.isTerminated) {
          this.log.warn("Outgoing call timed out", call.id);
          call.hangup("timeout");
        }
      }, this.options.outgoingCallTimeoutMs);
      this.setupTimeouts.set(call.id, timeout);
    }
    return call;
  }

  private buildHeaders(options: NewCallOptions, domain: string): string[] {
    const headers: [string, string][] = [];
    if (options.callerId) {
      const value =
        this.options.callerIdHeader.toLowerCase() === "p-asserted-identity"
          ? `<${toSipUri(options.callerId, domain)}>`
          : options.callerId;
      headers.push([this.options.callerIdHeader, value]);
    }
    if (options.clientState) headers.push([this.options.clientStateHeader, options.clientState]);
    for (const [name, value] of Object.entries(options.headers ?? {})) headers.push([name, value]);
    return headers.map(([name, value]) => {
      assertHeaderSafe(name, value);
      return `${name}: ${value}`;
    });
  }

  /** Hang up every live call. */
  async hangupAll(): Promise<void> {
    await Promise.all(this.liveCalls().map((c) => c.hangup()));
  }

  getCall(id: string): Call | undefined {
    return this.callsStream.value.find((c) => c.id === id);
  }

  // ---- Incoming / push ---------------------------------------------------

  /**
   * Record a call announced by VoIP push (already shown by CallKit/ConnectionService) so the
   * matching SIP INVITE reuses its id. Matching uses the `X-Call-Id` header against
   * `payload.call_id`, falling back to the oldest recent push.
   */
  registerPushCall(callId: string, payload: Record<string, unknown> = {}): void {
    this.pendingPushCalls = this.pendingPushCalls.filter((p) => this.now() - p.receivedAt < PUSH_MATCH_WINDOW_MS);
    if (!this.pendingPushCalls.some((p) => p.callId === callId)) {
      this.pendingPushCalls.push({ callId, payload, receivedAt: this.now() });
    }
  }

  private takePushCall(headers: Record<string, string>): PendingPushCall | undefined {
    this.pendingPushCalls = this.pendingPushCalls.filter((p) => this.now() - p.receivedAt < PUSH_MATCH_WINDOW_MS);
    const headerId = headers["x-call-id"];
    let idx = headerId ? this.pendingPushCalls.findIndex((p) => p.payload.call_id === headerId) : -1;
    if (idx < 0 && this.pendingPushCalls.length > 0) idx = 0;
    if (idx < 0) return undefined;
    return this.pendingPushCalls.splice(idx, 1)[0];
  }

  private onIncomingInvite(invite: IncomingInvite): void {
    const push = this.takePushCall(invite.headers);
    const call = new Call({
      id: push?.callId,
      direction: "incoming",
      destination: invite.from,
      displayName: invite.fromDisplayName ?? invite.from,
      metadata: { headers: invite.headers, fromPush: !!push, pushPayload: push?.payload },
      initialState: CallState.RINGING,
      now: this.now,
    });
    call._attachSession(invite.createSession(call, this.options.dtmfMode));
    this.addCall(call);
    this.emitter.emit("incomingCall", call);
  }

  // ---- Bookkeeping -------------------------------------------------------

  private liveCalls(): Call[] {
    return this.callsStream.value.filter((c) => !c.isTerminated);
  }

  private addCall(call: Call): void {
    this.callsStream.next([...this.callsStream.value, call]);
    const sub = call.callState$.subscribe((state) => {
      if (state !== CallState.CONNECTING && state !== CallState.RINGING) this.clearSetupTimeout(call.id);
      if (state === CallState.ENDED || state === CallState.FAILED) this.onCallTerminated(call);
      this.recomputeActive();
    });
    this.callSubscriptions.set(call.id, sub);
  }

  private clearSetupTimeout(callId: string): void {
    const t = this.setupTimeouts.get(callId);
    if (t) clearTimeout(t);
    this.setupTimeouts.delete(callId);
  }

  private onCallTerminated(call: Call): void {
    this.emitter.emit("callEnded", call);
    const t = setTimeout(() => {
      this.timers.delete(t);
      this.removeCall(call);
    }, this.options.endedCallLingerMs);
    this.timers.add(t);
  }

  private removeCall(call: Call): void {
    this.callSubscriptions.get(call.id)?.unsubscribe();
    this.callSubscriptions.delete(call.id);
    this.callsStream.next(this.callsStream.value.filter((c) => c !== call));
    this.recomputeActive();
  }

  private recomputeActive(): void {
    const calls = this.callsStream.value;
    const live = calls.filter((c) => !c.isTerminated);
    // Prefer a live, un-held call, then any live call, then the most recent ended one (still lingering).
    const next =
      [...live].reverse().find((c) => c.currentState !== CallState.HELD) ??
      live[live.length - 1] ??
      calls[calls.length - 1] ??
      null;
    this.activeCallStream.next(next);
  }

  /** Tear down everything. The instance cannot be reused. */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    await this.disconnect().catch(() => {});
    this.destroyed = true;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.setupTimeouts.forEach(clearTimeout);
    this.setupTimeouts.clear();
    this.callSubscriptions.forEach((s) => s.unsubscribe());
    this.callSubscriptions.clear();
    this.emitter.removeAll();
  }
}

function validateCredentials(creds: SipCredentials): void {
  if (!creds.wsServer || !/^wss?:\/\//i.test(creds.wsServer)) {
    throw new Error("wsServer must be a ws:// or wss:// URL");
  }
  if (!creds.domain) throw new Error("domain is required");
  if (creds.type === "digest" && (!creds.username || !creds.password)) {
    throw new Error("digest credentials need username and password");
  }
  if (creds.type === "token" && !creds.token) throw new Error("token credentials need a token");
}
