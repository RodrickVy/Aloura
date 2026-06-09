/**
 * face_analyze
 * Supabase Edge Function - Deno / TypeScript
 *
 * Generalised: takes image URLs directly (no DB coupling) so it can be reused
 * by the Style Report flow. Sends raw bytes to AILab's face-analyzer, maps
 * numeric codes to readable labels, and merges up to 3 images into one manifest.
 *
 * POST { image_url?: string, image_urls?: string[] }
 *
 * Returns { success, images_analysed, per_image, manifest }
 *   manifest includes: face_position {x,y,width,height}, face_shape, gender,
 *   age, skin {type}, hair, eyes, eyebrows, nose, etc.
 *
 * Secrets: AILAB_API_KEY
 */

const AILAB_API_KEY = Deno.env.get("AILAB_API_KEY") ?? "";
const AILAB_URL      = "https://www.ailabapi.com/api/portrait/analysis/face-analyzer";
const AILAB_ATTRS    = "Age,Beauty,Emotion,Eye,Eyebrow,Gender,Hair,Hat,Mask,Mouth,Moustache,Nose,Shape,Skin,Smile";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age":       "86400",
};

const MAPS: Record<string, Record<number, string>> = {
  emotion:         { 0:"Neutral", 1:"Happy", 2:"Surprised", 3:"Angry", 4:"Sad", 5:"Disgusted", 6:"Fearful" },
  glasses:         { 0:"No glasses", 1:"Regular glasses", 2:"Sunglasses" },
  eye_open:        { 0:"Closed", 1:"Open" },
  eyelid:          { 0:"Single eyelid", 1:"Double eyelid" },
  eye_size:        { 0:"Small", 1:"Regular", 2:"Large" },
  eyebrow_density: { 0:"Sparse", 1:"Thick" },
  eyebrow_curve:   { 0:"Straight", 1:"Curved" },
  eyebrow_length:  { 0:"Short", 1:"Long" },
  gender:          { 0:"Male", 1:"Female" },
  hair_length:     { 0:"Bald", 1:"Short", 2:"Medium", 3:"Long", 4:"Tied" },
  hair_bang:       { 0:"No fringe", 1:"Has fringe" },
  hair_color:      { 0:"Black", 1:"Blonde", 2:"Brown", 3:"Gray / White" },
  hat_style:       { 0:"No hat", 1:"Regular hat", 2:"Helmet", 3:"Security hat" },
  hat_color:       { 0:"No hat", 1:"Red", 2:"Yellow", 3:"Blue", 4:"Black", 5:"Gray / White", 6:"Mixed" },
  mask:            { 0:"No mask", 1:"Not covering face", 2:"On chin", 3:"On mouth", 4:"Correctly worn" },
  mouth_open:      { 0:"Closed", 1:"Open" },
  moustache:       { 0:"No facial hair", 1:"Has facial hair" },
  nose:            { 0:"Upturned", 1:"Hooked", 2:"Normal", 3:"Round-tipped" },
  face_shape:      { 0:"Square", 1:"Triangle", 2:"Oval", 3:"Heart", 4:"Round" },
  skin_type:       { 0:"Yellow / Olive", 1:"Brown / Tan", 2:"Dark / Deep", 3:"Fair / Light" },
};

function lbl(map: string, type: number, prob: number) {
  return { value: MAPS[map]?.[type] ?? `Unknown (${type})`, confidence: Math.round(prob * 100) + "%" };
}

