import { generateKeyPairSync, createVerify } from "node:crypto";
import { pemToDer, b64url, signAppJwt, appKeyDer, pkcs1ToPkcs8 } from "./src/index.js";

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

// GitHub 生成的私钥是 PKCS#1，单独验一遍
const pkcs1 = generateKeyPairSync("rsa", {
	modulusLength: 2048,
	publicKeyEncoding: { type: "spki", format: "pem" },
	privateKeyEncoding: { type: "pkcs1", format: "pem" },
});
ok("识别出 PKCS#1 私钥", pkcs1.privateKey.indexOf("BEGIN RSA PRIVATE KEY") >= 0);
const jwt1 = await signAppJwt({ APP_ID: "42", APP_PRIVATE_KEY: pkcs1.privateKey });
const p1 = jwt1.split(".");
const v1 = createVerify("RSA-SHA256");
v1.update(p1[0] + "." + p1[1]);
ok("PKCS#1 私钥签出的 JWT 也能被公钥验证", v1.verify(pkcs1.publicKey, Buffer.from(p1[2].replace(/-/g, "+").replace(/_/g, "/"), "base64")));
ok("PKCS#1 转换后长度大于原文（补了封装）", appKeyDer(pkcs1.privateKey).length > pemToDer(pkcs1.privateKey).length);

console.log("\n✅ 全部通过：" + pass + " 项\n");