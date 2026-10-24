/* ==========================================================================
   ef-scroll-motion.ts —— 官网那套「滚动进场 + 轻量视差」的实现
   --------------------------------------------------------------------------
   官网怎么做的（反查 F:/web/endfield-official/css/*.css 与线上首页 DOM）：

   1) 进场动画：@keyframes __04-finalpage_flashing__w5gJk
        {0%{opacity:0} 10%{opacity:.5} 11%{opacity:0} 20%{opacity:.5}
         21%{opacity:0} 40%{opacity:.5} 41%{opacity:0} to{opacity:1}}
      命中规则：.__04-finalpage_sectionContainer .__04-finalpage_decoLeft
                .__04-finalpage_active{
                  animation: __04-finalpage_flashing__w5gJk 1s ease-out forwards}
      —— 信号灯式闪三下（每次 .5）再定格到 1；**1s / ease-out / forwards** 三个参数
      就是官网原值。03-gameplay / 05-Gameplay / 08-AIC 用的是同一个模板与同一组
      参数，所以全站只需要一份 keyframe（写在 endfield-shell.css 的 §7.5）。

   2) 触发：官网用 framer-motion 的 whileInView，底层是
        new IntersectionObserver(cb, {root, rootMargin, threshold})
      并且 once 语义写在 observer 里：
        if (this.isInView === e || (once && !e && this.hasEnteredView)) return;
        e && (this.hasEnteredView = true)
      —— **进来过一次就不再播**，回滚上去不会重放。
      本站的等价实现：命中即 unobserve，元素上留 .ef-in；切页重建观察者时
      带 .ef-in 的元素一律跳过，所以「切页后全站重播」不会发生。

   3) 视差：官网用 framer-motion 的 useScroll / useTransform（底层是 passive
      scroll + requestAnimationFrame）。它自己的粘性栏代码也是同一个套路：
        let pending=false;
        const onScroll=()=>{ if(pending) return; pending=true; raf=requestAnimationFrame(run) };
        const run=()=>{ pending=false; ……读几何…… };
        window.addEventListener("scroll", onScroll, {passive:true})
      —— 所以本站同样是 rAF 合帧 + passive；**几何只在 init / resize 时量一次并缓存**，
      滚动路径里只读 window.scrollY / innerHeight，不读布局、不调 getComputedStyle
      （那会让每帧强制重排）。

   本站的额外约束（站主提过两次）：
     · prefers-reduced-motion: reduce —— 模块整体不挂 html.ef-motion，
       页面停在「完全可见、零位移」的自然状态，不保留任何动画；
     · swup 站内切页后（swup:page:view）只对**新页面里还没进过场**的元素建观察者；
     · 只接自己的 data-ef-reveal / data-ef-parallax，**不碰** Layout.astro 那套
       data-replay（ef-in-power 等），两者互不重复播放。
   ========================================================================== */

const REVEAL_ATTR = "data-ef-reveal";
const PARALLAX_ATTR = "data-ef-parallax";
const IN_CLASS = "ef-in";
const MOTION_CLASS = "ef-motion";

/* 没有手写 data-ef-reveal 的区块：运行时补上。
   [选择器, 进场档位, 是否按序号错开]
   刻意只挑「叶子级」的块（区块头、卡片、单页面板、分页、页脚），
   不做整段 .ef-sec —— 父子各淡一次会互相叠加，看起来像慢放。
   Layout.astro 那套 data-replay 覆盖到的元素一律跳过（见 collectReveals）。 */
const AUTO: Array<[string, string, boolean]> = [
	[".ef-sec-head", "up", false],
	[".ef-card", "up", true],
	[".ef-sheet", "up", false],
	[".ef-pager", "up", false],
	[".ef-foot-inner", "up", false],
];

function tagAuto(root: ParentNode): void {
	for (let i = 0; i < AUTO.length; i++) {
		const [selector, kind, stagger] = AUTO[i];
		const nodes = root.querySelectorAll<HTMLElement>(selector);
		for (let n = 0; n < nodes.length; n++) {
			const el = nodes[n];
			if (el.hasAttribute(REVEAL_ATTR)) continue;
			if (el.closest("[data-replay]")) continue;
			if (el.closest(".ef-hero")) continue;
			el.setAttribute(REVEAL_ATTR, kind);
			if (stagger) el.setAttribute("data-ef-stagger", "");
		}
	}
}

type ParallaxItem = {
	el: HTMLElement;
	center: number;
	factor: number;
	last: number;
};

let revealObserver: IntersectionObserver | null = null;
let parallaxItems: ParallaxItem[] = [];
let rafId = 0;
let started = false;
let bound = false;

