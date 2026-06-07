/**
 * trend_source_web
 * Supabase Edge Function - Deno / TypeScript
 *
 * POST { topic: string }
 *
 * Lightweight data-acquisition pipeline for general web / blog / article
 * fashion-trend signals about a niche topic. Returns raw, unprocessed
 * descriptive data (titles + snippets + urls) for an LLM to interpret later.
 *
 * FAIL-SAFE: on any error, missing key, or no results it falls back to a
 * plain Google search for "<topic> trending fashion" and returns top URLs.
 * It never throws - downstream orchestration tolerates partial/empty data.
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

const SOURCE = "web";

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
  } catch { /* ignore - handled below */ }

  if (!topic) {
    return new Response(JSON.stringify({ source: SOURCE, topic: "", results: [], raw_text: "" }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Primary: articles / blogs about the trend. Fallback: generic trending search.
  let results = await googleSearch(`${topic} fashion trend what to wear 2026 outfit guide`);
  if (!results.length) results = await googleSearch(`${topic} trending fashion`);

  const raw_text = results.map(r => `${r.title}. ${r.snippet}`).join("\n");

  return new Response(
    JSON.stringify({ source: SOURCE, topic, results, raw_text }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
