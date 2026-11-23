"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { db, hasSupabase, sb } from "@/lib/supabase";
import type { Profile, RoleKey } from "@/lib/roles";

type Ctx = { profile: Profile | null; user: User | null; logout: () => void; token: () => Promise<string> };
const AuthCtx = createContext<Ctx>({ profile: null, user: null, logout: () => {}, token: async () => "" });
export const useAuth = () => useContext(AuthCtx);

const DEMO: Profile = { uid: "demo", name: "Director tehnic (demo)", role: "admin", demo: true };
type Prof = { name?: string; email?: string; role?: string; active?: boolean };
type Op = { id: string; name?: string; role?: string; pin?: string; active?: boolean };

type State =
  | { s: "loading" }
  | { s: "out" }
  | { s: "noaccess"; email: string }
  | { s: "station"; user: User; prof: Prof }
  | { s: "in"; user: User | null; profile: Profile };

async function logout() {
  if (!hasSupabase) return;
  await sb().auth.signOut();
  db().clearLocal();
  location.replace("/");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<State>(hasSupabase ? { s: "loading" } : { s: "in", user: null, profile: DEMO });

  useEffect(() => {
    if (!hasSupabase) return;
    let handled = "";
    const { data } = sb().auth.onAuthStateChange((ev, session) => {
      if (ev === "PASSWORD_RECOVERY") return void (location.replace("/reset"));
      const u = session?.user;
      if (!u) return setSt({ s: "out" });
      if (handled === u.id) return;
      handled = u.id;
      // async în afara callback-ului (recomandarea Supabase)
      setTimeout(async () => {
        let prof: Prof | null = null;
        try {
          const r = await sb().rpc("ensure_profile");
          if (r.error) throw r.error;
          prof = r.data as Prof | null;
          if (prof) localStorage.setItem("fdt_prof_" + u.id, JSON.stringify(prof));
        } catch {
          prof = JSON.parse(localStorage.getItem("fdt_prof_" + u.id) ?? "null") as Prof | null; // fără rețea
        }
        if (!prof || prof.active === false) return setSt({ s: "noaccess", email: u.email ?? "" });
        if (prof.role === "statie") return setSt({ s: "station", user: u, prof });
        setSt({
          s: "in",
          user: u,
          profile: { uid: u.id, name: prof.name ?? u.email ?? "", email: u.email ?? "", role: (prof.role as RoleKey) ?? "op" },
        });
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (st.s === "loading") return <Splash>Se încarcă…</Splash>;
  if (st.s === "out") return <Login />;
  if (st.s === "noaccess")
    return (
      <Splash>
        <p className="max-w-sm text-center">
          Contul <b>{st.email}</b> nu are un rol activ. Cere administratorului să îți dea acces.
        </p>
        <button className="btn-secondary" onClick={logout}>
          Ieșire
        </button>
      </Splash>
    );
  if (st.s === "station")
    return (
      <StationPin
        prof={st.prof}
        onPick={(o) =>
          setSt({ s: "in", user: st.user, profile: { uid: st.user.id, name: o.name ?? "", role: (o.role as RoleKey) ?? "op", station: true } })
        }
      />
    );

  const value: Ctx = {
    profile: st.profile,
    user: st.user,
    logout: () => (st.profile.station ? location.reload() : void logout()),
    token: async () => (hasSupabase ? ((await sb().auth.getSession()).data.session?.access_token ?? "") : ""),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-gradient-to-br from-black via-brand-dark to-brand p-6 text-ink">
      {children}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="card w-full max-w-sm space-y-3 p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="De la Ferma cu Omenie" className="mx-auto h-[74px] w-auto" />
      {children}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Splash>
      <Card>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setMsg("");
            setBusy(true);
            const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password: pass });
            setBusy(false);
            if (error) setMsg("Email sau parolă greșite.");
          }}
        >
          <h1 className="text-center text-xl font-semibold text-brand-dark">Autentificare</h1>
          <input className="field" type="email" placeholder="Email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="field" type="password" placeholder="Parolă" autoComplete="current-password" required value={pass} onChange={(e) => setPass(e.target.value)} />
          <p className="min-h-5 text-center text-sm text-bad">{msg}</p>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Se verifică…" : "Intră"}
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={async () => {
              if (!email.trim()) return setMsg("Scrie întâi emailul.");
              await sb().auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + "/reset" });
              setMsg("Ți-am trimis un email pentru parolă nouă.");
            }}
          >
            Am uitat parola
          </button>
        </form>
      </Card>
    </Splash>
  );
}

async function sha(id: string, pin: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id + ":" + pin));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function StationPin({ prof, onPick }: { prof: Prof; onPick: (o: Op) => void }) {
  const [ops, setOps] = useState<Op[] | null>(null);
  const [sel, setSel] = useState<Op | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    const off = db()
        .collection("operators")
        .onSnapshot(
          (s) =>
            setOps(
              s.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<Op, "id">) }))
                .filter((o) => o.active !== false)
                .sort((a, b) => String(a.name).localeCompare(String(b.name))),
            ),
          () => setErr("Nu pot citi lista de operatori."),
        );
    return () => void off();
  }, []);
  const go = async () => {
    if (!sel) return;
    if ((await sha(sel.id, pin)) !== sel.pin) return setErr("PIN greșit.");
    onPick(sel);
  };
  return (
    <Splash>
      <Card>
        <h1 className="text-center text-xl font-semibold text-brand-dark">{prof.name || "Tabletă stație"}</h1>
        <p className="text-center text-muted">Cine lucrează acum?</p>
        <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-auto">
          {ops?.map((o) => (
            <button
              key={o.id}
              onClick={() => (setSel(o), setPin(""), setErr(""))}
              className={`min-h-14 rounded-xl font-semibold ${sel?.id === o.id ? "bg-brand text-white" : "bg-brand-soft text-brand-dark"}`}
            >
              {o.name}
            </button>
          ))}
          {ops && !ops.length && <p className="col-span-2 text-center text-bad">Niciun operator definit – cere administratorului.</p>}
        </div>
        {sel && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void go();
            }}
          >
            <input className="field text-center text-2xl tracking-[.4em]" type="password" inputMode="numeric" maxLength={6} placeholder="PIN" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} />
            <button className="btn-primary w-full">Intră</button>
          </form>
        )}
        <p className="min-h-5 text-center text-sm text-bad">{err}</p>
        <button className="btn-ghost w-full" onClick={logout}>
          Deconectează tableta
        </button>
      </Card>
    </Splash>
  );
}
