import { useEffect, useRef, useState } from "react";
import { admin, getToken } from "../api.js";

export const kb = (n) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

// A local object URL for an attached image (the file needs the admin token, so a plain <img src> won't do).
export function useMediaUrl(media) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url;
    let live = true;
    setSrc(null);
    if (media && media.kind === "image") {
      fetch(`/api/admin/media/${media._id}/file`, { headers: { Authorization: `Bearer ${getToken()}` } })
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => { if (b && live) { url = URL.createObjectURL(b); setSrc(url); } })
        .catch(() => {});
    }
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [media?._id]);
  return src;
}

// Download an admin-only file (QR codes etc.) under a given name.
export async function downloadFile(path, filename) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error("Download failed.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Attach an image or PDF. value = a media object or null; onChange(media | null).
export default function MediaPicker({ value, onChange, compact = false }) {
  const [lib, setLib] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const thumb = useMediaUrl(value);
  const fileRef = useRef();

  useEffect(() => { admin.get("/media").then(setLib).catch(() => {}); }, []);

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/media", { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setLib((l) => [data, ...l]);
      onChange(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="media-picker">
      <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => upload(e.target.files[0])} />
      {value ? (
        <div className="media-attached">
          {thumb ? <img src={thumb} alt="" /> : <span className="doc">{value.kind === "pdf" ? "PDF" : "IMG"}</span>}
          <div className="info"><b>{value.original}</b><span>{value.kind === "pdf" ? "Sent as a document" : "Sent as an image"} · {kb(value.size)}</span></div>
          <button type="button" className="btn sm" onClick={() => onChange(null)}>Remove</button>
        </div>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn sm" onClick={() => fileRef.current.click()} disabled={busy}>{busy ? "Uploading…" : compact ? "Attach" : "Attach image or PDF"}</button>
          {lib.length > 0 && (
            <select className="plain-input" style={{ maxWidth: 220 }} value="" onChange={(e) => { const m = lib.find((x) => x._id === e.target.value); if (m) onChange(m); }} aria-label="Pick a previous file">
              <option value="">Use a previous file…</option>
              {lib.map((m) => <option key={m._id} value={m._id}>{m.original}</option>)}
            </select>
          )}
        </div>
      )}
      {err && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 6 }}>{err}</div>}
    </div>
  );
}
