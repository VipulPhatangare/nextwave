const runtime = require("../runtime");
const { Event, Template, Registration, Automation } = require("../models");
const { buildVars, render } = require("./template.service");
const { sendEmail } = require("./email.service");
const { enqueue } = require("../whatsapp/sendQueue");

function inQuietHours(event) {
  const s = event.settings;
  if (!s?.quietHoursEnabled) return null;
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const [sh, sm] = s.quietHours.start.split(":").map(Number);
  const [eh, em] = s.quietHours.end.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const quiet = start > end ? mins >= start || mins < end : mins >= start && mins < end;
  if (!quiet) return null;
  // time (in minutes from now) until quiet hours end
  let wait = end - mins;
  if (wait <= 0) wait += 24 * 60;
  return new Date(Date.now() + wait * 60000);
}

// Send a template to one registration over the given channels.
// opts.force skips quiet hours (used for instant confirmations triggered by the student).
async function notify({ registration, templateKey, channels, force = false, extraVars = {} }) {
  const event = await Event.findOne();
  if (!event || event.settings.sendingPaused) return { skipped: "paused" };

  if (!force) {
    const resumeAt = inQuietHours(event);
    if (resumeAt && runtime.agenda) {
      await runtime.agenda.schedule(resumeAt, "notify", {
        registrationId: String(registration._id),
        templateKey,
        channels,
      });
      return { skipped: "quiet-hours", resumeAt };
    }
  }

  const vars = buildVars(event, registration, extraVars);
  const results = {};

  if (channels.includes("whatsapp") && !registration.optedOutWa && registration.waId) {
    const tpl = await Template.findOne({ key: templateKey, channel: "whatsapp" });
    if (tpl) {
      enqueue({ chatId: registration.waId, body: render(tpl.body, vars), related: templateKey }).catch(() => {});
      results.whatsapp = "queued";
      const menu = { T_MINUS_24H: "reminder", CONFIRMATION: "help" }[templateKey];
      if (menu) require("../whatsapp/intents").setMenu(`reg:${registration._id}`, menu);
    }
  }

  if (channels.includes("email") && !registration.optedOutEmail && registration.email) {
    const tpl = await Template.findOne({ key: templateKey, channel: "email" });
    if (tpl) {
      const r = await sendEmail({
        to: registration.email,
        subject: render(tpl.subject, vars),
        text: render(tpl.body, vars),
        event,
        attachIcs: templateKey === "CONFIRMATION",
        templateKey,
      });
      results.email = r.ok ? "sent" : r.error;
    }
  }

  const delivered = results.whatsapp === "queued" || results.email === "sent";
  if (delivered) await Automation.updateOne({ key: templateKey }, { $inc: { sentCount: 1 } });
  return results;
}

module.exports = { notify, inQuietHours };
