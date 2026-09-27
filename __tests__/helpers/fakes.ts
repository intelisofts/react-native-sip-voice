import type { CallSession, CallSessionEvents } from "../../src/core/session";
import type {
  IncomingInvite,
  OutgoingInviteRequest,
  SignalingAdapter,
  SignalingAdapterEvents,
} from "../../src/core/signaling";
import { ConnectionState, DigestCredentials, SipCredentials, TokenCredentials } from "../../src/core/types";
import type { NativeCallUI, NativeCallUIEvents } from "../../src/native/NativeCallUI";

export class FakeSession implements CallSession {
  sipCallId = "sip-call-id-1";
  hangup = jest.fn(async () => {});
  answer = jest.fn(async () => {});
  reject = jest.fn(async () => {});
  setMuted = jest.fn();
  setHold = jest.fn(async () => {});
  sendDtmf = jest.fn(async () => {});
  constructor(public events?: CallSessionEvents) {}
}

export class FakeAdapter implements SignalingAdapter {
  connected = false;
  events?: SignalingAdapterEvents;
  lastCredentials?: SipCredentials;
  invites: { request: OutgoingInviteRequest; events: CallSessionEvents; session: FakeSession }[] = [];
  connect = jest.fn(async (credentials: SipCredentials, events: SignalingAdapterEvents) => {
    this.lastCredentials = credentials;
    this.events = events;
    this.connected = true;
    events.onConnectionStateChange(ConnectionState.CONNECTED);
  });
  reconnect = jest.fn(async () => {
    this.connected = true;
  });
  disconnect = jest.fn(async () => {
    this.connected = false;
  });
  isConnected = () => this.connected;
  invite = jest.fn((request: OutgoingInviteRequest, events: CallSessionEvents) => {
    const session = new FakeSession(events);
    this.invites.push({ request, events, session });
    return session;
  });

  get lastInvite() {
    return this.invites[this.invites.length - 1];
  }

  /** Simulate the WebSocket dropping. */
  drop(error = new Error("socket closed")) {
    this.connected = false;
    this.events?.onConnectionStateChange(ConnectionState.ERROR, error);
  }

  /** Simulate an incoming INVITE. */
  incoming(from: string, headers: Record<string, string> = {}, displayName?: string) {
    const session = new FakeSession();
    const invite: IncomingInvite = {
      from,
      fromDisplayName: displayName,
      headers,
      createSession: (events) => {
        session.events = events;
        return session;
      },
    };
    this.events?.onIncomingInvite(invite);
    return session;
  }
}

export const digestCreds: DigestCredentials = {
  type: "digest",
  wsServer: "wss://sbc.example.com:7443",
  domain: "sip.example.com",
  username: "alice",
  password: "secret",
};

export const tokenCreds: TokenCredentials = {
  type: "token",
  wsServer: "wss://sbc.example.com",
  domain: "sip.example.com",
  token: "jwt.token.value",
};

type Listener = (payload: any) => void;

export class FakeNative implements NativeCallUI {
  readonly isAvailable = true;
  listeners = new Map<string, Set<Listener>>();
  configure = jest.fn(async () => {});
  startOutgoingCall = jest.fn(async () => {});
  reportOutgoingCallConnecting = jest.fn();
  reportCallConnected = jest.fn();
  reportIncomingCall = jest.fn(async () => {});
  reportCallEnded = jest.fn();
  endCall = jest.fn(async () => {});
  setMuted = jest.fn();
  setHeld = jest.fn();
  updateDisplay = jest.fn();
  setAudioRoute = jest.fn(async () => {});
  getAudioRoutes = jest.fn(async () => ({ current: "earpiece" as const, available: ["earpiece" as const, "speaker" as const] }));
  registerVoipPush = jest.fn();
  getVoipPushToken = jest.fn(async () => null);
  getPendingPushCalls = jest.fn(async (): Promise<{ callId: string; payload: Record<string, unknown> }[]> => []);

  addListener<K extends keyof NativeCallUIEvents>(event: K, listener: (payload: NativeCallUIEvents[K]) => void) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return { unsubscribe: () => set.delete(listener) };
  }

  emit<K extends keyof NativeCallUIEvents>(event: K, payload: NativeCallUIEvents[K]) {
    this.listeners.get(event)?.forEach((l) => l(payload));
  }
}

/** Resolve pending promise callbacks. */
export const flush = () => new Promise<void>((r) => jest.requireActual<typeof globalThis>("timers").setImmediate(r));
