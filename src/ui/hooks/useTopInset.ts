import { Platform, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Lowest top space on Android. Punch-hole cameras are taller than the status bar and some phones report no inset. */
export const ANDROID_MIN_TOP = 32;

/**
 * Space to keep clear at the top of a full-screen call page (status bar, notch, camera cut-out).
 * The call UI lives in a Modal, which is its own window on Android: the insets read from outside it can come
 * back as 0 there, and with edge-to-edge drawing the status bar height can read 0 too. That put the country
 * pill behind the camera. The result is never below the reported inset, the status bar height, or on Android a
 * floor that clears a typical punch-hole camera.
 */
export function useTopInset(): number {
  const { top } = useSafeAreaInsets();
  const statusBar = Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0;
  const floor = Platform.OS === "android" ? ANDROID_MIN_TOP : 0;
  return Math.max(top, statusBar, floor);
}
