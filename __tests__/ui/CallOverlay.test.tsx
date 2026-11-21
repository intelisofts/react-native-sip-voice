import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform, Text } from "react-native";

import { SipVoiceClient } from "../../src/core/SipVoiceClient";
import { SipVoiceProvider } from "../../src/react/SipVoiceProvider";
import { CallOverlay, CallOverlayProps } from "../../src/ui/components/CallOverlay";
import { digestCreds, FakeAdapter, FakeNative, flush } from "../helpers/fakes";

const liveClients: SipVoiceClient[] = [];
afterEach(async () => {
  jest.useRealTimers();
  await Promise.all(liveClients.splice(0).map((c) => c.destroy()));
});

async function setup(props: CallOverlayProps = {}) {
  const adapter = new FakeAdapter();
  const client = new SipVoiceClient({}, { adapter });
  liveClients.push(client);
  const native = new FakeNative();
  await client.connect(digestCreds);
  await render(
    <SipVoiceProvider client={client} native={native}>
      <CallOverlay {...props} />
    </SipVoiceProvider>,
  );
  return { adapter, client, native };
}

describe("CallOverlay", () => {
  it("renders nothing without a call", async () => {
    await setup();
    expect(screen.queryByTestId("call-overlay-modal")).toBeNull();
    expect(screen.queryByTestId("minimized-call-banner")).toBeNull();
  });

  it("opens the full-screen call UI for an outgoing call with the landmark", async () => {
    const { client } = await setup();
    await act(() => client.newCall({ destination: "+447700900123", displayName: "Jane" }));
    expect(screen.getByTestId("call-overlay-modal")).toBeTruthy();
    expect(screen.getByTestId("call-name")).toHaveTextContent("Jane");
    expect(screen.getByTestId("call-country-chip")).toHaveTextContent(/United Kingdom/);
  });

  it("shows an app-provided notice under the name and a footer slot above the controls, for that call only", async () => {
    const { client } = await setup({
      renderNotice: (call) => <Text testID="notice">notice for {call.destination}</Text>,
      renderFooter: () => <Text testID="footer">ad space</Text>,
    });
    await act(() => client.newCall({ destination: "+447700900123" }));
    expect(screen.getByTestId("notice")).toHaveTextContent("notice for +447700900123");
    expect(screen.getByTestId("footer")).toBeTruthy();
  });

  it("renders nothing extra when no notice or footer is given", async () => {
    const { client } = await setup();
    await act(() => client.newCall({ destination: "+447700900123" }));
    expect(screen.queryByTestId("notice")).toBeNull();
    expect(screen.queryByTestId("footer")).toBeNull();
  });

  it("minimizes to the banner and returns", async () => {
    const { client } = await setup();
    await act(() => client.newCall({ destination: "+447700900123" }));
    await fireEvent.press(screen.getByTestId("call-minimize"));
    expect(screen.queryByTestId("call-overlay-modal")).toBeNull();
    expect(screen.getByTestId("minimized-call-banner")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("minimized-call-banner"));
    expect(screen.getByTestId("call-overlay-modal")).toBeTruthy();
  });

  it("pops back to full screen when a minimized, never-answered call ends, and stays up past the linger window", async () => {
    jest.useFakeTimers();
    const { client } = await setup();
    let call: any;
    await act(async () => {
      call = await client.newCall({ destination: "+1" });
    });
    await fireEvent.press(screen.getByTestId("call-minimize"));
    await act(() => call.onEnded("no_answer"));
    expect(screen.getByTestId("call-status")).toHaveTextContent("No answer");
    // The client drops the call from its own list after its linger window; the screen must not follow it off.
    await act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByTestId("call-overlay-modal")).toBeTruthy();
    expect(screen.getByTestId("call-status")).toHaveTextContent("No answer");
  });

  it("asks for a rating when a connected call ends, however short it was", async () => {
    const { client } = await setup({ onCallAgain: jest.fn() });
    let call: any;
    await act(async () => {
      call = await client.newCall({ destination: "+1" });
      call.onAnswered();
    });
    await act(() => call.onEnded("remote_hangup"));
    expect(screen.getByTestId("rate-call-sheet")).toBeTruthy();
  });

  it("a connected call closes instantly, then offers rating in the same modal", async () => {
    jest.useFakeTimers();
    const onCallAgain = jest.fn();
    const { client } = await setup({ onCallAgain });
    let call: any;
    await act(async () => {
      call = await client.newCall({ destination: "+1" });
      call.onAnswered();
    });
    await act(() => jest.advanceTimersByTime(30_000));
    await act(() => call.onEnded("remote_hangup"));

    // Still inside call-overlay-modal: ending a call and asking to rate it never closes-then-reopens a modal.
    expect(screen.getByTestId("call-overlay-modal")).toBeTruthy();
    expect(screen.getByTestId("rate-call-sheet")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("call-again"));
    expect(onCallAgain).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("call-overlay-modal")).toBeNull();
    expect(screen.queryByTestId("rate-call-sheet")).toBeNull();
  });

  it("a call that never connected gets no rating sheet", async () => {
    const { client } = await setup({ onCallAgain: jest.fn() });
    let call: any;
    await act(async () => {
      call = await client.newCall({ destination: "+1" });
    });
    await act(() => call.onEnded("busy", 486));
    expect(screen.queryByTestId("rate-call-sheet")).toBeNull();
  });

  it("a call that never connects keeps the full screen open with only a close button", async () => {
    const { client } = await setup();
    let call: any;
    await act(async () => {
      call = await client.newCall({ destination: "+1" });
    });
    await act(() => call.onEnded("busy", 486));
    expect(screen.getByTestId("call-overlay-modal")).toBeTruthy();
    expect(screen.getByTestId("call-close")).toBeTruthy();
    expect(screen.queryByTestId("call-speaker")).toBeNull();
  });

  it("a fresh call retires the previous never-answered summary without an explicit dismiss", async () => {
    const { client } = await setup();
    let first: any;
    await act(async () => {
      first = await client.newCall({ destination: "+1" });
    });
    await act(() => first.onEnded("no_answer"));
    expect(screen.getByTestId("call-status")).toHaveTextContent("No answer");

    await act(async () => {
      await client.newCall({ destination: "+2" });
    });
    expect(screen.getByTestId("call-status")).not.toHaveTextContent("No answer");
  });

  it("resolves a contact name asynchronously", async () => {
    const resolveDisplayName = jest.fn(async () => "Grandma");
    const { client } = await setup({ resolveDisplayName });
    await act(() => client.newCall({ destination: "+447700900123" }));
    await act(flush);
    expect(screen.getByTestId("call-name")).toHaveTextContent("Grandma");
    expect(client.currentActiveCall?.displayName).toBe("Grandma");
  });

  it("supports disabling landmarks and minimize", async () => {
    const { client } = await setup({ disableLandmarks: true, allowMinimize: false });
    await act(() => client.newCall({ destination: "+447700900123" }));
    expect(screen.queryByTestId("landmark-image")).toBeNull();
    expect(screen.queryByTestId("call-minimize")).toBeNull();
  });

  it("shows and resolves the landmark from phoneNumberForCall", async () => {
    const { client } = await setup({ phoneNumberForCall: (c) => String(c.metadata.dialed) });
    await act(() => client.newCall({ destination: "+15550000000", metadata: { dialed: "+33123456789" } }));
    expect(screen.getByTestId("call-number")).toHaveTextContent("+33123456789");
    expect(screen.getByTestId("call-country-chip")).toHaveTextContent(/France/);
  });

  it("uses a custom landmark resolver", async () => {
    const { client } = await setup({ landmarkResolver: () => ({ landmark: "Big Ben", city: "London" }) });
    await act(() => client.newCall({ destination: "+447700900123" }));
    expect(screen.queryByTestId("call-landmark")).toBeNull();
    expect(screen.getByTestId("call-country-chip")).toBeTruthy();
  });

  it("shows the incoming screen for SIP incoming calls", async () => {
    const { adapter } = await setup();
    await act(() => adapter.incoming("+33123456789", {}, "Marie"));
    expect(screen.getByTestId("incoming-name")).toHaveTextContent("Marie");
  });

  it("leaves iOS push calls to CallKit", async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { get: () => "ios", configurable: true });
    try {
      const { adapter, client } = await setup();
      client.registerPushCall("aaaaaaaa-0000-4000-8000-000000000001");
      await act(() => adapter.incoming("+33123456789"));
      expect(screen.queryByTestId("incoming-name")).toBeNull();
    } finally {
      Object.defineProperty(Platform, "OS", { get: () => original, configurable: true });
    }
  });

  it("can hide the in-app incoming screen", async () => {
    const { adapter } = await setup({ showIncomingScreen: false });
    await act(() => adapter.incoming("+33123456789"));
    expect(screen.queryByTestId("incoming-name")).toBeNull();
  });

  it("renders a custom active call UI", async () => {
    const { client } = await setup({
      renderActiveCall: ({ displayName }) => <Text testID="custom-ui">{`custom ${displayName}`}</Text>,
    });
    await act(() => client.newCall({ destination: "+1", displayName: "Z" }));
    expect(screen.getByTestId("custom-ui")).toHaveTextContent("custom Z");
  });

  it("toggles the speaker through the native bridge", async () => {
    const { client, native } = await setup();
    await act(() => client.newCall({ destination: "+1" }));
    await act(flush);
    await fireEvent.press(screen.getByTestId("call-speaker"));
    expect(native.setAudioRoute).toHaveBeenCalledWith("speaker");
  });
});
