const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// Where RemoteAuth keeps its files. Passed to RemoteAuth as `dataPath` so both sides agree.
const DATA_DIR = path.resolve("./.wwebjs_auth");

// Replacement for wwebjs-mongo's MongoStore. That one reads the session zip from the process's current
// folder, but whatsapp-web.js 1.34 writes it into dataPath, so saving crashed with an unhandled ENOENT
// and the login never reached MongoDB. Same GridFS bucket names, so nothing else changes.
class SafeMongoStore {
  bucket(session) {
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: `whatsapp-${session}` });
  }

  async sessionExists({ session }) {
    const n = await mongoose.connection.db.collection(`whatsapp-${session}.files`).countDocuments();
    return n > 0;
  }

  async save({ session }) {
    const file = path.join(DATA_DIR, `${session}.zip`);
    const bucket = this.bucket(session);
    await new Promise((resolve, reject) => {
      const src = fs.createReadStream(file);
      const dst = bucket.openUploadStream(`${session}.zip`);
      src.once("error", reject);
      dst.once("error", reject);
      dst.once("finish", resolve);
      src.pipe(dst);
    });
    const docs = await bucket.find({ filename: `${session}.zip` }).toArray();
    docs.sort((a, b) => b.uploadDate - a.uploadDate);
    for (const old of docs.slice(1)) await bucket.delete(old._id);
  }

  async extract({ session, path: outPath }) {
    const bucket = this.bucket(session);
    await new Promise((resolve, reject) => {
      const src = bucket.openDownloadStreamByName(`${session}.zip`);
      const dst = fs.createWriteStream(outPath);
      src.once("error", reject);
      dst.once("error", reject);
      dst.once("close", resolve);
      src.pipe(dst);
    });
  }

  async delete({ session }) {
    const bucket = this.bucket(session);
    const docs = await bucket.find({ filename: `${session}.zip` }).toArray();
    for (const d of docs) await bucket.delete(d._id);
  }
}

module.exports = { SafeMongoStore, DATA_DIR };
