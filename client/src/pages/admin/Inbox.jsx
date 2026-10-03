import { useEffect, useMemo, useRef, useState } from "react";
import { admin } from "../../api.js";
import { useLoad, useSocketEvent, useToast } from "../../components/ui.jsx";
import MediaPicker from "../../components/MediaPicker.jsx";

const initials = (n) => (String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => Array.from(w)[0] || "").join("").toUpperCase() || "?");
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const fmtTime = (ts) => new Date(ts * 1000).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
function dayLabel(ts) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const y = new Date();
  y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
function listTime(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return sameDay(d, new Date()) ? fmtTime(ts) : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const TYPE_LABEL = {
  image: "Image", video: "Video", sticker: "Sticker", audio: "Audio", ptt: "Voice message", document: "Document",
  location: "Location", vcard: "Contact card", multi_vcard: "Contact cards", call_log: "Call", poll_creation: "Poll", gp2: "Group update",
};

function Linkified({ text }) {
  return String(text)
    .split(/(https?:\/\/[^\s]+)/g)
    .map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a> : <span key={i}>{p}</span>));
}

function Bubble({ m, group, prev }) {
  const showWho = group && !m.fromMe && m.sender && (!prev || prev.fromMe || prev.sender !== m.sender);
  const sameSender = prev && prev.fromMe === m.fromMe && prev.sender === m.sender;
  if (m.type === "revoked") {
    return (
      <div className={`msg ${m.fromMe ? "me" : ""} ${sameSender ? "tight" : ""}`}>
        {showWho && <span className="who">{m.sender}</span>}
        <span className="media-chip gone">Message deleted</span>
        <span className="meta">{fmtTime(m.at)}</span>
      </div>
    );
  }
  const isMedia = m.type !== "chat";
  const caption = isMedia && m.body && !/^\[.*\]$/.test(m.body) ? m.body : "";
  return (
    <div className={`msg ${m.fromMe ? "me" : ""} ${sameSender ? "tight" : ""}`}>
      {showWho && <span className="who">{m.sender}</span>}
      {isMedia ? <span className="media-chip">{TYPE_LABEL[m.type] || m.type || "Message"}</span> : <Linkified text={m.body} />}
      {caption && <span className="cap"><Linkified text={caption} /></span>}
      <span className="meta">{fmtTime(m.at)}</span>
    </div>
  );
}

