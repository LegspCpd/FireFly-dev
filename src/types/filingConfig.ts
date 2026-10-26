// 页脚备案 / 附加链接配置的类型定义。
//
// 为什么单独一个文件、而不是塞进 SiteConfig：备案是「以后换域名 + 备案」才需要的东西，
// 与站点基础信息（标题 / URL / 主题色）生命周期不同；分开后将来改域名时只动 siteConfig.site_url，
// 备案信息在这里独立维护。
//
// 约定：**所有字段都可选，默认全空**。空值一律不渲染任何节点 ——
// 不留空壳 <div>、不留占位符文字、不留「备案号：暂无」。

/** 页脚附加链接：追加到现有页脚链接行末尾（沿用 .ef-foot-links 的竖细线分隔） */
export type FooterExtraLink = {
	/** 链接文字 */
	label: string;
	/** 链接地址：站内路径（"/about/"）或绝对地址（"https://example.com"） */
	url: string;
	/**
	 * 是否按外链处理（target="_blank" + rel="noopener noreferrer"）。
	 * 不填时按 url 是否以 http(s):// 开头自动判断。
	 */
	external?: boolean;
};

/** 备案信息与页脚附加链接 */
export type FilingConfig = {
	/** ICP 备案号，例："京ICP备2026000000号-1"。留空 = 不渲染备案行。 */
	icp?: string;
	/** ICP 备案跳转地址；留空时用工信部备案系统首页。 */
	icpUrl?: string;
	/** 公安联网备案号，例："京公网安备11010502000000号"。留空 = 该项不出现。 */
	police?: string;
	/** 公安备案跳转地址；留空则只输出备案号文字、不生成链接。 */
	policeUrl?: string;
	/** 页脚附加链接；留空数组 = 不输出任何额外节点。 */
	extraLinks?: FooterExtraLink[];
};
