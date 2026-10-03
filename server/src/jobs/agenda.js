const Agenda = require("agenda");
const env = require("../config/env");
const runtime = require("../runtime");
const { Registration, WaSession } = require("../models");
const { notify } = require("../services/notify.service");
const { sendAnnouncement } = require("../services/announcement.service");
const { runBroadcast } = require("../whatsapp/groups");
const { enqueue } = require("../whatsapp/sendQueue");

async function initAgenda() {
  const agenda = new Agenda({ db: { address: env.mongoUri, collection: "agendaJobs" } });

  agenda.define("notify", async (job) => {
    const { registrationId, templateKey, channels } = job.attrs.data;
    const reg = await Registration.findById(registrationId);
    if (!reg || reg.status === "cancelled") return;
    await notify({ registration: reg, templateKey, channels });
  });

  agenda.define("send-announcement", async (job) => {
    await sendAnnouncement(job.attrs.data.id);
  });

  agenda.define("group-broadcast", async (job) => {
    await runBroadcast(job.attrs.data.id);
  });

  // One gentle nudge for people who stopped halfway through the WhatsApp flow.
  agenda.define("abandoned-check", async () => {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const stale = await WaSession.find({ status: "active", nudged: false, lastMessageAt: { $lt: cutoff } });
    for (const s of stale) {
      s.nudged = true;
      await s.save();
      enqueue({
        chatId: s.waId,
        body: "You're almost there! 🙌 Just reply to the last question to lock your free seat. (Reply STOP to stop messages.)",
        related: "abandoned",
      }).catch(() => {});
    }
  });

  await agenda.start();
  await agenda.every("30 minutes", "abandoned-check");
  runtime.agenda = agenda;
  return agenda;
}

module.exports = { initAgenda };
