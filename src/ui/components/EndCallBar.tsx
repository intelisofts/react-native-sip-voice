import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CallUITheme, defaultCallUITheme } from "../theme";

export interface EndCallBarProps {
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  /** Hang-up icon (rotated like a phone that is ending). Use "close" for a dismiss. */
  icon?: "call" | "close";
  /** "danger" (grey) for Hide after an error. The end button is red. */
  tone?: "neutral" | "danger";
  theme?: CallUITheme;
}

/**
 * The end / hide action: a round red button with a caption under it, as in the call screen mockup.
 * Hide after an error is grey, so it does not read as ending a live call.
 */
export function EndCallBar({ label, onPress, testID, disabled = false, icon = "call", tone = "neutral", theme = defaultCallUITheme }: EndCallBarProps) {
  const danger = tone === "danger";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, { opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}
    >
      <View style={[styles.circle, { backgroundColor: danger ? "#3A3D46" : theme.danger }]}>
        <Ionicons name={icon} size={24} color="#FFFFFF" style={icon === "call" ? styles.hangup : undefined} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  circle: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  hangup: { transform: [{ rotate: "135deg" }] },
  label: { marginTop: 6, fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.85)" },
});
