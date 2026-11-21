import { Platform } from "react-native";

import { loadNativeModule, type NativeCallSnapshot } from "./NativeCallUI";

const native = () => (Platform.OS === "android" ? loadNativeModule() : null);

/**
 * Android settings a calling app needs so an incoming call rings full screen like CallKit on iOS.
 * Every function is safe to call on iOS or without the native module: it reports "nothing to fix".
 */
export const androidCallSetup = {
  /** Android 14+: full-screen incoming calls. Off means a locked phone only shows a heads-up notification. */
  canUseFullScreenIntent: (): boolean => native()?.canUseFullScreenIntent?.() ?? true,
  openFullScreenIntentSettings: (): void => native()?.openFullScreenIntentSettings?.(),
  /** Battery optimisation on: some phones delay or drop the wake-up push for an incoming call. */
  isIgnoringBatteryOptimizations: (): boolean => native()?.isIgnoringBatteryOptimizations?.() ?? true,
  openBatteryOptimizationSettings: (): void => native()?.openBatteryOptimizationSettings?.(),
  /** This native build plays the caller's ring-back itself (older Android builds left it to the app). */
  hasNativeRingback: (): boolean => typeof native()?.startRingback === "function",
  /** Live calls as the native side tracks them (also while JS was not running). */
  getCalls: async (): Promise<NativeCallSnapshot[]> => (await native()?.getCalls?.()) ?? [],
};
