import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { pub } from "../../api.js";

// Only two icons on the page: WhatsApp (brand recognition) and the FAQ toggle.
const ChevronDownIcon = () => (
  <svg className="l-faq-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

function visible(q, answers) {
  if (!q.showIf || !q.showIf.key) return true;
  const a = answers[q.showIf.key];
  const v = Array.isArray(a) ? a.join(",") : String(a ?? "");
  return v === String(q.showIf.equals);
}

function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, ended: false });

  useEffect(() => {
    if (!targetDate) return;
    const target = new Date(targetDate).getTime();

    const update = () => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, ended: true });
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setTimeLeft({ days, hours, minutes, seconds, ended: false });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
}

const FAQ_LIST = [
  {
    q: "Are there any prerequisites or prior AI background required?",
    a: "No prior background in machine learning or AI is required. Basic familiarity with general programming concepts is helpful, but the session is designed so that any engineering student can follow along line-by-line. All starter templates, API connections, and cloud development environments are provided."
  },
  {
    q: "Is the workshop genuinely free? Are there any hidden fees?",
    a: "Yes, registration is 100% free. You receive full access to the live masterclass, starter repositories, deployment guides, and the digital certificate of completion without any payment."
  },
  {
    q: "What exact project and architecture will we build?",
    a: "You will build IntelliDoc AI — a production-grade Document Intelligence and RAG (Retrieval-Augmented Generation) application. Users can upload technical documents (specifications, research papers, or syllabus PDFs) and perform natural-language queries that return precise, cited answers with similarity scores. The app is deployed to a public cloud URL via Streamlit Community Cloud."
  },
  {
    q: "Can this project be submitted for university mini-projects and campus placements?",
    a: "Yes. The workshop includes a standardized, university-ready Project Documentation Report (DOCX/PDF) containing system architecture diagrams, data flow specifications, viva defense questions, and GitHub repository guidelines formatted specifically for placement interviews."
  },
  {
    q: "What hardware or system setup do I need?",
    a: "No specialized hardware or local GPU is needed. The entire build pipeline executes in the cloud through managed LLM endpoints. All you need is a computer or laptop with an internet connection and a modern browser (Google Chrome, Microsoft Edge, or Brave)."
  },
  {
    q: "How and when will the live session link be delivered?",
    a: "Upon completing registration, you receive an automated confirmation message on WhatsApp (and email if provided). Scheduled calendar reminders with the direct Google Meet / Zoom link are automatically dispatched 24 hours, 1 hour, and 10 minutes prior to the live session."
  },
  {
    q: "What if I have an exam or scheduling conflict during the live session?",
    a: "While live participation is recommended for the hands-on deployment and live mentor Q&A, all registered attendees receive the session recording, code repository, and documentation templates via WhatsApp."
  }
];

const CURRICULUM = [
  {
    time: "00:00 – 00:10",
    title: "Core GenAI Architecture & API Ingestion",
    desc: "Understanding LLM inference pipelines, tokenization mechanics, context windows, and secure REST API authentication without theoretical bloat."
  },
  {
    time: "00:10 – 00:25",
    title: "Prompt Engineering & Schema Enforcement",
    desc: "Designing deterministic system prompts, implementing few-shot constraints, and enforcing structured JSON outputs for reliable downstream consumption."
  },
  {
    time: "00:25 – 00:45",
    title: "Document Ingestion & RAG Vector Pipeline",
    desc: "Splitting PDF documents into text chunks, generating vector embeddings, executing cosine similarity search, and generating context-grounded citations."
  },
  {
    time: "00:45 – 00:55",
    title: "Cloud Deployment & Public Production URL",
    desc: "Packaging the Python application and publishing it live to Streamlit Community Cloud. Generate a public web link accessible from any browser."
  },
  {
    time: "00:55 – 01:00",
    title: "Portfolio Integration, Viva Prep & Q&A",
    desc: "Structuring your GitHub repository, drafting technical README documentation, answering common placement viva questions, and open floor Q&A."
  }
];

const TAKEAWAYS = [
  {
    title: "Verifiable Certificate",
    desc: "A digital certificate of completion with a cryptographic verification ID suitable for LinkedIn and university project dossiers."
  },
  {
    title: "Production Repository",
    desc: "Complete, modular Python source code with clean architecture, requirements, and MIT open-source licensing."
  },
  {
    title: "University Project Report",
    desc: "A formatted DOCX/PDF project report template complete with system architecture diagrams, data flow charts, and sample viva questions."
  },
  {
    title: "WhatsApp Engineering Group",
    desc: "Direct access to an active community of 4,500+ student developers sharing hackathons, placement opportunities, and project feedback."
  }
];

