const { Event, Registration, WaSession, MessageLog } = require("../models");
const { startedAt } = require("./client");
const { buildVars } = require("../services/template.service");
const { enqueue } = require("./sendQueue");
const runtime = require("../runtime");
const flow = require("./flow");
const { answerOnWhatsApp } = require("./aiReply");
const intents = require("./intents");

const takeover = new Set(); // chats an admin is handling manually

const send = (waId, body) => enqueue({ chatId: waId, body, related: "bot" }).catch(() => {});

const lidCache = new Map();

// Who is writing? Returns { phone, pushname } where phone is "+<number>" when we can know it,
// or "lid:<id>" when WhatsApp keeps the number private. Either is enough to register them: they already messaged us.
async function resolveSender(msg) {
  const from = msg.from;
  let pushname;
  try {
    const c = await msg.getContact();
    pushname = c?.pushname || c?.name;
  } catch (_) {}
  if (from.endsWith("@c.us")) return { phone: "+" + from.split("@")[0], pushname };

  if (lidCache.has(from)) return { phone: lidCache.get(from), pushname };
  let phone;
  try {
    const [r] = await runtime.waClient.getContactLidAndPhone(from);
    if (r?.pn && r.pn.endsWith("@c.us")) phone = "+" + r.pn.split("@")[0];
  } catch (_) {}
  if (!phone) phone = "lid:" + from.split("@")[0];
  lidCache.set(from, phone);
  return { phone, pushname };
}

async function handle(msg) {
  if (msg.fromMe || msg.from === "status@broadcast" || msg.from.endsWith("@g.us")) return;
  if (msg.timestamp < startedAt()) return; // ignore backlog from before we came online
  const isImage = msg.type === "image";
  if (msg.type !== "chat" && !isImage) return;

  const text = (msg.body || "").trim(); // for a photo, its caption
  if (!text && !isImage) return;
  const waId = msg.from;

  const logBody = isImage ? `[photo]${text ? " " + text : ""}` : text;
  await MessageLog.create({ waId, direction: "in", body: logBody, status: "received" });
  runtime.emit("wa:message", { chatId: waId, fromMe: false, body: logBody, at: msg.timestamp });

  if (takeover.has(waId)) return;

  const { phone, pushname } = await resolveSender(msg);
  const upper = text.toUpperCase();
  const event = await Event.findOne();
  const reg = await Registration.findOne({ eventId: event._id, $or: [{ phone }, { waId }] });

  // ---------- numbered menus, plain words, commands ----------
  const live = reg && reg.status !== "cancelled" ? reg : null; // a cancelled seat counts as "not registered"
  const ctx = { waId, phone, pushname, reg, live, event };
  const session = live ? null : await WaSession.findOne({ waId, status: "active" });
  const word = intents.parseWord(text);
  const num = intents.parseNumber(text);
  const menu = await intents.getMenu(intents.keyFor(reg, waId));

  // stopping messages works everywhere, even in the middle of registering
  if (word === "stop" || upper === "STOP") return runAction("stop", ctx);
  if (upper === "START") return runAction("start", ctx);
  if (upper === "HELP") return runAction("help", ctx);
  if (upper === "STATUS") return runAction("status", ctx);
  if (upper === "RESTART") {
    await WaSession.updateMany({ waId, status: "active" }, { status: "abandoned" });
    if (live) return send(waId, "You're already registered. Reply STATUS to see your details.");
    return runAction("register", ctx);
  }

  if (isImage) return; // photos: nothing to do (a person can see them in the inbox)

  if (!session) {
    // a bare number means whatever the last menu we sent said
    if (num !== null) {
      const action = menu && intents.MENUS[menu] && intents.MENUS[menu][num];
      if (action) return runAction(action, ctx);
      if (live) return runAction("help", ctx);
      if (num === 1) return runAction("register", ctx);
    }
    // plain words, in the context of the menu they were just shown
    if (word === "yes") {
      if (menu === "cancel_confirm") return runAction("cancel_seat", ctx);
      if (live) return runAction("confirm", ctx);
      if (menu === "start") return runAction("register", ctx);
    }
    if (word === "no") {
      if (menu === "cancel_confirm") return runAction("keep_seat", ctx);
      if (menu === "reminder" && live) return runAction("cant_come", ctx);
    }
  }

  if (live) {
    const r = await answerOnWhatsApp({ waId, phone, name: live.name, text, reg: live });
    if (typeof r === "string" && r.startsWith("action:")) return runAction(r.slice(7), ctx);
    if (r) return;
    await intents.setMenu(intents.keyFor(reg, waId), "help");
    return send(waId, `You're registered for *${event.name}* ✅\n\nReply:\n*1* My registration\n*2* Stop messages\n*3* Talk to a person`);
  }

  if (session) {
    session.lastMessageAt = new Date();
    return flow.next(session, text);
  }

  if (upper.includes("JOIN") || upper.includes("REGISTER") || (await flow.hasSourceCode(text))) {
    return runAction("register", ctx, text);
  }

  const r = await answerOnWhatsApp({ waId, phone, name: pushname, text, reg: null });
  if (typeof r === "string" && r.startsWith("action:")) {
    if (r === "action:stop") return runAction("stop", ctx);
  } else if (r) {
    await intents.setMenu(intents.keyFor(reg, waId), "start"); // after any answer, a bare 1 means "register me"
    return;
  }
  await intents.setMenu(intents.keyFor(reg, waId), "start");
  return send(waId, `Hi! 👋 Want a seat in *${event.name}*?\n\nReply *1* to register.`);
}

