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

export { getNativeCallCoordinator, NativeCallCoordinator } from "./native/NativeCallCoordinator";
export type { NativeCallUIConfig } from "./native/NativeCallCoordinator";
export { loadCallSystem } from "./native/callSystem";
export type { CallSystem } from "./native/callSystem";

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
