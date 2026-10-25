/* ==========================================================================
   ef-scroll-motion.ts —— 官网那套「滚动进场 + 视差」，改由官网同款动画库驱动
   --------------------------------------------------------------------------
   【一、官网到底用了什么】证据 = 线上 JS chunk。原始 chunk 是 gzip，
   解压后落在 .ef-work/offjs/plain/（index.html 里 29 个 chunk 全下齐）。

   1) anime.js  —— chunk 3877-c91cc7d94c938183.js 的 webpack 模块 56578 就是
      anime 的 defaults 对象，逐字为：
        {update:null, begin:null, loopBegin:null, changeBegin:null, change:null,
         changeComplete:null, loopComplete:null, complete:null, loop:1,
         direction:"normal", autoplay:…, easing:…, duration:1000, delay:…}
      同一 chunk 里还有 easeOutElastic / stagger / timeline / translateY。
      官网自己的进场补间全部是这个 API，实测两处原值（chunk 226）：
        anime({targets:[e,t], opacity:[0,1], translateY:["2rem",0], duration:600,
               delay: anime.stagger(200,{start:600}), easing:"easeOutQuad"})
        anime({targets:[e,t,a], opacity:[0,1], translateY:["2rem",0], duration:600,
               delay: anime.stagger(100,{start:600}), easing:"easeOutQuad"})
      触发条件是 framer-motion 的 useInView(ref,{once:true})（chunk 8498 模块
      19213 就是它的实现：useState + IntersectionObserver + WeakMap，
        {root, margin, amount = "some"}, once 用 hasEnteredView 短路）。

   2) framer-motion —— chunk 5578-060085c254278034.js：framerAppearId /
      motionComponentSymbol / motionValue / whileInView / projection / layoutId。
      chunk 8498：useInView + inView。chunk 4231：useScroll / useTransform /
      scrollYProgress / attachTimeline。官网视差就建在这上面（chunk 226 的
      aM 组件）：
        const {scrollYProgress} = useScroll({container: document.documentElement})
        const a = useTransform(scrollYProgress, p => `${-(300*p)%120}%`)
        const n = useTransform(scrollYProgress, p => `${120-300*p%120}%`)
        → 两条 deco 带反向跑，纯 translateX，不碰布局。

   3) 没有平滑滚动库。所有 chunk 里 gsap / ScrollTrigger / lenis / Lenis /
      @studio-freight / locomotive-scroll 命中数都是 0；全部 9 个 CSS 里
      scroll-behavior 也是 0。所以本站**不引入** Lenis 之类，照官网用原生滚动。

   【二、本站怎么落地】
   本站是 Astro 无框架，framer-motion 是 React-only，用不了；但官网那套进场
   补间本来就是**框架无关的 anime.js**。所以引入 anime.js v4（同一个库的当前
   大版本：API 从 anime({targets}) 变成 animate()，easing→ease，并多了
   onScroll() 这个滚动观察器），由它同时接管：

     · 进场 animate()：参数逐条对齐官网 —— duration 600、位移 2rem、
       delay stagger(100,{start:600})、缓动 outQuad（= 官网 easeOutQuad）。
       位移写的是无单位自定义属性 --ef-rp（1→0），CSS 再乘 2*var(--efu)；
       --efu 就是官网的 1rem（min(.625vw,1.111111vh)），所以「2rem」与官网像素
       完全相同，而且不碰 transform，不会和元素自带变换打架。
     · 触发 + 视差 onScroll()：anime v4 的滚动观察器（内部 IntersectionObserver
       + rAF + 缓存的容器/元素几何），位置等价于官网的 useInView / useScroll。
       视差强度仍是本站原有的 data-ef-parallax 系数，只写 --ef-py（0.5px 量化，
       值不变就不写 DOM），位移由 CSS 独立 translate 属性合成。
     · deco 带：官网 chunk 226 的 aM 组件（endfieldPre）那两条式子
       "-(300*p)%120%" 与 "120-300*p%120%" 照抄，由**页级** progress 驱动；
       脚本只写 --ef-bx（1px 量化），宽度只在 init / resize 读一次。
     · clipPath 擦除：官网 chunk 8858 的四次缓出
       1 - Math.pow(1 - 0.01*progress, 4)（progress 0→100），滚动驱动、一次性；
       擦除窗口固定 0.5 屏（元素上边从视口 75% 处走到 25% 处），与块自身高度无关。
       脚本只写 --ef-wipe（0.1% 量化）。

   官网竖屏会换成另一套 H5 版式（chunk 90286 的 M() 钩子：
   window.innerWidth >= window.innerHeight ? "landscape" : "portrait"），
   视差在竖屏整块不跑。本站照此：竖屏不建视差观察器。

   【三、本站的硬约束（站主提过两次）】
     · prefers-reduced-motion: reduce —— 模块整体不挂 html.ef-motion，
       页面停在「完全可见、零位移」的自然状态；
     · swup 站内切页后只对**新页面里还没进过场**的元素建观察器，
       已进场的 .ef-in 一律跳过，不重播；
     · 滚动路径不读布局、不调 getComputedStyle（几何由 anime 的
       ScrollObserver 在 init / resize 时缓存）。
   ========================================================================== */