export default function Inbox() {
  const [toast, show] = useToast();
  const chats = useLoad(() => admin.get("/wa/chats"));
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [text, setText] = useState("");
  const [media, setMedia] = useState(null);
  const [showAttach, setShowAttach] = useState(false);
  const end = useRef();
  const reloadTimer = useRef();

  async function open(c) {
    setCur(c);
    setMsgs([]);
    setLoadingMsgs(true);
    try {
      setMsgs(await admin.get(`/wa/chats/${encodeURIComponent(c.id)}/messages`));
    } catch (e) {
      show(e.message, true);
    } finally {
      setLoadingMsgs(false);
    }
  }
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, cur]);

  useSocketEvent("wa:message", (m) => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => chats.reload(), 1500);
    if (cur && m.chatId === cur.id) {
      setMsgs((a) => [...a, { id: `live-${Date.now()}-${a.length}`, fromMe: m.fromMe, body: m.body, at: m.at, type: "chat", sender: "" }]);
    }
  });

  async function send(e) {
    e.preventDefault();
    if ((!text.trim() && !media) || !cur) return;
    try {
      await admin.post(`/wa/chats/${encodeURIComponent(cur.id)}/send`, { body: text, mediaId: media?._id });
      if (media) show(`${media.original} queued`);
      setText("");
      setMedia(null);
      setShowAttach(false);
    } catch (err) {
      show(err.message, true);
    }
  }
  async function takeover(on) {
    const r = await admin.post(`/wa/chats/${encodeURIComponent(cur.id)}/takeover`, { on });
    setCur({ ...cur, takeover: r.on });
    show(r.on ? "Bot paused in this chat. You're replying manually." : "Bot is handling this chat again.");
  }

  const list = useMemo(
    () => (chats.data || [])
      .filter((c) => tab === "all" || (tab === "groups" ? c.isGroup : tab === "students" ? !c.isGroup : c.unread > 0))
      .filter((c) => !q.trim() || (c.name || "").toLowerCase().includes(q.trim().toLowerCase())),
    [chats.data, tab, q]
  );

  const rows = [];
  msgs.forEach((m, i) => {
    const prev = msgs[i - 1];
    if (!prev || !sameDay(new Date(prev.at * 1000), new Date(m.at * 1000))) rows.push(<div key={`d-${m.id}`} className="day-chip">{dayLabel(m.at)}</div>);
    rows.push(<Bubble key={m.id} m={m} group={cur?.isGroup} prev={prev && sameDay(new Date(prev.at * 1000), new Date(m.at * 1000)) ? prev : null} />);
  });

  return (
    <>
      <div className="page-title">
        <div>
          <h1>WhatsApp inbox</h1>
          <p>Read and reply from here. "Take over" stops the bot from answering in a one-to-one chat.</p>
        </div>
        <button className="btn" onClick={chats.reload}>Refresh</button>
      </div>
      <div className="tabs">
        {["all", "students", "groups", "unread"].map((t) => <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      <div className="chat-wrap">
        <div className="chat-list">
          <div className="chat-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" /></div>
          {list.map((c) => (
            <div key={c.id} className={`chat-item ${cur?.id === c.id ? "sel" : ""}`} onClick={() => open(c)}>
              <div className={`avatar ${c.isGroup ? "group" : ""}`}>{initials(c.name || c.id)}</div>
              <div className="body">
                <div className="nm"><span className="t">{c.name || c.id.split("@")[0]}</span><span className="when">{listTime(c.at)}</span></div>
                <div className="last"><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.last || (c.isGroup ? "Group" : "")}</span>{c.unread > 0 && <span className="badge accent">{c.unread}</span>}</div>
              </div>
            </div>
          ))}
          {chats.error && <div className="empty" style={{ color: "var(--bad)" }}>{chats.error}</div>}
          {!chats.error && !chats.loading && list.length === 0 && <div className="empty">{q ? "No chat matches that search." : tab === "all" ? "No chats yet. If WhatsApp isn't connected, link it in Settings first." : `No ${tab} chats in your latest 200.`}</div>}
        </div>

        <div className="chat-pane">
          {!cur ? (
            <div className="chat-empty"><b style={{ color: "var(--text)" }}>Pick a chat</b><span>Messages appear here. Replies go through the same safe send queue as the bot.</span></div>
          ) : (
            <>
              <div className="chat-head">
                <div className="who">
                  <div className={`avatar sm ${cur.isGroup ? "group" : ""}`}>{initials(cur.name || cur.id)}</div>
                  <div style={{ minWidth: 0 }}><b>{cur.name || cur.id.split("@")[0]}</b><span>{cur.isGroup ? "Group chat" : "One-to-one chat"}</span></div>
                </div>
                {!cur.isGroup && <label className="check"><input type="checkbox" className="toggle" checked={!!cur.takeover} onChange={(e) => takeover(e.target.checked)} /> Take over</label>}
              </div>
              <div className="msgs">
                {loadingMsgs && <div className="chat-empty">Loading messages…</div>}
                {!loadingMsgs && msgs.length === 0 && <div className="chat-empty">No messages loaded for this chat yet.</div>}
                {rows}
                <div ref={end} />
              </div>
              {(showAttach || media) && (
                <div style={{ padding: "10px 14px 0", background: "var(--raised)", borderTop: "1px solid var(--line)" }}>
                  <MediaPicker value={media} onChange={setMedia} />
                </div>
              )}
              <form className="chat-send" onSubmit={send} style={showAttach || media ? { borderTop: "none" } : undefined}>
                <button type="button" className={`btn ${showAttach || media ? "primary" : ""}`} style={{ borderRadius: 99, padding: "10px 14px" }} onClick={() => setShowAttach((v) => !v)} title="Attach an image or PDF" aria-label="Attach a file">+</button>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder={media ? "Add a caption (optional)" : cur.isGroup ? "Message this group" : "Type a message"} aria-label="Message" />
                <button className="btn primary" disabled={!text.trim() && !media}>Send</button>
              </form>
            </>
          )}
        </div>
      </div>
      {toast}
    </>
  );
}
