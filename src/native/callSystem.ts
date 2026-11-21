import type * as Telecom from "expo-callkit-telecom";

/**
 * The system call layer the library uses: CallKit (iOS) and Jetpack Core-Telecom (Android) through
 * expo-callkit-telecom, which also owns VoIP push (PushKit / FCM), the system call UI and the call audio session.
 * Narrowed to what the library calls, so tests can supply a fake.
 */
export type CallSystem = Pick<
  typeof Telecom,
  | "startOutgoingCall"
  | "reportIncomingCall"
  | "answerCall"
  | "endCall"
  | "reportCallEnded"
  | "reportOutgoingCallConnected"
  | "fulfillIncomingCallConnected"
  | "failIncomingCallConnected"
  | "setMuted"
  | "setHeld"
  | "getActiveCallSession"
  | "addCallSessionAddedListener"
  | "addCallSessionRemovedListener"
  | "addCallAnsweredListener"
  | "addCallEndedListener"
  | "addSetMutedActionListener"
  | "addSetHeldActionListener"
  | "addDTMFListener"
  | "getAudioSession"
  | "setAudioSessionPortOverride"
  | "addAudioRouteChangedListener"
  | "registerVoIPPush"
  | "getVoIPPushToken"
  | "addVoIPPushTokenUpdatedListener"
>;

export type { CallEndedReason, CallSession, IncomingCallEvent, AudioRoute as SystemAudioRoute } from "expo-callkit-telecom";

let cached: CallSystem | null | undefined;

/** expo-callkit-telecom, or null where its native module is missing (web, tests, Expo Go). */
export function loadCallSystem(): CallSystem | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module
    cached = require("expo-callkit-telecom") as CallSystem;
  } catch {
    cached = null;
  }
  return cached;
}

/** Whether the current route plays through the loudspeaker. */
export function isSpeakerRoute(route: Telecom.AudioRoute | undefined): boolean {
  return !!route?.outputs.some((o) => o.portType === "builtInSpeaker");
}
