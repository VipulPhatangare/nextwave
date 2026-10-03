const http = require("http");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");

const env = require("./config/env");
const runtime = require("./runtime");
const { verifyToken } = require("./middleware/auth");
const { seed } = require("./seed");
const { initAgenda } = require("./jobs/agenda");
const { initWhatsApp } = require("./whatsapp/client");
const bot = require("./whatsapp/bot");

// A failed WhatsApp call must never take the whole API down.
process.on("unhandledRejection", (e) => console.error("Unhandled rejection:", e && e.message ? e.message : e));

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log("MongoDB connected");
  await seed();
  await require("./services/template.service").refreshStartConfig();

  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());

  app.get("/api/health", (req, res) => res.json({ ok: true, wa: runtime.waStatus }));
  // Short link for posts and group messages: yourdomain/w/CODE -> WhatsApp with the message pre-typed. Counts the click.
  app.get("/w{/:code}", async (req, res) => {
    const { waLink } = require("./services/template.service");
    const { CampaignLink } = require("./models");
    const code = String(req.params.code || "WEB").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20) || "WEB";
    CampaignLink.updateOne({ code }, { $inc: { clicks: 1 } }).catch(() => {});
    res.redirect(302, waLink(code) || env.clientUrl);
  });
  app.use("/api/public", require("./routes/public.routes"));
  app.use("/api/admin", require("./routes/admin.routes"));

  app.use((err, req, res, next) => {
    if (err.status) return res.status(err.status).json({ error: err.message, fields: err.fields });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on our side." });
  });

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: env.clientUrl, credentials: true } });
  io.use((socket, next) => {
    const cookie = socket.handshake.headers.cookie || "";
    const m = cookie.match(/token=([^;]+)/);
    const token = socket.handshake.auth?.token || (m && m[1]);
    const user = token && verifyToken(token);
    if (!user) return next(new Error("unauthorized"));
    next();
  });
  io.on("connection", (socket) => {
    socket.join("admins");
    socket.emit("wa:status", { status: runtime.waStatus, qr: runtime.waQr });
  });
  runtime.io = io;

  await initAgenda();
  server.listen(env.port, () => console.log(`API running on http://localhost:${env.port}`));

  initWhatsApp(bot.handle);
}

main().catch((e) => {
  console.error("Startup failed:", e);
  process.exit(1);
});
