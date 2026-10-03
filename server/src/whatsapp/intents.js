const { WaContext } = require("../models");

// Numbered replies ("1", "2", "3") and plain-language replies ("stop", "haan", "can't come") for the bot.
// The LLM backs this up for anything these rules don't recognise.

// A registered student's menu is remembered by their registration, because the chat they reply from can differ
// from the one we sent the reminder to (WhatsApp sometimes uses a privacy ID). Others are remembered by chat.
const keyFor = (reg, waId) => (reg ? `reg:${reg._id}` : waId);

const MENU_TTL_MS = 48 * 3600 * 1000;
const setMenu = (waId, menu) =>
  WaContext.updateOne({ waId }, { menu, expiresAt: new Date(Date.now() + MENU_TTL_MS) }, { upsert: true }).catch(() => {});
const getMenu = async (waId) => (await WaContext.findOne({ waId, expiresAt: { $gt: new Date() } }))?.menu || null;
const clearMenu = (waId) => WaContext.deleteOne({ waId }).catch(() => {});

// what each number means after each menu
const MENUS = {
  reminder: { 1: "confirm", 2: "cant_come", 3: "stop" },
  help: { 1: "status", 2: "stop", 3: "person" },
  stopped: { 1: "start" },
  cancel_confirm: { 1: "cancel_seat", 2: "keep_seat" },
  start: { 1: "register" },
};

const norm = (t) => String(t).trim().toLowerCase().replace(/[.!?,\s]+$/g, "").replace(/\s+/g, " ");
const STOP = /^(stop|unsubscribe|opt ?out|quit|stop (it|this|all|messages?|messaging)|cancel messages?|(don'?t|do not|dont) (message|text|msg) me( again)?|band( karo| kar)?|nako|mat bhejo|nahi chahiye|bas( karo)?)$/;
const YES = /^(yes|y|yeah|yep|yup|ok|okay|k|sure|confirm|confirmed|haan|han|ha|ho|hoy|ji|ji haan|i('ll| will) (come|be there|join|attend)|coming|👍)$/;
const NO = /^(no|n|nope|nahi|nahin|naa|can'?t|cant|cannot|can'?t come|can'?t make it|not coming|won'?t come|i can'?t (come|make it|attend))$/;

// "stop" | "yes" | "no" | null
function parseWord(text) {
  const t = norm(text);
  if (STOP.test(t)) return "stop";
  if (YES.test(t)) return "yes";
  if (NO.test(t)) return "no";
  return null;
}

// "1", "1.", "2)" ...
function parseNumber(text) {
  const m = String(text).match(/^\s*([1-9])\s*[.)]?\s*$/);
  return m ? Number(m[1]) : null;
}

module.exports = { MENUS, keyFor, setMenu, getMenu, clearMenu, parseWord, parseNumber };
