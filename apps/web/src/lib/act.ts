import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/** Run a server-action body; redirect back to `path` with ?ok= or ?error= so the page can show <Flash>. */
export async function act(path: string, fn: () => Promise<string | void>) {
  let msg: string;
  try { msg = (await fn()) || "Done"; }
  catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath(path.split("?")[0]);
  redirect(`${path}${path.includes("?") ? "&" : "?"}ok=${encodeURIComponent(msg)}`);
}
