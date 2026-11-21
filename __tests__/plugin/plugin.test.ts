import withSipVoice, { CALL_EVENT_RECEIVER, callkitOptions } from "../../plugin/src";

// Records the plugins applied instead of running them (expo-callkit-telecom's plugin is tested by that package).
jest.mock("@expo/config-plugins", () => ({
  ...jest.requireActual("@expo/config-plugins"),
  withPlugins: (config: any, plugins: any[]) => ({ ...config, applied: plugins }),
}));

describe("config plugin", () => {
  it("applies expo-callkit-telecom for voice calls, with the SBC's ring window and the decline receiver", () => {
    const config = withSipVoice({ name: "app", slug: "app" } as any) as any;
    expect(config.applied).toEqual([
      [
        "expo-callkit-telecom",
        expect.objectContaining({
          supportsVideo: false,
          incomingCallTimeout: 45,
          androidEventReceiver: CALL_EVENT_RECEIVER,
          microphonePermission: expect.stringMatching(/microphone/),
        }),
      ],
    ]);
  });

  it("passes the app's expo-callkit-telecom options through, but always keeps the decline receiver", () => {
    const options = callkitOptions({
      microphonePermission: "Mic for calls",
      callkit: { notificationIconAndroid: "./icon.png", incomingCallTimeout: 30, androidEventReceiver: ".Other" },
    });
    expect(options).toMatchObject({
      microphonePermission: "Mic for calls",
      notificationIconAndroid: "./icon.png",
      incomingCallTimeout: 30,
      androidEventReceiver: CALL_EVENT_RECEIVER,
    });
  });
});
