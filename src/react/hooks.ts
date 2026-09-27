import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { Call } from "../core/Call";
import type { ReadonlyValueStream } from "../core/observable";
import { CallState, ConnectionState } from "../core/types";
import type { AudioRoute } from "../native/NativeCallUI";
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

/** Current audio route plus a setter (speaker / earpiece / Bluetooth). */
export function useAudioRoute() {
  const { native } = useSipVoice();
  const [route, setRouteState] = useState<AudioRoute>("earpiece");
  const [available, setAvailable] = useState<AudioRoute[]>(["earpiece", "speaker"]);

  useEffect(() => {
    let alive = true;
    native
      .getAudioRoutes()
      .then((r) => {
        if (!alive) return;
        setRouteState(r.current);
        setAvailable(r.available);
      })
      .catch(() => {});
    const sub = native.addListener("audioRouteChanged", (r) => {
      setRouteState(r.route);
      setAvailable(r.available);
    });
    return () => {
      alive = false;
      sub.unsubscribe();
    };
  }, [native]);

  const setRoute = useCallback(
    async (next: AudioRoute) => {
      setRouteState(next);
      await native.setAudioRoute(next);
    },
    [native],
  );

  const toggleSpeaker = useCallback(
    () => setRoute(route === "speaker" ? (available.includes("bluetooth") ? "bluetooth" : "earpiece") : "speaker"),
    [route, available, setRoute],
  );

  return { route, available, setRoute, toggleSpeaker, isSpeakerOn: route === "speaker" };
}
