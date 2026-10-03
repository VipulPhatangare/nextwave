import { useEffect, useState } from "react";
import { admin } from "../../api.js";
import { useLoad, useToast } from "../../components/ui.jsx";

const TYPES = [
  ["text", "Short text"], ["longtext", "Long text"], ["number", "Number"], ["email", "Email"], ["phone", "Phone"],
  ["single", "Single choice"], ["multi", "Multiple choice"], ["yesno", "Yes / No"], ["date", "Date"],
];
const MAP = [["", "None"], ["name", "Name"], ["phone", "Phone"], ["email", "Email"], ["college", "College"], ["branch", "Branch"]];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "question";

export default function FormBuilder() {
  const [toast, show] = useToast();
  const { data, reload } = useLoad(() => admin.get("/forms/active"));
  const [qs, setQs] = useState([]);
  const [sel, setSel] = useState(0);
  const [preview, setPreview] = useState("web");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) { setQs(data.questions.map((q) => ({ ...q, options: q.options || [], validation: q.validation || {}, showIf: q.showIf || {} }))); setDirty(false); }
  }, [data]);

  const q = qs[sel];
  const update = (patch) => { setQs((a) => a.map((x, i) => (i === sel ? { ...x, ...patch } : x))); setDirty(true); };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= qs.length) return;
    const a = [...qs];
    [a[i], a[j]] = [a[j], a[i]];
    setQs(a); setSel(j); setDirty(true);
  };
  const add = () => {
    const key = "question_" + (qs.length + 1);
    setQs([...qs, { key, label: "New question", type: "text", required: false, channels: ["web", "whatsapp"], options: [], validation: {}, showIf: {}, mapTo: "" }]);
    setSel(qs.length); setDirty(true);
  };
  const remove = (i) => { setQs(qs.filter((_, k) => k !== i)); setSel(0); setDirty(true); };

  async function save() {
    if (!qs.some((x) => x.mapTo === "phone" && x.channels.includes("web"))) return show("The landing page needs a question mapped to Phone.", true);
    for (const x of qs) {
      if ((x.type === "single" || x.type === "multi") && x.options.length < 2) return show(`"${x.label}" needs at least 2 options.`, true);
    }
    const clean = qs.map((x) => ({
      ...x,
      mapTo: x.mapTo || undefined,
      showIf: x.showIf?.key ? x.showIf : undefined,
      options: x.options.filter((o) => o.label).map((o) => ({ label: o.label, value: o.value || slug(o.label) })),
    }));
    try {
      await admin.post("/forms", { questions: clean });
      show("Saved as a new version. Both the landing page and the bot use it now.");
      reload();
    } catch (e) {
      show(e.message, true);
    }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Form builder</h1>
          <p>One form for the landing page and the WhatsApp bot. Version {data?.version ?? "–"} is live.</p>
        </div>
        <div className="btn-row">
          {dirty && <span className="badge warn">Unsaved changes</span>}
          <button className="btn primary" onClick={save} disabled={!dirty}>Save new version</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(240px, 300px) 1fr minmax(260px, 340px)", alignItems: "start" }}>
        <div className="card">
          <h3>Questions</h3>
          <div className="qlist">
            {qs.map((x, i) => (
              <div key={x.key + i} className={`qitem ${i === sel ? "sel" : ""}`} onClick={() => setSel(i)}>
                <span className="qlabel">{x.label || "(untitled)"}{x.required && " *"}</span>
                <button className="btn sm" onClick={(e) => { e.stopPropagation(); move(i, -1); }} disabled={i === 0} title="Move up">↑</button>
                <button className="btn sm" onClick={(e) => { e.stopPropagation(); move(i, 1); }} disabled={i === qs.length - 1} title="Move down">↓</button>
              </div>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 12, width: "100%" }} onClick={add}>+ Add question</button>
        </div>

        <div className="card">
          {!q ? <div className="empty">Add a question to start.</div> : (
            <>
              <h3>Edit question</h3>
              <div className="field"><label>Question text</label><input type="text" value={q.label} onChange={(e) => update({ label: e.target.value })} /></div>
              <div className="row2">
                <div className="field"><label>Type</label>
                  <select value={q.type} onChange={(e) => update({ type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                </div>
                <div className="field"><label>Saves to profile field</label>
                  <select value={q.mapTo || ""} onChange={(e) => update({ mapTo: e.target.value })}>{MAP.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                </div>
              </div>
              <div className="btn-row" style={{ marginBottom: 12 }}>
                <label className="check"><input type="checkbox" className="toggle" checked={q.required} onChange={(e) => update({ required: e.target.checked })} /> Required</label>
                <label className="check"><input type="checkbox" checked={q.channels.includes("web")} onChange={(e) => update({ channels: e.target.checked ? [...q.channels, "web"] : q.channels.filter((c) => c !== "web") })} /> Landing page</label>
                <label className="check"><input type="checkbox" checked={q.channels.includes("whatsapp")} onChange={(e) => update({ channels: e.target.checked ? [...q.channels, "whatsapp"] : q.channels.filter((c) => c !== "whatsapp") })} /> WhatsApp</label>
              </div>

              {(q.type === "single" || q.type === "multi") && (
                <div className="field">
                  <label>Options</label>
                  {q.options.map((o, i) => (
                    <div key={i} className="btn-row" style={{ marginBottom: 6, flexWrap: "nowrap" }}>
                      <input type="text" value={o.label} placeholder={`Option ${i + 1}`} onChange={(e) => update({ options: q.options.map((x, k) => (k === i ? { label: e.target.value, value: slug(e.target.value) } : x)) })} />
                      <button className="btn sm danger" onClick={() => update({ options: q.options.filter((_, k) => k !== i) })}>✕</button>
                    </div>
                  ))}
                  <button className="btn sm" onClick={() => update({ options: [...q.options, { label: "", value: "" }] })}>+ Add option</button>
                </div>
              )}

              <div className="row2">
                <div className="field"><label>Placeholder</label><input type="text" value={q.placeholder || ""} onChange={(e) => update({ placeholder: e.target.value })} /></div>
                <div className="field"><label>Help text</label><input type="text" value={q.helpText || ""} onChange={(e) => update({ helpText: e.target.value })} /></div>
              </div>

              {["text", "longtext", "number"].includes(q.type) && (
                <div className="row2">
                  <div className="field"><label>{q.type === "number" ? "Minimum value" : "Minimum length"}</label><input type="number" value={q.validation.min ?? ""} onChange={(e) => update({ validation: { ...q.validation, min: e.target.value === "" ? undefined : Number(e.target.value) } })} /></div>
                  <div className="field"><label>{q.type === "number" ? "Maximum value" : "Maximum length"}</label><input type="number" value={q.validation.max ?? ""} onChange={(e) => update({ validation: { ...q.validation, max: e.target.value === "" ? undefined : Number(e.target.value) } })} /></div>
                </div>
              )}

              <div className="field">
                <label>Only show this question when…</label>
                <div className="row2">
                  <select value={q.showIf?.key || ""} onChange={(e) => update({ showIf: { ...q.showIf, key: e.target.value } })}>
                    <option value="">Always show</option>
                    {qs.filter((x, i) => i < sel).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                  <input type="text" placeholder="…answer equals" disabled={!q.showIf?.key} value={q.showIf?.equals || ""} onChange={(e) => update({ showIf: { ...q.showIf, equals: e.target.value } })} />
                </div>
                <span className="hint">For choice questions, use the option's saved value (lowercase with underscores).</span>
              </div>
              <button className="btn danger sm" onClick={() => remove(sel)}>Delete question</button>
            </>
          )}
        </div>

        <div className="card">
          <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Preview</h3>
            <select className="btn sm" value={preview} onChange={(e) => setPreview(e.target.value)}>
              <option value="web">Landing page</option>
              <option value="whatsapp">WhatsApp chat</option>
            </select>
          </div>
          {preview === "web" ? (
            <div className="web-preview">
              {qs.filter((x) => x.channels.includes("web")).map((x) => (
                <div key={x.key}>
                  <div className="pl">{x.label} {x.required && <span className="req">*</span>}</div>
                  <div className="pf">
                    {x.type === "single" ? x.options.map((o) => o.label).join(" · ") || "choices…" : x.type === "yesno" ? "Yes · No" : x.placeholder || x.type}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="phone-preview">
              {(() => {
                const w = qs.filter((x) => x.channels.includes("whatsapp") && x.mapTo !== "phone");
                return (
                  <>
                    <div className="bubble me">JOIN</div>
                    {w.map((x, i) => (
                      <div key={x.key} className="bubble">
                        {x.label}
                        {x.type === "single" || x.type === "multi" ? "\n" + x.options.map((o, k) => `${k + 1}. ${o.label}`).join("\n") : ""}
                        {x.type === "yesno" ? "\nReply YES or NO." : ""}
                        {!x.required ? "\n(Reply SKIP to skip)" : ""}
                      </div>
                    ))}
                    <div className="bubble">✅ You're registered! …</div>
                  </>
                );
              })()}
            </div>
          )}
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 0 }}>The bot never asks for a phone number, since it already knows it.</p>
        </div>
      </div>
      {toast}
    </>
  );
}
