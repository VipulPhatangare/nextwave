import { useEffect, useRef, useState } from "react";
import { admin } from "../../api.js";
import { useLoad, useSocketEvent, useToast } from "../../components/ui.jsx";
import { confirmDialog } from "../../components/Dialog.jsx";

const EMPTY = { question: "", options: ["", "", "", ""], correct: 0, timeLimitSec: 30, kind: "quiz" };
const fmtNumber = (n) => (n ? "+" + String(n).replace(/^(\d{2})(\d{5})(\d{5})$/, "$1 $2 $3") : "");

function Countdown({ poll }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (poll?.status !== "live") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [poll?._id, poll?.status]);
  if (poll?.status !== "live" || !poll.openedAt) return null;
  const left = Math.max(0, Math.ceil(poll.timeLimitSec - (now - new Date(poll.openedAt).getTime()) / 1000));
  const pct = Math.max(0, Math.min(100, (left / poll.timeLimitSec) * 100));
  return (
    <div className="lv-timer">
      <div className="lv-timer-bar"><div style={{ width: pct + "%" }} /></div>
      <span className="mono">{left > 0 ? `${left}s` : "Time's up"}</span>
    </div>
  );
}

// What the class sees on the shared screen.
function Stage({ poll, botNumber, players }) {
  if (!poll) {
    return (
      <div className="lv-stage lv-idle">
        <div className="lv-kicker">Live quiz</div>
        <h2>Get ready! 🚀</h2>
        <p>Answer on WhatsApp by replying with the option number.</p>
        {botNumber && <div className="lv-number mono">{fmtNumber(botNumber)}</div>}
      </div>
    );
  }
  const total = poll.total || 0;
  const isQuiz = poll.correct !== null && poll.correct !== undefined;
  const reveal = poll.status === "closed" && isQuiz;
  return (
    <div className="lv-stage">
      <div className="lv-head">
        <span className="lv-kicker">{isQuiz ? "Quiz" : "Poll"} · {poll.status === "live" ? "answer now" : poll.status === "closed" ? "closed" : "draft"}</span>
        <span className="lv-count mono">{total} answer{total === 1 ? "" : "s"}</span>
      </div>
      <h2 className="lv-q">{poll.question}</h2>
      <Countdown poll={poll} />
      <div className="lv-opts">
        {poll.options.map((o, i) => {
          const n = poll.counts?.[i] || 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const right = reveal && i === poll.correct;
          const wrong = reveal && i !== poll.correct;
          return (
            <div key={i} className={`lv-opt ${right ? "right" : ""} ${wrong ? "dim" : ""}`}>
              <div className="lv-fill" style={{ width: (poll.status === "draft" ? 0 : pct) + "%" }} />
              <span className="lv-num">{i + 1}</span>
              <span className="lv-label">{o}</span>
              {poll.status !== "draft" && <span className="lv-pct mono">{pct}%</span>}
              {right && <span className="lv-tick">✓</span>}
            </div>
          );
        })}
      </div>
      {reveal && poll.fastest?.length > 0 && (
        <div className="lv-fastest">
          <b>⚡ Fastest correct:</b> {poll.fastest.map((f) => `${f.name} (${f.sec}s)`).join(" · ")}
        </div>
      )}
      <div className="lv-foot">
        Reply <b>{poll.options.map((_, i) => i + 1).join(" / ")}</b> on WhatsApp{botNumber && <> to <b className="mono">{fmtNumber(botNumber)}</b></>}
        <span className="grow" />
        {players > 0 && <span className="mono">{players} playing</span>}
      </div>
    </div>
  );
}

function PollForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial || EMPTY);
  const setOpt = (i, v) => setF({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) });
  return (
    <form className="lv-form" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
      <div className="field"><label>Question</label><input type="text" value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} placeholder="Which of these is a large language model?" required /></div>
      <div className="btn-row" style={{ marginBottom: 8 }}>
        <button type="button" className={`tab ${f.kind === "quiz" ? "on" : ""}`} onClick={() => setF({ ...f, kind: "quiz", correct: f.correct ?? 0 })}>Quiz (has a right answer)</button>
        <button type="button" className={`tab ${f.kind === "poll" ? "on" : ""}`} onClick={() => setF({ ...f, kind: "poll" })}>Poll (opinion)</button>
      </div>
      {f.options.map((o, i) => (
        <div key={i} className="lv-opt-row">
          <span className="lv-num sm">{i + 1}</span>
          <input type="text" value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={i < 2 ? `Option ${i + 1}` : `Option ${i + 1} (optional)`} required={i < 2} />
          {f.kind === "quiz" && (
            <label className="lv-right" title="Correct answer">
              <input type="radio" name="correct" checked={f.correct === i} onChange={() => setF({ ...f, correct: i })} disabled={!o.trim()} /> right
            </label>
          )}
        </div>
      ))}
      <div className="btn-row" style={{ marginTop: 10, alignItems: "center" }}>
        <label style={{ fontSize: 13, color: "var(--muted)" }}>Time
          <select value={f.timeLimitSec} onChange={(e) => setF({ ...f, timeLimitSec: Number(e.target.value) })} style={{ marginLeft: 6 }}>
            {[15, 20, 30, 45, 60, 90].map((s) => <option key={s} value={s}>{s}s</option>)}
          </select>
        </label>
        <span className="grow" />
        {onCancel && <button type="button" className="btn sm" onClick={onCancel}>Cancel</button>}
        <button className="btn primary sm">Save question</button>
      </div>
    </form>
  );
}

