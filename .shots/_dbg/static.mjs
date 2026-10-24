import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = "F:/Github/Firefly/dist/client";
const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".woff2":"font/woff2", ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp", ".xml":"application/xml", ".txt":"text/plain" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  let f = path.join(root, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    const alt = path.join(f, "index.html");
    if (fs.existsSync(alt)) f = alt; else { res.writeHead(404); res.end("nf"); return; }
  }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(4400, () => console.log("static on 4400"));
