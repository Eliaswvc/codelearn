import "dotenv/config";
import express from "express";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

const { DATABASE_URL, JWT_SECRET, GROQ_API_KEY, PORT = 3000 } = process.env;
if (!DATABASE_URL || !JWT_SECRET) {
  console.error("Falta DATABASE_URL o JWT_SECRET en el archivo .env");
  process.exit(1);
}
const sql = neon(DATABASE_URL);
const app = express();
const dir = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "200kb" }));
app.use((q, r, n) => {
  r.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  });
  q.method === "OPTIONS" ? r.sendStatus(204) : n();
});

// Solo se sirve la página (no el .env ni el server.js)
app.get("/", (q, r) => r.sendFile(path.join(dir, "codelearn.html")));

const token = (uid) => jwt.sign({ uid }, JWT_SECRET, { expiresIn: "30d" });
const auth = (q, r, n) => {
  try {
    q.uid = jwt.verify((q.get("Authorization") || "").replace("Bearer ", ""), JWT_SECRET).uid;
    n();
  } catch {
    r.status(401).json({ error: "Sesión inválida" });
  }
};

app.post("/api/register", async (q, r) => {
  const { name, email, password } = q.body || {};
  if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || "") || (password || "").length < 8)
    return r.status(400).json({ error: "Datos inválidos (contraseña de mínimo 8 caracteres)" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [u] = await sql`
      INSERT INTO users (name, email, password_hash)
      VALUES (${name.trim()}, ${email.trim().toLowerCase()}, ${hash})
      RETURNING id, name, email`;
    await sql`INSERT INTO progress (user_id) VALUES (${u.id})`;
    r.json({ token: token(u.id), user: u, progress: {} });
  } catch (e) {
    const dup = e.code === "23505";
    r.status(dup ? 409 : 500).json({ error: dup ? "Ese correo ya está registrado" : "Error del servidor" });
  }
});

app.post("/api/login", async (q, r) => {
  const { email, password } = q.body || {};
  const [u] = await sql`
    SELECT u.id, u.name, u.email, u.password_hash, p.data
    FROM users u LEFT JOIN progress p ON p.user_id = u.id
    WHERE u.email = ${(email || "").trim().toLowerCase()}`;
  if (!u || !(await bcrypt.compare(password || "", u.password_hash)))
    return r.status(401).json({ error: "Correo o contraseña incorrectos" });
  await sql`UPDATE users SET last_login = now() WHERE id = ${u.id}`;
  r.json({ token: token(u.id), user: { id: u.id, name: u.name, email: u.email }, progress: u.data || {} });
});

app.get("/api/me", auth, async (q, r) => {
  const [u] = await sql`
    SELECT u.id, u.name, u.email, p.data
    FROM users u LEFT JOIN progress p ON p.user_id = u.id
    WHERE u.id = ${q.uid}`;
  if (!u) return r.status(401).json({ error: "Sesión inválida" });
  r.json({ token: token(u.id), user: { id: u.id, name: u.name, email: u.email }, progress: u.data || {} });
});

app.put("/api/progress", auth, async (q, r) => {
  await sql`
    INSERT INTO progress (user_id, data, updated_at)
    VALUES (${q.uid}, ${JSON.stringify(q.body || {})}::jsonb, now())
    ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
  r.json({ ok: true });
});

app.post("/api/chat", auth, async (q, r) => {
  if (!GROQ_API_KEY) return r.status(500).json({ error: "Falta GROQ_API_KEY en el servidor" });
  const { model, messages } = q.body || {};
  if (!Array.isArray(messages)) return r.status(400).json({ error: "Datos inválidos" });
  try {
    const g = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + GROQ_API_KEY },
      body: JSON.stringify({ model: model || "openai/gpt-oss-120b", temperature: 0.4, messages }),
    });
    const j = await g.json();
    r.status(g.status).json(j.error ? { error: j.error.message } : j);
  } catch {
    r.status(502).json({ error: "No se pudo contactar a la IA" });
  }
});

app.listen(PORT, () => console.log(`CodeLearn en http://localhost:${PORT}`));
