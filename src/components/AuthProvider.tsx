"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ADMIN_EMAIL, fb, hasFirebase } from "@/lib/firebase";
import type { Profile, RoleKey } from "@/lib/roles";

type Ctx = { profile: Profile | null; user: User | null; logout: () => void; token: () => Promise<string> };
const AuthCtx = createContext<Ctx>({ profile: null, user: null, logout: () => {}, token: async () => "" });
export const useAuth = () => useContext(AuthCtx);

const DEMO: Profile = { uid: "demo", name: "Director tehnic (demo)", role: "admin", demo: true };

type State = { s: "loading" } | { s: "out" } | { s: "noaccess"; email: string } | { s: "in"; user: User | null; profile: Profile };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<State>(hasFirebase ? { s: "loading" } : { s: "in", user: null, profile: DEMO });

  useEffect(() => {
    if (!hasFirebase) return;
    const { auth, db } = fb();
    return onAuthStateChanged(auth, async (u) => {
      if (!u) return setSt({ s: "out" });
      const ref = doc(db, "users", u.uid);
      let prof = (await getDoc(ref).catch(() => null))?.data() as
        | { name?: string; email?: string; role?: string; active?: boolean }
        | undefined;
      if (!prof && ADMIN_EMAIL && (u.email ?? "").toLowerCase() === ADMIN_EMAIL) {
        prof = { name: "Director tehnic", email: u.email ?? "", role: "admin", active: true };
        await setDoc(ref, { ...prof, created: Date.now() }).catch(() => {});
      }
      // Tabletele de stație (rol „statie”, cu PIN pe operator) folosesc deocamdată aplicația clasică.
      if (!prof || prof.active === false || prof.role === "statie")
        return setSt({ s: "noaccess", email: u.email ?? "" });
      setSt({
        s: "in",
        user: u,
        profile: { uid: u.uid, name: prof.name ?? u.email ?? "", email: u.email ?? "", role: (prof.role as RoleKey) ?? "op" },
      });
    });
  }, []);

  if (st.s === "loading") return <Splash>Se încarcă…</Splash>;
  if (st.s === "out") return <Login />;
  if (st.s === "noaccess")
    return (
      <Splash>
        <p className="text-center">
          Contul <b>{st.email}</b> nu are acces aici.
          <br />
          Tabletele de stație folosesc{" "}
          <a className="text-brand underline" href="/clasic">
            aplicația completă
          </a>
          .
        </p>
        <button className="btn-secondary mt-4" onClick={() => signOut(fb().auth)}>
          Ieșire
        </button>
      </Splash>
    );

  const value: Ctx = {
    profile: st.profile,
    user: st.user,
    logout: () => (hasFirebase ? signOut(fb().auth) : undefined),
    token: async () => (st.user ? st.user.getIdToken() : ""),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="De la Ferma cu Omenie" className="h-20 w-auto" />
      {children}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Splash>
      <form
        className="card w-full max-w-sm space-y-3 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          setBusy(true);
          try {
            await signInWithEmailAndPassword(fb().auth, email.trim(), pass);
          } catch {
            setErr("Email sau parolă greșite.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="text-center text-xl font-semibold">Autentificare</h1>
        <input className="field" type="email" placeholder="Email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="field" type="password" placeholder="Parolă" autoComplete="current-password" required value={pass} onChange={(e) => setPass(e.target.value)} />
        {err && <p className="text-center text-sm text-bad">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Se verifică…" : "Intră"}
        </button>
      </form>
    </Splash>
  );
}
