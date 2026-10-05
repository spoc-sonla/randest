let cache = { at: 0, files: null };

async function getFiles(env) {
  const now = Date.now();
  if (cache.files && now - cache.at < 60000) return cache.files;
  const files = await env.FILES.get("files", { type: "json" });
  if (files) cache = { at: now, files: files };
  return files;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers)
  });
}

function validFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return false;
  for (const f of files) {
    if (!f || typeof f.n !== "string" || typeof f.u !== "string") return false;
  }
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/admin/update" && request.method === "POST") {
      if (request.headers.get("Authorization") !== "Bearer " + env.ADMIN_SECRET) {
        return json({ error: "Unauthorized" }, 401, cors);
      }
      let files;
      try {
        files = await request.json();
      } catch (e) {
        return json({ error: "Bad payload" }, 400, cors);
      }
      if (!validFiles(files)) return json({ error: "Bad payload" }, 400, cors);
      await env.FILES.put("files", JSON.stringify(files));
      cache = { at: 0, files: null };
      return json({ ok: true, count: files.length }, 200, cors);
    }

    const files = await getFiles(env);
    if (!files || files.length === 0) return json({ error: "Chưa có dữ liệu" }, 503, cors);

    const action = url.searchParams.get("action");

    if (action === "list") {
      return json(
        { items: files.map(f => ({ name: f.n })) },
        200,
        Object.assign({ "Cache-Control": "public, max-age=60" }, cors)
      );
    }

    if (action === "spin") {
      const f = files[crypto.getRandomValues(new Uint32Array(1))[0] % files.length];
      return json(
        { winnerName: f.n, name: f.n, url: f.u },
        200,
        Object.assign({ "Cache-Control": "no-store" }, cors)
      );
    }

    return json("Ở đây không có gì đâu", 400, cors);
  }
};
