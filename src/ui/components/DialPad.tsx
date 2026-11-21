import { Pressable, StyleSheet, Text, View } from "react-native";

import { CallUITheme, defaultCallUITheme } from "../theme";

const KEYS: [string, string][] = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
];

export interface DialPadProps {
  onPress: (digit: string) => void;
  /** Digits sent so far, shown above the pad. */
  entered?: string;
  theme?: CallUITheme;
  /** Key diameter in points. The caller shrinks it on short screens so the pad never overlaps other content. */
  keySize?: number;
}

export const DEFAULT_KEY_SIZE = 76;

export function DialPad({ onPress, entered = "", theme = defaultCallUITheme, keySize = DEFAULT_KEY_SIZE }: DialPadProps) {
  const gap = Math.round((keySize * 18) / DEFAULT_KEY_SIZE);
  return (
    <View style={styles.container} testID="dial-pad">
      {/* Head-truncate so the newest digits stay visible when the entry is longer than the line. */}
      <Text style={[styles.entered, { color: theme.text }]} numberOfLines={1} ellipsizeMode="head" testID="dial-pad-entered">
        {entered}
      </Text>
      <View style={[styles.grid, { width: keySize * 3 + gap * 2, gap }]}>
        {KEYS.map(([digit, letters]) => (
          <Pressable
            key={digit}
            testID={`dial-key-${digit}`}
            accessibilityRole="button"
            accessibilityLabel={digit}
            onPress={() => onPress(digit)}
            style={({ pressed }) => [
              styles.key,
              {
                width: keySize,
                height: keySize,
                borderRadius: keySize / 2,
                backgroundColor: pressed ? "rgba(255,255,255,0.35)" : theme.controlBackground,
              },
            ]}
          >
            <Text style={[styles.digit, { color: theme.text, fontSize: Math.round((keySize * 30) / DEFAULT_KEY_SIZE) }]}>
              {digit}
            </Text>
            {!!letters && <Text style={[styles.letters, { color: theme.textSecondary }]}>{letters}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", width: "100%" },
  entered: { fontSize: 30, fontWeight: "300", minHeight: 40, marginBottom: 12, letterSpacing: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  key: { alignItems: "center", justifyContent: "center" },
  digit: { fontWeight: "400" },
  letters: { fontSize: 10, letterSpacing: 2, marginTop: -2 },
});
