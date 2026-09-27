import { Platform } from "react-native";

import type { Subscription } from "../core/observable";

export type AudioRoute = "earpiece" | "speaker" | "bluetooth" | "headset";

export type NativeEndReason = "failed" | "remoteEnded" | "unanswered" | "answeredElsewhere" | "declinedElsewhere";

export interface NativeCallUIConfig {
  /** Android call label. iOS 14+ always shows the app bundle display name in CallKit. */
  appName?: string;
  /** Show calls in the iOS Phone app's Recents. Default true. */
  includesCallsInRecents?: boolean;
  /** Asset name of a 40x40 template image for the CallKit button (iOS). */
  iconTemplateImageName?: string;
  /** Ringtone file bundled in the app (iOS: main bundle filename, Android: raw resource). */
  ringtoneSound?: string;
  supportsHolding?: boolean;
  supportsDTMF?: boolean;
  android?: {
    /** Notification channel name for ongoing calls. */
    channelName?: string;
    /** Drawable resource name for the ongoing-call notification icon. */
    notificationIcon?: string;
    /** Use self-managed ConnectionService (recommended). When false only a foreground service is used. Default true. */
    useConnectionService?: boolean;
  };
}

export interface NativeCallUIEvents {
  /** User answered from the system UI. */
  answerCall: { callId: string };
  /** User ended from the system UI (lock screen, car, watch, notification). */
  endCall: { callId: string };
  setMuted: { callId: string; muted: boolean };
  setHeld: { callId: string; held: boolean };
  playDTMF: { callId: string; digits: string };
  /** System accepted our outgoing call request (CXStartCallAction / onCreateOutgoingConnection). */
  startCall: { callId: string };
  audioSessionActivated: Record<string, never>;
  audioSessionDeactivated: Record<string, never>;
  audioRouteChanged: { route: AudioRoute; available: AudioRoute[] };
  voipPushToken: { token: string };
  /** A VoIP push was received and already reported to the system as an incoming call. */
  pushIncomingCall: { callId: string; payload: Record<string, unknown> };
}

/** Bridge to CallKit (iOS) and ConnectionService + foreground service (Android). */
export interface NativeCallUI {
  readonly isAvailable: boolean;
  configure(config: NativeCallUIConfig): Promise<void>;
  startOutgoingCall(callId: string, handle: string, displayName: string): Promise<void>;
  /** Remote is ringing. */
  reportOutgoingCallConnecting(callId: string): void;
  reportCallConnected(callId: string): void;
  reportIncomingCall(callId: string, handle: string, displayName: string): Promise<void>;
  /** Call ended by something other than the local user (remote hangup, failure). */
  reportCallEnded(callId: string, reason: NativeEndReason): void;
  /** Local user ended the call from the app UI; asks the system to end it. */
  endCall(callId: string): Promise<void>;
  setMuted(callId: string, muted: boolean): void;
  setHeld(callId: string, held: boolean): void;
  updateDisplay(callId: string, displayName: string, handle: string): void;
  setAudioRoute(route: AudioRoute): Promise<void>;
  getAudioRoutes(): Promise<{ current: AudioRoute; available: AudioRoute[] }>;
  registerVoipPush(): void;
  getVoipPushToken(): Promise<string | null>;
  getPendingPushCalls(): Promise<{ callId: string; payload: Record<string, unknown> }[]>;
  addListener<K extends keyof NativeCallUIEvents>(
    event: K,
    listener: (payload: NativeCallUIEvents[K]) => void,
  ): Subscription;
}

