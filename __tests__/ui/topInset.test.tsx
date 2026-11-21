import { renderHook } from "@testing-library/react-native";
import { Platform, StatusBar } from "react-native";

import { useTopInset } from "../../src/ui/hooks/useTopInset";
const mockInsets = jest.fn();
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => mockInsets() }));

afterEach(() => {
  (Platform as any).OS = "ios";
  (StatusBar as any).currentHeight = undefined;
});

it("uses the safe-area top when it is known", async () => {
  mockInsets.mockReturnValue({ top: 47 });
  (Platform as any).OS = "ios";
  const { result } = await renderHook(() => useTopInset());
  expect(result.current).toBe(47);
});

it("on Android falls back to the status bar height when the modal reports no inset", async () => {
  mockInsets.mockReturnValue({ top: 0 });
  (Platform as any).OS = "android";
  (StatusBar as any).currentHeight = 36;
  const { result } = await renderHook(() => useTopInset());
  expect(result.current).toBe(36);
});

it("on Android never goes below a floor that clears a punch-hole camera, even when nothing is reported", async () => {
  mockInsets.mockReturnValue({ top: 0 });
  (Platform as any).OS = "android";
  (StatusBar as any).currentHeight = 0;
  const { result } = await renderHook(() => useTopInset());
  expect(result.current).toBeGreaterThanOrEqual(32);
});

it("never goes below the reported inset (a tall camera cut-out wins over the status bar)", async () => {
  mockInsets.mockReturnValue({ top: 52 });
  (Platform as any).OS = "android";
  (StatusBar as any).currentHeight = 36;
  const { result } = await renderHook(() => useTopInset());
  expect(result.current).toBe(52);
});
