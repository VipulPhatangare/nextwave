import { useState } from "react";
import { admin, getToken } from "../../api.js";
import { useLoad, useToast, Stat, StatusBadge, fmtDateTime } from "../../components/ui.jsx";
import { confirmDialog } from "../../components/Dialog.jsx";

export default function Attendance() {
  const [toast, show] = useToast();
  const stats = useLoad(() => admin.get("/attendance"));
  const list = useLoad(() => admin.get("/registrations?status=attended&size=100"));
  const [busy, setBusy] = useState(false);

  async function markNoShows() {
    if (!(await confirmDialog({ title: "Mark no-shows?", message: "Everyone who didn't join will be marked as no-show. Do this after the workshop ends.", confirmText: "Mark no-shows" }))) return;
    const r = await admin.post("/attendance/mark-no-shows");
    show(`${r.count} marked as no-show`);
    stats.reload(); list.reload();
  }
  async function sendAll() {
    if (!(await confirmDialog({ title: "Send certificates?", message: "Certificates will go to everyone who attended and hasn't received one yet.", confirmText: "Send certificates" }))) return;
    setBusy(true);
    try {
      const r = await admin.post("/certificates/send", {});
      show(`${r.queued} of ${r.total} certificates sent`);
      stats.reload(); list.reload();
    } catch (e) {
      show(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function sendOne(r) {
    try {
      const out = await admin.post("/certificates/send", { ids: [r._id] });
      show(out.queued ? "Certificate sent" : "Nothing to send: no WhatsApp or email on file", !out.queued);
      list.reload();
    } catch (e) {
      show(e.message, true);
    }
  }
  async function preview(r) {
    const res = await fetch(`/api/admin/certificates/preview/${r._id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    window.open(URL.createObjectURL(await res.blob()), "_blank");
  }

  const s = stats.data;
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Attendance and certificates</h1>
          <p>Each student gets a personal join link. Opening it within 15 minutes of the start marks them attended.</p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={markNoShows}>Mark no-shows</button>
          <button className="btn primary" onClick={sendAll} disabled={busy}>{busy ? "Sending…" : "Send certificates to attendees"}</button>
        </div>
      </div>

      {s && (
        <div className="grid g4">
          <Stat hot n={`${s.rate}%`} label="Attendance rate" sub={`${s.attended} of ${s.eligible} registered`} />
          <Stat n={s.attended} label="Attended" />
          <Stat n={s.confirmed} label="Said YES, not joined yet" />
          <Stat n={s.noShow} label="No-shows" />
          <Stat n={s.certificatesSent} label="Certificates sent" />
        </div>
      )}

      <div className="card scroll-x">
        <h3>Attendees</h3>
        <table className="t">
          <thead><tr><th>Name</th><th>College</th><th>Joined at</th><th>Certificate</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((r) => (
              <tr key={r._id}>
                <td><b>{r.name}</b></td>
                <td>{r.college || "–"}</td>
                <td>{fmtDateTime(r.attendedAt)}</td>
                <td>{r.certificateSentAt ? <span className="badge good">sent {fmtDateTime(r.certificateSentAt)}</span> : <span className="badge">not sent</span>}</td>
                <td><div className="btn-row"><button className="btn sm" onClick={() => preview(r)}>Preview</button><button className="btn sm" onClick={() => sendOne(r)}>{r.certificateSentAt ? "Resend" : "Send"}</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data?.items.length === 0 && <div className="empty">Nobody has joined yet. Attendees appear here as they open their personal join link, or when you mark them manually in Registrations.</div>}
      </div>
      {toast}
    </>
  );
}
