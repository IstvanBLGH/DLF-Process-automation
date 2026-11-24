// Creează un cont nou (doar Administratorul). Profilul (nume, rol) îl scrie apoi aplicația în docs/users.
import { admin, caller } from "@/lib/server";

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return Response.json(
      { error: "Pe server lipsește SUPABASE_SERVICE_ROLE_KEY (Vercel → Settings → Environment Variables), apoi Redeploy." },
      { status: 500 },
    );
  const me = await caller(req);
  if (!me || me.role !== "admin") return Response.json({ error: "Doar administratorul poate crea conturi." }, { status: 403 });
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password || password.length < 6)
    return Response.json({ error: "Email și parolă (minim 6 caractere) obligatorii." }, { status: 400 });
  try {
    const { data, error } = await admin().auth.admin.createUser({ email: email.trim(), password, email_confirm: true });
    if (error || !data.user) return Response.json({ error: error?.message ?? "Eroare la creare" }, { status: 400 });
    return Response.json({ uid: data.user.id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Eroare la creare" }, { status: 500 });
  }
}
