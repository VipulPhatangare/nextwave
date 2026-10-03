require("dotenv").config();

const num = (v, d) => (v !== undefined && v !== "" ? Number(v) : d);

module.exports = {
  port: num(process.env.PORT, 5000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ai-workshop",
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  adminEmail: process.env.ADMIN_EMAIL || "admin@example.com",
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  wa: {
    enabled: process.env.WA_ENABLED !== "false",
    clientId: process.env.WA_CLIENT_ID || "workshop-bot",
    botNumber: (() => {
      const d = (process.env.WA_BOT_NUMBER || "").replace(/\D/g, "");
      return d.length >= 11 ? d : ""; // placeholder/short numbers fall back to web links
    })(),
    minDelay: num(process.env.WA_MIN_DELAY_MS, 4000),
    maxDelay: num(process.env.WA_MAX_DELAY_MS, 10000),
    groupMinDelay: num(process.env.WA_GROUP_MIN_DELAY_MS, 20000),
    groupMaxDelay: num(process.env.WA_GROUP_MAX_DELAY_MS, 60000),
  },
  gemini: { apiKey: process.env.GEMINI_API_KEY || "" },
  smtp: {
    host: process.env.SMTP_HOST,
    port: num(process.env.SMTP_PORT, 465),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || "AI Workshop <no-reply@example.com>",
  },
};
