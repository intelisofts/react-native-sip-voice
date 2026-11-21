import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTopInset } from "../hooks/useTopInset";

import { CallLabels, defaultLabels } from "../labels";
import type { Landmark } from "../landmarks/resolver";
import { CallUITheme, defaultCallUITheme } from "../theme";
import { Avatar } from "./Avatar";
import { EndCallBar } from "./EndCallBar";
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
  /** Shown as a small label under the name when known; omitted (not "Offline") when not. */
  calleeOnline?: boolean;
  /** Optional progress checklist. */
  steps?: PreparingStep[];
  /** Custom panel above the end button, e.g. a price confirmation card. */
  panel?: React.ReactNode;
  /** Error to show instead of progress. */
  error?: string;
  /** Reserved space above the end button, e.g. the ad slot on a free call. Stays put when it is empty. */
  footer?: React.ReactNode;
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
  theme = defaultCallUITheme,
  labels = defaultLabels,
}: PreparingCallScreenProps) {
  const insets = useSafeAreaInsets();
  const topInset = useTopInset();
  const { phoneNumber, displayName, status, steps, panel, error, onCancel, footer, calleeOnline } = preparing;
  const name = displayName || phoneNumber;

  return (
    <LandmarkBackground landmark={landmark}>
      <View
        style={[styles.container, { paddingTop: topInset + 12, paddingBottom: insets.bottom + 16 }]}
        testID="preparing-call-screen"
      >
        {/* Same top row as the active call: the country pill sits in the flow, below the camera. */}
        <View style={styles.topBar}>
          {landmark ? (
            <View style={styles.chip} testID="preparing-country-chip">
              <Text style={styles.flag}>{landmark.flag}</Text>
              <Text style={[styles.chipText, { color: theme.text }]} numberOfLines={1}>
                {landmark.country}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.identity}>
          {<Avatar name={name} pulsing={!error} textColor={theme.text} />}
          <Text style={[styles.name, { color: theme.text, fontFamily: theme.fontFamily }]} numberOfLines={1} testID="preparing-name">
            {name}
          </Text>
          {name !== phoneNumber && (
            <Text style={[styles.number, { color: theme.textSecondary }]}>{phoneNumber}</Text>
          )}
          {calleeOnline && !error && (
            <View style={styles.onlineRow} testID="preparing-callee-online">
              <View style={[styles.onlineDot, { backgroundColor: theme.accent }]} />
              <Text style={[styles.onlineText, { color: theme.textSecondary }]}>{labels.online ?? "Online"}</Text>
            </View>
          )}
          {error && panel ? null /* the panel below carries the message: show it once */ : error ? (
            <View style={styles.errorPanel} testID="preparing-error" accessibilityRole="alert">
              <Ionicons name="alert-circle" size={20} color={theme.danger} />
              <Text style={[styles.errorText, { color: theme.text }]} testID="preparing-status" accessibilityLiveRegion="polite">
                {error}
              </Text>
            </View>
          ) : (
            <Text style={[styles.status, { color: theme.text }]} testID="preparing-status" accessibilityLiveRegion="polite">
              {status ?? labels.connecting}
            </Text>
          )}
        </View>

        <View style={styles.middle}>
          {steps && steps.length > 0 && !panel ? <StepList steps={steps} theme={theme} /> : null}
        </View>

        {panel ? (
          <View style={styles.panelWrap} testID="preparing-panel">
            {panel}
          </View>
        ) : null}

        {footer ? <View style={styles.footerWrap}>{footer}</View> : null}

        <View style={styles.endRow}>
          <EndCallBar
            testID="preparing-cancel"
            icon={error ? "close" : "call"}
            tone={error ? "danger" : "neutral"}
            label={error ? labels.hide : labels.end}
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
  container: { flex: 1, paddingHorizontal: 24 },
  topBar: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    maxWidth: 220,
  },
  errorPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginHorizontal: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
    maxWidth: 340,
  },
  errorText: { flexShrink: 1, fontSize: 14, lineHeight: 19, fontWeight: "600" },
  flag: { fontSize: 16, marginRight: 6 },
  chipText: { fontSize: 13, fontWeight: "600" },
  identity: { alignItems: "center", marginTop: 28 },
  name: { fontSize: 30, fontWeight: "700", marginTop: 12, textAlign: "center", maxWidth: "90%" },
  number: { fontSize: 17, fontWeight: "500", marginTop: 4 },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineText: { fontSize: 13, fontWeight: "600" },
  status: { fontSize: 18, fontWeight: "600", marginTop: 12, textAlign: "center", paddingHorizontal: 24 },
  subtitle: { fontSize: 14, marginTop: 4 },
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
  endRow: { alignSelf: "stretch", marginTop: 16 },
  footerWrap: { alignSelf: "stretch", marginTop: 8 },
});
