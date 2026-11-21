import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { DEFAULT_LANDMARK_COLORS, Landmark } from "../landmarks/resolver";

export interface LandmarkCardProps {
  landmark: Landmark | null;
  /** Height of the card. Screens pass a share of the screen so the controls always fit. */
  height: number;
}

/**
 * The destination photo as a rounded card, set below the country chip. Falls back to the country colours when
 * there is no photo or it fails to load (offline). Shows no text: the chip above it names the country.
 */
export function LandmarkCard({ landmark, height }: LandmarkCardProps) {
  const [failed, setFailed] = useState(false);
  const showImage = !!landmark?.imageUrl && !failed;
  return (
    <View style={[styles.card, { height }]} testID="landmark-card">
      <LinearGradient
        colors={landmark?.colors ?? DEFAULT_LANDMARK_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {showImage && (
        <Image
          testID="landmark-image"
          source={{ uri: landmark!.imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
          cachePolicy="disk"
          accessibilityLabel={`${landmark!.landmark}, ${landmark!.city}`}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
    borderRadius: 24,
    overflow: "hidden",
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#132033",
  },
});
