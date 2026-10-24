import { requireRole } from "@/lib/auth";
import { act } from "@/lib/act";
import { regenerateBackupCode } from "@/lib/db";
import { Flash } from "@/components/Shell";
import { RotatingQr } from "@/components/student/RotatingQr";

async function newCode() {
  "use server";
  const user = await requireRole("student");
  // Code is shown once via the flash; only its hash is stored (BR-31).
  await act("/student/qr", async () => `Your new backup code: ${await regenerateBackupCode(user.id)} — write it down, it won't be shown again`);
}

export default async function QrPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireRole("student");
  const sp = await searchParams;
  return (
    <>
      <h1>Counter QR</h1>
      <Flash sp={sp} />
      <div className="qr-wrap">
        <section className="card dark qr-card">
          <RotatingQr />
          <div className="qr-who">
            <b>{user.full_name}</b>
            <span className="muted">{user.roll_no ?? "No roll number"}</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Show this at the counter. Screenshots stop working within 30 seconds.</p>
        </section>
        <section className="card lilac">
          <h2>Backup code</h2>
          <p>Phone dead? Tell the counter staff your 8-character backup code instead. Scans with a backup code are flagged for review.</p>
          <p style={{ color: "rgba(37,37,37,.72)" }}>Generating a new code makes the old one stop working.</p>
          <form action={newCode}><button>Generate new backup code</button></form>
        </section>
      </div>
    </>
  );
}
