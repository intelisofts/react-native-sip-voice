import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useState } from "react";
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTopInset } from "../hooks/useTopInset";

import type { Call } from "../../core/Call";
import { CallState } from "../../core/types";
import { useCallDuration, useCallState } from "../../react/hooks";
import { callPhase, CallLabels, defaultLabels } from "../labels";
import { formatDuration } from "../../core/utils";
import type { Landmark } from "../landmarks/resolver";
import { CallUITheme, defaultCallUITheme } from "../theme";
import { Avatar } from "./Avatar";
import { ControlButton } from "./ControlButton";
import { EndCallBar } from "./EndCallBar";
import { DEFAULT_KEY_SIZE, DialPad } from "./DialPad";

import { LandmarkBackground } from "./LandmarkBackground";
// Space the keypad needs besides its keys: the entered-digits line and its margin.
const DIGITS_LINE_HEIGHT = 52;
// Four key rows plus three gaps, each gap ~0.24 of a key (see DialPad).
const KEY_ROWS_FACTOR = 4.72;
const MIN_KEY_SIZE = 44;

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
  /** Close the screen once the call has ended or failed. Shown instead of the (disabled) end-call bar. */
  onClose?: () => void;
  /** Extra line under the status, e.g. "Noah Call · $0.05/min". */
  subtitle?: string;
  theme?: CallUITheme;
  labels?: CallLabels;
  /** Show the landmark credit line (required by most Creative Commons licences). Default true. */
  blurRadius?: number;
  /** Show the Hold button. Default false; hold needs SBC support for re-INVITE (sendonly/recvonly). */
  showHold?: boolean;
  /** Shown as a small badge in the top-right corner, e.g. a security notice. */
  notice?: React.ReactNode;
  /** Reserved space above the controls, e.g. for an ad. */
  footer?: React.ReactNode;
}

