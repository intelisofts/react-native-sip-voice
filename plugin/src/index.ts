import { ConfigPlugin, createRunOncePlugin, withPlugins } from "@expo/config-plugins";

export interface SipVoicePluginProps {
  /** Microphone permission text (iOS). */
  microphonePermission?: string;
  /**
   * Options for expo-callkit-telecom's config plugin, which this applies (ringtone, icons, notification strings,
   * timeouts, …). See https://expo-callkit-telecom.mfairley.com/getting-started.
   */
  callkit?: Record<string, unknown>;
}

const DEFAULT_MIC = "Allow $(PRODUCT_NAME) to use the microphone for voice calls.";

/** Tells the backend about a call declined while the app was closed (see SipVoiceCallEventReceiver). */
export const CALL_EVENT_RECEIVER = "expo.modules.sipvoice.SipVoiceCallEventReceiver";

/** The options passed to expo-callkit-telecom's plugin: voice calls, the SBC's ring window, our event receiver. */
export function callkitOptions(props: SipVoicePluginProps = {}): Record<string, unknown> {
  return {
    supportsVideo: false,
    // The SBC holds a call up to 45 s for a woken phone, then rings it: give up ringing with it.
    incomingCallTimeout: 45,
    microphonePermission: props.microphonePermission ?? DEFAULT_MIC,
    ...props.callkit,
    androidEventReceiver: CALL_EVENT_RECEIVER,
  };
}

/**
 * Expo config plugin for react-native-sip-voice: sets up expo-callkit-telecom (CallKit, Core-Telecom, VoIP push,
 * background modes, permissions) with the options this library needs.
 */
const withSipVoice: ConfigPlugin<SipVoicePluginProps | void> = (config, props) =>
  withPlugins(config, [["expo-callkit-telecom", callkitOptions(props ?? {})]]);

const pkg = { name: "react-native-sip-voice", version: "0.4.0" };
export default createRunOncePlugin(withSipVoice, pkg.name, pkg.version);
