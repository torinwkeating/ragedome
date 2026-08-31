// GET    /api/reserves?count=1   -> public count only
// GET    /api/reserves           -> full list (needs x-admin-key)
// DELETE /api/reserves?id=KEY    -> remove one (needs x-admin-key)
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

function authed(request, env) {
  const expected = env.ADMIN_KEY;
  if (!expected) return "unset";
  const url = new URL(request.url);
  const given = request.headers.get("x-admin-key") || url.searchParams.get("key") || "";
  return given === expected;
}

export async function onRequestGet({ request, env }) {
  if (!env.RESERVATIONS) return json({ error: "KV namespace RESERVATIONS is not bound" }, 500);
  const url = new URL(request.url);
  const list = await env.RESERVATIONS.list();

  // public: count only, no emails exposed
  if (url.searchParams.get("count") === "1") {
    return json({ count: list.keys.length });
  }

  const ok = authed(request, env);
  if (ok === "unset") return json({ error: "ADMIN_KEY is not set in Cloudflare settings" }, 500);
  if (!ok) return json({ error: "unauthorized" }, 401);

  const items = [];
  for (const k of list.keys) {
    const v = await env.RESERVATIONS.get(k.name, { type: "json" });
    if (v) items.push({ id: k.name, ...v });
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));

  return json({ count: items.length, reservations: items });
}

export async function onRequestDelete({ request, env }) {
  if (!env.RESERVATIONS) return json({ error: "KV namespace RESERVATIONS is not bound" }, 500);

  const ok = authed(request, env);
  if (ok === "unset") return json({ error: "ADMIN_KEY is not set in Cloudflare settings" }, 500);
  if (!ok) return json({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "missing id" }, 400);

  await env.RESERVATIONS.delete(id);
  const list = await env.RESERVATIONS.list();
  return json({ ok: true, count: list.keys.length });
}
