import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";

import type { SipVoiceClient } from "../core/SipVoiceClient";
import { loadCallSystem, type CallSystem } from "../native/callSystem";
import {
  getNativeCallCoordinator,
  type NativeCallCoordinator,
  type NativeCallUIConfig,
} from "../native/NativeCallCoordinator";

export interface SipVoiceContextValue {
  client: SipVoiceClient;
  /** The system call layer (CallKit / Core-Telecom), or null where it is not available. */
  system: CallSystem | null;
  coordinator: NativeCallCoordinator | null;
}

const SipVoiceContext = createContext<SipVoiceContextValue | null>(null);

export interface SipVoiceProviderProps {
  client: SipVoiceClient;
  /** System call options. Ignored when the client was created with `nativeCallUI: false`. */
  nativeConfig?: NativeCallUIConfig;
  /** Override the system call layer (tests). `null` runs without one. */
  callSystem?: CallSystem | null;
  /** Recover the SBC connection when the app returns to the foreground. Default true. */
  reconnectOnForeground?: boolean;
  children: React.ReactNode;
}

export function SipVoiceProvider({
  client,
  nativeConfig,
  callSystem,
  reconnectOnForeground = true,
  children,
}: SipVoiceProviderProps) {
  const system = useMemo(() => (callSystem === undefined ? loadCallSystem() : callSystem), [callSystem]);
  const coordinatorRef = useRef<NativeCallCoordinator | null>(null);
  if (!coordinatorRef.current) coordinatorRef.current = getNativeCallCoordinator(client, system);
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
    () => ({ client, system, coordinator: coordinatorRef.current }),
    [client, system],
  );
  return <SipVoiceContext.Provider value={value}>{children}</SipVoiceContext.Provider>;
}

export function useSipVoice(): SipVoiceContextValue {
  const ctx = useContext(SipVoiceContext);
  if (!ctx) throw new Error("useSipVoice must be used inside <SipVoiceProvider>");
  return ctx;
}
