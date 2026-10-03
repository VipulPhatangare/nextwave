import { useEffect, useState } from "react";
import { admin } from "../../api.js";
import { useLoad, useSocketEvent, useToast, fmtDateTime } from "../../components/ui.jsx";
import MediaPicker from "../../components/MediaPicker.jsx";
import { confirmDialog } from "../../components/Dialog.jsx";

const VARS = ["name", "college", "event_name", "date", "time", "join_link"];

export default function Announcements() {
  const [toast, show] = useToast();
  const history = useLoad(() => admin.get("/announcements"));
  const [f, setF] = useState({ subject: "", body: "", channels: ["whatsapp"], segment: {}, when: "" });
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState(null);
  const [brief, setBrief] = useState("");
  const [drafting, setDrafting] = useState(false);

  useSocketEvent("announcement:progress", () => history.reload());

  async function draft() {
    setDrafting(true);
    try {
      const r = await admin.post("/ai/draft", { brief, channel: f.channels.includes("email") && !f.channels.includes("whatsapp") ? "email" : "whatsapp" });
      setF((x) => ({ ...x, body: r.text }));
      show("Draft written. Read it and edit before sending.");
    } catch (e) {
      show(e.message, true);
    } finally {
      setDrafting(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => admin.post("/announcements/preview-count", { segment: f.segment }).then((r) => setCount(r.count)).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [JSON.stringify(f.segment)]);

  const seg = (k, v) => setF({ ...f, segment: { ...f.segment, [k]: v || undefined } });
  const toggleCh = (c) => setF({ ...f, channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c] });

  async function send() {
    if (!f.body.trim() && !media) return show("Write a message or attach a file first.", true);
    if (!f.channels.length) return show("Choose WhatsApp, email or both.", true);
    if (!f.when && !(await confirmDialog({ title: "Send announcement now?", message: `This goes to ${count ?? "all"} people on WhatsApp right away${media ? `, with "${media.original}" attached` : ""}.`, confirmText: "Send now" }))) return;
    setBusy(true);
    try {
      await admin.post("/announcements", { subject: f.subject, title: f.subject, body: f.body, mediaId: media?._id, channels: f.channels, segment: f.segment, scheduledAt: f.when ? new Date(f.when).toISOString() : undefined });
      show(f.when ? "Scheduled" : "Sending started");
      setF({ ...f, body: "", subject: "" });
      setMedia(null);
      history.reload();
    } catch (e) {
      show(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Announcements</h1>
          <p>Write once, send on WhatsApp, email or both, to everyone or a segment.</p>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <h3>Compose</h3>
          <div className="btn-row" style={{ marginBottom: 12 }}>
            <label className="check"><input type="checkbox" checked={f.channels.includes("whatsapp")} onChange={() => toggleCh("whatsapp")} /> WhatsApp</label>
            <label className="check"><input type="checkbox" checked={f.channels.includes("email")} onChange={() => toggleCh("email")} /> Email</label>
          </div>
          {f.channels.includes("email") && <div className="field"><label>Email subject</label><input type="text" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>}
          <div className="field">
            <label>Message</label>
            <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Hi {{name}}, a quick update about {{event_name}}…" />
            <span className="hint">Variables: {VARS.map((v) => <code key={v} className="mono" style={{ cursor: "pointer", marginRight: 6 }} onClick={() => setF({ ...f, body: f.body + `{{${v}}}` })}>{`{{${v}}}`}</code>)}</span>
          </div>
          <div className="field">
            <label>Attachment (optional)</label>
            <MediaPicker value={media} onChange={setMedia} />
            <span className="hint">An image or PDF. On WhatsApp it's sent with your message as the caption. On email it's attached.</span>
          </div>
          <div className="field">
            <label>Write it with AI (optional)</label>
            <div className="btn-row" style={{ flexWrap: "nowrap" }}>
              <input type="text" className="plain-input" style={{ flex: 1 }} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Remind everyone about tomorrow's session and ask them to bring a laptop" />
              <button type="button" className="btn" onClick={draft} disabled={drafting || brief.trim().length < 5}>{drafting ? "Writing…" : "Draft"}</button>
            </div>
            <span className="hint">Uses a little of your AI budget. Always read the draft before sending.</span>
          </div>
          <div className="field"><label>Send later (optional)</label><input type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} /></div>
        </div>

        <div className="card">
          <h3>Who gets it</h3>
          <div className="row2">
            <div className="field"><label>Status</label>
              <select value={f.segment.status || ""} onChange={(e) => seg("status", e.target.value)}>
                <option value="">Everyone (not cancelled)</option>
                <option value="registered">Registered</option><option value="confirmed">Confirmed</option><option value="attended">Attended</option><option value="no_show">No-show</option>
              </select>
            </div>
          </div>
          <div className="row2">
            <div className="field"><label>College contains</label><input type="text" value={f.segment.college || ""} onChange={(e) => seg("college", e.target.value)} /></div>
            <div className="field"><label>Source code</label><input type="text" value={f.segment.sourceCode || ""} onChange={(e) => seg("sourceCode", e.target.value.toUpperCase())} /></div>
          </div>
          <div style={{ background: "var(--accent-bg)", borderRadius: 10, padding: 14, margin: "6px 0 14px" }}>
            This will reach <b className="mono" style={{ fontSize: 20 }}>{count ?? "…"}</b> people (those who opted out of a channel are skipped on it).
          </div>
          <button className="btn primary" onClick={send} disabled={busy}>{f.when ? "Schedule" : "Send now"}</button>
        </div>
      </div>

      <div className="card scroll-x">
        <h3>History</h3>
        <table className="t">
          <thead><tr><th>Created</th><th>Message</th><th>Channels</th><th>Reached</th><th>Failed</th><th>Status</th></tr></thead>
          <tbody>
            {history.data?.map((a) => (
              <tr key={a._id}>
                <td>{fmtDateTime(a.createdAt)}</td>
                <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.body}</td>
                <td>{a.channels.join(" + ")}</td>
                <td className="mono">{a.stats.sent}/{a.stats.total}</td>
                <td className="mono">{a.stats.failed}</td>
                <td><span className="badge">{a.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.data?.length === 0 && <div className="empty">No announcements yet.</div>}
      </div>
      {toast}
    </>
  );
}
