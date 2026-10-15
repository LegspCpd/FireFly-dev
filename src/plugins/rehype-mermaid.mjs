import { createNodeEngine } from "@mermanjs/node";
import { fromHtml } from "hast-util-from-html";
import { h } from "hastscript";
import { visit } from "unist-util-visit";
import {
	DIAGRAM_CONTAINER,
	DIAGRAM_WRAPPER,
	MERMAID_CONTAINER,
	MERMAID_ERROR,
	MERMAID_FALLBACK_CODE,
	MERMAID_SVG_DARK,
	MERMAID_SVG_LIGHT,
	MERMAID_WRAPPER,
} from "./utils/diagramConstants.js";
import { extractText } from "./utils/extractText.js";

// 构建期创建一个原生 Node 引擎并复用。本站是 SSG，用同步渲染路径即可。
// 注意：0.8.0 起那个浏览器专用包在 Node/SSR 里会直接断言失败，
// 所以构建期渲染改走 @mermanjs/node。
const mermanEngine = await createNodeEngine();

/**
 * 在构建时将 Mermaid 源码渲染为浅色和深色两套静态 SVG
 *
 * @param {string} mermaidCode - Mermaid 图表源码
 * @param {object} themeConfig - { lightTheme, darkTheme } 主题名
 * @param {number} diagramIndex - 当前文档中的图表序号
 * @returns {{ lightSvg: string, darkSvg: string }}
 */
/**
 * 生成的 SVG 在注入页面前做一次安全检查。
 *
 * 旧实现依赖浏览器包里提供的 DOM 安全断言；该包自 0.8.0 起为浏览器专用，
 * Node 侧不再提供等价断言，因此这里显式列出禁止构造，保持「构建期失败」的语义。
 *
 * 两类引用要分开看：
 *  - 外部渲染资源（image / use / script 指向 http(s)）→ 禁止
 *  - 外部导航链接（a 标签指向 https，Mermaid 的 click 指令）→ 允许
 */
const FORBIDDEN_SVG = [
	{ re: /<script/i, what: "script 标签" },
	{ re: /<foreignobject/i, what: "foreignObject 标签" },
	{ re: /<iframe/i, what: "iframe 标签" },
	{ re: /<object/i, what: "object 标签" },
	{ re: /<embed/i, what: "embed 标签" },
	{ re: /javascript:/i, what: "javascript: 协议" },
	{ re: / on[a-z]+ *=/i, what: "on* 事件属性" },
	{
		re: /<(?:image|use|script)[^>]*(?:href|xlink:href)="?(?:https?:)?[/][/]/i,
		what: "指向外部资源的渲染引用",
	},
];

function assertSafeSvg(svg, label) {
	for (const rule of FORBIDDEN_SVG) {
		if (rule.re.test(svg)) {
			throw new Error("[mermaid] " + label + " SVG 含被禁止的构造：" + rule.what);
		}
	}
}
/**
 * 移除 SVG 内联 style 中的 max-width 限制，
 * 使图表能根据容器宽度自适应缩放
 */
function removeSvgMaxWidth(svg) {
	return svg.replace(/(<svg[^>]*style="[^"]*?)max-width:\s*[^;]+;?/, "$1");
}

function buildMermaidSvgs(mermaidCode, themeConfig, diagramIndex) {
	const lightSvg = mermanEngine.renderSvgSync(mermaidCode, {
		// node 包把每次请求的选项以 JSON 字符串传入（与旧 web 包的选项对象同源）
		optionsJson: JSON.stringify({
			host_theme: { preset: themeConfig.lightTheme },
			svg: {
				diagram_id: "mermaid-" + diagramIndex + "-light",
				pipeline: "parity",
			},
		}),
	});
	const darkSvg = mermanEngine.renderSvgSync(mermaidCode, {
		// node 包把每次请求的选项以 JSON 字符串传入（与旧 web 包的选项对象同源）
		optionsJson: JSON.stringify({
			host_theme: { preset: themeConfig.darkTheme },
			svg: {
				diagram_id: "mermaid-" + diagramIndex + "-dark",
				pipeline: "parity",
			},
		}),
	});

	assertSafeSvg(lightSvg, "亮色");
	assertSafeSvg(darkSvg, "暗色");

	return {
		lightSvg: removeSvgMaxWidth(lightSvg),
		darkSvg: removeSvgMaxWidth(darkSvg),
	};
}

/**
 * @param {object} [options] - 配置选项
 * @param {string} [options.lightTheme] - 亮色主题名
 * @param {string} [options.darkTheme] - 暗色主题名
 */
export function rehypeMermaid(options = {}) {
	const themeConfig = {
		lightTheme: options.lightTheme || "editor-light",
		darkTheme: options.darkTheme || "editor-dark",
	};

	return (tree) => {
		let diagramIndex = 0;

		visit(tree, "element", (node) => {
			if (
				node.tagName !== "div" ||
				!node.properties?.className?.includes("mermaid-container")
			) {
				return;
			}

			// 优先使用 data-mermaid-code 属性，为空时从子节点文本提取（MDX 兼容）
			let mermaidCode = node.properties["data-mermaid-code"] || "";
			if (!mermaidCode) {
				mermaidCode = extractText(node).trim();
			}

			let lightSvg;
			let darkSvg;
			try {
				({ lightSvg, darkSvg } = buildMermaidSvgs(
					mermaidCode,
					themeConfig,
					diagramIndex,
				));
				diagramIndex += 1;
			} catch (e) {
				const preview =
					mermaidCode.length > 200
						? `${mermaidCode.slice(0, 200)}…[truncated]`
						: mermaidCode;
				if (process.env.NODE_ENV === "development") {
					console.error("[rehype-mermaid] Render failed:", e, preview);
				} else {
					console.error(
						"[rehype-mermaid] Render failed:",
						e instanceof Error ? e.message : String(e),
					);
				}
				node.properties = {
					class: `${DIAGRAM_CONTAINER} ${MERMAID_CONTAINER}`,
				};
				node.children = [
					h("div", { class: MERMAID_ERROR }, [
						h("p", {}, "Mermaid 图表渲染失败，请检查图表语法是否正确"),
						h("pre", { class: MERMAID_FALLBACK_CODE }, mermaidCode),
					]),
				];
				return;
			}

			// 替换为静态 SVG（浅色 + 深色双版本，CSS 控制显示）。
			// 用 fromHtml 把 SVG 字符串解析成 element 节点，而不是塞进 { type: "raw" }：
			// MDX 的 hast-util-to-estree 不支持 raw 节点（会抛 "Cannot handle unknown node `raw`"），
			// 解析成元素后 MDX / Markdown 两条渲染管线都能正常输出。
			node.properties = { class: `${DIAGRAM_CONTAINER} ${MERMAID_CONTAINER}` };
			const lightChildren = fromHtml(lightSvg, { fragment: true }).children;
			const darkChildren = fromHtml(darkSvg, { fragment: true }).children;
			node.children = [
				h("div", { class: `${DIAGRAM_WRAPPER} ${MERMAID_WRAPPER}` }, [
					h("div", { class: MERMAID_SVG_LIGHT }, lightChildren),
					h("div", { class: MERMAID_SVG_DARK }, darkChildren),
				]),
			];
		});
	};
}
