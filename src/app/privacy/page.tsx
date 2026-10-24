export const metadata = { title: "Privacy — Saapidalaam" };

// Public page required for the Google OAuth consent screen.
export default function Privacy() {
  return (
    <main style={{ maxWidth: 720 }}>
      <div className="card">
        <h1>Privacy policy</h1>
        <p className="muted">Saapidalaam — IIIT Kottayam mess booking. Last updated 24 Oct 2026.</p>
        <h3>What we collect</h3>
        <p>Your college Google account name and email (@iiitkottayam.ac.in), your roll number, a profile photo you upload for counter verification, your meal bookings, deposits, refunds and counter scan records.</p>
        <h3>Why</h3>
        <p>To let you pre-book meals, charge booked meals against your semester deposit, verify you at the mess counter, and give the college a transparent record of meals and money.</p>
        <h3>Who can see it</h3>
        <p>You see your own data. Mess staff see your name, roll number and photo when you are scanned. The mess manager sees only aggregate counts and totals, never per-student money. College administrators see all records.</p>
        <h3>Sharing</h3>
        <p>We do not sell or share your data outside IIIT Kottayam and the mess operator. Google sign-in is used only to confirm your college email.</p>
        <h3>Contact</h3>
        <p>Questions or deletion requests: the IIIT Kottayam mess committee / college administration.</p>
      </div>
    </main>
  );
}
