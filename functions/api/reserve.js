// POST /api/reserve  -> save one reservation in Cloudflare KV
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

export async function onRequestPost({ request, env }) {
  if (!env.RESERVATIONS) {
    return json({ error: "KV namespace RESERVATIONS is not bound" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  // honeypot: accept silently, store nothing
  if (body.hp) return json({ ok: true });

  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    return json({ error: "invalid email" }, 400);
  }

  const list = await env.RESERVATIONS.list();

  // skip duplicates of the same email
  for (const k of list.keys) {
    const existing = await env.RESERVATIONS.get(k.name, { type: "json" });
    if (existing && existing.email === email) {
      return json({ ok: true, duplicate: true, count: list.keys.length });
    }
  }

  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.RESERVATIONS.put(
    key,
    JSON.stringify({
      email,
      ts: new Date().toISOString(),
      dome: body.dome || null,
      base: body.base || null,
      referrer: request.headers.get("referer") || null,
      ua: request.headers.get("user-agent") || null
    })
  );

  return json({ ok: true, count: list.keys.length + 1 });
}
