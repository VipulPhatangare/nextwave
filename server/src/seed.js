const bcrypt = require("bcryptjs");
const env = require("./config/env");
const M = require("./models");

// WhatsApp: short, scannable, one clear action. Numbered replies match the bot's menus
// (CONFIRMATION -> "help" menu, T_MINUS_24H -> "reminder" menu, set in notify.service).
const WA = {
  CONFIRMATION: `✅ *You're in, {{name}}!*

*{{event_name}}*
Free live online workshop

📅 {{date}}
⏰ {{time}} ({{duration}})
💻 Just bring a laptop with internet

🎁 *You'll leave with*
• Your own working AI project
• A certificate for your resume and LinkedIn

Your personal join link comes here 1 hour before we start.

Reply:
*1* My registration
*2* Stop messages
*3* Talk to a person`,
  T_MINUS_24H: `⏳ *Tomorrow, {{name}}!*

*{{event_name}}*
📅 {{date}} · ⏰ {{time}}

Seats are limited, so please tell us:
*1* ✅ I'll be there
*2* ❌ Can't make it
*3* 🔕 Stop messages`,
  T_MINUS_1H: `⏰ *We start in 1 hour, {{name}}!*

*{{event_name}}* · {{time}}

👉 Your personal join link:
{{join_link}}

Join 5 minutes early with your laptop charged. Please don't share this link: it records your attendance for the certificate.`,
  T_MINUS_10M: `🔴 *Going live in 10 minutes!*

Tap to join, {{name}}:
{{join_link}}`,
  CERTIFICATE: `🎓 *Congratulations, {{name}}!*

You completed *{{event_name}}*. Your certificate is attached.

Post it on LinkedIn with what you built. It's a great first AI project for your resume 🚀`,
};

// Email: plain text with *bold*; email.service turns it into the branded HTML layout
// (a line that is only a link becomes a button).
const EMAIL = {
  CONFIRMATION: {
    subject: "You're registered ✅ {{event_name}} · {{date}}",
    body: `Hi {{name}},

You're registered for *{{event_name}}*, a free live online workshop.

*When:* {{date}}, {{time}} ({{duration}})
*Where:* Online, with your personal join link:
{{join_link}}

*What you'll walk away with*
• A working AI project you built yourself
• A certificate for your resume and LinkedIn

*Before the session*
• Keep a laptop with a stable internet connection ready
• Add the attached calendar invite so you don't miss it

We'll also remind you on WhatsApp before we start.

See you there!
The workshop team`,
  },
  T_MINUS_24H: {
    subject: "Tomorrow at {{time}}: {{event_name}}",
    body: `Hi {{name}},

*{{event_name}}* is tomorrow, {{date}} at {{time}}.

Seats are limited. Please confirm on WhatsApp by replying *1* to our reminder, or *2* if you can't make it, so we can give your seat to someone else.

Your personal join link:
{{join_link}}

See you tomorrow!
The workshop team`,
  },
  T_MINUS_1H: {
    subject: "Starting in 1 hour ⏰ your join link is inside",
    body: `Hi {{name}},

*{{event_name}}* starts in 1 hour, at {{time}}.

{{join_link}}

• Join 5 minutes early
• Keep your laptop charged and your internet on
• Please don't share this link: it records your attendance for the certificate

See you soon!
The workshop team`,
  },
  CERTIFICATE: {
    subject: "Your certificate 🎓 {{event_name}}",
    body: `Hi {{name}},

Congratulations on completing *{{event_name}}*! Your certificate is attached.

Post it on LinkedIn with a line about what you built. It's a great first AI project for your resume.

Thanks for building with us!
The workshop team`,
  },
};

