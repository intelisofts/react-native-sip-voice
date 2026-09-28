import React, { useEffect, useMemo, useState } from "react";
import { Modal, Platform, StyleSheet, View } from "react-native";

import type { Call } from "../../core/Call";
import { CallState } from "../../core/types";
import { useActiveCall, useAudioRoute, useCallState } from "../../react/hooks";
import { useSipVoice } from "../../react/SipVoiceProvider";
import { CallLabels, defaultLabels } from "../labels";
import { LandmarkResolver, resolveLandmark } from "../landmarks/resolver";
import { CallUITheme, mergeTheme } from "../theme";
import { ActiveCallScreen } from "./ActiveCallScreen";
import { IncomingCallScreen } from "./IncomingCallScreen";
import { MinimizedCallBanner } from "./MinimizedCallBanner";
import { PreparingCall, PreparingCallScreen } from "./PreparingCallScreen";

export interface CallOverlayProps {
  /** Look up a friendly name (e.g. from contacts). Falls back to `call.displayName`. */
  resolveDisplayName?: (call: Call) => Promise<string | undefined> | string | undefined;
  /**
   * The number to display and to pick the landmark from. Defaults to `call.destination`; override when
   * you dial a routing number but want to show what the user dialled (e.g. from `call.metadata`).
   */
  phoneNumberForCall?: (call: Call) => string;
  /** Replace / tweak the landmark shown for a number. */
  landmarkResolver?: LandmarkResolver;
  /** Disable landmark photos entirely (gradient only). */
  disableLandmarks?: boolean;
  /** Extra line under the status. */
  subtitle?: (call: Call) => string | undefined;
  theme?: Partial<CallUITheme>;
  labels?: Partial<CallLabels>;
  /** Allow collapsing to the banner. Default true. */
  allowMinimize?: boolean;
  /** In-app incoming call screen. iOS push calls always use CallKit's UI instead. Default true. */
  showIncomingScreen?: boolean;
  /** Render a custom full-screen UI instead of the built-in one. */
  renderActiveCall?: (props: { call: Call; displayName: string; minimize: () => void }) => React.ReactNode;
  blurRadius?: number;
  /** Show the Hold button on the call screen. Default false (needs SBC re-INVITE hold support). */
  showHold?: boolean;
  /**
   * A call your app is still setting up (permission / price checks, connecting). Shows the call screen
   * immediately; when the real call starts it takes over inside the same screen. Ignored while a call exists.
   */
  preparing?: PreparingCall | null;
}

/**
 * Drop-in call UI. Place once near the root (inside `SipVoiceProvider` and a SafeAreaProvider):
 * shows the full-screen call while a call is active (or being prepared), and the
 * "Tap to return to call" banner when minimized.
 *
 * A single Modal hosts every phase (preparing → ringing → active → ended) so moving between them
 * never re-runs the open animation.
 */
export function CallOverlay({
  resolveDisplayName,
  phoneNumberForCall,
  landmarkResolver,
  disableLandmarks = false,
  subtitle,
  theme: themeOverride,
  labels: labelOverride,
  allowMinimize = true,
  showIncomingScreen = true,
  renderActiveCall,
  blurRadius,
  showHold,
  preparing: preparingProp,
}: CallOverlayProps) {
  const call = useActiveCall();
  const { state } = useCallState(call);
  const { isSpeakerOn, toggleSpeaker } = useAudioRoute();
  const { client } = useSipVoice();
  const [minimizedId, setMinimizedId] = useState<string | null>(null);
  const displayName = useResolvedDisplayName(call, resolveDisplayName);

  const theme = useMemo(() => mergeTheme(themeOverride), [themeOverride]);
  const labels = useMemo(() => ({ ...defaultLabels, ...(labelOverride ?? {}) }), [labelOverride]);

  const preparing = call ? null : preparingProp ?? null;
  const phoneNumber = call ? phoneNumberForCall?.(call) ?? call.destination : preparing?.phoneNumber ?? "";
  const landmark = useMemo(
    () => (disableLandmarks || !phoneNumber ? null : resolveLandmark(phoneNumber, landmarkResolver)),
    [phoneNumber, landmarkResolver, disableLandmarks],
  );

  const terminated = state === CallState.ENDED || state === CallState.FAILED;
  // An ended call pops back to full screen so the user sees "Call ended".
  const minimized = !!call && minimizedId === call.id && !terminated;
  useEffect(() => {
    if (terminated) setMinimizedId(null);
  }, [terminated]);

  if (!call && !preparing) return null;

  const isIncomingRinging = !!call && call.isIncoming && state === CallState.RINGING;
  const fromPush = !!call?.metadata.fromPush;
  if (isIncomingRinging && (!showIncomingScreen || (fromPush && Platform.OS === "ios"))) return null;

  const minimize = () => {
    if (allowMinimize && call) setMinimizedId(call.id);
  };

  if (call && minimized) {
    return (
      <MinimizedCallBanner
        call={call}
        displayName={displayName}
        onPress={() => setMinimizedId(null)}
        theme={theme}
        labels={labels}
      />
    );
  }

  let screen: React.ReactNode;
  if (!call) {
    screen = (
      <PreparingCallScreen
        preparing={preparing!}
        landmark={landmark}
        theme={theme}
        labels={labels}
        blurRadius={blurRadius}
      />
    );
  } else if (isIncomingRinging) {
    screen = <IncomingCallScreen call={call} displayName={displayName} landmark={landmark} theme={theme} labels={labels} />;
  } else if (renderActiveCall) {
    screen = renderActiveCall({ call, displayName, minimize });
  } else {
    screen = (
      <ActiveCallScreen
        key={call.id}
        call={call}
        displayName={displayName}
        phoneNumber={phoneNumber}
        landmark={landmark}
        isSpeakerOn={isSpeakerOn}
        onToggleSpeaker={toggleSpeaker}
        onMinimize={allowMinimize ? minimize : undefined}
        subtitle={subtitle?.(call)}
        theme={theme}
        labels={labels}
        blurRadius={blurRadius}
        showHold={showHold}
      />
    );
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => {
        if (!call) preparing?.onCancel();
        else if (allowMinimize) minimize();
      }}
      testID="call-overlay-modal"
    >
      <View style={styles.fill} testID={`call-overlay-${client.currentConnectionState.toLowerCase()}`}>
        {screen}
      </View>
    </Modal>
  );
}

/** Contact-name lookup per call; resets when the call changes. */
function useResolvedDisplayName(
  call: Call | null,
  resolveDisplayName: CallOverlayProps["resolveDisplayName"],
): string {
  const [resolved, setResolved] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!call || !resolveDisplayName) return;
    let alive = true;
    Promise.resolve(resolveDisplayName(call))
      .then((name) => {
        if (alive && name) {
          call.displayName = name;
          setResolved({ id: call.id, name });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [call, resolveDisplayName]);

  if (!call) return "";
  return resolved?.id === call.id ? resolved.name : call.displayName;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
