const dns = require("dns").promises;
const net = require("net");

// Fetch a student's project link without letting it reach our own network (localhost, 10.x, 192.168.x, cloud metadata...).
// Returns plain text (HTML tags removed), at most maxChars long, or "" when it can't.

function privateIp(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function safeHost(url) {
  let u;
  try { u = new URL(url); } catch (_) { return false; }
  if (!["http:", "https:"].includes(u.protocol)) return false;
  if (u.port && !["80", "443"].includes(u.port)) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) return false;
  try {
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateIp(a.address));
  } catch (_) {
    return false;
  }
}

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url, { maxChars = 6000, maxBytes = 300 * 1024, timeoutMs = 7000, headers = {} } = {}) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!(await safeHost(current))) return "";
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(current, { redirect: "manual", signal: ctl.signal, headers: { "User-Agent": "WorkshopProjectReviewer/1.0", ...headers } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location"), current).href;
        continue;
      }
      if (!res.ok) return "";
      const type = res.headers.get("content-type") || "";
      if (!/text|json|markdown|xml/.test(type)) return "";
      // read only the first maxBytes
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      while (size < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      reader.cancel().catch(() => {});
      const body = Buffer.concat(chunks).toString("utf8");
      return (/html/.test(type) ? htmlToText(body) : body).slice(0, maxChars);
    } catch (_) {
      return "";
    } finally {
      clearTimeout(timer);
    }
  }
  return "";
}

// GitHub repos: read the README through the API (much more useful than the repo page's HTML).
async function projectPageText(link) {
  const gh = String(link).match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (gh) {
    const readme = await fetchText(`https://api.github.com/repos/${gh[1]}/${gh[2]}/readme`, { headers: { Accept: "application/vnd.github.raw" } });
    if (readme) return `GitHub repository ${gh[1]}/${gh[2]}. README:\n${readme}`;
  }
  return fetchText(link);
}

module.exports = { fetchText, projectPageText, safeHost, privateIp };