// Earlier default texts. A template still holding one of these was never edited, so it's safe to upgrade.
const OLD_WA = {
  CONFIRMATION: [`Hi {{name}}! ✅ You're registered for
*{{event_name}}* (Free Online Workshop)

📅 {{date}} · {{time}} · {{duration}} · Online
💻 Just bring a laptop, no setup needed
🎓 Leave with a working AI project + certificate

Reply STOP to stop messages.`],
  T_MINUS_24H: [
    "Hi {{name}}! Tomorrow at {{time}} is *{{event_name}}* 🚀\nReply YES to confirm your seat.",
    `Hi {{name}}! Tomorrow at {{time}} is *{{event_name}}* 🚀

Reply:
*1* ✅ I'll be there
*2* ❌ Can't make it
*3* 🔕 Stop messages`,
  ],
  T_MINUS_1H: [`⏰ {{name}}, we start in 1 hour!
*{{event_name}}* · {{time}}
Join here: {{join_link}}`],
  T_MINUS_10M: [`🔴 Going live in 10 minutes, {{name}}!
Join now: {{join_link}}`],
  CERTIFICATE: [`🎓 Congratulations {{name}}!
Here's your certificate for *{{event_name}}*.

Share it on LinkedIn and tag us.`],
};
const OLD_EMAIL_BODY = {
  CONFIRMATION: `Hi {{name}},

You're registered for *{{event_name}}*, a free online workshop.

When: {{date}} at {{time}} ({{duration}})
Where: Online. Join link: {{join_link}}
What you'll get: a working AI project and a certificate.

A calendar invite is attached, so you won't miss it.

See you there!`,
  T_MINUS_24H: `Hi {{name}},

A quick reminder: *{{event_name}}* is tomorrow at {{time}}.
Join link: {{join_link}}

See you there!`,
  T_MINUS_1H: `Hi {{name}},

We start in 1 hour. Join here: {{join_link}}`,
  CERTIFICATE: `Hi {{name}},

Congratulations! Your certificate for *{{event_name}}* is attached.
Share it on LinkedIn and tag us.`,
};

// Even older defaults from when referrals existed. {{referral_link}} now renders empty, so these must go.
const REFERRAL_ERA = {
  whatsapp: {
    CONFIRMATION: `Hi {{name}}! ✅ You're registered for
*{{event_name}}* (Free Online Workshop)

📅 {{date}} · {{time}} · {{duration}} · Online
💻 Just bring a laptop, no setup needed
🎓 Leave with a working AI project + certificate

Invite your project team: {{referral_link}}
When 2 friends join, you unlock a priority certificate.

Reply STOP to stop messages.`,
    CERTIFICATE: `🎓 Congratulations {{name}}!
Here's your certificate for *{{event_name}}*.

Share it on LinkedIn and tag us. Your friends can join the next batch with your link: {{referral_link}}`,
  },
  email: {
    CONFIRMATION: `Hi {{name}},

You're registered for *{{event_name}}*, a free online workshop.

When: {{date}} at {{time}} ({{duration}})
Where: Online. Join link: {{join_link}}
What you'll get: a working AI project and a certificate.

A calendar invite is attached, so you won't miss it.

Bring your project team: {{referral_link}}

See you there!`,
    CERTIFICATE: `Hi {{name}},

Congratulations! Your certificate for *{{event_name}}* is attached.
Share it on LinkedIn and tag us. Your friends can join the next batch with your link: {{referral_link}}`,
  },
};

const AUTOMATIONS = [
  { key: "CONFIRMATION", label: "Confirmation after registration", trigger: "on_register", offsetMinutes: 0, channels: ["whatsapp", "email"], templateKey: "CONFIRMATION" },
  { key: "T_MINUS_24H", label: "24 hours before (reply 1 / 2 / 3)", trigger: "before_event", offsetMinutes: 1440, channels: ["whatsapp", "email"], templateKey: "T_MINUS_24H" },
  { key: "T_MINUS_1H", label: "1 hour before (join link)", trigger: "before_event", offsetMinutes: 60, channels: ["whatsapp", "email"], templateKey: "T_MINUS_1H" },
  { key: "T_MINUS_10M", label: "10 minutes before", trigger: "before_event", offsetMinutes: 10, channels: ["whatsapp"], templateKey: "T_MINUS_10M" },
];

