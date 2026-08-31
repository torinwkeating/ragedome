// Rage Dome — API + static assets
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,x-admin-key",
  "access-control-max-age": "86400"
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign(
      { "content-type": "application/json", "cache-control": "no-store" },
      CORS
    )
  });

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function adminOk(request, env) {
  if (!env.ADMIN_KEY) return "unset";
  const url = new URL(request.url);
  const given = request.headers.get("x-admin-key") || url.searchParams.get("key") || "";
  return given === env.ADMIN_KEY;
}

async function handleReserve(request, env) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!env.RESERVATIONS) return json({ error: "storage not connected yet" }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "bad request" }, 400); }

  if (body.hp) return json({ ok: true });

  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: "invalid email" }, 400);

  const list = await env.RESERVATIONS.list();
  for (const k of list.keys) {
    const existing = await env.RESERVATIONS.get(k.name, { type: "json" });
    if (existing && existing.email === email) {
      return json({ ok: true, duplicate: true, count: list.keys.length });
    }
  }

  const key = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  await env.RESERVATIONS.put(key, JSON.stringify({
    email,
    ts: new Date().toISOString(),
    dome: body.dome || null,
    base: body.base || null,
    referrer: request.headers.get("referer") || null,
    ua: request.headers.get("user-agent") || null
  }));

  return json({ ok: true, count: list.keys.length + 1 });
}

async function handleReserves(request, env) {
  if (!env.RESERVATIONS) return json({ error: "storage not connected yet" }, 500);
  const url = new URL(request.url);

  if (request.method === "GET" && url.searchParams.get("count") === "1") {
    const list = await env.RESERVATIONS.list();
    return json({ count: list.keys.length });
  }

  const ok = adminOk(request, env);
  if (ok === "unset") return json({ error: "ADMIN_KEY is not set" }, 500);
  if (!ok) return json({ error: "unauthorized" }, 401);

  if (request.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "missing id" }, 400);
    await env.RESERVATIONS.delete(id);
    const after = await env.RESERVATIONS.list();
    return json({ ok: true, count: after.keys.length });
  }

  if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

  const list = await env.RESERVATIONS.list();
  const items = [];
  for (const k of list.keys) {
    const v = await env.RESERVATIONS.get(k.name, { type: "json" });
    if (v) items.push(Object.assign({ id: k.name }, v));
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return json({ count: items.length, reservations: items });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // browser preflight for cross-origin API calls
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === "/api/reserve")  return handleReserve(request, env);
    if (url.pathname === "/api/reserves") return handleReserves(request, env);
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      return env.ASSETS.fetch(new Request(new URL("/admin.html", url), request));
    }
    return env.ASSETS.fetch(request);
  }
};