export function ActiveCallScreen({
  call,
  displayName,
  phoneNumber,
  landmark,
  isSpeakerOn,
  onToggleSpeaker,
  onMinimize,
  onClose,
  theme = defaultCallUITheme,
  labels = defaultLabels,
  showHold = false,
  notice,
  footer,
}: ActiveCallScreenProps) {
  const insets = useSafeAreaInsets();
  const topInset = useTopInset();
  const { state, isMuted, isOnHold } = useCallState(call);
  const duration = useCallDuration(call);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [dtmf, setDtmf] = useState("");
  // Keys shrink to fit the space left between the identity block and the controls.
  const [padSpace, setPadSpace] = useState(0);
  const onSpaceLayout = useCallback((e: LayoutChangeEvent) => setPadSpace(e.nativeEvent.layout.height), []);
  const keySize = Math.min(
    DEFAULT_KEY_SIZE,
    Math.max(MIN_KEY_SIZE, Math.floor((padSpace - DIGITS_LINE_HEIGHT) / KEY_ROWS_FACTOR)),
  );

  const number = phoneNumber ?? call.destination;
  // Free app-to-app calls run between two Noah Call apps: there is no phone menu to send digits to, so no keypad.
  const isFreeCall = call.metadata?.kind === "app";
  // A call that connects closes the instant it ends (handled by the host), so this screen only ever shows
  // a terminal state for one that never connected: the reason, with every control hidden but close.
  const failed = state === CallState.FAILED;
  const inCall = state === CallState.ACTIVE || state === CallState.HELD;
  const pulsing = state === CallState.CONNECTING || state === CallState.RINGING || state === CallState.RECONNECTING;
  const phase = callPhase(state, { incoming: call.isIncoming, labels, reason: call.endReason });
  const phaseColor =
    state === CallState.FAILED
      ? theme.danger
      : state === CallState.ACTIVE
        ? "#4ADE80"
        : state === CallState.HELD || state === CallState.RECONNECTING
          ? "#FBBF24"
          : theme.text;

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
    <LandmarkBackground landmark={landmark}>
      <View style={[styles.container, { paddingTop: topInset + 12, paddingBottom: insets.bottom + 16 }]}>
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
          <View style={styles.noticeBadge}>{notice}</View>
        </View>

        {/* Identity: text sits on a frosted panel so it stays readable over any photo and as it fades. */}
        <View style={styles.identity}>
          {!keypadOpen && <Avatar name={displayName} pulsing={pulsing} textColor={theme.text} />}
          <View style={styles.identityPanel} testID="call-identity-panel">
            {/* The destination leads: contact name, or the number itself when unknown. */}
            <Text
              style={[displayName === number ? styles.numberTitle : styles.name, { color: theme.text, fontFamily: theme.fontFamily }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              testID="call-name"
            >
              {displayName}
            </Text>
            {displayName !== number && (
              <Text style={[styles.number, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} testID="call-number">
                {number}
              </Text>
            )}
            <View style={styles.phaseRow} accessibilityLiveRegion="polite">
              {state === CallState.ACTIVE && <View style={[styles.phaseDot, { backgroundColor: phaseColor }]} />}
              <Text style={[styles.phase, { color: phaseColor }]} testID="call-status">
                {phase}
              </Text>
            </View>
            {inCall && (
              <Text style={[styles.timer, { color: theme.text }]} testID="call-timer" accessibilityLabel={`Call duration ${formatDuration(duration)}`}>
                {formatDuration(duration)}
              </Text>
            )}
          </View>
        </View>

        {/* Scrolls only if even the smallest keys do not fit, so the pad never overlaps the identity or controls. */}
        <ScrollView style={styles.spacer} contentContainerStyle={styles.spacerContent} onLayout={onSpaceLayout}>
          {keypadOpen && <DialPad onPress={onDigit} entered={dtmf} theme={theme} keySize={keySize} />}
        </ScrollView>

        {footer}

        {/* A call that never connected hides every control but close: nothing else is actionable. */}
        <View style={styles.panel}>
          {!failed && (
            <View style={styles.controlsRow}>
              <ControlButton
                testID="call-speaker"
                icon={isSpeakerOn ? "volume-high" : "volume-medium-outline"}
                label={labels.speaker}
                active={isSpeakerOn}
                onPress={onToggleSpeaker}
                theme={theme}
              />
              <ControlButton
                testID="call-mute"
                icon={isMuted ? "mic-off" : "mic-outline"}
                label={labels.mute}
                active={isMuted}
                onPress={() => call.toggleMute()}
                theme={theme}
              />
              {!isFreeCall && (
              <ControlButton
                testID="call-keypad"
                icon={keypadOpen ? "close" : "keypad-outline"}
                label={keypadOpen ? labels.hide : labels.keypad}
                active={keypadOpen}
                onPress={() => setKeypadOpen((o) => !o)}
                disabled={!inCall}
                theme={theme}
              />
              )}
              {showHold && (
                <ControlButton
                  testID="call-hold"
                  icon={isOnHold ? "play" : "pause"}
                  label={isOnHold ? labels.resume : labels.hold}
                  active={isOnHold}
                  onPress={() => call.toggleHold().catch(() => {})}
                  disabled={!inCall}
                  theme={theme}
                />
              )}
            </View>
          )}
          <View style={styles.endRow}>
            {failed ? (
              <EndCallBar testID="call-close" label={labels.close ?? "Close"} icon="close" onPress={onClose ?? hangup} disabled={!onClose} theme={theme} />
            ) : (
              <EndCallBar testID="call-end" label={labels.end} onPress={hangup} theme={theme} />
            )}
          </View>
        </View>

      </View>
    </LandmarkBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 44 },
  topButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  noticeBadge: { alignItems: "flex-end", justifyContent: "center", minWidth: 44 },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.34)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    maxWidth: 220,
  },
  flag: { fontSize: 16, marginRight: 6 },
  countryText: { fontSize: 13, fontWeight: "600" },
  identity: { alignItems: "center", marginTop: 16 },
  identityPanel: { alignItems: "center", alignSelf: "stretch", marginTop: 8, paddingHorizontal: 8, gap: 4 },
  name: { fontSize: 27, fontWeight: "700", textAlign: "center", maxWidth: "100%" },
  numberTitle: { fontSize: 27, fontWeight: "700", textAlign: "center", maxWidth: "100%", fontVariant: ["tabular-nums"] },
  number: { fontSize: 16, fontWeight: "500", fontVariant: ["tabular-nums"] },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  phaseDot: { width: 10, height: 10, borderRadius: 5 },
  phase: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  timer: { fontSize: 28, fontWeight: "700", marginTop: 2, fontVariant: ["tabular-nums"] },
  spacer: { flex: 1 },
  spacerContent: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  panel: {
    borderRadius: 22,
    overflow: "hidden",
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: "rgba(20,20,26,0.46)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  controlsRow: { flexDirection: "row", justifyContent: "space-around" },
  endRow: { alignSelf: "stretch", marginTop: 16, alignItems: "center" },
  attribution: { color: "rgba(255,255,255,0.55)", fontSize: 10, textAlign: "center", marginTop: 10 },
});