function prefersReducedMotion(): boolean {
	return (
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/* ---- 进场 ---------------------------------------------------------------- */

/* 只收「自己人」：带 data-ef-reveal、还没进过场、且没有落在 Layout.astro
   那套 data-replay 结构里（否则同一个元素会被两套运行时各播一次）。 */
/* ---- 拦住另一套入场运行时的「全站重播」 --------------------------------
   Layout.astro 里的入场运行时（data-replay / ef-in-power 等套件预设）在开页与
   每次 swup:page:view 时会 replay(document)：把**全站**的 [data-replay] 元素
   一次性播完（实测一篇文章页有 409 个）。它们大多数在视口外，动画就在看不见的
   地方白播了 —— 这就是站主说的「切页后全站重播一遍」。
   那个运行时在 layouts/Layout.astro 里，本批次不允许改；于是这里在它之后
   （同一个 swup 事件里、还没绘制）把**不在视口里**的那些摘回去，等它们真的
   滚进视口再由本模块补播一次。视口内的不动，保持原样。 */
const REPLAY_ATTR = "data-replay";
const HOLD_ATTR = "data-ef-hold";
let replayObserver: IntersectionObserver | null = null;

function tameOffscreenReplay(): void {
	const nodes = document.querySelectorAll<HTMLElement>("[" + REPLAY_ATTR + "]");
	if (replayObserver) {
		replayObserver.disconnect();
		replayObserver = null;
	}
	if (nodes.length === 0 || typeof IntersectionObserver !== "function") return;

	const vh = window.innerHeight || 1;
	const held: HTMLElement[] = [];
	for (let i = 0; i < nodes.length; i++) {
		const el = nodes[i];
		const cls = el.getAttribute(REPLAY_ATTR);
		if (!cls || !el.classList.contains(cls)) continue;
		const rect = el.getBoundingClientRect();
		// 视口内（含已经滚过去的）：让它照常播，不插手
		if (rect.bottom > 0 && rect.top < vh) continue;
		el.classList.remove(cls);
		el.setAttribute(HOLD_ATTR, "");
		held.push(el);
	}
	if (held.length === 0) return;

	replayObserver = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const el = entry.target as HTMLElement;
				replayObserver?.unobserve(el);
				if (!el.hasAttribute(HOLD_ATTR)) continue;
				el.removeAttribute(HOLD_ATTR);
				const cls = el.getAttribute(REPLAY_ATTR);
				if (cls) el.classList.add(cls); // 真正露头时补播一次（套件预设自带 fill-mode）
			}
		},
		{ rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
	);
	for (const el of held) replayObserver.observe(el);
}

function collectReveals(): HTMLElement[] {
	const nodes = document.querySelectorAll<HTMLElement>("[" + REVEAL_ATTR + "]");
	const fresh: HTMLElement[] = [];
	for (let i = 0; i < nodes.length; i++) {
		const el = nodes[i];
		if (el.classList.contains(IN_CLASS)) continue;
		if (el.closest("[data-replay]")) continue;
		fresh.push(el);
	}
	return fresh;
}

function markInView(): void {
	/* 兜底：文档在后台时 IntersectionObserver 不投递回调，
	   切回前台把「此刻确实在视口里」的元素直接定格，别让它们留在 opacity:0。 */
	const vh = window.innerHeight || 1;
	for (const el of collectReveals()) {
		const r = el.getBoundingClientRect();
		if (r.top < vh && r.bottom > 0) el.classList.add(IN_CLASS);
	}
}

function startReveal(): void {
	const fresh = collectReveals();
	if (fresh.length === 0) return;

	if (typeof IntersectionObserver !== "function") {
		/* 没有 IO 就直接定格：宁可没有动效，也不能把内容留在不可见状态 */
		for (const el of fresh) el.classList.add(IN_CLASS);
		return;
	}

	if (revealObserver) revealObserver.disconnect();
	revealObserver = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const el = entry.target as HTMLElement;
				el.classList.add(IN_CLASS);
				// once：命中即停，回滚上去不重播（对齐官网 whileInView once）
				revealObserver?.unobserve(el);
			}
		},
		{
			// 官网 amount 默认 "some" → threshold 0；这里抬一点，等元素真正露头再进场
			rootMargin: "0px 0px -6% 0px",
			threshold: 0.06,
		},
	);

	for (let i = 0; i < fresh.length; i++) {
		const el = fresh[i];
		/* 卡片网格：同组里按位置给一点点递增延迟（最多 4 档 × 70ms）。
		   官网每个区块的 deco 是同一参数、没有延迟，这是本项目唯一的加料。 */
		if (el.hasAttribute("data-ef-stagger")) {
			const parent = el.parentElement;
			const idx = parent
				? Array.prototype.indexOf.call(parent.children, el)
				: 0;
			if (idx > 0) {
				el.style.setProperty("--ef-d", Math.min(idx, 4) * 70 + "ms");
			}
		}
		revealObserver.observe(el);
	}
}

/* ---- 视差 ---------------------------------------------------------------- */

