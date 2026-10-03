const env = require("../config/env");

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "TBA";
const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "TBA";

const DEFAULT_START = "Hi! I want to register";

// The pre-typed first message. Kept in memory so waLink() stays synchronous for every caller;
// refreshed at start-up and whenever the event settings are saved.
let startConfig = { template: DEFAULT_START, eventName: "the workshop" };
function setStartConfig(event) {
  startConfig = { template: event?.settings?.startMessage || DEFAULT_START, eventName: event?.name || "the workshop" };
}
async function refreshStartConfig() {
  const { Event } = require("../models");
  setStartConfig(await Event.findOne());
}
const startText = (code) => String(startConfig.template).replace(/\{\{\s*event_name\s*\}\}/g, startConfig.eventName).replace(/\{\{\s*code\s*\}\}/g, code);

function waLink(code) {
  const num = env.wa.botNumber;
  return num ? `https://wa.me/${num}?text=${encodeURIComponent(startText(code))}` : "";
}

const isPublicUrl = (u) => {
  try {
    const h = new URL(u).hostname;
    return !(h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") || /^\d+\.\d+\.\d+\.\d+$/.test(h));
  } catch (_) {
    return false;
  }
};

// The link to put in posts and group messages. Once the site has a public address this is a short
// "yourdomain/w/CODE" redirect (which also counts clicks); until then it is the direct wa.me link.
function shortWaLink(code) {
  const direct = waLink(code);
  if (!direct) return webLink(code);
  return isPublicUrl(env.clientUrl) ? `${env.clientUrl.replace(/\/$/, "")}/w/${code}` : direct;
}

function webLink(code) {
  return `${env.clientUrl}/r/${code}`;
}

// Build the variable map for a registration + event.
function buildVars(event, reg, extra = {}) {
  return {
    name: reg?.name?.split(" ")[0] || "there",
    full_name: reg?.name || "",
    college: reg?.college || "",
    event_name: event.name,
    date: fmtDate(event.startAt),
    time: fmtTime(event.startAt),
    duration: `${event.durationMin} minutes`,
    join_link: reg?.joinToken ? `${env.clientUrl}/j/${reg.joinToken}` : event.joinUrl || "(link will be shared soon)",
    ...extra,
  };
}

function render(text, vars) {
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ""));
}

module.exports = { buildVars, render, waLink, shortWaLink, webLink, fmtDate, fmtTime, setStartConfig, refreshStartConfig, DEFAULT_START, isPublicUrl };
