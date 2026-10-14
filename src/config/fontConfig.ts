/**
 * 字体配置（统一入口）— 已对齐上游 Astro Font API 新版结构
 *
 * - fontsList：Astro Font API 字体定义（自动下载、缓存、优化加载）
 * - fontConfig：字体选择与区域覆盖
 *
 * 说明（本地定制）：本地原先的自定义字体功能为关闭状态（enable: false），
 * 合并后保持关闭，避免引入未经校验的字体下载行为。原 MiSans 字体通过
 * unpkg 的 CSS 链接引入，不属于 Astro Font API 的内置 provider，
 * 如需启用请改用 provider: "local"（把字体文件放到 public/assets/fonts/）
 * 或 provider: "npm"。
 */
import type { FontDefinition, FontSelectionConfig } from "@/types/fontConfig";

// ─── Astro Font API 字体定义 ───────────────────────────────
export const fontsList: FontDefinition[] = [
	{
		name: "Zen Maru Gothic",
		cssVariable: "--font-zen-maru-gothic",
		provider: "fontsource",
		weights: ["300", "400", "500", "700", "900"],
		styles: ["normal"],
		subsets: ["latin"],
		fallbacks: ["sans-serif"],
	},
	{
		name: "Inter",
		cssVariable: "--font-inter",
		provider: "fontsource",
		weights: ["300", "400", "500", "600", "700"],
		styles: ["normal"],
		subsets: ["latin"],
		fallbacks: ["sans-serif"],
	},
	{
		name: "JetBrains Mono",
		cssVariable: "--font-jetbrains-mono",
		provider: "fontsource",
		weights: ["400", "700"],
		styles: ["normal"],
		subsets: ["latin"],
		fallbacks: [
			"ui-monospace",
			"SFMono-Regular",
			"Menlo",
			"Monaco",
			"Consolas",
			"Liberation Mono",
			"Courier New",
			"monospace",
		],
	},
];

// ─── 字体选择与区域覆盖 ─────────────────────────────────────
export const fontConfig: FontSelectionConfig = {
	// 是否启用自定义字体功能
	// 保持本地原状：关闭。
	// 注意：enable=true 时 Astro Font API 会在**构建期**从 CDN（jsdelivr）下载字体文件，
	// 网络受限环境下会直接导致构建失败（[CannotFetchFontFile]）。
	// 如需启用，请确保构建机可访问对应 CDN，或改用 provider: "local" 并自备字体文件。
	enable: false,
	// 当前选择的字体 CSS 变量名，使用 "system" 表示系统字体
	selected: ["system"],
	// 各区域独立字体（留空则使用全局 selected）
	bannerTitleFont: "",
	bannerSubtitleFont: "",
	navbarTitleFont: "",
	// 代码块字体
	codeFont: "--font-jetbrains-mono",
};
