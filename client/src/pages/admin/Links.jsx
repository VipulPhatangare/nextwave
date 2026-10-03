import { useState } from "react";
import { admin, getToken } from "../../api.js";
import { useLoad, useToast } from "../../components/ui.jsx";
import { confirmDialog } from "../../components/Dialog.jsx";
import { downloadFile } from "../../components/MediaPicker.jsx";

const TYPES = [["captain", "Campus captain"], ["group", "WhatsApp group"], ["instagram", "Instagram page"], ["tpo", "TPO / faculty"], ["linkedin", "LinkedIn"], ["other", "Other"]];

export default function Links() {
  const [toast, show] = useToast();
  const { data, reload } = useLoad(() => admin.get("/links"));
  const [f, setF] = useState({ code: "", label: "", type: "captain", owner: "" });
  const [qr, setQr] = useState(null);

  async function create(e) {
    e.preventDefault();
    try {
      await admin.post("/links", f);
      setF({ code: "", label: "", type: "captain", owner: "" });
      show("Link created");
      reload();
    } catch (err) {
      show(err.message, true);
    }
  }
  async function showQr(link, channel) {
    const res = await fetch(`/api/admin/links/${link.code}/qr?channel=${channel}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (qr?.url) URL.revokeObjectURL(qr.url);
    setQr({ link, channel, url: URL.createObjectURL(await res.blob()) });
  }
  async function downloadQr(format) {
    try {
      await downloadFile(`/api/admin/links/${qr.link.code}/qr?channel=${qr.channel}&size=1200&format=${format}&download=1`, `QR-${qr.link.code}-${qr.channel}.${format}`);
    } catch (e) {
      show(e.message, true);
    }
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); show("Copied"); } catch (_) { show("Select and copy manually", true); }
  }
  async function del(code) {
    if (!(await confirmDialog({ title: `Delete link ${code}?`, message: "Registrations that came through it keep their source code.", confirmText: "Delete", danger: true }))) return;
    await admin.del(`/links/${code}`);
    reload();
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Campaign links</h1>
          <p>One code per captain, group or page. The dashboard shows which sources actually bring registrations.</p>
        </div>
      </div>

      <form className="card" onSubmit={create}>
        <h3>New link</h3>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", alignItems: "end" }}>
          <div className="field" style={{ margin: 0 }}><label>Code</label><input type="text" placeholder="CLG-ABC" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} required /></div>
          <div className="field" style={{ margin: 0 }}><label>Label</label><input type="text" placeholder="ABC College captain" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} required /></div>
          <div className="field" style={{ margin: 0 }}><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field" style={{ margin: 0 }}><label>Owner</label><input type="text" placeholder="Who runs it" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></div>
          <button className="btn primary" style={{ height: 38 }}>Create</button>
        </div>
      </form>

      <div className="card scroll-x">
        <table className="t">
          <thead><tr><th>Code</th><th>Label</th><th>Type</th><th>Clicks</th><th>Registered</th><th>Conversion</th><th>Links</th><th /></tr></thead>
          <tbody>
            {data?.map((l) => (
              <tr key={l.code}>
                <td className="mono"><b>{l.code}</b></td>
                <td>{l.label}{l.owner && <div style={{ fontSize: 12, color: "var(--muted)" }}>{l.owner}</div>}</td>
                <td><span className="badge">{l.type}</span></td>
                <td className="mono">{l.clicks}</td>
                <td className="mono">{l.registrations}</td>
                <td className="mono">{l.clicks ? Math.round((l.registrations / l.clicks) * 100) + "%" : "–"}</td>
                <td>
                  <div className="btn-row">
                    <button className="btn sm" onClick={() => copy(l.webUrl)}>Copy web link</button>
                    {l.waUrl && <button className="btn sm" onClick={() => copy(l.waUrl)}>Copy WhatsApp link</button>}
                    <button className="btn sm" onClick={() => showQr(l, l.waUrl ? "whatsapp" : "web")}>QR</button>
                  </div>
                </td>
                <td><button className="btn sm danger" onClick={() => del(l.code)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <div className="empty">No links yet. Create one above, then share it with a captain or post it in a group.</div>}
        {data?.length > 0 && !data[0].waUrl && <p style={{ fontSize: 13, color: "var(--muted)" }}>WhatsApp links appear once <span className="mono">WA_BOT_NUMBER</span> is set in the server's .env file.</p>}
      </div>

      {qr && (
        <>
          <div className="drawer-bg" onClick={() => setQr(null)} />
          <div className="drawer" style={{ textAlign: "center" }}>
            <h2 style={{ marginTop: 0, marginBottom: 4 }}>{qr.link.code}</h2>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--muted)" }}>{qr.link.label}</p>
            <div className="btn-row" style={{ justifyContent: "center", marginBottom: 14 }}>
              {qr.link.waUrl && <button className={`tab ${qr.channel === "whatsapp" ? "on" : ""}`} onClick={() => showQr(qr.link, "whatsapp")}>Opens WhatsApp</button>}
              <button className={`tab ${qr.channel === "web" ? "on" : ""}`} onClick={() => showQr(qr.link, "web")}>Opens the website</button>
            </div>
            <div className="qr-box"><img src={qr.url} alt={`QR for ${qr.link.code}`} /></div>
            <p className="mono" style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-all", margin: "10px 0 14px" }}>{qr.channel === "whatsapp" ? qr.link.shortUrl : qr.link.webUrl}</p>
            <div className="btn-row" style={{ justifyContent: "center", marginBottom: 8 }}>
              <button className="btn primary" onClick={() => downloadQr("png")}>Download PNG</button>
              <button className="btn" onClick={() => downloadQr("svg")}>Download SVG (print)</button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 16px" }}>
              High resolution (1200 px), ready for posters.{" "}
              {qr.channel === "web" || /\/w\//.test(qr.link.shortUrl || "")
                ? "Scans are counted on this link."
                : "Scans can't be counted yet: set CLIENT_URL to your public website so this QR uses a short tracked link."}
            </p>
            <button className="btn" onClick={() => { URL.revokeObjectURL(qr.url); setQr(null); }}>Close</button>
          </div>
        </>
      )}
      {toast}
    </>
  );
}
