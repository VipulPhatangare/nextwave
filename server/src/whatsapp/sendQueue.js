const fs = require("fs");
const env = require("../config/env");
const runtime = require("../runtime");
const { MessageLog, Event } = require("../models");
const { sleep, randomBetween } = require("../utils/codes");

const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const queue = [];
let running = false;
let sentToday = 0;
let dayKey = new Date().toDateString();

function resetDayIfNeeded() {
  const k = new Date().toDateString();
  if (k !== dayKey) {
    dayKey = k;
    sentToday = 0;
  }
}

function emitQueue() {
  runtime.emit("wa:queue", { length: queue.length, sentToday });
}

// Add a message to the rate-limited queue. Resolves when sent (or rejects on failure).
// media (optional): { path, mime, name } for an image or PDF. mediaPath is the older path-only form.
function enqueue({ chatId, body, related, mediaPath, media, priority }) {
  return new Promise((resolve, reject) => {
    const job = { chatId, body, related, mediaPath, media, resolve, reject, attempts: 0, queuedAt: Date.now() };
    if (priority) queue.unshift(job);
    else queue.push(job);
    emitQueue();
    process();
  });
}

async function process() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      resetDayIfNeeded();
      const event = await Event.findOne();
      if (event?.settings?.sendingPaused) {
        await sleep(3000);
        continue;
      }
      const limit = event?.settings?.waDailyLimit ?? 800;
      if (sentToday >= limit) {
        await sleep(30000);
        continue;
      }
      const client = runtime.waClient;
      if (!client || runtime.waStatus !== "connected") {
        await sleep(3000);
        continue;
      }
      const job = queue.shift();
      emitQueue();
      if (Date.now() - job.queuedAt > MAX_AGE_MS) {
        await MessageLog.create({ waId: job.chatId, direction: "out", body: job.body, status: "failed", error: "Expired while WhatsApp was offline", related: job.related });
        job.reject(new Error("expired"));
        continue;
      }
      const logBody = job.media ? `${job.body || ""} [attachment: ${job.media.name}]`.trim() : job.body;
      try {
        if (job.media) {
          if (!fs.existsSync(job.media.path)) {
            job.attempts = 99; // a missing file won't fix itself, don't retry
            throw new Error("The attached file is no longer on the server.");
          }
          const { MessageMedia } = require("whatsapp-web.js");
          const m = new MessageMedia(job.media.mime, fs.readFileSync(job.media.path).toString("base64"), job.media.name);
          await client.sendMessage(job.chatId, m, { caption: job.body || undefined, sendMediaAsDocument: job.media.mime === "application/pdf" });
        } else if (job.mediaPath) {
          const { MessageMedia } = require("whatsapp-web.js");
          const media = MessageMedia.fromFilePath(job.mediaPath);
          await client.sendMessage(job.chatId, media, { caption: job.body });
        } else {
          await client.sendMessage(job.chatId, job.body);
        }
        sentToday++;
        await MessageLog.create({ waId: job.chatId, direction: "out", body: logBody, status: "sent", related: job.related });
        job.resolve(true);
      } catch (e) {
        job.attempts++;
        if (job.attempts < 2) {
          queue.push(job);
        } else {
          await MessageLog.create({ waId: job.chatId, direction: "out", body: logBody, status: "failed", error: e.message, related: job.related });
          job.reject(e);
        }
      }
      emitQueue();
      await sleep(randomBetween(env.wa.minDelay, env.wa.maxDelay));
    }
  } finally {
    running = false;
  }
}

module.exports = { enqueue, queueLength: () => queue.length, sentToday: () => sentToday };
