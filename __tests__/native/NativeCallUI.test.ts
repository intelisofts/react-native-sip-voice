import { ExpoNativeCallUI, NoopNativeCallUI } from "../../src/native/NativeCallUI";

describe("NoopNativeCallUI", () => {
  it("is unavailable and every method is safe", async () => {
    const n = new NoopNativeCallUI();
    expect(n.isAvailable).toBe(false);
    await n.configure();
    await n.startOutgoingCall();
    n.reportOutgoingCallConnecting();
    n.reportCallConnected();
    await n.reportIncomingCall();
    n.reportCallEnded();
    await n.endCall();
    n.setMuted();
    n.setHeld();
    n.updateDisplay();
    await n.setAudioRoute();
    n.registerVoipPush();
    expect(await n.getAudioRoutes()).toEqual({ current: "earpiece", available: ["earpiece", "speaker"] });
    expect(await n.getVoipPushToken()).toBeNull();
    expect(await n.getPendingPushCalls()).toEqual([]);
    n.addListener().unsubscribe();
  });
});

describe("ExpoNativeCallUI", () => {
  function makeNative() {
    const remove = jest.fn();
    return {
      remove,
      module: {
        configure: jest.fn(async () => {}),
        startOutgoingCall: jest.fn(async () => {}),
        reportOutgoingCallConnecting: jest.fn(),
        reportCallConnected: jest.fn(),
        reportIncomingCall: jest.fn(async () => {}),
        reportCallEnded: jest.fn(),
        endCall: jest.fn(async () => {}),
        setMuted: jest.fn(),
        setHeld: jest.fn(),
        updateDisplay: jest.fn(),
        setAudioRoute: jest.fn(async () => {}),
        getAudioRoutes: jest.fn(async () => ({ current: "speaker" as const, available: ["speaker" as const] })),
        registerVoipPush: jest.fn(),
        getVoipPushToken: jest.fn(async () => "tok"),
        getPendingPushCalls: jest.fn(async () => []),
        addListener: jest.fn(() => ({ remove })),
      },
    };
  }

  it("forwards every call to the native module", async () => {
    const { module, remove } = makeNative();
    const n = new ExpoNativeCallUI(module);
    expect(n.isAvailable).toBe(true);
    await n.configure({ appName: "X" });
    await n.startOutgoingCall("id", "+1", "Bob");
    n.reportOutgoingCallConnecting("id");
    n.reportCallConnected("id");
    await n.reportIncomingCall("id", "+1", "Bob");
    n.reportCallEnded("id", "failed");
    await n.endCall("id");
    n.setMuted("id", true);
    n.setHeld("id", false);
    n.updateDisplay("id", "Bob", "+1");
    await n.setAudioRoute("speaker");
    n.registerVoipPush();
    expect(await n.getAudioRoutes()).toEqual({ current: "speaker", available: ["speaker"] });
    expect(await n.getVoipPushToken()).toBe("tok");
    expect(await n.getPendingPushCalls()).toEqual([]);

    expect(module.configure).toHaveBeenCalledWith({ appName: "X" });
    expect(module.startOutgoingCall).toHaveBeenCalledWith("id", "+1", "Bob");
    expect(module.reportCallEnded).toHaveBeenCalledWith("id", "failed");
    expect(module.setMuted).toHaveBeenCalledWith("id", true);
    expect(module.setHeld).toHaveBeenCalledWith("id", false);
    expect(module.updateDisplay).toHaveBeenCalledWith("id", "Bob", "+1");
    expect(module.setAudioRoute).toHaveBeenCalledWith("speaker");

    const listener = jest.fn();
    const sub = n.addListener("endCall", listener);
    expect(module.addListener).toHaveBeenCalledWith("endCall", listener);
    sub.unsubscribe();
    expect(remove).toHaveBeenCalled();
  });
});

describe("getNativeCallUI", () => {
  it("falls back to the no-op bridge when the native module is missing", () => {
    jest.isolateModules(() => {
      jest.doMock("expo", () => ({ requireOptionalNativeModule: () => null }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getNativeCallUI } = require("../../src/native/NativeCallUI");
      const n = getNativeCallUI();
      expect(n.isAvailable).toBe(false);
      expect(getNativeCallUI()).toBe(n);
    });
  });

  it("wraps the native module when present", () => {
    jest.isolateModules(() => {
      jest.doMock("expo", () => ({ requireOptionalNativeModule: () => ({ addListener: jest.fn() }) }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getNativeCallUI } = require("../../src/native/NativeCallUI");
      expect(getNativeCallUI().isAvailable).toBe(true);
    });
  });
});
