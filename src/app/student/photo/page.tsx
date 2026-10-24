import { requireRole } from "@/lib/auth";
import { act } from "@/lib/act";
import { sql } from "@/lib/db";
import { Flash } from "@/components/Shell";

const MAX = 2 * 1024 * 1024;

async function upload(fd: FormData) {
  "use server";
  const user = await requireRole("student");
  await act("/student/photo", async () => {
    const f = fd.get("photo");
    if (!(f instanceof File) || f.size === 0) throw new Error("Choose a photo");
    if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(f.type)) throw new Error("Only image files are allowed");
    if (f.size > MAX) throw new Error("Photo must be 2 MB or smaller");
    const bytes = Buffer.from(await f.arrayBuffer());
    await sql`update profiles set photo = ${bytes}, photo_type = ${f.type} where id = ${user.id}`;
    return "Photo saved";
  });
}

// Story 1: first login asks for a profile photo (camera or file).
export default async function PhotoPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireRole("student");
  const sp = await searchParams;
  return (
    <>
      <h1>Profile photo</h1>
      <Flash sp={sp} />
      <div className="card">
        <p className="muted">Counter staff see this photo when they scan your QR. Max 2 MB.</p>
        {user.has_photo && <p><img src={`/api/photo/${user.id}?v=${Date.now()}`} alt="Your current profile photo" width={160} style={{ borderRadius: 8 }} /></p>}
        <form action={upload} className="inline">
          <label htmlFor="photo">{user.has_photo ? "Replace photo" : "Photo"}</label>
          <input id="photo" name="photo" type="file" accept="image/*" capture="user" required />
          <button>Upload</button>
        </form>
      </div>
    </>
  );
}
