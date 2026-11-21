import { fireEvent, render, screen } from "@testing-library/react-native";

import { RateCallSheet } from "../../src/ui/components/RateCallSheet";

describe("RateCallSheet", () => {
  it("renders nothing when not visible", async () => {
    await render(<RateCallSheet visible={false} displayName="Jane Doe" onClose={() => {}} />);
    expect(screen.queryByTestId("rate-call-sheet")).toBeNull();
  });

  it("shows the name and thumbs up/down, skippable without rating", async () => {
    const onRate = jest.fn();
    const onClose = jest.fn();
    await render(<RateCallSheet visible displayName="Jane Doe" onRate={onRate} onClose={onClose} />);

    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByTestId("call-rate-up")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("call-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRate).not.toHaveBeenCalled();
  });

  it("reports the rating once and shows thanks instead of the thumbs", async () => {
    const onRate = jest.fn();
    await render(<RateCallSheet visible displayName="Jane Doe" onRate={onRate} onClose={() => {}} />);

    await fireEvent.press(screen.getByTestId("call-rate-up"));
    expect(onRate).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId("call-rate-up")).toBeNull();
    expect(screen.getByTestId("call-rate-thanks")).toBeTruthy();
  });

  it("hides the thumbs entirely when the host provides no onRate", async () => {
    await render(<RateCallSheet visible displayName="Jane Doe" onClose={() => {}} />);
    expect(screen.queryByTestId("call-rate-up")).toBeNull();
  });

  it("offers Call Again only when the host provides it", async () => {
    await render(<RateCallSheet visible displayName="Jane Doe" onClose={() => {}} />);
    expect(screen.queryByTestId("call-again")).toBeNull();

    const onCallAgain = jest.fn();
    await render(<RateCallSheet visible displayName="Jane Doe" onClose={() => {}} onCallAgain={onCallAgain} />);
    await fireEvent.press(screen.getByTestId("call-again"));
    expect(onCallAgain).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop press", async () => {
    const onClose = jest.fn();
    await render(<RateCallSheet visible displayName="Jane Doe" onClose={onClose} />);
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
