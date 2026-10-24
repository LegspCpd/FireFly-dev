<script lang="ts">
/**
 * 官网图标渲染器（Svelte 版）。
 *
 * 与 @components/common/EfIcon.astro 共用同一张表（@/constants/efIcons 的 EF_ICONS），
 * 几何逐字来自官网 index.html 内联 svg。单独有一份 Svelte 版是因为 .astro 组件
 * 不能 import 进 .svelte 文件（Svelte 岛只认 Svelte 组件）。
 *
 * 尺寸：width/height = 1em，跟随祖先 font-size；颜色：fill: currentColor。
 */
import { EF_ICONS, type EfIconKey } from "@/constants/efIcons";

interface Props {
	/** 官网图标表里的 key（见 efIcons.ts 的 EfIconKey）。 */
	name: EfIconKey;
	/** 额外 class（尺寸优先用 font-size 控制）。 */
	class?: string;
	/** 需要旋转 / 微调时用内联 style。 */
	style?: string;
}

let { name, class: className = "", style = "" }: Props = $props();
const icon = $derived(EF_ICONS[name]);
</script>

<svg
	class="ef-icon {className}"
	style={style}
	xmlns="http://www.w3.org/2000/svg"
	viewBox={icon.viewBox}
	fill="currentColor"
	fill-rule={icon.fillRule}
	aria-hidden="true"
	focusable="false"
>
	{#if icon.extra}{@html icon.extra}{/if}
	{#each icon.paths as d}
		<path {d} fill={icon.pathFill} />
	{/each}
</svg>

<style>
	.ef-icon {
		display: inline-block;
		width: 1em;
		height: 1em;
		flex: none;
		vertical-align: -0.125em;
	}
</style>
