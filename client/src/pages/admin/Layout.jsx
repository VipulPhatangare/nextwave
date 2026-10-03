import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { admin, setToken } from "../../api.js";
import { useSocketEvent, useToast } from "../../components/ui.jsx";

const NAV = [
  { items: [["/admin", "Overview", true]] },
  { title: "People", items: [["/admin/registrations", "Registrations"], ["/admin/attendance", "Attendance & certificates"]] },
  { title: "Growth", items: [["/admin/links", "Campaign links"]] },
  { title: "Messaging", items: [["/admin/announcements", "Announcements"], ["/admin/groups", "Group broadcast"], ["/admin/inbox", "WhatsApp inbox"], ["/admin/ai", "AI assistant"], ["/admin/automations", "Automations"]] },
  { title: "Setup", items: [["/admin/form", "Form builder"], ["/admin/settings", "Settings"], ["/admin/team", "Team", false, "owner"]] },
];

export default function Layout() {
  const nav = useNavigate();
  const [toast, show] = useToast();
  const [wa, setWa] = useState("disconnected");
  const [queue, setQueue] = useState(0);
  const [paused, setPaused] = useState(false);
  const [name, setName] = useState("");
  const [me, setMe] = useState(null);

  useEffect(() => {
    admin.get("/me").then((r) => setMe(r.user)).catch(() => {});
    admin.get("/wa/status").then((s) => setWa(s.status)).catch(() => {});
    admin.get("/event").then((e) => { setPaused(e.settings.sendingPaused); setName(e.name); }).catch(() => {});
  }, []);
  useSocketEvent("wa:status", (s) => setWa(s.status));
  useSocketEvent("wa:queue", (q) => setQueue(q.length));

  async function togglePause(v) {
    try {
      await admin.put("/event", { settings: { sendingPaused: v } });
      setPaused(v);
      show(v ? "All sending paused" : "Sending resumed");
    } catch (e) {
      show(e.message, true);
    }
  }

  const waLabel = { connected: "WhatsApp connected", qr: "Scan QR in Settings", disconnected: "WhatsApp offline" }[wa] || wa;
  const dot = wa === "connected" ? "on" : wa === "qr" ? "warn" : "off";

  return (
    <div className="admin">
      <aside className="sidebar">
        <div className="brand">
          <div>
            Control Room
            <small>Growth workshop</small>
          </div>
        </div>
        {NAV.map((g, i) => (
          <div key={i} style={{ display: "contents" }}>
            {g.title && <div className="grp">{g.title}</div>}
            {g.items.filter(([, , , role]) => !role || role === me?.role).map(([to, label, end]) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>{label}</NavLink>
            ))}
          </div>
        ))}
        <div className="spacer" />
        <a href="/" target="_blank" rel="noreferrer">View landing page ↗</a>
        <a href="#" onClick={(e) => { e.preventDefault(); admin.post("/logout").catch(() => {}); setToken(null); nav("/admin/login"); }}>Sign out</a>
      </aside>
      <div className="main">
        <div className="topbar">
          <strong style={{ fontSize: 14 }}>{name}</strong>
          {me?.role === "viewer" && <span className="badge warn">View only</span>}
          <span className="grow" />
          <span className="status"><span className={`dot ${dot}`} />{waLabel}</span>
          <span className="status mono" title="Messages waiting to be sent">Queue: {queue}</span>
          <label className="status" title="Stops every WhatsApp and email send immediately">
            <input type="checkbox" className="toggle danger" checked={paused} onChange={(e) => togglePause(e.target.checked)} />
            {paused ? <b style={{ color: "var(--bad)" }}>Sending paused</b> : "Kill switch"}
          </label>
        </div>
        <div className="content"><Outlet /></div>
      </div>
      {toast}
    </div>
  );
}
