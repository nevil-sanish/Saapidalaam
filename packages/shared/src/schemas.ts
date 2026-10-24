import { z } from "zod";
// Shared Zod schemas: validate every external input (forms, Edge Function bodies).
export const diet = z.enum(["veg", "nonveg"]);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
export const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Invalid time");
export const uuid = z.string().uuid();
export const rupeesInput = z.string().trim().regex(/^-?\d+(\.\d{1,2})?$/, "Invalid amount");
export const bookSchema = z.object({ date: isoDate, slotId: z.coerce.number().int().positive(), diet });
export const cancelSchema = z.object({ bookingId: uuid });
export const depositSchema = z.object({ amount: rupeesInput, txnRef: z.string().trim().min(1).max(64) });
export const scanSchema = z.object({ input: z.string().trim().min(1).max(200), method: z.enum(["qr", "backup"]) });
export const ruleSchema = z.object({ slot: z.number().int().positive(), diet });
export const patternSchema = z.object({
  kind: z.enum(["weekly", "monthly"]),
  month: isoDate.nullable(),
  rules: z.record(z.string(), z.array(ruleSchema)),
});
export const adjustmentSchema = z.object({ studentId: uuid, amount: rupeesInput, note: z.string().trim().min(3).max(300) });
export const refundSchema = z.object({ studentId: uuid, amount: rupeesInput, ref: z.string().trim().min(1).max(100) });
export const allowlistSchema = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(["staff", "manager", "admin"]) });
export const specialSchema = z.object({ date: isoDate, slotId: z.coerce.number().int().positive(), items: z.string().trim().min(1).max(300), veg: rupeesInput, nonveg: rupeesInput });
