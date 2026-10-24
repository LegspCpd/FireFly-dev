import fs from "node:fs";
const read = (p) => JSON.parse(fs.readFileSync("node_modules/@iconify-json/" + p, "utf8"));
const si = read("simple-icons/icons.json");
const mdi = read("mdi/icons.json");
const out = {};
for (const k of ["github", "x", "rss"]) {
  const i = si.icons[k];
  out[k] = { vb: "0 0 " + (i.width || si.width) + " " + (i.height || si.height), body: i.body };
}
{
  const i = mdi.icons.email;
  out.email = { vb: "0 0 " + (i.width || mdi.width) + " " + (i.height || mdi.height), body: i.body };
}
fs.writeFileSync(".shots/social-icons.json", JSON.stringify(out, null, 2));
for (const [k, v] of Object.entries(out)) console.log(k, v.vb, "len", v.body.length);
