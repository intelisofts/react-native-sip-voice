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
  fontFamily?: string;
}

export const defaultCallUITheme: CallUITheme = {
  accent: "#25D366",
  danger: "#FF3B30",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.75)",
  controlBackground: "rgba(255,255,255,0.16)",
  controlActiveBackground: "#FFFFFF",
  controlActiveIcon: "#111B21",
  controlIcon: "#FFFFFF",
  panelTint: "dark",
};

export function mergeTheme(partial?: Partial<CallUITheme>): CallUITheme {
  return { ...defaultCallUITheme, ...(partial ?? {}) };
}
