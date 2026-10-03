const express = require("express");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const rateLimit = require("express-rate-limit");
const M = require("../models");
const runtime = require("../runtime");
const { sign, requireAuth, requireWrite } = require("../middleware/auth");
const { registerStudent, scheduleReminders } = require("../services/registration.service");
const { countRecipients } = require("../services/announcement.service");
const { notify } = require("../services/notify.service");
const { verifySmtp, sendEmail } = require("../services/email.service");
const { buildVars, render, waLink, shortWaLink, webLink } = require("../services/template.service");
const { logoutWhatsApp } = require("../whatsapp/client");
const { syncGroups, ensureGroupLink } = require("../whatsapp/groups");
const { listChats, listMessages } = require("../whatsapp/safeChats");
const { toQueueMedia } = require("../services/media.service");
const { takeover } = require("../whatsapp/bot");
const { enqueue } = require("../whatsapp/sendQueue");
const { clean } = require("../utils/codes");
const { generatePdf, sendCertificate } = require("../services/certificate.service");

const router = express.Router();
const requireOwner = (req, res, next) => (req.user.role === "owner" ? next() : res.status(403).json({ error: "Only the owner can do this." }));
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const audit = (req, action, details = "") => M.AuditLog.create({ adminEmail: req.user?.email, action, details }).catch(() => {});

// ---------- auth ----------
router.post(
  "/login",
  rateLimit({ windowMs: 60000, max: 5, message: { error: "Too many login attempts. Try again in a minute." } }),
  wrap(async (req, res) => {
    const admin = await M.Admin.findOne({ email: String(req.body.email || "").toLowerCase() });
    if (!admin || !(await bcrypt.compare(String(req.body.password || ""), admin.passwordHash))) {
      return res.status(401).json({ error: "Wrong email or password." });
    }
    const token = sign(admin);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 7 * 864e5 });
    res.json({ token, user: { email: admin.email, name: admin.name, role: admin.role } });
  })
);
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

router.use(requireAuth);
router.get("/me", (req, res) => res.json({ user: req.user }));

// every non-GET request needs write access
router.use((req, res, next) => (req.method === "GET" ? next() : requireWrite(req, res, next)));
router.use("/media", require("./media.routes"));
router.use("/ai", require("./ai.routes"));

