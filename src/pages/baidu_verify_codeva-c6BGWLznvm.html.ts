import type { APIRoute } from "astro";
import { siteConfig } from "@/config";

export const prerender = true;

export const GET: APIRoute = () => {
	return new Response(
		siteConfig.webmasterVerification?.files?.[
			"baidu_verify_codeva-c6BGWLznvm"
		] || "",
		{ headers: { "Content-Type": "text/plain; charset=utf-8" } },
	);
};
