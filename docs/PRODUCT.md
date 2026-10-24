# Mess Management System — Product Documentation

> Source of truth for *what* we build. Business rules are numbered (BR-xx) so code, tests and commits can reference them.
> Campus: IIIT Kottayam. Users: students, mess staff, mess manager (third party), admin (college authority).

---

## 1. Problem

The mess cooks for everyone whether they eat or not, students pay flat fees for meals they skip, and nobody has reliable data on who ate what. This system makes meals **pre-booked, paid from a deposit, verified at the counter by QR, and fully visible** to students, the manager and the college.

## 2. Goals / Non-goals

**Goals**
- Students book only the meals they want (opt-in), at least 24h ahead.
- Every rupee is traceable: deposit → meal charges → refund.
- The kitchen knows exact demand per meal, per day, per month.
- Counter verification is fast (one scan) and impersonation-resistant (photo + rotating QR).

**Non-goals (phase 1)**
- Guests, faculty, day scholars, walk-in purchases.
- Multiple messes.
- Inventory / raw-material purchasing.
- Offline scanning (decision: mess Wi-Fi is assumed reliable — see D-07).

## 3. Roles & platforms

| Role | Who | Platform | Can see finances? |
|---|---|---|---|
| Student | Any `@iiitkottayam.ac.in` account | Mobile app (Android/iOS) + push notifications | Own only |
| Staff | Mess counter staff | Mobile app + web | No |
| Manager | Mess contractor (third party) | Web | Only aggregate amount payable to the mess, never per student |
| Admin | College authority | Web | Everything |

## 4. Glossary

- **Slot**: a meal period (Breakfast, Lunch, Snacks, Dinner). Each has a start time.
- **Diet**: Veg / Non-veg. Price differs by slot × diet.
- **Booking**: one student × one date × one slot. Unit of everything.
- **Pattern**: a rule that generates bookings automatically. Two types: *weekly* (e.g. every Mon: B, L, D) and *monthly package* (a per-day selection for a given month).
- **One-off booking**: a single booking made manually.
- **Cutoff**: 24 hours before the slot's start time. After cutoff a booking is locked.
- **Special meal**: a slot on a specific date that replaces the regular meal with a higher price.
- **Deposit**: semester amount (default ₹30,000) paid online to the college account, then verified by admin.
- **Ledger**: append-only list of money movements per student.

## 5. Business rules

### Booking
- **BR-01** Default is **not booked**. A meal is booked only through a pattern, a one-off booking, or by accepting a special meal.
- **BR-02** A booking can be created only if the slot start is **≥ 24h away** (cutoff).
- **BR-03** A booking can be cancelled only before cutoff. After cutoff it is **locked** and charged.
- **BR-04** One booking per student per date per slot. A one-off booking or cancellation overrides what a pattern generated for that slot.
- **BR-05** A student has **at most one active pattern per month**: either weekly or monthly. Switching replaces future (pre-cutoff) pattern-generated bookings.
- **BR-06** Pattern bookings are materialised as concrete bookings for all slots beyond cutoff within the pattern's range. A daily job extends weekly patterns forward.
- **BR-07** When the admin publishes a **new monthly menu or price change**, existing patterns do **not** roll into the new month automatically. Students are notified and must confirm or re-pick their monthly package. Until they do, they have no bookings in the new month.
- **BR-08** A booking stores a **price snapshot** at creation. Later price changes never alter existing bookings.

### Money
- **BR-10** All amounts are stored as integer paise.
- **BR-11** The deposit counts only after the admin marks it **verified** (with the transaction reference).
- **BR-12** A booking can be created only if the student's **available balance** ≥ the booking price, where:
  `available = verified deposits − posted charges − refunds − value of unlocked future bookings`.
- **BR-13** The meal charge is **posted to the ledger when the booking locks** (at cutoff).
- **BR-14** No-shows are charged. A locked booking that is not scanned becomes `no_show` after the slot ends; the charge stays.
- **BR-15** The ledger is append-only. Corrections are new `adjustment` entries made by the admin, with a mandatory note.
- **BR-16** Expected refund (shown to the student at any time) = verified deposits − posted charges − value of future booked meals − refunds already paid.
- **BR-17** Refunds are recorded by the admin (amount + payout reference), normally at semester end.

### Special meals
- **BR-20** The admin creates a special meal for a date + slot with a special price, at least **3 days** before (so students have time before the cutoff).
- **BR-21** Students who already have a booking for that slot are moved to the special meal automatically. They see the **extra amount** and can opt out until cutoff. Opting out cancels that slot's booking.
- **BR-22** Students without a booking can prebook the special meal until cutoff.
- **BR-23** Every affected student gets a push notification when a special meal is announced.