interface ExpoSipVoiceModule {
  configure(config: NativeCallUIConfig): Promise<void>;
  startOutgoingCall(callId: string, handle: string, displayName: string): Promise<void>;
  reportOutgoingCallConnecting(callId: string): void;
  reportCallConnected(callId: string): void;
  reportIncomingCall(callId: string, handle: string, displayName: string): Promise<void>;
  reportCallEnded(callId: string, reason: NativeEndReason): void;
  endCall(callId: string): Promise<void>;
  setMuted(callId: string, muted: boolean): void;
  setHeld(callId: string, held: boolean): void;
  updateDisplay(callId: string, displayName: string, handle: string): void;
  setAudioRoute(route: AudioRoute): Promise<void>;
  getAudioRoutes(): Promise<{ current: AudioRoute; available: AudioRoute[] }>;
  registerVoipPush(): void;
  getVoipPushToken(): Promise<string | null>;
  getPendingPushCalls(): Promise<{ callId: string; payload: Record<string, unknown> }[]>;
  addListener(event: string, listener: (payload: any) => void): { remove(): void };
}

function loadNativeModule(): ExpoSipVoiceModule | null {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireOptionalNativeModule } = require("expo") as typeof import("expo");
    return requireOptionalNativeModule<ExpoSipVoiceModule>("SipVoice");
  } catch {
    return null;
  }
}

/** Wraps the Expo native module. */
export class ExpoNativeCallUI implements NativeCallUI {
  readonly isAvailable = true;
  constructor(private readonly native: ExpoSipVoiceModule) {}

  configure(config: NativeCallUIConfig) {
    return this.native.configure(config);
  }
  startOutgoingCall(callId: string, handle: string, displayName: string) {
    return this.native.startOutgoingCall(callId, handle, displayName);
  }
  reportOutgoingCallConnecting(callId: string) {
    this.native.reportOutgoingCallConnecting(callId);
  }
  reportCallConnected(callId: string) {
    this.native.reportCallConnected(callId);
  }
  reportIncomingCall(callId: string, handle: string, displayName: string) {
    return this.native.reportIncomingCall(callId, handle, displayName);
  }
  reportCallEnded(callId: string, reason: NativeEndReason) {
    this.native.reportCallEnded(callId, reason);
  }
  endCall(callId: string) {
    return this.native.endCall(callId);
  }
  setMuted(callId: string, muted: boolean) {
    this.native.setMuted(callId, muted);
  }
  setHeld(callId: string, held: boolean) {
    this.native.setHeld(callId, held);
  }
  updateDisplay(callId: string, displayName: string, handle: string) {
    this.native.updateDisplay(callId, displayName, handle);
  }
  setAudioRoute(route: AudioRoute) {
    return this.native.setAudioRoute(route);
  }
  getAudioRoutes() {
    return this.native.getAudioRoutes();
  }
  registerVoipPush() {
    this.native.registerVoipPush();
  }
  getVoipPushToken() {
    return this.native.getVoipPushToken();
  }
  getPendingPushCalls() {
    return this.native.getPendingPushCalls();
  }
  addListener<K extends keyof NativeCallUIEvents>(
    event: K,
    listener: (payload: NativeCallUIEvents[K]) => void,
  ): Subscription {
    const sub = this.native.addListener(event, listener);
    return { unsubscribe: () => sub.remove() };
  }
}

/** Used where the native module is absent (tests, web, Expo Go). Every call is a no-op. */
export class NoopNativeCallUI implements NativeCallUI {
  readonly isAvailable = false;
  async configure() {}
  async startOutgoingCall() {}
  reportOutgoingCallConnecting() {}
  reportCallConnected() {}
  async reportIncomingCall() {}
  reportCallEnded() {}
  async endCall() {}
  setMuted() {}
  setHeld() {}
  updateDisplay() {}
  async setAudioRoute() {}
  async getAudioRoutes() {
    return { current: "earpiece" as AudioRoute, available: ["earpiece", "speaker"] as AudioRoute[] };
  }
  registerVoipPush() {}
  async getVoipPushToken() {
    return null;
  }
  async getPendingPushCalls() {
    return [];
  }
  addListener(): Subscription {
    return { unsubscribe() {} };
  }
}

let shared: NativeCallUI | undefined;

/** Process-wide native bridge (the native side is a singleton too). */
export function getNativeCallUI(): NativeCallUI {
  if (!shared) {
    const native = loadNativeModule();
    shared = native ? new ExpoNativeCallUI(native) : new NoopNativeCallUI();
  }
  return shared;
}