function measureParallax(): void {
	parallaxItems = [];
	const nodes = document.querySelectorAll<HTMLElement>("[" + PARALLAX_ATTR + "]");
	if (nodes.length === 0) return;
	const sy = window.scrollY;
	for (let i = 0; i < nodes.length; i++) {
		const el = nodes[i];
		const factor = Number.parseFloat(el.getAttribute(PARALLAX_ATTR) || "");
		if (!Number.isFinite(factor) || factor === 0) continue;
		const rect = el.getBoundingClientRect();
		// 隐藏元素跳过（窄屏上 .ef-hero-side 就是 display:none）
		if (rect.width === 0 || rect.height === 0) continue;
		parallaxItems.push({
			el,
			center: rect.top + sy + rect.height / 2,
			factor,
			last: Number.NaN,
		});
	}
}

function paintParallax(): void {
	rafId = 0;
	if (parallaxItems.length === 0) return;
	const vh = window.innerHeight || 1;
	const mid = window.scrollY + vh / 2;
	for (let i = 0; i < parallaxItems.length; i++) {
		const item = parallaxItems[i];
		// 归一化到 [-1, 1]：元素中心越过视口中心的距离
		let d = (mid - item.center) / vh;
		if (d > 1) d = 1;
		else if (d < -1) d = -1;
		const y = Math.round(d * item.factor * vh * 2) / 2; // 0.5px 量化，减少无谓写入
		if (y === item.last) continue;
		item.last = y;
		/* 只写变量，位移由 CSS 的 translate 属性合成 —— 不碰 transform，
		   所以 .ef-hero-side 自己的 translateY(-50%) 之类不会被覆盖。 */
		item.el.style.setProperty("--ef-py", y + "px");
	}
}

function onScroll(): void {
	if (rafId) return;
	rafId = window.requestAnimationFrame(paintParallax);
}

function startParallax(): void {
	measureParallax();
	paintParallax();
}

/* ---- 生命周期 ------------------------------------------------------------ */

function boot(): void {
	if (prefersReducedMotion()) return; // 系统要求减少动态：不挂类、不量几何、不监听
	started = true;
	tagAuto(document);
	document.documentElement.classList.add(MOTION_CLASS);
	startReveal();
	// Layout 的首次 replay 已经跑过（它的内联脚本先执行），这里按视口修正一遍
	tameOffscreenReplay();
	startParallax();
	bindOnce();
}

/* swup 换页后：旧节点随容器一起没了，观察者与缓存的几何整只重建；
   新页面里带 .ef-in 的元素（理论上不会有）与已进场元素不会重播。 */
function refresh(): void {
	if (!started || prefersReducedMotion()) return;
	document.documentElement.classList.add(MOTION_CLASS);
	tagAuto(document);
	startReveal();
	startParallax();
	markInView();
}

function bindOnce(): void {
	if (bound) return;
	bound = true;

	window.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("resize", startParallax, { passive: true });

	// 图片/字体落地会改变几何，量一次即可（不放进滚动路径）
	window.addEventListener(
		"load",
		() => {
			startParallax();
			tameOffscreenReplay();
		},
		{ once: true },
	);

	document.addEventListener("swup:page:view", () => {
		/* 同步打标 + 建观察者：监听器在 swup 换完容器之后派发，此刻打标还没绘制，
		   不会出现「先亮一帧再变透明」。几何量测放到下一帧（字体/图片落位）。
		   tameOffscreenReplay 必须紧跟在 Layout 的监听器之后同步执行，
		   否则中间会绘制出一帧「全站都在播」的画面。 */
		if (started && !prefersReducedMotion()) {
			/* swup 会连同 <html> 的 class 一起换成新页面的（服务端渲染里没有
			   ef-motion），所以每次切页都得把开关补回去，否则新页面上的
			   data-ef-reveal 不再被上面的 CSS 命中。 */
			document.documentElement.classList.add(MOTION_CLASS);
			tagAuto(document);
			tameOffscreenReplay();
			startReveal();
		}
		window.requestAnimationFrame(() => window.requestAnimationFrame(refresh));
	});

	// 后台标签页里 IO 不投递，切回前台补齐
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) return;
		// Layout 的运行时会在切回前台时再 replay 一次，这里同样只留视口内的
		tameOffscreenReplay();
		markInView();
		onScroll();
	});

	if (typeof window.matchMedia === "function") {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		const onChange = (): void => {
			if (mq.matches) teardown();
		};
		if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
		else if (typeof mq.addListener === "function") mq.addListener(onChange);
	}
}

/* 用户中途把系统切成「减少动态」：立刻停到自然状态（全部可见、零位移）。 */
function teardown(): void {
	if (revealObserver) {
		revealObserver.disconnect();
		revealObserver = null;
	}
	for (const item of parallaxItems) item.el.style.removeProperty("--ef-py");
	parallaxItems = [];
	if (rafId) {
		window.cancelAnimationFrame(rafId);
		rafId = 0;
	}
	document.documentElement.classList.remove(MOTION_CLASS);
	for (const el of document.querySelectorAll<HTMLElement>("[" + REVEAL_ATTR + "]")) {
		el.classList.add(IN_CLASS);
	}
	started = false;
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
	boot();
}
