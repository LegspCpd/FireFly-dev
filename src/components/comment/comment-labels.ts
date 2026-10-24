/**
 * 自建评论组件的界面文案。
 *
 * 为什么不用 @/i18n：本轮改动范围被限定在评论组件目录内（不得改 i18n 语言文件），
 * 所以文案就近放在组件旁边，按 siteConfig.lang 取；没有的语言回退英文。
 * 以后要把它们挪进 src/i18n 也可以，键名一一对应。
 */

export type CommentLabels = {
	/** 列表头的拉丁小标（官网风格：大写 + 字距）。 */
	eyebrow: string;
	nameLabel: string;
	namePlaceholder: string;
	contentLabel: string;
	contentPlaceholder: string;
	submit: string;
	submitting: string;
	refresh: string;
	loading: string;
	empty: string;
	emptyDemo: string;
	demoFlag: string;
	demoText: string;
	previewTag: string;
	previewNote: string;
	needContent: string;
	tooLong: (max: number) => string;
	errorFlag: string;
	networkLoadFailed: string;
	networkPostFailed: string;
	timeoutFailed: string;
	httpFailed: (status: number) => string;
	loadFailed: string;
	postFailed: string;
	retry: string;
	posted: string;
	anonymous: string;
	justNow: string;
	minutesAgo: (n: number) => string;
	hoursAgo: (n: number) => string;
	daysAgo: (n: number) => string;
	unknownTime: string;
};

export type CommentLocale = "zh_CN" | "zh_TW" | "en" | "ja" | "ko" | "ru";

