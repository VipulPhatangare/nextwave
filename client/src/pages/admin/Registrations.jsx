import { useEffect, useState } from "react";
import { admin, getToken } from "../../api.js";
import { useLoad, useToast, StatusBadge, fmtDateTime, phoneLabel } from "../../components/ui.jsx";

const STATUSES = ["registered", "confirmed", "attended", "no_show", "cancelled"];

export default function Registrations() {
  const [toast, show] = useToast();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);

  const qs = new URLSearchParams({ page, size: 25, ...(q && { q }), ...(status && { status }), ...(channel && { channel }) }).toString();
  const { data, reload, error } = useLoad(() => admin.get(`/registrations?${qs}`), [qs]);

  useEffect(() => setPage(1), [q, status, channel]);

  async function exportCsv() {
    const params = new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(channel && { channel }) }).toString();
    const res = await fetch(`/api/admin/registrations/export.csv?${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "registrations.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function bulk(statusValue) {
    try {
      await admin.post("/registrations/bulk-status", { ids: [...selected], status: statusValue });
      show(`Marked ${selected.size} as ${statusValue.replace("_", " ")}`);
      setSelected(new Set());
      reload();
    } catch (e) {
      show(e.message, true);
    }
  }

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Registrations</h1>
          <p>{data ? `${data.total} matching` : "Loading…"}</p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => setAdding(true)}>+ Add manually</button>
          <button className="btn" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="card">
        <div className="btn-row" style={{ marginBottom: 14 }}>
          <input style={{ flex: 1, minWidth: 200, border: "1px solid var(--line)", borderRadius: 9, padding: "8px 11px" }} placeholder="Search name, phone, email or college" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="btn" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          <select className="btn" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">All channels</option>
            <option value="web">Landing page</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        {selected.size > 0 && (
          <div className="btn-row" style={{ marginBottom: 12, padding: 10, background: "var(--accent-bg)", borderRadius: 9 }}>
            <b style={{ fontSize: 14 }}>{selected.size} selected</b>
            <button className="btn sm" onClick={() => bulk("attended")}>Mark attended</button>
            <button className="btn sm" onClick={() => bulk("no_show")}>Mark no-show</button>
            <button className="btn sm danger" onClick={() => bulk("cancelled")}>Cancel</button>
          </div>
        )}

        {error && <div className="empty">{error}</div>}
        <div className="scroll-x">
          <table className="t">
            <thead>
              <tr>
                <th />
                <th>Name</th><th>Phone</th><th>College</th><th>Channel</th><th>Source</th><th>Status</th><th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((r) => (
                <tr key={r._id} className="click" onClick={() => setOpen(r)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(r._id)} onChange={() => toggle(r._id)} /></td>
                  <td><b>{r.name}</b></td>
                  <td className="mono">{phoneLabel(r.phone)}</td>
                  <td>{r.college || "–"}</td>
                  <td><span className="badge">{r.channel}</span></td>
                  <td className="mono">{r.sourceCode || "–"}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{fmtDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && <div className="empty">No registrations match. Registrations from the landing page and WhatsApp appear here.</div>}
        </div>

        <div className="btn-row" style={{ justifyContent: "space-between", marginTop: 14 }}>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>Page {page} of {pages}</span>
          <div className="btn-row">
            <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      </div>

      {open && <Drawer reg={open} onClose={() => setOpen(null)} onChanged={(r) => { setOpen(r); reload(); }} show={show} />}
      {adding && <AddModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); show("Registration added"); }} show={show} />}
      {toast}
    </>
  );
}

function Drawer({ reg, onClose, onChanged, show }) {
  async function patch(p) {
    try {
      onChanged(await admin.put(`/registrations/${reg._id}`, p));
      show("Saved");
    } catch (e) {
      show(e.message, true);
    }
  }
  async function resend() {
    try {
      const r = await admin.post(`/registrations/${reg._id}/resend`);
      show(r.skipped ? `Not sent: ${r.skipped}` : "Confirmation re-sent");
    } catch (e) {
      show(e.message, true);
    }
  }
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <div className="drawer">
        <div className="btn-row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{reg.name}</h2>
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
        <dl className="kv">
          <dt>Phone</dt><dd className="mono">{phoneLabel(reg.phone)}{String(reg.phone).startsWith("lid:") && <span style={{ color: "var(--muted)", fontSize: 12 }}> (messages still reach them in WhatsApp)</span>}</dd>
          <dt>Email</dt><dd>{reg.email || "–"}</dd>
          <dt>College</dt><dd>{reg.college || "–"}</dd>
          <dt>Channel</dt><dd>{reg.channel}</dd>
          <dt>Source</dt><dd className="mono">{reg.sourceCode || "–"}</dd>
          <dt>On WhatsApp</dt><dd>{reg.waVerified === undefined ? "unknown" : reg.waVerified ? "yes" : "no"}</dd>
          <dt>Registered</dt><dd>{fmtDateTime(reg.createdAt)}</dd>
          {reg.attendedAt && (<><dt>Joined</dt><dd>{fmtDateTime(reg.attendedAt)}</dd></>)}
        </dl>
        <h3 style={{ fontSize: 14 }}>All answers</h3>
        <dl className="kv">
          {Object.entries(reg.answers || {}).map(([k, v]) => (<><dt key={k + "k"}>{k}</dt><dd key={k + "v"}>{Array.isArray(v) ? v.join(", ") : String(v)}</dd></>))}
        </dl>
        <div className="field">
          <label>Status</label>
          <select value={reg.status} onChange={(e) => patch({ status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </div>
        <label className="check" style={{ marginBottom: 8 }}><input type="checkbox" className="toggle" checked={reg.optedOutWa} onChange={(e) => patch({ optedOutWa: e.target.checked })} /> Opted out of WhatsApp</label>
        <label className="check" style={{ marginBottom: 16 }}><input type="checkbox" className="toggle" checked={reg.optedOutEmail} onChange={(e) => patch({ optedOutEmail: e.target.checked })} /> Opted out of email</label>
        <button className="btn" onClick={resend}>Resend confirmation</button>
      </div>
    </>
  );
}

function AddModal({ onClose, onDone, show }) {
  const [f, setF] = useState({ phone: "", name: "", college: "", email: "" });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await admin.post("/registrations", { phone: f.phone, answers: { name: f.name, college: f.college, email: f.email || undefined } });
      onDone();
    } catch (err) {
      show(err.message, true);
    } finally {
      setBusy(false);
    }
  }
  const row = (k, label, type = "text") => (
    <div className="field"><label>{label}</label><input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <form className="drawer" onSubmit={submit}>
        <h2 style={{ marginTop: 0 }}>Add a registration</h2>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>For offline sign-ups. They get the same confirmation as everyone else.</p>
        {row("name", "Full name")}
        {row("phone", "WhatsApp number")}
        {row("college", "College")}
        {row("email", "Email (optional)", "email")}
        <div className="btn-row"><button className="btn primary" disabled={busy}>Add</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </>
  );
}
