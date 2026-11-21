import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Call } from "../../core/Call";
import { CallState } from "../../core/types";
import { useActiveCall, useAudioRoute, useCallState } from "../../react/hooks";
import { useSipVoice } from "../../react/SipVoiceProvider";
import { getNativeCallUI } from "../../native/NativeCallUI";
import { CallLabels, defaultLabels } from "../labels";
import { LandmarkResolver, resolveLandmark } from "../landmarks/resolver";
import { CallUITheme, mergeTheme } from "../theme";
import { ActiveCallScreen } from "./ActiveCallScreen";
import { IncomingCallScreen } from "./IncomingCallScreen";
import { MinimizedCallBanner } from "./MinimizedCallBanner";
import { PreparingCall, PreparingCallScreen } from "./PreparingCallScreen";
import { RateCallSheet } from "./RateCallSheet";

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
  /** Extra content under the name on the active call screen (for example a security notice), per call. */
  renderNotice?: (call: Call) => React.ReactNode;
  /** Reserved space above the call controls (for example an ad slot), per call. */
  renderFooter?: (call: Call) => React.ReactNode;
  /**
   * A call your app is still setting up (permission / price checks, connecting). Shows the call screen
   * immediately; when the real call starts it takes over inside the same screen. Ignored while a call exists.
   */
  preparing?: PreparingCall | null;
  /** Height of the minimized-call banner (0 when hidden). Use it to push your content down so the banner overlays nothing. */
  onBannerHeight?: (height: number) => void;
  /**
   * True while the full-screen call page is up, false once it closes. The page is dark: switch your status bar to
   * light here. The Modal copies the status bar style showing when it opens, so when this is given the Modal
   * opens one frame after the call, once your light status bar is in place.
   */
  onFullScreenChange?: (shown: boolean) => void;
  /**
   * Thumbs up/down for the call just ended, shown on its post-call panel. Optional and skippable by the
   * user; omit to leave the rating prompt out entirely.
   */
  onRate?: (call: Call, liked: boolean) => void;
  /**
   * "Call someone else" on the post-call panel, e.g. to send the user back to contacts. Also closes the
   * panel itself; omit to leave the button out.
   */
  onCallAgain?: (call: Call) => void;
}

