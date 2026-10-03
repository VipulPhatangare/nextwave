import { Fragment } from "react";
import { useMediaUrl, kb } from "./MediaPicker.jsx";

// WhatsApp formatting: *bold*, _italic_, ~strike~, ```mono```, and links.
function formatLine(line, key) {
  const parts = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```|https?:\/\/\S+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(line))) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${m.index}`;
    if (t.startsWith("http")) parts.push(<span key={k} className="wa-link">{t}</span>);
    else if (t.startsWith("```")) parts.push(<code key={k}>{t.slice(3, -3)}</code>);
    else if (t[0] === "*") parts.push(<b key={k}>{t.slice(1, -1)}</b>);
    else if (t[0] === "_") parts.push(<i key={k}>{t.slice(1, -1)}</i>);
    else parts.push(<s key={k}>{t.slice(1, -1)}</s>);
    last = m.index + t.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

export function WaText({ text }) {
  return String(text || "").split("\n").map((l, i, all) => (
    <Fragment key={i}>{formatLine(l, i)}{i < all.length - 1 && <br />}</Fragment>
  ));
}

// How a message (with an optional poster / PDF) will look in a WhatsApp group.
export default function WaPreview({ text, media, title = "Group", subtitle }) {
  const img = useMediaUrl(media);
  const time = new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return (
    <div className="wa-phone">
      <div className="wa-top">
        <div className="wa-avatar">{(title || "G").slice(0, 1).toUpperCase()}</div>
        <div className="wa-who"><b>{title}</b>{subtitle && <span>{subtitle}</span>}</div>
      </div>
      <div className="wa-wall">
        <div className={`wa-out ${media?.kind === "image" ? "has-img" : ""}`}>
          {media?.kind === "image" && (img ? <img src={img} alt="Poster preview" /> : <div className="wa-img-loading">Loading poster…</div>)}
          {media?.kind === "pdf" && (
            <div className="wa-doc">
              <span className="ic">PDF</span>
              <div><b>{media.original}</b><span>{kb(media.size)} · PDF</span></div>
            </div>
          )}
          {text?.trim() && <div className="wa-caption"><WaText text={text} /></div>}
          <div className="wa-meta">{time} <span className="ticks">✓✓</span></div>
        </div>
      </div>
    </div>
  );
}