import {
	type AnimationParams,
	animate,
	onScroll,
	type ScrollObserver,
	stagger,
} from "animejs";

const REVEAL_ATTR = "data-ef-reveal";
const PARALLAX_ATTR = "data-ef-parallax";
const STAGGER_ATTR = "data-ef-stagger";
const IN_CLASS = "ef-in";
const MOTION_CLASS = "ef-motion";

/* —— 官网原值，一个字都不改（chunk 226 / 8858）—— */
const REVEAL_DURATION = 600; // duration: 600
const REVEAL_DELAY_START = 600; // stagger(…, {start: 600})
const REVEAL_STAGGER = 100; // stagger(100)
const REVEAL_EASE = "outQuad"; // easing: "easeOutQuad"

/* 没有手写 data-ef-reveal 的区块：运行时补上。
   [选择器, 进场档位, 是否按同组错开]
   刻意只挑「叶子级」的块（区块头、卡片、单页面板、分页、页脚），
   不做整段 .ef-sec —— 父子各淡一次会互相叠加，看起来像慢放。 */
const AUTO: Array<[string, string, boolean]> = [
	[".ef-sec-head", "up", false],
	[".ef-card", "up", true],
	[".ef-sheet", "up", false],
	[".ef-pager", "up", false],
	[".ef-foot-inner", "up", false],
];

function tagAuto(root: ParentNode): void {
	for (let i = 0; i < AUTO.length; i++) {
		const [selector, kind, staggerGroup] = AUTO[i];
		const nodes = root.querySelectorAll<HTMLElement>(selector);
		for (let n = 0; n < nodes.length; n++) {
			const el = nodes[n];
			if (el.hasAttribute(REVEAL_ATTR)) continue;
			if (el.closest("[data-replay]")) continue;
			if (el.closest(".ef-hero")) continue;
			el.setAttribute(REVEAL_ATTR, kind);
			if (staggerGroup) el.setAttribute(STAGGER_ATTR, "");
		}
	}
}

type ParallaxItem = {
	el: HTMLElement;
	obs: ScrollObserver;
	factor: number;
	last: number;
};

let revealObservers: ScrollObserver[] = [];
let parallaxItems: ParallaxItem[] = [];
let started = false;
let bound = false;
let resizeTimer = 0;

function prefersReducedMotion(): boolean {
	return (
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/* 官网 chunk 90286 的朝向判据，逐字照抄 */
function isLandscape(): boolean {
	return window.innerWidth >= window.innerHeight;
}

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

/* ---- 进场 ---------------------------------------------------------------- */

/* 只收「自己人」：带 data-ef-reveal、还没进过场、且没有落在 Layout.astro
   那套 data-replay 结构里（否则同一个元素会被两套运行时各播一次）。 */
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

/* 本站独有的加料：HeroCanvas 在标记里写死了 --ef-d 的错峰（60/120/…/240ms）。
   官网没有这个，它是靠 stagger 的 start 值错峰；这里把 --ef-d 当成额外偏移
   叠在官网 start 之上，保留首页原本的编排。 */
function extraDelay(el: HTMLElement): number {
	const raw = el.style.getPropertyValue("--ef-d").trim();
	if (!raw) return 0;
	const n = Number.parseFloat(raw);
	if (!Number.isFinite(n) || n <= 0) return 0;
	if (raw.endsWith("ms")) return n;
	if (raw.endsWith("s")) return n * 1000;
	return n;
}

/* 同组卡片：官网是「一次 animate 带 stagger 打一组 target」。
   这里保持同样的形状 —— 触发元素落进视口时，把它同父节点里同样带
   data-ef-stagger、还没进场、而且此刻也在视口里的兄弟一起收进来，
   交给 anime 的 stagger() 错峰。 */
function revealGroup(trigger: HTMLElement): HTMLElement[] {
	if (!trigger.hasAttribute(STAGGER_ATTR)) return [trigger];
	const parent = trigger.parentElement;
	if (!parent) return [trigger];
	const vh = window.innerHeight || 1;
	const nodes = parent.querySelectorAll<HTMLElement>(
		"[" + REVEAL_ATTR + "][" + STAGGER_ATTR + "]",
	);
	const group: HTMLElement[] = [];
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node.classList.contains(IN_CLASS)) continue;
		const r = node.getBoundingClientRect();
		if (r.bottom <= 0 || r.top >= vh) continue;
		group.push(node);
	}
	return group.length > 0 ? group : [trigger];
}

