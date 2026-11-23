// Aplicația clasică (/legacy) citește configurarea din aceleași variabile de mediu
// ca partea Next.js — un singur loc de configurat (.env.local / Vercel → Environment Variables).
export async function GET() {
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
  const body =
    `window.FIREBASE_CONFIG=${JSON.stringify(cfg)};\n` +
    `window.ADMIN_EMAIL=${JSON.stringify(process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "")};\n` +
    `window.API_BASE="";\n`;
  return new Response(body, {
    headers: { "Content-Type": "application/javascript; charset=utf-8" },
  });
}
