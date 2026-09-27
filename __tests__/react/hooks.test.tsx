import { act, renderHook } from "@testing-library/react-native";
import React from "react";
import { AppState } from "react-native";

import { SipVoiceClient } from "../../src/core/SipVoiceClient";
import { CallState, ConnectionState } from "../../src/core/types";
import {
  useActiveCall,
  useAudioRoute,
  useCallDuration,
  useCallState,
  useCalls,
  useConnectionState,
} from "../../src/react/hooks";
import { SipVoiceProvider, useSipVoice } from "../../src/react/SipVoiceProvider";
import { digestCreds, FakeAdapter, FakeNative, flush } from "../helpers/fakes";

const liveClients: SipVoiceClient[] = [];
afterEach(async () => {
  await Promise.all(liveClients.splice(0).map((c) => c.destroy()));
});

function setup(clientOptions: ConstructorParameters<typeof SipVoiceClient>[0] = {}) {
  const adapter = new FakeAdapter();
  const client = new SipVoiceClient(clientOptions, { adapter });
  liveClients.push(client);
  const native = new FakeNative();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SipVoiceProvider client={client} native={native} nativeConfig={{ appName: "Test" }}>
      {children}
    </SipVoiceProvider>
  );
  return { adapter, client, native, wrapper };
}

afterEach(() => jest.useRealTimers());

describe("SipVoiceProvider", () => {
  it("throws outside the provider", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(renderHook(() => useSipVoice())).rejects.toThrow("inside <SipVoiceProvider>");
    (console.error as jest.Mock).mockRestore();
  });

  it("starts the native coordinator with the config", async () => {
    const { wrapper, native, client } = setup();
    const { result } = await renderHook(() => useSipVoice(), { wrapper });
    await act(flush);
    expect(result.current.client).toBe(client);
    expect(result.current.coordinator).not.toBeNull();
    expect(native.configure).toHaveBeenCalledWith({ appName: "Test" });
  });

  it("skips the coordinator when nativeCallUI is disabled", async () => {
    const { wrapper } = setup({ nativeCallUI: false });
    const { result } = await renderHook(() => useSipVoice(), { wrapper });
    expect(result.current.coordinator).toBeNull();
  });

  it("recovers the connection when the app returns to the foreground", async () => {
    const listeners: ((s: string) => void)[] = [];
    const original = AppState.addEventListener;
    AppState.addEventListener = jest.fn((_e: any, l: any) => {
      listeners.push(l);
      return { remove: jest.fn() };
    }) as any;
    try {
      const { wrapper, client } = setup();
      const spy = jest.spyOn(client, "handleNetworkChange");
      await renderHook(() => null, { wrapper });
      listeners.forEach((l) => l("active"));
      expect(spy).toHaveBeenCalled();
    } finally {
      AppState.addEventListener = original;
    }
  });
});

describe("hooks", () => {
  it("useConnectionState follows the client", async () => {
    const { wrapper, client } = setup();
    const { result } = await renderHook(() => useConnectionState(), { wrapper });
    expect(result.current).toBe(ConnectionState.DISCONNECTED);
    await act(() => client.connect(digestCreds));
    expect(result.current).toBe(ConnectionState.CONNECTED);
  });

  it("useActiveCall / useCalls / useCallState update with the call", async () => {
    const { wrapper, client } = setup();
    await client.connect(digestCreds);
    const { result } = await renderHook(
      () => {
        const call = useActiveCall();
        return { call, calls: useCalls(), snap: useCallState(call) };
      },
      { wrapper },
    );
    expect(result.current.call).toBeNull();
    expect(result.current.snap.state).toBeNull();

    let call: any;
    await act(async () => {
      call = await client.newCall({ destination: "+1" });
    });
    expect(result.current.call).toBe(call);
    expect(result.current.calls).toHaveLength(1);
    expect(result.current.snap.state).toBe(CallState.CONNECTING);

    await act(() => call.onAnswered());
    expect(result.current.snap.state).toBe(CallState.ACTIVE);
    await act(() => call.mute());
    expect(result.current.snap.isMuted).toBe(true);
    await act(() => call.hold());
    expect(result.current.snap).toEqual({ state: CallState.HELD, isMuted: true, isOnHold: true });
  });

  it("useCallDuration ticks while active and stops when ended", async () => {
    jest.useFakeTimers({ now: 0 });
    const { wrapper, client } = setup();
    await client.connect(digestCreds);
    const call = await client.newCall({ destination: "+1" });
    const { result } = await renderHook(() => useCallDuration(call), { wrapper });
    expect(result.current).toBe(0);
    await act(() => call.onAnswered());
    await act(() => jest.advanceTimersByTime(3000));
    expect(result.current).toBe(3);
    await act(() => call.onEnded("remote_hangup"));
    await act(() => jest.advanceTimersByTime(5000));
    expect(result.current).toBe(3);
  });

  it("useCallDuration returns 0 without a call", async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(() => useCallDuration(null), { wrapper });
    expect(result.current).toBe(0);
  });

  it("useAudioRoute loads routes, toggles speaker and follows native changes", async () => {
    const { wrapper, native } = setup();
    native.getAudioRoutes.mockResolvedValueOnce({ current: "earpiece", available: ["earpiece", "speaker", "bluetooth"] as any });
    const { result } = await renderHook(() => useAudioRoute(), { wrapper });
    await act(flush);
    expect(result.current.available).toContain("bluetooth");

    await act(() => result.current.toggleSpeaker());
    expect(native.setAudioRoute).toHaveBeenLastCalledWith("speaker");
    expect(result.current.isSpeakerOn).toBe(true);

    // Toggling off prefers Bluetooth when connected.
    await act(() => result.current.toggleSpeaker());
    expect(native.setAudioRoute).toHaveBeenLastCalledWith("bluetooth");

    await act(() => native.emit("audioRouteChanged", { route: "speaker", available: ["earpiece", "speaker"] }));
    expect(result.current.route).toBe("speaker");
    expect(result.current.available).toEqual(["earpiece", "speaker"]);
  });
});
