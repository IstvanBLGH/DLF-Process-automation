// „Întreabă Claude” + citire din poze (etichete, coduri, numărare cutii).
// Folosit atât de aplicația clasică (/legacy) cât și de modulele React.
// Variabile: ANTHROPIC_API_KEY (obligatoriu), ANTHROPIC_MODEL (opțional). Acces doar cu cont logat (token Supabase).
import { caller } from "@/lib/server";

export const maxDuration = 60;

const ORIGINS = ["https://localhost", "capacitor://localhost", "http://localhost"];

type Msg = { role: string; content: unknown };
type Img = { data: string; media_type?: string };
type Part =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function cors(origin: string | null): Record<string, string> {
  if (!origin || !ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

async function userOk(req: Request): Promise<boolean> {
  return !!(await caller(req));
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const h = cors(req.headers.get("origin"));
  const text = (s: string, status: number) =>
    new Response(s, { status, headers: { ...h, "Content-Type": "text/plain; charset=utf-8" } });

  if (!process.env.ANTHROPIC_API_KEY) return text("Întreabă Claude nu e configurat (lipsește ANTHROPIC_API_KEY).", 501);
  if (!(await userOk(req))) return text("Neautorizat", 401);

  const body = (await req.json().catch(() => ({}))) as { messages?: Msg[]; images?: Img[] };
  let msgs = body.messages ?? [];
  // primul mesaj conține regulile/contextul -> devine system
  let system = "";
  if (msgs.length > 1 && msgs[0].role === "user") {
    system = String(msgs[0].content ?? "");
    msgs = msgs.slice(1);
  }
  // mesaje consecutive cu același rol se unesc
  const clean: { role: "user" | "assistant"; content: string | Part[] }[] = [];
  for (const m of msgs) {
    const role = m.role === "assistant" ? "assistant" : "user";
    const content = String(m.content ?? "");
    const last = clean[clean.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${content}`;
    else clean.push({ role, content });
  }
  if (!clean.length || clean[0].role !== "user") clean.unshift({ role: "user", content: "(context)" });

  const imgs = (body.images ?? []).slice(0, 4);
  if (imgs.length) {
    const last = clean[clean.length - 1];
    last.content = [
      ...imgs.map((i): Part => ({
        type: "image",
        source: { type: "base64", media_type: i.media_type || "image/jpeg", data: i.data },
      })),
      { type: "text", text: String(last.content) },
    ];
  }

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 2000,
      stream: true,
      system: system || undefined,
      messages: clean,
    }),
  });
  if (!r.ok || !r.body) return text(await r.text(), r.status === 429 ? 429 : 502);

  // Transformăm SSE-ul Anthropic în text simplu, ca în varianta clasică.
  const upstream = r.body;
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const rd = upstream.getReader();
      const td = new TextDecoder();
      const te = new TextEncoder();
      let buf = "";
      let stop = "";
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        buf += td.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(line.slice(5));
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") ctrl.enqueue(te.encode(ev.delta.text));
            if (ev.type === "message_delta" && ev.delta?.stop_reason) stop = ev.delta.stop_reason;
          } catch {
            /* linie incompletă */
          }
        }
      }
      if (stop === "max_tokens") ctrl.enqueue(te.encode("[[TRUNCHIAT]]"));
      ctrl.close();
    },
  });
  return new Response(stream, {
    headers: { ...h, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
