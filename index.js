const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
const uid = () => crypto.randomUUID();
const hex = (buf) => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
const hash = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const cookieToken = (request) => {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(/(?:^|;\s*)med_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};
const sessionCookie = (token) => `med_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
const clearCookie = "med_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
const safeName = (s) => (s || "document").replace(/[\\/\0]/g, "_").slice(0, 180);
const parseQuestions = (text) => text.split(/\n+/).map(x => x.trim())
  .filter(x => x.length > 20 && (/\?/.test(x) || /^\s*(\d+[.)]|[A-ZĂÂÎȘȚ][.)])/.test(x))).slice(0, 100);

async function auth(request, env) {
  const token = cookieToken(request);
  if (!token) return null;
  return await env.DB.prepare("SELECT id FROM users WHERE token_hash = ?").bind(await hash(token)).first();
}
async function bodyJSON(request) {
  try { return await request.json(); } catch { return {}; }
}
async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/session/create" && request.method === "POST") {
    const userId = uid(), token = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2,"0")).join("");
    await env.DB.prepare("INSERT INTO users(id, token_hash, created_at) VALUES(?,?,?)")
      .bind(userId, await hash(token), new Date().toISOString()).run();
    return json({ userId, personalLink: `${url.origin}/acces/${token}` }, 200, { "Set-Cookie": sessionCookie(token) });
  }

  if (path.startsWith("/acces/") && request.method === "GET") {
    const token = decodeURIComponent(path.slice("/acces/".length));
    const user = await env.DB.prepare("SELECT id FROM users WHERE token_hash = ?").bind(await hash(token)).first();
    if (!user) return new Response("Link invalid sau revocat.", { status: 404 });
    return new Response(null, { status: 302, headers: { "Location": url.origin + "/", "Set-Cookie": sessionCookie(token) } });
  }

  if (path === "/api/session/logout" && request.method === "POST")
    return json({ ok: true }, 200, { "Set-Cookie": clearCookie });

  const user = await auth(request, env);
  if (!user) return json({ error: "Sesiunea nu este activă. Deschideți linkul personal." }, 401);
  const userId = user.id;

  if (path === "/api/session" && request.method === "GET") return json({ userId });

  if (path === "/api/session/rotate" && request.method === "POST") {
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2,"0")).join("");
    await env.DB.prepare("UPDATE users SET token_hash = ? WHERE id = ?").bind(await hash(token), userId).run();
    return json({ personalLink: `${url.origin}/acces/${token}` }, 200, { "Set-Cookie": sessionCookie(token) });
  }

  if (path === "/api/files" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id,name,original_name,mime,size,discipline,folder,status,questions_count,created_at FROM files WHERE user_id=? ORDER BY created_at DESC").bind(userId).all();
    return json(results);
  }

  if (path === "/api/files" && request.method === "POST") {
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Selectați un fișier." }, 400);
    if (file.size > 25 * 1024 * 1024) return json({ error: "Fișierul depășește limita de 25 MB." }, 413);
    const fileId = uid(), original = safeName(file.name), ext = original.includes(".") ? original.split(".").pop().toLowerCase() : "";
    const objectKey = `${userId}/${fileId}.${ext || "bin"}`;
    await env.FILES.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    let extracted = "";
    if (ext === "txt" || (file.type || "").startsWith("text/")) extracted = await file.text();
    const qs = parseQuestions(extracted);
    const discipline = String(form.get("discipline") || "Nespecificată").slice(0,100);
    const folder = String(form.get("folder") || "Fără dosar").slice(0,120);
    const created = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO files(id,user_id,name,original_name,mime,size,discipline,folder,status,object_key,extracted,questions_count,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(fileId,userId,original,original,file.type || "application/octet-stream",file.size,discipline,folder,
      extracted ? "Procesat" : "Arhivat — extragere manuală",objectKey,extracted,qs.length,created).run();
    for (const q of qs) {
      await env.DB.prepare("INSERT INTO questions(id,user_id,file_id,discipline,question,answer,short_answer,created_at) VALUES(?,?,?,?,?,?,?,?)")
        .bind(uid(),userId,fileId,discipline,q,"","",created).run();
    }
    return json({ id:fileId, name:original, questions:qs.length, status:extracted ? "Procesat" : "Arhivat — extragere manuală" });
  }

  const fileMatch = path.match(/^\/api\/files\/([^/]+)$/);
  if (fileMatch && request.method === "PATCH") {
    const b = await bodyJSON(request);
    const f = await env.DB.prepare("SELECT id FROM files WHERE id=? AND user_id=?").bind(fileMatch[1],userId).first();
    if (!f) return new Response(null,{status:404});
    await env.DB.prepare("UPDATE files SET name=COALESCE(?,name),discipline=COALESCE(?,discipline),folder=COALESCE(?,folder) WHERE id=? AND user_id=?")
      .bind(b.name ?? null,b.discipline ?? null,b.folder ?? null,fileMatch[1],userId).run();
    return json({ok:true});
  }
  if (fileMatch && request.method === "DELETE") {
    const f = await env.DB.prepare("SELECT id,object_key FROM files WHERE id=? AND user_id=?").bind(fileMatch[1],userId).first();
    if (!f) return new Response(null,{status:404});
    if (f.object_key) await env.FILES.delete(f.object_key);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM questions WHERE file_id=? AND user_id=?").bind(f.id,userId),
      env.DB.prepare("DELETE FROM files WHERE id=? AND user_id=?").bind(f.id,userId)
    ]);
    return json({ok:true});
  }

  if (path === "/api/questions" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT q.*,f.name AS source FROM questions q LEFT JOIN files f ON f.id=q.file_id WHERE q.user_id=? ORDER BY q.created_at DESC").bind(userId).all();
    return json(results);
  }
  const questionMatch = path.match(/^\/api\/questions\/([^/]+)$/);
  if (questionMatch && request.method === "PATCH") {
    const b = await bodyJSON(request);
    const q = await env.DB.prepare("SELECT id FROM questions WHERE id=? AND user_id=?").bind(questionMatch[1],userId).first();
    if (!q) return new Response(null,{status:404});
    await env.DB.prepare("UPDATE questions SET question=COALESCE(?,question),answer=COALESCE(?,answer),short_answer=COALESCE(?,short_answer) WHERE id=? AND user_id=?")
      .bind(b.question ?? null,b.answer ?? null,b.short_answer ?? null,questionMatch[1],userId).run();
    return json({ok:true});
  }

  if (path === "/api/ai/answer" && request.method === "POST") {
    const b = await bodyJSON(request), question = String(b.question || ""), mode = b.mode || "corect";
    if (!question) return json({error:"Introduceți o întrebare."},400);
    if (!env.OPENAI_API_KEY) return json({error:"Funcția AI nu este configurată. Administratorul trebuie să adauge OPENAI_API_KEY în Cloudflare."},503);
    const prompt = `Ești profesor universitar de medicină. Răspunde exclusiv în limba română, cu terminologie medicală corectă. Dacă informațiile sunt insuficiente, spune clar și nu inventa. Structurează după relevanță: definiție, etiologie, patogenie, manifestări clinice, diagnostic, tratament și aspecte relevante. Adaugă cuvinte-cheie și o versiune scurtă. Întrebarea: ${question}\nMod: ${mode}. Pentru detecteaza, creează 1-3 afirmații greșite ca SIMULARE DIDACTICĂ și păstrează separat răspunsul etalon. Returnează JSON: answer, shortAnswer, referenceAnswer, errors (array de wrong, correct, why). Pentru corect, errors=[].`;
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method:"POST", headers:{"Authorization":`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
        body:JSON.stringify({model:env.OPENAI_MODEL || "gpt-4o-mini",response_format:{type:"json_object"},
          messages:[{role:"system",content:"Răspunsuri educaționale, nu recomandări pentru pacienți."},{role:"user",content:prompt}]})
      });
      if (!response.ok) return json({error:"Serviciul AI nu a putut genera răspunsul. Verificați cheia și limita API."},502);
      const data = await response.json();
      return json(JSON.parse(data.choices?.[0]?.message?.content || "{}"));
    } catch { return json({error:"Eroare la generarea răspunsului AI."},502); }
  }

  if (path === "/api/cards" && request.method === "POST") {
    const b = await bodyJSON(request);
    const q = await env.DB.prepare("SELECT id FROM questions WHERE id=? AND user_id=?").bind(b.questionId,userId).first();
    if (!q) return new Response(null,{status:404});
    await env.DB.prepare("INSERT INTO cards(id,user_id,question_id,status,updated_at) VALUES(?,?,?,?,?)")
      .bind(uid(),userId,b.questionId,String(b.status || "repet"),new Date().toISOString()).run();
    return json({ok:true});
  }
  if (path === "/api/attempts" && request.method === "POST") {
    const b = await bodyJSON(request);
    await env.DB.prepare("INSERT INTO attempts(id,user_id,discipline,correct,total,created_at,details) VALUES(?,?,?,?,?,?,?)")
      .bind(uid(),userId,String(b.discipline || "General"),Number(b.correct || 0),Number(b.total || 0),new Date().toISOString(),JSON.stringify(b.details || [])).run();
    return json({ok:true});
  }
  if (path === "/api/progress" && request.method === "GET") {
    const stats = await env.DB.prepare("SELECT COUNT(*) AS total FROM questions WHERE user_id=?").bind(userId).first();
    const cards = await env.DB.prepare("SELECT status,COUNT(*) AS n FROM cards WHERE user_id=? GROUP BY status").bind(userId).all();
    const attempts = await env.DB.prepare("SELECT * FROM attempts WHERE user_id=? ORDER BY created_at DESC LIMIT 20").bind(userId).all();
    return json({questions:stats.total,cards:cards.results,attempts:attempts.results});
  }
  return json({error:"Rută API inexistentă."},404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/acces/")) {
      try { return await api(request, env); }
      catch (e) { return json({error:"Eroare internă. Verificați configurarea bazei de date și a stocării."},500); }
    }
    return env.ASSETS.fetch(request);
  }
};
