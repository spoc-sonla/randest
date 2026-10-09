let cache = { at: 0, lines: null };
let namesCache = { at: 0, text: null };

async function getLines(env) {
  const now = Date.now();
  if (cache.lines && now - cache.at < 60000) return cache.lines;
  const text = await env.FILES.get("files_txt");
  if (!text) return null;
  cache = { at: now, lines: text.split("\n") };
  return cache.lines;
}

async function getNames(env) {
  const now = Date.now();
  if (namesCache.text && now - namesCache.at < 60000) return namesCache.text;
  const text = await env.FILES.get("names_json");
  if (text) namesCache = { at: now, text: text };
  return text;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers)
  });
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
      const key = url.searchParams.get("key");
      const kvKey = key === "files" ? "files_txt" : key === "names" ? "names_json" : null;
      if (!kvKey) return json({ error: "Bad key" }, 400, cors);
      const body = await request.text();
      if (!body || body.length < 2) return json({ error: "Empty body" }, 400, cors);
      if (kvKey === "names_json" && body.charAt(0) !== "{") return json({ error: "Bad payload" }, 400, cors);
      await env.FILES.put(kvKey, body);
      cache = { at: 0, lines: null };
      namesCache = { at: 0, text: null };
      return json({ ok: true, key: key, bytes: body.length }, 200, cors);
    }

    const action = url.searchParams.get("action");

    if (action === "list") {
      const text = await getNames(env);
      if (!text) return json({ error: "Chưa có dữ liệu" }, 503, cors);
      return new Response(text, {
        status: 200,
        headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" }, cors)
      });
    }

    if (action === "spin") {
      const lines = await getLines(env);
      if (!lines || lines.length === 0) return json({ error: "Chưa có dữ liệu" }, 503, cors);
      for (let tries = 0; tries < 5; tries++) {
        const line = lines[crypto.getRandomValues(new Uint32Array(1))[0] % lines.length];
        const tab = line.indexOf("\t");
        if (tab > 0) {
          const name = line.slice(0, tab);
          return json(
            { winnerName: name, name: name, url: line.slice(tab + 1) },
            200,
            Object.assign({ "Cache-Control": "no-store" }, cors)
          );
        }
      }
      return json({ error: "Dữ liệu lỗi" }, 500, cors);
    }

    return json("Ở đây không có gì đâu", 400, cors);
  }
};
