import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";

import type { SipVoiceClient } from "../core/SipVoiceClient";
import { NativeCallCoordinator } from "../native/NativeCallCoordinator";
import { getNativeCallUI, NativeCallUI, NativeCallUIConfig } from "../native/NativeCallUI";

export interface SipVoiceContextValue {
  client: SipVoiceClient;
  native: NativeCallUI;
  coordinator: NativeCallCoordinator | null;
}

const SipVoiceContext = createContext<SipVoiceContextValue | null>(null);

export interface SipVoiceProviderProps {
  client: SipVoiceClient;
  /** CallKit / ConnectionService options. Ignored when the client was created with `nativeCallUI: false`. */
  nativeConfig?: NativeCallUIConfig;
  /** Override the native bridge (tests). */
  native?: NativeCallUI;
  /** Recover the SBC connection when the app returns to the foreground. Default true. */
  reconnectOnForeground?: boolean;
  children: React.ReactNode;
}

export function SipVoiceProvider({
  client,
  nativeConfig,
  native: nativeOverride,
  reconnectOnForeground = true,
  children,
}: SipVoiceProviderProps) {
  const native = useMemo(() => nativeOverride ?? getNativeCallUI(), [nativeOverride]);
  const coordinatorRef = useRef<NativeCallCoordinator | null>(null);
  if (!coordinatorRef.current && client.nativeCallUIEnabled) {
    coordinatorRef.current = new NativeCallCoordinator(client, native);
  }
  const configRef = useRef(nativeConfig);

  useEffect(() => {
    const coordinator = coordinatorRef.current;
    coordinator?.start(configRef.current);
    return () => coordinator?.stop();
  }, []);

  useEffect(() => {
    if (!reconnectOnForeground) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") client.handleNetworkChange().catch(() => {});
    });
    return () => sub.remove();
  }, [client, reconnectOnForeground]);

  const value = useMemo<SipVoiceContextValue>(
    () => ({ client, native, coordinator: coordinatorRef.current }),
    [client, native],
  );
  return <SipVoiceContext.Provider value={value}>{children}</SipVoiceContext.Provider>;
}

export function useSipVoice(): SipVoiceContextValue {
  const ctx = useContext(SipVoiceContext);
  if (!ctx) throw new Error("useSipVoice must be used inside <SipVoiceProvider>");
  return ctx;
}
