const mongoose = require("mongoose");
const { Schema } = mongoose;

const Event = mongoose.model(
  "Event",
  new Schema(
    {
      name: { type: String, default: "Build Your First AI Project in 60 Minutes" },
      slug: { type: String, default: "ai-project-60", unique: true },
      description: String,
      startAt: Date,
      durationMin: { type: Number, default: 60 },
      joinUrl: String,
      seatLimit: { type: Number, default: 600 },
      target: { type: Number, default: 500 },
      registrationOpen: { type: Boolean, default: true },
      settings: {
        // First message pre-typed when someone taps a WhatsApp link.
        startMessage: { type: String, default: "Hi! I want to register" },
        otpRequired: { type: Boolean, default: false },
        numberCheckMode: { type: String, enum: ["block", "warn", "off"], default: "warn" },
        quietHours: { start: { type: String, default: "22:00" }, end: { type: String, default: "08:00" } },
        quietHoursEnabled: { type: Boolean, default: true },
        sendingPaused: { type: Boolean, default: false },
        waDailyLimit: { type: Number, default: 800 },
        // during the workshop: WhatsApp messages from registered students go to the live Q&A board
        liveMode: { type: Boolean, default: false },
        // after the workshop: project submissions on WhatsApp, scored by AI
        projectsOpen: { type: Boolean, default: false },
        projectAutoApprove: { type: Number, default: 6 }, // AI score at or above this is approved automatically; 0 = review every one by hand
      },
    },
    { timestamps: true }
  )
);

const questionSchema = new Schema(
  {
    key: String,
    label: String,
    type: {
      type: String,
      enum: ["text", "longtext", "number", "email", "phone", "single", "multi", "yesno", "date"],
      default: "text",
    },
    required: { type: Boolean, default: false },
    channels: { type: [String], default: ["web", "whatsapp"] },
    options: [{ value: String, label: String }],
    validation: { min: Number, max: Number, regex: String },
    showIf: { key: String, equals: String },
    mapTo: String, // name | phone | email | college | branch
    placeholder: String,
    helpText: String,
    order: Number,
  },
  { _id: false }
);

const Form = mongoose.model(
  "Form",
  new Schema(
    {
      eventId: { type: Schema.Types.ObjectId, ref: "Event" },
      version: Number,
      isActive: { type: Boolean, default: false },
      questions: [questionSchema],
    },
    { timestamps: true }
  )
);

const Registration = mongoose.model(
  "Registration",
  new Schema(
    {
      eventId: { type: Schema.Types.ObjectId, ref: "Event", index: true },
      formVersion: Number,
      name: String,
      phone: String,
      waId: String,
      email: String,
      college: String,
      branch: String,
      answers: { type: Schema.Types.Mixed, default: {} },
      channel: { type: String, enum: ["web", "whatsapp", "manual"], default: "web" },
      sourceCode: { type: String, index: true },
      status: {
        type: String,
        enum: ["registered", "confirmed", "attended", "no_show", "cancelled"],
        default: "registered",
      },
      phoneVerified: { type: Boolean, default: false },
      certificateSentAt: Date,
      waVerified: Boolean,
      optedOutWa: { type: Boolean, default: false },
      optedOutEmail: { type: Boolean, default: false },
      confirmedYesAt: Date,
      attendedAt: Date,
      joinToken: String,
      // live quiz points during the workshop
      livePoints: { type: Number, default: 0 },
      // the project they submitted after the workshop (latest decision)
      project: { submissionId: Schema.Types.ObjectId, score: Number, status: String, verifiedAt: Date },
    },
    { timestamps: true }
  ).index({ eventId: 1, phone: 1 }, { unique: true })
);

