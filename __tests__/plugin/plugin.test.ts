import withSipVoice, { addBackgroundModes } from "../../plugin/src";

type Mod = (cfg: any) => any;

function runMods(config: any) {
  const mods = config.mods?.ios ?? {};
  const info = { modResults: { UIBackgroundModes: ["fetch"], ...(config._info ?? {}) } };
  const ent = { modResults: { ...(config._ent ?? {}) } };
  const infoOut = mods.infoPlist ? (mods.infoPlist as Mod)(info) : info;
  const entOut = mods.entitlements ? (mods.entitlements as Mod)(ent) : ent;
  return { info: infoOut, ent: entOut };
}

jest.mock("@expo/config-plugins", () => {
  const actual = jest.requireActual("@expo/config-plugins");
  // Replace the mod wrappers with synchronous versions we can execute directly.
  const wrap = (key: string) => (config: any, action: Mod) => {
    config.mods ??= {};
    config.mods.ios ??= {};
    const prev = config.mods.ios[key];
    config.mods.ios[key] = (c: any) => action(prev ? prev(c) : c);
    return config;
  };
  return { ...actual, withInfoPlist: wrap("infoPlist"), withEntitlementsPlist: wrap("entitlements") };
});

describe("config plugin", () => {
  it("adds voip + audio background modes without duplicates", () => {
    expect(addBackgroundModes(["audio", "fetch"], ["audio", "voip"])).toEqual(["audio", "fetch", "voip"]);
    expect(addBackgroundModes(undefined, ["voip"])).toEqual(["voip"]);
  });

  it("sets Info.plist keys and leaves push disabled by default", () => {
    const config = withSipVoice({ name: "app", slug: "app" } as any);
    const { info, ent } = runMods(config);
    expect(info.modResults.UIBackgroundModes).toEqual(["fetch", "audio", "voip"]);
    expect(info.modResults.NSMicrophoneUsageDescription).toMatch(/microphone/);
    expect(info.modResults.SipVoiceEnableVoipPush).toBe(false);
    expect(ent.modResults["aps-environment"]).toBeUndefined();
  });

  it("keeps an existing microphone description", () => {
    const config = withSipVoice({ name: "app", slug: "app", _info: { NSMicrophoneUsageDescription: "Mine" } } as any);
    expect(runMods(config).info.modResults.NSMicrophoneUsageDescription).toBe("Mine");
  });

  it("enables VoIP push and aps-environment when requested", () => {
    const config = withSipVoice({ name: "app", slug: "app" } as any, { voipPush: true, apsEnvironment: "production" });
    const { info, ent } = runMods(config);
    expect(info.modResults.SipVoiceEnableVoipPush).toBe(true);
    expect(ent.modResults["aps-environment"]).toBe("production");
  });

  it("does not override an existing aps-environment", () => {
    const config = withSipVoice({ name: "app", slug: "app", _ent: { "aps-environment": "development" } } as any, {
      voipPush: true,
      apsEnvironment: "production",
    });
    expect(runMods(config).ent.modResults["aps-environment"]).toBe("development");
  });
});
