const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const runtime = require("../runtime");
const { Event, Registration, ProjectSubmission, Template } = require("../models");
const ai = require("./ai.service");
const { projectPageText } = require("../utils/safeFetch");
const { UPLOAD_DIR } = require("./media.service");
const { buildVars, render } = require("./template.service");
const { enqueue } = require("../whatsapp/sendQueue");

// After the workshop: students send a project link or screenshot on WhatsApp, the AI scores it against a rubric,
// they get feedback right away, and approved projects get "Project verified" on the certificate.

const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const send = (waId, body) => enqueue({ chatId: waId, body, related: "PROJECT" }).catch(() => {});
const firstLink = (text) => (String(text || "").match(/https?:\/\/[^\s<>"']+/i) || [])[0]?.replace(/[).,!]+$/, "");
const hasLink = (text) => !!firstLink(text);

function saveImage(image) {
  const ext = IMAGE_TYPES[image.mime];
  if (!ext) return null;
  const buf = Buffer.from(image.base64, "base64");
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `project-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return name;
}

// A registered student sent a project. image (optional) = { mime, base64 }. Replies on WhatsApp.
async function submit(reg, { text, image }) {
  const link = firstLink(text);
  const note = String(text || "").replace(link || "", "").trim().slice(0, 600);
  if (!link && !image) {
    return send(reg.waId, "Please send a *link* to your project (GitHub, Colab, Hugging Face, a demo) or a *screenshot* of it working. You can add one line about it in the same message.");
  }
  if (image && !IMAGE_TYPES[image.mime]) return send(reg.waId, "Please send the screenshot as a photo (JPG or PNG).");
  const imageFile = image ? saveImage(image) : null;
  if (image && !imageFile) return send(reg.waId, "That screenshot is too big. Please send one under 5 MB.");

  const sub = await ProjectSubmission.create({
    regId: reg._id, waId: reg.waId, name: reg.name, college: reg.college,
    link, note, imageFile, imageMime: imageFile ? image.mime : undefined,
  });
  runtime.emit("project:new", { id: sub._id, name: reg.name });
  await send(reg.waId, "📥 Got your project! Our AI reviewer is looking at it now. You'll get feedback here in a minute.");
  evaluate(sub._id, { image }).catch((e) => console.error("project evaluation failed", e.message));
  return sub;
}

// Score a submission and tell the student. Also used by "Re-check" in the dashboard.
async function evaluate(id, { image, notify = true } = {}) {
  const sub = await ProjectSubmission.findById(id);
  if (!sub) return null;
  const reg = await Registration.findById(sub.regId);
  const event = await Event.findOne();
  if (!image && sub.imageFile) {
    const file = path.join(UPLOAD_DIR, sub.imageFile);
    if (fs.existsSync(file)) image = { mime: sub.imageMime, base64: fs.readFileSync(file).toString("base64") };
  }
  const pageText = sub.link ? await projectPageText(sub.link) : "";
  const r = await ai.evaluateProject({ phone: reg?.phone || sub.waId, link: sub.link, note: sub.note, pageText, image });

  if (!r.ok) {
    // AI off, over the student's daily limit, or failing: a person reviews it instead
    sub.status = "evaluated";
    sub.error = r.reason === "user_cap" ? "Daily AI review limit reached for this student" : r.error || r.reason;
    await sub.save();
    if (notify && reg?.waId) await send(reg.waId, "✅ Thanks! Your project is saved and our team will review it soon.");
    runtime.emit("project:update", { id: sub._id });
    return sub;
  }

  sub.ai = r.result;
  sub.error = undefined;
  const threshold = event?.settings?.projectAutoApprove ?? 6;
  if (!r.result.isProject) sub.status = "rejected";
  else if (threshold > 0 && r.result.score >= threshold) sub.status = "approved";
  else sub.status = "evaluated";
  if (sub.status !== "evaluated") { sub.reviewedBy = "AI"; sub.reviewedAt = new Date(); }
  await sub.save();
  if (reg) await applyToRegistration(reg, sub);
  runtime.emit("project:update", { id: sub._id });

  if (notify && reg?.waId) await send(reg.waId, resultMessage(sub));
  return sub;
}

function resultMessage(sub) {
  const a = sub.ai || {};
  if (sub.status === "rejected" && a.isProject === false) {
    return `🤔 That doesn't look like a project yet.\n${a.feedback || ""}\n\nSend a GitHub, Colab or demo link, or a screenshot of your project working.`.trim();
  }
  const lines = [`⭐ *Project score: ${a.score}/10*`, a.summary ? `_${a.summary}_` : "", "", a.feedback ? `💡 ${a.feedback}` : ""];
  if (sub.status === "approved") lines.push("", "✅ *Project verified!* It will be on your certificate 🎓");
  else lines.push("", "Our team will take a quick look. You can also improve it and send it again.");
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n").trim();
}

// The registration remembers the latest decision; the certificate reads it.
async function applyToRegistration(reg, sub) {
  const project = { submissionId: sub._id, score: sub.ai?.score, status: sub.status, verifiedAt: sub.status === "approved" ? new Date() : undefined };
  // don't let a weaker later attempt undo an approved project
  if (reg.project?.status === "approved" && sub.status !== "approved" && String(reg.project.submissionId) !== String(sub._id)) return;
  await Registration.updateOne({ _id: reg._id }, { project });
}

// Dashboard: approve or reject by hand.
async function decide(id, status, adminEmail, { tell = true } = {}) {
  if (!["approved", "rejected", "evaluated"].includes(status)) throw Object.assign(new Error("Unknown status."), { status: 400 });
  const sub = await ProjectSubmission.findByIdAndUpdate(id, { status, reviewedBy: adminEmail, reviewedAt: new Date() }, { new: true });
  if (!sub) return null;
  const reg = await Registration.findById(sub.regId);
  if (reg) {
    // a reviewer's decision always wins
    await Registration.updateOne({ _id: reg._id }, { project: { submissionId: sub._id, score: sub.ai?.score, status, verifiedAt: status === "approved" ? new Date() : undefined } });
    if (tell && status === "approved" && reg.waId && !reg.optedOutWa) await send(reg.waId, "✅ *Your project is verified!* It will be on your certificate 🎓");
  }
  return sub;
}

// Ask attendees for their projects (opens submissions).
async function askForProjects() {
  const event = await Event.findOne();
  event.settings.projectsOpen = true;
  await event.save();
  const tpl = await Template.findOne({ key: "PROJECT_INVITE", channel: "whatsapp" });
  const regs = await Registration.find({ eventId: event._id, status: "attended", optedOutWa: { $ne: true }, waId: { $exists: true, $ne: null } });
  const intents = require("../whatsapp/intents");
  for (const reg of regs) {
    enqueue({ chatId: reg.waId, body: render(tpl?.body || "Send us your project: a link or a screenshot.", buildVars(event, reg)), related: "PROJECT_INVITE" }).catch(() => {});
    await intents.setMenu(intents.keyFor(reg, reg.waId), "project");
  }
  return regs.length;
}

async function list({ status } = {}) {
  const q = status ? { status } : {};
  const items = await ProjectSubmission.find(q).sort({ createdAt: -1 }).limit(300).lean();
  const all = await ProjectSubmission.aggregate([{ $group: { _id: "$status", n: { $sum: 1 }, avg: { $avg: "$ai.score" } } }]);
  const counts = Object.fromEntries(all.map((a) => [a._id, a.n]));
  const scored = await ProjectSubmission.aggregate([{ $match: { "ai.score": { $exists: true } } }, { $group: { _id: null, avg: { $avg: "$ai.score" } } }]);
  const event = await Event.findOne();
  return {
    open: !!event.settings.projectsOpen,
    autoApprove: event.settings.projectAutoApprove ?? 6,
    counts,
    avgScore: scored[0]?.avg ? Math.round(scored[0].avg * 10) / 10 : null,
    attended: await Registration.countDocuments({ eventId: event._id, status: "attended" }),
    items,
  };
}

module.exports = { submit, evaluate, decide, askForProjects, list, hasLink, firstLink, resultMessage, IMAGE_TYPES };
