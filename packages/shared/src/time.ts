// Rule 5: all business time is Asia/Kolkata. Never use raw Date for business logic elsewhere.
const IST = "+05:30";
const DAY = 86_400_000;
export const slotStart = (date: string, time: string) => Date.parse(`${date}T${time}:00${IST}`);
export const cutoffAt = (date: string, time: string) => slotStart(date, time) - DAY; // BR-02
export const todayIST = (now = Date.now()) => new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => new Date(Date.parse(date + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
export const fmtIST = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