const ARCH_STEPS = [
  { stage: "INGEST", title: "Document parsing", desc: "PDF text extraction and recursive chunking." },
  { stage: "EMBED", title: "Vector index", desc: "Dense semantic embeddings stored in FAISS." },
  { stage: "RETRIEVE", title: "Context injection", desc: "Similarity search grounds the prompt." },
  { stage: "DEPLOY", title: "Cloud endpoint", desc: "Public URL on Streamlit Community Cloud." }
];

const PILLARS = [
  { title: "100% practical", desc: "No slides-only theory. You write and run live Python alongside the mentor." },
  { title: "Deployed publicly", desc: "Your app goes live on a public URL you can show recruiters and examiners." },
  { title: "Verifiable certificate", desc: "A signed certificate with a unique credential link for LinkedIn." },
  { title: "Complete GitHub repo", desc: "Clean starter code, documentation templates and viva questions." }
];

const WHY = [
  { title: "Production RAG architecture", desc: "Learn the retrieval-augmented generation workflow used in industry: connect a live LLM, vectorise documents and cut hallucinations with grounded context." },
  { title: "Zero local setup", desc: "No GPU or CUDA install. The whole stack runs on managed cloud APIs from your browser." },
  { title: "Reminders handled for you", desc: "Instant WhatsApp confirmation, a calendar invite, and reminders before the session starts." },
  { title: "Portfolio-ready output", desc: "A working deployment and a documented repository for placements, interviews and university reviews." }
];

const TESTIMONIALS = [
  {
    name: "Rohan Varma",
    college: "Anna University · Computer Science (3rd Year)",
    avatar: "RV",
    quote: "We deployed the IntelliDoc AI project as our semester mini-project. The external viva examiner noted the public cloud link and citation capability. Concrete, hands-on learning."
  },
  {
    name: "Pooja Deshmukh",
    college: "VTU Belagavi · Information Science (Final Year)",
    avatar: "PD",
    quote: "I had previously read about RAG and LLMs, but this was the first time I actually wired the vector store to a live UI and deployed it to the web. Added straight to my placement resume."
  },
  {
    name: "Aman Shaikh",
    college: "Mumbai University · Information Technology (2nd Year)",
    avatar: "AS",
    quote: "The automated WhatsApp reminders and calendar sync made it very convenient. The code was exceptionally well-commented and easy to adapt for other datasets."
  }
];