// Everything a number, a word or the AI can ask the bot to do.
async function runAction(action, { waId, phone, pushname, reg, live, event }, firstText) {
  switch (action) {
    case "stop":
      if (reg) await Registration.updateOne({ _id: reg._id }, { optedOutWa: true });
      await WaSession.updateMany({ waId, status: "active" }, { status: "abandoned" });
      await intents.setMenu(intents.keyFor(reg, waId), "stopped");
      return send(waId, "Okay, no more messages from us. 👍\nChanged your mind? Reply *1* to turn them back on.");
    case "start":
      if (reg) await Registration.updateOne({ _id: reg._id }, { optedOutWa: false });
      await intents.clearMenu(intents.keyFor(reg, waId));
      return send(waId, "Welcome back! You'll get workshop updates again. ✅");
    case "help":
      await intents.setMenu(intents.keyFor(reg, waId), "help");
      return send(waId, live ? `Reply:\n*1* My registration\n*2* Stop messages\n*3* Talk to a person` : `Reply *1* to register for *${event.name}*.`);
    case "status": {
      if (!live) return send(waId, `You're not registered yet. Reply *1* to register for *${event.name}*.`);
      const v = buildVars(event, live);
      await intents.setMenu(intents.keyFor(reg, waId), "help");
      return send(waId, `✅ Registered for *${event.name}*\n📅 ${v.date}, ${v.time}\n\nReply *2* to stop messages or *3* to talk to a person.`);
    }
    case "confirm":
      if (!live) return send(waId, `You're not registered yet. Reply *1* to register for *${event.name}*.`);
      await Registration.updateOne({ _id: live._id }, { status: live.status === "attended" ? "attended" : "confirmed", confirmedYesAt: new Date() });
      await intents.clearMenu(intents.keyFor(reg, waId));
      return send(waId, "Great, your seat is confirmed! See you there 🚀");
    case "cant_come":
      if (!live) return send(waId, `You're not registered yet. Reply *1* to register for *${event.name}*.`);
      await intents.setMenu(intents.keyFor(reg, waId), "cancel_confirm");
      return send(waId, "Sorry you can't make it. Should we release your seat so someone else can join?\n\n*1* Yes, release it\n*2* No, keep it");
    case "cancel_seat":
      if (live) await Registration.updateOne({ _id: live._id }, { status: "cancelled" });
      await intents.setMenu(intents.keyFor(reg, waId), "start");
      return send(waId, "Done, your seat is released. If plans change, reply *1* to register again.");
    case "keep_seat":
      await intents.clearMenu(intents.keyFor(reg, waId));
      return send(waId, "Great, your seat is kept ✅");
    case "person": {
      await require("../services/ai.service").createHandoff({ phone, waId, name: live?.name || pushname, question: "Asked to talk to a person", reason: "requested" });
      await intents.clearMenu(intents.keyFor(reg, waId));
      return send(waId, "Okay! I've asked our team to message you here. 🙏");
    }
    case "register":
      if (reg && reg.status === "cancelled") {
        await Registration.updateOne({ _id: reg._id }, { status: "registered" });
        await intents.clearMenu(intents.keyFor(reg, waId));
        return send(waId, "Welcome back! Your seat is restored ✅");
      }
      await intents.clearMenu(intents.keyFor(reg, waId));
      return flow.start(waId, phone, firstText || "JOIN", pushname);
    default:
      return null;
  }
}

module.exports = { handle, takeover };
