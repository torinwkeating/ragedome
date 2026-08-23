import { getStore } from "@netlify/blobs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  // honeypot: silently accept bots without storing
  if (body.hp) return json({ ok: true });

  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    return json({ error: "invalid email" }, 400);
  }

  const store = getStore("reservations");

  // skip duplicates of the same email
  const { blobs } = await store.list();
  for (const b of blobs) {
    const existing = await store.get(b.key, { type: "json" });
    if (existing && existing.email === email) {
      return json({ ok: true, duplicate: true, count: blobs.length });
    }
  }

  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await store.setJSON(key, {
    email,
    ts: new Date().toISOString(),
    dome: body.dome || null,
    base: body.base || null,
    referrer: req.headers.get("referer") || null,
    ua: req.headers.get("user-agent") || null
  });

  return json({ ok: true, count: blobs.length + 1 });
};
