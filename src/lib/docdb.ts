// Baza de date a aplicației peste Supabase (tabelul `docs`).
// Oferă aceeași interfață ca înainte (collection/doc/where/onSnapshot/set/update/delete),
// așa că și aplicația clasică și modulele React o folosesc fără modificări în logică.
//
// - cache local pe colecție (pornește instant, merge și fără semnal în hală)
// - timp real prin Supabase Realtime + reîmprospătare când revine rețeaua
// - scrieri „optimiste”: apar imediat pe ecran; fără rețea intră într-o coadă și se trimit automat
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { dec } from "./codec";

export type Data = Record<string, unknown>;
export type DocSnap = { id: string; exists: boolean; data: () => Data | undefined };
export type QuerySnap = { docs: DocSnap[]; empty: boolean; size: number };
type Op = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "array-contains";
type Filter = { f: string; op: Op; v: unknown };
type Order = { f: string; dir: "asc" | "desc" };
type Listener = () => void;
type Pending = { k: "set"; col: string; id: string; data: Data } | { k: "del"; col: string; id: string };

const PAGE = 1000;
const LS_CACHE = (c: string) => `fdt_cache_${c}`;
const LS_OUT = "fdt_outbox";

const strip = (v: unknown): Data => JSON.parse(JSON.stringify(v ?? {})) as Data;
const isNet = (e: unknown) => {
  const m = String((e as { message?: string })?.message ?? e).toLowerCase();
  return m.includes("fetch") || m.includes("network") || m.includes("load failed") || m.includes("timeout") || !navigator.onLine;
};
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

function cmp(a: unknown, b: unknown) {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
}
function match(d: Data, w: Filter) {
  const x = d[w.f];
  switch (w.op) {
    case "==": return x === w.v || (x != null && w.v != null && String(x) === String(w.v));
    case "!=": return x !== w.v;
    case "<": return x != null && cmp(x, w.v) < 0;
    case "<=": return x != null && cmp(x, w.v) <= 0;
    case ">": return x != null && cmp(x, w.v) > 0;
    case ">=": return x != null && cmp(x, w.v) >= 0;
    case "in": return Array.isArray(w.v) && w.v.includes(x);
    case "array-contains": return Array.isArray(x) && x.includes(w.v);
  }
}

export type DocDbStatus = "online" | "offline" | "syncing";