const WaSession = mongoose.model(
  "WaSession",
  new Schema(
    {
      waId: { type: String, index: true },
      phone: String,
      step: { type: Number, default: 0 },
      answers: { type: Schema.Types.Mixed, default: {} },
      sourceCode: String,
      pushname: String,
      aiChecked: { type: Boolean, default: false },
      fixing: { type: [{ key: String, suggestion: String, problem: String }], default: [] },
      status: { type: String, enum: ["active", "done", "abandoned"], default: "active" },
      nudged: { type: Boolean, default: false },
      lastMessageAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
  )
);

const CampaignLink = mongoose.model(
  "CampaignLink",
  new Schema(
    {
      code: { type: String, unique: true, index: true },
      label: String,
      type: {
        type: String,
        enum: ["captain", "group", "instagram", "tpo", "linkedin", "other"],
        default: "other",
      },
      owner: String,
      clicks: { type: Number, default: 0 },
      registrations: { type: Number, default: 0 },
    },
    { timestamps: true }
  )
);

const WaGroup = mongoose.model(
  "WaGroup",
  new Schema(
    {
      groupId: { type: String, unique: true },
      name: String,
      participants: Number,
      tags: [String],
      linkCode: String,
      canSend: { type: Boolean, default: true },
      lastPostedAt: Date,
    },
    { timestamps: true }
  )
);

const Template = mongoose.model(
  "Template",
  new Schema({
    key: String,
    channel: { type: String, enum: ["whatsapp", "email"] },
    subject: String,
    body: String,
  }).index({ key: 1, channel: 1 }, { unique: true })
);

const Automation = mongoose.model(
  "Automation",
  new Schema({
    key: { type: String, unique: true },
    label: String,
    trigger: { type: String, enum: ["on_register", "before_event", "after_event", "abandoned"] },
    offsetMinutes: { type: Number, default: 0 },
    channels: [String],
    templateKey: String,
    enabled: { type: Boolean, default: true },
    sentCount: { type: Number, default: 0 },
  })
);

const Announcement = mongoose.model(
  "Announcement",
  new Schema(
    {
      title: String,
      body: String,
      subject: String,
      channels: [String],
      segment: {
        status: String,
        college: String,
        sourceCode: String,
      },
      mediaId: { type: Schema.Types.ObjectId, ref: "Media" },
      scheduledAt: Date,
      status: { type: String, enum: ["draft", "scheduled", "sending", "sent"], default: "draft" },
      stats: { total: { type: Number, default: 0 }, sent: { type: Number, default: 0 }, failed: { type: Number, default: 0 } },
    },
    { timestamps: true }
  )
);

const GroupBroadcast = mongoose.model(
  "GroupBroadcast",
  new Schema(
    {
      message: String,
      mediaId: { type: Schema.Types.ObjectId, ref: "Media" },
      groupIds: [String],
      scheduledAt: Date,
      status: { type: String, enum: ["queued", "sending", "done"], default: "queued" },
      results: [{ groupId: String, name: String, status: String, error: String, sentAt: Date }],
    },
    { timestamps: true }
  )
);

const MessageLog = mongoose.model(
  "MessageLog",
  new Schema(
    {
      waId: String,
      direction: { type: String, enum: ["in", "out"] },
      body: String,
      status: String,
      error: String,
      related: String,
    },
    { timestamps: true }
  )
);

const EmailLog = mongoose.model(
  "EmailLog",
  new Schema(
    { to: String, subject: String, templateKey: String, status: String, error: String },
    { timestamps: true }
  )
);

const NumberCheck = mongoose.model(
  "NumberCheck",
  new Schema({
    phone: { type: String, unique: true },
    onWhatsApp: Boolean,
    checkedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 },
  })
);

const Admin = mongoose.model(
  "Admin",
  new Schema({
    name: String,
    email: { type: String, unique: true },
    passwordHash: String,
    role: { type: String, enum: ["owner", "admin", "viewer"], default: "admin" },
  })
);

const AuditLog = mongoose.model(
  "AuditLog",
  new Schema({ adminEmail: String, action: String, details: String }, { timestamps: true })
);

const OtpCode = mongoose.model(
  "OtpCode",
  new Schema({
    phone: { type: String, index: true },
    codeHash: String,
    attempts: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    expiresAt: { type: Date, expires: 0 },
  })
);

const Media = mongoose.model(
  "Media",
  new Schema(
    {
      filename: String, // random name on disk
      original: String, // what the recipient sees
      mime: String,
      size: Number,
      kind: { type: String, enum: ["image", "pdf"] },
    },
    { timestamps: true }
  )
);

const KnowledgeEntry = mongoose.model(
  "KnowledgeEntry",
  new Schema(
    {
      title: String,
      content: String,
      tags: [String],
      enabled: { type: Boolean, default: true },
      source: { type: String, enum: ["manual", "ai"], default: "manual" },
    },
    { timestamps: true }
  )
);

// One document of AI settings. Every limit here exists to keep the Gemini bill predictable.
const AiConfig = mongoose.model(
  "AiConfig",
  new Schema(
    {
      enabled: { type: Boolean, default: false },
      model: { type: String, default: "gemini-3.1-flash-lite" },
      answerQuestions: { type: Boolean, default: true },
      checkAnswers: { type: Boolean, default: true },
      discloseAi: { type: Boolean, default: true },
      tone: { type: String, default: "Friendly, short and simple. Reply in the language the student writes in (English, Hindi, Marathi or Hinglish)." },
      extraInstructions: { type: String, default: "" },
      maxOutputTokens: { type: Number, default: 256 },
      maxInputChars: { type: Number, default: 400 },
      historyTurns: { type: Number, default: 2 },
      cacheHours: { type: Number, default: 24 },
      // limits for each student (the main control)
      perUserDaily: { type: Number, default: 8 },
      perUserMonthly: { type: Number, default: 60 },
      perUserMonthlyBudgetInr: { type: Number, default: 3 }, // 0 = off
      cooldownSec: { type: Number, default: 8 },
      // optional safety net across everyone; 0 = off
      globalDailyCalls: { type: Number, default: 0 },
      monthlyBudgetInr: { type: Number, default: 0 },
      limitsV2: { type: Boolean, default: false },
      kbSeeded: { type: Boolean, default: false },
      kbLiveSeeded: { type: Boolean, default: false }, // quiz + project answers added once
      usdPerMInput: { type: Number, default: 0.25 },
      usdPerMOutput: { type: Number, default: 1.5 },
      usdToInr: { type: Number, default: 88 },
    },
    { timestamps: true }
  )
);

