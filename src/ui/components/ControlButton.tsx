import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CallUITheme, defaultCallUITheme } from "../theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

export interface ControlButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  variant?: "default" | "danger" | "accept";
  size?: number;
  theme?: CallUITheme;
  testID?: string;
  iconRotation?: number;
}

export function ControlButton({
  icon,
  label,
  onPress,
  active = false,
  disabled = false,
  variant = "default",
  size = 60,
  theme = defaultCallUITheme,
  testID,
  iconRotation,
}: ControlButtonProps) {
  const bg =
    variant === "danger"
      ? theme.danger
      : variant === "accept"
        ? theme.accent
        : active
          ? theme.controlActiveBackground
          : theme.controlBackground;
  const iconColor = variant === "default" && active ? theme.controlActiveIcon : theme.controlIcon;

  return (
    <View style={[styles.item, disabled && styles.disabled]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={icon}
          size={size * 0.43}
          color={iconColor}
          style={iconRotation ? { transform: [{ rotate: `${iconRotation}deg` }] } : undefined}
        />
      </Pressable>
      <Text style={[styles.label, { color: theme.textSecondary, fontFamily: theme.fontFamily }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { alignItems: "center", minWidth: 72 },
  circle: { alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
  disabled: { opacity: 0.4 },
  label: { marginTop: 8, fontSize: 12, fontWeight: "500" },
});
