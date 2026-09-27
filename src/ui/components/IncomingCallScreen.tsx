import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Call } from "../../core/Call";
import { CallLabels, defaultLabels } from "../labels";
import type { Landmark } from "../landmarks/resolver";
import { CallUITheme, defaultCallUITheme } from "../theme";
import { Avatar } from "./Avatar";
import { ControlButton } from "./ControlButton";
import { LandmarkBackground } from "./LandmarkBackground";

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
  return (
    <LandmarkBackground landmark={landmark} blurRadius={6}>
      <View style={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 48 }]}>
        <View style={styles.identity}>
          <Text style={[styles.caption, { color: theme.textSecondary }]}>{labels.incoming}</Text>
          <Avatar name={displayName} pulsing textColor={theme.text} />
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1} testID="incoming-name">
            {displayName}
          </Text>
          {landmark && (
            <Text style={[styles.caption, { color: theme.textSecondary }]}>
              {landmark.flag} {landmark.country}
            </Text>
          )}
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
            onPress={() => call.answer().catch(() => {})}
            theme={theme}
          />
        </View>
      </View>
    </LandmarkBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "space-between", paddingHorizontal: 24 },
  identity: { alignItems: "center" },
  caption: { fontSize: 15, marginVertical: 6 },
  name: { fontSize: 32, fontWeight: "600", marginTop: 4 },
  actions: { flexDirection: "row", justifyContent: "space-around" },
});
