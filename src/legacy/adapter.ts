// Adaptorul aplicației clasice (public/legacy/index.html) pentru Supabase.
// Se compilează cu `npm run build:legacy` în public/legacy/adapter.js.
// Înlocuiește platforma Claude (window.claude.use) cu: baza Supabase, login, roluri, PIN stație, /api/ask.
import { createClient } from "@supabase/supabase-js";
import { createDocDb } from "../lib/docdb";

type Prof = { name?: string; email?: string; role?: string; active?: boolean };
type Role = { uid: string; role: string; name: string; email?: string; station?: boolean; stationName?: string };
declare global {
  interface Window {
    SB?: { url: string; key: string };
    API_BASE?: string;
    claude?: { use: (n: string) => Promise<unknown> };
    __ROLE?: Role;
    __VERCEL?: boolean;
    __authed?: boolean;
    __startApp?: () => void;
    __fbAdmin?: { createUser: (e: string, p: string) => Promise<string>; resetPass: (e: string) => Promise<unknown> };
    __nativeScan?: () => Promise<string | null>;
    __NATIVE?: boolean;
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform: () => string;
      Plugins?: Record<string, Record<string, (...a: unknown[]) => unknown>>;
    };
  }
}

const cfg = window.SB ?? { url: "", key: "" };
const $ = (id: string) => document.getElementById(id) as HTMLInputElement | null;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

if (!cfg.url || !cfg.key) {
  document.addEventListener("DOMContentLoaded", () =>
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<div style="background:#c2361f;color:#fff;padding:14px;font:16px system-ui">Lipsește configurarea Supabase (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) – vezi README.</div>',
    ),
  );
}

const sb = createClient(cfg.url || "http://localhost", cfg.key || "x", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// indicator mic de sincronizare (colț dreapta-jos) – arată când sunt date netrimise
let syncEl: HTMLDivElement | null = null;
const db = createDocDb(sb, {
  onStatus: (s, n) => {
    if (!document.body) return;
    syncEl ??= Object.assign(document.createElement("div"), { id: "fdtSync" });
    if (!syncEl.isConnected) document.body.appendChild(syncEl);
    syncEl.style.cssText =
      "position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:9000;padding:6px 10px;border-radius:999px;font:600 13px system-ui;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.2);" +
      (s === "online" && !n ? "display:none" : s === "offline" ? "background:#a15c00" : "background:#700c30");
    syncEl.textContent = s === "offline" ? `Fără semnal${n ? ` · ${n} de trimis` : " · lucrez local"}` : n ? `Se trimit ${n}…` : "";
  },
});

// ---------- Întreabă Claude ----------
const b64 = (b: Blob) =>
  new Promise<string>((r) => {
    const f = new FileReader();
    f.onload = () => r(String(f.result).split(",")[1]);
    f.readAsDataURL(b);
  });
type SampleOpt = { images?: Blob[]; signal?: AbortSignal; onText?: (x: { text: string }) => void };
async function sample(input: unknown, opt: SampleOpt = {}) {
  if (typeof input === "string") input = [{ role: "user", content: input }];
  const images = opt.images ? await Promise.all(opt.images.map(async (b) => ({ media_type: b.type || "image/jpeg", data: await b64(b) }))) : [];
  const tok = (await sb.auth.getSession()).data.session?.access_token ?? "";
  let r: Response;
  try {
    r = await fetch((window.API_BASE || "") + "/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
      body: JSON.stringify({ messages: input, images }),
      signal: opt.signal,
    });
  } catch (e) {
    throw Object.assign(new Error("cancelled"), { code: (e as Error).name === "AbortError" ? "cancelled" : "network" });
  }
  if (!r.ok || !r.body)
    throw Object.assign(new Error("ask"), {
      code: r.status === 401 ? "not_granted" : r.status === 429 ? "rate_limited" : r.status === 501 ? "sampling_disabled" : "server",
    });
  const rd = r.body.getReader();
  const td = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      text += td.decode(value, { stream: true });
      opt.onText?.({ text });
    }
  } catch {
    throw Object.assign(new Error("cancelled"), { code: "cancelled", text });
  }
  const truncated = text.endsWith("[[TRUNCHIAT]]");
  if (truncated) text = text.replace("[[TRUNCHIAT]]", "");
  return { text, truncated };
}
sample.limits = async () => ({ images: true });

window.claude = { use: async (n: string) => (n === "db" ? db : n === "sample" ? sample : null) };

