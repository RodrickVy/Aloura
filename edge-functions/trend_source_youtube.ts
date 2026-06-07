/**
 * trend_source_youtube
 * Supabase Edge Function - Deno / TypeScript
 *
 * POST { topic: string }
 *
 * Lightweight data-acquisition pipeline for YouTube short-form fashion-trend
 * signals (fit checks, hauls, "how to style", capsule wardrobes). Returns raw,
 * unprocessed descriptive data (video titles + descriptions + urls).
 *
 * FAIL-SAFE: uses SerpAPI's YouTube engine; on any error/empty it falls back
 * to a plain Google search biased to YouTube, then to a generic trending
 * search. It never throws - downstream tolerates partial/empty data.
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

const SOURCE = "youtube";

interface RawResult { title: string; url: string; snippet: string; }

async function youtubeSearch(query: string): Promise<RawResult[]> {
  if (!SERP_API_KEY) return [];
  try {
    const url = `https://serpapi.com/search?engine=youtube&search_query=${encodeURIComponent(query)}`
      + `&api_key=${SERP_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const vids = (data.video_results ?? []) as Record<string, unknown>[];
    return vids.slice(0, 20).map(r => ({
      title:   (r.title as string) ?? "",
      url:     (r.link as string) ?? "",
      snippet: (r.description as string) ?? (r.snippet as string) ?? "",
    })).filter(r => r.title || r.snippet);
  } catch {
    return [];
  }
}

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

  // Primary: YouTube engine. Fallbacks: google->youtube, then generic trending.
  let results = await youtubeSearch(`${topic} outfit fit check how to style haul`);
  if (!results.length) results = await googleSearch(`${topic} fashion youtube fit check`);
  if (!results.length) results = await googleSearch(`${topic} trending fashion`);

  const raw_text = results.map(r => `${r.title}. ${r.snippet}`).join("\n");

  return new Response(
    JSON.stringify({ source: SOURCE, topic, results, raw_text }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
