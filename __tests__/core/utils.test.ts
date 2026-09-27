import {
  formatDuration,
  normalizePhoneNumber,
  reasonFromStatusCode,
  toSipUri,
  uuidv4,
} from "../../src/core/utils";

describe("uuidv4", () => {
  it("produces RFC 4122 v4 UUIDs accepted by CallKit", () => {
    for (let i = 0; i < 50; i++) {
      expect(uuidv4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});

describe("normalizePhoneNumber", () => {
  it.each([
    ["00447700900123", "+447700900123"],
    ["+44 (7700) 900-123", "+447700900123"],
    [" 020 7946 0958 ", "02079460958"],
    ["sip:bob@example.com", "sip:bob@example.com"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });
});

describe("toSipUri", () => {
  it("wraps numbers with the domain", () => {
    expect(toSipUri("+447700900123", "sbc.example.com")).toBe("sip:+447700900123@sbc.example.com");
  });
  it("passes through full URIs", () => {
    expect(toSipUri("sips:bob@other.com", "sbc.example.com")).toBe("sips:bob@other.com");
  });
  it("prefixes user@host with sip:", () => {
    expect(toSipUri("bob@other.com", "sbc.example.com")).toBe("sip:bob@other.com");
  });
  it("converts 00 to +", () => {
    expect(toSipUri("0033123", "d")).toBe("sip:+33123@d");
  });
});

describe("reasonFromStatusCode", () => {
  it.each([
    [486, "busy"],
    [600, "busy"],
    [480, "no_answer"],
    [408, "no_answer"],
    [403, "rejected"],
    [603, "rejected"],
    [404, "unavailable"],
    [503, "unavailable"],
    [500, "failed"],
    [undefined, "failed"],
  ])("%s -> %s", (code, reason) => {
    expect(reasonFromStatusCode(code as number | undefined)).toBe(reason);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "00:00"],
    [5, "00:05"],
    [65, "01:05"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3725, "1:02:05"],
    [-3, "00:00"],
  ])("%s -> %s", (s, out) => {
    expect(formatDuration(s)).toBe(out);
  });
});
