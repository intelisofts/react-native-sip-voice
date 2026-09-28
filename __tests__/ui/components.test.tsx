import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { Call } from "../../src/core/Call";
import { CallState } from "../../src/core/types";
import { ActiveCallScreen } from "../../src/ui/components/ActiveCallScreen";
import { Avatar } from "../../src/ui/components/Avatar";
import { DialPad } from "../../src/ui/components/DialPad";
import { IncomingCallScreen } from "../../src/ui/components/IncomingCallScreen";
import { LandmarkBackground } from "../../src/ui/components/LandmarkBackground";
import { MinimizedCallBanner } from "../../src/ui/components/MinimizedCallBanner";
import { resolveLandmark } from "../../src/ui/landmarks/resolver";
import { FakeSession } from "../helpers/fakes";

function makeCall(init: Partial<ConstructorParameters<typeof Call>[0]> = {}) {
  const call = new Call({ direction: "outgoing", destination: "+447700900123", ...init });
  const session = new FakeSession(call);
  call._attachSession(session);
  return { call, session };
}

const london = resolveLandmark("+447700900123");

afterEach(() => jest.useRealTimers());

describe("ActiveCallScreen", () => {
  async function renderScreen(overrides: Partial<React.ComponentProps<typeof ActiveCallScreen>> = {}) {
    const { call, session } = makeCall();
    const onToggleSpeaker = jest.fn();
    const onMinimize = jest.fn();
    await render(
      <ActiveCallScreen
        call={call}
        displayName="Jane Doe"
        landmark={london}
        isSpeakerOn={false}
        onToggleSpeaker={onToggleSpeaker}
        onMinimize={onMinimize}
        {...overrides}
      />,
    );
    return { call, session, onToggleSpeaker, onMinimize };
  }

  it("shows name, number, country chip, landmark photo and credit", async () => {
    await renderScreen();
    expect(screen.getByTestId("call-name")).toHaveTextContent("Jane Doe");
    expect(screen.getByTestId("call-number")).toHaveTextContent("+447700900123");
    expect(screen.getByTestId("call-country-chip")).toHaveTextContent("🇬🇧United Kingdom");
    expect(screen.getByTestId("landmark-image")).toBeTruthy();
    expect(screen.getByTestId("call-attribution")).toHaveTextContent(/London Eye, London/);
    expect(screen.getByTestId("call-avatar-initials")).toHaveTextContent("JD");
  });

  it("shows the destination large, the stage in words, and a big bold timer once connected", async () => {
    const { StyleSheet } = require("react-native");
    const { act } = require("@testing-library/react-native");
    const { call } = await renderScreen();
    expect(screen.getByTestId("call-identity-panel")).toBeTruthy();
    const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
    expect(style("call-name").fontSize).toBeGreaterThanOrEqual(34);
    expect(style("call-number")).toMatchObject({ fontWeight: "700" });
    expect(style("call-number").fontSize).toBeGreaterThanOrEqual(26);
    expect(screen.getByTestId("call-status")).toHaveTextContent("Calling…");
    expect(style("call-status").fontSize).toBeGreaterThanOrEqual(24);
    expect(screen.queryByTestId("call-timer")).toBeNull();

    await act(async () => call.onRinging());
    expect(screen.getByTestId("call-status")).toHaveTextContent("Ringing…");

    await act(async () => call.onAnswered());
    expect(screen.getByTestId("call-status")).toHaveTextContent("Connected");
    expect(screen.getByTestId("call-timer")).toHaveTextContent("00:00");
    expect(style("call-timer")).toMatchObject({ fontWeight: "800" });
    expect(style("call-timer").fontSize).toBeGreaterThanOrEqual(46);
  });

  it("an unknown number is itself the big bold title", async () => {
    const { StyleSheet } = require("react-native");
    await renderScreen({ displayName: "+447700900123" });
    expect(StyleSheet.flatten(screen.getByTestId("call-name").props.style)).toMatchObject({ fontSize: 36, fontWeight: "800" });
  });

  it("hides the number when it equals the display name", async () => {
    await renderScreen({ displayName: "+447700900123" });
    expect(screen.queryByTestId("call-number")).toBeNull();
  });

  it("renders gradient only without a landmark", async () => {
    await renderScreen({ landmark: null });
    expect(screen.queryByTestId("landmark-image")).toBeNull();
    expect(screen.queryByTestId("call-country-chip")).toBeNull();
    expect(screen.queryByTestId("call-attribution")).toBeNull();
  });

  it("walks through Calling -> Ringing -> Connected + timer -> ended", async () => {
    jest.useFakeTimers({ now: 1_000 });
    const { call } = await renderScreen();
    expect(screen.getByTestId("call-status")).toHaveTextContent("Calling…");
    await act(() => call.onRinging());
    expect(screen.getByTestId("call-status")).toHaveTextContent("Ringing…");
    await act(() => call.onAnswered());
    await act(() => jest.advanceTimersByTime(65_000));
    expect(screen.getByTestId("call-status")).toHaveTextContent("Connected");
    expect(screen.getByTestId("call-timer")).toHaveTextContent("01:05");
    await act(() => call.onEnded("remote_hangup"));
    expect(screen.getByTestId("call-status")).toHaveTextContent("Call ended");
    expect(screen.getByTestId("call-timer")).toHaveTextContent("01:05");
  });

  it("controls mute, speaker, hold and end", async () => {
    const { call, session, onToggleSpeaker } = await renderScreen({ showHold: true });
    await act(() => call.onAnswered());

    await fireEvent.press(screen.getByTestId("call-mute"));
    expect(session.setMuted).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("call-mute")).toBeSelected();

    await fireEvent.press(screen.getByTestId("call-speaker"));
    expect(onToggleSpeaker).toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("call-hold"));
    expect(session.setHold).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("call-status")).toHaveTextContent(/On hold/);
    expect(screen.getByText("Resume")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("call-end"));
    expect(session.hangup).toHaveBeenCalled();
    expect(call.currentState).toBe(CallState.ENDED);
  });

  it("disables keypad and hold until answered", async () => {
    await renderScreen({ showHold: true });
    expect(screen.getByTestId("call-keypad")).toBeDisabled();
    expect(screen.getByTestId("call-hold")).toBeDisabled();
    expect(screen.getByTestId("call-mute")).toBeEnabled();
  });

  it("hides the Hold button by default", async () => {
    await renderScreen();
    expect(screen.queryByTestId("call-hold")).toBeNull();
    expect(screen.getByTestId("call-mute")).toBeTruthy();
  });

  it("opens the keypad and sends DTMF", async () => {
    const { call, session } = await renderScreen();
    await act(() => call.onAnswered());
    await fireEvent.press(screen.getByTestId("call-keypad"));
    expect(screen.getByTestId("dial-pad")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("dial-key-1"));
    await fireEvent.press(screen.getByTestId("dial-key-#"));
    expect(session.sendDtmf.mock.calls).toEqual([["1"], ["#"]]);
    expect(screen.getByTestId("dial-pad-entered")).toHaveTextContent("1#");
    await fireEvent.press(screen.getByTestId("call-keypad"));
    expect(screen.queryByTestId("dial-pad")).toBeNull();
  });

  it("minimizes", async () => {
    const { onMinimize } = await renderScreen();
    await fireEvent.press(screen.getByTestId("call-minimize"));
    expect(onMinimize).toHaveBeenCalled();
  });

  it("hides minimize when not allowed", async () => {
    await renderScreen({ onMinimize: undefined });
    expect(screen.queryByTestId("call-minimize")).toBeNull();
  });

  it("disables all controls once ended", async () => {
    const { call } = await renderScreen();
    await act(() => call.onEnded("remote_hangup"));
    expect(screen.getByTestId("call-end")).toBeDisabled();
    expect(screen.getByTestId("call-mute")).toBeDisabled();
  });

  it("shows failure in the status line", async () => {
    const { call } = await renderScreen();
    await act(() => call.onEnded("busy", 486));
    expect(screen.getByTestId("call-status")).toHaveTextContent("Call failed");
  });

  it("renders a subtitle and custom labels", async () => {
    await renderScreen({ subtitle: "$0.05/min", labels: { ...require("../../src/ui/labels").defaultLabels, end: "Raccrocher" } });
    expect(screen.getByText("$0.05/min")).toBeTruthy();
    expect(screen.getByText("Raccrocher")).toBeTruthy();
  });
});