function revealNow(trigger: HTMLElement): void {
	if (trigger.classList.contains(IN_CLASS)) return;

	/* 闪入档（官网 decoLeft.active 的 flashing）官网本身走的就是 CSS 关键帧
	   （__0X_flashing 这几个 @keyframes + animation: … 1s ease-out forwards），
	   不是 JS 补间；这里照抄同一份 keyframes（endfield-shell.css §7.5），
	   只由本模块负责「什么时候挂 .ef-in」。 */
	if (trigger.getAttribute(REVEAL_ATTR) === "flash") {
		trigger.classList.add(IN_CLASS);
		return;
	}

	const group = revealGroup(trigger);

	/* 先把起始值同步落成行内样式，再挂 .ef-in —— 否则 CSS 会先按可见状态画一帧。 */
	for (let i = 0; i < group.length; i++) {
		const node = group[i];
		node.classList.add(IN_CLASS);
		node.style.opacity = "0";
		if (node.getAttribute(REVEAL_ATTR) === "up") {
			node.style.setProperty("--ef-rp", "1");
		}
	}

	if (group.length === 1) {
		const node = group[0];
		const params: AnimationParams = {
			opacity: [0, 1],
			duration: REVEAL_DURATION,
			delay: REVEAL_DELAY_START + extraDelay(node),
			ease: REVEAL_EASE,
		};
		if (node.getAttribute(REVEAL_ATTR) === "up") params["--ef-rp"] = [1, 0];
		animate(node, params);
		return;
	}

	const targets = group.filter((n) => n.getAttribute(REVEAL_ATTR) === "up");
	if (targets.length > 0) {
		animate(targets, {
			opacity: [0, 1],
			"--ef-rp": [1, 0],
			duration: REVEAL_DURATION,
			delay: stagger(REVEAL_STAGGER, { start: REVEAL_DELAY_START }),
			ease: REVEAL_EASE,
		});
	}
	const fades = group.filter((n) => n.getAttribute(REVEAL_ATTR) !== "up");
	if (fades.length > 0) {
		animate(fades, {
			opacity: [0, 1],
			duration: REVEAL_DURATION,
			delay: stagger(REVEAL_STAGGER, { start: REVEAL_DELAY_START }),
			ease: REVEAL_EASE,
		});
	}
}

function stopReveal(): void {
	for (const obs of revealObservers) obs.revert();
	revealObservers = [];
}

function startReveal(): void {
	const fresh = collectReveals();
	if (fresh.length === 0) return;

	if (typeof IntersectionObserver !== "function") {
		/* 没有 IO 就直接定格：宁可没有动效，也不能把内容留在不可见状态 */
		for (const el of fresh) el.classList.add(IN_CLASS);
		return;
	}

	for (let i = 0; i < fresh.length; i++) {
		const el = fresh[i];
		/* enter: "bottom top" —— 元素顶边碰到视口底边就触发，与官网
		   useInView(ref,{once:true}) 的默认阈值一致；once 由 .ef-in 短路。 */
		const obs = onScroll({
			target: el,
			enter: "bottom top",
			leave: "top bottom",
			repeat: false,
			onEnter: () => revealNow(el),
		});
		revealObservers.push(obs);
	}
}

/* 兜底：文档在后台时滚动观察器收不到事件，切回前台把「此刻确实在视口里」
   的元素直接定格，别让它们留在 opacity:0。 */
