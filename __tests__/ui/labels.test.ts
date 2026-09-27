import { CallState } from "../../src/core/types";
import { defaultLabels, initials, statusText } from "../../src/ui/labels";
import { defaultCallUITheme, mergeTheme } from "../../src/ui/theme";

describe("statusText", () => {
  it.each([
    [CallState.CONNECTING, 0, false, "Calling…"],
    [CallState.CONNECTING, 0, true, "Connecting…"],
    [CallState.RINGING, 0, false, "Ringing…"],
    [CallState.RINGING, 0, true, "Incoming voice call"],
    [CallState.ACTIVE, 133, false, "02:13"],
    [CallState.HELD, 61, false, "On hold · 01:01"],
    [CallState.RECONNECTING, 10, false, "Reconnecting…"],
    [CallState.ENDED, 0, false, "Call ended"],
    [CallState.ENDED, 75, false, "Call ended · 01:15"],
    [CallState.FAILED, 0, false, "Call failed"],
    [null, 0, false, ""],
  ])("%s (%ss, incoming=%s) -> %s", (state, secs, incoming, text) => {
    expect(statusText(state, secs, { incoming })).toBe(text);
  });

  it("uses custom labels", () => {
    expect(statusText(CallState.RINGING, 0, { labels: { ...defaultLabels, ringing: "Sonne…" } })).toBe("Sonne…");
  });
});

describe("initials", () => {
  it.each([
    ["Jane Doe", "JD"],
    ["jane", "J"],
    ["Jean-Luc van Picard", "JP"],
    ["+44 7700 900123", "#"],
    ["", "#"],
  ])("%p -> %p", (name, out) => {
    expect(initials(name)).toBe(out);
  });
});

describe("theme", () => {
  it("merges overrides onto defaults", () => {
    const t = mergeTheme({ accent: "#123456" });
    expect(t.accent).toBe("#123456");
    expect(t.danger).toBe(defaultCallUITheme.danger);
    expect(mergeTheme()).toEqual(defaultCallUITheme);
  });
});