// ---------- stats ----------
router.get(
  "/stats/overview",
  wrap(async (req, res) => {
    const event = await M.Event.findOne();
    const base = { eventId: event._id, status: { $ne: "cancelled" } };
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [total, today, web, wa, confirmed, attended, optedOut, clicks, topSources, topColleges] = await Promise.all([
      M.Registration.countDocuments(base),
      M.Registration.countDocuments({ ...base, createdAt: { $gte: startOfDay } }),
      M.Registration.countDocuments({ ...base, channel: "web" }),
      M.Registration.countDocuments({ ...base, channel: "whatsapp" }),
      M.Registration.countDocuments({ ...base, status: { $in: ["confirmed", "attended"] } }),
      M.Registration.countDocuments({ ...base, status: "attended" }),
      M.Registration.countDocuments({ ...base, optedOutWa: true }),
      M.CampaignLink.aggregate([{ $group: { _id: null, n: { $sum: "$clicks" } } }]),
      M.Registration.aggregate([{ $match: { ...base, sourceCode: { $ne: null } } }, { $group: { _id: "$sourceCode", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 5 }]),
      M.Registration.aggregate([{ $match: { ...base, college: { $ne: null } } }, { $group: { _id: { $toLower: "$college" }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 5 }]),
    ]);
    res.json({
      total, today, web, whatsapp: wa, confirmed, attended, optedOut,
      clicks: clicks[0]?.n || 0,
      target: event.target, seatLimit: event.seatLimit,
      topSources, topColleges,
    });
  })
);

router.get(
  "/stats/timeseries",
  wrap(async (req, res) => {
    const event = await M.Event.findOne();
    const since = new Date(Date.now() - 14 * 864e5);
    const rows = await M.Registration.aggregate([
      { $match: { eventId: event._id, createdAt: { $gte: since }, status: { $ne: "cancelled" } } },
      { $group: { _id: { d: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, c: "$channel" }, n: { $sum: 1 } } },
      { $sort: { "_id.d": 1 } },
    ]);
    const map = {};
    rows.forEach((r) => {
      map[r._id.d] = map[r._id.d] || { date: r._id.d, web: 0, whatsapp: 0 };
      map[r._id.d][r._id.c] = r.n;
    });
    res.json(Object.values(map));
  })
);

// ---------- event ----------
router.get("/event", wrap(async (req, res) => res.json(await M.Event.findOne())));
router.put(
  "/event",
  wrap(async (req, res) => {
    const event = await M.Event.findOne();
    const b = req.body;
    const prevStart = event.startAt && event.startAt.getTime();
    for (const k of ["name", "description", "joinUrl", "seatLimit", "target", "registrationOpen", "durationMin"]) {
      if (b[k] !== undefined) event[k] = b[k];
    }
    if (b.startAt) event.startAt = new Date(b.startAt);
    if (b.settings?.startMessage !== undefined) {
      const m = String(b.settings.startMessage).trim();
      if (m.length < 5) return res.status(400).json({ error: "Write a short starting message." });
      if (m.length > 300) return res.status(400).json({ error: "Keep the starting message under 300 characters." });
      b.settings.startMessage = m;
    }
    if (b.settings) {
      for (const k of Object.keys(b.settings)) event.settings[k] = b.settings[k];
      if (b.settings.quietHours) event.settings.quietHours = b.settings.quietHours;
    }
    await event.save();
    require("../services/template.service").setStartConfig(event);
    await audit(req, "event.update", JSON.stringify(Object.keys(b)));
    if (b.startAt && new Date(b.startAt).getTime() !== prevStart && runtime.agenda) {
      // event time changed: rebuild reminder jobs for everyone
      await runtime.agenda.cancel({ name: "notify", "data.templateKey": { $in: (await M.Automation.find({ trigger: "before_event" })).map((a) => a.templateKey) } });
      const regs = await M.Registration.find({ eventId: event._id, status: { $ne: "cancelled" } });
      for (const r of regs) await scheduleReminders(r, event);
    }
    res.json(event);
  })
);

// ---------- form builder ----------
router.get(
  "/forms/active",
  wrap(async (req, res) => {
    const event = await M.Event.findOne();
    res.json(await M.Form.findOne({ eventId: event._id, isActive: true }));
  })
);
router.post(
  "/forms",
  wrap(async (req, res) => {
    const event = await M.Event.findOne();
    const last = await M.Form.findOne({ eventId: event._id }).sort({ version: -1 });
    const questions = (req.body.questions || []).map((q, i) => ({ ...q, order: i }));
    for (const q of questions) {
      if (!q.key || !q.label) return res.status(400).json({ error: "Every question needs a label." });
    }
    const keys = new Set(questions.map((q) => q.key));
    if (keys.size !== questions.length) return res.status(400).json({ error: "Question keys must be unique." });
    await M.Form.updateMany({ eventId: event._id }, { isActive: false });
    const form = await M.Form.create({ eventId: event._id, version: (last?.version || 0) + 1, isActive: true, questions });
    await audit(req, "form.save", `v${form.version}`);
    res.json(form);
  })
);

// ---------- registrations ----------
function regFilter(q, eventId) {
  const f = { eventId };
  if (q.status) f.status = q.status;
  if (q.channel) f.channel = q.channel;
  if (q.source) f.sourceCode = clean(q.source);
  if (q.college) f.college = new RegExp(String(q.college).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (q.q) {
    const rx = new RegExp(String(q.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    f.$or = [{ name: rx }, { phone: rx }, { email: rx }, { college: rx }];
  }
  return f;
}

router.get(
  "/registrations",
  wrap(async (req, res) => {
    const event = await M.Event.findOne();
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(100, Number(req.query.size) || 25);
    const f = regFilter(req.query, event._id);
    const [items, total] = await Promise.all([
      M.Registration.find(f).sort({ createdAt: -1 }).skip((page - 1) * size).limit(size),
      M.Registration.countDocuments(f),
    ]);
    res.json({ items, total, page, size });
  })
);

router.get(
  "/registrations/export.csv",
  wrap(async (req, res) => {
    const event = await M.Event.findOne();
    const rows = await M.Registration.find(regFilter(req.query, event._id)).sort({ createdAt: 1 });
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r.answers || {})))];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["name", "phone", "email", "college", "branch", "channel", "source", "status", "registered_at", ...keys];
    const lines = [head.join(",")];
    for (const r of rows) {
      lines.push([r.name, r.phone, r.email, r.college, r.branch, r.channel, r.sourceCode, r.status, r.createdAt.toISOString(), ...keys.map((k) => (Array.isArray(r.answers?.[k]) ? r.answers[k].join("; ") : r.answers?.[k]))].map(esc).join(","));
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=registrations.csv");
    res.send(lines.join("\n"));
  })
);

router.post(
  "/registrations",
  wrap(async (req, res) => {
    const out = await registerStudent({ channel: "manual", phone: req.body.phone, answers: req.body.answers || {}, sourceCode: req.body.sourceCode });
    await audit(req, "registration.manual", out.registration.phone);
    res.json(out.registration);
  })
);

router.put(
  "/registrations/:id",
  wrap(async (req, res) => {
    const allowed = ["status", "name", "email", "college", "branch", "optedOutWa", "optedOutEmail"];
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    if (patch.status === "attended") patch.attendedAt = new Date();
    const r = await M.Registration.findByIdAndUpdate(req.params.id, patch, { new: true });
    await audit(req, "registration.update", `${req.params.id} ${JSON.stringify(patch)}`);
    res.json(r);
  })
);

router.post(
  "/registrations/bulk-status",
  wrap(async (req, res) => {
    const { ids, status } = req.body;
    const patch = { status };
    if (status === "attended") patch.attendedAt = new Date();
    await M.Registration.updateMany({ _id: { $in: ids } }, patch);
    await audit(req, "registration.bulk", `${ids.length} -> ${status}`);
    res.json({ ok: true });
  })
);

router.post(
  "/registrations/:id/resend",
  wrap(async (req, res) => {
    const r = await M.Registration.findById(req.params.id);
    const result = await notify({ registration: r, templateKey: "CONFIRMATION", channels: ["whatsapp", "email"], force: true });
    res.json(result);
  })
);

// ---------- campaign links ----------
router.get(
  "/links",
  wrap(async (req, res) => {
    const links = await M.CampaignLink.find().sort({ createdAt: -1 });
    res.json(links.map((l) => ({ ...l.toObject(), webUrl: webLink(l.code), waUrl: waLink(l.code), shortUrl: shortWaLink(l.code) })));
  })
);
router.post(
  "/links",
  wrap(async (req, res) => {
    const code = clean(req.body.code);
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) return res.status(400).json({ error: "Code must be 3-20 letters, numbers or dashes." });
    if (await M.CampaignLink.exists({ code })) return res.status(400).json({ error: "That code already exists." });
    const l = await M.CampaignLink.create({ code, label: req.body.label, type: req.body.type, owner: req.body.owner });
    await audit(req, "link.create", code);
    res.json(l);
  })
);
router.delete(
  "/links/:code",
  wrap(async (req, res) => {
    await M.CampaignLink.deleteOne({ code: clean(req.params.code) });
    res.json({ ok: true });
  })
);
router.get(
  "/links/:code/qr",
  wrap(async (req, res) => {
    const code = clean(req.params.code);
    // a group's QR: make sure its tracked link exists so scans are counted, even before the first broadcast
    if (code.startsWith("GRP-") && !(await M.CampaignLink.exists({ code }))) {
      const digits = code.slice(4);
      const g = (await M.WaGroup.findOne({ linkCode: code })) || (await M.WaGroup.find({ groupId: new RegExp(digits + "@") })).find((x) => x.groupId.replace(/\D/g, "").endsWith(digits));
      if (g) await ensureGroupLink(g);
    }
    // WhatsApp QR uses the short link when there is one: fewer dots, easier to scan from a poster, and scans are counted
    const target = req.query.channel === "whatsapp" ? shortWaLink(code) : webLink(code);
    const width = Math.min(2048, Math.max(256, Number(req.query.size) || 600));
    const opts = { width, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0b0b0c", light: "#ffffff" } };
    if (req.query.download) res.attachment(`QR-${code}-${req.query.channel === "whatsapp" ? "whatsapp" : "web"}.${req.query.format === "svg" ? "svg" : "png"}`);
    if (req.query.format === "svg") return res.type("svg").send(await QRCode.toString(target, { ...opts, type: "svg" }));
    res.type("png").send(await QRCode.toBuffer(target, opts));
  })
);

// ---------- templates + automations ----------
router.get("/templates", wrap(async (req, res) => res.json(await M.Template.find().sort({ key: 1 }))));
router.put(
  "/templates/:id",
  wrap(async (req, res) => {
    const t = await M.Template.findByIdAndUpdate(req.params.id, { subject: req.body.subject, body: req.body.body }, { new: true });
    await audit(req, "template.update", t.key + "/" + t.channel);
    res.json(t);
  })
);
router.post(
  "/templates/:id/test",
  wrap(async (req, res) => {
    const t = await M.Template.findById(req.params.id);
    const event = await M.Event.findOne();
    const sample = { name: "Test Student", college: "Sample College" };
    const vars = buildVars(event, sample);
    const text = render(t.body, vars);
    if (t.channel === "email") {
      const r = await sendEmail({ to: req.body.to, subject: "[TEST] " + render(t.subject, vars), text, event, attachIcs: t.key === "CONFIRMATION", templateKey: t.key });
      return res.json(r);
    }
    const digits = String(req.body.to || "").replace(/\D/g, "");
    if (!digits) return res.status(400).json({ error: "Enter a phone number." });
    enqueue({ chatId: `${digits}@c.us`, body: "[TEST] " + text, related: "template-test" }).catch(() => {});
    res.json({ ok: true, queued: true });
  })
);
router.get("/automations", wrap(async (req, res) => res.json(await M.Automation.find().sort({ trigger: 1, offsetMinutes: -1 }))));
router.put(
  "/automations/:id",
  wrap(async (req, res) => {
    const patch = {};
    for (const k of ["enabled", "offsetMinutes", "channels"]) if (req.body[k] !== undefined) patch[k] = req.body[k];
    const a = await M.Automation.findByIdAndUpdate(req.params.id, patch, { new: true });
    await audit(req, "automation.update", `${a.key} ${JSON.stringify(patch)}`);
    res.json(a);
  })
);

// ---------- announcements ----------
router.get("/announcements", wrap(async (req, res) => res.json(await M.Announcement.find().sort({ createdAt: -1 }).limit(50))));
router.post("/announcements/preview-count", wrap(async (req, res) => res.json({ count: await countRecipients(req.body.segment || {}) })));
router.post(
  "/announcements",
  wrap(async (req, res) => {
    const b = req.body;
    if ((!b.body && !b.mediaId) || !b.channels?.length) return res.status(400).json({ error: "Write a message (or attach a file) and choose a channel." });
    if (b.mediaId && !(await M.Media.exists({ _id: b.mediaId }))) return res.status(400).json({ error: "That attachment no longer exists. Upload it again." });
    const a = await M.Announcement.create({
      title: b.title || b.subject || "Announcement",
      subject: b.subject,
      body: b.body || "",
      mediaId: b.mediaId || undefined,
      channels: b.channels,
      segment: b.segment || {},
      scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : undefined,
      status: b.scheduledAt ? "scheduled" : "draft",
    });
    if (b.scheduledAt) await runtime.agenda.schedule(new Date(b.scheduledAt), "send-announcement", { id: String(a._id) });
    else await runtime.agenda.now("send-announcement", { id: String(a._id) });
    await audit(req, "announcement.create", `${a.title} via ${a.channels.join("+")}`);
    res.json(a);
  })
);

// ---------- WhatsApp ----------
router.get("/wa/status", (req, res) => res.json({ status: runtime.waStatus, qr: runtime.waQr }));
router.post("/wa/logout", wrap(async (req, res) => { await logoutWhatsApp(); res.json({ ok: true }); }));
router.post("/wa/groups/sync", wrap(async (req, res) => res.json({ count: await syncGroups() })));
router.get(
  "/wa/groups",
  wrap(async (req, res) => {
    const groups = await M.WaGroup.find().sort({ name: 1 });
    // the link {{group_link}} turns into for each group, so the broadcast preview shows the real thing
    res.json(groups.map((g) => {
      const linkCode = g.linkCode || "GRP-" + g.groupId.replace(/\D/g, "").slice(-6);
      return { ...g.toObject(), linkCode, link: shortWaLink(linkCode) };
    }));
  })
);
router.put(
  "/wa/groups/:id",
  wrap(async (req, res) => res.json(await M.WaGroup.findByIdAndUpdate(req.params.id, { tags: req.body.tags || [] }, { new: true })))
);
router.post(
  "/wa/broadcasts",
  wrap(async (req, res) => {
    const { groupIds, message, scheduledAt, mediaId } = req.body;
    if (!groupIds?.length || (!message && !mediaId)) return res.status(400).json({ error: "Pick at least one group and write a message or attach a file." });
    if (mediaId && !(await M.Media.exists({ _id: mediaId }))) return res.status(400).json({ error: "That attachment no longer exists. Upload it again." });
    const b = await M.GroupBroadcast.create({ groupIds, message: message || "", mediaId: mediaId || undefined, scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined });
    if (scheduledAt) await runtime.agenda.schedule(new Date(scheduledAt), "group-broadcast", { id: String(b._id) });
    else await runtime.agenda.now("group-broadcast", { id: String(b._id) });
    await audit(req, "broadcast.create", `${groupIds.length} groups`);
    res.json(b);
  })
);
router.get("/wa/broadcasts", wrap(async (req, res) => res.json(await M.GroupBroadcast.find().sort({ createdAt: -1 }).limit(20))));

// inbox
router.get(
  "/wa/chats",
  wrap(async (req, res) => {
    if (!runtime.waClient || runtime.waStatus !== "connected") return res.json([]);
    try {
      const chats = await listChats(200);
      res.json(chats.map((c) => ({ ...c, takeover: takeover.has(c.id) })));
    } catch (e) {
      console.error("wa/chats failed:", e.message);
      res.status(502).json({ error: `Couldn't read your WhatsApp chats: ${e.message}` });
    }
  })
);
router.get(
  "/wa/chats/:id/messages",
  wrap(async (req, res) => {
    try {
      res.json(await listMessages(req.params.id, 50));
    } catch (e) {
      console.error("wa/messages failed:", e.message);
      res.status(502).json({ error: `Couldn't read this chat: ${e.message}` });
    }
  })
);
router.post(
  "/wa/chats/:id/send",
  wrap(async (req, res) => {
    const { body, mediaId } = req.body;
    if (!body && !mediaId) return res.status(400).json({ error: "Write a message or attach a file." });
    const media = mediaId ? await toQueueMedia(mediaId) : null;
    if (mediaId && !media) return res.status(400).json({ error: "That attachment no longer exists. Upload it again." });
    await enqueue({ chatId: req.params.id, body: body || "", media, related: "inbox" });
    res.json({ ok: true });
  })
);
router.post("/wa/chats/:id/takeover", (req, res) => {
  if (req.body.on) takeover.add(req.params.id);
  else takeover.delete(req.params.id);
  res.json({ on: takeover.has(req.params.id) });
});

// ---------- attendance + certificates ----------
router.get(
  "/attendance",
  wrap(async (req, res) => {
    const event = await M.Event.findOne();
    const base = { eventId: event._id };
    const by = async (s) => M.Registration.countDocuments({ ...base, status: s });
    const [registered, confirmed, attended, noShow, certs] = await Promise.all([
      by("registered"), by("confirmed"), by("attended"), by("no_show"),
      M.Registration.countDocuments({ ...base, certificateSentAt: { $ne: null } }),
    ]);
    const eligible = registered + confirmed + attended + noShow;
    res.json({ registered, confirmed, attended, noShow, certificatesSent: certs, eligible, rate: eligible ? Math.round((attended / eligible) * 100) : 0 });
  })
);
router.post(
  "/attendance/mark-no-shows",
  wrap(async (req, res) => {
    const event = await M.Event.findOne();
    const r = await M.Registration.updateMany({ eventId: event._id, status: { $in: ["registered", "confirmed"] } }, { status: "no_show" });
    await audit(req, "attendance.mark_no_shows", String(r.modifiedCount));
    res.json({ count: r.modifiedCount });
  })
);
router.post(
  "/certificates/send",
  wrap(async (req, res) => {
    const event = await M.Event.findOne();
    const q = req.body.ids?.length ? { _id: { $in: req.body.ids } } : { eventId: event._id, status: "attended", certificateSentAt: null };
    const regs = await M.Registration.find(q);
    let queued = 0;
    for (const r of regs) {
      const out = await sendCertificate(r, { force: !!req.body.ids?.length });
      if (out.whatsapp || out.email === "sent") queued++;
    }
    await audit(req, "certificates.send", `${queued}/${regs.length}`);
    res.json({ total: regs.length, queued });
  })
);
router.get(
  "/certificates/preview/:id",
  wrap(async (req, res) => {
    const r = await M.Registration.findById(req.params.id);
    res.type("pdf").send(await generatePdf(await M.Event.findOne(), r));
  })
);

// ---------- admin users (owner only) ----------
router.get("/admins", requireOwner, wrap(async (req, res) => res.json(await M.Admin.find().select("name email role createdAt"))));
router.post(
  "/admins",
  requireOwner,
  wrap(async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email." });
    if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    if (!["admin", "viewer", "owner"].includes(role)) return res.status(400).json({ error: "Choose a role." });
    if (await M.Admin.exists({ email: email.toLowerCase() })) return res.status(400).json({ error: "That email already has an account." });
    const a = await M.Admin.create({ name, email: email.toLowerCase(), role, passwordHash: await bcrypt.hash(password, 10) });
    await audit(req, "admin.create", `${a.email} (${a.role})`);
    res.json({ _id: a._id, name: a.name, email: a.email, role: a.role });
  })
);
router.put(
  "/admins/:id",
  requireOwner,
  wrap(async (req, res) => {
    const a = await M.Admin.findById(req.params.id);
    if (!a) return res.status(404).json({ error: "Not found." });
    if (req.body.role) {
      if (a.role === "owner" && req.body.role !== "owner" && (await M.Admin.countDocuments({ role: "owner" })) <= 1) return res.status(400).json({ error: "There must be at least one owner." });
      a.role = req.body.role;
    }
    if (req.body.password) {
      if (req.body.password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
      a.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    await a.save();
    await audit(req, "admin.update", a.email);
    res.json({ _id: a._id, name: a.name, email: a.email, role: a.role });
  })
);
router.delete(
  "/admins/:id",
  requireOwner,
  wrap(async (req, res) => {
    const a = await M.Admin.findById(req.params.id);
    if (!a) return res.json({ ok: true });
    if (String(a._id) === req.user.id) return res.status(400).json({ error: "You can't delete your own account." });
    if (a.role === "owner" && (await M.Admin.countDocuments({ role: "owner" })) <= 1) return res.status(400).json({ error: "There must be at least one owner." });
    await a.deleteOne();
    await audit(req, "admin.delete", a.email);
    res.json({ ok: true });
  })
);

// ---------- logs ----------
router.get("/logs/messages", wrap(async (req, res) => res.json(await M.MessageLog.find().sort({ createdAt: -1 }).limit(100))));
router.get("/logs/emails", wrap(async (req, res) => res.json(await M.EmailLog.find().sort({ createdAt: -1 }).limit(100))));
router.get("/audit", wrap(async (req, res) => res.json(await M.AuditLog.find().sort({ createdAt: -1 }).limit(100))));
router.post("/smtp/verify", wrap(async (req, res) => res.json(await verifySmtp())));

module.exports = router;
