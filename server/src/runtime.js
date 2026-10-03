// Shared handles so modules don't import each other in circles.
const runtime = {
  io: null,
  waClient: null,
  waStatus: "disconnected", // disconnected | qr | connected
  waQr: null,
  agenda: null,
  emit(event, data) {
    if (this.io) this.io.to("admins").emit(event, data);
  },
};

module.exports = runtime;
