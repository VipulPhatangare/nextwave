import { useEffect, useState } from "react";
import { admin, getToken } from "../../api.js";
import { useLoad, useSocketEvent, useToast, fmtDateTime, Stat } from "../../components/ui.jsx";
import { confirmDialog } from "../../components/Dialog.jsx";

const TABS = [["", "All"], ["evaluated", "Needs review"], ["approved", "Verified"], ["rejected", "Rejected"]];
const STATUS = { evaluating: ["Checking…", ""], evaluated: ["Needs review", "warn"], approved: ["Verified", "good"], rejected: ["Rejected", "bad"], error: ["Error", "bad"] };

function Shot({ id }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url;
    fetch(`/api/admin/projects/${id}/image`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (b) { url = URL.createObjectURL(b); setSrc(url); } })
      .catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);
  if (!src) return <div className="pj-shot empty-shot">Loading screenshot…</div>;
  return <a href={src} target="_blank" rel="noreferrer" className="pj-shot"><img src={src} alt="Project screenshot" /></a>;
}

function Score({ ai }) {
  if (!ai || typeof ai.score !== "number") return <div className="pj-score none"><b>–</b><span>no AI score</span></div>;
  const parts = [["Works", ai.works, 4], ["Uses AI", ai.usesAi, 3], ["Effort", ai.effort, 3]];
  return (
    <div className="pj-score">
      <b className="mono">{ai.score}<small>/10</small></b>
      <div className="pj-parts">
        {parts.map(([l, v, max]) => (
          <div key={l} className="pj-part"><span>{l}</span><div className="bar"><div style={{ width: `${((v || 0) / max) * 100}%` }} /></div><span className="mono">{v}/{max}</span></div>
        ))}
      </div>
    </div>
  );
}

export default function Projects() {
  const [toast, show] = useToast();
  const [tab, setTab] = useState("");
  const { data, reload } = useLoad(() => admin.get(`/projects${tab ? `?status=${tab}` : ""}`), [tab]);
  useSocketEvent("project:new", () => reload());
  useSocketEvent("project:update", () => reload());

  async function act(fn, ok) {
    try { await fn(); if (ok) show(ok); reload(); } catch (e) { show(e.message, true); }
  }
  const setOpen = (open) => act(() => admin.put("/projects/settings", { open }), open ? "Submissions open: links and screenshots on WhatsApp count as projects" : "Submissions closed");
  const setAuto = (autoApprove) => act(() => admin.put("/projects/settings", { autoApprove }), "Saved");
  const decide = (p, status) => act(() => admin.put(`/projects/${p._id}`, { status }), status === "approved" ? "Verified. The student was told on WhatsApp." : "Saved");
  const recheck = (p) => act(() => admin.post(`/projects/${p._id}/recheck`), "Checked again");
  async function ask() {
    const n = data?.attended || 0;
    if (!n) return show("Nobody is marked as attended yet.", true);
    if (!(await confirmDialog({ title: `Ask ${n} attendees for their project?`, message: "Sends the PROJECT_INVITE WhatsApp template to everyone marked as attended, and opens submissions.", confirmText: "Send" }))) return;
    act(async () => { const r = await admin.post("/projects/ask"); show(`Sent to ${r.sent} attendees`); });
  }

  const c = data?.counts || {};
  const total = Object.values(c).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Projects</h1>
          <p>Students send a project link or screenshot on WhatsApp. AI scores it, they get feedback in a minute, and verified projects go on the certificate.</p>
        </div>
        <button className="btn primary" onClick={ask}>Ask attendees for projects</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <Stat n={total} label="Submitted" sub={data ? `${data.attended} attended` : ""} />
        <Stat n={c.approved || 0} label="Verified" hot />
        <Stat n={c.evaluated || 0} label="Need your review" />
        <Stat n={data?.avgScore ?? "–"} label="Average AI score" sub="out of 10" />
      </div>

      <div className="card">
        <div className="btn-row" style={{ alignItems: "center", gap: 18 }}>
          <label className="status"><input type="checkbox" className="toggle" checked={!!data?.open} onChange={(e) => setOpen(e.target.checked)} /> Accept submissions on WhatsApp</label>
          <label className="status">Auto-verify when AI score is at least
            <select value={data?.autoApprove ?? 6} onChange={(e) => setAuto(Number(e.target.value))} style={{ marginLeft: 6 }}>
              <option value={0}>never (review all)</option>
              {[5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}/10</option>)}
            </select>
          </label>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "10px 0 0" }}>
          Rubric: <b>Works</b> 0–4 (evidence it runs) · <b>Uses AI</b> 0–3 (a real model or API) · <b>Effort</b> 0–3 (own idea, extras, explanation). Each student gets up to 3 AI reviews a day; more go to you.
        </p>
      </div>

      <div className="btn-row" style={{ margin: "4px 0 14px" }}>
        {TABS.map(([v, l]) => <button key={v} className={`tab ${tab === v ? "on" : ""}`} onClick={() => setTab(v)}>{l}{v && c[v] ? ` (${c[v]})` : ""}</button>)}
      </div>

      <div className="pj-grid">
        {(data?.items || []).map((p) => {
          const [label, cls] = STATUS[p.status] || [p.status, ""];
          return (
            <div key={p._id} className="card pj-card">
              <div className="pj-top">
                <div><b>{p.name}</b><span>{p.college}{p.college ? " · " : ""}{fmtDateTime(p.createdAt)}</span></div>
                <span className={`badge ${cls}`}>{label}{p.reviewedBy === "AI" && p.status !== "evaluated" ? " · AI" : ""}</span>
              </div>
              {p.imageFile && <Shot id={p._id} />}
              {p.link && <a className="pj-link mono" href={p.link} target="_blank" rel="noreferrer noopener">{p.link.replace(/^https?:\/\//, "")}</a>}
              {p.note && <p className="pj-note">“{p.note}”</p>}
              <Score ai={p.ai} />
              {p.ai?.summary && <p className="pj-summary">{p.ai.summary}</p>}
              {p.ai?.feedback && <p className="pj-feedback">💡 {p.ai.feedback}</p>}
              {p.error && <p className="pj-err">{p.error}</p>}
              <div className="btn-row">
                {p.status !== "approved" && <button className="btn sm primary" onClick={() => decide(p, "approved")}>Verify</button>}
                {p.status !== "rejected" && <button className="btn sm" onClick={() => decide(p, "rejected")}>Reject</button>}
                <button className="btn sm" onClick={() => recheck(p)}>Re-check with AI</button>
              </div>
            </div>
          );
        })}
      </div>
      {data?.items?.length === 0 && <div className="card empty">No projects {tab ? "here" : "yet"}. Press <b>Ask attendees for projects</b> after the workshop, or turn on <b>Accept submissions</b>.</div>}
      {toast}
    </>
  );
}
