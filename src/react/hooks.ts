import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { Call } from "../core/Call";
import type { ReadonlyValueStream } from "../core/observable";
import { CallState, ConnectionState } from "../core/types";
import { isSpeakerRoute } from "../native/callSystem";
import { useSipVoice } from "./SipVoiceProvider";

const NULL_STREAM: ReadonlyValueStream<any> = {
  value: null,
  subscribe: () => ({ unsubscribe() {} }),
};

/** Subscribe a component to a {@link ReadonlyValueStream}. */
export function useStream<T>(stream: ReadonlyValueStream<T> | null | undefined): T {
  const s = stream ?? (NULL_STREAM as ReadonlyValueStream<T>);
  const subscribe = useCallback(
    (onChange: () => void) => {
      let first = true;
      const sub = s.subscribe(() => {
        // ValueStream emits synchronously on subscribe; skip that one.
        if (first) return;
        onChange();
      });
      first = false;
      return () => sub.unsubscribe();
    },
    [s],
  );
  return useSyncExternalStore(subscribe, () => s.value, () => s.value);
}

export function useConnectionState(): ConnectionState {
  return useStream(useSipVoice().client.connectionState$);
}

export function useActiveCall(): Call | null {
  return useStream(useSipVoice().client.activeCall$);
}

export function useCalls(): Call[] {
  return useStream(useSipVoice().client.calls$);
}

export interface CallSnapshot {
  state: CallState | null;
  isMuted: boolean;
  isOnHold: boolean;
}

/** Reactive state of one call. */
export function useCallState(call: Call | null | undefined): CallSnapshot {
  const state = useStream<CallState | null>(call?.callState$ ?? null);
  const isMuted = useStream<boolean | null>(call?.isMuted$ ?? null) ?? false;
  const isOnHold = useStream<boolean | null>(call?.isOnHold$ ?? null) ?? false;
  return { state, isMuted, isOnHold };
}

/** Seconds since answer, ticking once per second while the call is live. */
export function useCallDuration(call: Call | null | undefined, intervalMs = 1000): number {
  const { state } = useCallState(call);
  const [seconds, setSeconds] = useState(() => call?.durationSeconds ?? 0);
  useEffect(() => {
    if (!call) {
      setSeconds(0);
      return;
    }
    setSeconds(call.durationSeconds);
    if (state !== CallState.ACTIVE && state !== CallState.HELD && state !== CallState.RECONNECTING) return;
    const id = setInterval(() => setSeconds(call.durationSeconds), intervalMs);
    return () => clearInterval(id);
  }, [call, state, intervalMs]);
  return seconds;
}

/**
 * Whether the call plays through the loudspeaker, and a toggle. Off routes to the earpiece, or to a connected
 * Bluetooth or wired headset, as the system decides.
 */
export function useAudioRoute() {
  const { system } = useSipVoice();
  const [isSpeakerOn, setSpeakerOn] = useState(() => {
    try {
      return isSpeakerRoute(system?.getAudioSession().currentRoute);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!system) return;
    const sub = system.addAudioRouteChangedListener((e) => setSpeakerOn(isSpeakerRoute(e.currentRoute)));
    return () => sub.remove();
  }, [system]);

  const setSpeaker = useCallback(
    (on: boolean) => {
      setSpeakerOn(on);
      system?.setAudioSessionPortOverride(on);
    },
    [system],
  );

  const toggleSpeaker = useCallback(() => setSpeaker(!isSpeakerOn), [isSpeakerOn, setSpeaker]);

  return { isSpeakerOn, setSpeaker, toggleSpeaker };
}
