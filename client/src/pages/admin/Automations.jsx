import { useEffect, useState } from "react";
import { admin } from "../../api.js";
import { useLoad, useToast } from "../../components/ui.jsx";

const TRIGGER = { on_register: "When someone registers", before_event: "Before the workshop", after_event: "After the workshop", abandoned: "Abandoned registration" };
const VARS = ["name", "full_name", "college", "event_name", "date", "time", "duration", "join_link"];

export default function Automations() {
  const [toast, show] = useToast();
  const autos = useLoad(() => admin.get("/automations"));
  const tpls = useLoad(() => admin.get("/templates"));
  const [tid, setTid] = useState(null);
  const [draft, setDraft] = useState({ subject: "", body: "" });
  const [to, setTo] = useState("");

  const t = tpls.data?.find((x) => x._id === tid);
  useEffect(() => { if (tpls.data && !tid && tpls.data.length) setTid(tpls.data[0]._id); }, [tpls.data]);
  useEffect(() => { if (t) setDraft({ subject: t.subject || "", body: t.body }); }, [tid, tpls.data]);

  async function patch(a, p) {
    try { await admin.put(`/automations/${a._id}`, p); autos.reload(); } catch (e) { show(e.message, true); }
  }
  const toggleCh = (a, c) => patch(a, { channels: a.channels.includes(c) ? a.channels.filter((x) => x !== c) : [...a.channels, c] });

  async function saveTpl() {
    try { await admin.put(`/templates/${tid}`, draft); show("Template saved"); tpls.reload(); } catch (e) { show(e.message, true); }
  }
  async function testTpl() {
    try { await admin.post(`/templates/${tid}/test`, { to }); show(t.channel === "email" ? "Test email sent (check SMTP log if it doesn't arrive)" : "Test message queued"); } catch (e) { show(e.message, true); }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Automations</h1>
          <p>Messages that send themselves. Turn them on or off, change the timing, edit the wording.</p>
        </div>
      </div>

      <div className="grid g2">
        {autos.data?.map((a) => (
          <div className="card" key={a._id} style={{ opacity: a.enabled ? 1 : 0.6 }}>
            <div className="btn-row" style={{ justifyContent: "space-between" }}>
              <b>{a.label}</b>
              <input type="checkbox" className="toggle" checked={a.enabled} onChange={(e) => patch(a, { enabled: e.target.checked })} />
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, margin: "4px 0 10px" }}>{TRIGGER[a.trigger]}</div>
            {a.trigger === "before_event" && (
              <div className="field" style={{ maxWidth: 220 }}>
                <label>Minutes before start</label>
                <input type="number" min="1" defaultValue={a.offsetMinutes} onBlur={(e) => Number(e.target.value) !== a.offsetMinutes && patch(a, { offsetMinutes: Number(e.target.value) })} />
                <span className="hint">Applies to people who register after this change. Changing the event time re-plans everyone.</span>
              </div>
            )}
            <div className="btn-row">
              <label className="check"><input type="checkbox" checked={a.channels.includes("whatsapp")} onChange={() => toggleCh(a, "whatsapp")} /> WhatsApp</label>
              <label className="check"><input type="checkbox" checked={a.channels.includes("email")} onChange={() => toggleCh(a, "email")} /> Email</label>
              <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>Sent: <b className="mono">{a.sentCount}</b></span>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Message templates</h3>
        <div className="grid" style={{ gridTemplateColumns: "minmax(200px, 260px) 1fr", alignItems: "start" }}>
          <div className="qlist">
            {tpls.data?.map((x) => (
              <div key={x._id} className={`qitem ${x._id === tid ? "sel" : ""}`} onClick={() => setTid(x._id)}>
                <span className="qlabel">{x.key}</span><span className="badge">{x.channel}</span>
              </div>
            ))}
          </div>
          {t && (
            <div>
              {t.channel === "email" && <div className="field"><label>Subject</label><input type="text" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></div>}
              <div className="field">
                <label>Message</label>
                <textarea style={{ minHeight: 220 }} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <span className="hint">Click a variable to add it: {VARS.map((v) => <code key={v} className="mono" style={{ cursor: "pointer", marginRight: 6 }} onClick={() => setDraft({ ...draft, body: draft.body + `{{${v}}}` })}>{`{{${v}}}`}</code>)}</span>
              </div>
              <div className="btn-row">
                <button className="btn primary" onClick={saveTpl}>Save template</button>
                <input style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "8px 11px", width: 220 }} placeholder={t.channel === "email" ? "Send test to email" : "Send test to phone (91…)"} value={to} onChange={(e) => setTo(e.target.value)} />
                <button className="btn" onClick={testTpl} disabled={!to}>Send test</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {toast}
    </>
  );
}
