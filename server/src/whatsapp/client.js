const QRCode = require("qrcode");
const { Client, RemoteAuth } = require("whatsapp-web.js");
const { SafeMongoStore, DATA_DIR } = require("./mongoStore");
const env = require("../config/env");
const runtime = require("../runtime");
const { NumberCheck } = require("../models");

const { syncGroups } = require("./groups");

// whatsapp-web.js 1.34.7 copies WhatsApp's internal media model (with private fields such as __x_id, parent, collection)
// straight into every outgoing media message, and current WhatsApp Web rejects that with
// "Data passed to getter must include an id property". Returning only the model's public data (toJSON) fixes sending.
async function patchMediaSending(client) {
  try {
    const result = await client.pupPage.evaluate(() => {
      if (!window.WWebJS || typeof window.WWebJS.processMediaData !== "function") return "no WWebJS";
      if (window.WWebJS.__plainMediaPatch) return "already patched";
      const original = window.WWebJS.processMediaData;
      window.WWebJS.processMediaData = async function (...args) {
        const media = await original.apply(this, args);
        return media && typeof media.toJSON === "function" ? { ...media.toJSON() } : media;
      };
      window.WWebJS.__plainMediaPatch = true;
      return "patched";
    });
    console.log(`WhatsApp: media sending fix ${result}`);
  } catch (e) {
    console.error("WhatsApp: could not apply the media sending fix:", e.message);
  }
}

let botStartedAt = 0;
let groupSyncTimer = null;
const startedAt = () => botStartedAt;

function setStatus(status, extra = {}) {
  runtime.waStatus = status;
  runtime.emit("wa:status", { status, ...extra });
}

async function initWhatsApp(onMessage) {
  if (!env.wa.enabled) {
    console.log("WhatsApp disabled (WA_ENABLED=false)");
    return;
  }
  const store = new SafeMongoStore();
  const client = new Client({
    authStrategy: new RemoteAuth({ clientId: env.wa.clientId, store, dataPath: DATA_DIR, backupSyncIntervalMs: 300000 }),
    puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  });
  runtime.waClient = client;

  client.on("qr", async (qr) => {
    runtime.waQr = await QRCode.toDataURL(qr);
    setStatus("qr", { qr: runtime.waQr });
    console.log("WhatsApp: scan the QR in Admin > Settings");
  });
  client.on("ready", () => {
    botStartedAt = Math.floor(Date.now() / 1000);
    runtime.waQr = null;
    setStatus("connected");
    console.log("WhatsApp: connected");
    patchMediaSending(client);

    // Keep the Groups list fresh so new groups show up without pressing Sync.
    const sync = () => syncGroups().catch((e) => console.error("auto group sync failed:", e.message));
    clearInterval(groupSyncTimer);
    setTimeout(sync, 25000);
    groupSyncTimer = setInterval(sync, 10 * 60 * 1000);
  });
  client.on("authenticated", () => console.log("WhatsApp: authenticated"));
  client.on("remote_session_saved", () => console.log("WhatsApp: session saved to MongoDB (no QR scan needed after restarts)"));
  client.on("auth_failure", (m) => {
    console.error("WhatsApp auth failure:", m);
    setStatus("disconnected");
  });
  client.on("disconnected", (reason) => {
    console.warn("WhatsApp disconnected:", reason);
    setStatus("disconnected");
    setTimeout(() => client.initialize().catch(() => {}), 10000);
  });
  client.on("message", (msg) => onMessage(msg).catch((e) => console.error("bot error:", e.message)));
  client.on("message_create", (msg) => {
    runtime.emit("wa:message", { chatId: msg.fromMe ? msg.to : msg.from, fromMe: msg.fromMe, body: msg.body, at: msg.timestamp });
  });

  client.initialize().catch((e) => console.error("WhatsApp init failed:", e.message));
}

// Is this number on WhatsApp? Returns true/false, or null if unknown (bot offline).
async function checkNumber(digits) {
  const cached = await NumberCheck.findOne({ phone: digits });
  if (cached) return cached.onWhatsApp;
  if (!runtime.waClient || runtime.waStatus !== "connected") return null;
  try {
    const id = await runtime.waClient.getNumberId(digits);
    const on = !!id;
    await NumberCheck.updateOne({ phone: digits }, { onWhatsApp: on, checkedAt: new Date() }, { upsert: true });
    return on;
  } catch (e) {
    return null;
  }
}

async function logoutWhatsApp() {
  if (runtime.waClient) {
    await runtime.waClient.logout().catch(() => {});
    setStatus("disconnected");
    runtime.waClient.initialize().catch(() => {});
  }
}

module.exports = { initWhatsApp, checkNumber, logoutWhatsApp, startedAt };
