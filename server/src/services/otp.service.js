const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const runtime = require("../runtime");
const { OtpCode } = require("../models");
const { enqueue } = require("../whatsapp/sendQueue");

const hash = (phone, code) => crypto.createHash("sha256").update(`${phone}:${code}:${env.jwtSecret}`).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });

async function sendOtp(phone, waId, eventName) {
  if (runtime.waStatus !== "connected") throw fail(503, "WhatsApp verification isn't available right now. Please try again shortly.");
  const last = await OtpCode.findOne({ phone }).sort({ _id: -1 });
  if (last && Date.now() - last._id.getTimestamp().getTime() < 30000) throw fail(429, "Please wait 30 seconds before asking for another code.");
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await OtpCode.deleteMany({ phone });
  await OtpCode.create({ phone, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + 10 * 60000) });
  enqueue({ chatId: waId, body: `Your verification code for *${eventName}* is *${code}*.\nIt works for 10 minutes. Don't share it with anyone.`, related: "otp", priority: true }).catch(() => {});
}

async function verifyOtp(phone, code) {
  const rec = await OtpCode.findOne({ phone }).sort({ _id: -1 });
  if (!rec || rec.expiresAt < new Date()) throw fail(400, "That code has expired. Please ask for a new one.");
  if (rec.attempts >= 5) throw fail(429, "Too many wrong tries. Please ask for a new code.");
  rec.attempts += 1;
  if (hash(phone, String(code).trim()) !== rec.codeHash) {
    await rec.save();
    throw fail(400, "That code isn't right. Please check and try again.");
  }
  rec.verified = true;
  await rec.save();
  return jwt.sign({ phone, otp: true }, env.jwtSecret, { expiresIn: "30m" });
}

function checkToken(token, phone) {
  try {
    const t = jwt.verify(token, env.jwtSecret);
    return t.otp === true && t.phone === phone;
  } catch (_) {
    return false;
  }
}

module.exports = { sendOtp, verifyOtp, checkToken };
