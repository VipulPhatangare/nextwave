const runtime = require("../runtime");
const { Event, Form, Registration, CampaignLink, Automation } = require("../models");
const { normalizePhone } = require("../utils/phone");
const { clean } = require("../utils/codes");
const { customAlphabet } = require("nanoid");
const { notify } = require("./notify.service");

const tokenId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 10);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function activeForm(eventId) {
  return Form.findOne({ eventId, isActive: true });
}

function isVisible(q, answers) {
  if (!q.showIf || !q.showIf.key) return true;
  const a = answers[q.showIf.key];
  const val = Array.isArray(a) ? a.join(",") : String(a ?? "");
  return val === String(q.showIf.equals);
}

function validateAnswer(q, raw) {
  const empty = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "") || (Array.isArray(raw) && raw.length === 0);
  if (empty) {
    return q.required ? { ok: false, error: "This question is required." } : { ok: true, value: null };
  }
  const v = typeof raw === "string" ? raw.trim() : raw;
  const { min, max, regex } = q.validation || {};
  switch (q.type) {
    case "email":
      if (!EMAIL_RE.test(v)) return { ok: false, error: "Please enter a valid email address." };
      return { ok: true, value: v.toLowerCase() };
    case "number": {
      const n = Number(v);
      if (Number.isNaN(n)) return { ok: false, error: "Please enter a number." };
      if (min !== undefined && min !== null && n < min) return { ok: false, error: `Must be at least ${min}.` };
      if (max !== undefined && max !== null && n > max) return { ok: false, error: `Must be at most ${max}.` };
      return { ok: true, value: n };
    }
    case "phone": {
      const p = normalizePhone(v);
      return p ? { ok: true, value: p.e164 } : { ok: false, error: "Please enter a valid phone number." };
    }
    case "yesno": {
      const s = String(v).toLowerCase();
      if (["yes", "y", "true"].includes(s)) return { ok: true, value: "yes" };
      if (["no", "n", "false"].includes(s)) return { ok: true, value: "no" };
      return { ok: false, error: "Please answer YES or NO." };
    }
    case "single": {
      const opt = (q.options || []).find((o) => o.value === v || o.label.toLowerCase() === String(v).toLowerCase());
      return opt ? { ok: true, value: opt.value } : { ok: false, error: "Please choose one of the options." };
    }
    case "multi": {
      const arr = Array.isArray(v) ? v : String(v).split(",").map((s) => s.trim());
      const vals = [];
      for (const item of arr) {
        const opt = (q.options || []).find((o) => o.value === item || o.label.toLowerCase() === item.toLowerCase());
        if (!opt) return { ok: false, error: "Please choose from the options." };
        vals.push(opt.value);
      }
      return { ok: true, value: vals };
    }
    default: {
      const s = String(v);
      if (min && s.length < min) return { ok: false, error: `Please write at least ${min} characters.` };
      if (max && s.length > max) return { ok: false, error: `Please keep it under ${max} characters.` };
      if (regex) {
        try {
          if (!new RegExp(regex).test(s)) return { ok: false, error: "That doesn't look right. Please check and try again." };
        } catch (_) {}
      }
      return { ok: true, value: s };
    }
  }
}

// "anady barta" -> "Anady Barta". Only touches text that is all lowercase or all capitals, so "McDonald" or "PCCOE" stay as typed.
function tidyCase(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return t;
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters !== letters.toLowerCase() && letters !== letters.toUpperCase()) return t; // already mixed case
  if (letters === letters.toUpperCase() && letters.length <= 6 && !t.includes(" ")) return t; // short acronym such as PCCOE
  return t.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

