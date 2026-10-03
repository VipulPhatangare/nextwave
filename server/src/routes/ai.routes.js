const express = require("express");
const { KnowledgeEntry, AiConfig, AiHandoff, AiCache, AuditLog } = require("../models");
const ai = require("../services/ai.service");
const gemini = require("../services/gemini.service");
const { enqueue } = require("../whatsapp/sendQueue");

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const audit = (req, action, details = "") => AuditLog.create({ adminEmail: req.user?.email, action, details }).catch(() => {});
const bad = (res, msg) => res.status(400).json({ error: msg });

// Every cost limit is clamped, so a typo can't switch the safety net off.
const NUMBERS = {
  maxOutputTokens: [50, 1500], maxInputChars: [50, 1500], historyTurns: [0, 6], cacheHours: [0, 168],
  perUserDaily: [1, 500], perUserMonthly: [0, 5000], perUserMonthlyBudgetInr: [0, 10000], cooldownSec: [0, 600], globalDailyCalls: [0, 20000], monthlyBudgetInr: [0, 100000],
  usdPerMInput: [0, 100], usdPerMOutput: [0, 200], usdToInr: [1, 500],
};

router.get(
  "/config",
  wrap(async (req, res) => res.json({ config: await ai.config(), configured: gemini.configured() }))
);

router.put(
  "/config",
  wrap(async (req, res) => {
    const c = await ai.config();
    const b = req.body;
    for (const k of ["enabled", "answerQuestions", "checkAnswers", "discloseAi"]) if (b[k] !== undefined) c[k] = !!b[k];
    for (const k of ["tone", "extraInstructions"]) if (b[k] !== undefined) c[k] = String(b[k]).slice(0, 1000);
    if (b.model !== undefined) {
      if (!/^[a-z0-9][a-z0-9.\-_]{2,60}$/i.test(b.model)) return bad(res, "That doesn't look like a Gemini model name.");
      c.model = b.model;
    }
    for (const [k, [lo, hi]] of Object.entries(NUMBERS)) {
      if (b[k] === undefined) continue;
      const n = Number(b[k]);
      if (!Number.isFinite(n) || n < lo || n > hi) return bad(res, `${k} must be between ${lo} and ${hi}.`);
      c[k] = n;
    }
    await c.save();
    await audit(req, "ai.config", Object.keys(b).join(","));
    res.json({ config: c, configured: gemini.configured() });
  })
);

router.get("/models", wrap(async (req, res, next) => {
  try { res.json(await gemini.listModels()); } catch (e) { res.status(e.status && e.status < 600 ? e.status : 400).json({ error: e.message }); }
}));

router.get("/usage", wrap(async (req, res) => res.json(await ai.usageSummary())));

// ---------- knowledge ----------
router.get("/knowledge", wrap(async (req, res) => res.json(await KnowledgeEntry.find().sort({ updatedAt: -1 }))));

const entryBody = (b) => {
  const title = String(b.title || "").trim().slice(0, 160);
  const content = String(b.content || "").trim().slice(0, 2000);
  if (!title || !content) return { error: "Add both a question/title and an answer." };
  return { e: { title, content, tags: (Array.isArray(b.tags) ? b.tags : String(b.tags || "").split(",")).map((t) => String(t).trim()).filter(Boolean).slice(0, 8), enabled: b.enabled !== false } };
};
router.post(
  "/knowledge",
  wrap(async (req, res) => {
    const r = entryBody(req.body);
    if (r.error) return bad(res, r.error);
    res.json(await KnowledgeEntry.create(r.e));
  })
);
router.put(
  "/knowledge/:id",
  wrap(async (req, res) => {
    const cur = await KnowledgeEntry.findById(req.params.id);
    if (!cur) return res.status(404).json({ error: "Not found." });
    const r = entryBody({ ...cur.toObject(), ...req.body });
    if (r.error) return bad(res, r.error);
    Object.assign(cur, r.e);
    await cur.save();
    res.json(cur);
  })
);
router.delete("/knowledge/:id", wrap(async (req, res) => { await KnowledgeEntry.findByIdAndDelete(req.params.id); res.json({ ok: true }); }));

// Gemini drafts entries from pasted text. Nothing is saved until the admin confirms.
router.post(
  "/knowledge/generate",
  wrap(async (req, res) => {
    const text = String(req.body.text || "").trim();
    if (text.length < 40) return bad(res, "Paste a bit more text (a paragraph or more) to generate entries from.");
    res.json({ entries: await ai.generateFaq(text) });
  })
);
router.post(
  "/knowledge/bulk",
  wrap(async (req, res) => {
    const out = [];
    for (const raw of (req.body.entries || []).slice(0, 20)) {
      const r = entryBody(raw);
      if (!r.error) out.push({ ...r.e, source: "ai" });
    }
    if (!out.length) return bad(res, "Nothing to save.");
    await KnowledgeEntry.insertMany(out);
    await audit(req, "ai.knowledge.bulk", String(out.length));
    res.json({ saved: out.length });
  })
);

// ---------- try it / draft ----------
router.post(
  "/test",
  wrap(async (req, res) => {
    const q = String(req.body.question || "").trim();
    if (!q) return bad(res, "Type a question to try.");
    res.json(await ai.adminAsk(q));
  })
);
router.post(
  "/draft",
  wrap(async (req, res) => {
    const brief = String(req.body.brief || "").trim();
    if (brief.length < 5) return bad(res, "Describe what the message should say.");
    res.json({ text: await ai.draftMessage({ brief, channel: req.body.channel }) });
  })
);
router.post("/cache/clear", wrap(async (req, res) => { const r = await AiCache.deleteMany({}); res.json({ cleared: r.deletedCount }); }));

// ---------- handoffs: questions the assistant couldn't answer ----------
router.get("/handoffs", wrap(async (req, res) => res.json(await AiHandoff.find(req.query.status ? { status: req.query.status } : {}).sort({ createdAt: -1 }).limit(100))));
router.put("/handoffs/:id", wrap(async (req, res) => res.json(await AiHandoff.findByIdAndUpdate(req.params.id, { status: req.body.status === "open" ? "open" : "resolved" }, { new: true }))));
router.post(
  "/handoffs/:id/reply",
  wrap(async (req, res) => {
    const h = await AiHandoff.findById(req.params.id);
    const body = String(req.body.body || "").trim();
    if (!h || !h.waId) return bad(res, "This question has no WhatsApp chat to reply to.");
    if (!body) return bad(res, "Write a reply first.");
    enqueue({ chatId: h.waId, body, related: "handoff-reply" }).catch(() => {});
    h.status = "resolved";
    await h.save();
    await audit(req, "ai.handoff.reply", h.phone);
    res.json(h);
  })
);

module.exports = router;