export default function Landing() {
  const { code } = useParams();
  const sourceCode = code ? code.toUpperCase() : undefined;

  const [event, setEvent] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [phoneState, setPhoneState] = useState(null);
  const checked = useRef({});

  const [otp, setOtp] = useState({ sent: false, code: "", token: null, busy: false, msg: "", err: "" });

  // Developer workbench tab: 'preview' | 'code' | 'arch'
  const [activeTab, setActiveTab] = useState("preview");
  const [openFaq, setOpenFaq] = useState({ 0: true });

  const countdown = useCountdown(event?.startAt);

  useEffect(() => {
    pub.get(`/event${sourceCode ? `?code=${sourceCode}` : ""}`).then(setEvent).catch(() => setFormError("Unable to load workshop details. Please refresh the page."));
    pub.get("/form?channel=web").then((d) => setQuestions(d.questions));
    if (sourceCode) pub.post(`/links/${sourceCode}/click`, {}).catch(() => {});
  }, [sourceCode]);

  const phoneQ = questions.find((q) => q.mapTo === "phone");
  const phoneValue = phoneQ ? (answers[phoneQ.key] || "").trim() : "";

  const set = (key, value) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    if (phoneQ && key === phoneQ.key) setOtp({ sent: false, code: "", token: null, busy: false, msg: "", err: "" });
  };

  async function checkPhone() {
    const v = phoneValue;
    if (!v || event?.numberCheckMode === "off") return setPhoneState(null);
    if (checked.current[v]) return setPhoneState(checked.current[v]);
    try {
      const r = await pub.post("/check-whatsapp", { phone: v });
      let s;
      if (!r.valid) s = { kind: "err", msg: "Invalid phone number format." };
      else if (r.onWhatsApp === true) s = { kind: "ok", msg: "WhatsApp number verified" };
      else if (r.onWhatsApp === false) s = { kind: event.numberCheckMode === "block" ? "err" : "warn", msg: "This number is not registered on WhatsApp. Please use your WhatsApp number to receive session credentials." };
      else s = null;
      checked.current[v] = s;
      setPhoneState(s);
    } catch (_) {
      setPhoneState(null);
    }
  }

  async function sendOtp() {
    setOtp((o) => ({ ...o, busy: true, err: "", msg: "" }));
    try {
      await pub.post("/otp/send", { phone: phoneValue });
      setOtp((o) => ({ ...o, sent: true, busy: false, msg: "A 6-digit verification code has been dispatched to WhatsApp." }));
    } catch (e) {
      setOtp((o) => ({ ...o, busy: false, err: e.message }));
    }
  }

  async function verifyOtp() {
    setOtp((o) => ({ ...o, busy: true, err: "" }));
    try {
      const r = await pub.post("/otp/verify", { phone: phoneValue, code: otp.code });
      setOtp((o) => ({ ...o, busy: false, token: r.token, msg: "", err: "" }));
    } catch (e) {
      setOtp((o) => ({ ...o, busy: false, err: e.message }));
    }
  }

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      const body = { phone: phoneValue, answers, sourceCode, otpToken: otp.token };
      const r = await pub.post("/register", body);
      setDone(r);
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const scrollToRegister = () => {
    const el = document.getElementById("register-section");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const toggleFaq = (idx) => {
    setOpenFaq((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (!event) {
    return (
      <div className="landing" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <div className="l-brand-mark" style={{ width: 14, height: 36 }} />
          <p style={{ color: "#a1a1aa", fontSize: 15 }}>{formError || "Initializing workshop data…"}</p>
        </div>
      </div>
    );
  }

  const needOtp = event.otpRequired && !otp.token;

  // Capacity calculations
  const totalSeats = (event.registered || 0) + (event.seatsLeft || 0);
  const claimedPercent = totalSeats > 0 ? Math.min(100, Math.round(((event.registered || 0) / totalSeats) * 100)) : 84;

  return (
    <div className="landing">
      {/* Fixed Navigation Bar */}
      <nav className="l-nav">
        <div className="l-nav-inner">
          <a href="#" className="l-brand">
            <span className="l-brand-mark" />
            <span className="l-brand-name">Next Wave</span>
          </a>

          <div className="l-nav-links">
            <a href="#workbench" className="l-nav-link">The project</a>
            <a href="#about-project" className="l-nav-link">Why attend</a>
            <a href="#curriculum" className="l-nav-link">Syllabus</a>
            <a href="#deliverables" className="l-nav-link">Deliverables</a>
            <a href="#faqs" className="l-nav-link">FAQs</a>
          </div>

          <button type="button" className="l-nav-cta" onClick={scrollToRegister}>
            Reserve seat
          </button>
        </div>
      </nav>

      {/* Hero: copy on the left, framed photo on the right */}
      <header className="l-hero">
        <div className="l-container l-hero-inner">
          <div className="l-hero-copy">
          <span className="l-eyebrow">Next Wave Masterclass · Live online session</span>

          <h1>
            Build and deploy a production-ready <span className="highlight">AI project</span> in 60 minutes
          </h1>

          <p className="l-hero-desc">
            A hands-on engineering session. Connect a real LLM, build a Retrieval-Augmented Generation (RAG) app that answers questions from your PDFs with citations, and ship it to a public URL — live, alongside a mentor.
          </p>

          <div className="l-hero-actions">
            <button type="button" className="btn-cta" onClick={scrollToRegister}>
              Reserve your free seat
            </button>
            <a href="#workbench" className="l-btn-secondary">See what you'll build</a>
          </div>

          {event.startAt && !countdown.ended && (
            <p className="l-countdown">
              Session starts in
              <span className="mono">
                {String(countdown.days).padStart(2, "0")}d {String(countdown.hours).padStart(2, "0")}h {String(countdown.minutes).padStart(2, "0")}m {String(countdown.seconds).padStart(2, "0")}s
              </span>
            </p>
          )}
          </div>

          <figure className="l-hero-media">
            <picture>
              <source srcSet="/landing/hero.webp" type="image/webp" />
              <img src="/landing/hero.jpg" alt="Student building an AI document-chat app on a laptop" fetchpriority="high" />
            </picture>
          </figure>
        </div>
      </header>

      {/* Key facts */}
      <div className="l-container">
        <dl className="l-facts">
          <div>
            <dt>Date</dt>
            <dd>{event.date}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{event.time}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{event.durationMin} minutes</dd>
          </div>
          <div>
            <dt>Setup</dt>
            <dd>Browser only</dd>
          </div>
          <div>
            <dt>Fee</dt>
            <dd>Free</dd>
          </div>
          {event.open && (
            <div>
              <dt>Seats left</dt>
              <dd className="accent">{event.seatsLeft}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Project + registration */}
      <div className="l-container">
        <div className="l-split-layout">
          <div className="l-main-col">
            <div className="l-block-head" id="workbench">
              <span className="l-sec-eyebrow">What you'll build</span>
              <h2>IntelliDoc AI — ask questions of any PDF, get cited answers</h2>
              <p>
                Upload a syllabus, research paper or technical spec and query it in plain English. The app retrieves the relevant passages, grounds the model's answer in them, and shows exactly where each fact came from.
              </p>
            </div>

            {/* Developer Workbench */}
            <div className="l-workbench">
              <div className="l-wb-topbar">
                <div className="l-wb-dots">
                  <span className="l-wb-dot" />
                  <span className="l-wb-dot" />
                  <span className="l-wb-dot" />
                </div>
                <div className="l-wb-file">intellidoc-ai / rag_pipeline.py</div>
                <div className="l-wb-status">Live demo</div>
              </div>

              <div className="l-wb-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "preview"}
                  className={`l-wb-tab ${activeTab === "preview" ? "active" : ""}`}
                  onClick={() => setActiveTab("preview")}
                >
                  Live output
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "code"}
                  className={`l-wb-tab ${activeTab === "code" ? "active" : ""}`}
                  onClick={() => setActiveTab("code")}
                >
                  Python code
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "arch"}
                  className={`l-wb-tab ${activeTab === "arch" ? "active" : ""}`}
                  onClick={() => setActiveTab("arch")}
                >
                  System flow
                </button>
              </div>

              <div className="l-wb-body">
                {activeTab === "preview" && (
                  <div className="l-preview-feed">
                    <div className="l-feed-user">
                      <span className="tag">Question</span>
                      Extract the p99 latency SLA and the disaster-recovery failover protocol from the uploaded systems specification.
                    </div>

                    <div className="l-feed-response">
                      <div className="l-feed-meta-row">
                        <span>Gemini 1.5 Flash · RAG retrieval</span>
                        <span className="l-feed-ok">200 OK · 340 ms</span>
                      </div>

                      <p style={{ margin: "0 0 8px" }}>
                        From <code>spec_v2.4.pdf</code> (94.2% semantic match):
                      </p>
                      <ol style={{ margin: "0 0 4px", paddingLeft: 20 }}>
                        <li><b>Latency SLA:</b> 99th percentile response time must not exceed <b>450 ms</b> across primary API gateways.</li>
                        <li><b>Failover:</b> on primary heartbeat loss (&gt; 3.0 s), the secondary orchestrator promotes replica state with zero data loss.</li>
                      </ol>

                      <div className="l-feed-tags">
                        <span className="l-feed-tag">§3.1 · page 6</span>
                        <span className="l-feed-tag">§8.4 · page 14</span>
                        <span className="l-feed-tag">similarity 0.942</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "code" && (
                  <div className="l-code-editor">
                    <div className="l-code-gutter">
                      1<br />2<br />3<br />4<br />5<br />6<br />7<br />8<br />9<br />10<br />11<br />12<br />13
                    </div>
                    <pre className="l-code-content">
                      <code>
                        <span className="l-ck-kw">import</span> streamlit <span className="l-ck-kw">as</span> st{"\n"}
                        <span className="l-ck-kw">from</span> langchain_google_genai <span className="l-ck-kw">import</span> ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings{"\n"}
                        <span className="l-ck-kw">from</span> langchain_community.vectorstores <span className="l-ck-kw">import</span> FAISS{"\n"}
                        {"\n"}
                        <span className="l-ck-cm"># Initialize embeddings and vector search index</span>{"\n"}
                        embeddings = <span className="l-ck-fn">GoogleGenerativeAIEmbeddings</span>(model=<span className="l-ck-str">"models/embedding-001"</span>){"\n"}
                        vector_db = FAISS.<span className="l-ck-fn">from_documents</span>(document_chunks, embeddings){"\n"}
                        {"\n"}
                        <span className="l-ck-cm"># Execute similarity query and invoke LLM with grounding</span>{"\n"}
                        matched_docs = vector_db.<span className="l-ck-fn">similarity_search</span>(query, k=<span className="l-ck-num">3</span>){"\n"}
                        llm = <span className="l-ck-fn">ChatGoogleGenerativeAI</span>(model=<span className="l-ck-str">"gemini-1.5-flash"</span>, temperature=<span className="l-ck-num">0.2</span>){"\n"}
                        response = llm.<span className="l-ck-fn">invoke</span>(<span className="l-ck-str">f"Context: &#123;matched_docs&#125;\\n\\nPrompt: &#123;query&#125;"</span>){"\n"}
                        st.<span className="l-ck-fn">write</span>(response.content)
                      </code>
                    </pre>
                  </div>
                )}

                {activeTab === "arch" && (
                  <div className="l-arch-flow">
                    {ARCH_STEPS.map((s, i) => (
                      <div className="l-arch-node" key={s.title}>
                        <span className="l-arch-node-num">{String(i + 1).padStart(2, "0")} / {s.stage}</span>
                        <span className="l-arch-node-title">{s.title}</span>
                        <span className="l-arch-node-desc">{s.desc}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="l-points">
              {PILLARS.map((p, i) => (
                <div className="l-point" key={p.title}>
                  <span className="l-point-num">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{p.title}</h3>
                    <p>{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="l-stats">
              <div className="l-stat"><b>4,500+</b><span>students taught</span></div>
              <div className="l-stat"><b>120+</b><span>colleges</span></div>
              <div className="l-stat"><b>4.9 / 5</b><span>average rating</span></div>
              <div className="l-stat"><b>60 min</b><span>to a live URL</span></div>
            </div>
          </div>

          {/* Registration Column */}
          <div className="l-side-col" id="register-section">
            {done ? (
              <div className="l-success">
                <span className="l-sec-eyebrow" style={{ margin: 0 }}>You're in</span>
                <h2>{done.already ? "Registration confirmed" : "Seat reserved"}</h2>
                <p>
                  {done.already ? "You are already enrolled in this cohort. " : "Your reservation is confirmed. "}
                  We've sent your schedule and access details on WhatsApp.
                  Session: <b>{done.date}, {done.time}</b>.
                </p>

                {done.whatsappLink && (
                  <a className="btn-wa" href={done.whatsappLink} target="_blank" rel="noreferrer">
                    <WhatsAppIcon /> Message us on WhatsApp
                  </a>
                )}
              </div>
            ) : !event.open ? (
              <div className="l-card">
                <h2>Registrations closed</h2>
                <p className="l-card-sub">This cohort is full. Check back for the next cohort announcement.</p>
              </div>
            ) : (
              <form className="l-card" onSubmit={submit} noValidate>
                <div className="l-card-head">
                  <h2>Reserve your seat</h2>
                  <p className="l-card-sub">Free · confirmation and joining link on WhatsApp</p>
                </div>

                {/* Capacity Tracker */}
                <div className="l-seat-tracker">
                  <div className="l-seat-info">
                    <span>Seats filling</span>
                    <span className="mono">{event.seatsLeft} left</span>
                  </div>
                  <div className="l-seat-progress">
                    <div className="l-seat-fill" style={{ width: `${claimedPercent}%` }} />
                  </div>
                </div>

                {questions.map((q) =>
                  visible(q, answers) ? (
                    <Field
                      key={q.key}
                      q={q}
                      value={answers[q.key]}
                      onChange={(v) => set(q.key, v)}
                      error={errors[q.key]}
                      onBlur={q.mapTo === "phone" ? checkPhone : undefined}
                      phoneState={q.mapTo === "phone" ? phoneState : null}
                      locked={q.mapTo === "phone" && !!otp.token}
                    />
                  ) : null
                )}

                {event.otpRequired && phoneValue && (
                  <div className="l-field">
                    {otp.token ? (
                      <span className="ok">WhatsApp number authenticated</span>
                    ) : !otp.sent ? (
                      <>
                        <button type="button" className="btn-ghost-d" onClick={sendOtp} disabled={otp.busy}>
                          {otp.busy ? "Dispatching…" : "Verify Phone via WhatsApp"}
                        </button>
                        <span className="help">A 6-digit confirmation code will be dispatched to this number.</span>
                      </>
                    ) : (
                      <>
                        <label htmlFor="otp">Enter 6-digit verification code</label>
                        <div className="otp-row">
                          <input
                            id="otp"
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={otp.code}
                            onChange={(e) => setOtp({ ...otp, code: e.target.value.replace(/\D/g, "") })}
                            placeholder="••••••"
                          />
                          <button type="button" className="btn-ghost-d" onClick={verifyOtp} disabled={otp.busy || otp.code.length < 6}>
                            Verify
                          </button>
                        </div>
                        <button
                          type="button"
                          className="btn-ghost-d"
                          style={{ alignSelf: "flex-start", padding: "5px 10px", fontSize: 12 }}
                          onClick={sendOtp}
                          disabled={otp.busy}
                        >
                          Resend code
                        </button>
                      </>
                    )}
                    {otp.msg && <span className="help">{otp.msg}</span>}
                    {otp.err && <span className="err">{otp.err}</span>}
                  </div>
                )}

                {formError && <div style={{ color: "var(--bad)", fontSize: 13.5 }}>{formError}</div>}

                <button className="btn-cta" disabled={busy || needOtp}>
                  {busy ? "Confirming…" : needOtp ? "Verify number to continue" : "Confirm my seat"}
                </button>

                <p className="small-note">
                  Joining link and reminders are sent on WhatsApp and email. Reply STOP any time to opt out.
                </p>

                {event.whatsappJoinLink && (
                  <>
                    <div className="divider">or</div>
                    <a className="btn-wa" href={event.whatsappJoinLink} target="_blank" rel="noreferrer">
                      <WhatsAppIcon /> Register on WhatsApp
                    </a>
                  </>
                )}
              </form>
            )}
          </div>
        </div>
      </div>

      {/* SECTION: Why attend */}
      <section className="l-section" id="about-project">
        <div className="l-container">
          <div className="l-sec-header">
            <span className="l-sec-eyebrow">Why attend</span>
            <h2 className="l-sec-title">Built for semester projects and placement interviews</h2>
            <p className="l-sec-desc">
              The gap between computer-science theory and shipping a real GenAI product, closed in one focused hour.
            </p>
          </div>

          <div className="l-points l-points-4">
            {WHY.map((w, i) => (
              <div className="l-point" key={w.title}>
                <span className="l-point-num">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{w.title}</h3>
                  <p>{w.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION: 60-Minute Syllabus */}
      <section className="l-section" id="curriculum">
        <div className="l-container">
          <div className="l-sec-header">
            <span className="l-sec-eyebrow">Syllabus</span>
            <h2 className="l-sec-title">The 60-minute build, minute by minute</h2>
            <p className="l-sec-desc">Every block ends with working code you keep.</p>
          </div>

          <ol className="l-timeline">
            {CURRICULUM.map((item, idx) => (
              <li className="l-timeline-step" key={item.time}>
                <div className="l-time-chip">
                  <span className="mono">{item.time}</span>
                  <small>Phase {idx + 1}</small>
                </div>
                <div className="l-time-body">
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* SECTION: Deliverables */}
      <section className="l-section" id="deliverables">
        <div className="l-container">
          <div className="l-sec-header">
            <span className="l-sec-eyebrow">Deliverables</span>
            <h2 className="l-sec-title">What you leave with</h2>
            <p className="l-sec-desc">Assets you can put on your resume, LinkedIn and project file the same day.</p>
          </div>

          <div className="l-deliver-grid">
            {TAKEAWAYS.map((t) => (
              <div className="l-deliver" key={t.title}>
                <h3>{t.title}</h3>
                <p>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION: Testimonials */}
      <section className="l-section">
        <div className="l-container">
          <div className="l-sec-header">
            <span className="l-sec-eyebrow">Student feedback</span>
            <h2 className="l-sec-title">From past participants</h2>
          </div>

          <div className="l-testi-grid">
            {TESTIMONIALS.map((t) => (
              <figure className="l-testi-card" key={t.name}>
                <blockquote className="l-testi-quote">{t.quote}</blockquote>
                <figcaption className="l-testi-author">
                  <div className="l-testi-avatar">{t.avatar}</div>
                  <div>
                    <div className="l-testi-name">{t.name}</div>
                    <div className="l-testi-college">{t.college}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION: FAQs */}
      <section className="l-section" id="faqs">
        <div className="l-container l-faq-wrap">
          <div className="l-sec-header l-sec-header-left">
            <span className="l-sec-eyebrow">FAQs</span>
            <h2 className="l-sec-title">Questions, answered</h2>
            <p className="l-sec-desc">
              Something else?{" "}
              {event.whatsappJoinLink ? (
                <a href={event.whatsappJoinLink} target="_blank" rel="noreferrer">Ask us on WhatsApp</a>
              ) : (
                "Reply to your registration message on WhatsApp."
              )}
            </p>
          </div>

          <div className="l-faq-list">
            {FAQ_LIST.map((faq, idx) => {
              const isOpen = !!openFaq[idx];
              return (
                <div className={`l-faq-item ${isOpen ? "open" : ""}`} key={faq.q}>
                  <button
                    type="button"
                    className="l-faq-btn"
                    onClick={() => toggleFaq(idx)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <ChevronDownIcon />
                  </button>
                  {isOpen && <div className="l-faq-answer">{faq.a}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <div className="l-container">
        <div className="l-cta-banner">
          <span className="l-sec-eyebrow" style={{ margin: 0 }}>Limited seats per cohort</span>
          <h2>Ship your first production AI project this week</h2>
          <p>One hour. A live URL, a GitHub repository and a verifiable certificate at the end of it.</p>
          <div className="l-cta-btn-wrap">
            <button type="button" className="btn-cta" onClick={scrollToRegister}>
              Reserve your free seat
            </button>
            {event.whatsappJoinLink && (
              <a className="btn-wa" href={event.whatsappJoinLink} target="_blank" rel="noreferrer">
                <WhatsAppIcon /> Register on WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="l-footer">
        <div className="l-container">
          <div className="l-footer-inner">
            <div className="l-brand">
              <span className="l-brand-mark" />
              <span className="l-brand-name">Next Wave</span>
            </div>

            <div className="l-footer-links">
              <a href="#workbench">The project</a>
              <a href="#curriculum">Syllabus</a>
              <a href="#faqs">FAQs</a>
              <a href="/admin/login">Admin</a>
            </div>

            <span>© {new Date().getFullYear()} Next Wave</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Field({ q, value, onChange, error, onBlur, phoneState, locked }) {
  const id = `q-${q.key}`;
  let input;
  switch (q.type) {
    case "longtext":
      input = <textarea id={id} rows={3} value={value || ""} placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "single":
      input = (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.options.map((o) => (
            <label key={o.value} className="choice"><input type="radio" name={id} checked={value === o.value} onChange={() => onChange(o.value)} /> {o.label}</label>
          ))}
        </div>
      );
      break;
    case "multi":
      input = (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.options.map((o) => {
            const arr = value || [];
            return (
              <label key={o.value} className="choice">
                <input type="checkbox" checked={arr.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))} /> {o.label}
              </label>
            );
          })}
        </div>
      );
      break;
    case "yesno":
      input = (
        <div style={{ display: "flex", gap: 8 }}>
          {["yes", "no"].map((v) => (
            <label key={v} className="choice" style={{ flex: 1 }}><input type="radio" name={id} checked={value === v} onChange={() => onChange(v)} /> {v === "yes" ? "Yes" : "No"}</label>
          ))}
        </div>
      );
      break;
    default: {
      const type = { email: "email", number: "number", phone: "tel", date: "date" }[q.type] || "text";
      input = <input id={id} type={type} inputMode={q.type === "phone" ? "tel" : undefined} value={value || ""} placeholder={q.placeholder} readOnly={locked} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} autoComplete={q.mapTo === "name" ? "name" : q.type === "phone" ? "tel" : q.type === "email" ? "email" : "off"} />;
    }
  }
  return (
    <div className="l-field">
      <label htmlFor={id}>{q.label} {q.required && <span className="req">*</span>}</label>
      {input}
      {q.helpText && <span className="help">{q.helpText}</span>}
      {phoneState && <span className={phoneState.kind}>{phoneState.msg}</span>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}
