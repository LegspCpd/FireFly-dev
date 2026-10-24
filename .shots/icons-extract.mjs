import fs from "node:fs";
const read = (p) => JSON.parse(fs.readFileSync("node_modules/@iconify-json/" + p, "utf8"));
const si = read("simple-icons/icons.json");
const ic = read("ic/icons.json");
console.log("si candidates:", Object.keys(si.icons).filter((k) => /^(github|x|rss|mail|gmail|mastodon|bluesky)/.test(k)).join(", "));
for (const k of ["github", "x", "rss"]) {
  const i = si.icons[k];
  console.log(k, "size", (i.width || si.width) + "x" + (i.height || si.height), "len", i.body.length);
}
console.log("ic email:", JSON.stringify(ic.icons.email || null).slice(0, 400));
