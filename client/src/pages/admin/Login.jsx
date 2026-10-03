import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { admin, setToken } from "../../api.js";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await admin.login(email, password);
      setToken(r.token);
      nav("/admin", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Workshop Control Room</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 18px", fontSize: 14 }}>Sign in to manage registrations and messaging.</p>
        <div className="field">
          <label htmlFor="em">Email</label>
          <input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        </div>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div style={{ color: "var(--bad)", fontSize: 14, marginBottom: 10 }}>{error}</div>}
        <button className="btn primary" style={{ width: "100%", padding: 11 }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