function markInView(): void {
	const vh = window.innerHeight || 1;
	for (const el of collectReveals()) {
		const r = el.getBoundingClientRect();
		if (r.top < vh && r.bottom > 0) el.classList.add(IN_CLASS);
	}
	finishSeenWipes();
}

/* ---- 视差 ---------------------------------------------------------------- */

function paintParallax(item: ParallaxItem, vh: number): void {
	/* anime 的 progress 0→1 覆盖「元素上边碰到视口下沿」到「元素下边离开视口上沿」，
	   位移量取 progress-0.5：
	     · 零点（progress=0.5）正好落在「元素中心与视口中心重合」，
	       与改造前 (scrollY + vh/2 - center)/vh 的零点完全一致；
	     · 极值 ±0.5 就是改造前短页面实际跑到的幅度 —— 实测首页滚到底
	       --ef-py 仍是 -31.5px / 81px，与改造前逐像素相同。
	   也就是说：位移量没动，只把驱动从「手写 IO + rAF + 每帧 getBoundingClientRect」
	   换成了 anime 的滚动观察器（几何在 init/resize 缓存）。 */
	const d = item.obs.progress - 0.5;
	let y = d * item.factor * vh * 2;
	y = Math.round(y * 2) / 2; // 0.5px 量化，减少无谓写入
	if (y === item.last) return;
	item.last = y;
	/* 只写变量，位移由 CSS 的 translate 属性合成 —— 不碰 transform，
	   所以 .ef-hero-side 自己的 translateY(-50%) 之类不会被覆盖。 */
	item.el.style.setProperty("--ef-py", y + "px");
}

function stopParallax(): void {
	for (const item of parallaxItems) {
		item.obs.revert();
		item.el.style.removeProperty("--ef-py");
	}
	parallaxItems = [];
}

function startParallax(): void {
	stopParallax();
	/* 官网竖屏走 H5 版式，视差整块不跑（chunk 226 的 aM：非 landscape 只渲染静态图） */
	if (!isLandscape()) return;
	const nodes = document.querySelectorAll<HTMLElement>(
		"[" + PARALLAX_ATTR + "]",
	);
	if (nodes.length === 0) return;
	const vh = window.innerHeight || 1;
	for (let i = 0; i < nodes.length; i++) {
		const el = nodes[i];
		const factor = Number.parseFloat(el.getAttribute(PARALLAX_ATTR) || "");
		if (!Number.isFinite(factor) || factor === 0) continue;
		const rect = el.getBoundingClientRect();
		// 隐藏元素跳过（窄屏上 .ef-hero-side 就是 display:none）
		if (rect.width === 0 || rect.height === 0) continue;
		const item: ParallaxItem = {
			el,
			factor,
			last: Number.NaN,
			obs: onScroll({
				target: el,
				enter: "bottom top",
				leave: "top bottom",
				onUpdate: () => paintParallax(item, vh),
			}),
		};
		parallaxItems.push(item);
	}
}

/* ---- 官网 deco 带（chunk 226 的 aM / endfieldPre） -------------------------
   官网原文（逐字）：
     let e = useRef(window.document.documentElement);
     const {scrollYProgress: t} = useScroll({container: e});
     const a = useTransform(t, e => `${-(300*e)%120}%`);
     const n = useTransform(t, e => `${120-300*e%120}%`);
     return "landscape" === M() ? (
       <div className={styles.endfieldPre}>
         <div className={styles.icon} style={{translateX: a}}><Logo/></div>
         <div className={styles.icon} style={{translateX: n}}><Logo/></div>
       </div>
     ) : <Logo className={styles.h5Icon}/>;
   —— **同一份内容渲染两份**，各自按上面一条式子平移。两条式子相差正好 120%
   （= 自己宽度的 1.2 倍），所以两份实际拼成一条无缝跑带；p 从 0 到 1 各跑满
   2.5 个周期。竖屏整块换成静态 h5Icon，不跑 —— 本站同样只在 landscape 建观察器。

   本站落地的两处细节（都是为了「量化 + 不每帧重排」）：
     · % 是相对元素**自身宽度**的，所以先按缓存的宽度换成 px 再 1px 量化；
       宽度只在 init / resize 读一次，滚动路径上一格布局都不量。
     · 带内图案的周期做成宽度的 40%：1.2 倍宽度 = 3 个周期，接缝正好落在
       一段图案的起点上，位移重置（-120% → 0）时看不出跳。 */

