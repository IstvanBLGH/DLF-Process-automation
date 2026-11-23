"use client";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { can, type ModKey } from "@/lib/roles";

// Hub-ul „Fabrică”: modulele mutate în React se deschid aici,
// restul se deschid încă din aplicația clasică (/legacy).
const MODS: { k: ModKey; t: string; d: string; e: string; href: string; ready?: boolean }[] = [
  { k: "ts", t: "Teste – burduf", d: "Cântărire pe clase, tară, media țintă", e: "🧀", href: "/teste/burduf", ready: true },
  { k: "lapte", t: "Gestiune lapte", d: "Rezervoare, registru, standardizare", e: "🥛", href: "/legacy/index.html#m=lapte" },
  { k: "tr", t: "Trasabilitate", d: "QR, locații, statistici", e: "🏷️", href: "/legacy/index.html#m=tr" },
  { k: "protel", t: "Proces telemea", d: "Parametri de producție", e: "🧾", href: "/legacy/index.html#m=protel" },
  { k: "temp", t: "Temperaturi", d: "Camere frig, verificări", e: "🌡️", href: "/legacy/index.html#m=temp" },
  { k: "doc", t: "Documentație", d: "Echipamente, fișe, poze", e: "📚", href: "/legacy/index.html#m=doc" },
];

export default function Home() {
  const { profile } = useAuth();
  const mods = MODS.filter((m) => can(profile, m.k));
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Fabrică</h1>
        <p className="text-muted">Alege modulul. Cele marcate „Nou” sunt deja pe noua versiune.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mods.map((m) => {
          const body = (
            <>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-2xl">{m.e}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold">
                  {m.t}
                  {m.ready && <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-semibold text-good">Nou</span>}
                </span>
                <span className="block text-[15px] text-muted">{m.d}</span>
              </span>
              <span className="text-muted">›</span>
            </>
          );
          const cls = "card flex items-center gap-3 p-4 transition active:scale-[.99]";
          return m.ready ? (
            <Link key={m.k} href={m.href} className={cls}>
              {body}
            </Link>
          ) : (
            <a key={m.k} href={m.href} className={cls}>
              {body}
            </a>
          );
        })}
      </div>
    </div>
  );
}
