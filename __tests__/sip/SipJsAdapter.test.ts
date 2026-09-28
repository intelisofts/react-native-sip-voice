import { ConnectionState, SipCredentials } from "../../src/core/types";
import { buildServerUrl, SipJsAdapter, tokenHeaderLines } from "../../src/sip/SipJsAdapter";
import { _resetWebRTCGlobalsForTests, reactNativeMediaStreamFactory } from "../../src/sip/media";
import { digestCreds, tokenCreds } from "../helpers/fakes";

const mockState: { uas: any[]; inviters: any[]; registerers: any[]; rejectInvite: boolean } = {
  uas: [],
  inviters: [],
  registerers: [],
  rejectInvite: false,
};

jest.mock("sip.js", () => {
  const SessionState = {
    Initial: "Initial",
    Establishing: "Establishing",
    Established: "Established",
    Terminating: "Terminating",
    Terminated: "Terminated",
  };
  class Emitter {
    listeners: ((s: string) => void)[] = [];
    addListener(fn: (s: string) => void) {
      this.listeners.push(fn);
    }
    removeListener(fn: (s: string) => void) {
      this.listeners = this.listeners.filter((l) => l !== fn);
    }
    emit(s: string) {
      this.listeners.forEach((l) => l(s));
    }
  }
  class BaseSession {
    state = "Initial";
    stateChange = new Emitter();
    request: any = { callId: "call-id-123" };
    sessionDescriptionHandler: any;
    sessionDescriptionHandlerOptionsReInvite: any;
    setState(s: string) {
      this.state = s;
      this.stateChange.emit(s);
    }
    bye = jest.fn(async () => this.setState("Terminated"));
    invite = jest.fn(async (_opts?: any) => {});
    info = jest.fn(async (_opts?: any) => {});
  }
  class Inviter extends BaseSession {
    inviteOptions: any;
    ua: any;
    target: any;
    options: any;
    constructor(ua: any, target: any, options: any) {
      super();
      this.ua = ua;
      this.target = target;
      this.options = options;
      mockState.inviters.push(this);
      this.invite = jest.fn(async (opts: any) => {
        this.inviteOptions = opts;
        if (mockState.rejectInvite) throw new Error("ws closed");
      });
    }
    cancel = jest.fn(async () => this.setState("Terminated"));
  }
  class Invitation extends BaseSession {
    remoteIdentity = { uri: { user: "+33123456789" }, displayName: "Marie" };
    constructor() {
      super();
      this.request = {
        callId: "in-1",
        headers: { "X-Call-Id": [{}], From: [{}] },
        getHeader: (n: string) => ({ "X-Call-Id": "push-1", From: "<sip:+33123456789@x>" })[n],
      };
    }
    accept = jest.fn(async () => {});
    reject = jest.fn(async (_opts?: any) => this.setState("Terminated"));
  }
  class UserAgent {
    static makeURI(s: string) {
      return /^sips?:[^ ]+@[^ ]+$/.test(s) ? { toString: () => s } : undefined;
    }
    options: any;
    constructor(options: any) {
      this.options = options;
      mockState.uas.push(this);
    }
    start = jest.fn(async () => this.options.delegate.onConnect());
    stop = jest.fn(async () => {});
    transport = { disconnect: jest.fn(async () => {}) };
    reconnect = jest.fn(async () => {});
    isConnected = jest.fn(() => true);
  }
  class Registerer {
    options: any;
    constructor(_ua: any, options: any) {
      this.options = options;
      mockState.registerers.push(this);
    }
    register = jest.fn(async () => {});
    unregister = jest.fn(async () => {});
  }
  const Web = { defaultSessionDescriptionHandlerFactory: jest.fn(() => "sdh-factory") };
  return { SessionState, Inviter, Invitation, UserAgent, Registerer, Web };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sip = require("sip.js");

function events() {
  return { onConnectionStateChange: jest.fn(), onIncomingInvite: jest.fn() };
}
function callEvents() {
  return { onRinging: jest.fn(), onAnswered: jest.fn(), onEnded: jest.fn() };
}

beforeEach(() => {
  mockState.uas.length = 0;
  mockState.inviters.length = 0;
  mockState.registerers.length = 0;
  mockState.rejectInvite = false;
  _resetWebRTCGlobalsForTests();
});

describe("token helpers", () => {
  it("builds a Bearer Authorization header by default", () => {
    expect(tokenHeaderLines(tokenCreds)).toEqual(["Authorization: Bearer jwt.token.value"]);
  });
  it("supports a custom header without scheme", () => {
    expect(tokenHeaderLines({ ...tokenCreds, headerName: "X-Auth-Token" })).toEqual(["X-Auth-Token: jwt.token.value"]);
  });
  it("supports an explicit scheme override", () => {
    expect(tokenHeaderLines({ ...tokenCreds, headerScheme: "" })).toEqual(["Authorization: jwt.token.value"]);
  });
  it("returns nothing for digest", () => {
    expect(tokenHeaderLines(digestCreds)).toEqual([]);
  });
  it("appends the token as a query parameter when configured", () => {
    expect(buildServerUrl({ ...tokenCreds, wsQueryParam: "access_token" })).toBe(
      "wss://sbc.example.com?access_token=jwt.token.value",
    );
    expect(buildServerUrl({ ...tokenCreds, wsServer: "wss://a/ws?x=1", wsQueryParam: "t" })).toBe(
      "wss://a/ws?x=1&t=jwt.token.value",
    );
    expect(buildServerUrl(digestCreds)).toBe(digestCreds.wsServer);
  });
});

describe("SipJsAdapter.connect", () => {
  it("creates a UserAgent with digest auth, ICE servers and RN media", async () => {
    const adapter = new SipJsAdapter();
    const ev = events();
    await adapter.connect({ ...digestCreds, iceServers: [{ urls: "turn:t.example.com", username: "u", credential: "c" }] }, ev);
    const ua = mockState.uas[0];
    expect(ua.options.uri.toString()).toBe("sip:alice@sip.example.com");
    expect(ua.options.authorizationUsername).toBe("alice");
    expect(ua.options.authorizationPassword).toBe("secret");
    expect(ua.options.transportOptions.server).toBe("wss://sbc.example.com:7443");
    expect(ua.options.sessionDescriptionHandlerFactoryOptions.peerConnectionConfiguration.iceServers).toEqual([
      { urls: "turn:t.example.com", username: "u", credential: "c" },
    ]);
    expect(sip.Web.defaultSessionDescriptionHandlerFactory).toHaveBeenCalled();
    expect(ev.onConnectionStateChange).toHaveBeenCalledWith(ConnectionState.CONNECTING);
    expect(ev.onConnectionStateChange).toHaveBeenCalledWith(ConnectionState.CONNECTED);
    expect(adapter.isConnected()).toBe(true);
    // Default STUN is replaced, no REGISTER unless asked.
    expect(mockState.registerers).toHaveLength(0);
  });

  it("uses anonymous identity and registers with token headers when requested", async () => {
    const adapter = new SipJsAdapter();
    await adapter.connect({ ...tokenCreds, register: true, registerExpires: 120 }, events());
    const ua = mockState.uas[0];
    expect(ua.options.uri.toString()).toBe("sip:anonymous@sip.example.com");
    expect(ua.options.authorizationPassword).toBeUndefined();
    expect(mockState.registerers[0].options).toEqual({
      expires: 120,
      extraHeaders: ["Authorization: Bearer jwt.token.value"],
    });
    expect(mockState.registerers[0].register).toHaveBeenCalled();
  });

  it("maps transport disconnects to connection states", async () => {
    const adapter = new SipJsAdapter();
    const ev = events();
    await adapter.connect(digestCreds, ev);
    const delegate = mockState.uas[0].options.delegate;
    delegate.onDisconnect(new Error("boom"));
    expect(ev.onConnectionStateChange).toHaveBeenLastCalledWith(ConnectionState.ERROR, expect.any(Error));
    delegate.onDisconnect();
    expect(ev.onConnectionStateChange).toHaveBeenLastCalledWith(ConnectionState.DISCONNECTED, undefined);
  });

  it("rejects an invalid identity", async () => {
    const adapter = new SipJsAdapter();
    await expect(adapter.connect({ ...digestCreds, domain: "bad domain" }, events())).rejects.toThrow(
      "Invalid SIP identity",
    );
  });

  it("reconnects and re-registers; disconnect closes the WebSocket at once, then stops the UA", async () => {
    const adapter = new SipJsAdapter();
    await adapter.connect({ ...digestCreds, register: true }, events());
    await adapter.reconnect();
    expect(mockState.uas[0].reconnect).toHaveBeenCalled();
    expect(mockState.registerers[0].register).toHaveBeenCalledTimes(2);
    const ua = mockState.uas[0];
    let closed!: () => void;
    ua.transport.disconnect.mockImplementationOnce(() => new Promise<void>((r) => (closed = r)));
    await adapter.disconnect(); // returns without waiting for the socket or the SBC
    expect(ua.transport.disconnect).toHaveBeenCalled();
    expect(mockState.registerers[0].unregister).not.toHaveBeenCalled(); // no un-REGISTER round trip
    expect(adapter.isConnected()).toBe(false);
    expect(ua.stop).not.toHaveBeenCalled();
    closed();
    await new Promise((r) => setImmediate(r));
    expect(ua.stop).toHaveBeenCalled();
    await expect(adapter.reconnect()).rejects.toThrow("Not connected");
  });
});

describe("SipJsAdapter.invite", () => {
  async function connected(creds: SipCredentials = digestCreds) {
    const adapter = new SipJsAdapter();
    await adapter.connect(creds, events());
    return adapter;
  }

  it("requires a connection", () => {
    const adapter = new SipJsAdapter();
    expect(() =>
      adapter.invite({ targetUri: "sip:1@x", extraHeaders: [], dtmfMode: "auto" }, callEvents()),
    ).toThrow("Not connected");
  });

  it("sends INVITE with token + custom headers and display name", async () => {
    const adapter = await connected(tokenCreds);
    const session = adapter.invite(
      { targetUri: "sip:+44@sip.example.com", extraHeaders: ["X-Client-State: abc"], fromDisplayName: "Noah Call", dtmfMode: "auto" },
      callEvents(),
    );
    const inviter = mockState.inviters[0];
    expect(inviter.target.toString()).toBe("sip:+44@sip.example.com");
    expect(inviter.options.extraHeaders).toEqual(["Authorization: Bearer jwt.token.value", "X-Client-State: abc"]);
    expect(inviter.options.params).toEqual({ fromDisplayName: "Noah Call" });
    expect(inviter.options.sessionDescriptionHandlerOptions.constraints).toEqual({ audio: true, video: false });
    expect(session.sipCallId).toBe("call-id-123");
  });

  it("rejects an invalid target", async () => {
    const adapter = await connected();
    expect(() => adapter.invite({ targetUri: "nope", extraHeaders: [], dtmfMode: "auto" }, callEvents())).toThrow(
      "Invalid target URI",
    );
  });

  it("reports ringing on 180/183, answered on Established, remote hangup on Terminated", async () => {
    const adapter = await connected();
    const ev = callEvents();
    adapter.invite({ targetUri: "sip:1@x", extraHeaders: [], dtmfMode: "auto" }, ev);
    const inviter = mockState.inviters[0];
    inviter.inviteOptions.requestDelegate.onProgress({ message: { statusCode: 100 } });
    expect(ev.onRinging).not.toHaveBeenCalled();
    inviter.inviteOptions.requestDelegate.onProgress({ message: { statusCode: 183 } });
    expect(ev.onRinging).toHaveBeenCalled();
    inviter.setState("Established");
    expect(ev.onAnswered).toHaveBeenCalled();
    inviter.setState("Terminated");
    expect(ev.onEnded).toHaveBeenCalledWith("remote_hangup", undefined);
    inviter.setState("Terminated");
    expect(ev.onEnded).toHaveBeenCalledTimes(1);
  });

  it("maps rejection status codes", async () => {
    const adapter = await connected();
    const ev = callEvents();
    adapter.invite({ targetUri: "sip:1@x", extraHeaders: [], dtmfMode: "auto" }, ev);
    const inviter = mockState.inviters[0];
    inviter.inviteOptions.requestDelegate.onReject({ message: { statusCode: 486 } });
    inviter.setState("Terminated");
    expect(ev.onEnded).toHaveBeenCalledWith("busy", 486);
  });

  it("reports failure when sending the INVITE fails", async () => {
    const adapter = await connected();
    const ev = callEvents();
    mockState.rejectInvite = true;
    adapter.invite({ targetUri: "sip:1@x", extraHeaders: [], dtmfMode: "auto" }, ev);
    await new Promise((r) => setImmediate(r));
    expect(ev.onEnded).toHaveBeenCalledWith("failed");
  });

  it("hangup cancels before answer and sends BYE after", async () => {
    const adapter = await connected();
    const ev = callEvents();
    const s1 = adapter.invite({ targetUri: "sip:1@x", extraHeaders: [], dtmfMode: "auto" }, ev);
    mockState.inviters[0].state = "Establishing";
    await s1.hangup();
    expect(mockState.inviters[0].cancel).toHaveBeenCalled();
    expect(ev.onEnded).toHaveBeenCalledWith("local_hangup", undefined);

    const ev2 = callEvents();
    const s2 = adapter.invite({ targetUri: "sip:2@x", extraHeaders: [], dtmfMode: "auto" }, ev2);
    mockState.inviters[1].setState("Established");
    await s2.hangup();
    expect(mockState.inviters[1].bye).toHaveBeenCalled();
    expect(ev2.onEnded).toHaveBeenCalledWith("local_hangup", undefined);
  });

  it("hangup sends BYE/CANCEL without waiting for the SBC to answer", async () => {
    const adapter = await connected();
    const s = adapter.invite({ targetUri: "sip:1@x", extraHeaders: [], dtmfMode: "auto" }, callEvents());
    const inviter = mockState.inviters[0];
    inviter.setState("Established");
    inviter.bye.mockImplementationOnce(() => new Promise(() => {})); // SBC never replies
    await s.hangup(); // must still resolve
    expect(inviter.bye).toHaveBeenCalled();
  });

  it("mutes audio senders, including after establishment", async () => {
    const adapter = await connected();
    const s = adapter.invite({ targetUri: "sip:1@x", extraHeaders: [], dtmfMode: "auto" }, callEvents());
    const track = { kind: "audio", enabled: true };
    s.setMuted(true); // no SDH yet: remembered
    const inviter = mockState.inviters[0];
    inviter.sessionDescriptionHandler = { peerConnection: { getSenders: () => [{ track }] } };
    inviter.setState("Established");
    expect(track.enabled).toBe(false);
    s.setMuted(false);
    expect(track.enabled).toBe(true);
  });

  it("holds via re-INVITE with hold SDH options", async () => {
    const adapter = await connected();
    const s = adapter.invite({ targetUri: "sip:1@x", extraHeaders: [], dtmfMode: "auto" }, callEvents());
    const inviter = mockState.inviters[0];
    await expect(s.setHold(true)).rejects.toThrow("not established");
    inviter.setState("Established");
    inviter.invite.mockImplementationOnce(async (opts: any) => opts.requestDelegate.onAccept());
    await s.setHold(true);
    expect(inviter.sessionDescriptionHandlerOptionsReInvite).toEqual({ hold: true });
    inviter.invite.mockImplementationOnce(async (opts: any) => opts.requestDelegate.onReject());
    await expect(s.setHold(false)).rejects.toThrow("Resume rejected");
  });

  it("sends DTMF via RTP when possible, else SIP INFO", async () => {
    const adapter = await connected();
    const s = adapter.invite({ targetUri: "sip:1@x", extraHeaders: [], dtmfMode: "auto" }, callEvents());
    const inviter = mockState.inviters[0];
    inviter.sessionDescriptionHandler = { sendDtmf: jest.fn(() => true) };
    await s.sendDtmf("5");
    expect(inviter.sessionDescriptionHandler.sendDtmf).toHaveBeenCalledWith("5");
    expect(inviter.info).not.toHaveBeenCalled();

    inviter.sessionDescriptionHandler.sendDtmf.mockReturnValue(false);
    await s.sendDtmf("12");
    expect(inviter.info).toHaveBeenCalledTimes(2);
    expect(inviter.info.mock.calls[0][0].requestOptions.body).toEqual({
      contentDisposition: "render",
      contentType: "application/dtmf-relay",
      content: "Signal=1\r\nDuration=160",
    });
  });

  it("rfc2833 mode throws when RTP DTMF is unavailable; info mode never tries RTP", async () => {
    const adapter = await connected();
    const rtp = adapter.invite({ targetUri: "sip:1@x", extraHeaders: [], dtmfMode: "rfc2833" }, callEvents());
    mockState.inviters[0].sessionDescriptionHandler = { sendDtmf: () => false };
    await expect(rtp.sendDtmf("1")).rejects.toThrow("RTP DTMF not supported");

    const info = adapter.invite({ targetUri: "sip:2@x", extraHeaders: [], dtmfMode: "info" }, callEvents());
    const sdh = { sendDtmf: jest.fn(() => true) };
    mockState.inviters[1].sessionDescriptionHandler = sdh;
    await info.sendDtmf("9");
    expect(sdh.sendDtmf).not.toHaveBeenCalled();
    expect(mockState.inviters[1].info).toHaveBeenCalled();
  });

  it("answer() is only valid for incoming calls", async () => {
    const adapter = await connected();
    const s = adapter.invite({ targetUri: "sip:1@x", extraHeaders: [], dtmfMode: "auto" }, callEvents());
    await expect(s.answer()).rejects.toThrow("Only incoming");
  });
});

describe("SipJsAdapter incoming", () => {
  it("surfaces INVITEs with caller, display name and lower-cased headers", async () => {
    const adapter = new SipJsAdapter();
    const ev = events();
    await adapter.connect(digestCreds, ev);
    const invitation = new sip.Invitation();
    mockState.uas[0].options.delegate.onInvite(invitation);
    const invite = ev.onIncomingInvite.mock.calls[0][0];
    expect(invite.from).toBe("+33123456789");
    expect(invite.fromDisplayName).toBe("Marie");
    expect(invite.headers["x-call-id"]).toBe("push-1");

    const cev = callEvents();
    const session = invite.createSession(cev, "auto");
    await session.answer();
    expect(invitation.accept).toHaveBeenCalled();
    await session.reject();
    expect(invitation.reject).toHaveBeenCalledWith({ statusCode: 603 });
    invitation.state = "Establishing";
    await session.hangup();
    expect(invitation.reject).toHaveBeenCalledTimes(2);
  });
});

describe("media", () => {
  it("requests audio-only from react-native-webrtc", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const webrtc = require("react-native-webrtc");
    await reactNativeMediaStreamFactory();
    expect(webrtc.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  });

  it("registers WebRTC globals once", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const webrtc = require("react-native-webrtc");
    webrtc.registerGlobals.mockClear();
    await new SipJsAdapter().connect(digestCreds, events());
    await new SipJsAdapter().connect(digestCreds, events());
    expect(webrtc.registerGlobals).toHaveBeenCalledTimes(1);
  });
});
