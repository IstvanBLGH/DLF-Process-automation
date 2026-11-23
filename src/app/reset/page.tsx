"use client";
import { useEffect, useState } from "react";
import { hasSupabase, sb } from "@/lib/supabase";

// Pagina din emailul „Am uitat parola”: setezi parola nouă.
export default function ResetPage() {
  const [ready, setReady] = useState(false);
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!hasSupabase) return;
    const { data } = sb().auth.onAuthStateChange((_e, s) => s && setReady(true));
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-black via-brand-dark to-brand p-6">
      <form
        className="card w-full max-w-sm space-y-3 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pass.length < 6) return setMsg("Minim 6 caractere.");
          const { error } = await sb().auth.updateUser({ password: pass });
          if (error) return setMsg("Nu am putut schimba parola: " + error.message);
          setMsg("✅ Parola a fost schimbată.");
          setTimeout(() => location.replace("/"), 1200);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="De la Ferma cu Omenie" className="mx-auto h-[74px] w-auto" />
        <h1 className="text-center text-xl font-semibold text-brand-dark">Parolă nouă</h1>
        {ready ? (
          <>
            <input className="field" type="password" autoComplete="new-password" placeholder="Parola nouă" value={pass} onChange={(e) => setPass(e.target.value)} />
            <button className="btn-primary w-full">Salvează parola</button>
          </>
        ) : (
          <p className="text-center text-muted">Deschide pagina din linkul primit pe email.</p>
        )}
        <p className="min-h-5 text-center text-sm">{msg}</p>
      </form>
    </div>
  );
}
