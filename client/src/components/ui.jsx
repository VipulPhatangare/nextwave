import { useEffect, useState, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import { getToken } from "../api.js";

// Simple toast hook: const [toast, show] = useToast();  {toast}
export function useToast() {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = useCallback((msg, bad = false) => {
    setT({ msg, bad });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), 3200);
  }, []);
  const node = t ? <div className={`toast ${t.bad ? "bad" : ""}`}>{t.msg}</div> : null;
  return [node, show];
}

// Load data on mount: const { data, loading, reload } = useLoad(() => admin.get("/x"), [deps])
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(await fn());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, loading, error, reload, setData };
}

let socket;
export function getSocket() {
  if (!socket) socket = io({ auth: { token: getToken() }, transports: ["websocket", "polling"] });
  return socket;
}

export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = getSocket();
    const fn = (d) => ref.current(d);
    s.on(event, fn);
    return () => s.off(event, fn);
  }, [event]);
}

export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "");

export function toLocalInput(d) {
  if (!d) return "";
  const dt = new Date(d);
  const off = dt.getTimezoneOffset() * 60000;
  return new Date(dt.getTime() - off).toISOString().slice(0, 16);
}

// WhatsApp sometimes hides a student's real number behind a privacy ID; we store it as "lid:..." and show it plainly.
export const phoneLabel = (p) => (String(p || "").startsWith("lid:") ? "Hidden by WhatsApp" : p);

export function StatusBadge({ status }) {
  const map = { registered: "", confirmed: "good", attended: "good", no_show: "warn", cancelled: "bad" };
  return <span className={`badge ${map[status] || ""}`}>{status.replace("_", " ")}</span>;
}

export function Stat({ n, label, sub, children, hot }) {
  return (
    <div className={`card stat ${hot ? "hot" : ""}`}>
      <div className="n mono">{n}</div>
      <div className="l">{label}</div>
      {sub && <div className="sub">{sub}</div>}
      {children}
    </div>
  );
}
