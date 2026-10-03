import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { pub } from "../../api.js";

export default function Join() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    pub.get(`/join/${token}`)
      .then((d) => {
        setInfo(d);
        if (d.open && d.joinUrl) setTimeout(() => (window.location.href = d.joinUrl), 900);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  const when = (d) => new Date(d).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <div className="join-page">
      <div className="box">
        {error && (<><h1>Link not valid</h1><p>{error} Check the latest message we sent you, or reply HELP on WhatsApp.</p></>)}
        {!error && !info && <p>Checking your link…</p>}
        {info && info.open && info.joinUrl && (
          <>
            <h1>See you inside, {info.name}!</h1>
            <p>Taking you to <b>{info.eventName}</b>…</p>
            <a className="btn-cta" href={info.joinUrl}>Open the workshop</a>
          </>
        )}
        {info && info.open && !info.joinUrl && (
          <>
            <h1>You're checked in, {info.name}</h1>
            <p>The meeting link isn't ready yet. We'll send it on WhatsApp the moment it is.</p>
          </>
        )}
        {info && !info.open && (
          <>
            <h1>Not live yet, {info.name}</h1>
            <p><b>{info.eventName}</b> starts {when(info.startsAt)}. This link opens 15 minutes before. Come back then.</p>
            <button className="btn-ghost-d" onClick={() => window.location.reload()}>Check again</button>
          </>
        )}
      </div>
    </div>
  );
}
