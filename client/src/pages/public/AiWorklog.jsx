import { useEffect } from "react";

// Public page: how AI was used while building this, and where its suggestions were changed or rejected.
const EXAMPLES = [
  {
    tag: "Product + Marketing",
    title: "WhatsApp registration link",
    prompt: "I'll market on Instagram and want students to register through WhatsApp. How do I make the links?",
    output: ["A wa.me link with a pre-typed message carrying a tracking code:", "“Hi! 👋 I'd like to register for Build Your First AI Project in 60 Minutes. (code: CLG-ABC)”"],
    changed: ["Rejected the visible code: it looked like spam in a class group, and students wouldn't trust it.", "The long wa.me link also looked messy in posts."],
    final: [
      "A clean message: “Hi! I want to register”.",
      "A short link per group or ambassador, e.g. nextwave.vipulphatangare.space/w/PCCOE, with a downloadable QR.",
      "Clicks counted per link; registrations tracked per college.",
    ],
  },
  {
    tag: "Product",
    title: "Controlling the AI chatbot's cost",
    prompt: "Add Gemini to answer students on WhatsApp, and limit usage so it doesn't cost too much.",
    output: ["One global daily call limit and a monthly budget for the whole bot, with a standard model and normal-length answers."],
    changed: ["One spammer could hit the global limit and switch the bot off for everyone.", "Asked for limits per user, a cheaper model and shorter answers."],
    final: [
      "Per-student limits: 8 a day, 60 a month and a ₹ cap, with a cooldown and a cache.",
      "The light gemini-3.1-flash-lite model with 1–2 sentence answers.",
      "No AI call for greetings; a person can take over in the WhatsApp inbox.",
    ],
  },
  {
    tag: "Product",
    title: "Confirmations and reminders",
    prompt: "After registration, send confirmations and reminders, and take a confirmation from the student before the workshop.",
    output: ["A funnel that asked for the phone number and showed “Question 1/3, 2/3”.", "A reminder saying “Reply YES to confirm your seat”, with STOP typed to opt out."],
    changed: ["WhatsApp already gives us the number, so asking for it is pointless.", "The counters felt like a form, and typing words on a phone is slow."],
    final: [
      "No phone question and no counters.",
      "One-tap replies: 1 I'll be there · 2 Can't make it · 3 Stop. The AI also understands free text like “kal nahi aa paunga”.",
      "Releasing a seat always asks again (1 Yes, release · 2 No, keep): AI never takes an irreversible action alone.",
    ],
  },
  {
    tag: "Marketing",
    title: "Budget and campaign plan",
    prompt: "Make a plan to get 500 registrations in 7 days with ₹2,000.",
    output: ["15 campus captains across many colleges, final-year students only, two Instagram page shoutouts, no paid ads, plus ₹250 for a new SIM and ₹150 as a buffer."],
    changed: ["Too spread out to manage in 7 days, and final-year only left too small a pool.", "I wanted a small paid test, and the SIM and buffer money brought no registrations."],
    final: [
      "5 IT-strong colleges, one campus ambassador each.",
      "2nd, 3rd and final-year students, with a message hook for each year.",
      "A ₹500 Instagram Click-to-WhatsApp ad as a top-up, stopped above ₹40 per registration.",
      "Budget: Ambassadors ₹1,150 (₹230 each, partly paid on results) · Ads ₹500 · Gemini ₹200 · Domain ₹150.",
    ],
  },
  {
    tag: "Marketing",
    title: "Marketing posters",
    prompt: "Give me 3 poster prompts for the campaign.",
    output: ["Prompts for background images only, with the advice to add all text later in Canva because image AI often misspells words."],
    changed: ["The posters are shared straight into WhatsApp groups, so each one must carry the full information and make sense on its own."],
    final: [
      "3 complete poster prompts with every line of text, its position and colours: a hero poster, a pain-point poster and a WhatsApp story poster.",
      "A blank square on each poster for the QR code, because AI can't make a working one. The real QR comes from the dashboard.",
      "Every poster is checked for the exact spelling of “Build Your First AI Project in 60 Minutes”.",
    ],
  },
];

function Step({ kind, label, children }) {
  return (
    <div className={`wl-step ${kind}`}>
      <div className="wl-step-label">{label}</div>
      <div className="wl-step-body">{children}</div>
    </div>
  );
}

const List = ({ items }) => (items.length === 1 ? <p>{items[0]}</p> : <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>);

export default function AiWorklog() {
  useEffect(() => {
    document.title = "AI Worklog · Build Your First AI Project in 60 Minutes";
  }, []);

  return (
    <div className="wl">
      <header className="wl-top">
        <a href="/" className="wl-brand"><span className="wl-mark" />Build Your First AI Project in 60 Minutes</a>
        <span className="wl-kicker">Growth Challenge</span>
      </header>

      <section className="wl-hero">
        <div className="wl-eyebrow">AI WORKLOG</div>
        <h1>How I used AI, and where I said no.</h1>
        <p>Five real examples from building the WhatsApp registration platform and the marketing plan. Each one shows the prompt, what the AI gave me, what I changed or rejected, and what shipped.</p>
        <nav className="wl-chips">
          {EXAMPLES.map((e, i) => (
            <a key={i} href={`#ex${i + 1}`}><b>{i + 1}</b>{e.title}</a>
          ))}
        </nav>
      </section>

      <main className="wl-list">
        {EXAMPLES.map((e, i) => (
          <article key={i} id={`ex${i + 1}`} className="wl-card">
            <div className="wl-card-head">
              <span className="wl-num">{String(i + 1).padStart(2, "0")}</span>
              <h2>{e.title}</h2>
              <span className={`wl-tag ${e.tag === "Marketing" ? "mk" : ""}`}>{e.tag}</span>
            </div>
            <div className="wl-flow">
              <Step kind="prompt" label="Prompt"><p className="wl-quote">“{e.prompt}”</p></Step>
              <Step kind="ai" label="AI output"><List items={e.output} /></Step>
              <Step kind="change" label="What I changed / rejected"><List items={e.changed} /></Step>
              <Step kind="final" label="Final output"><List items={e.final} /></Step>
            </div>
          </article>
        ))}
      </main>

      <section className="wl-rule">
        <p>My rule: if a suggestion added friction for students, made a promise we couldn't keep, or spent money away from the channel that actually brings registrations, <b>it didn't ship.</b></p>
      </section>

      <footer className="wl-foot">
        <a href="/">nextwave.vipulphatangare.space</a>
        <span>Prototype for the NxtWave Growth Challenge</span>
      </footer>
    </div>
  );
}