const AiUsage = mongoose.model(
  "AiUsage",
  new Schema(
    {
      kind: { type: String, enum: ["chat", "check", "extract", "evaluate", "generate", "test"] },
      phone: { type: String, index: true },
      ok: Boolean,
      cached: { type: Boolean, default: false },
      blocked: String,
      error: String,
      tokensIn: { type: Number, default: 0 },
      tokensOut: { type: Number, default: 0 },
      costInr: { type: Number, default: 0 },
      ms: Number,
      question: String,
      answer: String,
    },
    { timestamps: true }
  ).index({ createdAt: -1 })
);

const AiHandoff = mongoose.model(
  "AiHandoff",
  new Schema(
    {
      phone: String,
      waId: String,
      name: String,
      question: String,
      reason: String,
      status: { type: String, enum: ["open", "resolved"], default: "open" },
    },
    { timestamps: true }
  )
);

const AiCache = mongoose.model(
  "AiCache",
  new Schema({ key: { type: String, unique: true }, answer: String, expiresAt: { type: Date, expires: 0 } })
);

const AiTurn = mongoose.model(
  "AiTurn",
  new Schema({ waId: { type: String, index: true }, role: String, text: String, expiresAt: { type: Date, expires: 0 } }, { timestamps: true })
);

// Which numbered menu a student was last shown, so a bare "1" or "2" means the right thing for the next 48 hours.
const WaContext = mongoose.model(
  "WaContext",
  new Schema({ waId: { type: String, unique: true }, menu: String, expiresAt: { type: Date, expires: 0 } })
);

// ---------- live session ----------
// A quiz question (has a correct option) or a poll (no correct option). Students answer by replying 1-4 on WhatsApp.
const LivePoll = mongoose.model(
  "LivePoll",
  new Schema(
    {
      question: String,
      options: [String],
      correct: { type: Number, default: null }, // index into options; null = poll
      timeLimitSec: { type: Number, default: 30 },
      status: { type: String, enum: ["draft", "live", "closed"], default: "draft" },
      order: { type: Number, default: 0 },
      openedAt: Date,
      closedAt: Date,
    },
    { timestamps: true }
  )
);

const LiveAnswer = mongoose.model(
  "LiveAnswer",
  new Schema(
    {
      pollId: { type: Schema.Types.ObjectId, index: true },
      regId: Schema.Types.ObjectId,
      name: String,
      college: String,
      choice: Number,
      correct: Boolean,
      points: { type: Number, default: 0 },
      ms: Number,
    },
    { timestamps: true }
  ).index({ pollId: 1, regId: 1 }, { unique: true })
);

const LiveQuestion = mongoose.model(
  "LiveQuestion",
  new Schema(
    {
      regId: Schema.Types.ObjectId,
      name: String,
      college: String,
      text: String,
      status: { type: String, enum: ["new", "answered", "hidden"], default: "new" },
      pinned: { type: Boolean, default: false },
    },
    { timestamps: true }
  )
);

// ---------- project submissions ----------
const ProjectSubmission = mongoose.model(
  "ProjectSubmission",
  new Schema(
    {
      regId: { type: Schema.Types.ObjectId, index: true },
      waId: String,
      name: String,
      college: String,
      link: String,
      note: String,
      imageFile: String, // in the uploads folder
      imageMime: String,
      status: { type: String, enum: ["evaluating", "evaluated", "approved", "rejected", "error"], default: "evaluating" },
      ai: {
        isProject: Boolean,
        works: Number, // 0-4
        usesAi: Number, // 0-3
        effort: Number, // 0-3
        score: Number, // 0-10
        summary: String,
        feedback: String,
      },
      error: String,
      reviewedBy: String,
      reviewedAt: Date,
    },
    { timestamps: true }
  )
);

module.exports = {
  LivePoll, LiveAnswer, LiveQuestion, ProjectSubmission,
  WaContext,
  Media, KnowledgeEntry, AiConfig, AiUsage, AiHandoff, AiCache, AiTurn,
  OtpCode,
  Event, Form, Registration, WaSession, CampaignLink, WaGroup,
  Template, Automation, Announcement, GroupBroadcast, MessageLog, EmailLog, NumberCheck, Admin, AuditLog,
};