const LABELS: Record<CommentLocale, CommentLabels> = {
	zh_CN: {
		eyebrow: "COMMENTS",
		nameLabel: "昵称",
		namePlaceholder: "怎么称呼（可留空）",
		contentLabel: "评论内容",
		contentPlaceholder: "说点什么……（Ctrl / ⌘ + Enter 发布）",
		submit: "发布评论",
		submitting: "提交中……",
		refresh: "刷新",
		loading: "加载中……",
		empty: "还没有评论，来做第一个。",
		emptyDemo: "演示态里发布的第一条会出现在这里（仅本页预览，刷新即消失）。",
		demoFlag: "DEMO",
		demoText:
			"评论服务未配置 —— 当前为演示态：可以输入、可以预览自己的评论，但不会写入任何后端。在部署平台配好 COMMENT_API_BASE 后自动切换为正式提交。",
		previewTag: "预览",
		previewNote: "带「预览」标记的是本地演示内容，没有提交到后端。",
		needContent: "请先写点内容再发布。",
		tooLong: (max) => `评论最多 ${max} 字。`,
		errorFlag: "错误",
		networkLoadFailed: "评论加载失败：连不上评论服务（网络或 CORS）。",
		networkPostFailed:
			"提交失败：连不上评论服务（网络或 CORS），内容已保留，可稍后重试。",
		timeoutFailed: "评论服务响应超时，请稍后重试。",
		httpFailed: (status) => `评论服务返回 ${status}，请稍后重试。`,
		loadFailed: "评论加载失败，请稍后重试。",
		postFailed: "提交失败，请稍后重试，内容已保留。",
		retry: "重试",
		posted: "已发布。",
		anonymous: "匿名",
		justNow: "刚刚",
		minutesAgo: (n) => `${n} 分钟前`,
		hoursAgo: (n) => `${n} 小时前`,
		daysAgo: (n) => `${n} 天前`,
		unknownTime: "时间未知",
	},
	zh_TW: {
		eyebrow: "COMMENTS",
		nameLabel: "暱稱",
		namePlaceholder: "怎麼稱呼（可留空）",
		contentLabel: "留言內容",
		contentPlaceholder: "說點什麼……（Ctrl / ⌘ + Enter 送出）",
		submit: "送出留言",
		submitting: "送出中……",
		refresh: "重新整理",
		loading: "載入中……",
		empty: "還沒有留言，來當第一個。",
		emptyDemo: "示範模式送出的第一則會出現在這裡（僅本頁預覽，重新整理就消失）。",
		demoFlag: "DEMO",
		demoText:
			"留言服務未設定 —— 目前為示範模式：可以輸入、可以預覽自己的留言，但不會寫入任何後端。在部署平台設好 COMMENT_API_BASE 後就會切換成正式送出。",
		previewTag: "預覽",
		previewNote: "帶「預覽」標記的是本機示範內容，沒有送到後端。",
		needContent: "請先寫點內容再送出。",
		tooLong: (max) => `留言最多 ${max} 字。`,
		errorFlag: "錯誤",
		networkLoadFailed: "留言載入失敗：連不上留言服務（網路或 CORS）。",
		networkPostFailed:
			"送出失敗：連不上留言服務（網路或 CORS），內容已保留，可稍後重試。",
		timeoutFailed: "留言服務回應逾時，請稍後重試。",
		httpFailed: (status) => `留言服務回應 ${status}，請稍後重試。`,
		loadFailed: "留言載入失敗，請稍後重試。",
		postFailed: "送出失敗，請稍後重試，內容已保留。",
		retry: "重試",
		posted: "已送出。",
		anonymous: "匿名",
		justNow: "剛剛",
		minutesAgo: (n) => `${n} 分鐘前`,
		hoursAgo: (n) => `${n} 小時前`,
		daysAgo: (n) => `${n} 天前`,
		unknownTime: "時間未知",
	},
	en: {
		eyebrow: "COMMENTS",
		nameLabel: "Name",
		namePlaceholder: "What should we call you? (optional)",
		contentLabel: "Comment",
		contentPlaceholder: "Say something… (Ctrl / ⌘ + Enter to post)",
		submit: "Post comment",
		submitting: "Posting…",
		refresh: "Refresh",
		loading: "Loading…",
		empty: "No comments yet — be the first.",
		emptyDemo: "The first comment you post in demo mode shows up here (preview only).",
		demoFlag: "DEMO",
		demoText:
			"Comment service is not configured. Demo mode: you can type and preview your own comment, but nothing is sent anywhere. Set COMMENT_API_BASE on your platform to go live.",
		previewTag: "preview",
		previewNote: "Entries marked “preview” are local demo content and were never posted.",
		needContent: "Write something first.",
		tooLong: (max) => `Comments are limited to ${max} characters.`,
		errorFlag: "ERROR",
		networkLoadFailed: "Could not load comments: the comment service is unreachable (network or CORS).",
		networkPostFailed:
			"Could not post: the comment service is unreachable (network or CORS). Your draft was kept.",
		timeoutFailed: "The comment service timed out. Please try again.",
		httpFailed: (status) => `The comment service returned ${status}. Please try again.`,
		loadFailed: "Could not load comments. Please try again.",
		postFailed: "Could not post. Please try again — your draft was kept.",
		retry: "Retry",
		posted: "Posted.",
		anonymous: "Anonymous",
		justNow: "just now",
		minutesAgo: (n) => `${n} min ago`,
		hoursAgo: (n) => `${n} h ago`,
		daysAgo: (n) => `${n} d ago`,
		unknownTime: "unknown time",
	},
	ja: {
		eyebrow: "COMMENTS",
		nameLabel: "名前",
		namePlaceholder: "お名前（空欄可）",
		contentLabel: "コメント",
		contentPlaceholder: "コメントを入力……（Ctrl / ⌘ + Enter で送信）",
		submit: "コメントする",
		submitting: "送信中……",
		refresh: "再読み込み",
		loading: "読み込み中……",
		empty: "まだコメントはありません。最初の一件をどうぞ。",
		emptyDemo: "デモモードで投稿した一件がここに表示されます（このページ内のプレビューのみ）。",
		demoFlag: "DEMO",
		demoText:
			"コメントサービスが未設定です。現在はデモモード：入力と自分のコメントのプレビューはできますが、どこにも送信されません。COMMENT_API_BASE を設定すると本番投稿に切り替わります。",
		previewTag: "プレビュー",
		previewNote: "「プレビュー」付きの項目はローカルのデモ内容で、送信されていません。",
		needContent: "内容を入力してください。",
		tooLong: (max) => `コメントは ${max} 文字までです。`,
		errorFlag: "エラー",
		networkLoadFailed: "コメントを読み込めません：コメントサービスに接続できません（ネットワークか CORS）。",
		networkPostFailed:
			"送信できません：コメントサービスに接続できません（ネットワークか CORS）。入力内容は保持しています。",
		timeoutFailed: "コメントサービスがタイムアウトしました。しばらくして再試行してください。",
		httpFailed: (status) => `コメントサービスが ${status} を返しました。しばらくして再試行してください。`,
		loadFailed: "コメントを読み込めませんでした。再試行してください。",
		postFailed: "送信できませんでした。再試行してください（入力内容は保持）。",
		retry: "再試行",
		posted: "送信しました。",
		anonymous: "名無し",
		justNow: "たった今",
		minutesAgo: (n) => `${n} 分前`,
		hoursAgo: (n) => `${n} 時間前`,
		daysAgo: (n) => `${n} 日前`,
		unknownTime: "日時不明",
	},
	ko: {
		eyebrow: "COMMENTS",
		nameLabel: "이름",
		namePlaceholder: "어떻게 부를까요? (비워 둬도 됩니다)",
		contentLabel: "댓글",
		contentPlaceholder: "내용을 입력하세요… (Ctrl / ⌘ + Enter 로 등록)",
		submit: "댓글 등록",
		submitting: "등록 중……",
		refresh: "새로 고침",
		loading: "불러오는 중……",
		empty: "아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.",
		emptyDemo: "데모 모드에서 등록한 첫 댓글이 여기에 표시됩니다(이 페이지에서만 보이는 미리보기).",
		demoFlag: "DEMO",
		demoText:
			"댓글 서비스가 설정되지 않았습니다. 현재는 데모 모드입니다: 입력과 미리보기는 가능하지만 어디에도 전송되지 않습니다. COMMENT_API_BASE 를 설정하면 실제 등록으로 바뀝니다.",
		previewTag: "미리보기",
		previewNote: "‘미리보기’ 표시가 있는 항목은 로컬 데모 내용이며 전송되지 않았습니다.",
		needContent: "내용을 먼저 입력하세요.",
		tooLong: (max) => `댓글은 ${max}자까지 가능합니다.`,
		errorFlag: "오류",
		networkLoadFailed: "댓글을 불러오지 못했습니다: 댓글 서비스에 연결할 수 없습니다(네트워크 또는 CORS).",
		networkPostFailed:
			"등록하지 못했습니다: 댓글 서비스에 연결할 수 없습니다(네트워크 또는 CORS). 작성한 내용은 유지됩니다.",
		timeoutFailed: "댓글 서비스 응답이 시간 초과되었습니다. 잠시 후 다시 시도하세요.",
		httpFailed: (status) => `댓글 서비스가 ${status} 를 반환했습니다. 잠시 후 다시 시도하세요.`,
		loadFailed: "댓글을 불러오지 못했습니다. 다시 시도하세요.",
		postFailed: "등록하지 못했습니다. 다시 시도하세요(작성한 내용은 유지).",
		retry: "다시 시도",
		posted: "등록했습니다.",
		anonymous: "익명",
		justNow: "방금",
		minutesAgo: (n) => `${n}분 전`,
		hoursAgo: (n) => `${n}시간 전`,
		daysAgo: (n) => `${n}일 전`,
		unknownTime: "시간 정보 없음",
	},
	ru: {
		eyebrow: "COMMENTS",
		nameLabel: "Имя",
		namePlaceholder: "Как вас называть? (можно пусто)",
		contentLabel: "Комментарий",
		contentPlaceholder: "Напишите что-нибудь… (Ctrl / ⌘ + Enter — отправить)",
		submit: "Отправить",
		submitting: "Отправка…",
		refresh: "Обновить",
		loading: "Загрузка…",
		empty: "Комментариев пока нет — будьте первым.",
		emptyDemo: "Первый комментарий из демо-режима появится здесь (только предпросмотр).",
		demoFlag: "DEMO",
		demoText:
			"Сервис комментариев не настроен. Демо-режим: можно писать и видеть предпросмотр, но ничего никуда не отправляется. Задайте COMMENT_API_BASE, чтобы включить настоящую отправку.",
		previewTag: "предпросмотр",
		previewNote: "Записи с пометкой «предпросмотр» — локальное демо, они не отправлены.",
		needContent: "Сначала напишите текст.",
		tooLong: (max) => `Комментарий не длиннее ${max} символов.`,
		errorFlag: "ОШИБКА",
		networkLoadFailed: "Не удалось загрузить комментарии: сервис недоступен (сеть или CORS).",
		networkPostFailed:
			"Не удалось отправить: сервис недоступен (сеть или CORS). Черновик сохранён.",
		timeoutFailed: "Сервис комментариев не ответил вовремя. Попробуйте позже.",
		httpFailed: (status) => `Сервис комментариев вернул ${status}. Попробуйте позже.`,
		loadFailed: "Не удалось загрузить комментарии. Попробуйте позже.",
		postFailed: "Не удалось отправить. Попробуйте позже — черновик сохранён.",
		retry: "Повторить",
		posted: "Отправлено.",
		anonymous: "Аноним",
		justNow: "только что",
		minutesAgo: (n) => `${n} мин назад`,
		hoursAgo: (n) => `${n} ч назад`,
		daysAgo: (n) => `${n} дн назад`,
		unknownTime: "время неизвестно",
	},
};

