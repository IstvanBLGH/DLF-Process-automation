// Configurarea pentru aplicația clasică (/legacy), din aceleași variabile de mediu ca restul.
export async function GET() {
  const body =
    `window.SB=${JSON.stringify({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    })};\nwindow.API_BASE="";\n`;
  return new Response(body, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
}
