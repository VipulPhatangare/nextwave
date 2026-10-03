const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const { Media, AuditLog } = require("../models");
const { UPLOAD_DIR, MAX_BYTES, TYPES, matchesSignature, cleanName } = require("../services/media.service");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  limits: { fileSize: MAX_BYTES, files: 1 },
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString("hex") + "." + (TYPES[file.mimetype]?.[0] || "bin")),
  }),
  fileFilter: (req, file, cb) => (TYPES[file.mimetype] ? cb(null, true) : cb(Object.assign(new Error("Only JPG, PNG, WebP images and PDF files can be sent."), { status: 400 }))),
});

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post("/", (req, res, next) => {
  upload.single("file")(req, res, async (err) => {
    try {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: `That file is too big. The limit is ${MAX_BYTES / 1024 / 1024} MB.` });
        return res.status(err.status || 400).json({ error: err.message });
      }
      if (!req.file) return res.status(400).json({ error: "Choose a file to upload." });
      if (!matchesSignature(req.file.path, req.file.mimetype)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: "That file isn't really a " + TYPES[req.file.mimetype][0].toUpperCase() + ". It was not uploaded." });
      }
      const m = await Media.create({ filename: req.file.filename, original: cleanName(req.file.originalname), mime: req.file.mimetype, size: req.file.size, kind: TYPES[req.file.mimetype][1] });
      await AuditLog.create({ adminEmail: req.user?.email, action: "media.upload", details: `${m.original} (${Math.round(m.size / 1024)} KB)` }).catch(() => {});
      res.json(m);
    } catch (e) {
      next(e);
    }
  });
});

router.get("/", wrap(async (req, res) => res.json(await Media.find().sort({ createdAt: -1 }).limit(50))));

router.get(
  "/:id/file",
  wrap(async (req, res) => {
    const m = await Media.findById(req.params.id);
    if (!m) return res.status(404).json({ error: "File not found." });
    const file = path.join(UPLOAD_DIR, m.filename);
    if (!fs.existsSync(file)) return res.status(404).json({ error: "The file is no longer on the server." });
    res.setHeader("Content-Type", m.mime);
    res.setHeader("Content-Disposition", `inline; filename="${m.original.replace(/"/g, "")}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    fs.createReadStream(file).pipe(res);
  })
);

router.delete(
  "/:id",
  wrap(async (req, res) => {
    const m = await Media.findByIdAndDelete(req.params.id);
    if (m) fs.unlink(path.join(UPLOAD_DIR, m.filename), () => {});
    res.json({ ok: true });
  })
);

module.exports = router;
