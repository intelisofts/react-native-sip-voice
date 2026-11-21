import { AppRegistry, Platform } from "react-native";

import { loadNativeModule, type NativeCallSnapshot } from "./NativeCallUI";

/** Same name as SipVoiceCallTaskService.TASK (Android). */
export const INCOMING_CALL_TASK = "SipVoiceIncomingCall";

interface CallSource {
  getCalls?(): Promise<NativeCallSnapshot[]>;
  addListener(event: "callStateChanged", listener: () => void): { remove(): void };
}

/** Resolves once the native side has no incoming call left (ringing, connecting or in progress). */
export function untilIncomingCallsEnd(native: CallSource | null): Promise<void> {
  return new Promise((resolve) => {
    if (!native?.getCalls) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sub.remove();
      resolve();
    };
    const check = () =>
      native.getCalls!()
        .then((calls) => { if (!calls.some((c) => !c.outgoing)) finish(); })
        .catch(finish);
    const sub = native.addListener("callStateChanged", () => void check());
    void check();
  });
}

/**
 * Registers the Android Headless JS task (see SipVoiceCallTaskService): while it runs React Native keeps JS timers and
 * fetch going with the native call screen in front. React does not render the app's screens then, so
 * `onIncomingCall` must start, outside React, what registers with the SBC and takes the call (the shared
 * coordinator, see getNativeCallCoordinator). Call it from the app's entry file (index.js), as React Native requires
 * for headless tasks: native starts the task as soon as the bundle has run, before screens load.
 * No-op on iOS, where CallKit and PushKit keep the app (and its screens) running.
 */
export function registerIncomingCallTask(onIncomingCall?: () => void | Promise<void>): void {
  if (Platform.OS !== "android") return;
  AppRegistry.registerHeadlessTask(INCOMING_CALL_TASK, () => () => runIncomingCallTask(
    loadNativeModule() as unknown as CallSource | null, onIncomingCall));
}

/**
 * The task: starts what takes the call outside React (no screen renders behind the native call screen), then runs
 * until the call is over. A failing start does not end the task: the app's screens can still take the call later.
 */
export async function runIncomingCallTask(native: CallSource | null, onIncomingCall?: () => void | Promise<void>) {
  try {
    await onIncomingCall?.();
  } catch (e) {
    console.warn("[SipVoice] incoming-call task start failed", e);
  }
  await untilIncomingCallsEnd(native);
}