// THE registration engine. Both the landing page and the WhatsApp bot call this.
async function registerStudent({ channel, phone, waId, answers = {}, sourceCode, waVerified, phoneVerified }) {
  const event = await Event.findOne();
  if (!event) throw httpError(500, "Workshop not set up yet.");
  if (!event.registrationOpen) throw httpError(400, "Registrations are closed.");

  // A student who messages us on WhatsApp is already identified by that chat. When WhatsApp hides the real number
  // behind its privacy ID ("lid:..."), register by the chat itself instead of asking for a number.
  const byChatOnly = channel === "whatsapp" && /^lid:\d+$/.test(String(phone)) && !!waId;
  const p = byChatOnly ? { e164: phone, waId } : normalizePhone(phone);
  if (!p) throw httpError(400, "Please enter a valid phone number.");

  const existing = await Registration.findOne({ eventId: event._id, phone: p.e164 });
  if (existing) return { registration: existing, already: true, event };

  const count = await Registration.countDocuments({ eventId: event._id, status: { $ne: "cancelled" } });
  if (count >= event.seatLimit) throw httpError(400, "Sorry, all seats are taken.");

  const form = await activeForm(event._id);
  const clean_answers = {};
  const errors = {};
  for (const q of form?.questions || []) {
    if (!isVisible(q, answers)) continue;
    if (q.mapTo === "phone") continue;
    const r = validateAnswer(q, answers[q.key]);
    if (!r.ok) errors[q.key] = r.error;
    else if (r.value !== null) clean_answers[q.key] = r.value;
  }
  if (Object.keys(errors).length) throw httpError(400, "Please fix the highlighted answers.", errors);

  const mapped = {};
  for (const q of form?.questions || []) {
    if (q.mapTo && clean_answers[q.key] !== undefined) {
      mapped[q.mapTo] = clean_answers[q.key];
      if (["name", "college"].includes(q.mapTo) && typeof mapped[q.mapTo] === "string") {
        mapped[q.mapTo] = tidyCase(mapped[q.mapTo]);
        clean_answers[q.key] = mapped[q.mapTo];
      }
    }
  }

  const src = clean(sourceCode) || undefined;

  let reg;
  try {
    reg = await Registration.create({
      eventId: event._id,
      formVersion: form?.version,
      name: mapped.name || answers.name || "Student",
      phone: p.e164,
      waId: p.waId,
      email: mapped.email,
      college: mapped.college,
      branch: mapped.branch,
      answers: clean_answers,
      channel,
      sourceCode: src,
      phoneVerified: !!phoneVerified,
      waVerified,
      joinToken: tokenId(),
    });
  } catch (e) {
    if (e.code === 11000) {
      const again = await Registration.findOne({ eventId: event._id, phone: p.e164 });
      if (again) return { registration: again, already: true, event };
    }
    throw e;
  }

  finalize(reg, event).catch((e) => console.error("finalize failed", e.message));
  return { registration: reg, already: false, event };
}

// Everything that happens once a student is registered.
async function finalize(reg, event) {
  if (reg.sourceCode) await CampaignLink.updateOne({ code: reg.sourceCode }, { $inc: { registrations: 1 } });

  runtime.emit("registration:new", { id: reg._id, name: reg.name, college: reg.college, channel: reg.channel, sourceCode: reg.sourceCode, at: reg.createdAt });

  const auto = await Automation.findOne({ key: "CONFIRMATION" });
  if (auto?.enabled) await notify({ registration: reg, templateKey: "CONFIRMATION", channels: auto.channels, force: true });
  await scheduleReminders(reg, event);
}

async function scheduleReminders(reg, event) {
  if (!runtime.agenda || !event.startAt) return;
  const autos = await Automation.find({ trigger: "before_event", enabled: true });
  for (const a of autos) {
    const when = new Date(new Date(event.startAt).getTime() - a.offsetMinutes * 60000);
    if (when.getTime() > Date.now()) {
      await runtime.agenda.schedule(when, "notify", { registrationId: String(reg._id), templateKey: a.templateKey, channels: a.channels });
    }
  }
}

function httpError(status, message, fields) {
  const e = new Error(message);
  e.status = status;
  e.fields = fields;
  return e;
}

module.exports = { registerStudent, finalize, activeForm, isVisible, validateAnswer, scheduleReminders, httpError };
