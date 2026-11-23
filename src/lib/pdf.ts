"use client";
// PDF cu diacritice românești (fontul DejaVu, același ca în aplicația clasică) și logo.
import type { jsPDF } from "jspdf";

const b64 = async (url: string) => {
  const buf = await (await fetch(url)).arrayBuffer();
  let s = "";
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

let cache: { r: string; b: string; logo: string } | null = null;

export async function newPdf(title: string, sub?: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  cache ??= {
    r: await b64("/fonts/DejaVuSans.ttf"),
    b: await b64("/fonts/DejaVuSans-Bold.ttf"),
    logo: "data:image/png;base64," + (await b64("/logo.png")),
  };
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS("DejaVu.ttf", cache.r);
  doc.addFont("DejaVu.ttf", "DejaVu", "normal");
  doc.addFileToVFS("DejaVuB.ttf", cache.b);
  doc.addFont("DejaVuB.ttf", "DejaVu", "bold");
  doc.setFont("DejaVu", "normal");

  doc.addImage(cache.logo, "PNG", 14, 10, 22, 22 * 0.62);
  doc.setFont("DejaVu", "bold").setFontSize(16).setTextColor(29, 29, 31).text(title, 40, 17);
  if (sub) doc.setFont("DejaVu", "normal").setFontSize(10).setTextColor(110, 98, 102).text(sub, 40, 23);
  doc.setDrawColor(112, 12, 48).setLineWidth(0.6).line(14, 30, 196, 30);
  doc.setTextColor(29, 29, 31);

  const table = (opts: Parameters<typeof autoTable>[1]) =>
    autoTable(doc, {
      styles: { font: "DejaVu", fontSize: 9.5, cellPadding: 1.8 },
      headStyles: { fillColor: [112, 12, 48], textColor: 255, fontStyle: "bold" },
      ...opts,
    });
  const y = () => (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 34;
  return { doc, table, y };
}

export function footer(doc: jsPDF) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("DejaVu", "normal").setFontSize(8).setTextColor(110, 98, 102);
    doc.text(`De la Ferma cu Omenie · generat ${new Date().toLocaleString("ro-RO")}`, 14, 290);
    doc.text(`pagina ${i}/${n}`, 196, 290, { align: "right" });
  }
}
