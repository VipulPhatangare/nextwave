const runtime = require("../runtime");

// whatsapp-web.js's getChats() throws on some WhatsApp Web versions, which takes the whole list down.
// These helpers read WhatsApp Web's own collections (the same `window.require("WAWebCollections")` the
// library uses internally), one chat at a time, so a single odd chat can't break everything.

function page() {
  const c = runtime.waClient;
  if (!c || runtime.waStatus !== "connected" || !c.pupPage) throw new Error("WhatsApp is not connected.");
  return c.pupPage;
}

async function listChats(limit = 80) {
  return page().evaluate((limit) => {
    if (typeof window.require !== "function") throw new Error("WhatsApp Web isn't ready yet. Try again in a few seconds.");
    const cols = window.require("WAWebCollections");
    const out = [];
    for (const c of cols.Chat.getModelsArray()) {
      try {
        const id = c.id && c.id._serialized;
        if (!id || id === "status@broadcast" || id.endsWith("@newsletter")) continue;
        let last = "";
        try {
          let m = null;
          if (c.lastReceivedKey && cols.Msg && cols.Msg.get) m = cols.Msg.get(c.lastReceivedKey._serialized);
          if (!m && c.msgs && c.msgs.getModelsArray) m = c.msgs.getModelsArray().slice(-1)[0];
          last = (m && m.body ? String(m.body) : "").slice(0, 80);
        } catch (_) {}
        out.push({
          id,
          name: (c.groupMetadata && c.groupMetadata.subject) || c.formattedTitle || c.name || (c.contact && (c.contact.name || c.contact.pushname)) || id.split("@")[0],
          isGroup: id.endsWith("@g.us"),
          unread: c.unreadCount || 0,
          last,
          at: c.t || 0,
        });
      } catch (_) {}
    }
    out.sort((a, b) => b.at - a.at);
    return out.slice(0, limit);
  }, limit);
}

async function listGroups() {
  const meWid = runtime.waClient.info && runtime.waClient.info.wid && runtime.waClient.info.wid._serialized;
  return page().evaluate((meWid) => {
    if (typeof window.require !== "function") throw new Error("WhatsApp Web isn't ready yet. Try again in a few seconds.");
    const cols = window.require("WAWebCollections");

    // my ids: phone number id, plus the newer "lid" id some groups list me under
    const meIds = new Set(meWid ? [meWid] : []);
    try {
      const u = window.require("WAWebUserPrefsMeUser");
      for (const f of ["getMaybeMePnUser", "getMaybeMeLidUser", "getMaybeMeUser"]) {
        try {
          const w = u[f] && u[f]();
          if (w && w._serialized) meIds.add(w._serialized);
        } catch (_) {}
      }
    } catch (_) {}

    const out = [];
    for (const c of cols.Chat.getModelsArray()) {
      try {
        const id = c.id && c.id._serialized;
        if (!id || !id.endsWith("@g.us")) continue;
        const md = c.groupMetadata;
        const parts = md && md.participants && md.participants.getModelsArray ? md.participants.getModelsArray() : [];
        // true / false when I can tell, null when I can't find myself in the member list
        let admin = null;
        try {
          if (md && md.participants && typeof md.participants.iAmAdmin === "function") admin = !!md.participants.iAmAdmin();
          else {
            const mine = parts.find((p) => p.id && meIds.has(p.id._serialized));
            if (mine) admin = !!(mine.isAdmin || mine.isSuperAdmin);
          }
        } catch (_) {}
        out.push({
          id,
          // the group's own subject is the freshest name; chat.name can lag right after a group is created or renamed
          name: (md && md.subject) || c.formattedTitle || c.name || id,
          participants: parts.length,
          // when we can't tell, allow it: a refused post is reported per group instead of hiding the group
          canSend: !(md && md.announce) || admin !== false,
        });
      } catch (_) {}
    }
    return out;
  }, meWid);
}

// Last messages of a chat, oldest first. Mirrors the library's fetchMessages (raw chat + loadEarlierMsgs)
// but skips the chat serialisation step that is what breaks getChatById on newer WhatsApp Web.
async function listMessages(chatId, limit = 50) {
  return page().evaluate(async (chatId, limit) => {
    if (typeof window.require !== "function") throw new Error("WhatsApp Web isn't ready yet. Try again in a few seconds.");
    const chat = window.require("WAWebCollections").Chat.get(chatId);
    if (!chat || !chat.msgs) return [];

    const keep = (m) => !m.isNotification;
    let msgs = chat.msgs.getModelsArray().filter(keep);
    for (let i = 0; i < 6 && msgs.length < limit; i++) {
      try {
        const more = await window.require("WAWebChatLoadMessages").loadEarlierMsgs({ chat });
        if (!more || !more.length) break;
        msgs = [...more.filter(keep), ...msgs];
      } catch (_) {
        break;
      }
    }
    msgs.sort((a, b) => (a.t > b.t ? 1 : -1));

    const out = [];
    msgs.slice(-limit).forEach((m, i) => {
      try {
        const key = m.id && (m.id._serialized || (m.id.toString && m.id.toString()) || m.id.id);
        // media messages carry a base64 thumbnail in `body`; show a label instead
        const body = m.type === "chat" ? m.body || "" : m.caption || `[${m.type || "message"}]`;
        let sender = "";
        try {
          const s = m.senderObj;
          sender = (s && (s.name || s.pushname || s.formattedName || s.shortName)) || m.notifyName || "";
        } catch (_) {}
        out.push({ id: String(key || `${m.t}-${i}`), fromMe: !!(m.id && m.id.fromMe), body: String(body).slice(0, 4000), at: m.t, type: m.type, sender: String(sender) });
      } catch (_) {}
    });
    return out;
  }, chatId, limit);
}

module.exports = { listChats, listGroups, listMessages };
