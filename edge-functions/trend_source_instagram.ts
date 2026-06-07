/**
 * trend_source_instagram
 * Supabase Edge Function - Deno / TypeScript
 *
 * POST { topic: string }
 *
 * Lightweight data-acquisition pipeline for Instagram-flavoured fashion-trend
 * signals about a niche topic (public posts, hashtags, creators, captions).
 * Returns raw, unprocessed descriptive data for an LLM to interpret later.
 *
 * FAIL-SAFE: there's no Instagram API key wired yet, so this queries Google
 * biased toward Instagram results (and falls back to a plain trending search).
 * It never throws - downstream orchestration tolerates partial/empty data.
 * Swap in a real IG provider (Apify/RapidAPI) later without changing the shape.
 *
 * Secrets: SERP_API_KEY
 */

const SERP_API_KEY = Deno.env.get("SERP_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age":       "86400",
};

const SOURCE = "instagram";

interface RawResult { title: string; url: string; snippet: string; }

async function googleSearch(query: string): Promise<RawResult[]> {
  if (!SERP_API_KEY) return [];
  try {
    const url = `https://serpapi.com/search?engine=google&q=${encodeURIComponent(query)}&num=20`
      + `&api_key=${SERP_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const organic = (data.organic_results ?? []) as Record<string, unknown>[];
    return organic.slice(0, 20).map(r => ({
      title:   (r.title as string) ?? "",
      url:     (r.link as string) ?? "",
      snippet: (r.snippet as string) ?? "",
    })).filter(r => r.title || r.snippet);
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let topic = "";
  try {
    const body = await req.json() as { topic?: string };
    topic = (body.topic ?? "").trim();
  } catch { /* ignore */ }

  if (!topic) {
    return new Response(JSON.stringify({ source: SOURCE, topic: "", results: [], raw_text: "" }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Primary: Instagram-biased fashion posts. Fallback: generic trending search.
  let results = await googleSearch(`${topic} outfit instagram fashion inspo trending`);
  if (!results.length) results = await googleSearch(`${topic} trending fashion`);

  const raw_text = results.map(r => `${r.title}. ${r.snippet}`).join("\n");

  return new Response(
    JSON.stringify({ source: SOURCE, topic, results, raw_text }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
