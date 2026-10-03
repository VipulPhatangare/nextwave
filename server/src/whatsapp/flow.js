const { Event, WaSession, CampaignLink } = require("../models");
const { registerStudent, activeForm, isVisible, validateAnswer } = require("../services/registration.service");
const { enqueue } = require("./sendQueue");
const ai = require("../services/ai.service");
const { answerOnWhatsApp } = require("./aiReply");

const send = (waId, body, related = "flow") => enqueue({ chatId: waId, body, related }).catch(() => {});

async function waQuestions() {
  const event = await Event.findOne();
  const form = await activeForm(event._id);
  return (form?.questions || [])
    .filter((q) => q.channels.includes("whatsapp") && q.mapTo !== "phone")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function formatQuestion(q, index, total) {
  let text = q.label;
  if (q.helpText) text += `\n_${q.helpText}_`;
  if (q.type === "single") {
    text += "\n" + q.options.map((o, i) => `${i + 1}. ${o.label}`).join("\n") + "\n\nReply with the number.";
  } else if (q.type === "multi") {
    text += "\n" + q.options.map((o, i) => `${i + 1}. ${o.label}`).join("\n") + "\n\nReply with numbers separated by commas, e.g. 1,3";
  } else if (q.type === "yesno") {
    text += "\nReply *1* for Yes or *2* for No.";
  }
  if (!q.required) text += "\n(Reply SKIP to skip)";
  return text;
}

// Convert "2" or "1,3" into option values before validation
function preprocess(q, text) {
  if (q.type === "yesno" && /^[12]$/.test(text.trim())) return text.trim() === "1" ? "yes" : "no";
  if (q.type === "single" && /^\d+$/.test(text.trim())) {
    const o = q.options[Number(text.trim()) - 1];
    return o ? o.value : text;
  }
  if (q.type === "multi") {
    return text.split(",").map((s) => {
      const t = s.trim();
      if (/^\d+$/.test(t)) {
        const o = q.options[Number(t) - 1];
        return o ? o.value : t;
      }
      return t;
    });
  }
  return text;
}

// Pull the campaign code out of the first message. Understands the old "JOIN CLG-ABC", the new "(code: CLG-ABC)",
// and, if the student retyped things, any word that is one of your campaign codes.
async function findSourceCode(text) {
  const up = String(text).toUpperCase();
  const guesses = [];
  const join = up.match(/JOIN\s+([A-Z0-9-]{3,20})/);
  if (join) guesses.push(join[1]);
  const tagged = up.match(/\bCODE\s*[:=]?\s*([A-Z0-9-]{3,20})/);
  if (tagged) guesses.push(tagged[1]);
  const words = [...new Set(up.match(/[A-Z0-9][A-Z0-9-]{2,19}/g) || [])];
  const known = words.length ? await CampaignLink.find({ code: { $in: words } }) : [];
  const knownSet = new Set(known.map((k) => k.code));
  // a guessed word counts only if it's one of your codes or looks like one (has a digit or hyphen), so "join the workshop" isn't a source
  for (const g of guesses) if (knownSet.has(g) || /[0-9-]/.test(g)) return g;
  return known[0] ? known[0].code : undefined;
}
const hasSourceCode = async (text) => !!(await findSourceCode(text));

async function start(waId, phone, text, pushname) {
  const event = await Event.findOne();
  const sourceCode = await findSourceCode(text);
  await WaSession.updateMany({ waId, status: "active" }, { status: "abandoned" });
  const session = await WaSession.create({ waId, phone, pushname, sourceCode, step: 0 });
  if (sourceCode) await CampaignLink.updateOne({ code: sourceCode }, { $inc: { clicks: 1 } });

  const qs = await waQuestions();
  const welcome = `Hey 👋 Welcome to *${event.name}*, a free online workshop for final-year engineering students.\n\nLet's reserve your seat in about 20 seconds.`;
  if (!qs.length) {
    await send(waId, welcome);
    return finish(session, event);
  }
  return askNext(session, qs, 0, welcome);
}

async function askNext(session, qs, fromIndex, intro) {
  for (let i = fromIndex; i < qs.length; i++) {
    if (isVisible(qs[i], session.answers)) {
      session.step = i;
      session.lastMessageAt = new Date();
      session.markModified("answers");
      await session.save();
      return send(session.waId, (intro ? intro + "\n\n" : "") + formatQuestion(qs[i], i, qs.length));
    }
  }
  if (intro) await send(session.waId, intro);
  return finish(session, await Event.findOne());
}

// Free-text answers: "my name is rahul verma", "i study at pccoe pune", "i don't have one".
const NAME_PREFACE = /^\s*(?:my name is|my name'?s|i am|i'm|im|this is|mera naam|mera nam|naam)\s+/i;
const SKIP_WORDS = /^(no|none|nil|na|n\/a|nahi|nahin|nahi hai|no email|don'?t have( one| any)?|i don'?t have( one| any)?|-)$/i;
const CUES = /\b(my name is|my college is|college is|i am from|i'm from|i study|i am studying|i'm studying|studying (at|in)|study (at|in)|mera naam|naam hai|my email is|email is|this is)\b/i;

// Returns { skip: true } | { value } | null (null = use what they typed)
async function understandAnswer(session, q, text) {
  if (!q.required && SKIP_WORDS.test(text.trim())) return { skip: true };
  let input = text.trim();
  if (q.mapTo === "name") input = input.replace(NAME_PREFACE, "").trim() || input;
  const plain = validateAnswer(q, preprocess(q, input));
  const sentenceLike = (["text", "longtext"].includes(q.type) && (CUES.test(input) || input.length > 70)) || (q.type === "email" && CUES.test(input));
  if (plain.ok && !sentenceLike) return input === text.trim() ? null : { value: input };
  const got = await ai.extractAnswer({ phone: session.phone, question: q, text });
  if (got && got.skip && !q.required) return got;
  if (got && got.value && validateAnswer(q, preprocess(q, got.value)).ok) return { value: got.value };
  return input === text.trim() ? null : { value: input };
}

// A real question ("is it free?") rather than an answer to the form question.
function looksLikeQuestion(t) {
  const words = t.split(/\s+/).length;
  return words >= 3 && (/\?\s*$/.test(t) || /^(is|are|what|when|where|why|how|can|could|do|does|will|which|kya|kab|kaise|kitna|kitne)\b/i.test(t));
}

async function next(session, text) {
  if (session.fixing && session.fixing.length) return nextFix(session, text);
  const qs = await waQuestions();
  const q = qs[session.step];
  if (!q) return finish(session, await Event.findOne());

  const t = text.trim();
  if (t.toUpperCase() === "SKIP" && !q.required) {
    return askNext(session, qs, session.step + 1);
  }

  // Answer a question in the middle of registration, then ask the form question again.
  if (looksLikeQuestion(t)) {
    const r = await answerOnWhatsApp({ waId: session.waId, phone: session.phone, name: session.pushname, text: t, reg: null, allowActions: false });
    if (r) return send(session.waId, `Now, back to your registration 👇\n\n${formatQuestion(q, session.step, qs.length)}`);
  }

  const smart = await understandAnswer(session, q, t);
  if (smart && smart.skip) return askNext(session, qs, session.step + 1);
  const r = validateAnswer(q, preprocess(q, smart && smart.value ? smart.value : t));
  if (!r.ok) {
    return send(session.waId, `${r.error}\n\n${formatQuestion(q, session.step, qs.length)}`);
  }
  if (r.value !== null) session.answers[q.key] = r.value;
  session.markModified("answers");
  return askNext(session, qs, session.step + 1);
}

function fixPrompt(fix, q) {
  const ask = fix.suggestion ? `Did you mean *${fix.suggestion}*?
*1* Yes, use it
Or type the correct ${q.label.toLowerCase().replace(/\?$/, "")}.` : `Please send the correct answer: ${q.label}`;
  return `Quick check 🙏 ${fix.problem}\n${ask}${q.required ? "" : "\n(Reply SKIP to leave it empty)"}`;
}

async function askFix(session) {
  const qs = await waQuestions();
  const fix = session.fixing[0];
  const q = qs.find((x) => x.key === fix.key);
  if (!q) { session.fixing.shift(); session.markModified("fixing"); await session.save(); return session.fixing.length ? askFix(session) : finish(session, await Event.findOne()); }
  return send(session.waId, fixPrompt(fix, q));
}

async function nextFix(session, text) {
  const qs = await waQuestions();
  const fix = session.fixing[0];
  const q = qs.find((x) => x.key === fix.key);
  let val = text.trim();
  if (/^(1|yes|y|haan|ok|okay)\.?$/i.test(val) && fix.suggestion) val = fix.suggestion;
  if (/^skip$/i.test(val) && q && !q.required) {
    delete session.answers[fix.key];
  } else if (q) {
    const r = validateAnswer(q, preprocess(q, val));
    if (!r.ok) return send(session.waId, `${r.error}\n\n${fixPrompt(fix, q)}`);
    if (r.value !== null) session.answers[fix.key] = r.value;
  }
  session.fixing.shift();
  session.markModified("answers");
  session.markModified("fixing");
  await session.save();
  return session.fixing.length ? askFix(session) : finish(session, await Event.findOne());
}

async function finish(session, event) {
  // One AI sanity check of the answers per registration. It never blocks: if AI is off or over budget it returns nothing.
  if (!session.aiChecked) {
    session.aiChecked = true;
    await session.save();
    const form = await activeForm(event._id);
    const { issues } = await ai.checkAnswers({ phone: session.phone, questions: form?.questions || [], answers: session.answers });
    if (issues.length) {
      session.fixing = issues.map((i) => ({ key: i.key, suggestion: i.suggestion, problem: i.problem }));
      session.markModified("fixing");
      await session.save();
      return askFix(session);
    }
  }
  try {
    const out = await registerStudent({
      channel: "whatsapp",
      phone: session.phone,
      waId: session.waId,
      answers: session.answers,
      sourceCode: session.sourceCode,
      waVerified: true,
      phoneVerified: true,
    });
    const { registration } = out;
    session.status = "done";
    await session.save();

    if (out.already) {
      return send(session.waId, `You're already registered, ${registration.name.split(" ")[0]}! ✅`);
    }
    // Confirmation is sent by the registration engine (CONFIRMATION automation).
  } catch (e) {
    session.status = "abandoned";
    await session.save();
    return send(session.waId, `Sorry, we couldn't complete your registration: ${e.message}`);
  }
}

module.exports = { start, next, hasSourceCode };
