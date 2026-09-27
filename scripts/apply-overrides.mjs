// Replaces entries whose Wikipedia lead image is a logo/map with hand-picked free photos.
import fs from "fs";
const UA = { "User-Agent": "react-native-sip-voice-landmarks/0.1" };
const overrides = JSON.parse(fs.readFileSync(new URL("./overrides.json", import.meta.url)));
const dataPath = new URL("../src/ui/landmarks/data.ts", import.meta.url);
const strip = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const titles = Object.values(overrides).map((o) => "File:" + o.file).join("|");
const j = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1080&titles=${encodeURIComponent(titles)}`, { headers: UA })).json();
const info = {};
for (const p of j.query.pages) {
  const ii = p.imageinfo?.[0];
  if (!ii) { console.error("missing", p.title); continue; }
  const md = ii.extmetadata || {};
  info[p.title.replace(/^File:/, "").replace(/ /g, "_")] = {
    imageUrl: (ii.thumburl || ii.url).split("?")[0], sourcePage: ii.descriptionurl,
    author: strip(md.Artist?.value).slice(0, 80), license: strip(md.LicenseShortName?.value),
  };
}
let src = fs.readFileSync(dataPath, "utf8");
for (const [iso, o] of Object.entries(overrides)) {
  const i = info[o.file.replace(/ /g, "_")];
  if (!i) continue;
  const re = new RegExp(`  \\{ dial: "(\\d+)", iso: "${iso}", country: ("[^"]+"), landmark: "[^"]+", city: ("[^"]+")[^\\n]*\\},\\n`);
  src = src.replace(re, (_m, dial, country, city) =>
    `  { dial: "${dial}", iso: "${iso}", country: ${country}, landmark: ${JSON.stringify(o.landmark)}, city: ${city}, imageUrl: ${JSON.stringify(i.imageUrl)}, sourcePage: ${JSON.stringify(i.sourcePage)}, author: ${JSON.stringify(i.author)}, license: ${JSON.stringify(i.license)} },\n`);
  console.log(iso, o.landmark, i.license, i.author);
}
fs.writeFileSync(dataPath, src);
