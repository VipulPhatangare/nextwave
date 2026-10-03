const express = require("express");
const rateLimit = require("express-rate-limit");
const env = require("../config/env");
const { Event, Registration, CampaignLink } = require("../models");
const { registerStudent, activeForm } = require("../services/registration.service");
const otp = require("../services/otp.service");
const ai = require("../services/ai.service");
const { normalizePhone } = require("../utils/phone");
const { checkNumber } = require("../whatsapp/client");
const { waLink, buildVars, fmtDate, fmtTime } = require("../services/template.service");
const { clean } = require("../utils/codes");

const router = express.Router();
const limit = (windowMs, max) => rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests. Please slow down." } });
const httpErr = (status, message, fields) => Object.assign(new Error(message), { status, fields });

router.get("/event", async (req, res) => {
  const event = await Event.findOne();
  const registered = await Registration.countDocuments({ eventId: event._id, status: { $ne: "cancelled" } });
  res.json({
    name: event.name,
    description: event.description,
    date: fmtDate(event.startAt),
    time: fmtTime(event.startAt),
    startAt: event.startAt,
    durationMin: event.durationMin,
    open: event.registrationOpen && registered < event.seatLimit,
    seatsLeft: Math.max(0, event.seatLimit - registered),
    registered,
    otpRequired: !!event.settings.otpRequired,
    numberCheckMode: event.settings.numberCheckMode,
    whatsappJoinLink: waLink(clean(req.query.code) || "WEB"),
  });
});

router.get("/form", async (req, res) => {
  const event = await Event.findOne();
  const form = await activeForm(event._id);
  const channel = req.query.channel || "web";
  const questions = (form?.questions || []).filter((q) => q.channels.includes(channel)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  res.json({ questions });
});

router.post("/links/:code/click", limit(60000, 60), async (req, res) => {
  await CampaignLink.updateOne({ code: clean(req.params.code) }, { $inc: { clicks: 1 } });
  res.json({ ok: true });
});

router.post("/check-whatsapp", limit(60000, 10), async (req, res) => {
  const p = normalizePhone(req.body.phone);
  if (!p) return res.json({ valid: false, onWhatsApp: null });
  const on = await checkNumber(p.digits);
  res.json({ valid: true, onWhatsApp: on });
});

router.post("/otp/send", limit(10 * 60000, 6), async (req, res, next) => {
  try {
    const p = normalizePhone(req.body.phone);
    if (!p) throw httpErr(400, "Please enter a valid phone number.");
    const event = await Event.findOne();
    await otp.sendOtp(p.e164, p.waId, event.name);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/otp/verify", limit(10 * 60000, 12), async (req, res, next) => {
  try {
    const p = normalizePhone(req.body.phone);
    if (!p) throw httpErr(400, "Please enter a valid phone number.");
    res.json({ token: await otp.verifyOtp(p.e164, req.body.code) });
  } catch (e) {
    next(e);
  }
});

function successPayload(reg, event) {
  const v = buildVars(event, reg);
  return {
    already: false,
    name: reg.name.split(" ")[0],
    whatsappLink: waLink("WEB"),
    date: v.date,
    time: v.time,
    eventName: event.name,
  };
}

router.post("/register", limit(60000, 5), async (req, res, next) => {
  try {
    const { phone, answers, sourceCode, otpToken } = req.body;
    const event = await Event.findOne();
    const p = normalizePhone(phone);
    if (!p) return res.status(400).json({ error: "Please enter a valid phone number.", fields: { phone: "Invalid phone number" } });

    if (event.settings.otpRequired && !otp.checkToken(otpToken, p.e164)) {
      return res.status(400).json({ error: "Please verify your WhatsApp number first.", fields: { phone: "Verify this number with the code we send on WhatsApp" }, needsOtp: true });
    }

    let waVerified;
    if (event.settings.numberCheckMode !== "off") {
      waVerified = await checkNumber(p.digits);
      if (event.settings.numberCheckMode === "block" && waVerified === false) {
        return res.status(400).json({ error: "This number isn't on WhatsApp. Please use your WhatsApp number.", fields: { phone: "Not on WhatsApp" } });
      }
    }

    // Optional AI check of the typed answers. Fails open: it never stops a registration when AI is off, busy or over budget.
    if (!req.body.confirmedAi && !(await Registration.exists({ eventId: event._id, phone: p.e164 }))) {
      const cfg = await ai.config();
      if (cfg.enabled && cfg.checkAnswers) {
        const form = await activeForm(event._id);
        const { issues } = await ai.checkAnswers({ phone: p.e164, questions: form?.questions || [], answers: answers || {} });
        if (issues.length) {
          const fields = {};
          for (const i of issues) fields[i.key] = i.problem + (i.suggestion ? ` Did you mean "${i.suggestion}"?` : "");
          return res.status(422).json({ error: "We spotted something worth a second look. Fix it, or continue if it's correct.", fields, aiIssues: issues, canOverride: true });
        }
      }
    }

    const out = await registerStudent({
      channel: "web", phone, answers: answers || {}, sourceCode,
      waVerified: waVerified === null ? undefined : waVerified,
      phoneVerified: !!event.settings.otpRequired,
    });

    if (out.already) return res.json({ ...successPayload(out.registration, out.event), already: true });
    res.json(successPayload(out.registration, out.event));
  } catch (e) {
    next(e);
  }
});

// Personal join link. Opening it near the start time records attendance, then the student is sent to the meeting.
router.get("/join/:token", limit(60000, 30), async (req, res) => {
  const reg = await Registration.findOne({ joinToken: String(req.params.token) });
  const event = await Event.findOne();
  if (!reg || reg.status === "cancelled") return res.status(404).json({ error: "This link isn't valid." });
  const opensAt = event.startAt ? new Date(new Date(event.startAt).getTime() - 15 * 60000) : null;
  const isOpen = !opensAt || Date.now() >= opensAt.getTime();
  if (isOpen && reg.status !== "attended") {
    await Registration.updateOne({ _id: reg._id }, { status: "attended", attendedAt: new Date() });
  }
  res.json({ name: reg.name.split(" ")[0], open: isOpen, opensAt, startsAt: event.startAt, joinUrl: isOpen ? event.joinUrl || "" : "", eventName: event.name });
});

module.exports = router;
