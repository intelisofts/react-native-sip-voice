import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { SipVoiceClient } from "../../src/core/SipVoiceClient";
import { SipVoiceProvider } from "../../src/react/SipVoiceProvider";
import { CallConfirmPanel } from "../../src/ui/components/CallConfirmPanel";
import { CallOverlay } from "../../src/ui/components/CallOverlay";
import type { PreparingCall } from "../../src/ui/components/PreparingCallScreen";
import { digestCreds, FakeAdapter, FakeNative } from "../helpers/fakes";

const liveClients: SipVoiceClient[] = [];
afterEach(async () => {
  await Promise.all(liveClients.splice(0).map((c) => c.destroy()));
});

async function setup(preparing: PreparingCall | null) {
  const adapter = new FakeAdapter();
  const client = new SipVoiceClient({}, { adapter });
  liveClients.push(client);
  await client.connect(digestCreds);
  const ui = (p: PreparingCall | null) => (
    <SipVoiceProvider client={client} native={new FakeNative()}>
      <CallOverlay preparing={p} />
    </SipVoiceProvider>
  );
  const r = await render(ui(preparing));
  return { client, rerender: (p: PreparingCall | null) => r.rerender(ui(p)) };
}

const base = (over: Partial<PreparingCall> = {}): PreparingCall => ({
  phoneNumber: "+447700900123",
  status: "Checking your plan…",
  onCancel: jest.fn(),
  ...over,
});

describe("CallOverlay preparing phase", () => {
  it("shows the call screen immediately with name, country and status", async () => {
    await setup(base({ displayName: "Jane" }));
    expect(screen.getByTestId("call-overlay-modal")).toBeTruthy();
    expect(screen.getByTestId("preparing-name")).toHaveTextContent("Jane");
    expect(screen.getByTestId("preparing-country-chip")).toHaveTextContent(/United Kingdom/);
    expect(screen.getByTestId("preparing-status")).toHaveTextContent("Checking your plan…");
  });

  it("renders progress steps", async () => {
    await setup(
      base({
        steps: [
          { key: "plan", label: "Checking your plan", state: "done" },
          { key: "connect", label: "Securing connection", state: "active" },
          { key: "dial", label: "Calling", state: "pending" },
        ],
      }),
    );
    expect(screen.getByTestId("preparing-step-plan").props.accessibilityLabel).toBe("Checking your plan: done");
    expect(screen.getByTestId("preparing-step-connect").props.accessibilityLabel).toBe("Securing connection: active");
    expect(screen.getByTestId("preparing-step-dial")).toBeTruthy();
  });

  it("cancels from the end button", async () => {
    const onCancel = jest.fn();
    await setup(base({ onCancel }));
    await fireEvent.press(screen.getByTestId("preparing-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows an error with a close button", async () => {
    await setup(base({ error: "Not enough balance" }));
    expect(screen.getByTestId("preparing-status")).toHaveTextContent("Not enough balance");
    expect(screen.getByText("Hide")).toBeTruthy();
  });

  it("renders a custom panel such as a price confirmation", async () => {
    const onConfirm = jest.fn();
    await setup(
      base({
        panel: (
          <CallConfirmPanel
            title="Pay as you go"
            highlight="$0.05 / min"
            details={[{ label: "Destination", value: "United Kingdom" }]}
            confirmLabel="Call now"
            onConfirm={onConfirm}
          />
        ),
      }),
    );
    expect(screen.getByText("$0.05 / min")).toBeTruthy();
    expect(screen.getByText("Destination")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("call-confirm"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("hands over to the real call inside the same modal", async () => {
    const { client, rerender } = await setup(base({ displayName: "Jane" }));
    const modalBefore = screen.getByTestId("call-overlay-modal");
    await act(() => client.newCall({ destination: "+447700900123", displayName: "Jane" }));
    await rerender(null);
    expect(screen.queryByTestId("preparing-call-screen")).toBeNull();
    expect(screen.getByTestId("call-name")).toHaveTextContent("Jane");
    expect(screen.getByTestId("call-overlay-modal")).toBe(modalBefore);
  });

  it("ignores preparing while a call is live", async () => {
    const { client } = await setup(null);
    await act(() => client.newCall({ destination: "+1" }));
    expect(screen.queryByTestId("preparing-call-screen")).toBeNull();
  });

  it("renders nothing when neither preparing nor a call exist", async () => {
    await setup(null);
    expect(screen.queryByTestId("call-overlay-modal")).toBeNull();
  });
});
