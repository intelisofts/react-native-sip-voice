import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

import { DEFAULT_LANDMARK_COLORS, Landmark } from "../landmarks/resolver";

export interface LandmarkBackgroundProps {
  landmark: Landmark | null;
  /** Blur radius applied to the photo. 0 keeps it crisp (default); WhatsApp-style soft look ≈ 8. */
  blurRadius?: number;
  children?: React.ReactNode;
}

/**
 * Full-bleed destination landmark with gradient scrims so white text stays readable.
 * Falls back to a country-tinted gradient when there is no image or it fails to load (offline).
 */
export function LandmarkBackground({ landmark, blurRadius = 0, children }: LandmarkBackgroundProps) {
  const [failed, setFailed] = useState(false);
  const colors = landmark?.colors ?? DEFAULT_LANDMARK_COLORS;
  const showImage = !!landmark?.imageUrl && !failed;

  return (
    <View style={styles.fill} testID="landmark-background">
      <LinearGradient colors={colors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      {showImage && (
        <Image
          testID="landmark-image"
          source={{ uri: landmark!.imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={400}
          blurRadius={blurRadius}
          cachePolicy="disk"
          accessibilityLabel={`${landmark!.landmark}, ${landmark!.city}`}
          onError={() => setFailed(true)}
        />
      )}
      <LinearGradient
        colors={["rgba(0,0,0,0.65)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.25)", "rgba(0,0,0,0.85)"]}
        locations={[0, 0.35, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
});
