import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ferma DT", template: "%s · Ferma DT" },
  description: "De la Ferma cu Omenie – aplicația fabricii",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-180.png", apple: "/icon-180.png" },
  appleWebApp: { capable: true, title: "Ferma DT", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
