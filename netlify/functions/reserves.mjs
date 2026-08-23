import { getStore } from "@netlify/blobs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

export default async (req) => {
  const url = new URL(req.url);
  const store = getStore("reservations");

  // public: just the count, no emails exposed
  if (url.searchParams.get("count") === "1") {
    const { blobs } = await store.list();
    return json({ count: blobs.length });
  }

  const expected = process.env.ADMIN_KEY;
  if (!expected) {
    return json({ error: "ADMIN_KEY is not set in Netlify environment variables" }, 500);
  }

  const given = req.headers.get("x-admin-key") || url.searchParams.get("key") || "";
  if (given !== expected) return json({ error: "unauthorized" }, 401);

  const { blobs } = await store.list();
  const items = [];
  for (const b of blobs) {
    const v = await store.get(b.key, { type: "json" });
    if (v) items.push({ id: b.key, ...v });
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));

  return json({ count: items.length, reservations: items });
};
