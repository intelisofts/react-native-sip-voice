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
}

export function DialPad({ onPress, entered = "", theme = defaultCallUITheme }: DialPadProps) {
  return (
    <View style={styles.container} testID="dial-pad">
      <Text style={[styles.entered, { color: theme.text }]} numberOfLines={1} testID="dial-pad-entered">
        {entered}
      </Text>
      <View style={styles.grid}>
        {KEYS.map(([digit, letters]) => (
          <Pressable
            key={digit}
            testID={`dial-key-${digit}`}
            accessibilityRole="button"
            accessibilityLabel={digit}
            onPress={() => onPress(digit)}
            style={({ pressed }) => [
              styles.key,
              { backgroundColor: pressed ? "rgba(255,255,255,0.35)" : theme.controlBackground },
            ]}
          >
            <Text style={[styles.digit, { color: theme.text }]}>{digit}</Text>
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
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", width: 276, gap: 18 },
  key: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  digit: { fontSize: 30, fontWeight: "400" },
  letters: { fontSize: 10, letterSpacing: 2, marginTop: -2 },
});