// Starter answers for the WhatsApp assistant. Only facts this platform really does; edit or add more in AI assistant > Knowledge.
const KNOWLEDGE = [
  { title: "Who is the workshop for?", content: "It is for final-year engineering students.", tags: ["audience"] },
  { title: "How do I register?", content: "Send any message here on WhatsApp and reply 1, or use the registration page. It takes under a minute: your name, college and, if you like, your email.", tags: ["register"] },
  { title: "What do I need to join?", content: "A laptop with internet. Your personal join link comes on WhatsApp and email before the start.", tags: ["requirements"] },
  { title: "When do I get the join link and reminders?", content: "Your personal join link is in your confirmation email and in the WhatsApp reminders 1 hour and 10 minutes before the start. A 24-hour reminder asks you to reply 1 to confirm your seat.", tags: ["link", "reminder"] },
  { title: "How do I confirm my seat?", content: "About a day before, reply 1 to our WhatsApp reminder. Reply 2 if you can't make it.", tags: ["confirm"] },
  { title: "How do I get my certificate?", content: "Everyone who attends gets a certificate on WhatsApp and email after the workshop. Join through your personal link so your attendance is recorded.", tags: ["certificate", "attendance"] },
  { title: "What can I type to this number?", content: "Reply HELP for options: 1 shows your registration, 2 stops messages, 3 connects you to a person. You can also just type STOP.", tags: ["commands", "help"] },
  { title: "Are seats limited?", content: "Yes. Registration closes when the seats are full.", tags: ["seats"] },
  { title: "How do you use my phone number?", content: "Only for workshop updates on WhatsApp and email. Reply STOP any time to stop them.", tags: ["privacy"] },
];

// Starter answers that mentioned typing YES / JOIN. Upgraded only if still unedited.
const OLD_KNOWLEDGE = {
  "How do I register?": "Reply JOIN here on WhatsApp, or use the registration page. It takes under a minute: your name, college and, if you like, your email.",
  "When do I get the join link and reminders?": "Your personal join link is in your confirmation email and in the WhatsApp reminders 1 hour and 10 minutes before the start. A 24-hour reminder asks you to reply YES to confirm.",
  "How do I confirm my seat?": "About a day before, reply YES to our WhatsApp reminder.",
  "What can I type to this number?": "STATUS shows your registration, HELP lists options, STOP stops messages and START turns them back on.",
};

const QUESTIONS = [
  { key: "name", label: "What's your full name?", type: "text", required: true, channels: ["web", "whatsapp"], mapTo: "name", placeholder: "e.g. Ananya Sharma", order: 0 },
  { key: "phone", label: "WhatsApp number", type: "phone", required: true, channels: ["web"], mapTo: "phone", placeholder: "98765 43210", order: 1 },
  { key: "college", label: "Which college are you from?", type: "text", required: true, channels: ["web", "whatsapp"], mapTo: "college", placeholder: "e.g. ABC Institute of Engineering", order: 2 },
  { key: "email", label: "Your email (for the calendar invite and certificate)", type: "email", required: false, channels: ["web", "whatsapp"], mapTo: "email", placeholder: "you@gmail.com", order: 3 },
];

