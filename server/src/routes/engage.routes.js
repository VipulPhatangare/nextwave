const fs = require("fs");
const path = require("path");
const express = require("express");
const M = require("../models");
const live = require("../services/live.service");
const projects = require("../services/project.service");
const ai = require("../services/ai.service");
const runtime = require("../runtime");
const { UPLOAD_DIR } = require("../services/media.service");

// Mounted under /api/admin (auth and the viewer read-only rule already applied there).
const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const audit = (req, action, details = "") => M.AuditLog.create({ adminEmail: req.user?.email, action, details }).catch(() => {});
const bad = (res, error) => res.status(400).json({ error });

// ---------- live session ----------
function cleanPoll(b) {
  const question = String(b.question || "").trim().slice(0, 300);
  const options = (Array.isArray(b.options) ? b.options : []).map((o) => String(o || "").trim().slice(0, 120)).filter(Boolean).slice(0, 4);
  if (!question) return { error: "Write the question." };
  if (options.length < 2) return { error: "Add at least 2 options." };
  let correct = b.correct === null || b.correct === undefined || b.correct === "" ? null : Number(b.correct);
  if (correct !== null && !(correct >= 0 && correct < options.length)) correct = null;
  const timeLimitSec = Math.min(300, Math.max(5, Number(b.timeLimitSec) || 30));
  return { question, options, correct, timeLimitSec };
}

router.get("/live", wrap(async (req, res) => res.json(await live.state())));

router.put(
  "/live/mode",
  wrap(async (req, res) => {
    const event = await M.Event.findOne();
    event.settings.liveMode = !!req.body.on;
    await event.save();
    await audit(req, "live.mode", String(!!req.body.on));
    runtime.emit("live:mode", { on: !!req.body.on });
    res.json({ liveMode: event.settings.liveMode });
  })
);

router.post(
  "/live/polls",
  wrap(async (req, res) => {
    const p = cleanPoll(req.body);
    if (p.error) return bad(res, p.error);
    const last = await M.LivePoll.findOne().sort({ order: -1 });
    res.json(await M.LivePoll.create({ ...p, order: (last?.order || 0) + 1 }));
  })
);

router.put(
  "/live/polls/:id",
  wrap(async (req, res) => {
    const poll = await M.LivePoll.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: "Not found." });
    if (poll.status !== "draft") return bad(res, "Reset the question before editing it.");
    const p = cleanPoll(req.body);
    if (p.error) return bad(res, p.error);
    Object.assign(poll, p);
    await poll.save();
    res.json(poll);
  })
);

router.delete(
  "/live/polls/:id",
  wrap(async (req, res) => {
    await live.reset(req.params.id); // takes back any points it gave
    await M.LivePoll.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  })
);

router.post("/live/polls/:id/open", wrap(async (req, res) => res.json(await live.open(req.params.id))));
router.post("/live/polls/:id/close", wrap(async (req, res) => res.json(await live.close(req.params.id))));
router.post("/live/polls/:id/reset", wrap(async (req, res) => res.json(await live.reset(req.params.id))));

// AI drafts quiz questions about a topic; the trainer edits them before use.
router.post(
  "/live/polls/generate",
  wrap(async (req, res) => {
    const topic = String(req.body.topic || "").trim().slice(0, 300);
    const n = Math.min(8, Math.max(1, Number(req.body.count) || 5));
    if (!topic) return bad(res, "Say what the workshop covers, for example: prompts, the Gemini API, building a chatbot.");
    const system = [
      "You write quick live-quiz questions for a 60-minute beginner workshop where final-year engineering students build their first AI project.",
      "Each question: short (under 15 words), one clearly correct answer, 4 short options (under 6 words each), no trick questions, fun but useful.",
      'Reply with JSON only: {"questions":[{"question":"","options":["","","",""],"correct":0}]}',
    ].join("\n");
    const text = await ai.adminCall({ kind: "generate", system, user: `Topic: ${topic}\nNumber of questions: ${n}`, json: true, maxOutputTokens: 1200 });
    let parsed;
    try { parsed = JSON.parse(String(text).replace(/^```(?:json)?|```$/g, "").trim()); } catch (_) { parsed = null; }
    const qs = (parsed?.questions || []).map(cleanPoll).filter((p) => !p.error).slice(0, n);
    if (!qs.length) return bad(res, "The AI reply couldn't be used. Try again.");
    const last = await M.LivePoll.findOne().sort({ order: -1 });
    let order = last?.order || 0;
    const created = await M.LivePoll.insertMany(qs.map((q) => ({ ...q, order: ++order })));
    res.json({ created: created.length });
  })
);

router.put(
  "/live/questions/:id",
  wrap(async (req, res) => {
    const up = {};
    if (["new", "answered", "hidden"].includes(req.body.status)) up.status = req.body.status;
    if (req.body.pinned !== undefined) up.pinned = !!req.body.pinned;
    res.json(await M.LiveQuestion.findByIdAndUpdate(req.params.id, up, { new: true }));
  })
);

// Start a fresh session: clears answers, points, questions (keeps the questions you wrote, as drafts).
router.post(
  "/live/reset-all",
  wrap(async (req, res) => {
    await M.LiveAnswer.deleteMany({});
    await M.LiveQuestion.deleteMany({});
    await M.Registration.updateMany({ livePoints: { $gt: 0 } }, { livePoints: 0 });
    await M.LivePoll.updateMany({}, { status: "draft", openedAt: null, closedAt: null });
    await audit(req, "live.reset_all");
    res.json({ ok: true });
  })
);

// ---------- projects ----------
router.get("/projects", wrap(async (req, res) => res.json(await projects.list({ status: req.query.status || undefined }))));

router.put(
  "/projects/settings",
  wrap(async (req, res) => {
    const event = await M.Event.findOne();
    if (req.body.open !== undefined) event.settings.projectsOpen = !!req.body.open;
    if (req.body.autoApprove !== undefined) event.settings.projectAutoApprove = Math.min(10, Math.max(0, Math.round(Number(req.body.autoApprove) || 0)));
    await event.save();
    await audit(req, "projects.settings", JSON.stringify(req.body));
    res.json({ open: event.settings.projectsOpen, autoApprove: event.settings.projectAutoApprove });
  })
);

router.post(
  "/projects/ask",
  wrap(async (req, res) => {
    const n = await projects.askForProjects();
    await audit(req, "projects.ask", String(n));
    res.json({ sent: n });
  })
);

router.put(
  "/projects/:id",
  wrap(async (req, res) => {
    const sub = await projects.decide(req.params.id, req.body.status, req.user?.email, { tell: req.body.tell !== false });
    if (!sub) return res.status(404).json({ error: "Not found." });
    await audit(req, "project.decide", `${req.params.id} ${req.body.status}`);
    res.json(sub);
  })
);

router.post(
  "/projects/:id/recheck",
  wrap(async (req, res) => {
    const sub = await projects.evaluate(req.params.id, { notify: false });
    if (!sub) return res.status(404).json({ error: "Not found." });
    res.json(sub);
  })
);

router.get(
  "/projects/:id/image",
  wrap(async (req, res) => {
    const sub = await M.ProjectSubmission.findById(req.params.id);
    if (!sub?.imageFile) return res.status(404).json({ error: "No screenshot." });
    const file = path.join(UPLOAD_DIR, path.basename(sub.imageFile));
    if (!fs.existsSync(file)) return res.status(404).json({ error: "Screenshot missing." });
    res.type(sub.imageMime || "image/jpeg").sendFile(file);
  })
);

module.exports = router;
