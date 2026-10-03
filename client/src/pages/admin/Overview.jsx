import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { admin } from "../../api.js";
import { useLoad, useSocketEvent, Stat, fmtDateTime } from "../../components/ui.jsx";

export default function Overview() {
  const stats = useLoad(() => admin.get("/stats/overview"));
  const series = useLoad(() => admin.get("/stats/timeseries"));
  const [feed, setFeed] = useState([]);

  useSocketEvent("registration:new", (r) => {
    setFeed((f) => [r, ...f].slice(0, 12));
    stats.reload();
    series.reload();
  });

  const s = stats.data;
  if (!s) return <div className="empty">{stats.error || "Loading…"}</div>;
  const pct = Math.min(100, Math.round((s.total / s.target) * 100));
  const rate = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "–");

  const funnel = [
    ["Link clicks", s.clicks],
    ["Registered", s.total],
    ["Confirmed (YES)", s.confirmed],
    ["Attended", s.attended],
  ];
  const max = Math.max(...funnel.map((f) => f[1]), 1);

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Overview</h1>
          <p>Live numbers. This page updates as people register.</p>
        </div>
      </div>

      <div className="grid g4">
        <Stat hot n={`${s.total} / ${s.target}`} label="Registered vs target" sub={`${pct}% of target · ${s.seatLimit - s.total} seats left`}>
          <div className="bar"><div style={{ width: pct + "%" }} /></div>
        </Stat>
        <Stat n={s.today} label="Registered today" />
        <Stat n={s.web} label="Via landing page" sub={`${rate(s.web, s.total)} of total`} />
        <Stat n={s.whatsapp} label="Via WhatsApp" sub={`${rate(s.whatsapp, s.total)} of total`} />
        <Stat n={s.confirmed} label="Confirmed attendance" sub={`${rate(s.confirmed, s.total)} replied YES`} />
        <Stat n={s.optedOut} label="Opted out of WhatsApp" />
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Registrations per day (last 14 days)</h3>
          <div style={{ width: "100%", height: 260 }}>
            {series.data?.length ? (
              <ResponsiveContainer>
                <BarChart data={series.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26262a" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#918b83" }} stroke="#26262a" tickFormatter={(d) => d.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#918b83" }} stroke="#26262a" />
                  <Tooltip contentStyle={{ background: "#151517", border: "1px solid #3a2a1a", borderRadius: 10, color: "#f4f0ea" }} cursor={{ fill: "rgba(255,106,0,0.08)" }} />
                  <Legend wrapperStyle={{ color: "#918b83" }} />
                  <Bar dataKey="web" name="Landing page" stackId="a" fill="#ff6a00" />
                  <Bar dataKey="whatsapp" name="WhatsApp" stackId="a" fill="#ffb066" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty">No registrations yet. Share a campaign link to get started.</div>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Funnel</h3>
          {funnel.map(([label, n]) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>{label}</span>
                <b className="mono">{n}</b>
              </div>
              <div className="bar"><div style={{ width: (n / max) * 100 + "%" }} /></div>
            </div>
          ))}
          <div className="small" style={{ color: "var(--muted)", fontSize: 12 }}>Clicks only count link visits, not the people who stopped before registering.</div>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Top sources</h3>
          <MiniTable rows={s.topSources.map((r) => [r._id, r.n])} empty="No sourced registrations yet." />
          <h3 style={{ marginTop: 18 }}>Top colleges</h3>
          <MiniTable rows={s.topColleges.map((r) => [r._id, r.n])} empty="No colleges yet." />
        </div>
        <div className="card">
          <h3>Live activity</h3>
          {feed.length === 0 && <div className="empty" style={{ padding: 12 }}>New registrations will appear here instantly.</div>}
          {feed.map((r) => (
            <div key={r.id} style={{ fontSize: 14, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <b>{r.name}</b> {r.college ? `(${r.college})` : ""} registered via {r.channel}
              {r.sourceCode ? ` · ${r.sourceCode}` : ""} <span style={{ color: "var(--muted)" }}>· {fmtDateTime(r.at)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function MiniTable({ rows, empty }) {
  if (!rows.length) return <div className="empty" style={{ padding: 12 }}>{empty}</div>;
  return (
    <table className="t">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td style={{ textTransform: "capitalize" }}>{k}</td>
            <td style={{ textAlign: "right" }} className="mono"><b>{v}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
