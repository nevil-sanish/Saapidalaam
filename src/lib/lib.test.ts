import { test } from "node:test";
import assert from "node:assert/strict";
import { toPaise, rupees } from "./money.ts";
import { cutoffAt, slotStart, todayIST } from "./time.ts";

test("money", () => {
  assert.equal(toPaise("30000"), 3_000_000);
  assert.equal(toPaise("12.5"), 1250);
  assert.equal(toPaise("-3.05"), -305);
  assert.throws(() => toPaise("1.234"));
  assert.equal(rupees(1250), "₹12.50");
});

test("time IST + 24h cutoff boundary (BR-02)", () => {
  assert.equal(slotStart("2026-11-03", "07:30"), Date.parse("2026-11-03T02:00:00Z"));
  assert.equal(cutoffAt("2026-11-03", "07:30"), Date.parse("2026-11-02T02:00:00Z"));
  assert.equal(todayIST(Date.parse("2026-11-02T19:00:00Z")), "2026-11-03"); // 00:30 IST next day
});
