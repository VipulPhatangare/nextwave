const ai = require("../services/ai.service");
const { enqueue } = require("./sendQueue");

const send = (waId, body) => enqueue({ chatId: waId, body, related: "ai" }).catch(() => {});

const LIMIT_TEXT = {
  user_cap: "I've answered my limit of questions for today 🙏 Please try again tomorrow. A teammate can help if it's urgent.",
  user_month: "You've used all your assistant questions for this month 🙏 A teammate can help if it's urgent.",
  user_budget: "You've used all your assistant questions for this month 🙏 A teammate can help if it's urgent.",
  cooldown: "Give me a few seconds before the next question 🙏",
  budget: "Good question! Our assistant is resting right now, so I've passed this to the team. They'll reply here soon. 🙏",
  daily_cap: "Good question! Our assistant is resting right now, so I've passed this to the team. They'll reply here soon. 🙏",
};
const HANDOFF_TEXT = "Good question! I'm not sure, so I've passed it to our team. They'll reply here soon. 🙏";

// Sends an AI answer when it can. Returns "answered" | "handoff" | "limited" | null (null = nothing sent, use your normal reply).
async function answerOnWhatsApp({ waId, phone, name, text, reg, allowActions = true }) {
  const cfg = await ai.config();
  if (!cfg.enabled || !cfg.answerQuestions) return null;
  const out = await ai.answerQuestion({ phone, waId, name, text, reg });
  if (out.action) return allowActions ? `action:${out.action}` : null; // the caller carries out stop / confirm / can't-come
  if (out.text) { await send(waId, out.text); return "answered"; }
  if (out.handoff) { await send(waId, HANDOFF_TEXT); return "handoff"; }
  if (out.limited) { await send(waId, LIMIT_TEXT[out.limited] || LIMIT_TEXT.user_cap); return "limited"; }
  return null; // unavailable or the call failed: caller falls back to its static reply
}

module.exports = { answerOnWhatsApp };
