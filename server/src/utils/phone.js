const { parsePhoneNumberFromString } = require("libphonenumber-js");

// Returns { e164: "+919876543210", digits: "919876543210", waId: "919876543210@c.us" } or null
function normalizePhone(input, defaultCountry = "IN") {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(String(input).trim(), defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  const e164 = parsed.number;
  const digits = e164.replace("+", "");
  return { e164, digits, waId: `${digits}@c.us` };
}

module.exports = { normalizePhone };
