// 站点管理面板的构建期配置（纯静态站点唯一做得到的「门禁」）。
//
// 先说实话：这个站没有服务端，页面 HTML/JS 由 CDN 原样吐出，所以写进产物的任何东西
// ——包括下面这枚 SHA-256——都是公开的。因此：
//   · passwordHash 只存哈希，明文只写在 docs/admin-panel.md（站主自己看，不进代码/产物）；
//   · 前端密码 + 随机路径都只是「遮挡」，不是访问控制（有 hash 就能离线爆破，路径也会漏）；
//   · 真正的锁是 PAT：别人就算进了面板，没有站主的 fine-grained token，GitHub 会拒绝每一次写入。
//   · 想要真鉴权（服务端校验），见 docs/admin-panel.md 的「安全边界」一节。

export type AdminPanelConfig = {
	/** false = 整个面板页不生成（构建期连路由都不注入） */
	enabled: boolean;
	/** 面板路径的随机 slug，最终路由为 /<path>/；写 admin 之类会被保留名单挡下 */
	path: string;
	/** 访问密码的 SHA-256（小写十六进制）。空字符串 = 不启用密码门 */
	passwordHash: string;
	/** 可选提示，显示在密码输入框下面 */
	passwordHint: string;
};

// 路径必须是「像随机串」的 slug：小写字母数字加连字符，长度 >= 4
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{3,62}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
// 被替换掉的旧路径、以及别的工具占用的路径，都不许再被用作面板路径。
// 本机 Keystatic 后台占的是它自己那条 dev-only 路由 —— 别把面板挂过去，也别在字符串里留它
// （否则 dist 里会多出这个关键词，验收时 grep keystatic 就不为 0 了）。
const RESERVED_PATHS = ["admin", "api"];

export const adminPanelConfig: AdminPanelConfig = {
	enabled: true,
	// 随机路径（不是 /admin/）。换路径 = 改这一行 → 旧路径立刻 404，旧的 /admin/ 从来不存在。
	path: "p-c8bd3a",
	// 明文口令不在仓库任何位置（源码与 docs 都会公开）：只在部署时由站主自持。
	// 要换口令：sha256sum 算出新哈希粘到这里，明文自己记。
	passwordHash: "3c61ad4d643069d0d849bb278ee71c25978a3ce4d9189bc8d7a874922f89ef6d",
	// 显示在密码框下面的提示：只给到「是哪种东西」，不给答案
	passwordHint: "站主自定的 35 位口令，格式见 docs/admin-panel.md（上线后请立刻改掉默认值）",
};

// 默认安全：配置写错就让构建失败，而不是悄悄发布一个没门禁/撞名的面板
if (adminPanelConfig.enabled) {
	if (!SLUG_PATTERN.test(adminPanelConfig.path) || RESERVED_PATHS.includes(adminPanelConfig.path)) {
		throw new Error(
			`adminConfig.path 非法："${adminPanelConfig.path}"。需要 4~63 位小写 slug，且不能是 ${RESERVED_PATHS.join("/")}`,
		);
	}
	if (adminPanelConfig.passwordHash !== "" && !SHA256_PATTERN.test(adminPanelConfig.passwordHash)) {
		throw new Error("adminConfig.passwordHash 必须是 64 位小写十六进制 SHA-256，或留空表示不要密码门");
	}
}