export function createDocDb(sb: SupabaseClient, opts: { onStatus?: (s: DocDbStatus, pending: number) => void } = {}) {
  const cache = new Map<string, Map<string, Data>>(); // col -> id -> data
  const loaded = new Map<string, Promise<void>>(); // col -> prima încărcare
  const live = new Set<string>(); // colecții urmărite în timp real
  const listeners = new Map<string, Set<Listener>>();
  // coada e comună tuturor filelor deschise (localStorage) – o recitim înainte de fiecare folosire
  const readOutbox = (): Pending[] => {
    try {
      return JSON.parse(localStorage.getItem(LS_OUT) ?? "[]") as Pending[];
    } catch {
      return [];
    }
  };
  let outbox: Pending[] = readOutbox();
  let channel: RealtimeChannel | null = null;

  const status = (s?: DocDbStatus) => opts.onStatus?.(s ?? (!navigator.onLine ? "offline" : outbox.length ? "syncing" : "online"), outbox.length);
  const emit = (col: string) => listeners.get(col)?.forEach((l) => l());
  const colMap = (col: string) => {
    let m = cache.get(col);
    if (!m) cache.set(col, (m = new Map()));
    return m;
  };
  const saveT: Record<string, ReturnType<typeof setTimeout>> = {};
  const persist = (col: string) => {
    clearTimeout(saveT[col]);
    saveT[col] = setTimeout(() => {
      try {
        localStorage.setItem(LS_CACHE(col), JSON.stringify([...colMap(col)]));
      } catch {
        /* spațiu plin: cache-ul local e doar un ajutor */
      }
    }, 400);
  };

  async function fetchAll(col: string): Promise<Map<string, Data>> {
    const m = new Map<string, Data>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from("docs").select("id,data").eq("col", col).order("id").range(from, from + PAGE - 1);
      if (error) throw error;
      for (const r of data ?? []) m.set(r.id as string, dec(r.data) as Data);
      if (!data || data.length < PAGE) break;
    }
    return m;
  }

  async function refresh(col: string) {
    const fresh = await fetchAll(col);
    // documentele încă netrimise (coadă) rămân cum le-a scris utilizatorul
    for (const p of readOutbox()) {
      if (p.col !== col) continue;
      if (p.k === "set") fresh.set(p.id, p.data);
      else fresh.delete(p.id);
    }
    cache.set(col, fresh);
    persist(col);
    emit(col);
  }

  function load(col: string): Promise<void> {
    let p = loaded.get(col);
    if (p) return p;
    // 1) instant din cache-ul local (merge offline)
    try {
      const raw = localStorage.getItem(LS_CACHE(col));
      if (raw) cache.set(col, new Map(JSON.parse(raw) as [string, Data][]));
    } catch {
      /* ignorat */
    }
    // 2) din Supabase
    const hadCache = cache.has(col);
    p = refresh(col).catch((e) => {
      // Fără drept de citire: raportăm. Fără rețea: lucrăm cu ce avem (gol la prima pornire)
      // și reîmprospătăm automat când revine semnalul.
      if (!isNet(e)) {
        loaded.delete(col);
        throw e;
      }
      colMap(col);
      status("offline");
    });
    loaded.set(col, p);
    live.add(col);
    ensureChannel();
    return hadCache ? Promise.resolve() : p;
  }

  function ensureChannel() {
    if (channel) return;
    let wasDown = false;
    channel = sb
      .channel("docs-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, (pl) => {
        const n = pl.new as { col?: string; id?: string; data?: Data } | null;
        const o = pl.old as { col?: string; id?: string } | null;
        if (pl.eventType === "DELETE") {
          if (o?.col && o.id && cache.has(o.col)) {
            colMap(o.col).delete(o.id);
            persist(o.col);
            emit(o.col);
          }
        } else if (n?.col && n.id && cache.has(n.col)) {
          colMap(n.col).set(n.id, dec(n.data) as Data);
          persist(n.col);
          emit(n.col);
        }
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          if (wasDown) resyncAll();
          wasDown = false;
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") wasDown = true;
      });
  }

  let resyncing = false;
  async function resyncAll() {
    if (resyncing) return;
    resyncing = true;
    try {
      await flush();
      await Promise.all([...live].map((c) => refresh(c).catch(() => {})));
    } finally {
      resyncing = false;
      status();
    }
  }
  if (typeof window !== "undefined") {
    window.addEventListener("online", resyncAll);
    window.addEventListener("offline", () => status("offline"));
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && resyncAll());
    setInterval(() => (readOutbox().length ? flush() : undefined), 20000);
    // ce a rămas netrimis data trecută pleacă imediat după pornire
    if (outbox.length) setTimeout(() => void flush().then(() => status()), 1500);
  }

  // ---------- scrieri ----------
  const saveOutbox = () => {
    try {
      localStorage.setItem(LS_OUT, JSON.stringify(outbox));
    } catch {
      /* ignorat */
    }
    status();
  };
  async function send(p: Pending) {
    const q =
      p.k === "set"
        ? sb.from("docs").upsert({ col: p.col, id: p.id, data: p.data }, { onConflict: "col,id" })
        : sb.from("docs").delete().eq("col", p.col).eq("id", p.id);
    const { error } = await q;
    if (error) throw error;
  }
  let flushing: Promise<void> | null = null;
  function flush(): Promise<void> {
    if (flushing) return flushing;
    flushing = (async () => {
      outbox = readOutbox();
      while (outbox.length) {
        const item = outbox[0];
        try {
          await send(item);
        } catch (e) {
          if (isNet(e)) break; // tot fără rețea – încercăm mai târziu
          console.warn("Scriere respinsă, scoasă din coadă:", e);
        }
        const key = JSON.stringify(item);
        outbox = readOutbox();
        const i = outbox.findIndex((x) => JSON.stringify(x) === key);
        if (i >= 0) outbox.splice(i, 1);
        saveOutbox();
      }
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  async function write(p: Pending) {
    const m = colMap(p.col);
    const prev = m.get(p.id);
    if (p.k === "set") m.set(p.id, p.data);
    else m.delete(p.id);
    persist(p.col);
    emit(p.col);
    outbox = readOutbox();
    if (outbox.length) {
      // păstrăm ordinea: dacă sunt deja scrieri în coadă, intră la rând
      outbox.push(p);
      saveOutbox();
      void flush();
      return;
    }
    try {
      await send(p);
    } catch (e) {
      if (isNet(e)) {
        outbox = readOutbox();
        outbox.push(p);
        saveOutbox();
        return; // rămâne salvat local, se trimite când revine semnalul
      }
      // fără drept / eroare reală: anulăm pe ecran și raportăm
      if (prev === undefined) m.delete(p.id);
      else m.set(p.id, prev);
      persist(p.col);
      emit(p.col);
      throw e;
    }
  }

  // ---------- interogări ----------
  function snapshot(col: string, ws: Filter[], ord: Order[], lim: number | null): QuerySnap {
    let rows = [...colMap(col)].filter(([, d]) => ws.every((w) => match(d, w)));
    for (const o of [...ord].reverse()) rows.sort((a, b) => cmp(a[1][o.f], b[1][o.f]) * (o.dir === "desc" ? -1 : 1));
    if (lim != null) rows = rows.slice(0, lim);
    const docs = rows.map(([id, d]) => ({ id, exists: true, data: () => structuredClone(d) }));
    return { docs, empty: !docs.length, size: docs.length };
  }

  function listen(col: string, fn: Listener, onErr?: (e: unknown) => void) {
    let set = listeners.get(col);
    if (!set) listeners.set(col, (set = new Set()));
    set.add(fn);
    load(col).then(fn, (e) => onErr?.(e));
    if (cache.has(col)) queueMicrotask(fn);
    return () => set!.delete(fn);
  }

  function query(col: string, ws: Filter[] = [], ord: Order[] = [], lim: number | null = null) {
    return {
      where: (f: string, op: Op, v: unknown) => query(col, [...ws, { f, op, v }], ord, lim),
      orderBy: (f: string, dir: "asc" | "desc" = "asc") => query(col, ws, [...ord, { f, dir }], lim),
      limit: (n: number) => query(col, ws, ord, n),
      get: async () => {
        await load(col);
        return snapshot(col, ws, ord, lim);
      },
      onSnapshot: (cb: (s: QuerySnap) => void, err?: (e: unknown) => void) =>
        listen(col, () => cb(snapshot(col, ws, ord, lim)), err),
    };
  }

  function docRef(col: string, id: string) {
    const current = async () => {
      await load(col).catch(() => {});
      return colMap(col).get(id);
    };
    const snap = (): DocSnap => {
      const d = colMap(col).get(id);
      return { id, exists: d !== undefined, data: () => (d === undefined ? undefined : structuredClone(d)) };
    };
    return {
      id,
      set: async (v: Data, o?: { merge?: boolean }) =>
        write({ k: "set", col, id, data: o?.merge ? { ...((await current()) ?? {}), ...strip(v) } : strip(v) }),
      update: async (v: Data) => {
        const cur = await current();
        if (cur === undefined) throw new Error(`Documentul ${col}/${id} nu există`);
        return write({ k: "set", col, id, data: { ...cur, ...strip(v) } });
      },
      delete: () => write({ k: "del", col, id }),
      get: async () => {
        await load(col);
        return snap();
      },
      onSnapshot: (cb: (s: DocSnap) => void, err?: (e: unknown) => void) => listen(col, () => cb(snap()), err),
    };
  }

  const db = Object.freeze({
    collection: (col: string) => Object.assign(query(col), { doc: (id?: string) => docRef(col, id || newId()) }),
    doc: (path: string) => {
      const [col, ...rest] = path.split("/");
      return docRef(col, rest.join("/"));
    },
    /** documente netrimise încă (fără semnal) */
    pending: () => outbox.length,
    flush,
    /** golește cache-ul local (la ieșirea din cont) */
    clearLocal: () => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("fdt_cache_"))
        .forEach((k) => localStorage.removeItem(k));
    },
  });
  status();
  return db;
}

export type DocDb = ReturnType<typeof createDocDb>;
