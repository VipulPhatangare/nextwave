import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { admin } from "../../api.js";
import { useLoad, useToast, useSocketEvent, Stat, fmtDateTime } from "../../components/ui.jsx";
import { confirmDialog, promptDialog } from "../../components/Dialog.jsx";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const TABS = [["usage", "Usage"], ["knowledge", "Knowledge"], ["settings", "Settings"], ["handoffs", "Questions for you"], ["try", "Try it"]];

export default function Ai() {
  const [tab, setTab] = useState("usage");
  const usage = useLoad(() => admin.get("/ai/usage"));
  useSocketEvent("ai:handoff", () => usage.reload());
  const open = usage.data?.openHandoffs || 0;

  return (
    <>
      <div className="page-title">
        <div>
          <h1>AI assistant</h1>
          <p>Gemini answers student questions on WhatsApp and double-checks registration answers. Every limit below keeps the bill predictable.</p>
        </div>
      </div>
      <div className="tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}{k === "handoffs" && open > 0 ? ` (${open})` : ""}</button>
        ))}
      </div>
      {tab === "usage" && <UsageTab usage={usage} goto={setTab} />}
      {tab === "knowledge" && <KnowledgeTab />}
      {tab === "settings" && <SettingsTab onSaved={usage.reload} />}
      {tab === "handoffs" && <HandoffsTab onChange={usage.reload} />}
      {tab === "try" && <TryTab onAsked={usage.reload} />}
    </>
  );
}

