import type { CallSession, CallSessionEvents } from "../../src/core/session";
import type {
  IncomingInvite,
  OutgoingInviteRequest,
  SignalingAdapter,
  SignalingAdapterEvents,
} from "../../src/core/signaling";
import { ConnectionState, DigestCredentials, SipCredentials, TokenCredentials } from "../../src/core/types";

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
  unregister = jest.fn(async () => {});
  refreshRegistration = jest.fn(async (credentials: SipCredentials) => {
    this.lastCredentials = credentials;
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

type Handler = (payload: any) => void;

/** A fake of the system call layer (expo-callkit-telecom): records requests, lets tests fire system events. */
export class FakeCallSystem {
  private handlers = new Map<string, Set<Handler>>();
  private nextId = 1;
  activeSession: any = null;
  speakerOn = false;

  private on = (event: string) => (listener: Handler) => {
    const set = this.handlers.get(event) ?? new Set();
    set.add(listener);
    this.handlers.set(event, set);
    return { remove: () => set.delete(listener) };
  };

  /** Fire a system event: sessionAdded, sessionRemoved, answered, ended, muted, held, dtmf, route. */
  emit(event: string, payload: any) {
    this.handlers.get(event)?.forEach((l) => l(payload));
  }

  listenerCount(event: string) {
    return this.handlers.get(event)?.size ?? 0;
  }

  startOutgoingCall = jest.fn(async (_recipient: any, _options?: any) => `sys-${this.nextId++}`);
  reportIncomingCall = jest.fn(async (_event: any) => {});
  answerCall = jest.fn(async (_id: string) => {});
  endCall = jest.fn(async (_id: string) => {});
  reportCallEnded = jest.fn(async (_id: string, _reason: any) => {});
  reportOutgoingCallConnected = jest.fn(async (_id: string) => {});
  fulfillIncomingCallConnected = jest.fn(async (_requestId: string) => {});
  failIncomingCallConnected = jest.fn(async (_id: string, _requestId: string) => {});
  setMuted = jest.fn(async (_id: string, _muted: boolean) => {});
  setHeld = jest.fn(async (_id: string, _held: boolean) => {});
  getActiveCallSession = jest.fn(async () => this.activeSession);
  getAudioSession = jest.fn(() => ({
    currentRoute: { inputs: [], outputs: [{ portType: this.speakerOn ? "builtInSpeaker" : "builtInReceiver", portName: "", uid: "" }] },
  }) as any);
  setAudioSessionPortOverride = jest.fn((on: boolean) => {
    this.speakerOn = on;
  });

  addCallSessionAddedListener = this.on("sessionAdded");
  addCallSessionRemovedListener = this.on("sessionRemoved");
  addCallAnsweredListener = this.on("answered");
  addCallEndedListener = this.on("ended");
  addSetMutedActionListener = this.on("muted");
  addSetHeldActionListener = this.on("held");
  addDTMFListener = this.on("dtmf");
  addAudioRouteChangedListener = this.on("route");
}

/** A session as expo-callkit-telecom reports one announced by VoIP push. */
export const pushSession = (id: string, serverCallId: string, extra: Record<string, unknown> = {}) => ({
  id,
  origin: "incoming",
  status: "ringing",
  isMuted: false,
  isOnHold: false,
  remoteParticipants: [],
  options: { hasVideo: false, supportsHolding: false, supportsDTMF: true },
  incomingCallEvent: { eventId: `evt-${id}`, serverCallId, caller: { id: "+1" } },
  ...extra,
});

/** Resolve pending promise callbacks. */
export const flush = () => new Promise<void>((r) => jest.requireActual<typeof globalThis>("timers").setImmediate(r));
