import type { FilingConfig } from "@/types/config";

// 页脚备案 / 附加链接配置。
//
// 站主 2026-10-26：「我后面会换域名的，并且还会备案(现在没有这个打算)」。
// 所以这里全部是**预留位**，当前值一律为空 —— 空值不渲染任何东西：
//   - icp / police 都为空  -> 页脚连那一行都不出现（不是空行、不是占位符）
//   - extraLinks 为空数组  -> 页脚链接行保持原样，不多一个 <li>
//
// 将来备案下来后，只改这个文件即可（不要动 siteConfig.site_url 之外的任何地方）。
// 填写示例（现在不要填）：
//   icp: "京ICP备2026000000号-1",
//   police: "京公网安备11010502000000号",
//   policeUrl: "https://beian.mps.gov.cn/#/query/webSearch?code=11010502000000",
export const filingConfig: FilingConfig = {
	icp: "",
	police: "",
	extraLinks: [],
};
