import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";

import type { Landmark } from "../landmarks/resolver";

export interface LandmarkBackgroundProps {
  /** Kept for callers; the background no longer depends on the destination. */
  landmark?: Landmark | null;
  children?: React.ReactNode;
}

// Dark base, as WhatsApp's call screen, so text and controls always read clearly. Two soft out-of-focus
// colour blobs in the app's own brand gradient (blue → violet) add a little warmth without a photo: no
// per-call data, no network request, so it never fails to load and never needs an attribution line.
const CALL_BACKGROUND = "#111B21";
const BLOB_COLORS: [string, string] = ["#2563eb", "#7c3aed"];

/** Background for every call screen: a plain dark surface with two blurred brand-colour glows. */
export function LandmarkBackground({ children }: LandmarkBackgroundProps) {
  return (
    <View style={[styles.fill, { backgroundColor: CALL_BACKGROUND }]} testID="landmark-background">
      <View style={[StyleSheet.absoluteFill, styles.art]} pointerEvents="none" testID="landmark-art">
        <LinearGradient colors={[BLOB_COLORS[0], "transparent"]} style={[styles.blob, styles.blobTopRight]} />
        <LinearGradient colors={[BLOB_COLORS[1], "transparent"]} style={[styles.blob, styles.blobBottomLeft]} />
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  art: { overflow: "hidden" },
  blob: { position: "absolute", width: 420, height: 420, borderRadius: 210 },
  blobTopRight: { top: -170, right: -150, opacity: 0.55 },
  blobBottomLeft: { bottom: -190, left: -170, opacity: 0.4 },
});
