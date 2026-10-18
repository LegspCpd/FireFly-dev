import type { BackgroundWallpaperConfig } from "@/types/config";

export const backgroundWallpaper: BackgroundWallpaperConfig = {
	// 壁纸模式："banner" 横幅壁纸，"overlay" 全屏透明，"none" 纯色背景无壁纸
	// endfield-ui：纸面优先，全屏壁纸会盖住纸底，故关闭（图片仍保留，随时可切回 "overlay"）
	mode: "none",
	/**
	 * 背景图片配置
	 * 图片路径支持三种格式：
	 * 1. public 目录（以 "/" 开头，不优化）："/assets/images/banner.avif"
	 * 2. src 目录（不以 "/" 开头，自动优化但会增加构建时间，推荐）："assets/images/banner.avif"
	 * 3. 远程 URL："https://example.com/banner.jpg"
	 * 注意：远程 URL 和 public 目录的图片不会被优化，请确保图片体积足够小以免影响加载速度
	 */
	src: {
		desktop: [],
		mobile: [],
	},

	// ── 横幅壁纸与全屏壁纸共享配置（上游已将 homeText/carousel/waves 迁移到 common）──
	common: {
		// 壁纸遮罩暗度，让横幅文字显示更清晰，0-1 之间，值越大越暗
		dimOpacity: 0.2,

		// 主页横幅文字
		homeText: {
			// 是否启用主页横幅文字
			enable: false,
			// 主页横幅主标题
			title: "",
			// 主页横幅主标题字体大小
			titleSize: "3.8rem",
			// 主页横幅副标题
			subtitle: [
				"In Reddened Chrysalis, I Once Rest",
				"From Shattered Sky, I Free Fall",
				"Amidst Silenced Stars, I Deep Sleep",
				"Upon Lighted Fyrefly, I Soon Gaze",
				"From Undreamt Night, I Thence Shine",
				"In Finalized Morrow, I Full Bloom",
			],
			// 主页横幅副标题字体大小
			subtitleSize: "1.5rem",
			typewriter: {
				// 是否启用打字机效果
				// 打字机开启 → 循环显示所有副标题
				// 打字机关闭 → 每次刷新随机显示一条副标题
				enable: true,
				// 打字速度（毫秒）
				speed: 100,
				// 删除速度（毫秒）
				deleteSpeed: 50,
				// 完全显示后的暂停时间（毫秒）
				pauseTime: 2000,
			},
		},

		// 横幅图片轮播配置，仅在配置多张图片时生效
		carousel: {
			// 是否启用横幅图片轮播；关闭时保持每次刷新随机显示一张
			enable: true,
			// 轮播切换间隔（毫秒）
			interval: 5000,
		},

		// 水波纹动画效果配置，开启会影响页面性能，请根据自己的喜好开启
		waves: {
			enable: {
				// 桌面端是否启用水波纹动画效果
				desktop: true,
				// 移动端是否启用水波纹动画效果
				mobile: true,
			},
		},
	},

	// Banner 模式特有配置
	banner: {
		// 图片位置
		// 支持所有 CSS object-position 值，如: 'top', 'center', 'bottom', 'left top', 'right bottom', '25% 75%', '10px 20px'..
		position: "0% 20%",
		// 横幅导航栏配置
		navbar: {
			// 横幅导航栏透明模式："semi" 半透明，"semifull" 动态透明，"none" 纯色不透明
			transparentMode: "semifull",
			// 毛玻璃模糊度，0 即关闭导航栏毛玻璃
			blur: 10,
		},
	},

	// 全屏透明覆盖模式特有配置
	overlay: {
		// 层级，确保壁纸在背景层
		zIndex: -1,
		// 壁纸透明度
		opacity: 0.8,
		// 背景模糊度
		blur: 10,
		// 卡片透明度，0-1 之间，值越小越透明
		cardOpacity: 0.5,
	},
};