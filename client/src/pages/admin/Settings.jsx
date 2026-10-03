import { useEffect, useState } from "react";
import { admin } from "../../api.js";
import { useLoad, useSocketEvent, useToast, toLocalInput, fmtDateTime } from "../../components/ui.jsx";
import { confirmDialog } from "../../components/Dialog.jsx";

const START_PRESETS = [
  ["Short", "Hi! I want to register"],
  ["From Instagram", "Hi! I saw your post and want to register"],
  ["Hinglish", "Hi! Mujhe register karna hai"],
  ["With workshop name", "Hi! 👋 I'd like to register for *{{event_name}}*."],
];

export default function Settings() {
  const [toast, show] = useToast();
  const ev = useLoad(() => admin.get("/event"));
  const [f, setF] = useState(null);
  const [wa, setWa] = useState({ status: "disconnected", qr: null });
  const [tab, setTab] = useState("messages");
  const logs = useLoad(() => admin.get(tab === "messages" ? "/logs/messages" : tab === "emails" ? "/logs/emails" : "/audit"), [tab]);

  useEffect(() => { if (ev.data) setF({ ...ev.data, startAt: toLocalInput(ev.data.startAt) }); }, [ev.data]);
  useEffect(() => { admin.get("/wa/status").then(setWa).catch(() => {}); }, []);
  useSocketEvent("wa:status", (s) => setWa((w) => ({ status: s.status, qr: s.qr ?? (s.status === "connected" ? null : w.qr) })));

  if (!f) return <div className="empty">Loading…</div>;
  const set = (k, v) => setF({ ...f, [k]: v });
  const setS = (k, v) => setF({ ...f, settings: { ...f.settings, [k]: v } });

  async function save() {
    try {
      await admin.put("/event", {
        name: f.name, description: f.description, joinUrl: f.joinUrl, seatLimit: Number(f.seatLimit), target: Number(f.target),
        durationMin: Number(f.durationMin), registrationOpen: f.registrationOpen,
        startAt: f.startAt ? new Date(f.startAt).toISOString() : undefined,
        settings: { startMessage: f.settings.startMessage, otpRequired: f.settings.otpRequired, numberCheckMode: f.settings.numberCheckMode, quietHoursEnabled: f.settings.quietHoursEnabled, quietHours: f.settings.quietHours, waDailyLimit: Number(f.settings.waDailyLimit) },
      });
      show("Settings saved");
      ev.reload();
    } catch (e) {
      show(e.message, true);
    }
  }

  const statusText = { connected: "Connected", qr: "Waiting for QR scan", disconnected: "Not connected" }[wa.status];

  return (
    <>
      <div className="page-title">
        <div><h1>Settings</h1><p>Workshop details, safety limits and the WhatsApp connection.</p></div>
        <button className="btn primary" onClick={save}>Save settings</button>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <h3>Workshop</h3>
          <div className="field"><label>Name</label><input type="text" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="field"><label>Description</label><textarea style={{ minHeight: 70 }} value={f.description || ""} onChange={(e) => set("description", e.target.value)} /></div>
          <div className="row2">
            <div className="field"><label>Starts at</label><input type="datetime-local" value={f.startAt} onChange={(e) => set("startAt", e.target.value)} /></div>
            <div className="field"><label>Length (minutes)</label><input type="number" value={f.durationMin} onChange={(e) => set("durationMin", e.target.value)} /></div>
          </div>
          <div className="field"><label>Join link (Zoom / Meet)</label><input type="text" value={f.joinUrl || ""} onChange={(e) => set("joinUrl", e.target.value)} placeholder="https://meet.google.com/…" /></div>
          <div className="row2">
            <div className="field"><label>Seat limit</label><input type="number" value={f.seatLimit} onChange={(e) => set("seatLimit", e.target.value)} /></div>
            <div className="field"><label>Registration target</label><input type="number" value={f.target} onChange={(e) => set("target", e.target.value)} /></div>
          </div>
          <label className="check"><input type="checkbox" className="toggle" checked={f.registrationOpen} onChange={(e) => set("registrationOpen", e.target.checked)} /> Registrations are open</label>
        </div>

        <div className="card">
          <h3>Safety and limits</h3>
          <div className="field">
            <label>When the number isn't on WhatsApp</label>
            <select value={f.settings.numberCheckMode} onChange={(e) => setS("numberCheckMode", e.target.value)}>
              <option value="warn">Warn but allow registration</option>
              <option value="block">Block registration</option>
              <option value="off">Don't check</option>
            </select>
          </div>
          <label className="check" style={{ marginBottom: 10 }}><input type="checkbox" className="toggle" checked={f.settings.quietHoursEnabled} onChange={(e) => setS("quietHoursEnabled", e.target.checked)} /> Quiet hours (automatic messages wait until morning)</label>
          <div className="row2">
            <div className="field"><label>Quiet from</label><input type="text" value={f.settings.quietHours.start} onChange={(e) => setS("quietHours", { ...f.settings.quietHours, start: e.target.value })} /></div>
            <div className="field"><label>Until</label><input type="text" value={f.settings.quietHours.end} onChange={(e) => setS("quietHours", { ...f.settings.quietHours, end: e.target.value })} /></div>
          </div>
          <div className="field"><label>Max WhatsApp messages per day</label><input type="number" value={f.settings.waDailyLimit} onChange={(e) => setS("waDailyLimit", e.target.value)} /><span className="hint">A low limit and the built-in random delays protect your number from being flagged.</span></div>
          <div className="btn-row">
            <button className="btn" onClick={async () => { const r = await admin.post("/smtp/verify"); show(r.ok ? "Email is set up correctly" : `Email problem: ${r.error}`, !r.ok); }}>Test email connection</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Starting message on WhatsApp links</h3>
        <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 12px" }}>When a student taps one of your Instagram or QR links, WhatsApp opens with this message already typed. They just press Send. Nothing else is added to it.</p>
        <div className="btn-row" style={{ marginBottom: 10 }}>
          {START_PRESETS.map(([label, text]) => (
            <button key={label} type="button" className={`tab ${f.settings.startMessage === text ? "on" : ""}`} onClick={() => setS("startMessage", text)}>{label}</button>
          ))}
        </div>
        <div className="field">
          <textarea style={{ minHeight: 80 }} value={f.settings.startMessage || ""} onChange={(e) => setS("startMessage", e.target.value)} maxLength={300} />
          <span className="hint">Variable: <span className="mono">{"{{event_name}}"}</span>. Use *stars* around words for bold. {(f.settings.startMessage || "").length}/300</span>
        </div>
        <div className="phone-preview" style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>What the student's WhatsApp will have typed</div>
          <div className="bubble me" style={{ maxWidth: "100%" }}>{(f.settings.startMessage || "").replace(/\{\{\s*event_name\s*\}\}/g, f.name || "the workshop")}</div>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "10px 0 0" }}>Save settings to apply it. Links you already shared keep working, and new QR codes and links use the new message.</p>
      </div>

      <div className="card">
        <h3>Registration</h3>
        <label className="check" ><input type="checkbox" className="toggle" checked={!!f.settings.otpRequired} onChange={(e) => setS("otpRequired", e.target.checked)} /> Require students to verify their number with a WhatsApp code before registering on the website</label>
        <span className="hint" style={{ fontSize: 12, color: "var(--muted)" }}>Needs the bot connected. It stops fake and mistyped numbers but adds one step, so keep it off unless you see junk sign-ups.</span>
      </div>

      <div className="card">
        <h3>WhatsApp connection</h3>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <span className={`dot ${wa.status === "connected" ? "on" : wa.status === "qr" ? "warn" : "off"}`} />
          <b>{statusText}</b>
          {wa.status === "connected" && <button className="btn sm danger" onClick={async () => { if (await confirmDialog({ title: "Log out the bot?", message: "The bot number will be disconnected from WhatsApp. You'll need to scan the QR code again to reconnect.", confirmText: "Log out", danger: true })) { await admin.post("/wa/logout"); } }}>Log out bot</button>}
        </div>
        {wa.status === "qr" && wa.qr && (
          <div><img src={wa.qr} alt="WhatsApp QR code" style={{ width: 260, height: 260 }} /><p style={{ fontSize: 14, color: "var(--muted)" }}>On the bot's phone: WhatsApp → Linked devices → Link a device, then scan this code. Use a dedicated number, not your personal one.</p></div>
        )}
        {wa.status === "disconnected" && <p style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>If the server was started with <span className="mono">WA_ENABLED=false</span>, set it to true and restart. A QR code will appear here.</p>}
      </div>

      <div className="card scroll-x">
        <div className="btn-row" style={{ marginBottom: 10 }}>
          {[["messages", "WhatsApp log"], ["emails", "Email log"], ["audit", "Admin activity"]].map(([k, l]) => <button key={k} className={`btn sm ${tab === k ? "primary" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <table className="t">
          <thead>
            {tab === "messages" && <tr><th>When</th><th>Dir</th><th>Chat</th><th>Message</th><th>Status</th></tr>}
            {tab === "emails" && <tr><th>When</th><th>To</th><th>Subject</th><th>Status</th><th>Error</th></tr>}
            {tab === "audit" && <tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>}
          </thead>
          <tbody>
            {logs.data?.map((l) => tab === "messages" ? (
              <tr key={l._id}><td>{fmtDateTime(l.createdAt)}</td><td>{l.direction}</td><td className="mono">{(l.waId || "").split("@")[0]}</td><td style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.body}</td><td><span className={`badge ${l.status === "failed" ? "bad" : l.status === "sent" ? "good" : ""}`}>{l.status}</span>{l.error && <div style={{ fontSize: 12, color: "var(--bad)" }}>{l.error}</div>}</td></tr>
            ) : tab === "emails" ? (
              <tr key={l._id}><td>{fmtDateTime(l.createdAt)}</td><td>{l.to}</td><td>{l.subject}</td><td><span className={`badge ${l.status === "failed" ? "bad" : l.status === "sent" ? "good" : "warn"}`}>{l.status}</span></td><td style={{ color: "var(--muted)" }}>{l.error}</td></tr>
            ) : (
              <tr key={l._id}><td>{fmtDateTime(l.createdAt)}</td><td>{l.adminEmail}</td><td>{l.action}</td><td style={{ color: "var(--muted)" }}>{l.details}</td></tr>
            ))}
          </tbody>
        </table>
        {logs.data?.length === 0 && <div className="empty">Nothing logged yet.</div>}
      </div>
      {toast}
    </>
  );
}