const BAND_ATTR = "data-ef-band";
const BAND_STEP = 1; // 1px 量化

type BandItem = {
	el: HTMLElement;
	kind: string;
	width: number;
	last: number;
};

let bandItems: BandItem[] = [];
let bandObserver: ScrollObserver | null = null;

/* 官网两条映射逐字照抄。JS 的 % 取余跟着被除数走，所以
   a 落在 (-120, 0]，b = a + 120 落在 (0, 120] —— 两者是同一条锯齿。 */
function bandShift(kind: string, p: number): number {
	const t = (300 * p) % 120;
	return kind === "b" ? 120 - t : -t;
}

function paintBands(p: number): void {
	for (let i = 0; i < bandItems.length; i++) {
		const item = bandItems[i];
		const px =
			Math.round(((bandShift(item.kind, p) / 100) * item.width) / BAND_STEP) *
			BAND_STEP;
		if (px === item.last) continue; // 没变化就不写 DOM
		item.last = px;
		/* 只写无单位的位移量，落到 CSS 的独立 translate 上 —— 不碰 transform */
		item.el.style.setProperty("--ef-bx", px + "px");
	}
}

function stopBands(): void {
	if (bandObserver) {
		bandObserver.revert();
		bandObserver = null;
	}
	for (const item of bandItems) item.el.style.removeProperty("--ef-bx");
	bandItems = [];
}

function startBands(): void {
	stopBands();
	/* 官网竖屏换成静态 h5Icon：整块不跑 */
	if (!isLandscape()) return;
	const nodes = document.querySelectorAll<HTMLElement>("[" + BAND_ATTR + "]");
	if (nodes.length === 0) return;
	/* 页面本身不滚动的短页：没有进度可读，两份重合停在自然位就是一条静止的带 */
	if (document.documentElement.scrollHeight - window.innerHeight < 8) return;
	for (let i = 0; i < nodes.length; i++) {
		const el = nodes[i];
		const width = el.getBoundingClientRect().width; // 只在这里量一次
		if (width === 0) continue;
		bandItems.push({
			el,
			kind: el.getAttribute(BAND_ATTR) || "a",
			width,
			last: Number.NaN,
		});
	}
	if (bandItems.length === 0) return;
	/* 页级进度，等价于官网的 useScroll({container: documentElement})：
     enter "start start" / leave "end end" → progress = scrollY / (docH - vh)。
     一条观察器驱动全部带子，滚动时只读它算好的 progress。 */
	bandObserver = onScroll({
		target: document.body,
		enter: "start start",
		leave: "end end",
		onUpdate: (obs) => paintBands(obs.progress),
	});
	paintBands(bandObserver.progress);
}

/* ---- clipPath 擦除（官网 chunk 8858 的 C helper） --------------------------
   官网那条缓动逐字为 1 - Math.pow(1 - 0.01 * progress, 4)，progress 走 0→100，
   即四次缓出（开头快、尾巴收）。官网把它挂在 clip-path 上，随滚动进度擦除。
   本站：滚入时从左到右擦出来，一次性（擦完就摘观察器，回头滚动不再重播）。

   擦除窗口固定 0.5 屏：
     enter "75% top"   元素上边走到视口 75% 处 = progress 0（刚进来一屏的四分之一）
     leave "25% top"   元素上边走到视口 25% 处 = progress 1（已经露出四分之三屏）
   两点相距 0.5 屏，与块自身高度无关 —— 长文页那种几千 px 的大块也不会出现
   「滚了半天右半屏还是空的」；反过来起始点不能太早（贴视口下沿就开始），
   否则擦除都发生在还没进视口的那半块上，屏幕上什么也看不到。 */

const WIPE_ATTR = "data-ef-wipe";
const WIPE_DONE = "ef-wiped";
/* 擦除窗口：元素上边从视口的 75% 处（刚进来四分之一屏）走到 25% 处（已经露出
   四分之三屏）—— 固定 0.5 屏的滚动量，跟块自身高度无关；两块位置要和下面
   onScroll 的 enter / leave 一字对应。 */
const WIPE_ENTER = 0.75;
const WIPE_LEAVE = 0.25;
const WIPE_STEP = 1000; // --ef-wipe 保留一位小数（0.1% ≈ 1px），量化后再看要不要写

