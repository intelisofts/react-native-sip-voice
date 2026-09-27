// Regenerates ATTRIBUTION.md from src/ui/landmarks/data.ts.
import fs from "fs";
const src = fs.readFileSync(new URL("../src/ui/landmarks/data.ts", import.meta.url), "utf8");
const rows = [...src.matchAll(/^  \{ (.*) \},$/gm)].map((m) => Function(`return {${m[1]}}`)());
const seen = new Set();
let md = "# Image attribution\n\nThe call screen shows a photo of a well-known landmark in the destination country. Images load at runtime from Wikimedia (nothing is bundled) and are used under the licences below. The call screen also shows a short credit line for each photo.\n\n| Country | Landmark | Author | Licence | Source |\n|---|---|---|---|---|\n";
for (const r of rows) {
  if (!r.imageUrl || seen.has(r.imageUrl)) continue;
  seen.add(r.imageUrl);
  md += `| ${r.country} | ${r.landmark} | ${(r.author || "Unknown").replace(/\|/g, "/")} | ${r.license || "see source"} | [file page](${r.sourcePage}) |\n`;
}
fs.writeFileSync(new URL("../ATTRIBUTION.md", import.meta.url), md);
console.log(`${rows.length} countries, ${seen.size} images`);
