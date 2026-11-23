import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Client cu drepturi depline – DOAR pe server. */
export function admin(): SupabaseClient {
  if (!URL || !SERVICE) throw new Error("Lipsește SUPABASE_SERVICE_ROLE_KEY");
  return createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Verifică tokenul trimis de browser; întoarce utilizatorul și rolul lui (din docs/users). */
export async function caller(req: Request): Promise<{ id: string; email: string; role: string } | null> {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/, "");
  if (!tok || !URL || !ANON) return null;
  const pub = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await pub.auth.getUser(tok);
  if (error || !data.user) return null;
  let role = "";
  if (SERVICE) {
    const r = await admin().from("docs").select("data").eq("col", "users").eq("id", data.user.id).maybeSingle();
    const d = r.data?.data as { role?: string; active?: boolean } | undefined;
    role = d && d.active !== false ? (d.role ?? "") : "";
  }
  return { id: data.user.id, email: data.user.email ?? "", role };
}
