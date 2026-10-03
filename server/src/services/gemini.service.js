const env = require("../config/env");

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const configured = () => !!env.gemini.apiKey;

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

async function call(path, { method = "GET", body, timeoutMs = 25000 } = {}) {
  if (!configured()) throw fail(503, "Gemini isn't set up. Add GEMINI_API_KEY to the server's .env file.");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: ctl.signal,
      headers: { "x-goog-api-key": env.gemini.apiKey, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || "";
      if (res.status === 429) throw fail(429, "Gemini is rate-limiting this key. Try again in a minute.");
      if (res.status === 401 || res.status === 403) throw fail(res.status, "Gemini rejected the API key.");
      if (res.status === 404) {
        // Google lists some models it no longer serves to newer keys, so pass its explanation on.
        const retired = /no longer available/i.test(msg);
        throw fail(404, retired ? "That Gemini model is no longer available for this key. Pick another in AI settings (Models for my key)." : "That Gemini model doesn't exist for this key. Pick another in AI settings.");
      }
      throw fail(res.status, `Gemini error: ${msg.slice(0, 160) || res.status}`);
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw fail(504, "Gemini took too long to answer.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// contents: [{ role: "user" | "model", parts: [{ text }] }]
async function generate({ model, system, contents, maxOutputTokens = 400, json = false, temperature = 0.3 }) {
  const data = await call(`/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    body: {
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      generationConfig: {
        maxOutputTokens,
        temperature,
        ...(json ? { responseMimeType: "application/json" } : {}),
        // FAQ answers don't need reasoning, and thinking tokens are billed. Only the 2.5 flash models accept a zero budget.
        ...(/^gemini-2\.5-flash(-lite)?$/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    },
  });
  const cand = data.candidates && data.candidates[0];
  const text = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || "").join("").trim();
  const u = data.usageMetadata || {};
  return {
    text,
    finishReason: cand && cand.finishReason,
    blocked: data.promptFeedback && data.promptFeedback.blockReason,
    tokensIn: u.promptTokenCount || 0,
    // thinking tokens are billed as output
    tokensOut: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
  };
}

async function listModels() {
  const data = await call("/models?pageSize=200");
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name).replace(/^models\//, ""))
    .filter((n) => /^gemini/.test(n))
    .sort();
}

module.exports = { configured, generate, listModels };
