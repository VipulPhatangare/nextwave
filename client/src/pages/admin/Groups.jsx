import { useEffect, useState } from "react";
import { admin } from "../../api.js";
import { useLoad, useSocketEvent, useToast, fmtDateTime } from "../../components/ui.jsx";
import MediaPicker, { downloadFile } from "../../components/MediaPicker.jsx";
import WaPreview from "../../components/WaPreview.jsx";

const CAPTION_LIMIT = 1024; // WhatsApp cuts longer captions under an image

const DEFAULT_MSG = `🚀 Free online workshop for final-year students

*Build Your First AI Project in 60 Minutes*
You'll build a working AI project live and get a certificate.

✅ Free  ✅ Just a laptop  ✅ Certificate

Register in 20 seconds 👉 {{group_link}}`;

export default function Groups() {
  const [toast, show] = useToast();
  const groups = useLoad(() => admin.get("/wa/groups"));
  const history = useLoad(() => admin.get("/wa/broadcasts"));
  const [sel, setSel] = useState(new Set());
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState(DEFAULT_MSG);
  const [when, setWhen] = useState("");
  const [media, setMedia] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [previewId, setPreviewId] = useState("");

  // refresh from WhatsApp whenever this page opens, so a group you just created is already here
  useEffect(() => {
    admin.post("/wa/groups/sync").then(() => groups.reload()).catch(() => {});
  }, []);

  useSocketEvent("broadcast:progress", (p) => {
    setProgress(p);
    if (p.done) { history.reload(); groups.reload(); show("Broadcast finished"); }
  });

  const list = (groups.data || []).filter((g) => (g.name + " " + (g.tags || []).join(" ")).toLowerCase().includes(filter.toLowerCase()));
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function sync() {
    setSyncing(true);
    try {
      const r = await admin.post("/wa/groups/sync");
      show(`Found ${r.count} groups`);
      groups.reload();
    } catch (e) {
      show(e.message, true);
    } finally {
      setSyncing(false);
    }
  }
  async function saveTags(g, text) {
    await admin.put(`/wa/groups/${g._id}`, { tags: text.split(",").map((t) => t.trim()).filter(Boolean) });
    groups.reload();
  }
  async function send() {
    if (!sel.size) return show("Pick at least one group.", true);
    try {
      await admin.post("/wa/broadcasts", { groupIds: [...sel], message: msg, mediaId: media?._id, scheduledAt: when ? new Date(when).toISOString() : undefined });
      show(when ? "Scheduled" : "Sending started. Groups are posted one at a time with a gap.");
      setProgress({ results: [], total: sel.size });
      history.reload();
    } catch (e) {
      show(e.message, true);
    }
  }

  const recentlyPosted = (g) => g.lastPostedAt && Date.now() - new Date(g.lastPostedAt).getTime() < 24 * 3600 * 1000;

  // preview as it will look in one of the chosen groups (with that group's own link)
  const all = groups.data || [];
  const chosen = all.filter((g) => sel.has(g.groupId));
  const pv = chosen.find((g) => g.groupId === previewId) || chosen[0] || all.find((g) => g.canSend) || null;
  const previewText = msg.replace(/\{\{\s*group_link\s*\}\}/g, pv?.link || "https://wa.me/…");
  async function downloadQr(g, format) {
    try {
      await downloadFile(`/api/admin/links/${g.linkCode}/qr?channel=whatsapp&size=1200&format=${format}&download=1`, `QR-${g.name.replace(/[^\w-]+/g, "-").slice(0, 40)}.${format}`);
    } catch (e) {
      show(e.message, true);
    }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Group broadcast</h1>
          <p>Post to the groups you're in, one at a time with a random gap. Each group gets its own tracked link.</p>
        </div>
        <button className="btn" onClick={sync} disabled={syncing}>{syncing ? "Refreshing…" : "Refresh groups from WhatsApp"}</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", alignItems: "stretch" }}>
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="btn-row" style={{ marginBottom: 12 }}>
            <input style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 9, padding: "8px 11px" }} placeholder="Search groups or tags" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="btn sm" onClick={() => setSel(new Set(list.filter((g) => g.canSend).map((g) => g.groupId)))}>Select shown</button>
            <button className="btn sm" onClick={() => setSel(new Set())}>Clear</button>
          </div>
          {/* the list fills whatever height the message card gives the row, and scrolls inside it */}
          <div style={{ flex: 1, minHeight: 360, position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden" }}>
            <table className="t" style={{ width: "100%", tableLayout: "fixed" }}>
              <thead><tr><th style={{ width: 34 }} /><th>Group</th><th style={{ width: 84 }}>Members</th><th className="hide-sm" style={{ width: 116 }}>Tags</th><th className="hide-sm" style={{ width: 92 }}>Posted</th></tr></thead>
              <tbody>
                {list.map((g) => (
                  <tr key={g._id}>
                    <td><input type="checkbox" disabled={!g.canSend} checked={sel.has(g.groupId)} onChange={() => toggle(g.groupId)} /></td>
                    <td style={{ overflowWrap: "anywhere" }}>{g.name}{!g.canSend && <div className="badge warn">admins only</div>}</td>
                    <td className="mono">{g.participants}</td>
                    <td className="hide-sm"><input defaultValue={(g.tags || []).join(", ")} placeholder="e.g. ABC, CSE" style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--line)", borderRadius: 7, padding: "4px 7px", fontSize: 13 }} onBlur={(e) => saveTags(g, e.target.value)} /></td>
                    <td className="hide-sm">{g.lastPostedAt ? <span className={`badge ${recentlyPosted(g) ? "warn" : ""}`} style={{ whiteSpace: "normal" }}>{fmtDateTime(g.lastPostedAt)}</span> : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {groups.data?.length === 0 && <div className="empty">No groups yet. Connect WhatsApp in Settings, then press "Sync groups".</div>}
          </div>
          </div>
          {list.some((g) => sel.has(g.groupId) && recentlyPosted(g)) && <p style={{ color: "var(--warn)", fontSize: 13 }}>⚠ Some selected groups were posted to in the last 24 hours. Posting too often looks like spam.</p>}
        </div>

        <div className="card">
          <h3>Message</h3>
          <div className="field"><textarea style={{ minHeight: 220 }} value={msg} onChange={(e) => setMsg(e.target.value)} /><span className="hint"><span className="mono">{"{{group_link}}"}</span> becomes that group's own link.</span></div>
          <div className="field">
            <label>Attach an image or PDF (optional)</label>
            <MediaPicker value={media} onChange={setMedia} />
            <span className="hint">The message above becomes the caption.</span>
            {media?.kind === "image" && msg.length > CAPTION_LIMIT && (
              <span className="hint" style={{ color: "var(--warn)" }}>⚠ {msg.length} characters. WhatsApp shows only about {CAPTION_LIMIT} under an image, so shorten it.</span>
            )}
          </div>

          <div className="field">
            <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ margin: 0 }}>Preview</label>
              {chosen.length > 1 && (
                <select className="plain-input" style={{ maxWidth: 220 }} value={pv?.groupId || ""} onChange={(e) => setPreviewId(e.target.value)} aria-label="Preview for group">
                  {chosen.map((g) => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
                </select>
              )}
            </div>
            <WaPreview text={previewText} media={media} title={pv?.name || "Your group"} subtitle={pv ? `${pv.participants} members` : "Pick a group to see its own link"} />
            {pv && (
              <div className="btn-row" style={{ justifyContent: "center", marginTop: 8 }}>
                <button type="button" className="btn sm" onClick={() => downloadQr(pv, "png")}>Download QR for this group (PNG)</button>
                <button type="button" className="btn sm" onClick={() => downloadQr(pv, "svg")}>SVG for print</button>
              </div>
            )}
            {pv && !/\/w\//.test(pv.link || "") && (
              <span className="hint" style={{ textAlign: "center" }}>Every group gets the same link until CLIENT_URL is your public website. Then each group's link and QR become short and tracked.</span>
            )}
          </div>
          <div className="field"><label>Send later (optional)</label><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /><span className="hint">8–10 PM works best. Leave blank to send now.</span></div>
          <button className="btn primary" onClick={send}>{when ? "Schedule" : "Send"} to {sel.size} group{sel.size === 1 ? "" : "s"}</button>

          {progress && (
            <div style={{ marginTop: 16 }}>
              <h3>Progress: {progress.results.length}/{progress.total}</h3>
              {progress.results.map((r) => (
                <div key={r.groupId} style={{ fontSize: 14, padding: "4px 0" }}>
                  {r.status === "sent" ? "✅" : "❌"} {r.name || r.groupId} {r.error && <span style={{ color: "var(--bad)" }}>· {r.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Recent broadcasts</h3>
        <table className="t">
          <thead><tr><th>When</th><th>Groups</th><th>Sent</th><th>Failed</th><th>Status</th></tr></thead>
          <tbody>
            {history.data?.map((b) => (
              <tr key={b._id}>
                <td>{fmtDateTime(b.createdAt)}</td><td className="mono">{b.groupIds.length}</td>
                <td className="mono">{b.results.filter((r) => r.status === "sent").length}</td>
                <td className="mono">{b.results.filter((r) => r.status === "failed").length}</td>
                <td><span className="badge">{b.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.data?.length === 0 && <div className="empty">Nothing sent yet.</div>}
      </div>
      {toast}
    </>
  );
}