// ---------- Aplicația nativă (Capacitor) ----------
const CAP = window.Capacitor;
const NATIVE = !!CAP?.isNativePlatform?.();
window.__NATIVE = NATIVE;
if (NATIVE && CAP) {
  const P = CAP.Plugins ?? {};
  if (P.BarcodeScanner)
    window.__nativeScan = async () => {
      try {
        if (CAP.getPlatform() === "ios") {
          const pr = (await P.BarcodeScanner.requestPermissions()) as { camera: string };
          if (pr.camera !== "granted" && pr.camera !== "limited") throw new Error("perm");
        }
        const r = (await P.BarcodeScanner.scan()) as { barcodes?: { rawValue?: string; displayValue?: string }[] };
        const b = r?.barcodes?.[0];
        return b ? b.rawValue || b.displayValue || null : null;
      } catch (e) {
        if (String((e as Error)?.message).includes("canceled")) return null;
        throw e;
      }
    };
  try {
    P.StatusBar?.setBackgroundColor?.({ color: "#0d0b0c" });
    P.StatusBar?.setStyle?.({ style: "DARK" });
  } catch {
    /* ignorat */
  }
  document.documentElement.classList.add("native");
}

// ---------- Login, roluri, PIN stație ----------
const CSS = `#lg{position:fixed;inset:0;z-index:9999;background:linear-gradient(120deg,#0d0b0c,#4a0820 60%,#700c30);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}
#lg form{background:#fff;border-radius:22px;padding:28px;width:min(92vw,380px);box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:12px}
#lg img{height:74px;align-self:center}#lg h1{margin:0;text-align:center;font-size:20px;color:#4a0820}
#lg input{min-height:52px;font-size:17px;border:2px solid #e8dfe0;border-radius:12px;padding:0 14px}
#lg button{min-height:54px;font-size:17px;font-weight:700;border:0;border-radius:12px;background:#700c30;color:#fff;cursor:pointer}
#lg .e{color:#c2361f;font-size:14px;min-height:18px;text-align:center}#lg .l{text-align:center;color:#6e6266;font-size:14px}
#lg .ops{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:46vh;overflow:auto}#lg .ops button{background:#f6e6ec;color:#4a0820;min-height:56px}#lg .ops button.on{background:#700c30;color:#fff}`;

