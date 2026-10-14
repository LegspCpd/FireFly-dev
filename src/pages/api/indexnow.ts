/**
 * IndexNow API Endpoint
 *
 * 根据 Bing Webmaster Guidelines 建议，
 * 提供 IndexNow URL 提交接口，用于快速通知搜索引擎内容变更。
 *
 * 使用方法：
 *   POST /api/indexnow
 *   Body: { "urls": ["https://blog.legspcpd.top/posts/example/"] }
 *
 * 或通过查询参数：
 *   GET /api/indexnow?url=https://blog.legspcpd.top/posts/example/
 *
 * 更多信息：https://www.indexnow.org/
 */

import type { APIRoute } from "astro";
import { siteConfig } from "@/config";

const INDEXNOW_ENDPOINT = "https://www.bing.com/indexnow";
const INDEXNOW_KEY = siteConfig.indexnow?.key || "";

export const prerender = false;

export const GET: APIRoute = async ({ url, redirect }) => {
	const targetUrl = url.searchParams.get("url");

	if (!targetUrl) {
		return new Response(
			JSON.stringify({ error: "Missing 'url' query parameter" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	if (!INDEXNOW_KEY) {
		return new Response(
			JSON.stringify({
				error: "IndexNow key not configured. Set siteConfig.indexnow.key",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	// 重定向到 Bing IndexNow 服务
	const indexNowUrl = new URL(INDEXNOW_ENDPOINT);
	indexNowUrl.searchParams.set("url", targetUrl);
	indexNowUrl.searchParams.set("key", INDEXNOW_KEY);

	return redirect(indexNowUrl.toString(), 302);
};

export const POST: APIRoute = async ({ request }) => {
	if (!INDEXNOW_KEY) {
		return new Response(
			JSON.stringify({
				error: "IndexNow key not configured. Set siteConfig.indexnow.key",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	try {
		const body = await request.json();
		const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];

		if (urls.length === 0) {
			return new Response(
				JSON.stringify({ error: "Missing 'urls' array in request body" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// 批量提交到 Bing IndexNow
		const results = await Promise.allSettled(
			urls.map(async (targetUrl) => {
				const indexNowUrl = new URL(INDEXNOW_ENDPOINT);
				indexNowUrl.searchParams.set("url", targetUrl);
				indexNowUrl.searchParams.set("key", INDEXNOW_KEY);
				const response = await fetch(indexNowUrl.toString());
				return { url: targetUrl, status: response.status };
			}),
		);

		const submitted = results.map((r) =>
			r.status === "fulfilled" ? r.value : { url: "unknown", status: 500 },
		);

		return new Response(JSON.stringify({ submitted }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (e) {
		return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}
};
