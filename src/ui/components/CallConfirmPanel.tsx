import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CallUITheme, defaultCallUITheme } from "../theme";

export interface CallConfirmPanelProps {
  title: string;
  /** Big figure, e.g. "$0.05 / min". */
  highlight?: string;
  /** Label/value rows under the highlight. */
  details?: { label: string; value: string }[];
  confirmLabel: string;
  onConfirm: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  theme?: CallUITheme;
}

/** Frosted card for a pre-call decision (price confirmation, plan choice, …). */
export function CallConfirmPanel({
  title,
  highlight,
  details,
  confirmLabel,
  onConfirm,
  icon = "pricetag-outline",
  theme = defaultCallUITheme,
}: CallConfirmPanelProps) {
  return (
    <BlurView intensity={45} tint={theme.panelTint} style={styles.card} testID="call-confirm-panel">
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: theme.controlBackground }]}>
          <Ionicons name={icon} size={18} color={theme.text} />
        </View>
        <Text style={[styles.title, { color: theme.textSecondary }]}>{title}</Text>
      </View>
      {!!highlight && <Text style={[styles.highlight, { color: theme.text }]}>{highlight}</Text>}
      {details?.map((d) => (
        <View key={d.label} style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{d.label}</Text>
          <Text style={[styles.rowValue, { color: theme.text }]}>{d.value}</Text>
        </View>
      ))}
      <Pressable
        testID="call-confirm"
        accessibilityRole="button"
        onPress={onConfirm}
        style={({ pressed }) => [styles.confirm, { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="call" size={18} color="#fff" />
        <Text style={styles.confirmText}>{confirmLabel}</Text>
      </Pressable>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    overflow: "hidden",
    padding: 20,
    backgroundColor: "rgba(20,20,20,0.35)",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "600", flex: 1 },
  highlight: { fontSize: 34, fontWeight: "700", marginTop: 12, letterSpacing: -0.5, fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: "600" },
  confirm: {
    marginTop: 18,
    height: 52,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  confirmText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
