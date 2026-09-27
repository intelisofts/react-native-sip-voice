import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Call } from "../../core/Call";
import { useCallDuration, useCallState } from "../../react/hooks";
import { CallLabels, defaultLabels, statusText } from "../labels";
import { CallUITheme, defaultCallUITheme } from "../theme";

export interface MinimizedCallBannerProps {
  call: Call;
  displayName: string;
  onPress: () => void;
  theme?: CallUITheme;
  labels?: CallLabels;
}

/** WhatsApp-style green strip shown over the app while a minimized call continues. */
export function MinimizedCallBanner({
  call,
  displayName,
  onPress,
  theme = defaultCallUITheme,
  labels = defaultLabels,
}: MinimizedCallBannerProps) {
  const insets = useSafeAreaInsets();
  const { state, isMuted } = useCallState(call);
  const duration = useCallDuration(call);
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  return (
    <Pressable
      testID="minimized-call-banner"
      accessibilityRole="button"
      accessibilityLabel={`${labels.tapToReturn}. ${displayName}`}
      onPress={onPress}
      style={[styles.banner, { backgroundColor: theme.accent, paddingTop: insets.top + 4 }]}
    >
      <View style={styles.row}>
        <Animated.View style={[styles.dot, { opacity: blink }]} />
        <Text style={styles.text} numberOfLines={1}>
          {labels.tapToReturn} · {displayName}
        </Text>
        {isMuted && <Ionicons name="mic-off" size={14} color="#fff" style={styles.icon} />}
        <Text style={styles.time} testID="minimized-call-status">
          {statusText(state, duration, { incoming: call.isIncoming, labels })}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 8,
    paddingHorizontal: 16,
    zIndex: 1000,
    elevation: 20,
  },
  row: { flexDirection: "row", alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff", marginRight: 8 },
  text: { color: "#fff", fontWeight: "600", fontSize: 14, flex: 1 },
  icon: { marginHorizontal: 6 },
  time: { color: "#fff", fontWeight: "600", fontSize: 14, fontVariant: ["tabular-nums"] },
});
