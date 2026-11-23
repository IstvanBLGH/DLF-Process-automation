"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { readOnly } from "@/lib/roles";
import { put, remove, uid, useCollection } from "@/lib/store";
import { calc, cfgOf, fTs, n2, nowTs, type Cfg, type Mode, type Test } from "@/lib/burduf";
import { Editor } from "./Editor";
import { Trend } from "./Trend";

const DRAFT = "dt_teste_draft"; // aceeași cheie ca în aplicația clasică

function readDraft(): Test | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) ?? "null") as Test | null;
    if (!d) return null;
    return calc(d).n || d.box?.length || d.pcs?.length ? d : null;
  } catch {
    return null;
  }
}

export default function BurdufPage() {
  const { profile } = useAuth();
  const ro = readOnly(profile);
  const { rows, error } = useCollection<Test>("teste");
  const { rows: cfgRows } = useCollection<{ id: string } & Partial<Cfg>>("testeCfg");
  const cfg = cfgOf(cfgRows?.find((c) => c.id === "burduf"));
  const [ed, setEd] = useState<Test | null>(null);
  const [draft, setDraft] = useState<Test | null>(null);
  const [showCfg, setShowCfg] = useState(false);

  useEffect(() => {
    // localStorage există doar în browser: citim ciorna după montare
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(readDraft());
  }, [ed]);

  const list = useMemo(
    () => (rows ?? []).filter((r) => r.tip === "burduf").sort((a, b) => String(b.ts).localeCompare(String(a.ts))),
    [rows],
  );

  const blank = (mode: Mode): Test => ({
    id: uid(),
    tip: "burduf",
    ts: nowTs(),
    lot: "",
    op: profile?.name ?? "",
    linie: "",
    tara: cfg.tara || "",
    mode,
    cls: [{}, {}, {}, {}],
    pcs: [],
    box: [],
    mp: "",
    des: "",
    desU: "g",
    note: "",
    cfg,
  });

  if (ed)
    return (
      <Editor
        key={ed.id}
        initial={ed}
        ro={ro}
        isNew={!list.some((r) => r.id === ed.id)}
        onClose={() => setEd(null)}
        onSave={async (t) => {
          await put("teste", t);
          if (Number(cfg.tara) !== Number(t.tara) && t.tara !== "" && !ro) await put("testeCfg", { id: "burduf", ...cfg, tara: t.tara });
        }}
        onDelete={async (id) => remove("teste", id)}
      />
    );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[15px] font-medium text-brand">Teste</p>
        <h1 className="text-[28px] font-bold tracking-tight">Burduf – cântărire</h1>
      </div>

      {draft && (
        <div className="card flex flex-wrap items-center gap-3 border-warn/40 bg-warn-soft p-4">
          <span className="text-2xl">📝</span>
          <div className="min-w-0 flex-1">
            <b>Ai un test început și NESALVAT</b>
            <div className="text-[15px] text-muted">
              {fTs(draft.ts)}
              {draft.lot && ` · lot ${draft.lot}`} · {calc(draft).n} bucăți
            </div>
          </div>
          <button className="btn-primary" onClick={() => setEd(draft)}>
            Continuă
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              localStorage.removeItem(DRAFT);
              setDraft(null);
            }}
          >
            Renunță
          </button>
        </div>
      )}

      {!ro && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button className="card flex items-start gap-3 p-4 text-left transition active:scale-[.99]" onClick={() => setEd(blank("box"))}>
            <span className="text-3xl">📦</span>
            <span>
              <b className="block">Test nou – cântăresc cutie cu cutie</b>
              <span className="text-[15px] text-muted">scade tara, împarte la nr. bucăți</span>
            </span>
          </button>
          <button className="card flex items-start gap-3 p-4 text-left transition active:scale-[.99]" onClick={() => setEd(blank("cls"))}>
            <span className="text-3xl">📝</span>
            <span>
              <b className="block">Test nou – scriu totalurile pe clase</b>
              <span className="text-[15px] text-muted">kg și nr. bucăți, ca pe foaie</span>
            </span>
          </button>
        </div>
      )}

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Limite folosite</h2>
          <span className="text-[15px] text-muted">
            tara cutie <b className={cfg.tara ? "text-ink" : "text-bad"}>{cfg.tara ? `${cfg.tara} g` : "NESETATĂ"}</b> · clase &lt; {cfg.lim[0]} ·{" "}
            {cfg.lim[0]}–{cfg.lim[1]} · {cfg.lim[1]}–{cfg.lim[2]} · &gt; {cfg.lim[2]} g · media țintă ≥ {cfg.tinta} g
          </span>
          {!ro && (
            <button className="btn-ghost ml-auto" onClick={() => setShowCfg((v) => !v)}>
              {showCfg ? "Închide" : "Modifică"}
            </button>
          )}
        </div>
        {showCfg && <CfgForm cfg={cfg} onSave={async (c) => (await put("testeCfg", { id: "burduf", ...c }), setShowCfg(false))} />}
      </section>

      {list.length > 1 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Media pe bucată – ultimele teste</h2>
          <Trend tests={list.slice(0, 20).reverse()} target={cfg.tinta} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-medium uppercase tracking-wide text-muted">Istoric ({list.length})</h2>
        {error && <p className="text-bad">Eroare la citire: {error}</p>}
        {rows === null && <p className="text-muted">Se încarcă…</p>}
        {rows && !list.length && <p className="card p-6 text-center text-muted">Niciun test salvat încă.</p>}
        <div className="card divide-y divide-line overflow-hidden">
          {list.map((t) => {
            const c = calc(t);
            return (
              <button key={t.id} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-black/5" onClick={() => setEd(t)}>
                <span
                  className={`grid h-11 w-16 shrink-0 place-items-center rounded-xl text-[15px] font-bold ${
                    c.avg == null ? "bg-black/5 text-muted" : c.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"
                  }`}
                >
                  {c.avg == null ? "—" : n2(c.avg, 0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {fTs(t.ts)}
                    {t.lot && <span className="text-muted"> · lot {t.lot}</span>}
                  </span>
                  <span className="block truncate text-[14px] text-muted">
                    {c.n} buc · {n2(c.kg, 2)} kg net · sub limită {n2(c.underPc, 1)}% · {t.mode === "box" ? `${t.box.length} cutii` : "pe clase"}
                    {t.op && ` · ${t.op}`}
                  </span>
                </span>
                <span className="text-muted">›</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function CfgForm({ cfg, onSave }: { cfg: Cfg; onSave: (c: Cfg) => void }) {
  const [c, setC] = useState(cfg);
  const f = (v: string) => Number(v.replace(",", ".")) || 0;
  return (
    <form
      className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(c);
      }}
    >
      {[0, 1, 2].map((i) => (
        <label key={i}>
          <span className="label">Limită {i + 1} (g)</span>
          <input
            className="field"
            inputMode="decimal"
            value={c.lim[i]}
            onChange={(e) => {
              const lim = [...c.lim] as Cfg["lim"];
              lim[i] = f(e.target.value);
              setC({ ...c, lim });
            }}
          />
        </label>
      ))}
      <label>
        <span className="label">Media țintă (g)</span>
        <input className="field" inputMode="decimal" value={c.tinta} onChange={(e) => setC({ ...c, tinta: f(e.target.value) })} />
      </label>
      <label>
        <span className="label">Gramaj nominal (g)</span>
        <input className="field" inputMode="decimal" value={c.nominal} onChange={(e) => setC({ ...c, nominal: f(e.target.value) })} />
      </label>
      <label>
        <span className="label">Tara cutie (g)</span>
        <input className="field" inputMode="decimal" value={c.tara} onChange={(e) => setC({ ...c, tara: e.target.value })} />
      </label>
      <button className="btn-primary col-span-2 sm:col-span-3">Salvează limitele</button>
    </form>
  );
}
