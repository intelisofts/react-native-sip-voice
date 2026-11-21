export interface CallUITheme {
  /** Accent for the minimized banner and answer button. */
  accent: string;
  danger: string;
  text: string;
  textSecondary: string;
  controlBackground: string;
  controlActiveBackground: string;
  controlActiveIcon: string;
  controlIcon: string;
  panelTint: "dark" | "light" | "default";
  /** Solid background for screens without a photo (the incoming call screen). */
  background?: string;
  /** Background for the post-call rating sheet; light by default regardless of the call screen's dark theme. */
  rateCardBackground?: string;
  rateCardText?: string;
  rateCardTextSecondary?: string;
  fontFamily?: string;
}

export const defaultCallUITheme: CallUITheme = {
  accent: "#25D366",
  danger: "#E5484D",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.75)",
  controlBackground: "rgba(255,255,255,0.16)",
  controlActiveBackground: "#FFFFFF",
  controlActiveIcon: "#111B21",
  controlIcon: "#FFFFFF",
  panelTint: "dark",
  background: "#111B21",
  rateCardBackground: "#FFFFFF",
  rateCardText: "#111B21",
  rateCardTextSecondary: "rgba(17,27,33,0.6)",
};

export function mergeTheme(partial?: Partial<CallUITheme>): CallUITheme {
  return { ...defaultCallUITheme, ...(partial ?? {}) };
}
