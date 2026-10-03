import { useState } from "react";
import { admin } from "../../api.js";
import { useLoad, useToast, fmtDateTime } from "../../components/ui.jsx";
import { confirmDialog, promptDialog } from "../../components/Dialog.jsx";

const ROLES = [["owner", "Owner (everything)"], ["admin", "Admin (can edit)"], ["viewer", "Viewer (read only)"]];

export default function Admins() {
  const [toast, show] = useToast();
  const { data, reload, error } = useLoad(() => admin.get("/admins"));
  const [f, setF] = useState({ name: "", email: "", password: "", role: "admin" });

  async function create(e) {
    e.preventDefault();
    try {
      await admin.post("/admins", f);
      setF({ name: "", email: "", password: "", role: "admin" });
      show("Account created");
      reload();
    } catch (err) {
      show(err.message, true);
    }
  }
  async function setRole(a, role) {
    try { await admin.put(`/admins/${a._id}`, { role }); show("Role updated"); reload(); } catch (e) { show(e.message, true); reload(); }
  }
  async function resetPw(a) {
    const pw = await promptDialog({ title: "Reset password", message: `Set a new password for ${a.email}.`, label: "New password", inputType: "password", placeholder: "At least 8 characters", confirmText: "Change password", validate: (v) => (v.length < 8 ? "Password must be at least 8 characters." : "") });
    if (!pw) return;
    try { await admin.put(`/admins/${a._id}`, { password: pw }); show("Password changed"); } catch (e) { show(e.message, true); }
  }
  async function del(a) {
    if (!(await confirmDialog({ title: "Remove admin?", message: `${a.email} will lose access to the admin panel.`, confirmText: "Remove", danger: true }))) return;
    try { await admin.del(`/admins/${a._id}`); show("Removed"); reload(); } catch (e) { show(e.message, true); }
  }

  if (error) return <div className="empty">{error}</div>;
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Team</h1>
          <p>Give coordinators a view-only account so they can watch numbers without changing anything.</p>
        </div>
      </div>

      <form className="card" onSubmit={create}>
        <h3>Add a team member</h3>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", alignItems: "end" }}>
          <div className="field" style={{ margin: 0 }}><label>Name</label><input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field" style={{ margin: 0 }}><label>Email</label><input type="text" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
          <div className="field" style={{ margin: 0 }}><label>Password</label><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></div>
          <div className="field" style={{ margin: 0 }}><label>Role</label><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <button className="btn primary" style={{ height: 38 }}>Add</button>
        </div>
      </form>

      <div className="card scroll-x">
        <table className="t">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Added</th><th /></tr></thead>
          <tbody>
            {data?.map((a) => (
              <tr key={a._id}>
                <td><b>{a.name || "–"}</b></td>
                <td>{a.email}</td>
                <td><select className="plain-input" value={a.role} onChange={(e) => setRole(a, e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td>{fmtDateTime(a.createdAt)}</td>
                <td><div className="btn-row"><button className="btn sm" onClick={() => resetPw(a)}>Reset password</button><button className="btn sm danger" onClick={() => del(a)}>Remove</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toast}
    </>
  );
}