/* 会被擦除的块：区块与文章面板（都是「大块内容」）。
   .ef-sec 在首页/列表页，.ef-sheet-wrap 在（长页）文章页。 */
const WIPE_TARGETS: string[] = [".ef-sec", ".ef-sheet-wrap"];

type WipeItem = { el: HTMLElement; obs: ScrollObserver | null; last: number };

let wipeItems: WipeItem[] = [];

/* 官网缓动：官网 progress 用 0→100 写法（0.01*progress 即 0→1） */
function wipeEase(p: number): number {
	return 1 - Math.pow(1 - p, 4);
}

function wipeValue(p: number): number {
	return Math.round((1 - wipeEase(p)) * WIPE_STEP) / 10;
}

/* 擦完（或要求直接可见）：挂着 .ef-wiped 让 CSS 把 clip-path 收回 none，
   同时把观察器摘掉。revert 走微任务 —— 不能在 onUpdate 里同步 revert，
   那会改到 anime 正在遍历的观察器表。 */
function finishWipe(el: HTMLElement): void {
	el.classList.add(WIPE_DONE);
	el.style.removeProperty("--ef-wipe");
	for (let i = wipeItems.length - 1; i >= 0; i--) {
		if (wipeItems[i].el !== el) continue;
		const obs = wipeItems[i].obs;
		wipeItems.splice(i, 1);
		if (obs) queueMicrotask(() => obs.revert());
	}
}

function paintWipe(item: WipeItem): void {
	if (!item.obs) return;
	const v = wipeValue(item.obs.progress);
	if (v !== item.last) {
		item.last = v;
		item.el.style.setProperty("--ef-wipe", String(v));
	}
	if (v > 0) return;
	finishWipe(item.el);
}

function stopWipes(): void {
	for (const item of wipeItems) {
		if (item.obs) item.obs.revert();
		item.el.removeAttribute(WIPE_ATTR);
		item.el.style.removeProperty("--ef-wipe");
	}
	wipeItems = [];
}

function startWipes(): void {
	stopWipes();
	const vh = window.innerHeight || 1;
	for (let t = 0; t < WIPE_TARGETS.length; t++) {
		const nodes = document.querySelectorAll<HTMLElement>(WIPE_TARGETS[t]);
		for (let i = 0; i < nodes.length; i++) {
			const el = nodes[i];
			/* 已经擦完的（.ef-wiped）永不重播；正在擦的不重复建观察器 */
			if (el.classList.contains(WIPE_DONE)) continue;
			if (el.hasAttribute(WIPE_ATTR)) continue;
			wipeOne(el, vh);
		}
	}
}

function wipeOne(el: HTMLElement, vh: number): void {
	const rect = el.getBoundingClientRect();
	if (rect.width === 0 || rect.height === 0) return;
	/* 起始就在上半屏（首屏里、或锚点直接落在块中）：不做擦除，直接可见 ——
	   否则首屏会被裁掉一截，得等用户滚动才露出来。 */
	if (rect.top < vh * WIPE_LEAVE * 2) {
		el.classList.add(WIPE_DONE);
		return;
	}
	/* 起始进度按同一个窗口自己算一次，和属性在同一个任务里落下 ——
	   避免「先按 100% 裁掉一帧、再跳到真实值」。 */
	const p = Math.min(
		1,
		Math.max(
			0,
			(WIPE_ENTER * vh - rect.top) / ((WIPE_ENTER - WIPE_LEAVE) * vh),
		),
	);
	const item: WipeItem = { el, last: Number.NaN, obs: null };
	if (p > 0) el.style.setProperty("--ef-wipe", String(wipeValue(p)));
	el.setAttribute(WIPE_ATTR, "run");
	item.obs = onScroll({
		target: el,
		enter: "75% top",
		leave: "25% top",
		onUpdate: () => paintWipe(item),
		onResize: () => paintWipe(item),
	});
	wipeItems.push(item);
}

/* 兜底：后台标签页不投递滚动事件，切回前台把已经越过擦除窗口的块直接定格 */
function finishSeenWipes(): void {
	const vh = window.innerHeight || 1;
	const nodes = document.querySelectorAll<HTMLElement>(
		"[" + WIPE_ATTR + "]:not(." + WIPE_DONE + ")",
	);
	for (let i = 0; i < nodes.length; i++) {
		const el = nodes[i];
		if (el.getBoundingClientRect().top >= vh * 0.5) continue;
		finishWipe(el);
	}
}

