import { LANDMARK_DATA } from "../../src/ui/landmarks/data";
import {
  allLandmarks,
  DEFAULT_LANDMARK_COLORS,
  flagEmoji,
  landmarkForIso,
  resolveCountry,
  resolveLandmark,
} from "../../src/ui/landmarks/resolver";

describe("resolveCountry", () => {
  it.each([
    ["+447700900123", "GB", "44"],
    ["0044 7700 900123", "GB", "44"],
    ["+33 1 23 45 67 89", "FR", "33"],
    ["+12125550123", "US", "1"],
    ["+14165550123", "CA", "1"],
    ["+16045550123", "CA", "1"],
    ["+79161234567", "RU", "7"],
    ["+77011234567", "KZ", "77"],
    ["+971501234567", "AE", "971"],
    ["+254712345678", "KE", "254"],
    ["+923001234567", "PK", "92"],
    ["+8613800138000", "CN", "86"],
    ["+85291234567", "HK", "852"],
    ["sip:+447700900123@sbc.example.com", "GB", "44"],
  ])("%s -> %s", (number, iso, dial) => {
    expect(resolveCountry(number)).toEqual({ iso, dial });
  });

  it.each(["07700900123", "", "+", "sip:alice@example.com", "+999123"])("returns null for %p", (n) => {
    expect(resolveCountry(n)).toBeNull();
  });
});

describe("resolveLandmark", () => {
  it("shows the London Eye for +44", () => {
    const l = resolveLandmark("+447700900123")!;
    expect(l.landmark).toBe("London Eye");
    expect(l.city).toBe("London");
    expect(l.country).toBe("United Kingdom");
    expect(l.flag).toBe("🇬🇧");
    expect(l.imageUrl).toMatch(/^https:\/\/(upload|thumb)\.wikimedia\.org\//);
    expect(l.license).toBeTruthy();
    expect(l.colors).toHaveLength(2);
  });

  it.each([
    ["+33123456789", "Eiffel Tower"],
    ["+12125550123", "Statue of Liberty"],
    ["+14165550123", "CN Tower"],
    ["+919812345678", "Taj Mahal"],
    ["+971501234567", "Burj Khalifa"],
    ["+81312345678", "Mount Fuji"],
  ])("%s -> %s", (n, name) => {
    expect(resolveLandmark(n)?.landmark).toBe(name);
  });

  it("returns null for unknown / national numbers", () => {
    expect(resolveLandmark("07700900123")).toBeNull();
  });

  it("lets a custom resolver override fields", () => {
    const l = resolveLandmark("+447700900123", () => ({ imageUrl: "https://cdn.example.com/london.jpg" }))!;
    expect(l.imageUrl).toBe("https://cdn.example.com/london.jpg");
    expect(l.landmark).toBe("London Eye");
  });

  it("lets a custom resolver supply a landmark for unknown numbers", () => {
    const l = resolveLandmark("0201234", () => ({ iso: "GB", landmark: "Big Ben", city: "London", country: "UK" }))!;
    expect(l.landmark).toBe("Big Ben");
    expect(l.colors).toEqual(DEFAULT_LANDMARK_COLORS);
    expect(l.flag).toBe("🇬🇧");
  });

  it("receives the country match", () => {
    const resolver = jest.fn(() => undefined);
    resolveLandmark("+33123", resolver);
    expect(resolver).toHaveBeenCalledWith("+33123", { iso: "FR", dial: "33" });
  });
});

describe("landmark data", () => {
  it("covers a broad set of countries with valid records", () => {
    expect(LANDMARK_DATA.length).toBeGreaterThanOrEqual(80);
    for (const r of LANDMARK_DATA) {
      expect(r.dial).toMatch(/^\d{1,3}$/);
      expect(r.iso).toMatch(/^[A-Z]{2}$/);
      expect(r.country && r.landmark && r.city).toBeTruthy();
      if (r.imageUrl) {
        expect(r.imageUrl).toMatch(/^https:\/\/(upload|thumb)\.wikimedia\.org\/wikipedia\/(commons|en)\//);
        expect(r.imageUrl).not.toMatch(/logo|map|flag|\.svg/i);
        expect(r.sourcePage).toMatch(/^https:\/\//);
        expect(r.license).toMatch(/CC|Public domain|FAL|KOGL/i);
      }
    }
  });

  it("has an image for at least 95% of countries", () => {
    const withImage = LANDMARK_DATA.filter((r) => r.imageUrl).length;
    expect(withImage / LANDMARK_DATA.length).toBeGreaterThan(0.95);
  });

  it("allLandmarks returns one entry per country", () => {
    const all = allLandmarks();
    expect(new Set(all.map((l) => l.iso)).size).toBe(all.length);
  });

  it("landmarkForIso is case-insensitive and null-safe", () => {
    expect(landmarkForIso("fr")?.landmark).toBe("Eiffel Tower");
    expect(landmarkForIso("ZZ")).toBeNull();
    expect(landmarkForIso(null)).toBeNull();
  });
});

describe("flagEmoji", () => {
  it("builds regional indicator flags", () => {
    expect(flagEmoji("fr")).toBe("🇫🇷");
    expect(flagEmoji("XYZ")).toBe("");
  });
});
