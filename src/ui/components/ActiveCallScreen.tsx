import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Call } from "../../core/Call";
import { CallState } from "../../core/types";
import { useCallDuration, useCallState } from "../../react/hooks";
import { CallLabels, defaultLabels, statusText } from "../labels";
import type { Landmark } from "../landmarks/resolver";
import { CallUITheme, defaultCallUITheme } from "../theme";
import { Avatar } from "./Avatar";
import { ControlButton } from "./ControlButton";
import { DialPad } from "./DialPad";
import { LandmarkBackground } from "./LandmarkBackground";

export interface ActiveCallScreenProps {
  call: Call;
  /** Contact name, or the number when unknown. */
  displayName: string;
  /** Number shown under the name. Defaults to `call.destination`. */
  phoneNumber?: string;
  landmark: Landmark | null;
  isSpeakerOn: boolean;
  onToggleSpeaker: () => void;
  /** Collapse to the "Tap to return to call" banner. Omit to hide the minimize button. */
  onMinimize?: () => void;
  /** Extra line under the status, e.g. "Noah Call · $0.05/min". */
  subtitle?: string;
  theme?: CallUITheme;
  labels?: CallLabels;
  /** Show the landmark credit line (required by most Creative Commons licences). Default true. */
  showAttribution?: boolean;
  blurRadius?: number;
}

export function ActiveCallScreen({
  call,
  displayName,
  phoneNumber,
  landmark,
  isSpeakerOn,
  onToggleSpeaker,
  onMinimize,
  subtitle,
  theme = defaultCallUITheme,
  labels = defaultLabels,
  showAttribution = true,
  blurRadius,
}: ActiveCallScreenProps) {
  const insets = useSafeAreaInsets();
  const { state, isMuted, isOnHold } = useCallState(call);
  const duration = useCallDuration(call);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [dtmf, setDtmf] = useState("");

  const number = phoneNumber ?? call.destination;
  const live = state !== CallState.ENDED && state !== CallState.FAILED;
  const inCall = state === CallState.ACTIVE || state === CallState.HELD;
  const pulsing = state === CallState.CONNECTING || state === CallState.RINGING || state === CallState.RECONNECTING;
  const status = statusText(state, duration, { incoming: call.isIncoming, labels });

  const onDigit = useCallback(
    (digit: string) => {
      setDtmf((d) => (d + digit).slice(-24));
      call.sendDtmf(digit).catch(() => {});
    },
    [call],
  );

  const hangup = useCallback(() => {
    call.hangup().catch(() => {});
  }, [call]);

  return (
    <LandmarkBackground landmark={landmark} blurRadius={blurRadius}>
      <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          {onMinimize ? (
            <Pressable
              testID="call-minimize"
              accessibilityRole="button"
              accessibilityLabel="Minimize call"
              onPress={onMinimize}
              hitSlop={12}
              style={styles.topButton}
            >
              <Ionicons name="chevron-down" size={26} color={theme.text} />
            </Pressable>
          ) : (
            <View style={styles.topButton} />
          )}
          {landmark ? (
            <View style={styles.countryChip} testID="call-country-chip">
              <Text style={styles.flag}>{landmark.flag}</Text>
              <Text style={[styles.countryText, { color: theme.text }]} numberOfLines={1}>
                {landmark.country}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <View style={styles.topButton} />
        </View>

        {/* Identity */}
        <View style={styles.identity}>
          {!keypadOpen && <Avatar name={displayName} pulsing={pulsing} textColor={theme.text} />}
          <Text style={[styles.name, { color: theme.text, fontFamily: theme.fontFamily }]} numberOfLines={1} testID="call-name">
            {displayName}
          </Text>
          {displayName !== number && (
            <Text style={[styles.number, { color: theme.textSecondary }]} numberOfLines={1} testID="call-number">
              {number}
            </Text>
          )}
          <Text
            style={[styles.status, { color: state === CallState.FAILED ? theme.danger : theme.textSecondary }]}
            testID="call-status"
            accessibilityLiveRegion="polite"
          >
            {status}
          </Text>
          {!!subtitle && <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
        </View>

        <View style={styles.spacer}>
          {keypadOpen && <DialPad onPress={onDigit} entered={dtmf} theme={theme} />}
        </View>

        {/* Controls panel */}
        <BlurView intensity={40} tint={theme.panelTint} style={styles.panel}>
          <View style={styles.controlsRow}>
            <ControlButton
              testID="call-speaker"
              icon={isSpeakerOn ? "volume-high" : "volume-medium-outline"}
              label={labels.speaker}
              active={isSpeakerOn}
              onPress={onToggleSpeaker}
              disabled={!live}
              theme={theme}
            />
            <ControlButton
              testID="call-mute"
              icon={isMuted ? "mic-off" : "mic-outline"}
              label={labels.mute}
              active={isMuted}
              onPress={() => call.toggleMute()}
              disabled={!live}
              theme={theme}
            />
            <ControlButton
              testID="call-keypad"
              icon={keypadOpen ? "close" : "keypad-outline"}
              label={keypadOpen ? labels.hide : labels.keypad}
              active={keypadOpen}
              onPress={() => setKeypadOpen((o) => !o)}
              disabled={!inCall}
              theme={theme}
            />
            <ControlButton
              testID="call-hold"
              icon={isOnHold ? "play" : "pause"}
              label={isOnHold ? labels.resume : labels.hold}
              active={isOnHold}
              onPress={() => call.toggleHold().catch(() => {})}
              disabled={!inCall}
              theme={theme}
            />
          </View>
          <View style={styles.endRow}>
            <ControlButton
              testID="call-end"
              icon="call"
              iconRotation={135}
              label={labels.end}
              variant="danger"
              size={70}
              onPress={hangup}
              disabled={!live}
              theme={theme}
            />
          </View>
        </BlurView>

        {showAttribution && landmark?.imageUrl && (
          <Text style={styles.attribution} numberOfLines={1} testID="call-attribution">
            📍 {landmark.landmark}, {landmark.city}
            {landmark.author ? ` · Photo: ${landmark.author}` : ""}
            {landmark.license ? ` (${landmark.license})` : ""}
          </Text>
        )}
      </View>
    </LandmarkBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 44 },
  topButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    maxWidth: 220,
  },
  flag: { fontSize: 16, marginRight: 6 },
  countryText: { fontSize: 13, fontWeight: "600" },
  identity: { alignItems: "center", marginTop: 12 },
  name: { fontSize: 30, fontWeight: "600", marginTop: 4, textAlign: "center", maxWidth: "90%" },
  number: { fontSize: 16, marginTop: 4 },
  status: { fontSize: 17, marginTop: 8, fontVariant: ["tabular-nums"] },
  subtitle: { fontSize: 13, marginTop: 4 },
  spacer: { flex: 1, justifyContent: "center" },
  panel: {
    borderRadius: 32,
    overflow: "hidden",
    paddingVertical: 20,
    paddingHorizontal: 8,
    backgroundColor: "rgba(20,20,20,0.35)",
  },
  controlsRow: { flexDirection: "row", justifyContent: "space-around" },
  endRow: { alignItems: "center", marginTop: 18 },
  attribution: { color: "rgba(255,255,255,0.55)", fontSize: 10, textAlign: "center", marginTop: 10 },
});