/** 把 siteConfig.lang（zh_CN / zh-TW / en_US …）规整成我们支持的六种之一。 */
export function normalizeCommentLocale(locale: string): CommentLocale {
	const value = (locale || "").toLowerCase().replace(/-/g, "_");
	if (value.startsWith("zh_tw") || value.startsWith("zh_hk")) return "zh_TW";
	if (value.startsWith("zh")) return "zh_CN";
	if (value.startsWith("ja")) return "ja";
	if (value.startsWith("ko")) return "ko";
	if (value.startsWith("ru")) return "ru";
	return "en";
}

export function getCommentLabels(locale: string): CommentLabels {
	return LABELS[normalizeCommentLocale(locale)];
}

const INTL_TAGS: Record<CommentLocale, string> = {
	zh_CN: "zh-CN",
	zh_TW: "zh-TW",
	en: "en",
	ja: "ja",
	ko: "ko",
	ru: "ru",
};

function formatAbsoluteTime(time: number, locale: string): string {
	const tag = INTL_TAGS[normalizeCommentLocale(locale)];
	try {
		return new Intl.DateTimeFormat(tag, {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(new Date(time));
	} catch {
		return new Date(time).toISOString().slice(0, 10);
	}
}

/**
 * 相对时间：刚刚 / n 分钟前 / n 小时前 / n 天前，超过 7 天给真实日期
 * （官网风格：数字都是真实数据，不造装饰性字符）。
 */
export function formatCommentTime(
	iso: string | null,
	labels: CommentLabels,
	locale: string,
): string {
	if (!iso) return labels.unknownTime;
	const time = Date.parse(iso);
	if (!Number.isFinite(time)) return labels.unknownTime;
	const diff = Date.now() - time;
	if (diff < 0) return formatAbsoluteTime(time, locale);
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) return labels.justNow;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return labels.minutesAgo(minutes);
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return labels.hoursAgo(hours);
	const days = Math.floor(hours / 24);
	if (days < 7) return labels.daysAgo(days);
	return formatAbsoluteTime(time, locale);
}
