import { createServerClient, createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type CookieStore = { getAll(): { name: string; value: string }[]; set(name: string, value: string, options?: object): void };
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Server client bound to the signed-in user's cookies → every query runs under RLS as that user. */
export function serverClient(store: CookieStore) {
  return createServerClient(url(), anon(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* RSC: read-only */ } },
    },
  });
}
export const browserClient = () => createBrowserClient(url(), anon());
/** Anonymous client (no session) for public calls. Never the service role here. */
export const anonClient = () => createClient(url(), anon(), { auth: { persistSession: false } });
