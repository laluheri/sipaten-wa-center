import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Server } from "socket.io";
import { WhatsAppSession } from "./whatsapp.js";

const port = Number(process.env.PORT ?? 3100);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionsDir = path.join(rootDir, ".sessions");
const dataDir = path.join(rootDir, ".data");
await mkdir(sessionsDir, { recursive: true });
await mkdir(dataDir, { recursive: true });

const deviceIdFile = path.join(dataDir, "device-id.txt");
let deviceId: string;
try {
  deviceId = (await readFile(deviceIdFile, "utf8")).trim();
} catch {
  deviceId = randomBytes(16).toString("hex");
  await writeFile(deviceIdFile, deviceId, "utf8");
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const loginSessions = new Set<string>();
const adminEmail = process.env.ADMIN_EMAIL ?? "admin@wacenter.local";
const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";
const sipatenApiKey = process.env.SIPATEN_API_KEY ?? "sipaten-dev-key-change-me";

function cookies(header = "") {
  return Object.fromEntries(header.split(";").map((item) => item.trim().split(/=(.*)/s).slice(0, 2)).filter(([key]) => key));
}

function safeEqual(value: string, expected: string) {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isAuthenticated(cookieHeader?: string) {
  const token = cookies(cookieHeader).wa_session;
  return Boolean(token && loginSessions.has(token));
}

const requireAuth: express.RequestHandler = (req, res, next) => {
  if (!isAuthenticated(req.headers.cookie)) {
    res.status(401).json({ message: "Silakan login terlebih dahulu." });
    return;
  }
  next();
};

const requireApiKey: express.RequestHandler = (req, res, next) => {
  const provided = String(req.headers["x-api-key"] ?? "");
  if (!safeEqual(provided, sipatenApiKey)) {
    res.status(401).json({ message: "API key tidak valid." });
    return;
  }
  next();
};

const session = new WhatsAppSession(deviceId, sessionsDir, (state) => io.to("admins").emit("session:state", state), "default");

app.use(express.json());
app.use(express.static(path.join(rootDir, "public")));

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!safeEqual(email, adminEmail.toLowerCase()) || !safeEqual(password, adminPassword)) {
    res.status(401).json({ message: "Email atau password salah." });
    return;
  }
  const token = randomBytes(32).toString("hex");
  loginSessions.add(token);
  res.setHeader("Set-Cookie", `wa_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
  res.json({ email: adminEmail });
});
app.post("/api/auth/logout", requireAuth, (req, res) => {
  const token = cookies(req.headers.cookie).wa_session;
  if (token) loginSessions.delete(token);
  res.setHeader("Set-Cookie", "wa_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  res.json({ message: "Logout berhasil." });
});
app.get("/api/auth/me", requireAuth, (_req, res) => res.json({ email: adminEmail }));
app.get("/api/integration", requireAuth, (_req, res) => res.json({
  deviceId,
  endpoint: "/api/v1/messages/send",
  apiKeyHeader: "X-API-Key",
}));
app.get("/dashboard", (req, res) => {
  if (!isAuthenticated(req.headers.cookie)) return res.redirect("/");
  res.sendFile(path.join(rootDir, "views", "dashboard.html"));
});

app.get("/api/session", requireAuth, (_req, res) => res.json(session.getState()));
app.post("/api/session/connect", requireAuth, async (_req, res, next) => {
  try {
    await session.connect();
    res.status(202).json(session.getState());
  } catch (error) {
    next(error);
  }
});
app.post("/api/messages", requireAuth, async (req, res) => {
  try {
    const result = await session.sendText(String(req.body?.phone ?? ""), String(req.body?.text ?? ""));
    res.status(201).json({ message: "Pesan berhasil dikirim.", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pesan gagal dikirim.";
    res.status(400).json({ message });
  }
});
app.options("/api/v1/messages/send", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.sendStatus(204);
});
app.post("/api/v1/messages/send", requireApiKey, async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    if (String(req.body?.deviceId ?? "") !== deviceId) {
      res.status(404).json({ success: false, message: "Device ID tidak ditemukan." });
      return;
    }
    const result = await session.sendText(String(req.body?.phone ?? ""), String(req.body?.message ?? ""));
    res.status(201).json({ success: true, message: "Pesan berhasil dikirim.", data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pesan gagal dikirim.";
    res.status(400).json({ success: false, message });
  }
});
app.delete("/api/session", requireAuth, async (_req, res, next) => {
  try {
    await session.disconnect();
    res.json(session.getState());
  } catch (error) {
    next(error);
  }
});

io.on("connection", (socket) => {
  if (!isAuthenticated(socket.handshake.headers.cookie)) return socket.disconnect(true);
  void socket.join("admins");
  socket.emit("session:state", session.getState());
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ message: "Terjadi kesalahan pada server." });
});

httpServer.listen(port, () => {
  console.log(`WA Center berjalan di http://localhost:${port}`);
  void session.connect();
});
