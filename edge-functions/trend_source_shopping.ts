/**
 * trend_source_shopping
 * Supabase Edge Function - Deno / TypeScript
 *
 * POST { topic: string }
 *
 * Lightweight data-acquisition pipeline for Google Shopping fashion-trend
 * signals (what products are surfacing/selling for a niche). Returns raw,
 * unprocessed descriptive data (product titles + store + price + snippet).
 *
 * FAIL-SAFE: uses SerpAPI google_shopping; on any error/empty it falls back
 * to a plain Google search. It never throws.
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

const SOURCE = "shopping";

interface RawResult { title: string; url: string; snippet: string; store?: string; price?: number | null; }

async function shoppingSearch(query: string): Promise<RawResult[]> {
  if (!SERP_API_KEY) return [];
  try {
    const url = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(query)}&num=20`
      + `&api_key=${SERP_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const items = (data.shopping_results ?? []) as Record<string, unknown>[];
    return items.slice(0, 20).map(r => {
      const priceRaw = r.extracted_price ?? r.price;
      const price = typeof priceRaw === "number" ? priceRaw
        : typeof priceRaw === "string" ? parseFloat(priceRaw.replace(/[^0-9.]/g, "")) || null
        : null;
      return {
        title:   (r.title as string) ?? "",
        url:     (r.link as string) ?? (r.product_link as string) ?? "",
        snippet: (r.snippet as string) ?? (Array.isArray(r.extensions) ? (r.extensions as string[]).join(" · ") : ""),
        store:   (r.source as string) ?? "",
        price,
      };
    }).filter(r => r.title);
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

  let results = await shoppingSearch(`${topic} trending outfit`);
  if (!results.length) results = await googleSearch(`${topic} trending fashion`);

  const raw_text = results.map(r => `${r.title}${r.store ? ` (${r.store})` : ""}. ${r.snippet}`).join("\n");

  return new Response(
    JSON.stringify({ source: SOURCE, topic, results, raw_text }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