/** Long enough that a glance, a wrong number, or an immediate hang-up isn't worth asking to be rated. */

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
  renderNotice,
  renderFooter,
  preparing: preparingProp,
  onBannerHeight,
  onFullScreenChange,
  onRate,
  onCallAgain,
}: CallOverlayProps) {
  const call = useActiveCall();
  const { state } = useCallState(call);
  const { isSpeakerOn, toggleSpeaker } = useAudioRoute();
  const { client } = useSipVoice();
  const [minimizedId, setMinimizedId] = useState<string | null>(null);

  const terminated = state === CallState.ENDED || state === CallState.FAILED;

  // A call that never connected (busy, declined, no answer…) keeps the full screen open so the user can
  // read why, with every control but close hidden: keep a snapshot from the moment it ends, shown until
  // the user closes it or a new call starts. A call that DID connect closes the instant it ends instead
  // (see `ratingCall` below) - the full screen never shows a "call ended cleanly" state at all.
  //
  // The snapshot is set synchronously during render (not in a useEffect, which runs a tick later): an
  // effect would leave one render in between - where the live call is already excluded and the snapshot is
  // not yet taken - with neither to show, closing the modal for a frame and reopening it right after.
  const failed = state === CallState.FAILED;
  const endedCallRef = useRef<Call | null>(null);
  if (call) endedCallRef.current = failed ? call : null;
  const endedCall = endedCallRef.current;

  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const showingSummary = !!endedCall && dismissedId !== endedCall.id && (!call || call.id === endedCall.id);
  const effectiveCall = showingSummary ? endedCall : call && !terminated ? call : null;
  const dismissSummary = useCallback(() => {
    if (endedCallRef.current) setDismissedId(endedCallRef.current.id);
  }, []);

  // A connected call that just ended: closes this screen at once. Long enough to be worth rating, and
  // rating/call-again is wanted, it opens the rating sheet right away instead of just going away.
  const ratingCallRef = useRef<Call | null>(null);
  if (call) ratingCallRef.current = terminated && !failed ? call : null;
  const ratingCall = ratingCallRef.current;
  // Rated whenever the call connected, however long it lasted. Never for a call that did not connect.
  const worthRating = !!ratingCall && ratingCall.answeredAt !== undefined;
  const [ratingDismissedId, setRatingDismissedId] = useState<string | null>(null);
  const showingRating = !!ratingCall && ratingDismissedId !== ratingCall.id && worthRating && (!!onRate || !!onCallAgain);
  const dismissRating = useCallback(() => {
    if (ratingCallRef.current) setRatingDismissedId(ratingCallRef.current.id);
  }, []);
  const handleRate = useCallback(
    (liked: boolean) => {
      if (ratingCallRef.current) onRate?.(ratingCallRef.current, liked);
      dismissRating();
    },
    [onRate, dismissRating],
  );
  const handleCallAgain = useCallback(() => {
    if (ratingCallRef.current) onCallAgain?.(ratingCallRef.current);
    dismissRating();
  }, [onCallAgain, dismissRating]);

  const displayName = useResolvedDisplayName(effectiveCall ?? ratingCall, resolveDisplayName);

  const theme = useMemo(() => mergeTheme(themeOverride), [themeOverride]);
  const labels = useMemo(() => ({ ...defaultLabels, ...(labelOverride ?? {}) }), [labelOverride]);

  const preparing = effectiveCall ? null : preparingProp ?? null;
  const phoneNumber = effectiveCall
    ? phoneNumberForCall?.(effectiveCall) ?? effectiveCall.destination
    : preparing?.phoneNumber ?? "";
  const landmark = useMemo(
    () => (disableLandmarks || !phoneNumber ? null : resolveLandmark(phoneNumber, landmarkResolver)),
    [phoneNumber, landmarkResolver, disableLandmarks],
  );

  // An ended call pops back to full screen so the user sees the post-call panel.
  const minimized = !!call && minimizedId === call.id && !terminated;
  useEffect(() => {
    if (terminated) setMinimizedId(null);
  }, [terminated]);

  const bannerShown = !!call && minimized;
  useEffect(() => {
    if (!bannerShown) onBannerHeight?.(0);
  }, [bannerShown, onBannerHeight]);

  const isIncomingRinging = !!call && call.isIncoming && state === CallState.RINGING;
  const fromPush = !!call?.metadata.fromPush;
  // Incoming calls belong to the system call screen (CallKit / ConnectionService) whenever it is available,
  // as in WhatsApp: no second set of Accept/Decline buttons inside the app. The in-app screen is the fallback only.
  const systemCallUI = getNativeCallUI().isAvailable;
  const leftToSystemUI = isIncomingRinging && (!showIncomingScreen || systemCallUI || (fromPush && Platform.OS === "ios"));
  const fullScreen = !!(effectiveCall || preparing || showingRating) && !leftToSystemUI && !(call && minimized);

  // Light status bar first (host), Modal one frame later, so the Modal opens with it (see onFullScreenChange)
  const [modalReady, setModalReady] = useState(false);
  useEffect(() => {
    onFullScreenChange?.(fullScreen);
    if (!fullScreen) {
      setModalReady(false);
      return;
    }
    const frame = requestAnimationFrame(() => setModalReady(true));
    return () => cancelAnimationFrame(frame);
  }, [fullScreen, onFullScreenChange]);

  if (!effectiveCall && !preparing && !showingRating) return null;
  if (leftToSystemUI) return null;

  const minimize = () => {
    if (allowMinimize && call) setMinimizedId(call.id);
  };

  if (call && minimized) {
    return (
      <MinimizedCallBanner
        call={call}
        displayName={displayName}
        onPress={() => setMinimizedId(null)}
        onHeight={onBannerHeight}
        theme={theme}
        labels={labels}
      />
    );
  }

  let screen: React.ReactNode = null;
  if (preparing) {
    screen = (
      <PreparingCallScreen
        preparing={preparing}
        landmark={landmark}
        theme={theme}
        labels={labels}
        blurRadius={blurRadius}
      />
    );
  } else if (!effectiveCall) {
    // Nothing left to show behind the rating sheet (showingRating, no live/ended-to-show call).
  } else if (isIncomingRinging) {
    screen = <IncomingCallScreen call={call!} displayName={displayName} landmark={landmark} theme={theme} labels={labels} />;
  } else if (renderActiveCall) {
    screen = renderActiveCall({ call: effectiveCall, displayName, minimize });
  } else {
    screen = (
      <ActiveCallScreen
        key={effectiveCall.id}
        call={effectiveCall}
        displayName={displayName}
        phoneNumber={phoneNumber}
        landmark={landmark}
        isSpeakerOn={isSpeakerOn}
        onToggleSpeaker={toggleSpeaker}
        onMinimize={allowMinimize && !showingSummary ? minimize : undefined}
        onClose={showingSummary ? dismissSummary : undefined}
        subtitle={subtitle?.(effectiveCall)}
        theme={theme}
        labels={labels}
        blurRadius={blurRadius}
        showHold={showHold}
        notice={renderNotice?.(effectiveCall)}
        footer={renderFooter?.(effectiveCall)}
      />
    );
  }

  if (onFullScreenChange && !modalReady) return null;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => {
        if (showingSummary) dismissSummary();
        else if (showingRating) dismissRating();
        else if (!call) preparing?.onCancel();
        else if (allowMinimize) minimize();
      }}
      testID="call-overlay-modal"
    >
      {/* The Modal is its own window, so it needs its own safe-area provider to know where the notch is. */}
      <SafeAreaProvider>
        <View style={styles.fill} testID={`call-overlay-${client.currentConnectionState.toLowerCase()}`}>
          {screen}
          {/* Rendered inside the same Modal as the call screen it follows, never a separate one: ending a
             call and being asked to rate it is one continuous screen, not two modals closing and reopening. */}
          {showingRating && (
            <RateCallSheet
              visible
              displayName={displayName}
              onRate={onRate ? handleRate : undefined}
              onCallAgain={onCallAgain ? handleCallAgain : undefined}
              onClose={dismissRating}
              theme={theme}
              labels={labels}
            />
          )}
        </View>
      </SafeAreaProvider>
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
  fill: { flex: 1, backgroundColor: "#111B21" },
});