// deno-lint-ignore no-explicit-any
function mapFace(face: any) {
  const a = face.face_detail_attributes_info;
  const r = face.face_rect;
  return {
    face_position: { x: r.x, y: r.y, width: r.width, height: r.height },
    skin:       { type: lbl("skin_type", a.skin.type, a.skin.probability), raw_type_id: a.skin.type },
    face_shape: lbl("face_shape", a.shape.type, a.shape.probability),
    gender:     lbl("gender", a.gender.type, a.gender.probability),
    age:        a.age,
    eyes: {
      glasses: lbl("glasses",   a.eye.glass.type,       a.eye.glass.probability),
      open:    lbl("eye_open",  a.eye.eye_open.type,    a.eye.eye_open.probability),
      eyelid:  lbl("eyelid",    a.eye.eyelid_type.type, a.eye.eyelid_type.probability),
      size:    lbl("eye_size",  a.eye.eye_size.type,    a.eye.eye_size.probability),
    },
    eyebrows: {
      density: lbl("eyebrow_density", a.eyebrow.eyebrow_density.type, a.eyebrow.eyebrow_density.probability),
      curve:   lbl("eyebrow_curve",   a.eyebrow.eyebrow_curve.type,   a.eyebrow.eyebrow_curve.probability),
      length:  lbl("eyebrow_length",  a.eyebrow.eyebrow_length.type,  a.eyebrow.eyebrow_length.probability),
    },
    hair: {
      length: lbl("hair_length", a.hair.length.type, a.hair.length.probability),
      fringe: lbl("hair_bang",   a.hair.bang.type,   a.hair.bang.probability),
      color:  lbl("hair_color",  a.hair.color.type,  a.hair.color.probability),
    },
    hat:       { style: lbl("hat_style", a.hat.style.type, a.hat.style.probability), color: lbl("hat_color", a.hat.color.type, a.hat.color.probability) },
    nose:      lbl("nose",       a.nose.type,             a.nose.probability),
    moustache: lbl("moustache",  a.moustache.type,        a.moustache.probability),
    mask:      lbl("mask",       a.mask.type,             a.mask.probability),
    mouth:     lbl("mouth_open", a.mouth.mouth_open.type, a.mouth.mouth_open.probability),
    emotion:   lbl("emotion",    a.emotion.type,          a.emotion.probability),
    smile:     a.smile + " / 100",
    beauty:    a.beauty + " / 100",
  };
}

// deno-lint-ignore no-explicit-any
function mergeManifest(results: any[]): Record<string, unknown> {
  if (results.length === 0) return {};
  if (results.length === 1) return { ...results[0], _source: "single_image" };
  // deno-lint-ignore no-explicit-any
  const best = (getter: (r: any) => any) => {
    let top: any, topPct = -1;
    for (const r of results) {
      const f = getter(r); if (!f) continue;
      const pct = parseInt(f.confidence);
      if (pct > topPct) { topPct = pct; top = f; }
    }
    return top;
  };
  // deno-lint-ignore no-explicit-any
  const avg = (getter: (r: any) => number) => {
    const v = results.map(getter).filter(n => !isNaN(n));
    return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
  };
  return {
    _source: `${results.length}_images_merged`,
    face_position: results[0].face_position,
    skin: { type: best(r => r.skin.type), raw_type_id: results[0].skin.raw_type_id },
    face_shape: best(r => r.face_shape),
    gender: best(r => r.gender),
    age: avg(r => r.age),
    eyes:     { glasses: best(r => r.eyes.glasses), open: best(r => r.eyes.open), eyelid: best(r => r.eyes.eyelid), size: best(r => r.eyes.size) },
    eyebrows: { density: best(r => r.eyebrows.density), curve: best(r => r.eyebrows.curve), length: best(r => r.eyebrows.length) },
    hair:     { length: best(r => r.hair.length), fringe: best(r => r.hair.fringe), color: best(r => r.hair.color) },
    nose: best(r => r.nose), moustache: best(r => r.moustache), mask: best(r => r.mask), mouth: best(r => r.mouth), emotion: best(r => r.emotion),
  };
}

async function callAilab(bytes: Uint8Array) {
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: "image/jpeg" }), "face.jpg");
  form.append("max_face_num", "1");
  form.append("face_attributes_type", AILAB_ATTRS);
  const res = await fetch(AILAB_URL, { method: "POST", headers: { "ailabapi-api-key": AILAB_API_KEY }, body: form });
  if (!res.ok) throw new Error(`AILab HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data.error_code !== 0) throw new Error(`AILab error ${data.error_code}: ${data.error_msg}`);
  const face = data.face_detail_infos?.[0];
  if (!face) throw new Error("No face detected in image");
  return mapFace(face);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json() as { image_url?: string; image_urls?: string[] };
    const urls = (body.image_urls?.length ? body.image_urls : (body.image_url ? [body.image_url] : [])).slice(0, 3);
    if (!urls.length) throw new Error("image_url or image_urls is required");
    if (!AILAB_API_KEY) throw new Error("AILAB_API_KEY secret is not set");

    const results: ReturnType<typeof mapFace>[] = [];
    const perImage: Record<string, unknown>[] = [];
    for (let i = 0; i < urls.length; i++) {
      try {
        const r = await fetch(urls[i]);
        if (!r.ok) throw new Error(`fetch image ${r.status}`);
        const bytes = new Uint8Array(await r.arrayBuffer());
        const result = await callAilab(bytes);
        results.push(result);
        perImage.push({ image_index: i + 1, ok: true, data: result });
      } catch (e) {
        perImage.push({ image_index: i + 1, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(JSON.stringify({
      success: true, images_analysed: results.length, per_image: perImage, manifest: mergeManifest(results),
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[face_analyze] Fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
