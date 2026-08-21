// ─────────────────────────────────────────────────────────────
//  Anas Films — backend (Cloudflare Worker + D1 database)
//  Routes:
//    GET    /api/videos           public — video list for the site
//    POST   /api/videos/:id/view  public — count a view
//    POST   /api/login            { password } → session cookie
//    POST   /api/logout
//    GET    /api/me
//    POST   /api/upload           auth — signed Cloudinary upload
//    POST   /api/videos           auth — { title, client, tag, url }
//    PUT    /api/videos/:id       auth — edit title/client/tag
//    DELETE /api/videos/:id       auth — remove from site
//    POST   /api/reorder          auth — { ids: [...] } display order
//  Everything else → static assets (the site).
// ─────────────────────────────────────────────────────────────

const COOKIE = "pf_session";
const WEEK = 7 * 24 * 3600 * 1000;

let schemaReady = false;

// ---------- tiny helpers ----------
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function getCookie(request, name) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function makeToken(secret) {
  const expiry = String(Date.now() + WEEK);
  return `${expiry}.${await hmac(expiry, secret)}`;
}

async function isAuthed(request, env) {
  const token = getCookie(request, COOKIE);
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const expiry = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (Number(expiry) < Date.now()) return false;
  return (await hmac(expiry, env.SESSION_SECRET)) === sig;
}

async function sha1hex(text) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- database ----------
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      client TEXT DEFAULT '',
      tag TEXT DEFAULT '',
      url TEXT NOT NULL,
      position INTEGER NOT NULL,
      views INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`
  ).run();

  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM videos").first();
  if (row.n === 0) {
    const seeds = [
      ["The Ring", "", "Jewelry", "https://res.cloudinary.com/kx9kxkue/video/upload/v1786874806/c96xite1h9mniuzi9f22.mp4"],
      ["Precious Stone", "", "Jewelry", "https://res.cloudinary.com/kx9kxkue/video/upload/v1786874809/vkbpsvocky6o9wzlvyku.mp4"],
      ["Kinda Chic Ad", "", "Vintage Bag", "https://res.cloudinary.com/kx9kxkue/video/upload/v1786874811/amex3pymi01zhiwmicwt.mp4"],
      ["Nº 03", "", "Vintage Bag", "https://res.cloudinary.com/kx9kxkue/video/upload/v1786874814/r9nsm0xcbxp2eu7aper2.mp4"],
      ["Nº 02", "", "Vintage Bag", "https://res.cloudinary.com/kx9kxkue/video/upload/v1786874821/vzfwmlx3ywgz4vstvupv.mp4"],
      ["Nº 01", "", "Vintage Bag", "https://res.cloudinary.com/kx9kxkue/video/upload/v1786874826/bnnaorh8qcqj8bgrvvj2.mp4"],
      ["Nº 04", "", "Vintage Bag", "https://res.cloudinary.com/kx9kxkue/video/upload/v1786874830/n04wefss8ir4ptppg1pa.mp4"],
    ];
    for (let i = 0; i < seeds.length; i++) {
      const [title, client, tag, url] = seeds[i];
      await env.DB.prepare(
        "INSERT INTO videos (id, title, client, tag, url, position, views) VALUES (?, ?, ?, ?, ?, ?, 0)"
      ).bind(crypto.randomUUID().slice(0, 8), title, client, tag, url, i + 1).run();
    }
  }
  schemaReady = true;
}

// ---------- main router ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // force HTTPS
    if (url.protocol === "http:") {
      return Response.redirect(`https://${url.host}${url.pathname}${url.search}`, 301);
    }

    const path = url.pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);

    await ensureSchema(env);
    const method = request.method;
    const authed = await isAuthed(request, env);

    // --- public ---
    if (path === "/api/videos" && method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, title, client, tag, url, views, created_at FROM videos ORDER BY position ASC"
      ).all();
      return json(results);
    }

    const viewMatch = path.match(/^\/api\/videos\/([\w-]+)\/view$/);
    if (viewMatch && method === "POST") {
      await env.DB.prepare("UPDATE videos SET views = views + 1 WHERE id = ?").bind(viewMatch[1]).run();
      return json({ ok: true });
    }

    // --- auth ---
    if (path === "/api/login" && method === "POST") {
      const { password } = await request.json().catch(() => ({}));
      if (password !== env.ADMIN_PASSWORD) return json({ error: "Wrong password" }, 401);
      const token = await makeToken(env.SESSION_SECRET);
      return json({ ok: true }, 200, {
        "Set-Cookie": `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${WEEK / 1000}`,
      });
    }
    if (path === "/api/logout" && method === "POST") {
      return json({ ok: true }, 200, {
        "Set-Cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
      });
    }
    if (path === "/api/me" && method === "GET") return json({ isAdmin: authed });

    // --- everything below requires auth ---
    if (!authed) return json({ error: "Not logged in" }, 401);

    if (path === "/api/upload" && method === "POST") {
      const form = await request.formData();
      const file = form.get("video");
      if (!file) return json({ error: "No video file" }, 400);

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await sha1hex(`timestamp=${timestamp}${env.CLOUD_API_SECRET}`);
      const upstream = new FormData();
      upstream.append("file", file);
      upstream.append("api_key", env.CLOUD_API_KEY);
      upstream.append("timestamp", String(timestamp));
      upstream.append("signature", signature);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUD_NAME}/video/upload`, {
        method: "POST",
        body: upstream,
      });
      const data = await res.json();
      if (!res.ok) return json({ error: data.error?.message || "Cloudinary upload failed" }, 502);
      return json({ url: data.secure_url });
    }

    if (path === "/api/videos" && method === "POST") {
      const { title, client = "", tag = "", url: videoUrl } = await request.json().catch(() => ({}));
      if (!videoUrl) return json({ error: "Missing video url" }, 400);
      const id = crypto.randomUUID().slice(0, 8);
      await env.DB.prepare(
        `INSERT INTO videos (id, title, client, tag, url, position, views)
         VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MIN(position), 1) - 1 FROM videos), 0)`
      ).bind(id, (title || "").trim() || "Untitled", client.trim(), tag.trim(), videoUrl).run();
      return json({ id }, 201);
    }

    const videoMatch = path.match(/^\/api\/videos\/([\w-]+)$/);
    if (videoMatch && method === "PUT") {
      const { title, client, tag } = await request.json().catch(() => ({}));
      await env.DB.prepare(
        `UPDATE videos SET
           title = COALESCE(?, title),
           client = COALESCE(?, client),
           tag = COALESCE(?, tag)
         WHERE id = ?`
      ).bind(
        title !== undefined ? String(title).trim() || "Untitled" : null,
        client !== undefined ? String(client).trim() : null,
        tag !== undefined ? String(tag).trim() : null,
        videoMatch[1]
      ).run();
      return json({ ok: true });
    }
    if (videoMatch && method === "DELETE") {
      // removes the video from the site; the file stays in the Cloudinary library
      await env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(videoMatch[1]).run();
      return json({ ok: true });
    }

    if (path === "/api/reorder" && method === "POST") {
      const { ids } = await request.json().catch(() => ({}));
      if (!Array.isArray(ids)) return json({ error: "ids array required" }, 400);
      for (let i = 0; i < ids.length; i++) {
        await env.DB.prepare("UPDATE videos SET position = ? WHERE id = ?").bind(i + 1, ids[i]).run();
      }
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  },
};
