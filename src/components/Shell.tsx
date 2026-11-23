"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { ROLES } from "@/lib/roles";

const NAV = [
  { href: "/", label: "Fabrică", icon: <path d="M3 21V10l6 3.5V10l6 3.5V5h6v16H3Z" /> },
  { href: "/teste/burduf", label: "Teste", icon: <path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10" /> },
  { href: "/clasic", label: "Completă", icon: <path d="M4 5h16v14H4zM4 9h16M8 5v4" />, external: true },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { profile, logout } = useAuth();
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h.split("/").slice(0, 2).join("/")));

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-black pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="De la Ferma cu Omenie" className="h-9 w-auto rounded bg-white p-0.5" />
          </Link>
          <nav className="ml-4 hidden gap-1 md:flex">
            {NAV.map((n) =>
              n.external ? (
                <a key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-[15px] text-white/70 hover:text-white">
                  {n.label}
                </a>
              ) : (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-lg px-3 py-2 text-[15px] ${active(n.href) ? "bg-white/15 text-white" : "text-white/70 hover:text-white"}`}
                >
                  {n.label}
                </Link>
              ),
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-right">
            <div className="leading-tight">
              <div className="text-[14px] font-medium">{profile?.name}</div>
              <div className="text-[12px] text-white/60">{profile ? ROLES[profile.role]?.n : ""}</div>
            </div>
            {profile?.role === "admin" && (
              <Link href="/admin/import" className="rounded-lg px-2 py-1 text-[13px] text-white/70 hover:text-white">
                Date
              </Link>
            )}
            {!profile?.demo && (
              <button onClick={logout} className="rounded-lg px-2 py-1 text-[13px] text-white/70 hover:text-white">
                {profile?.station ? "Schimbă operatorul" : "Ieșire"}
              </button>
            )}
          </div>
        </div>
        {profile?.demo && (
          <div className="bg-warn px-4 py-1 text-center text-[13px] text-white">
            Mod demo – Supabase nu e configurat, datele rămân doar în acest browser
          </div>
        )}
      </header>

      <main className="pb-safe mx-auto max-w-5xl px-4 pt-6">{children}</main>

      {/* Bara de jos, stil iOS (doar pe telefon) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3">
          {NAV.map((n) => {
            const on = !n.external && active(n.href);
            const cls = `flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium ${on ? "text-brand" : "text-muted"}`;
            const inner = (
              <>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  {n.icon}
                </svg>
                {n.label}
              </>
            );
            return n.external ? (
              <a key={n.href} href={n.href} className={cls}>
                {inner}
              </a>
            ) : (
              <Link key={n.href} href={n.href} className={cls} aria-current={on ? "page" : undefined}>
                {inner}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
