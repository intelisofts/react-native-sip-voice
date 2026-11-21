export { Call } from "./core/Call";
export type { CallInit, AnswerGate } from "./core/Call";
export { SipVoiceClient } from "./core/SipVoiceClient";
export type { SipVoiceClientDeps, SipVoiceClientEvents, PendingPushCall } from "./core/SipVoiceClient";
export * from "./core/types";
export { ValueStream, EventEmitter } from "./core/observable";
export type { ReadonlyValueStream, Subscription } from "./core/observable";
export type { CallSession, CallSessionEvents } from "./core/session";
export type {
  SignalingAdapter,
  SignalingAdapterEvents,
  OutgoingInviteRequest,
  IncomingInvite,
} from "./core/signaling";
export { formatDuration, normalizePhoneNumber, toSipUri, uuidv4 } from "./core/utils";

export { getNativeCallUI, NoopNativeCallUI } from "./native/NativeCallUI";
export type {
  AudioRoute,
  NativeCallUI,
  NativeCallUIConfig,
  NativeCallUIEvents,
  NativeEndReason,
} from "./native/NativeCallUI";
export { getNativeCallCoordinator, NativeCallCoordinator } from "./native/NativeCallCoordinator";
export { androidCallSetup } from "./native/androidCallSetup";
export { registerIncomingCallTask } from "./native/incomingCallTask";
export type { NativeCallSnapshot } from "./native/NativeCallUI";

export { SipVoiceProvider, useSipVoice } from "./react/SipVoiceProvider";
export type { SipVoiceProviderProps, SipVoiceContextValue } from "./react/SipVoiceProvider";
export {
  useActiveCall,
  useAudioRoute,
  useCallDuration,
  useCallState,
  useCalls,
  useConnectionState,
  useStream,
} from "./react/hooks";
export type { CallSnapshot } from "./react/hooks";

export { SipJsAdapter, SipJsCallSession, buildServerUrl, tokenHeaderLines } from "./sip/SipJsAdapter";
export type { SipJsAdapterOptions } from "./sip/SipJsAdapter";
