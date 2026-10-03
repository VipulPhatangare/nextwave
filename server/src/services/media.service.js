const fs = require("fs");
const path = require("path");
const { Media } = require("../models");

const UPLOAD_DIR = path.resolve("./uploads");
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = { "image/jpeg": ["jpg", "image"], "image/png": ["png", "image"], "image/webp": ["webp", "image"], "application/pdf": ["pdf", "pdf"] };

// Check the file's real first bytes, not just the name or the type the browser claimed.
function matchesSignature(file, mime) {
  const fd = fs.openSync(file, "r");
  const b = Buffer.alloc(12);
  fs.readSync(fd, b, 0, 12, 0);
  fs.closeSync(fd);
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") return b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/webp") return b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP";
  if (mime === "application/pdf") return b.slice(0, 5).toString() === "%PDF-";
  return false;
}

const cleanName = (n) => String(n || "file").replace(/[^\w.\- ()]+/g, "_").slice(0, 80);

// What the send queue needs, or null if the file is gone.
async function toQueueMedia(id) {
  if (!id) return null;
  const m = await Media.findById(id);
  if (!m) return null;
  return { path: path.join(UPLOAD_DIR, m.filename), mime: m.mime, name: m.original };
}

module.exports = { UPLOAD_DIR, MAX_BYTES, TYPES, matchesSignature, cleanName, toQueueMedia };
