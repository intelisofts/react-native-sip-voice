import {
  ConfigPlugin,
  createRunOncePlugin,
  withEntitlementsPlist,
  withInfoPlist,
} from "@expo/config-plugins";

export interface SipVoicePluginProps {
  /** Microphone permission text (iOS). Only set when the app doesn't already define one. */
  microphonePermission?: string;
  /**
   * Register for VoIP (PushKit) pushes at launch so incoming calls can wake a terminated app.
   * Your backend must then send a VoIP push for every incoming call. Default false.
   */
  voipPush?: boolean;
  /** `aps-environment` to set when voipPush is enabled and none is present. Default `development`. */
  apsEnvironment?: "development" | "production";
}

const DEFAULT_MIC = "Allow $(PRODUCT_NAME) to use the microphone for voice calls.";

export function addBackgroundModes(existing: unknown, modes: string[]): string[] {
  const current = Array.isArray(existing) ? (existing as string[]) : [];
  return Array.from(new Set([...current, ...modes]));
}

const withSipVoiceIos: ConfigPlugin<SipVoicePluginProps> = (config, props) => {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIBackgroundModes = addBackgroundModes(cfg.modResults.UIBackgroundModes, ["audio", "voip"]);
    if (!cfg.modResults.NSMicrophoneUsageDescription) {
      cfg.modResults.NSMicrophoneUsageDescription = props.microphonePermission ?? DEFAULT_MIC;
    }
    cfg.modResults.SipVoiceEnableVoipPush = !!props.voipPush;
    return cfg;
  });
  if (props.voipPush) {
    config = withEntitlementsPlist(config, (cfg) => {
      cfg.modResults["aps-environment"] ??= props.apsEnvironment ?? "development";
      return cfg;
    });
  }
  return config;
};

/**
 * Expo config plugin for react-native-sip-voice.
 * Android needs nothing here: permissions and services merge from the library manifest.
 */
const withSipVoice: ConfigPlugin<SipVoicePluginProps | void> = (config, props) => {
  return withSipVoiceIos(config, props ?? {});
};

const pkg = { name: "react-native-sip-voice", version: "0.1.0" };
export default createRunOncePlugin(withSipVoice, pkg.name, pkg.version);
