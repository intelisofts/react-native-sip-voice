import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { initials } from "../labels";

export interface AvatarProps {
  name: string;
  size?: number;
  /** Show the expanding "calling" rings. */
  pulsing?: boolean;
  color?: string;
  textColor?: string;
}

export function Avatar({ name, size = 128, pulsing = false, color = "rgba(255,255,255,0.22)", textColor = "#fff" }: AvatarProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pulsing) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulsing, pulse]);

  const ring = (delay: number) => {
    const progress = pulse.interpolate({
      inputRange: [0, delay, 1],
      outputRange: [0, 0, 1],
      extrapolate: "clamp",
    });
    return {
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
      transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
    };
  };

  const circle = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View style={[styles.wrap, { width: size * 1.6, height: size * 1.6 }]} testID="call-avatar">
      {pulsing && (
        <>
          <Animated.View style={[styles.ring, circle, { borderColor: textColor }, ring(0)]} />
          <Animated.View style={[styles.ring, circle, { borderColor: textColor }, ring(0.35)]} />
        </>
      )}
      <View style={[styles.circle, circle, { backgroundColor: color }]}>
        <Text style={[styles.initials, { color: textColor, fontSize: size * 0.36 }]} testID="call-avatar-initials">
          {initials(name)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", borderWidth: 2 },
  circle: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
  },
  initials: { fontWeight: "600", letterSpacing: 1 },
});
