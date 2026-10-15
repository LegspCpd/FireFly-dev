/**
 * merman 内置宿主主题预设名。
 *
 * 取值来自 @mermanjs 的 BUNDLED_THEME_PRESETS。构建期已改用 @mermanjs/node，
 * 该包不再导出这个类型，故在此显式列出；升级依赖时需同步核对。
 */
export type MermaidThemeName =
	| "editor-light"
	| "editor-dark"
	| "one-dark"
	| "gruvbox-light"
	| "gruvbox-dark"
	| "ayu-light"
	| "ayu-dark";

/**
 * Mermaid 图表渲染配置
 *
 * 控制 markdown 文章中 mermaid 代码块在构建时的服务端 SVG 渲染行为。
 */
export type MermaidConfig = {
	/** 亮色模式下使用的 merman 宿主主题预设名 */
	lightTheme: MermaidThemeName;
	/** 暗色模式下使用的 merman 宿主主题预设名 */
	darkTheme: MermaidThemeName;
};
