import type { MusicPlayerConfig } from "../types/musicConfig";

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	// 是否在导航栏显示音乐播放器入口
	showInNavbar: true,

	// 是否在侧边栏显示音乐播放器组件
	showInSidebar: true,

	// 使用方式："meting" 使用 Meting API，"local" 使用本地音乐列表
	mode: "local",

	// 默认音量 (0-1)
	volume: 0.7,

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode: "list",

	// 是否显启用歌词
	showLyrics: false,

	// Meting API 配置
	meting: {
		// Meting API 地址
		// 默认使用官方 API，也可以使用自定义 API
		api: "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
		server: "tencent",
		// 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
		type: "playlist",
		// 歌单/专辑/单曲 ID 或搜索关键词
		id: "6pFWDs1Da5FG",
		// 认证 token（可选）
		auth: "",
		// 备用 API 配置（当主 API 失败时使用）
		fallbackApis: [
			"https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
		],
	},

	// 本地音乐配置（当 mode 为 'local' 时使用）
	// 1. 支持传入歌词文件的路径
	// lrc: "/assets/music/lrc/使一颗心免于哀伤-哼唱.lrc",
	// 2. 或者直接填入歌词字符串内容
	// lrc: "[00:00.00]歌词内容...",
	local: {
		playlist: [
			{
				name: "Higher",
				artist: "Tobu",
				url: "/assets/music/Higher-Tobu.mp3",
				cover: "/assets/music/cover/Higher-Tobu.jpg",
				lrc: "",
			},
			{
				name: "Give Me Something (for Arknights Endfield)",
				artist: "OneRepublic",
				url: "/assets/music/Give Me Something (for Arknights Endfield) - OneRepublic.mp3",
				cover: "/assets/music/cover/170474730.jpg",
				lrc: "",
			},
			{
				name: "Numb",
				artist: "Linkin Park",
				url: "/assets/music/Numb.flac",
				cover: "/assets/music/cover/Linkin_Park_-_Numb_CD_cover.jpg",
				lrc: "",
			},
			{
				name: "The Nights",
				artist: "Avicii",
				url: "/assets/music/The Nights-Avicii.mp3",
				cover: "/assets/music/cover/Avicii_Nights_Artwork.png",
				lrc: "",
			},
			{
				name: "world.execute(me);",
				artist: "Miracle Milk",
				url: "/assets/music/world-execute-me.wav",
				cover:
					"/assets/music/cover/ab67616d00001e02de2f0ff77da06e2bb0fda6d2.jpg",
				lrc: "",
			},
			{
				name: "Sky High",
				artist: "Elektronomia",
				url: "/assets/music/Sky High.mp3",
				cover: "/assets/music/cover/artwork-440x440.jpg",
				lrc: "",
			},
			{
				name: "Sky High Pt.II",
				artist: "Elektronomia",
				url: "/assets/music/Sky High pt.II.mp3",
				cover: "/assets/music/cover/Sky High pt.II.jpg",
				lrc: "",
			},
			{
				name: "Heaven",
				artist: "Avicii",
				url: "/assets/music/Heaven.mp3",
				cover: "/assets/music/cover/Avicii_Heaven_Single_Cover_Art.jpg",
				lrc: "",
			},
			{
				name: "A Moment Apart",
				artist: "Odesza",
				url: "/assets/music/A Moment Apart-Odesza.mp3",
				cover: "/assets/music/cover/A_Moment_Alone_Cover.jpg",
				lrc: "",
			},
			{
				name: "使一颗心免于哀伤",
				artist: "知更鸟 / HOYO-MiX / Chevy",
				url: "/assets/music/使一颗心免于哀伤-哼唱.mp3",
				cover: "/assets/music/cover/109951169585655912.webp",
				lrc: "",
			},
		],
	},
};
