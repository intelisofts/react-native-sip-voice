import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CallLabels, defaultLabels } from "../labels";
import type { Landmark } from "../landmarks/resolver";
import { CallUITheme, defaultCallUITheme } from "../theme";
import { Avatar } from "./Avatar";
import { ControlButton } from "./ControlButton";
import { LandmarkBackground } from "./LandmarkBackground";

export type PreparingStepState = "pending" | "active" | "done" | "error";

export interface PreparingStep {
  key: string;
  label: string;
  state: PreparingStepState;
}

/**
 * Describes a call your app is still setting up (authorising, pricing, connecting) before any SIP
 * INVITE exists. Pass it to `<CallOverlay preparing={…} />` so the user sees the call screen straight
 * away and it continues seamlessly into the real call.
 */
export interface PreparingCall {
  /** Number being dialled. Used for display and the landmark. */
  phoneNumber: string;
  displayName?: string;
  /** Headline under the name, e.g. "Checking your plan…". */
  status?: string;
  /** Optional progress checklist. */
  steps?: PreparingStep[];
  /** Custom panel above the end button, e.g. a price confirmation card. */
  panel?: React.ReactNode;
  /** Error to show instead of progress. */
  error?: string;
  /** Called when the user taps End / Close. */
  onCancel: () => void;
}

export interface PreparingCallScreenProps {
  preparing: PreparingCall;
  landmark: Landmark | null;
  subtitle?: string;
  theme?: CallUITheme;
  labels?: CallLabels;
  blurRadius?: number;
}

export function PreparingCallScreen({
  preparing,
  landmark,
  subtitle,
  theme = defaultCallUITheme,
  labels = defaultLabels,
  blurRadius,
}: PreparingCallScreenProps) {
  const insets = useSafeAreaInsets();
  const { phoneNumber, displayName, status, steps, panel, error, onCancel } = preparing;
  const name = displayName || phoneNumber;

  return (
    <LandmarkBackground landmark={landmark} blurRadius={blurRadius}>
      <View
        style={[styles.container, { paddingTop: insets.top + 52, paddingBottom: insets.bottom + 16 }]}
        testID="preparing-call-screen"
      >
        {landmark ? (
          <View style={styles.chip} testID="preparing-country-chip">
            <Text style={styles.flag}>{landmark.flag}</Text>
            <Text style={[styles.chipText, { color: theme.text }]} numberOfLines={1}>
              {landmark.country}
            </Text>
          </View>
        ) : null}

        <View style={styles.identity}>
          <Avatar name={name} pulsing={!error} textColor={theme.text} />
          <Text style={[styles.name, { color: theme.text, fontFamily: theme.fontFamily }]} numberOfLines={1} testID="preparing-name">
            {name}
          </Text>
          {name !== phoneNumber && (
            <Text style={[styles.number, { color: theme.textSecondary }]}>{phoneNumber}</Text>
          )}
          <Text
            style={[styles.status, { color: error ? theme.danger : theme.textSecondary }]}
            testID="preparing-status"
            accessibilityLiveRegion="polite"
          >
            {error ?? status ?? labels.connecting}
          </Text>
          {!!subtitle && !error && <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
        </View>

        <View style={styles.middle}>
          {steps && steps.length > 0 && !panel ? <StepList steps={steps} theme={theme} /> : null}
        </View>

        {panel ? (
          <View style={styles.panelWrap} testID="preparing-panel">
            {panel}
          </View>
        ) : null}

        <View style={styles.endRow}>
          <ControlButton
            testID="preparing-cancel"
            icon={error ? "close" : "call"}
            iconRotation={error ? undefined : 135}
            label={error ? labels.hide : labels.end}
            variant="danger"
            size={70}
            onPress={onCancel}
            theme={theme}
          />
        </View>
      </View>
    </LandmarkBackground>
  );
}

function StepList({ steps, theme }: { steps: PreparingStep[]; theme: CallUITheme }) {
  return (
    <BlurView intensity={35} tint={theme.panelTint} style={styles.steps}>
      {steps.map((s) => (
        <StepRow key={s.key} step={s} theme={theme} />
      ))}
    </BlurView>
  );
}

function StepRow({ step, theme }: { step: PreparingStep; theme: CallUITheme }) {
  const appear = useRef(new Animated.Value(step.state === "done" ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(appear, { toValue: step.state === "done" ? 1 : 0, useNativeDriver: true, friction: 6 }).start();
  }, [step.state, appear]);

  const muted = step.state === "pending";
  return (
    <View style={styles.stepRow} testID={`preparing-step-${step.key}`} accessibilityLabel={`${step.label}: ${step.state}`}>
      <View style={styles.stepIcon}>
        {step.state === "active" ? (
          <ActivityIndicator size="small" color={theme.text} />
        ) : step.state === "error" ? (
          <Ionicons name="alert-circle" size={20} color={theme.danger} />
        ) : step.state === "done" ? (
          <Animated.View style={{ transform: [{ scale: appear }] }}>
            <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
          </Animated.View>
        ) : (
          <View style={[styles.dot, { borderColor: theme.textSecondary }]} />
        )}
      </View>
      <Text style={[styles.stepLabel, { color: muted ? theme.textSecondary : theme.text, opacity: muted ? 0.7 : 1 }]}>
        {step.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  chip: {
    position: "absolute",
    top: 0,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
  },
  flag: { fontSize: 16, marginRight: 6 },
  chipText: { fontSize: 13, fontWeight: "600" },
  identity: { alignItems: "center", marginTop: 12 },
  name: { fontSize: 30, fontWeight: "600", marginTop: 4, textAlign: "center", maxWidth: "90%" },
  number: { fontSize: 16, marginTop: 4 },
  status: { fontSize: 17, marginTop: 8, textAlign: "center", paddingHorizontal: 24 },
  subtitle: { fontSize: 13, marginTop: 4 },
  middle: { flex: 1, justifyContent: "center", alignItems: "center" },
  steps: {
    borderRadius: 24,
    overflow: "hidden",
    paddingVertical: 14,
    paddingHorizontal: 20,
    minWidth: 250,
    backgroundColor: "rgba(20,20,20,0.3)",
    gap: 12,
  },
  stepRow: { flexDirection: "row", alignItems: "center" },
  stepIcon: { width: 24, alignItems: "center", marginRight: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  stepLabel: { fontSize: 15, fontWeight: "500" },
  panelWrap: { marginBottom: 20 },
  endRow: { alignItems: "center", marginTop: 8 },
});
