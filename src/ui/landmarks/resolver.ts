import { LANDMARK_DATA, LandmarkRecord } from "./data";

export interface Landmark extends LandmarkRecord {
  /** Two-stop gradient used behind / instead of the photo. */
  colors: [string, string];
  /** Unicode flag, e.g. 🇬🇧. */
  flag: string;
}

export interface CountryMatch {
  iso: string;
  dial: string;
}

/** Custom resolver: return a landmark (or partial override) for a number, or undefined to use the default. */
export type LandmarkResolver = (phoneNumber: string, match: CountryMatch | null) => Partial<Landmark> | undefined;

/** Canadian NANP area codes; all other +1 numbers map to the US. */
const CANADA_AREA_CODES = new Set(
  "204 226 236 249 250 257 263 273 289 306 343 354 365 367 368 382 387 403 416 418 428 431 437 438 450 460 468 474 506 514 519 548 579 581 584 587 604 613 639 647 672 683 705 709 742 753 778 780 782 807 819 825 867 873 879 902 905 942".split(
    " ",
  ),
);

const PALETTES: [string, string][] = [
  ["#0f2027", "#2c5364"],
  ["#1d2b64", "#4b6cb7"],
  ["#232526", "#414345"],
  ["#141e30", "#243b55"],
  ["#3a1c71", "#8e54e9"],
  ["#0b486b", "#3b8d99"],
  ["#42275a", "#734b6d"],
  ["#1e3c72", "#2a5298"],
  ["#134e5e", "#2f7560"],
  ["#4b1248", "#8a2b56"],
];

export const DEFAULT_LANDMARK_COLORS: [string, string] = ["#0b1f1a", "#075e54"];

const byDial = new Map<string, LandmarkRecord[]>();
const byIso = new Map<string, LandmarkRecord>();
for (const rec of LANDMARK_DATA) {
  const list = byDial.get(rec.dial) ?? [];
  list.push(rec);
  byDial.set(rec.dial, list);
  if (!byIso.has(rec.iso)) byIso.set(rec.iso, rec);
}
const dialLengths = [...new Set(LANDMARK_DATA.map((r) => r.dial.length))].sort((a, b) => b - a);

export function flagEmoji(iso: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso)) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => base + c.charCodeAt(0) - 65));
}

function paletteFor(iso: string): [string, string] {
  let h = 0;
  for (const c of iso) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

/**
 * Work out the destination country from an international number (`+44…`, `0044…`) or a SIP URI
 * whose user part is such a number. National-format numbers (no country code) return null.
 */
export function resolveCountry(phoneNumber: string): CountryMatch | null {
  let s = phoneNumber.trim();
  const sip = /^sips?:([^@;]+)/i.exec(s);
  if (sip) s = sip[1];
  s = s.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) return null;
  const digits = s.slice(1).replace(/\D/g, "");
  if (!digits) return null;

  for (const len of dialLengths) {
    const prefix = digits.slice(0, len);
    const recs = byDial.get(prefix);
    if (!recs) continue;
    if (prefix === "1") {
      const area = digits.slice(1, 4);
      return { dial: "1", iso: CANADA_AREA_CODES.has(area) ? "CA" : "US" };
    }
    return { dial: prefix, iso: recs[0].iso };
  }
  return null;
}

/** Landmark metadata for a record, or a gradient-only placeholder when the country is unknown. */
export function landmarkForIso(iso: string | null | undefined): Landmark | null {
  if (!iso) return null;
  const rec = byIso.get(iso.toUpperCase());
  if (!rec) return null;
  return { ...rec, colors: paletteFor(rec.iso), flag: flagEmoji(rec.iso) };
}

/**
 * Landmark to show for a dialled number: London Eye for +44, Eiffel Tower for +33, …
 * `resolver` can replace or tweak the result (e.g. bundle your own images).
 */
export function resolveLandmark(phoneNumber: string, resolver?: LandmarkResolver): Landmark | null {
  const match = resolveCountry(phoneNumber);
  const base = landmarkForIso(match?.iso);
  const custom = resolver?.(phoneNumber, match);
  if (!custom) return base;
  const merged = { ...(base ?? {}), ...custom } as Landmark;
  merged.colors ??= base?.colors ?? DEFAULT_LANDMARK_COLORS;
  merged.flag ??= merged.iso ? flagEmoji(merged.iso) : "";
  return merged;
}

/** Every supported country (useful for prefetching images). */
export function allLandmarks(): Landmark[] {
  return [...byIso.values()].map((rec) => ({ ...rec, colors: paletteFor(rec.iso), flag: flagEmoji(rec.iso) }));
}
