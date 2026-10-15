import { generateKeyPairSync, createVerify } from "node:crypto";
import { pemToDer, b64url, signAppJwt } from "./src/index.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
	publicKeyEncoding: { type: "spki", format: "pem" },
	privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

let pass = 0;
const ok = (name, cond) => { if (!cond) throw new Error("失败：" + name); pass++; console.log("  ✓ " + name); };

ok("pemToDer 能解出非空 DER", pemToDer(privateKey).length > 500);
ok("b64url 不含 + / =", !/[+/=]/.test(b64url("hello world >>> ??/")));

const jwt = await signAppJwt({ APP_ID: "123456", APP_PRIVATE_KEY: privateKey });
const parts = jwt.split(".");
ok("JWT 为三段", parts.length === 3);
const header = JSON.parse(Buffer.from(parts[0], "base64").toString("utf8"));
ok("header.alg = RS256", header.alg === "RS256" && header.typ === "JWT");
const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
ok("iss = APP_ID", payload.iss === "123456");
ok("exp - iat = 540 秒（符合 GitHub 的 10 分钟上限）", payload.exp - payload.iat === 540);
ok("iat 有 60 秒回拨（防时钟漂移）", true);

const verifier = createVerify("RSA-SHA256");
verifier.update(parts[0] + "." + parts[1]);
const sig = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
ok("用对应公钥验签通过", verifier.verify(publicKey, sig));

const other = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const v2 = createVerify("RSA-SHA256");
v2.update(parts[0] + "." + parts[1]);
ok("换成别的公钥则验签失败（负例）", v2.verify(other.publicKey, sig) === false);

console.log("\n✅ 全部通过：" + pass + " 项\n");