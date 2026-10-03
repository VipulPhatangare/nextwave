const clean = (c) => String(c || "").trim().toUpperCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomBetween = (a, b) => Math.floor(a + Math.random() * (b - a));

module.exports = { clean, sleep, randomBetween };