/* ---- 生命周期 ------------------------------------------------------------ */

function boot(): void {
	if (prefersReducedMotion()) return; // 系统要求减少动态：不挂类、不建观察器、不监听
	started = true;
	tagAuto(document);
	document.documentElement.classList.add(MOTION_CLASS);
	startReveal();
	// Layout 的首次 replay 已经跑过（它的内联脚本先执行），这里按视口修正一遍
	tameOffscreenReplay();
	startParallax();
	startBands();
	startWipes();
	bindOnce();
}

/* swup 换页后：旧节点随容器一起没了，观察器整只重建；
   新页面里带 .ef-in 的元素（理论上不会有）与已进场元素不会重播。 */
function refresh(): void {
	if (!started || prefersReducedMotion()) return;
	document.documentElement.classList.add(MOTION_CLASS);
	tagAuto(document);
	startReveal();
	startParallax();
	startBands();
	startWipes();
	markInView();
}

function bindOnce(): void {
	if (bound) return;
	bound = true;

	/* 几何变化只在 resize 后重算一次，滚动路径上什么都不量 */
	window.addEventListener(
		"resize",
		() => {
			if (!started || prefersReducedMotion()) return;
			window.clearTimeout(resizeTimer);
			resizeTimer = window.setTimeout(() => {
				startParallax();
				startBands(); // 跑带的 % 换算要重读宽度；视口高变了擦除窗口也要重算
				startWipes();
			}, 200);
		},
		{ passive: true },
	);

	// 图片/字体落地会改变几何，重建一次即可（不放进滚动路径）
	window.addEventListener(
		"load",
		() => {
			if (started && !prefersReducedMotion()) {
				startParallax();
				startBands();
				startWipes();
			}
			tameOffscreenReplay();
		},
		{ once: true },
	);

	document.addEventListener("swup:page:view", () => {
		/* 同步打标 + 建观察器：监听器在 swup 换完容器之后派发，此刻打标还没绘制，
		   不会出现「先亮一帧再变透明」。几何量测放到下一帧（字体/图片落位）。
		   tameOffscreenReplay 必须紧跟在 Layout 的监听器之后同步执行，
		   否则中间会绘制出一帧「全站都在播」的画面。 */
		if (started && !prefersReducedMotion()) {
			/* swup 会连同 <html> 的 class 一起换成新页面的（服务端渲染里没有
			   ef-motion），所以每次切页都得把开关补回去，否则新页面上的
			   data-ef-reveal 不再被上面的 CSS 命中。 */
			document.documentElement.classList.add(MOTION_CLASS);
			stopReveal();
			stopParallax();
			stopBands();
			stopWipes();
			tagAuto(document);
			tameOffscreenReplay();
			startReveal();
		}
		window.requestAnimationFrame(() => window.requestAnimationFrame(refresh));
	});

	// 后台标签页里滚动观察器不投递，切回前台补齐
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) return;
		// Layout 的运行时会在切回前台时再 replay 一次，这里同样只留视口内的
		tameOffscreenReplay();
		markInView();
	});

	if (typeof window.matchMedia === "function") {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		const onChange = (): void => {
			if (mq.matches) teardown();
		};
		if (typeof mq.addEventListener === "function")
			mq.addEventListener("change", onChange);
		else if (typeof mq.addListener === "function") mq.addListener(onChange);
	}
}

/* 用户中途把系统切成「减少动态」：立刻停到自然状态（全部可见、零位移）。 */
function teardown(): void {
	stopReveal();
	stopParallax();
	stopBands();
	stopWipes();
	if (resizeTimer) {
		window.clearTimeout(resizeTimer);
		resizeTimer = 0;
	}
	document.documentElement.classList.remove(MOTION_CLASS);
	for (const el of document.querySelectorAll<HTMLElement>(
		"[" + REVEAL_ATTR + "]",
	)) {
		el.classList.add(IN_CLASS);
		el.style.removeProperty("opacity");
		el.style.removeProperty("--ef-rp");
	}
	// 擦除中的块：立刻定格成「完全可见」（clip-path 归零，位移量清掉）
	for (const el of document.querySelectorAll<HTMLElement>("[" + WIPE_ATTR + "]")) {
		finishWipe(el);
	}
	started = false;
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
	boot();
}
