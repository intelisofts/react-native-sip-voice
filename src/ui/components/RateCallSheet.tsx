import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CallLabels, defaultLabels } from "../labels";
import { CallUITheme, defaultCallUITheme } from "../theme";

export interface RateCallSheetProps {
  visible: boolean;
  displayName: string;
  onRate?: (liked: boolean) => void;
  onCallAgain?: () => void;
  onClose: () => void;
  theme?: CallUITheme;
  labels?: CallLabels;
}

/**
 * Small half-screen sheet asking how the call just ended with `displayName` went. Plain content, not its
 * own Modal: the host renders it inside whatever Modal is already open (the call screen's), so closing the
 * call and opening the rating prompt is one continuous screen, never two modals closing and reopening in
 * sequence. Thumbs up/down are optional and skippable: closing the sheet without rating is always available.
 */
export function RateCallSheet({
  visible,
  displayName,
  onRate,
  onCallAgain,
  onClose,
  theme = defaultCallUITheme,
  labels = defaultLabels,
}: RateCallSheetProps) {
  const insets = useSafeAreaInsets();
  const [rated, setRated] = useState<boolean | null>(null);
  const cardText = theme.rateCardText ?? "#111B21";
  const cardTextSecondary = theme.rateCardTextSecondary ?? "rgba(17,27,33,0.6)";

  const rate = (liked: boolean) => {
    setRated(liked);
    onRate?.(liked);
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={[styles.sheet, { backgroundColor: theme.rateCardBackground ?? "#FFFFFF", paddingBottom: insets.bottom + 20 }]}
        testID="rate-call-sheet"
      >
        <View style={styles.handle} />
        <Text style={[styles.name, { color: cardText }]} numberOfLines={1}>
          {displayName}
        </Text>

        {onRate && (
          rated === null ? (
            <>
              <Text style={[styles.prompt, { color: cardTextSecondary }]}>{labels.rateCall ?? "How was the call?"}</Text>
              <View style={styles.rateButtons}>
                <Pressable
                  testID="call-rate-up"
                  accessibilityRole="button"
                  accessibilityLabel={labels.rateGood ?? "Good"}
                  onPress={() => rate(true)}
                  style={({ pressed }) => [styles.rateButton, pressed && styles.pressed]}
                >
                  <Ionicons name="thumbs-up-outline" size={26} color={cardText} />
                </Pressable>
                <Pressable
                  testID="call-rate-down"
                  accessibilityRole="button"
                  accessibilityLabel={labels.rateBad ?? "Bad"}
                  onPress={() => rate(false)}
                  style={({ pressed }) => [styles.rateButton, pressed && styles.pressed]}
                >
                  <Ionicons name="thumbs-down-outline" size={26} color={cardText} />
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={[styles.prompt, { color: cardTextSecondary }]} testID="call-rate-thanks">
              {labels.rateThanks ?? "Thanks for the feedback"}
            </Text>
          )
        )}

        <View style={styles.actions}>
          {onCallAgain && (
            <Pressable
              testID="call-again"
              accessibilityRole="button"
              onPress={onCallAgain}
              style={({ pressed }) => [styles.button, styles.buttonGhost, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonGhostText, { color: cardText }]}>{labels.callAgain ?? "Call someone else"}</Text>
            </Pressable>
          )}
          <Pressable
            testID="call-close"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.button, { backgroundColor: theme.accent }, pressed && styles.pressed]}
          >
            <Text style={styles.buttonSolidText}>{labels.close ?? "Close"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: StyleSheet.absoluteFill,
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: "center",
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(17,27,33,0.15)", marginBottom: 18 },
  name: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  prompt: { fontSize: 14, fontWeight: "500", marginTop: 18, textAlign: "center" },
  rateButtons: { flexDirection: "row", gap: 16, marginTop: 14 },
  rateButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,27,33,0.06)",
  },
  pressed: { opacity: 0.7 },
  actions: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 24 },
  button: { flex: 1, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  buttonGhost: { backgroundColor: "rgba(17,27,33,0.06)" },
  buttonGhostText: { fontSize: 15, fontWeight: "700" },
  buttonSolidText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