function screen(html: string) {
  if (!document.getElementById("lgCss")) document.head.insertAdjacentHTML("beforeend", `<style id="lgCss">${CSS}</style>`);
  document.getElementById("lg")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div id="lg"><form onsubmit="return false"><img src="img/logo.png" alt="">${html}</form></div>`);
}

const logout = async () => {
  await sb.auth.signOut();
  db.clearLocal();
  location.reload();
};

function showLogin() {
  screen(`<h1>Autentificare</h1><input type="email" id="lgE" placeholder="Email" autocomplete="username" required>
    <input type="password" id="lgP" placeholder="Parolă" autocomplete="current-password" required>
    <button id="lgGo">Intră</button><div class="e" id="lgX"></div><a href="#" class="l" id="lgF">Am uitat parola</a>`);
  const go = async () => {
    $("lgX")!.textContent = "";
    const { error } = await sb.auth.signInWithPassword({ email: $("lgE")!.value.trim(), password: $("lgP")!.value });
    if (error) $("lgX")!.textContent = "Email sau parolă greșite.";
  };
  $("lgGo")!.onclick = go;
  $("lgP")!.onkeydown = (e) => e.key === "Enter" && go();
  $("lgF")!.onclick = async (e) => {
    e.preventDefault();
    const em = $("lgE")!.value.trim();
    if (!em) return void ($("lgX")!.textContent = "Scrie întâi emailul.");
    await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + "/reset" });
    $("lgX")!.textContent = "Ți-am trimis un email pentru parolă nouă.";
  };
}

async function sha(id: string, pin: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id + ":" + pin));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function pinScreen(uid: string, prof: Prof) {
  type Op = { id: string; name?: string; role?: string; pin?: string; active?: boolean };
  let ops: Op[];
  try {
    ops = (await db.collection("operators").get()).docs
      .map((d): Op => ({ id: d.id, ...(d.data() as Omit<Op, "id">) }))
      .filter((o) => o.active !== false)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } catch {
    return screen(`<h1>Eroare</h1><div class="e">Nu pot citi lista de operatori.</div>`);
  }
  screen(`<h1>${esc(prof.name || "Tabletă stație")}</h1><div class="l">Cine lucrează acum?</div>
    <div class="ops">${ops.map((o) => `<button type="button" data-o="${esc(o.id)}">${esc(o.name)}</button>`).join("") || "<div class='e'>Niciun operator definit – cere administratorului.</div>"}</div>
    <input id="lgPin" type="password" inputmode="numeric" maxlength="6" placeholder="PIN" hidden><button id="lgGo" hidden>Intră</button><div class="e" id="lgX"></div>
    <a href="#" class="l" id="lgOut">Deconectează tableta</a>`);
  let sel: (typeof ops)[number] | null = null;
  document.querySelectorAll<HTMLButtonElement>("#lg [data-o]").forEach(
    (b) =>
      (b.onclick = () => {
        sel = ops.find((o) => o.id === b.dataset.o) ?? null;
        document.querySelectorAll("#lg [data-o]").forEach((x) => x.classList.toggle("on", x === b));
        $("lgPin")!.hidden = false;
        $("lgGo")!.hidden = false;
        $("lgPin")!.value = "";
        $("lgPin")!.focus();
      }),
  );
  const go = async () => {
    if (!sel) return;
    if ((await sha(sel.id, $("lgPin")!.value)) !== sel.pin) return void ($("lgX")!.textContent = "PIN greșit.");
    document.getElementById("lg")?.remove();
    launch({ uid, role: sel.role || "op", name: sel.name || "", station: true, stationName: prof.name });
  };
  $("lgGo")!.onclick = go;
  $("lgPin")!.onkeydown = (e) => e.key === "Enter" && go();
  $("lgOut")!.onclick = (e) => {
    e.preventDefault();
    void logout();
  };
}

window.__VERCEL = true;
window.__fbAdmin = {
  createUser: async (email, password) => {
    const tok = (await sb.auth.getSession()).data.session?.access_token ?? "";
    const r = await fetch((window.API_BASE || "") + "/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
      body: JSON.stringify({ email, password }),
    });
    const j = (await r.json().catch(() => ({}))) as { uid?: string; error?: string };
    if (!r.ok || !j.uid) throw new Error(j.error || "Nu am putut crea contul");
    return j.uid;
  },
  resetPass: (email) => sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/reset" }),
};

let started = false;
function launch(role: Role) {
  if (started) return;
  started = true;
  window.__ROLE = role;
  window.__authed = true;
  const go = () => (window.__startApp ? window.__startApp() : setTimeout(go, 50));
  go();
  const im = document.getElementById("imBtn");
  if (im) im.hidden = role.role !== "admin";
  const bk = document.getElementById("bkBtn");
  if (bk) bk.hidden = !["admin", "mgmt"].includes(role.role);
  const out = document.getElementById("outBtn");
  if (out) {
    out.hidden = false;
    out.textContent = role.station ? "Schimbă operatorul" : "Ieșire";
    out.onclick = () => (role.station ? location.reload() : void logout());
  }
  if (role.station) {
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => location.reload(), 15 * 60 * 1000);
    };
    ["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, reset, true));
    reset();
  }
}

async function onUser(uid: string, email: string) {
  let prof: Prof | null = null;
  try {
    const { data, error } = await sb.rpc("ensure_profile");
    if (error) throw error;
    prof = data as Prof | null;
  } catch {
    // fără rețea: folosim profilul memorat la ultima logare
    try {
      prof = JSON.parse(localStorage.getItem("fdt_prof_" + uid) ?? "null") as Prof | null;
    } catch {
      prof = null;
    }
  }
  if (prof) localStorage.setItem("fdt_prof_" + uid, JSON.stringify(prof));
  if (!prof || prof.active === false) {
    screen(`<h1>Cont fără acces</h1><div class="l">Contul <b>${esc(email)}</b> nu are un rol activ. Cere administratorului să îți dea acces.</div><button id="lgO">Ieșire</button>`);
    $("lgO")!.onclick = () => void logout();
    return;
  }
  if (prof.role === "statie") return void pinScreen(uid, prof);
  launch({ uid, role: prof.role || "op", name: prof.name || email, email });
}

let handled = "";
sb.auth.onAuthStateChange((ev, session) => {
  const ready = () => {
    if (ev === "PASSWORD_RECOVERY") return void (location.replace("/reset"));
    const u = session?.user;
    if (u) {
      if (handled === u.id) return;
      handled = u.id;
      document.getElementById("lg")?.remove();
      void onUser(u.id, u.email ?? "");
    } else if (!started) showLogin();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
});