export default function Live() {
  const [toast, show] = useToast();
  const { data, reload } = useLoad(() => admin.get("/live"));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [stageId, setStageId] = useState(null);
  const stageRef = useRef();
  const timer = useRef();

  // many answers arrive at once: refresh at most every 400 ms
  const soon = () => { clearTimeout(timer.current); timer.current = setTimeout(reload, 400); };
  useSocketEvent("live:poll", soon);
  useSocketEvent("live:question", soon);

  const polls = data?.polls || [];
  const livePoll = polls.find((p) => p.status === "live");
  const shown = livePoll || polls.find((p) => p._id === stageId) || null;

  async function act(fn, ok) {
    try { await fn(); if (ok) show(ok); reload(); } catch (e) { show(e.message, true); }
  }
  const body = (f) => ({ question: f.question, options: f.options.filter((o) => o.trim()), correct: f.kind === "quiz" ? f.correct : null, timeLimitSec: f.timeLimitSec });
  const save = (f) => act(async () => {
    if (editing) await admin.put(`/live/polls/${editing._id}`, body(f)); else await admin.post("/live/polls", body(f));
    setAdding(false); setEditing(null);
  }, "Saved");
  const goLive = (p) => act(async () => { await admin.post(`/live/polls/${p._id}/open`); setStageId(p._id); });
  const close = (p) => act(() => admin.post(`/live/polls/${p._id}/close`));
  const reset = (p) => act(() => admin.post(`/live/polls/${p._id}/reset`), "Reset");
  async function del(p) {
    if (!(await confirmDialog({ title: "Delete this question?", message: "Its answers and the points they gave are removed too.", confirmText: "Delete", danger: true }))) return;
    act(() => admin.del(`/live/polls/${p._id}`));
  }
  async function generate() {
    if (!topic.trim()) return show("Write what the session covers first.", true);
    setBusy(true);
    try { const r = await admin.post("/live/polls/generate", { topic, count: 5 }); show(`${r.created} questions added. Check them before going live.`); setTopic(""); reload(); } catch (e) { show(e.message, true); } finally { setBusy(false); }
  }
  async function resetAll() {
    if (!(await confirmDialog({ title: "Start a fresh session?", message: "Clears all answers, points and Q&A. Your questions stay, as drafts.", confirmText: "Clear", danger: true }))) return;
    act(() => admin.post("/live/reset-all"), "Fresh session ready");
  }
  const setMode = (on) => act(() => admin.put("/live/mode", { on }), on ? "Live Q&A on: students' messages go to the board" : "Live Q&A off");
  const setQ = (q, up) => act(() => admin.put(`/live/questions/${q._id}`, up));
  const present = () => { const el = stageRef.current; if (el?.requestFullscreen) el.requestFullscreen().catch(() => {}); };

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Live session</h1>
          <p>Quiz questions on your screen, answered on WhatsApp with 1–4. Live leaderboard and Q&A from students' messages.</p>
        </div>
        <div className="btn-row">
          <label className="status" title="While on, messages from registered students go to the Q&A board instead of the AI assistant">
            <input type="checkbox" className="toggle" checked={!!data?.liveMode} onChange={(e) => setMode(e.target.checked)} /> Live Q&A
          </label>
          <button className="btn" onClick={resetAll}>New session</button>
          <button className="btn primary" onClick={present}>Present ⛶</button>
        </div>
      </div>

      <div className="lv-grid">
        <div className="lv-main">
          <div ref={stageRef} className="lv-screen">
            <Stage poll={shown} botNumber={data?.botNumber} players={data?.players || 0} />
            <div className="lv-board">
              <h3>🏆 Leaderboard</h3>
              {data?.leaderboard?.length ? (
                <ol>
                  {data.leaderboard.map((l) => (
                    <li key={l.rank}><span className="r mono">{l.rank}</span><span className="n">{l.name}<small>{l.college}</small></span><span className="p mono">{l.points}</span></li>
                  ))}
                </ol>
              ) : <p className="lv-empty">Points appear after the first quiz question.</p>}
            </div>
          </div>
          {shown && (
            <div className="btn-row" style={{ marginTop: 12 }}>
              {shown.status === "live" && <button className="btn primary" onClick={() => close(shown)}>Close & show answer</button>}
              {shown.status !== "live" && <button className="btn primary" onClick={() => goLive(shown)}>{shown.status === "closed" ? "Open again" : "Go live"}</button>}
              {(() => { const i = polls.findIndex((p) => p._id === shown._id); const nxt = polls.slice(i + 1).find((p) => p.status === "draft"); return nxt && shown.status !== "live" ? <button className="btn" onClick={() => goLive(nxt)}>Next question →</button> : null; })()}
            </div>
          )}
        </div>

        <div className="lv-side">
          <div className="card">
            <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Questions</h3>
              {!adding && !editing && <button className="btn sm" onClick={() => setAdding(true)}>+ Add</button>}
            </div>
            {(adding || editing) && (
              <PollForm
                key={editing?._id || "new"}
                initial={editing ? { question: editing.question, options: [...editing.options, "", "", ""].slice(0, 4), correct: editing.correct ?? 0, timeLimitSec: editing.timeLimitSec, kind: editing.correct === null || editing.correct === undefined ? "poll" : "quiz" } : null}
                onSave={save}
                onCancel={() => { setAdding(false); setEditing(null); }}
              />
            )}
            <div className="lv-list">
              {polls.map((p, i) => (
                <div key={p._id} className={`lv-item ${shown?._id === p._id ? "sel" : ""}`} onClick={() => setStageId(p._id)}>
                  <div className="lv-item-top">
                    <span className="mono" style={{ color: "var(--faint)" }}>{i + 1}.</span>
                    <span className="lv-item-q">{p.question}</span>
                    <span className={`badge ${p.status === "live" ? "good" : p.status === "closed" ? "" : "warn"}`}>{p.status === "draft" ? "ready" : p.status}</span>
                  </div>
                  <div className="lv-item-meta">
                    {p.correct === null || p.correct === undefined ? "Poll" : `Answer: ${p.options[p.correct]}`} · {p.timeLimitSec}s{p.total ? ` · ${p.total} answers` : ""}
                  </div>
                  <div className="btn-row" onClick={(e) => e.stopPropagation()}>
                    {p.status === "live" ? <button className="btn sm primary" onClick={() => close(p)}>Close</button> : <button className="btn sm primary" onClick={() => goLive(p)}>Go live</button>}
                    {p.status === "draft" && <button className="btn sm" onClick={() => { setAdding(false); setEditing(p); }}>Edit</button>}
                    {p.status !== "draft" && <button className="btn sm" onClick={() => reset(p)}>Reset</button>}
                    <button className="btn sm danger" onClick={() => del(p)}>Delete</button>
                  </div>
                </div>
              ))}
              {data && !polls.length && !adding && <div className="empty">No questions yet. Add one, or let AI draft them below.</div>}
            </div>
            <div className="lv-gen">
              <label>Draft questions with AI</label>
              <div className="btn-row">
                <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. prompts, Gemini API, building a chatbot" style={{ flex: 1, minWidth: 0 }} />
                <button className="btn sm" onClick={generate} disabled={busy}>{busy ? "Writing…" : "Draft 5"}</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Q&A from WhatsApp</h3>
              <span className="badge">{(data?.questions || []).filter((q) => q.status === "new").length} new</span>
            </div>
            {!data?.liveMode && <p className="hint" style={{ fontSize: 12.5, color: "var(--muted)" }}>Turn on <b>Live Q&A</b> (top right) during the session to collect students' questions here.</p>}
            <div className="lv-qa">
              {(data?.questions || []).map((q) => (
                <div key={q._id} className={`lv-qa-item ${q.status === "answered" ? "done" : ""} ${q.pinned ? "pin" : ""}`}>
                  <div className="lv-qa-text">{q.text}</div>
                  <div className="lv-qa-meta">
                    <span>{q.name}{q.college ? ` · ${q.college}` : ""}</span>
                    <span className="grow" />
                    <button className="btn sm" onClick={() => setQ(q, { pinned: !q.pinned })}>{q.pinned ? "Unpin" : "Pin"}</button>
                    {q.status !== "answered" ? <button className="btn sm" onClick={() => setQ(q, { status: "answered" })}>Answered</button> : <button className="btn sm" onClick={() => setQ(q, { status: "new" })}>Undo</button>}
                    <button className="btn sm" onClick={() => setQ(q, { status: "hidden" })}>Hide</button>
                  </div>
                </div>
              ))}
              {data?.questions?.length === 0 && <div className="empty">No questions yet.</div>}
            </div>
          </div>
        </div>
      </div>
      {toast}
    </>
  );
}
