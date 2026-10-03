const env = require("../config/env");
const runtime = require("../runtime");
const { WaGroup, GroupBroadcast, CampaignLink } = require("../models");
const { enqueue } = require("./sendQueue");
const { listGroups } = require("./safeChats");
const { toQueueMedia } = require("../services/media.service");
const { sleep, randomBetween } = require("../utils/codes");
const { shortWaLink } = require("../services/template.service");

async function syncGroups() {
  if (!runtime.waClient || runtime.waStatus !== "connected") throw new Error("WhatsApp is not connected.");
  const groups = await listGroups();
  for (const g of groups) {
    const existing = await WaGroup.findOne({ groupId: g.id });
    await WaGroup.updateOne(
      { groupId: g.id },
      {
        name: g.name,
        participants: g.participants,
        canSend: g.canSend,
        ...(existing ? {} : { linkCode: "GRP-" + g.id.replace(/\D/g, "").slice(-6) }),
      },
      { upsert: true }
    );
  }
  return WaGroup.countDocuments();
}

// Ensure each group has a trackable campaign link so we know which group converts.
async function ensureGroupLink(group) {
  if (!group.linkCode) {
    group.linkCode = "GRP-" + group.groupId.replace(/\D/g, "").slice(-6);
    await group.save();
  }
  await CampaignLink.updateOne(
    { code: group.linkCode },
    { $setOnInsert: { code: group.linkCode, label: group.name, type: "group" } },
    { upsert: true }
  );
  return group.linkCode;
}

// Send one message to many groups, one at a time with a long random gap.
async function runBroadcast(broadcastId) {
  const b = await GroupBroadcast.findById(broadcastId);
  if (!b || b.status === "done") return;
  b.status = "sending";
  await b.save();

  for (const groupId of b.groupIds) {
    const group = await WaGroup.findOne({ groupId });
    const result = { groupId, name: group?.name, status: "sent", sentAt: new Date() };
    try {
      if (!group) throw new Error("Group not found");
      if (!group.canSend) throw new Error("Only admins can post in this group");
      const code = await ensureGroupLink(group);
      const link = shortWaLink(code);
      const body = (b.message || "").replace(/\{\{\s*group_link\s*\}\}/g, link);
      const media = b.mediaId ? await toQueueMedia(b.mediaId) : null;
      if (b.mediaId && !media) throw new Error("The attached file was deleted");
      await enqueue({ chatId: groupId, body, media, related: "group-broadcast" });
      group.lastPostedAt = new Date();
      await group.save();
    } catch (e) {
      result.status = "failed";
      result.error = e.message;
    }
    b.results.push(result);
    await b.save();
    runtime.emit("broadcast:progress", { id: String(b._id), results: b.results, total: b.groupIds.length });
    if (b.results.length < b.groupIds.length) await sleep(randomBetween(env.wa.groupMinDelay, env.wa.groupMaxDelay));
  }
  b.status = "done";
  await b.save();
  runtime.emit("broadcast:progress", { id: String(b._id), results: b.results, total: b.groupIds.length, done: true });
}

module.exports = { syncGroups, runBroadcast, ensureGroupLink };