async function seed() {
  if (!(await M.Admin.exists({ email: env.adminEmail.toLowerCase() }))) {
    await M.Admin.create({
      name: "Owner",
      email: env.adminEmail.toLowerCase(),
      passwordHash: await bcrypt.hash(env.adminPassword, 10),
      role: "owner",
    });
    console.log(`Seed: admin created (${env.adminEmail})`);
  }

  let event = await M.Event.findOne();
  if (!event) {
    const start = new Date();
    start.setDate(start.getDate() + 8);
    start.setUTCHours(13, 30, 0, 0); // 7:00 PM IST
    event = await M.Event.create({
      name: "Build Your First AI Project in 60 Minutes",
      description: "A free online workshop for final-year engineering students. Build a working AI project live and get a certificate.",
      startAt: start,
      joinUrl: "",
    });
    console.log("Seed: workshop created");
  }

  if (["Hi! 👋 I'd like to register for *{{event_name}}*. (code: {{code}})", "Hi! 👋 I'd like to register for *{{event_name}}*."].includes(event.settings?.startMessage)) {
    event.settings.startMessage = "Hi! I want to register";
    await event.save();
  }

  if (!(await M.Form.exists({ eventId: event._id }))) {
    await M.Form.create({ eventId: event._id, version: 1, isActive: true, questions: QUESTIONS });
    console.log("Seed: default form created");
  }

  for (const [key, body] of Object.entries(WA)) {
    await M.Template.updateOne({ key, channel: "whatsapp" }, { $setOnInsert: { key, channel: "whatsapp", body } }, { upsert: true });
  }
  for (const [key, olds] of Object.entries(OLD_WA)) {
    const legacy = REFERRAL_ERA.whatsapp[key] ? [REFERRAL_ERA.whatsapp[key]] : [];
    await M.Template.updateOne({ key, channel: "whatsapp", body: { $in: [...olds, ...legacy] } }, { body: WA[key] });
  }
  await M.Automation.updateOne({ key: "T_MINUS_24H", label: "24 hours before (Reply YES)" }, { label: "24 hours before (reply 1 / 2 / 3)" });
  for (const [key, t] of Object.entries(EMAIL)) {
    await M.Template.updateOne({ key, channel: "email" }, { $setOnInsert: { key, channel: "email", subject: t.subject, body: t.body } }, { upsert: true });
    await M.Template.updateOne({ key, channel: "email", body: { $in: [OLD_EMAIL_BODY[key], REFERRAL_ERA.email[key]].filter(Boolean) } }, { subject: t.subject, body: t.body });
  }
  for (const a of AUTOMATIONS) {
    await M.Automation.updateOne({ key: a.key }, { $setOnInsert: a }, { upsert: true });
  }
  const aiCfg = (await M.AiConfig.findOne()) || (await M.AiConfig.create({}));
  if (!aiCfg.kbSeeded) {
    if ((await M.KnowledgeEntry.countDocuments()) === 0) {
      await M.KnowledgeEntry.insertMany(KNOWLEDGE.map((k) => ({ ...k, source: "manual" })));
      console.log(`Seed: ${KNOWLEDGE.length} starter knowledge entries added for the WhatsApp assistant`);
    }
    aiCfg.kbSeeded = true;
    await aiCfg.save();
  }
  for (const [title, old] of Object.entries(OLD_KNOWLEDGE)) {
    const next = KNOWLEDGE.find((k) => k.title === title).content;
    await M.KnowledgeEntry.updateOne({ title, content: old }, { content: next });
  }

  await removeLegacyData();
}

// Referrals, coupons, payments, the live session and project review were removed. Clean up what an older database still holds.
async function removeLegacyData() {
  // The unique index on referralCode would reject every new registration (they all have no code).
  await M.Registration.collection.dropIndex("referralCode_1").catch(() => {});
  await M.Registration.collection.updateMany({}, { $unset: { referralCode: "", referredBy: "", referralCount: "", payment: "" } });
  await M.WaSession.collection.updateMany({}, { $unset: { referredBy: "", couponCode: "" } });
  await M.Event.collection.updateMany({}, { $unset: { pricing: "" } });
  await M.Template.deleteMany({ key: { $in: ["REF_PROGRESS", "PAYMENT_LINK"] } });
  await M.Automation.deleteMany({ key: "REF_PROGRESS" });
  for (const name of ["referrals", "rewardrules", "coupons"]) {
    await M.Event.db.dropCollection(name).catch(() => {});
  }

  await M.Registration.collection.updateMany({}, { $unset: { livePoints: "", project: "" } });
  await M.Event.collection.updateMany({}, { $unset: { "settings.liveMode": "", "settings.projectsOpen": "", "settings.projectAutoApprove": "" } });
  await M.AiConfig.collection.updateMany({}, { $unset: { kbLiveSeeded: "" } });
  await M.KnowledgeEntry.deleteMany({ title: { $in: ["How do the quizzes during the workshop work?", "How do I submit my project?"] } });
  await M.Template.deleteMany({ key: "PROJECT_INVITE" });
  for (const name of ["livepolls", "liveanswers", "livequestions", "projectsubmissions"]) {
    await M.Event.db.dropCollection(name).catch(() => {});
  }
}

module.exports = { seed };

if (require.main === module) {
  require("mongoose")
    .connect(env.mongoUri)
    .then(seed)
    .then(() => {
      console.log("Seed complete");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
