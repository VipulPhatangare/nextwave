const nodemailer = require("nodemailer");
const ics = require("ics");
const env = require("../config/env");
const { EmailLog } = require("../models");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!env.smtp.host || !env.smtp.user) return null;
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
    pool: true,
    maxConnections: 2,
    rateLimit: 5,
  });
  return transporter;
}

function icsFor(event) {
  if (!event.startAt) return null;
  const d = new Date(event.startAt);
  const { error, value } = ics.createEvent({
    title: event.name,
    start: [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()],
    startInputType: "utc",
    startOutputType: "utc",
    duration: { minutes: event.durationMin || 60 },
    description: `Free online workshop. Join link: ${event.joinUrl || "will be shared soon"}`,
    url: event.joinUrl || undefined,
  });
  return error ? null : value;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ORANGE = "#ff6a00";
const FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// One line of the plain-text template -> HTML. A line that is only a link becomes a button.
function lineHtml(line) {
  const t = line.trim();
  if (/^https?:\/\/\S+$/.test(t)) {
    const label = /\/j\//.test(t) ? "Join the workshop" : "Open link";
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 6px"><tr><td style="background:${ORANGE};border-radius:8px">
<a href="${esc(t)}" style="display:inline-block;padding:13px 26px;${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">${label} &rarr;</a></td></tr></table>
<div style="font-size:12px;color:#8a8f98;word-break:break-all;margin-bottom:6px">${esc(t)}</div>`;
  }
  return esc(line)
    .replace(/\*(.+?)\*/g, "<b>$1</b>")
    .replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" style="color:${ORANGE}">$1</a>`);
}

// Branded black & orange layout around the plain-text body. Table-based so it holds up in Gmail and Outlook.
function toHtml(text, event) {
  const lines = String(text).split("\n");
  const preheader = esc((lines.find((l, i) => i > 0 && l.trim()) || "").replace(/\*/g, "").slice(0, 120));
  const body = lines.map((l) => (l.trim() ? lineHtml(l) : "")).join("<br>").replace(/(<\/table>\s*<div[^>]*>[^<]*<\/div>)<br>/g, "$1");
  const name = esc(event?.name || "Free online workshop");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f2f2f3">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0b0b0c;padding:22px 28px;border-bottom:4px solid ${ORANGE}">
<div style="${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${ORANGE};font-weight:700">Free online workshop</div>
<div style="${FONT};font-size:20px;line-height:1.3;color:#ffffff;font-weight:700;margin-top:6px">${name}</div>
</td></tr>
<tr><td style="padding:26px 28px 8px;${FONT};font-size:15px;line-height:1.65;color:#1b1f24">${body}</td></tr>
<tr><td style="padding:18px 28px 24px;${FONT};font-size:12px;line-height:1.5;color:#8a8f98;border-top:1px solid #eeeeef">
You're getting this because you registered for ${name}.</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendEmail({ to, subject, text, event, attachIcs = false, templateKey, attachments: extra = [] }) {
  const t = getTransporter();
  if (!t) {
    await EmailLog.create({ to, subject, templateKey, status: "skipped", error: "SMTP not configured" });
    return { ok: false, error: "SMTP not configured" };
  }
  try {
    const attachments = [...extra];
    if (attachIcs && event) {
      const value = icsFor(event);
      if (value) attachments.push({ filename: "workshop.ics", content: value, contentType: "text/calendar" });
    }
    await t.sendMail({ from: env.smtp.from, to, subject, text, html: toHtml(text, event), attachments });
    await EmailLog.create({ to, subject, templateKey, status: "sent" });
    return { ok: true };
  } catch (e) {
    await EmailLog.create({ to, subject, templateKey, status: "failed", error: e.message });
    return { ok: false, error: e.message };
  }
}

async function verifySmtp() {
  const t = getTransporter();
  if (!t) return { ok: false, error: "SMTP not configured" };
  try {
    await t.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendEmail, verifySmtp, toHtml };