describe("IncomingCallScreen", () => {
  it("accepts and declines", async () => {
    const { call, session } = makeCall({ direction: "incoming", initialState: CallState.RINGING, destination: "+33123456789" });
    await render(<IncomingCallScreen call={call} displayName="Marie" landmark={resolveLandmark("+33123456789")} />);
    expect(screen.getByTestId("incoming-name")).toHaveTextContent("Marie");
    expect(screen.getByText("🇫🇷 France")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("incoming-accept"));
    expect(session.answer).toHaveBeenCalled();
  });

  it("declines", async () => {
    const { call, session } = makeCall({ direction: "incoming", initialState: CallState.RINGING });
    await render(<IncomingCallScreen call={call} displayName="X" landmark={null} />);
    await fireEvent.press(screen.getByTestId("incoming-decline"));
    expect(session.reject).toHaveBeenCalled();
  });
});

describe("MinimizedCallBanner", () => {
  it("shows the running timer and mute indicator and returns on tap", async () => {
    jest.useFakeTimers({ now: 5_000 });
    const { call } = makeCall();
    const onPress = jest.fn();
    await render(<MinimizedCallBanner call={call} displayName="Jane" onPress={onPress} />);
    await act(() => call.onAnswered());
    await act(() => jest.advanceTimersByTime(12_000));
    expect(screen.getByTestId("minimized-call-status")).toHaveTextContent("00:12");
    expect(screen.getByText(/Tap to return to call · Jane/)).toBeTruthy();
    expect(screen.queryByText("icon:mic-off")).toBeNull();
    await act(() => call.mute());
    expect(screen.getByText("icon:mic-off")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("minimized-call-banner"));
    expect(onPress).toHaveBeenCalled();
  });
});

describe("DialPad", () => {
  it("renders 12 keys and reports presses", async () => {
    const onPress = jest.fn();
    await render(<DialPad onPress={onPress} entered="12" />);
    for (const k of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "#"]) {
      expect(screen.getByTestId(`dial-key-${k}`)).toBeTruthy();
    }
    await fireEvent.press(screen.getByTestId("dial-key-*"));
    expect(onPress).toHaveBeenCalledWith("*");
    expect(screen.getByTestId("dial-pad-entered")).toHaveTextContent("12");
  });
});

describe("Avatar", () => {
  it("shows initials and # for numbers", async () => {
    await render(<Avatar name="Ada Lovelace" pulsing />);
    expect(screen.getByTestId("call-avatar-initials")).toHaveTextContent("AL");
    await render(<Avatar name="+44 20 7946 0958" />);
    expect(screen.getByTestId("call-avatar-initials")).toHaveTextContent("#");
  });
});

describe("LandmarkBackground", () => {
  it("falls back to the gradient when the image fails to load", async () => {
    await render(<LandmarkBackground landmark={london} />);
    const img = screen.getByTestId("landmark-image");
    await act(() => img.props.onError());
    expect(screen.queryByTestId("landmark-image")).toBeNull();
    expect(screen.getByTestId("landmark-background")).toBeTruthy();
  });
});
