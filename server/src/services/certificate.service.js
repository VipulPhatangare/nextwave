const fs = require("fs");
const os = require("os");
const path = require("path");
const PDFDocument = require("pdfkit");
const { Event, Registration, Template } = require("../models");
const { buildVars, render } = require("./template.service");
const { sendEmail } = require("./email.service");
const { enqueue } = require("../whatsapp/sendQueue");

const ORANGE = "#FF6A00";
const BLACK = "#0A0A0A";

// A4 landscape certificate, black with an orange frame.
function generatePdf(event, reg) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width;
    const H = doc.page.height;
    doc.rect(0, 0, W, H).fill(BLACK);
    doc.lineWidth(3).rect(28, 28, W - 56, H - 56).stroke(ORANGE);
    doc.lineWidth(0.75).rect(38, 38, W - 76, H - 76).stroke("#3A2A1A");

    doc.fillColor(ORANGE).font("Helvetica-Bold").fontSize(13).text("CERTIFICATE OF PARTICIPATION", 0, 92, { align: "center", characterSpacing: 4 });
    doc.fillColor("#8A8580").font("Helvetica").fontSize(14).text("This certifies that", 0, 150, { align: "center" });
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(44).text(reg.name, 60, 185, { align: "center", width: W - 120 });
    const underlineY = 255;
    doc.moveTo(W / 2 - 130, underlineY).lineTo(W / 2 + 130, underlineY).lineWidth(2).stroke(ORANGE);
    doc.fillColor("#8A8580").font("Helvetica").fontSize(14).text("successfully took part in the free online workshop", 0, 280, { align: "center" });
    doc.fillColor(ORANGE).font("Helvetica-Bold").fontSize(26).text(event.name, 60, 312, { align: "center", width: W - 120 });
    const date = event.startAt ? new Date(event.startAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : "";
    doc.fillColor("#8A8580").font("Helvetica").fontSize(13).text(`and built a working AI project in 60 minutes${date ? " on " + date : ""}.`, 0, 372, { align: "center" });
    // a project that was submitted after the workshop and approved
    if (reg.project?.status === "approved") {
      const label = `PROJECT VERIFIED${typeof reg.project.score === "number" ? `  ·  SCORE ${reg.project.score}/10` : ""}`;
      doc.font("Helvetica-Bold").fontSize(11);
      const bw = doc.widthOfString(label, { characterSpacing: 2 }) + 44;
      doc.roundedRect(W / 2 - bw / 2, 408, bw, 30, 15).lineWidth(1.5).stroke(ORANGE);
      doc.circle(W / 2 - bw / 2 + 18, 423, 5).fill(ORANGE);
      doc.fillColor(ORANGE).text(label, W / 2 - bw / 2 + 30, 418, { width: bw - 34, align: "left", characterSpacing: 2, lineBreak: false });
    }
    if (reg.college) doc.fillColor("#6B665F").fontSize(11).text(reg.college, 0, H - 105, { align: "center" });
    doc.fillColor("#6B665F").fontSize(9).text(`Certificate ID: ${String(reg._id).slice(-8).toUpperCase()}`, 0, H - 80, { align: "center" });
    doc.end();
  });
}

// Sends the certificate by WhatsApp (as a PDF) and/or email. Returns what was queued.
async function sendCertificate(reg, { force = false } = {}) {
  if (reg.certificateSentAt && !force) return { skipped: "already sent" };
  const event = await Event.findOne();
  if (event.settings.sendingPaused) return { skipped: "paused" };
  const pdf = await generatePdf(event, reg);
  const vars = buildVars(event, reg);
  const result = {};

  if (reg.waId && !reg.optedOutWa) {
    const tpl = await Template.findOne({ key: "CERTIFICATE", channel: "whatsapp" });
    const file = path.join(os.tmpdir(), `certificate-${reg._id}.pdf`);
    fs.writeFileSync(file, pdf);
    enqueue({ chatId: reg.waId, body: render(tpl?.body || "Your certificate 🎓", vars), related: "CERTIFICATE", mediaPath: file })
      .finally(() => fs.unlink(file, () => {}))
      .catch(() => {});
    result.whatsapp = "queued";
  }
  if (reg.email && !reg.optedOutEmail) {
    const tpl = await Template.findOne({ key: "CERTIFICATE", channel: "email" });
    const r = await sendEmail({
      to: reg.email,
      subject: render(tpl?.subject || "Your certificate", vars),
      text: render(tpl?.body || "Your certificate is attached.", vars),
      event,
      templateKey: "CERTIFICATE",
      attachments: [{ filename: "certificate.pdf", content: pdf, contentType: "application/pdf" }],
    });
    result.email = r.ok ? "sent" : r.error;
  }
  if (result.whatsapp || result.email === "sent") await Registration.updateOne({ _id: reg._id }, { certificateSentAt: new Date() });
  return result;
}

module.exports = { generatePdf, sendCertificate };
