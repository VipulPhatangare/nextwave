const fs = require("fs");
const runtime = require("../runtime");
const { toQueueMedia } = require("./media.service");
const { Event, Registration, Announcement } = require("../models");
const { buildVars, render } = require("./template.service");
const { sendEmail } = require("./email.service");
const { enqueue } = require("../whatsapp/sendQueue");

function segmentQuery(eventId, seg = {}) {
  const q = { eventId, status: { $ne: "cancelled" } };
  if (seg.status) q.status = seg.status;
  if (seg.college) q.college = new RegExp(seg.college.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (seg.sourceCode) q.sourceCode = seg.sourceCode.toUpperCase();
  return q;
}

async function countRecipients(segment) {
  const event = await Event.findOne();
  return Registration.countDocuments(segmentQuery(event._id, segment));
}

async function sendAnnouncement(id) {
  const a = await Announcement.findById(id);
  if (!a || a.status === "sent") return;
  const event = await Event.findOne();
  if (event.settings.sendingPaused) return;

  const regs = await Registration.find(segmentQuery(event._id, a.segment));
  a.status = "sending";
  a.stats = { total: regs.length, sent: 0, failed: 0 };
  await a.save();

  const media = a.mediaId ? await toQueueMedia(a.mediaId) : null;
  const attachments = media && fs.existsSync(media.path) ? [{ filename: media.name, path: media.path, contentType: media.mime }] : [];

  for (const reg of regs) {
    const vars = buildVars(event, reg);
    const body = render(a.body, vars);
    let ok = false;
    if (a.channels.includes("whatsapp") && !reg.optedOutWa && reg.waId) {
      try {
        await enqueue({ chatId: reg.waId, body, media, related: "announcement" });
        ok = true;
      } catch (_) {}
    }
    if (a.channels.includes("email") && !reg.optedOutEmail && reg.email) {
      const r = await sendEmail({ to: reg.email, subject: render(a.subject || a.title, vars), text: body || "Please see the attachment.", event, templateKey: "ANNOUNCEMENT", attachments });
      ok = ok || r.ok;
    }
    if (ok) a.stats.sent++;
    else a.stats.failed++;
    if ((a.stats.sent + a.stats.failed) % 5 === 0) {
      await a.save();
      runtime.emit("announcement:progress", { id: String(a._id), stats: a.stats });
    }
  }
  a.status = "sent";
  await a.save();
  runtime.emit("announcement:progress", { id: String(a._id), stats: a.stats, done: true });
}

module.exports = { countRecipients, sendAnnouncement };
