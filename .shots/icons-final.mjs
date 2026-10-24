import fs from "node:fs";
const j = JSON.parse(fs.readFileSync(".shots/social-icons.json", "utf8"));
const out = {};
for (const [k, v] of Object.entries(j)) {
  const m = /d="([^"]+)"/.exec(v.body);
  out[k] = { vb: v.vb, d: m[1] };
  console.log(k, v.vb, "dlen", m[1].length);
}
fs.writeFileSync(".shots/social-icons-d.json", JSON.stringify(out, null, 2));
