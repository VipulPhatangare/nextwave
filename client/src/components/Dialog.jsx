import { useEffect, useRef, useState } from "react";

// In-app replacement for window.confirm / window.prompt.
// Mount <DialogHost /> once (App.jsx), then anywhere:
//   if (!(await confirmDialog({ title: "Delete link?", message: "…", confirmText: "Delete", danger: true }))) return;
//   const text = await promptDialog({ title: "Edit answer", defaultValue: x.content, multiline: true }); // null if cancelled

let push = null;
let seq = 0;
const queue = [];

function open(opts) {
  return new Promise((resolve) => {
    const req = { ...opts, id: ++seq, resolve };
    if (push) push(req);
    else queue.push(req);
  });
}

export const confirmDialog = (opts) => open({ kind: "confirm", ...opts });
export const promptDialog = (opts) => open({ kind: "prompt", ...opts });

export function DialogHost() {
  const [stack, setStack] = useState([]);

  useEffect(() => {
    push = (req) => setStack((s) => [...s, req]);
    if (queue.length) setStack((s) => [...s, ...queue.splice(0)]);
    return () => { push = null; };
  }, []);

  const current = stack[0];
  if (!current) return null;

  const close = (value) => {
    current.resolve(value);
    setStack((s) => s.slice(1));
  };
  return <Dialog key={current.id} req={current} onClose={close} />;
}

function Dialog({ req, onClose }) {
  const isPrompt = req.kind === "prompt";
  const [value, setValue] = useState(req.defaultValue ?? "");
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    // Destructive confirms focus Cancel so a stray Enter never deletes anything
    const el = isPrompt ? inputRef.current : req.danger ? cancelRef.current : confirmRef.current;
    el?.focus();
    if (isPrompt && el?.select && !req.multiline) el.select();
    const onKey = (e) => { if (e.key === "Escape") cancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, []);

  const cancel = () => onClose(isPrompt ? null : false);

  const submit = (e) => {
    e?.preventDefault();
    if (!isPrompt) return onClose(true);
    const v = value.trim();
    if (req.required !== false && !v) return setError("This field can't be empty.");
    const msg = req.validate?.(v);
    if (msg) return setError(msg);
    onClose(v);
  };

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <form className="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-title" onSubmit={submit}>
        <h2 id="dlg-title">{req.title || (isPrompt ? "Enter a value" : "Are you sure?")}</h2>
        {req.message && <p className="dlg-msg">{req.message}</p>}

        {isPrompt && (
          <div className="field" style={{ margin: 0 }}>
            {req.label && <label htmlFor="dlg-input">{req.label}</label>}
            {req.multiline ? (
              <textarea
                id="dlg-input"
                ref={inputRef}
                value={value}
                rows={6}
                placeholder={req.placeholder}
                onChange={(e) => { setValue(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e); }}
              />
            ) : (
              <input
                id="dlg-input"
                ref={inputRef}
                type={req.inputType || "text"}
                value={value}
                placeholder={req.placeholder}
                autoComplete={req.inputType === "password" ? "new-password" : "off"}
                onChange={(e) => { setValue(e.target.value); setError(""); }}
              />
            )}
            {error && <span className="dlg-err">{error}</span>}
          </div>
        )}

        <div className="dlg-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={cancel}>{req.cancelText || "Cancel"}</button>
          <button ref={confirmRef} type="submit" className={`btn ${req.danger ? "danger-solid" : "primary"}`}>
            {req.confirmText || (isPrompt ? "Save" : "Confirm")}
          </button>
        </div>
      </form>
    </div>
  );
}
