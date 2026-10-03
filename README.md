# Build Your First AI Project in 60 Minutes: registration and growth system

A MERN + MongoDB system that registers students through a **landing page** and a **WhatsApp bot** (whatsapp-web.js), sends **WhatsApp + email confirmations and reminders** (Nodemailer + calendar invite), and gives the team an **admin dashboard** to control everything.

Both doors go through one registration engine (`server/src/services/registration.service.js`), so a student registered on the web or on WhatsApp is treated identically.

## What's built

| Area | What it does |
|---|---|
| Landing page (`/`, `/r/:code`) | Dynamic form from the form builder, live "is this on WhatsApp?" check (cached + rate limited), source tracking, WhatsApp shortcut on success |
| WhatsApp bot | Registers students in chat (`JOIN <code>`), asks the same questions as the web form, `STOP/START/STATUS/RESTART/HELP/YES` commands, abandoned-flow nudge after 2h |
| Form builder | Add/reorder questions, required/optional, per-channel (web / WhatsApp), choices, min/max validation, conditional questions, saved as versions, web + chat preview |
| Messaging | Templates with `{{variables}}`, WhatsApp via a rate-limited queue (random delays, daily cap, 2h expiry), email with `.ics`, quiet hours, kill switch, opt-outs |
| Automations | Confirmation, 24h / 1h / 10min reminders (Agenda jobs in MongoDB, survive restarts) |
| Announcements | WhatsApp, email or both, to a segment (status, college, source), send now or scheduled |
| Group broadcast | Sync your WhatsApp groups, pick groups, send one at a time with a random gap, per-group tracked link |
| WhatsApp inbox | Read/reply from the dashboard, "take over" to pause the bot in a chat |
| Dashboard | Live counters, per-day chart, funnel, top sources/colleges, registrations table (filters, drawer, bulk status, CSV export, manual add), campaign links + QR, logs, admin activity log |
| Attendance and certificates | Personal join link marks attendance, PDF certificates by WhatsApp and email |
| Attachments | Send images and PDFs from the inbox, group broadcasts and announcements (email gets them as attachments) |
| AI assistant (Gemini) | Answers student questions on WhatsApp from a knowledge base you manage, double-checks registration answers, drafts announcements and FAQ entries. Hard cost limits: monthly rupee budget, daily call cap, per-student cap and cooldown, answer cache, shortcuts that skip the model |
| Team | Owner / admin / view-only accounts |

**Not built yet:** Google Sheets sync and A/B testing of messages.

## Run it

Requirements: Node 18+, MongoDB running locally (or an Atlas URI), Chrome (puppeteer downloads one with whatsapp-web.js).

```bash
# 1. API
cd server
cp .env.example .env        # then edit it
npm install
npm run dev                 # seeds the workshop, form, templates and admin on first start

# 2. Dashboard + landing page
cd ../client
npm install
npm run dev                 # http://localhost:5180  (proxies /api to :5055)
```

- Landing page: http://localhost:5180
- Admin: http://localhost:5180/admin (login = `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`; **change the defaults**)

### Connect WhatsApp
1. In `server/.env` set `WA_ENABLED=true` and `WA_BOT_NUMBER` (digits with country code, e.g. `919876543210`).
2. Restart the API. Open **Admin → Settings → WhatsApp connection** and scan the QR with the bot phone (WhatsApp → Linked devices). Use a **dedicated number**, not your personal one.
3. The session is saved in MongoDB, so you won't scan again after restarts.

### Connect Gemini (optional)
Add `GEMINI_API_KEY` to `server/.env`, restart, then open **AI assistant**: add knowledge entries, set the cost limits, press **Models for my key** to pick a model, and switch the assistant on. It stays off until you do. Costs shown are estimates from token counts and the prices you enter in Settings.

### Connect email
Set `SMTP_*` in `.env` (for Gmail: 2-step verification + an App Password, ~500 emails/day), then use **Settings → Test email connection**.

## Safety notes

- `whatsapp-web.js` is unofficial. Bulk messaging can get a number banned. The system only messages people who messaged first or registered, uses random delays, a daily cap, quiet hours and a kill switch. For production scale, move the send layer to the official WhatsApp Cloud API; the rest of the system stays the same.
- Only post in groups you belong to and where promotion is welcome. Don't post in the same group repeatedly.
- The bot runs headless Chrome, so the API must stay running for WhatsApp to work.
- Phone numbers are personal data: keep the consent line on the form and honour `STOP`.

## Layout

```
server/src/
  models/            all Mongoose schemas
  services/          registration engine, templates, notify, email, announcements
  whatsapp/          client, send queue, bot router, conversation flow, groups
  jobs/agenda.js     scheduled jobs
  routes/            public.routes.js, admin.routes.js
  seed.js            first-run data (workshop, form, templates, automations)
client/src/
  pages/public/      Landing
  pages/admin/       Overview, Registrations, FormBuilder, Links, Groups, Inbox, Announcements, Automations, Settings
```
