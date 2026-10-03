const runtime = require("../runtime");
const { Event, Registration, LivePoll, LiveAnswer, LiveQuestion } = require("../models");

// During the workshop: quiz questions on the trainer's screen, answered by replying 1-4 on WhatsApp.
// Answers get a reaction instead of a message, so 500 students answering doesn't mean 500 outgoing messages.

const BASE_POINTS = 100;
const SPEED_BONUS = 50; // full bonus for an instant answer, nothing at the time limit

const activePoll = () => LivePoll.findOne({ status: "live" });

// Counts per option for one poll.
async function counts(poll) {
  const agg = await LiveAnswer.aggregate([{ $match: { pollId: poll._id } }, { $group: { _id: "$choice", n: { $sum: 1 } } }]);
  const out = poll.options.map(() => 0);
  for (const a of agg) if (a._id >= 0 && a._id < out.length) out[a._id] = a.n;
  return out;
}

async function leaderboard(limit = 10) {
  const top = await Registration.find({ livePoints: { $gt: 0 } }).sort({ livePoints: -1, updatedAt: 1 }).limit(limit).lean();
  return top.map((r, i) => ({ rank: i + 1, name: shortName(r.name), college: r.college || "", points: r.livePoints }));
}

// "Rahul Verma" -> "Rahul V." (shown on a shared screen)
function shortName(name) {
  const parts = String(name || "Student").trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

async function emitState(poll) {
  if (!poll) return;
  runtime.emit("live:poll", { id: poll._id, status: poll.status, counts: await counts(poll), total: await LiveAnswer.countDocuments({ pollId: poll._id }) });
}

// A registered student replied with a number while a poll is live. Returns the reaction to show on their message.
async function answer(poll, reg, num) {
  const choice = num - 1;
  if (choice < 0 || choice >= poll.options.length) return "❓";
  const ms = Date.now() - new Date(poll.openedAt).getTime();
  const isQuiz = poll.correct !== null && poll.correct !== undefined;
  const correct = isQuiz ? choice === poll.correct : null;
  const late = ms > poll.timeLimitSec * 1000;
  const points = isQuiz && correct ? BASE_POINTS + (late ? 0 : Math.round(SPEED_BONUS * (1 - ms / (poll.timeLimitSec * 1000)))) : 0;
  try {
    await LiveAnswer.create({ pollId: poll._id, regId: reg._id, name: shortName(reg.name), college: reg.college, choice, correct, points, ms });
  } catch (e) {
    if (e.code === 11000) return "🔒"; // already answered: the first answer counts
    throw e;
  }
  const update = { $inc: { livePoints: points } };
  // answering during the session is good evidence they're there
  if (reg.status !== "attended" && reg.status !== "cancelled") Object.assign(update, { $set: { status: "attended", attendedAt: reg.attendedAt || new Date() } });
  await Registration.updateOne({ _id: reg._id }, update);
  emitState(poll).catch(() => {});
  return "👍"; // never reveal right/wrong before the trainer closes the question
}

// A message from a registered student while live mode is on: it goes on the Q&A board.
async function addQuestion(reg, text) {
  const q = await LiveQuestion.create({ regId: reg._id, name: shortName(reg.name), college: reg.college, text: String(text).slice(0, 500) });
  runtime.emit("live:question", q);
  return q;
}

async function isLiveMode() {
  return !!(await Event.findOne())?.settings?.liveMode;
}

// ---------- trainer controls ----------
async function open(id) {
  const now = new Date();
  await LivePoll.updateMany({ status: "live", _id: { $ne: id } }, { status: "closed", closedAt: now });
  const poll = await LivePoll.findByIdAndUpdate(id, { status: "live", openedAt: now, closedAt: null }, { new: true });
  if (poll) await emitState(poll);
  return poll;
}

async function close(id) {
  const poll = await LivePoll.findOneAndUpdate({ _id: id, status: "live" }, { status: "closed", closedAt: new Date() }, { new: true });
  if (poll) await emitState(poll);
  return poll;
}

// Back to a fresh draft: removes its answers and the points they gave.
async function reset(id) {
  const answers = await LiveAnswer.find({ pollId: id, points: { $gt: 0 } });
  for (const a of answers) await Registration.updateOne({ _id: a.regId }, { $inc: { livePoints: -a.points } });
  await LiveAnswer.deleteMany({ pollId: id });
  const poll = await LivePoll.findByIdAndUpdate(id, { status: "draft", openedAt: null, closedAt: null }, { new: true });
  if (poll) await emitState(poll);
  return poll;
}

// Everything the trainer's screen needs.
async function state() {
  const event = await Event.findOne();
  const polls = await LivePoll.find().sort({ order: 1, createdAt: 1 }).lean();
  const withCounts = [];
  for (const p of polls) {
    const c = await counts(p);
    const fastest = p.status === "closed" && p.correct !== null && p.correct !== undefined
      ? await LiveAnswer.find({ pollId: p._id, correct: true }).sort({ ms: 1 }).limit(5).lean()
      : [];
    withCounts.push({ ...p, counts: c, total: c.reduce((a, b) => a + b, 0), fastest: fastest.map((f) => ({ name: f.name, college: f.college, sec: Math.round(f.ms / 100) / 10 })) });
  }
  return {
    liveMode: !!event.settings.liveMode,
    botNumber: require("../config/env").wa.botNumber || "",
    polls: withCounts,
    questions: await LiveQuestion.find({ status: { $ne: "hidden" } }).sort({ pinned: -1, createdAt: -1 }).limit(100).lean(),
    leaderboard: await leaderboard(10),
    players: (await LiveAnswer.distinct("regId")).length,
  };
}

module.exports = { activePoll, answer, addQuestion, isLiveMode, open, close, reset, state, counts, leaderboard, shortName };