// ---------------- usage ----------------
function UsageTab({ usage, goto }) {
  const u = usage.data;
  if (!u) return <div className="empty">{usage.error || "Loading…"}</div>;
  const hot = u.month.pct >= 80;
  return (
    <>
      {!u.configured && (
        <div className="banner warn"><span>Gemini isn't connected. Add <span className="mono">GEMINI_API_KEY</span> to the server's <span className="mono">.env</span> file and restart the server.</span></div>
      )}
      {u.configured && !u.enabled && (
        <div className="banner"><span>The assistant is <b>off</b>. Students get the normal replies until you switch it on.</span><button className="btn sm primary" onClick={() => goto("settings")}>Open settings</button></div>
      )}
      {u.enabled && u.month.budget > 0 && u.month.pct >= 100 && (
        <div className="banner bad"><span>The overall monthly safety net was reached, so the assistant has stopped for everyone and questions go to your team.</span><button className="btn sm" onClick={() => goto("settings")}>Change it</button></div>
      )}
      {u.openHandoffs > 0 && (
        <div className="banner"><span><b>{u.openHandoffs}</b> student question{u.openHandoffs === 1 ? "" : "s"} the assistant couldn't answer.</span><button className="btn sm primary" onClick={() => goto("handoffs")}>Answer them</button></div>
      )}

      <div className="card">
        <div className="btn-row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>This month's estimated spend</h3>
          <b className="mono" style={{ fontSize: 20 }}>{inr(u.month.cost)}{u.month.budget > 0 && <span style={{ color: "var(--muted)", fontSize: 14 }}> of {inr(u.month.budget)}</span>}</b>
        </div>
        {u.month.budget > 0 && <div className={`meter ${hot ? "hot" : ""}`} style={{ margin: "10px 0 6px" }}><div style={{ width: u.month.pct + "%" }} /></div>}
        <span style={{ fontSize: 12, color: "var(--muted)", display: "block", marginTop: u.month.budget > 0 ? 0 : 8 }}>
          {u.month.budget > 0 ? `${u.month.pct}% of the overall safety net used. ` : "Limits apply to each student; there is no overall cap. "}
          This is an estimate from token counts and the prices in Settings. Your Google bill is the final word. Model: <span className="mono">{u.model}</span>
        </span>
      </div>

      <div className="grid g4">
        <Stat hot n={u.today.limit > 0 ? `${u.today.calls} / ${u.today.limit}` : u.today.calls} label="AI calls today" sub={u.today.limit > 0 ? "Overall daily safety net" : "Limits are per student"} />
        <Stat n={u.today.cached} label="Answered from cache today" sub="Free: no model call" />
        <Stat n={u.today.blocked} label="Stopped by limits today" />
        <Stat n={u.today.failed} label="Failed calls today" />
        <Stat n={u.month.calls} label="AI calls this month" sub={`${Number(u.month.tokens).toLocaleString("en-IN")} tokens`} />
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Calls per day (last 14 days)</h3>
          <div style={{ width: "100%", height: 220 }}>
            {u.byDay.length ? (
              <ResponsiveContainer>
                <BarChart data={u.byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26262a" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#918b83" }} stroke="#26262a" tickFormatter={(d) => d.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#918b83" }} stroke="#26262a" />
                  <Tooltip contentStyle={{ background: "#151517", border: "1px solid #3a2a1a", borderRadius: 10, color: "#f4f0ea" }} cursor={{ fill: "rgba(255,106,0,0.08)" }} formatter={(v, n, p) => (n === "calls" ? [`${v} calls (${inr(p.payload.cost)})`, "AI"] : v)} />
                  <Bar dataKey="calls" fill="#ff6a00" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="empty">No AI calls yet.</div>}
          </div>
        </div>
        <div className="card">
          <h3>Most active students (30 days)</h3>
          <table className="t">
            <thead><tr><th>Student</th><th style={{ textAlign: "right" }}>Calls</th><th style={{ textAlign: "right" }}>Cost</th></tr></thead>
            <tbody>{u.topUsers.map((t) => <tr key={t.phone}><td className="mono">{t.phone}</td><td className="mono" style={{ textAlign: "right" }}>{t.calls}</td><td className="mono" style={{ textAlign: "right" }}>{inr(t.cost)}</td></tr>)}</tbody>
          </table>
          {u.topUsers.length === 0 && <div className="empty">Nobody has used it yet.</div>}
        </div>
      </div>

      <div className="card scroll-x">
        <div className="btn-row" style={{ justifyContent: "space-between" }}><h3 style={{ margin: 0 }}>Recent activity</h3><button className="btn sm" onClick={usage.reload}>Refresh</button></div>
        <table className="t" style={{ marginTop: 10 }}>
          <thead><tr><th>When</th><th>Type</th><th>Student</th><th>Question</th><th>Result</th><th style={{ textAlign: "right" }}>Tokens</th><th style={{ textAlign: "right" }}>Cost</th></tr></thead>
          <tbody>
            {u.recent.map((r) => (
              <tr key={r._id}>
                <td>{fmtDateTime(r.at)}</td>
                <td><span className="badge">{r.kind}</span></td>
                <td className="mono">{r.phone}</td>
                <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.question}>{r.question}</td>
                <td>{r.blocked ? <span className="badge warn">stopped: {r.blocked.replace("_", " ")}</span> : r.cached ? <span className="badge good">cache</span> : r.ok ? <span className="badge good">answered</span> : <span className="badge bad" title={r.error}>failed</span>}</td>
                <td className="mono" style={{ textAlign: "right" }}>{r.tokens || "–"}</td>
                <td className="mono" style={{ textAlign: "right" }}>{r.cost ? inr(r.cost) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {u.recent.length === 0 && <div className="empty">Nothing yet. Try the assistant in the "Try it" tab.</div>}
      </div>
    </>
  );
}

// ---------------- knowledge ----------------
function KnowledgeTab() {
  const [toast, show] = useToast();
  const { data, reload } = useLoad(() => admin.get("/ai/knowledge"));
  const [f, setF] = useState({ title: "", content: "", tags: "" });
  const [src, setSrc] = useState("");
  const [drafts, setDrafts] = useState(null);
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    try { await admin.post("/ai/knowledge", f); setF({ title: "", content: "", tags: "" }); show("Added"); reload(); } catch (err) { show(err.message, true); }
  }
  async function patch(x, p) { try { await admin.put(`/ai/knowledge/${x._id}`, p); reload(); } catch (e) { show(e.message, true); } }
  async function del(x) { if (await confirmDialog({ title: "Delete this answer?", message: `"${x.title}" will be removed from the AI knowledge base.`, confirmText: "Delete", danger: true })) { await admin.del(`/ai/knowledge/${x._id}`); reload(); } }
  async function generate() {
    setBusy(true);
    try { setDrafts((await admin.post("/ai/knowledge/generate", { text: src })).entries.map((d) => ({ ...d, keep: true }))); } catch (e) { show(e.message, true); } finally { setBusy(false); }
  }
  async function saveDrafts() {
    try { const r = await admin.post("/ai/knowledge/bulk", { entries: drafts.filter((d) => d.keep) }); show(`${r.saved} entries saved`); setDrafts(null); setSrc(""); reload(); } catch (e) { show(e.message, true); }
  }

  return (
    <>
      <div className="card">
        <h3>What the assistant knows</h3>
        <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 12px" }}>It answers only from this list and the workshop details (date and time). If the answer isn't here, it passes the question to your team instead of guessing. Keep entries short and factual.</p>
        <form onSubmit={add}>
          <div className="row2">
            <div className="field"><label>Question or topic</label><input type="text" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Will I get a certificate?" /></div>
            <div className="field"><label>Tags (optional, comma separated)</label><input type="text" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="certificate, resume" /></div>
          </div>
          <div className="field"><label>Answer</label><textarea style={{ minHeight: 80 }} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="Yes. Everyone who attends gets a certificate on WhatsApp and email within a day." /></div>
          <button className="btn primary">Add to knowledge</button>
        </form>
      </div>

      <div className="card">
        <h3>Let Gemini write the entries</h3>
        <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 10px" }}>Paste the workshop description, schedule or a brochure's text. Gemini drafts questions and answers from it, and you review them before anything is saved. This uses a little of your AI budget.</p>
        <div className="field"><textarea style={{ minHeight: 120 }} value={src} onChange={(e) => setSrc(e.target.value)} placeholder="Paste text here…" /></div>
        <button className="btn" onClick={generate} disabled={busy || src.trim().length < 40}>{busy ? "Writing…" : "Generate entries"}</button>
        {drafts && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {drafts.length === 0 && <div className="empty">Gemini didn't find anything to turn into entries. Try pasting more detail.</div>}
            {drafts.map((d, i) => (
              <div key={i} className="qa">
                <label className="check"><input type="checkbox" checked={d.keep} onChange={(e) => setDrafts(drafts.map((x, k) => (k === i ? { ...x, keep: e.target.checked } : x)))} /> Keep this one</label>
                <input type="text" className="plain-input" style={{ width: "100%" }} value={d.title} onChange={(e) => setDrafts(drafts.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
                <textarea className="plain-input" style={{ width: "100%", minHeight: 64 }} value={d.content} onChange={(e) => setDrafts(drafts.map((x, k) => (k === i ? { ...x, content: e.target.value } : x)))} />
              </div>
            ))}
            {drafts.length > 0 && <div className="btn-row"><button className="btn primary" onClick={saveDrafts}>Save the kept entries</button><button className="btn" onClick={() => setDrafts(null)}>Discard</button></div>}
          </div>
        )}
      </div>

      <div className="card">
        <h3>{data ? data.length : 0} entries</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data?.map((x) => (
            <div key={x._id} className="qa" style={{ opacity: x.enabled ? 1 : 0.55 }}>
              <div className="btn-row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <span className="q">{x.title} {x.source === "ai" && <span className="badge accent">Gemini draft</span>}</span>
                <div className="btn-row" style={{ flexWrap: "nowrap" }}>
                  <input type="checkbox" className="toggle" checked={x.enabled} onChange={(e) => patch(x, { enabled: e.target.checked })} title="Use this entry" />
                  <button className="btn sm" onClick={async () => { const t = await promptDialog({ title: "Edit answer", label: x.title, defaultValue: x.content, multiline: true }); if (t) patch(x, { content: t }); }}>Edit</button>
                  <button className="btn sm danger" onClick={() => del(x)}>Delete</button>
                </div>
              </div>
              <span className="a">{x.content}</span>
              {x.tags?.length > 0 && <div className="btn-row">{x.tags.map((t) => <span key={t} className="badge">{t}</span>)}</div>}
            </div>
          ))}
          {data?.length === 0 && <div className="empty">Nothing here yet. Without entries the assistant can only answer from the workshop details and will hand most questions to your team.</div>}
        </div>
      </div>
      {toast}
    </>
  );
}

// ---------------- settings ----------------
function SettingsTab({ onSaved }) {
  const [toast, show] = useToast();
  const { data, reload } = useLoad(() => admin.get("/ai/config"));
  const [c, setC] = useState(null);
  const [models, setModels] = useState(null);
  useEffect(() => { if (data) setC(data.config); }, [data]);
  if (!c) return <div className="empty">Loading…</div>;
  const set = (k, v) => setC({ ...c, [k]: v });
  const num = (k, label, hint, props = {}) => (
    <div className="field"><label>{label}</label><input type="number" value={c[k]} onChange={(e) => set(k, e.target.value)} {...props} />{hint && <span className="hint">{hint}</span>}</div>
  );

  async function save() {
    try {
      const body = { ...c };
      delete body._id; delete body.__v; delete body.createdAt; delete body.updatedAt;
      await admin.put("/ai/config", body);
      show("Saved");
      reload(); onSaved();
    } catch (e) { show(e.message, true); }
  }
  // Switches save straight away; the rest of the form still uses "Save settings".
  async function toggle(k, v) { await toggleMany({ [k]: v }, v ? "Turned on" : "Turned off"); }
  async function toggleMany(p, msg) {
    const prev = Object.fromEntries(Object.keys(p).map((k) => [k, c[k]]));
    setC((cur) => ({ ...cur, ...p }));
    try {
      await admin.put("/ai/config", p);
      show(msg);
      onSaved();
    } catch (e) { setC((cur) => ({ ...cur, ...prev })); show(e.message, true); }
  }
  const FEATURES = ["enabled", "answerQuestions", "checkAnswers"];
  const allOn = FEATURES.every((k) => c[k]);
  const setAll = (v) => toggleMany(Object.fromEntries(FEATURES.map((k) => [k, v])), v ? "Everything turned on" : "Everything turned off");
  async function loadModels() {
    try { setModels(await admin.get("/ai/models")); } catch (e) { show(e.message, true); }
  }
  // worst case for one student: ~1,500 prompt tokens in, the maximum reply out, every allowed question used
  const perCall = ((1500 * c.usdPerMInput + c.maxOutputTokens * c.usdPerMOutput) / 1e6) * c.usdToInr;
  const questionsPerMonth = c.perUserMonthly > 0 ? Math.min(c.perUserMonthly, c.perUserDaily * 31) : c.perUserDaily * 31;
  const byQuestions = perCall * questionsPerMonth;
  const perStudentMonth = c.perUserMonthlyBudgetInr > 0 ? Math.min(byQuestions, c.perUserMonthlyBudgetInr) : byQuestions;

  return (
    <>
      <div className="card">
        <div className="btn-row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Switch</h3>
          <button type="button" className={`btn sm ${allOn ? "danger" : "primary"}`} onClick={() => setAll(!allOn)}>{allOn ? "Turn all off" : "Turn all on"}</button>
        </div>
        <label style={{ marginTop: 12 }} className="check"><input type="checkbox" className="toggle" checked={c.enabled} onChange={(e) => toggle("enabled", e.target.checked)} /> <b>Assistant is on</b></label>
        {!data.configured && <p style={{ fontSize: 13, color: "var(--warn)", margin: "10px 0 0" }}>GEMINI_API_KEY isn't set on the server yet, so it can't answer even when on.</p>}
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", marginTop: 14 }}>
          <label className="check"><input type="checkbox" className="toggle" checked={c.answerQuestions} onChange={(e) => toggle("answerQuestions", e.target.checked)} /> Answer students' questions on WhatsApp</label>
          <label className="check"><input type="checkbox" className="toggle" checked={c.checkAnswers} onChange={(e) => toggle("checkAnswers", e.target.checked)} /> Double-check registration answers (typos, junk)</label>
          <label className="check"><input type="checkbox" className="toggle" checked={c.discloseAi} onChange={(e) => toggle("discloseAi", e.target.checked)} /> Tell students it's an AI assistant</label>
        </div>
      </div>

      <div className="card">
        <h3>Limits for each student</h3>
        <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 12px" }}>Every student gets their own allowance, counted by phone number. One student using up theirs never affects anyone else.</p>
        <div className="grid aligned" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          {num("perUserDaily", "Questions per student per day")}
          {num("perUserMonthly", "Questions per student per month", "0 = no monthly limit.")}
          {num("perUserMonthlyBudgetInr", "Spend per student per month (₹)", "Estimated from tokens. 0 = no limit.", { step: "0.5" })}
          {num("cooldownSec", "Seconds between one student's questions")}
        </div>
        <div className="banner" style={{ marginTop: 14, flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          <span>One student can cost at most about <b>{inr(perStudentMonth)}</b> a month at the most expensive replies (usually far less).</span>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>If every student used their full allowance: 100 students ≈ {inr(perStudentMonth * 100)}, 500 students ≈ {inr(perStudentMonth * 500)}. Total spend grows with the number of students, because there is no overall cap unless you turn on the safety net below.</span>
        </div>
      </div>

      <div className="card">
        <h3>Replies and memory</h3>
        <div className="grid aligned" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          {num("maxOutputTokens", "Max reply length (tokens)", "About 4 characters per token.")}
          {num("maxInputChars", "Max characters read from a message", "Longer messages are cut.")}
          {num("historyTurns", "Past messages remembered", "0 = none. Fewer is cheaper.")}
          {num("cacheHours", "Reuse identical answers for (hours)", "Repeated questions cost nothing. 0 = off.")}
        </div>
      </div>

      <div className="card">
        <h3>Optional safety net for everyone combined</h3>
        <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 12px" }}>Off by default, so a busy day never blocks students. Turn it on only if you want a hard ceiling on the total bill. When it's reached, the assistant stops for all students and questions go to your team.</p>
        <div className="grid aligned" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          {num("globalDailyCalls", "Max AI calls per day, all students", "0 = off.")}
          {num("monthlyBudgetInr", "Max spend per month, all students (₹)", "0 = off.")}
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "14px 0 6px" }}>Prices used for the estimate (US dollars per million tokens). Check Google's current price list for your model and update these.</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          {num("usdPerMInput", "Input price ($ / 1M tokens)", null, { step: "0.01" })}
          {num("usdPerMOutput", "Output price ($ / 1M tokens)", null, { step: "0.01" })}
          {num("usdToInr", "₹ per US dollar", null, { step: "0.1" })}
        </div>
      </div>

      <div className="card">
        <h3>Model and behaviour</h3>
        <div className="field">
          <label>Gemini model</label>
          <div className="btn-row" style={{ flexWrap: "nowrap" }}>
            <input type="text" value={c.model} onChange={(e) => set("model", e.target.value)} />
            <button type="button" className="btn" style={{ whiteSpace: "nowrap" }} onClick={loadModels}>Models for my key</button>
          </div>
          <span className="hint">A small "flash-lite" model is the cheapest and fine for FAQs. Model names change, so pick one from the list.</span>
          {models && <select className="plain-input" value="" onChange={(e) => e.target.value && set("model", e.target.value)}><option value="">{models.length} models, choose one…</option>{models.map((m) => <option key={m} value={m}>{m}</option>)}</select>}
        </div>
        <div className="field"><label>Tone and language</label><textarea style={{ minHeight: 70 }} value={c.tone} onChange={(e) => set("tone", e.target.value)} /></div>
        <div className="field"><label>Extra instructions (optional)</label><textarea style={{ minHeight: 70 }} value={c.extraInstructions} onChange={(e) => set("extraInstructions", e.target.value)} placeholder="e.g. Never promise a job or a placement." /><span className="hint">The assistant always keeps its safety rules, such as answering only from your knowledge and never sharing other students' data.</span></div>
        <div className="btn-row">
          <button className="btn primary" onClick={save}>Save settings</button>
          <button className="btn" onClick={async () => { const r = await admin.post("/ai/cache/clear"); show(`${r.cleared} saved answers cleared`); }}>Clear saved answers</button>
        </div>
      </div>
      {toast}
    </>
  );
}

// ---------------- handoffs ----------------
function HandoffsTab({ onChange }) {
  const [toast, show] = useToast();
  const [status, setStatus] = useState("open");
  const { data, reload } = useLoad(() => admin.get(`/ai/handoffs?status=${status}`), [status]);
  const [reply, setReply] = useState({});

  async function send(h) {
    try { await admin.post(`/ai/handoffs/${h._id}/reply`, { body: reply[h._id] }); show("Reply sent on WhatsApp"); reload(); onChange(); } catch (e) { show(e.message, true); }
  }
  async function resolve(h) { await admin.put(`/ai/handoffs/${h._id}`, { status: "resolved" }); reload(); onChange(); }

  return (
    <>
      <div className="tabs">{["open", "resolved"].map((s) => <button key={s} className={`tab ${status === s ? "on" : ""}`} onClick={() => setStatus(s)}>{s}</button>)}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data?.map((h) => (
          <div key={h._id} className="card">
            <div className="btn-row" style={{ justifyContent: "space-between" }}>
              <b>{h.name || "Student"} <span className="mono" style={{ color: "var(--muted)", fontWeight: 400 }}>{h.phone}</span></b>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDateTime(h.createdAt)} · {String(h.reason || "").replace(/_/g, " ")}</span>
            </div>
            <p style={{ margin: "8px 0", fontSize: 15 }}>{h.question}</p>
            {status === "open" && (
              <div className="btn-row" style={{ flexWrap: "nowrap" }}>
                <input className="plain-input" style={{ flex: 1 }} placeholder="Type your reply (sent on WhatsApp)" value={reply[h._id] || ""} onChange={(e) => setReply({ ...reply, [h._id]: e.target.value })} />
                <button className="btn primary" onClick={() => send(h)} disabled={!(reply[h._id] || "").trim()}>Reply</button>
                <button className="btn" onClick={() => resolve(h)}>Mark done</button>
              </div>
            )}
          </div>
        ))}
        {data?.length === 0 && <div className="empty card">{status === "open" ? "No unanswered questions. When the assistant isn't sure, the question appears here. Tip: add the answer to Knowledge so it can answer next time." : "Nothing resolved yet."}</div>}
      </div>
      {toast}
    </>
  );
}

// ---------------- try it ----------------
function TryTab({ onAsked }) {
  const [q, setQ] = useState("");
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function ask(e) {
    e.preventDefault();
    setBusy(true); setErr(""); setOut(null);
    try { setOut(await admin.post("/ai/test", { question: q })); onAsked(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }
  const LIM = { user_cap: "This student's daily limit", user_month: "This student's monthly limit", user_budget: "This student's monthly spend limit", cooldown: "Cooldown between questions", budget: "Overall monthly safety net", daily_cap: "Overall daily safety net" };
  const UNAV = { disabled: "The assistant is switched off (Settings).", not_configured: "GEMINI_API_KEY isn't set on the server.", paused: "The kill switch is on.", empty: "Type a question." };

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h3>Ask it like a student would</h3>
      <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 12px" }}>This uses the same knowledge, rules and limits as WhatsApp, and counts toward your budget (cached answers are free).</p>
      <form onSubmit={ask} className="btn-row" style={{ flexWrap: "nowrap" }}>
        <input className="plain-input" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Do I need to install anything?" />
        <button className="btn primary" disabled={busy || !q.trim()}>{busy ? "Thinking…" : "Ask"}</button>
      </form>
      {err && <p style={{ color: "var(--bad)", fontSize: 14 }}>{err}</p>}
      {out && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {out.text && <><div className="answer-box">{out.text}</div><div className="btn-row">{out.cached && <span className="badge good">from cache, free</span>}{out.shortcut && <span className="badge good">shortcut, free</span>}</div></>}
          {out.handoff && <div className="banner">The assistant wasn't sure, so a real student would be told a teammate will reply. It's now in "Questions for you".</div>}
          {out.limited && <div className="banner warn">Blocked: {LIM[out.limited] || out.limited}. A real student would get a polite message.</div>}
          {out.unavailable && <div className="banner warn">{UNAV[out.unavailable] || out.unavailable}</div>}
          {out.error && <div className="banner bad">Gemini call failed: {out.message}</div>}
        </div>
      )}
    </div>
  );
}
