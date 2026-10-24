import "server-only";
import { supa } from "./auth";

/** Call a Postgres RPC as the signed-in user; throws the DB's readable message (e.g. "... (BR-02)"). */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = await supa();
  const { data, error } = await sb.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}
