import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTopInset } from "../hooks/useTopInset";

import type { Call } from "../../core/Call";
import { CallLabels, defaultLabels } from "../labels";
import type { Landmark } from "../landmarks/resolver";
import { CallUITheme, defaultCallUITheme } from "../theme";
import { Avatar } from "./Avatar";
import { LandmarkBackground } from "./LandmarkBackground";
import { ControlButton } from "./ControlButton";

export interface IncomingCallScreenProps {
  call: Call;
  displayName: string;
  landmark: Landmark | null;
  theme?: CallUITheme;
  labels?: CallLabels;
}

export function IncomingCallScreen({
  call,
  displayName,
  landmark,
  theme = defaultCallUITheme,
  labels = defaultLabels,
}: IncomingCallScreenProps) {
  const insets = useSafeAreaInsets();
  const topInset = useTopInset();
  const [answering, setAnswering] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // Accept: the answer is checked first (the gate), and a refusal is shown on this screen instead of nothing.
  const accept = async () => {
    if (answering) return;
    setAnswering(true);
    setRefusal(null);
    try {
      await call.answer();
    } catch {
      setRefusal(labels.answerFailed ?? defaultLabels.answerFailed!);
    } finally {
      setAnswering(false);
    }
    if (call.isTerminated && call.answeredAt === undefined) {
      setRefusal(call.endReason === "busy" ? (labels.busy ?? defaultLabels.busy!) : (labels.answerFailed ?? defaultLabels.answerFailed!));
    }
  };

  return (
    <LandmarkBackground landmark={landmark}>
      <View style={[styles.container, { paddingTop: topInset + 12, paddingBottom: insets.bottom + 32 }]}>
        <View>
          {/* Same top row as the active call: the country pill in the flow, below the camera. */}
          <View style={styles.topBar}>
            {landmark ? (
              <View style={styles.chip} testID="incoming-country-chip">
                <Text style={styles.flag}>{landmark.flag}</Text>
                <Text style={[styles.chipText, { color: theme.text }]} numberOfLines={1}>
                  {landmark.country}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.identity}>
            {<Avatar name={displayName} pulsing textColor={theme.text} />}
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1} testID="incoming-name">
              {displayName}
            </Text>
            <Text style={[styles.caption, { color: theme.text }]}>{labels.incoming}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <ControlButton
            testID="incoming-decline"
            icon="call"
            iconRotation={135}
            label={labels.decline}
            variant="danger"
            size={72}
            onPress={() => call.reject().catch(() => {})}
            theme={theme}
          />
          <ControlButton
            testID="incoming-accept"
            icon="call"
            label={labels.accept}
            variant="accept"
            size={72}
            disabled={answering}
            onPress={() => void accept()}
            theme={theme}
          />
        </View>
        {refusal ? (
          <Text style={[styles.refusal, { color: theme.text }]} testID="incoming-refusal" accessibilityLiveRegion="polite">
            {refusal}
          </Text>
        ) : null}
      </View>
    </LandmarkBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "space-between", paddingHorizontal: 24 },
  topBar: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.35)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, maxWidth: 220 },
  flag: { fontSize: 16, marginRight: 6 },
  chipText: { fontSize: 13, fontWeight: "600" },
  identity: { alignItems: "center", marginTop: 40 },
  caption: { fontSize: 18, fontWeight: "600", marginTop: 10, opacity: 0.9, textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: 8 },
  name: { fontSize: 36, fontWeight: "800", letterSpacing: -0.5, marginTop: 4, textAlign: "center", textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: 10 },
  actions: { flexDirection: "row", justifyContent: "space-around" },
  solid: { flex: 1 },
  refusal: { textAlign: "center", fontSize: 15, fontWeight: "600", marginBottom: 8 },
});
