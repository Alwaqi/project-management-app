import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { formatDate } from "@/lib/domain";
import { ReportData, workloadLabel } from "@/lib/reports/analyze";

const COLORS = {
  primary: [79, 70, 229] as [number, number, number], // indigo-600
  text: [30, 41, 59] as [number, number, number], // slate-800
  muted: [100, 116, 139] as [number, number, number], // slate-500
  danger: [225, 29, 72] as [number, number, number], // rose-600
  success: [22, 163, 74] as [number, number, number], // emerald-600
  amber: [217, 119, 6] as [number, number, number], // amber-600
  bgSoft: [241, 245, 249] as [number, number, number], // slate-100
};

const MARGIN = 15;

function setText(doc: jsPDF, color: [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2]);
}
function setFill(doc: jsPDF, color: [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
}
function setDraw(doc: jsPDF, color: [number, number, number]) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function ensureSpace(doc: jsPDF, cursorY: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + needed > pageHeight - 20) {
    doc.addPage();
    return MARGIN + 10;
  }
  return cursorY;
}

function writeParagraph(
  doc: jsPDF,
  text: string,
  cursorY: number,
  options: { maxWidth?: number; size?: number; lineHeight?: number; color?: [number, number, number] } = {},
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = options.maxWidth ?? pageWidth - MARGIN * 2;
  const size = options.size ?? 10;
  const lineHeight = options.lineHeight ?? 1.4;
  doc.setFontSize(size);
  setText(doc, options.color ?? COLORS.text);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  let y = cursorY;
  for (const line of lines) {
    y = ensureSpace(doc, y, size * 0.5);
    doc.text(line, MARGIN, y);
    y += size * lineHeight * 0.5;
  }
  return y;
}

function drawHeading(doc: jsPDF, text: string, cursorY: number, size = 14): number {
  let y = ensureSpace(doc, cursorY, size + 4);
  doc.setFontSize(size);
  doc.setFont("helvetica", "bold");
  setText(doc, COLORS.primary);
  doc.text(text, MARGIN, y);
  doc.setFont("helvetica", "normal");
  y += size * 0.5 + 2;
  return y;
}

function drawMetricBoxes(
  doc: jsPDF,
  items: Array<{ label: string; value: string; tone?: "primary" | "success" | "danger" | "amber" }>,
  cursorY: number,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const available = pageWidth - MARGIN * 2;
  const gap = 3;
  const boxW = (available - gap * (items.length - 1)) / items.length;
  const boxH = 18;
  let y = ensureSpace(doc, cursorY, boxH + 4);
  items.forEach((item, i) => {
    const x = MARGIN + i * (boxW + gap);
    setFill(doc, COLORS.bgSoft);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, "F");
    doc.setFontSize(8);
    setText(doc, COLORS.muted);
    doc.text(item.label, x + 3, y + 5);
    const toneColor =
      item.tone === "success"
        ? COLORS.success
        : item.tone === "danger"
          ? COLORS.danger
          : item.tone === "amber"
            ? COLORS.amber
            : COLORS.primary;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    setText(doc, toneColor);
    doc.text(item.value, x + 3, y + 14);
    doc.setFont("helvetica", "normal");
  });
  return y + boxH + 4;
}

function drawTeamBarChart(doc: jsPDF, report: ReportData, cursorY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const labelW = 50;
  const valueW = 18;
  const barW = pageWidth - MARGIN * 2 - labelW - valueW - 4;
  const rowH = 6;
  let y = ensureSpace(doc, cursorY, report.teams.length * rowH + 8);
  doc.setFontSize(9);
  for (const team of report.teams) {
    y = ensureSpace(doc, y, rowH + 1);
    setText(doc, COLORS.text);
    doc.text(team.team, MARGIN, y + 4);
    // bar bg
    setFill(doc, COLORS.bgSoft);
    doc.roundedRect(MARGIN + labelW, y + 1.5, barW, rowH - 3, 1, 1, "F");
    // bar fill
    const pct = team.totalTargets ? team.completionRate / 100 : 0;
    const tone =
      team.completionRate >= 70
        ? COLORS.success
        : team.completionRate >= 40
          ? COLORS.primary
          : COLORS.danger;
    setFill(doc, tone);
    doc.roundedRect(MARGIN + labelW, y + 1.5, barW * pct, rowH - 3, 1, 1, "F");
    // value
    setText(doc, COLORS.muted);
    doc.text(`${team.completionRate}%`, MARGIN + labelW + barW + 2, y + 4);
    y += rowH;
  }
  return y + 3;
}

function drawFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    setText(doc, COLORS.muted);
    doc.text(
      `ProTrack SDK · Internal · Halaman ${i} / ${pageCount}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" },
    );
  }
}

export function downloadReportPdf(report: ReportData, fileName?: string): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // === Header ===
  setFill(doc, COLORS.primary);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  setText(doc, [255, 255, 255]);
  doc.text("Laporan Kinerja Tim SDK", MARGIN, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Periode ${formatDate(report.range.from)} – ${formatDate(report.range.to)}`,
    MARGIN,
    18,
  );
  doc.text(
    `Generated: ${formatDate(report.generatedAt.slice(0, 10))}`,
    pageWidth - MARGIN,
    18,
    { align: "right" },
  );

  let y = 30;

  // === Org summary boxes ===
  y = drawMetricBoxes(
    doc,
    [
      { label: "Total Target", value: String(report.org.totalTargets) },
      { label: "Selesai", value: String(report.org.completed), tone: "success" },
      { label: "Overdue", value: String(report.org.overdue), tone: "danger" },
      { label: "Completion", value: `${report.org.completionRate}%`, tone: "primary" },
    ],
    y,
  );

  // === Org narrative ===
  y = drawHeading(doc, "Ringkasan Organisasi", y + 2, 12);
  y = writeParagraph(doc, report.orgNarrative, y, { size: 10 });
  y += 2;

  // === Completion bar chart per team ===
  y = drawHeading(doc, "Progres per Tim", y + 2, 12);
  y = drawTeamBarChart(doc, report, y);

  // === Team table ===
  autoTable(doc, {
    startY: y + 2,
    head: [["Tim", "Leader", "Anggota", "Total", "Selesai", "Overdue", "Completion", "Beban"]],
    body: report.teams.map((t) => [
      t.team,
      t.leaderName ?? "—",
      String(t.memberCount),
      String(t.totalTargets),
      String(t.completed),
      String(t.overdue),
      `${t.completionRate}%`,
      workloadLabel(t.workloadStatus),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: COLORS.primary, textColor: 255 },
    alternateRowStyles: { fillColor: COLORS.bgSoft },
    margin: { left: MARGIN, right: MARGIN },
  });
  // @ts-expect-error autoTable adds lastAutoTable property to jsPDF
  y = (doc.lastAutoTable?.finalY ?? y) + 6;

  // === Per-team narratives ===
  y = drawHeading(doc, "Narasi per Tim", y, 12);
  for (const team of report.teams) {
    if (!team.narrative) continue;
    y = ensureSpace(doc, y, 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setText(doc, COLORS.text);
    doc.text(team.team, MARGIN, y);
    doc.setFont("helvetica", "normal");
    y += 4;
    y = writeParagraph(doc, team.narrative, y, { size: 9 });
    y += 2;
  }

  // === Members table ===
  if (report.members.length > 0) {
    y = ensureSpace(doc, y, 20);
    y = drawHeading(doc, "Kinerja Anggota", y + 2, 12);
    autoTable(doc, {
      startY: y,
      head: [["Nama", "Tim", "Role", "Active", "Selesai", "Overdue", "Completion", "Beban"]],
      body: report.members.map((m) => [
        m.nama,
        m.team,
        m.role,
        String(m.activeTargets),
        String(m.completed),
        String(m.overdue),
        `${m.completionRate}%`,
        workloadLabel(m.workloadStatus),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: COLORS.primary, textColor: 255 },
      alternateRowStyles: { fillColor: COLORS.bgSoft },
      margin: { left: MARGIN, right: MARGIN },
    });
    // @ts-expect-error autoTable adds lastAutoTable property
    y = (doc.lastAutoTable?.finalY ?? y) + 6;
  }

  // === Spotlights ===
  const hasSpotlight =
    report.spotlights.topPerformers.length > 0 ||
    report.spotlights.overdueRisks.length > 0 ||
    report.spotlights.overloadedMembers.length > 0;
  if (hasSpotlight) {
    y = drawHeading(doc, "Sorotan", y + 2, 12);
    if (report.spotlights.topPerformers.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      setText(doc, COLORS.success);
      y = ensureSpace(doc, y, 6);
      doc.text("Top Performers", MARGIN, y);
      doc.setFont("helvetica", "normal");
      y += 4;
      for (const m of report.spotlights.topPerformers) {
        y = ensureSpace(doc, y, 5);
        setText(doc, COLORS.text);
        doc.setFontSize(9);
        doc.text(`• ${m.nama} (${m.team}) — ${m.completionRate}%`, MARGIN + 2, y);
        y += 4;
      }
      y += 1;
    }
    if (report.spotlights.overdueRisks.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      setText(doc, COLORS.danger);
      y = ensureSpace(doc, y, 6);
      doc.text("Risiko Overdue", MARGIN, y);
      doc.setFont("helvetica", "normal");
      y += 4;
      for (const m of report.spotlights.overdueRisks) {
        y = ensureSpace(doc, y, 5);
        setText(doc, COLORS.text);
        doc.setFontSize(9);
        doc.text(`• ${m.nama} (${m.team}) — ${m.overdue} target overdue`, MARGIN + 2, y);
        y += 4;
      }
      y += 1;
    }
    if (report.spotlights.overloadedMembers.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      setText(doc, COLORS.amber);
      y = ensureSpace(doc, y, 6);
      doc.text("Indikasi Overload", MARGIN, y);
      doc.setFont("helvetica", "normal");
      y += 4;
      for (const m of report.spotlights.overloadedMembers) {
        y = ensureSpace(doc, y, 5);
        setText(doc, COLORS.text);
        doc.setFontSize(9);
        doc.text(`• ${m.nama} (${m.team}) — ${m.activeTargets} target aktif`, MARGIN + 2, y);
        y += 4;
      }
      y += 1;
    }
  }

  // === Recommendations ===
  y = drawHeading(doc, "Rekomendasi Kebijakan", y + 2, 12);
  for (const rec of report.recommendations) {
    y = ensureSpace(doc, y, 8);
    setText(doc, COLORS.text);
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(`• ${rec}`, pageWidth - MARGIN * 2 - 2) as string[];
    for (const line of lines) {
      y = ensureSpace(doc, y, 4);
      doc.text(line, MARGIN + 2, y);
      y += 4;
    }
    y += 1;
  }

  drawFooter(doc);

  const safeFrom = report.range.from.replace(/-/g, "");
  const safeTo = report.range.to.replace(/-/g, "");
  doc.save(fileName ?? `Laporan-SDK-${safeFrom}-${safeTo}.pdf`);
}