### Counter / scanning
- **BR-30** Each student has a **rotating QR** in the app (signed token, valid about 30s), so a screenshot can't be reused.
- **BR-31** Each student also has an **8-character alphanumeric backup code** (for a dead phone), regenerable by the student or admin. Scans made with the backup code are flagged.
- **BR-32** The scan result shows the student's **photo, name, roll number** and one of: ✅ Booked → marked served; ⚠️ Already served (time + staff); ❌ No booking for this slot.
- **BR-33** A booking can be served **only once**. Every scan attempt, including failed ones, is logged with the staff member, time and method.
- **BR-34** Scanning works only within the slot's serving window.

### Access
- **BR-40** Students sign in with Google, restricted to `@iiitkottayam.ac.in`, enforced on the server and not only in the UI.
- **BR-41** Staff, manager and admin accounts exist only if the admin has added them to an allowlist with a role.
- **BR-42** The manager never sees per-student financial data. The manager sees demand and the aggregate amount payable to the mess.

## 6. User stories

### Student (mobile)
1. Sign in with my college Google account; first login asks for a profile photo (used for verification).
2. See the monthly menu by day and slot, with veg/non-veg prices.
3. Set a **weekly pattern** (pick slots + diet per weekday) or a **monthly package** for a month.
4. Book or cancel a single meal (before cutoff); see a clear countdown to each cutoff.
5. See special meals, the extra cost, and opt out.
6. Show my rotating QR at the counter; view my backup code.
7. **Transparency dashboard**: deposit, meals consumed, meals scheduled (pattern vs one-off), amount spent, committed amount, **expected refund now**, full ledger history.
8. Get notifications: menu published, special meal, cutoff reminder (optional), low balance, monthly package confirmation needed.

### Staff (mobile + web)
1. Scan QR (camera), or type a backup code.
2. See photo + result instantly.
3. See the live count for the current slot: booked, served, **remaining**, with a searchable remaining list.

### Manager (web)
1. Demand by date × slot × diet, for day / week / month views, with menu items alongside.
2. Upcoming locked counts (exact) vs still-changeable counts (estimate) for the next days.
3. Served vs booked history (wastage indicator).
4. Aggregate amount payable to the mess for a period.
5. CSV export of demand.

### Admin (web)
1. Everything the manager sees, plus finances.
2. Manage semesters, slots and times, prices, the monthly menu, special meals.
3. Manage users and the allowlist (staff, manager, admin); deactivate students.
4. Verify deposits; record refunds; make adjustments with notes.
5. Audit: who scanned whom, when, how (QR/backup); failed scan attempts.
6. Per-student drill-down: bookings, scans, ledger.
7. Reports: bookings vs served, no-shows, revenue per period. CSV export.

## 7. Key flows

**Pattern → bookings**: the student saves a pattern → server validates balance → bookings are created for every slot beyond cutoff in range → the daily job extends them → each booking locks at cutoff and its charge posts.

**Counter**: the student opens the QR → staff scans → server verifies the token signature and time window → finds the booking for (student, today, current slot) → marks it served in a transaction → returns photo + status.

**Semester close**: the admin freezes bookings → no-shows are finalised → the expected refund becomes final → the admin records payouts.

## 8. Non-functional requirements

- Scan round-trip under 1.5s on campus Wi-Fi.
- All times computed in **Asia/Kolkata**; stored as `timestamptz`.
- Every table has row-level security; the client never has service-role keys.
- Money logic lives in database functions (transactions), not in the client.
- Student photos are kept in private storage and served via short-lived signed URLs to staff only.
- Audit log for every admin write.

## 9. Decisions log (product)

| ID | Decision |
|---|---|
| D-01 | Opt-in booking; default not booked. |
| D-02 | 24h cutoff applies to booking, cancellation and special opt-out. |
| D-03 | Patterns, monthly packages and one-offs are ways to *create bookings*; billing is always per booked meal at its snapshot price. |
| D-04 | No-shows are charged. |
| D-05 | Deposit is paid online to the college account; the admin verifies it in-app (phase 1). Payment gateway is phase 2. |
| D-06 | Single mess; students only. |
| D-07 | No offline scanning; the scanner shows a clear network error and the backup code path still needs network. |
| D-08 | Rotating QR + backup code; photo shown on every scan. |

## 10. Open questions (resolve before the phase noted)

1. **Manager/staff login**: they likely have no college email. Proposed: admin allowlist + Google login with any email, or a magic link. *(Before auth module)*
2. **Deposit flow**: does the student enter the transaction ID in the app for the admin to verify, or does the admin bulk-import from the college bank statement? *(Before money module)*
3. Exact slot list and times. Is there a Snacks slot? *(Before schema)*
4. A student who leaves mid-semester: is an immediate refund allowed? *(Before refunds)*
5. Is 3 days enough notice for special meals? *(Before specials)*
6. If the deposit runs short after a price rise: block new bookings only, or ask for a top-up? *(Before money module)*
