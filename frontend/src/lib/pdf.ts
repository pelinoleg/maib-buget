import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Romanian transliteration for jsPDF (Helvetica doesn't support diacritics)
const RO_MAP: Record<string, string> = {
  ă: "a", Ă: "A", â: "a", Â: "A",
  î: "i", Î: "I", ș: "s", Ș: "S",
  ț: "t", Ț: "T",
};

function ro(str: string): string {
  return str.replace(/[ăĂâÂîÎșȘțȚ]/g, (c) => RO_MAP[c] ?? c);
}

const fmt = (n: number) =>
  n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function addPageNumbers(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.text(`Pagina ${i} din ${pages}`, w / 2, h - 8, { align: "center" });
    doc.text(`Generat de Buget`, w - 14, h - 8, { align: "right" });
  }
}

// ─── Transactions PDF (A4 Landscape) ────────────────────────────────

interface TransactionRow {
  transaction_date: string;
  description: string;
  amount: number;
  account_currency: string;
  original_amount: number | null;
  original_currency: string | null;
  type: string;
  category_name: string | null;
}

export interface TransactionsPDFParams {
  transactions: TransactionRow[];
  sumIncome: number;
  sumExpense: number;
  sumTransfers: number;
  dateFrom?: string;
  dateTo?: string;
  accountName?: string;
  total: number;
}

export function exportTransactionsPDF(params: TransactionsPDFParams) {
  const { transactions, sumIncome, sumExpense, sumTransfers, dateFrom, dateTo, accountName, total } = params;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const net = sumIncome - sumExpense;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Buget", 14, 18);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(ro("Raport tranzactii"), 14, 25);

  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString("ro-RO"), w - 14, 18, { align: "right" });
  doc.text(`${total} ${ro("tranzactii")}`, w - 14, 24, { align: "right" });

  // Filters line
  const filters: string[] = [];
  if (dateFrom && dateTo) filters.push(`${dateFrom} - ${dateTo}`);
  else if (dateFrom) filters.push(`din ${dateFrom}`);
  else if (dateTo) filters.push(ro(`pana la ${dateTo}`));
  if (accountName) filters.push(`Cont: ${ro(accountName)}`);
  if (filters.length > 0) {
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(filters.join("  |  "), 14, 31);
  }

  // Summary boxes
  const boxY = 35;
  const boxH = 16;
  const boxW = (w - 28 - 12) / 4;
  const boxes = [
    { label: "Venituri", value: `+${fmt(sumIncome)}`, color: [22, 163, 74] as [number, number, number], bg: [240, 253, 244] as [number, number, number, number] | [number, number, number] },
    { label: "Cheltuieli", value: `-${fmt(sumExpense)}`, color: [239, 68, 68] as [number, number, number], bg: [254, 242, 242] as [number, number, number] },
    { label: "Transferuri", value: fmt(sumTransfers), color: [59, 130, 246] as [number, number, number], bg: [239, 246, 255] as [number, number, number] },
    { label: "Net", value: `${net >= 0 ? "+" : ""}${fmt(net)}`, color: net >= 0 ? [22, 163, 74] as [number, number, number] : [239, 68, 68] as [number, number, number], bg: [248, 250, 252] as [number, number, number] },
  ];

  boxes.forEach((b, i) => {
    const x = 14 + i * (boxW + 4);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    doc.roundedRect(x, boxY, boxW, boxH, 2, 2, "F");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.setFont("helvetica", "normal");
    doc.text(b.label, x + 4, boxY + 5);
    doc.setFontSize(12);
    doc.setTextColor(b.color[0], b.color[1], b.color[2]);
    doc.setFont("helvetica", "bold");
    doc.text(b.value, x + 4, boxY + 12);
  });

  // Transaction table
  const typeLabel: Record<string, string> = {
    income: "Venit",
    expense: "Cheltuiala",
    transfer: "Transfer",
    cancelled: "Anulat",
  };

  autoTable(doc, {
    startY: boxY + boxH + 6,
    head: [[ro("Data"), ro("Descriere"), ro("Suma"), "Orig.", "Categorie", "Tip"]],
    body: transactions.map((t) => [
      t.transaction_date,
      ro(t.description.length > 70 ? t.description.slice(0, 67) + "..." : t.description),
      `${t.amount > 0 ? "+" : ""}${fmt(t.amount)} ${t.account_currency}`,
      t.original_amount && t.original_currency
        ? `${fmt(t.original_amount)} ${t.original_currency}`
        : "",
      ro(t.category_name || "-"),
      typeLabel[t.type] || t.type,
    ]),
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: 255,
      fontSize: 8,
      font: "helvetica",
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 7.5,
      font: "helvetica",
      cellPadding: 2,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 35, halign: "right", font: "courier" },
      3: { cellWidth: 28, halign: "right", fontSize: 7, textColor: [130, 130, 130] },
      4: { cellWidth: 38 },
      5: { cellWidth: 22 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        const txn = transactions[data.row.index];
        if (txn) {
          if (txn.type === "income") data.cell.styles.textColor = [22, 163, 74];
          else if (txn.type === "expense") data.cell.styles.textColor = [239, 68, 68];
          else if (txn.type === "transfer") data.cell.styles.textColor = [59, 130, 246];
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  addPageNumbers(doc);

  const dateStr = dateFrom && dateTo ? `_${dateFrom}_${dateTo}` : "";
  doc.save(`tranzactii${dateStr}.pdf`);
}


// ─── Tax Declaration PDF (A4 Portrait) ──────────────────────────────

export interface TaxIncome {
  date: string;
  description: string;
  amount: number;
  currency: string;
  account_name: string;
  rate?: number;
  amount_mdl?: number;
}

export interface TaxPDFParams {
  year: number;
  incomes: TaxIncome[];
  totalMdl: number;
  eurRateToday: number;
  totalEurEquivalent: number;
  taxRate: number;
  childDeduction: number;
  personalDeduction: number;
  applyChildDeduction: boolean;
  applyPersonalDeduction: boolean;
  totalDeductions: number;
  taxableIncome: number;
  taxAmount: number;
  totalsByCurrency: Record<string, number>;
}

export function exportTaxDeclarationPDF(params: TaxPDFParams) {
  const {
    year, incomes, totalMdl, eurRateToday, totalEurEquivalent,
    taxRate, childDeduction, personalDeduction,
    applyChildDeduction, applyPersonalDeduction,
    totalDeductions, taxableIncome, taxAmount, totalsByCurrency,
  } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  // ── Title ──
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(ro("DECLARATIE FISCALA"), w / 2, 25, { align: "center" });
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(`Anul ${year}`, w / 2, 33, { align: "center" });

  // Separator line
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(14, 37, w - 14, 37);

  // ── Left: income summary ──
  let y = 46;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60);
  doc.text("Total venituri:", 14, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(22, 163, 74);
  for (const [cur, sum] of Object.entries(totalsByCurrency)) {
    doc.text(`+${fmt(sum)} ${cur}`, 14, y);
    y += 6;
  }

  y += 2;
  doc.setTextColor(180, 130, 20);
  doc.setFont("helvetica", "bold");
  doc.text(`Total MDL: ${fmt(totalMdl)} MDL`, 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(ro(`Echivalent EUR (curs azi ${eurRateToday.toFixed(4)}): ~${fmt(totalEurEquivalent)} EUR`), 14, y);

  // ── Right: tax calculation box ──
  const boxX = w / 2 + 5;
  const boxW2 = w / 2 - 19;
  const boxY2 = 43;
  const boxH2 = 62;

  doc.setDrawColor(239, 68, 68);
  doc.setLineWidth(0.8);
  doc.setFillColor(255, 250, 250);
  doc.roundedRect(boxX, boxY2, boxW2, boxH2, 3, 3, "FD");

  let ty = boxY2 + 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(200, 50, 50);
  doc.text("Calcul impozit", boxX + 5, ty);
  ty += 8;

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);

  const taxLines: [string, string][] = [
    ["Venit total:", `${fmt(totalMdl)} MDL`],
  ];
  if (applyPersonalDeduction) {
    taxLines.push([ro("Scutire personala:"), ro(`-${fmt(personalDeduction)} MDL`)]);
  }
  if (applyChildDeduction) {
    taxLines.push([ro("Scutire copil:"), `-${fmt(childDeduction)} MDL`]);
  }
  if (totalDeductions > 0) {
    taxLines.push(["Venit impozabil:", `${fmt(taxableIncome)} MDL`]);
  }
  taxLines.push([ro("Cota impozit:"), `${taxRate}%`]);

  for (const [label, val] of taxLines) {
    doc.text(label, boxX + 5, ty);
    doc.text(val, boxX + boxW2 - 5, ty, { align: "right" });
    ty += 5.5;
  }

  // Separator inside box
  ty += 1;
  doc.setDrawColor(239, 68, 68);
  doc.setLineWidth(0.3);
  doc.line(boxX + 5, ty, boxX + boxW2 - 5, ty);
  ty += 6;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(200, 30, 30);
  doc.text(ro("De platit:"), boxX + 5, ty);
  doc.text(`${fmt(taxAmount)} MDL`, boxX + boxW2 - 5, ty, { align: "right" });
  ty += 5;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(130);
  doc.text(`~${fmt(taxAmount / eurRateToday)} EUR`, boxX + boxW2 - 5, ty, { align: "right" });

  // ── Income table ──
  const tableStartY = Math.max(y + 12, boxY2 + boxH2 + 10);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60);
  doc.text(`Venituri ${year} (${incomes.length} ${ro("tranzactii")})`, 14, tableStartY - 4);

  autoTable(doc, {
    startY: tableStartY,
    head: [["Data", ro("Descriere"), "Cont", ro("Suma"), "Curs BNM", ro("Suma MDL")]],
    body: incomes.map((inc) => [
      inc.date.split("-").reverse().join("."),
      ro(inc.description.length > 55 ? inc.description.slice(0, 52) + "..." : inc.description),
      ro(inc.account_name),
      `+${fmt(inc.amount)} ${inc.currency}`,
      inc.rate ? inc.rate.toFixed(4) : "-",
      inc.amount_mdl ? fmt(inc.amount_mdl) : "-",
    ]),
    foot: [[
      "", "", "", "", "TOTAL:",
      `${fmt(totalMdl)} MDL`,
    ]],
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: 255,
      fontSize: 8,
      font: "helvetica",
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 7.5,
      font: "helvetica",
      cellPadding: 2,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [30, 41, 59],
      fontSize: 8,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 20, fontSize: 7 },
      3: { cellWidth: 28, halign: "right", textColor: [22, 163, 74], font: "courier" },
      4: { cellWidth: 20, halign: "right", fontSize: 7, textColor: [130, 130, 130] },
      5: { cellWidth: 28, halign: "right", font: "courier", fontStyle: "bold" },
    },
    margin: { left: 14, right: 14 },
  });

  // Footer note
  const h = doc.internal.pageSize.getHeight();
  addPageNumbers(doc);

  doc.setPage(doc.getNumberOfPages());
  doc.setFontSize(7);
  doc.setTextColor(160);
  doc.text(
    ro("Cursurile BNM au fost preluate de la bnm.md la data fiecarei tranzactii."),
    14, h - 13,
  );

  doc.save(`declaratie_fiscala_${year}.pdf`);
}


// ─── Dashboard Summary PDF (A4 Portrait) ─────────────────────────────

interface CategorySummary {
  name: string;
  color: string;
  total: number;
}

interface MonthSummary {
  month: string;
  income: number;
  expense: number;
}

interface TopExpenseItem {
  description: string;
  date: string;
  amount: number;
  category_name: string | null;
}

interface ComparisonItem {
  name: string;
  current: number;
  previous: number;
  delta: number;
  delta_pct: number | null;
}

export interface DashboardPDFParams {
  dateFrom?: string;
  dateTo?: string;
  currency: string;
  totalIncome: number;
  totalExpense: number;
  totalTransfers: number;
  net: number;
  categories: CategorySummary[];
  months: MonthSummary[];
  topExpenses: TopExpenseItem[];
  comparison?: ComparisonItem[];
}

export function exportDashboardPDF(params: DashboardPDFParams) {
  const {
    dateFrom, dateTo, currency, totalIncome, totalExpense, totalTransfers, net,
    categories, months, topExpenses, comparison,
  } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Buget", 14, 18);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(ro("Raport sumar"), 14, 25);

  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString("ro-RO"), w - 14, 18, { align: "right" });
  if (dateFrom && dateTo) {
    doc.text(`${dateFrom} - ${dateTo}`, w - 14, 24, { align: "right" });
  }

  // Summary boxes
  const boxY = 32;
  const boxH = 16;
  const boxW = (w - 28 - 12) / 4;
  const boxes = [
    { label: "Venituri", value: `+${fmt(totalIncome)}`, color: [22, 163, 74] as [number, number, number], bg: [240, 253, 244] as [number, number, number] },
    { label: "Cheltuieli", value: `-${fmt(totalExpense)}`, color: [239, 68, 68] as [number, number, number], bg: [254, 242, 242] as [number, number, number] },
    { label: "Transferuri", value: fmt(totalTransfers), color: [59, 130, 246] as [number, number, number], bg: [239, 246, 255] as [number, number, number] },
    { label: "Net", value: `${net >= 0 ? "+" : ""}${fmt(net)}`, color: net >= 0 ? [22, 163, 74] as [number, number, number] : [239, 68, 68] as [number, number, number], bg: [248, 250, 252] as [number, number, number] },
  ];

  boxes.forEach((b, i) => {
    const x = 14 + i * (boxW + 4);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    doc.roundedRect(x, boxY, boxW, boxH, 2, 2, "F");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.setFont("helvetica", "normal");
    doc.text(b.label, x + 4, boxY + 5);
    doc.setFontSize(12);
    doc.setTextColor(b.color[0], b.color[1], b.color[2]);
    doc.setFont("helvetica", "bold");
    doc.text(b.value, x + 4, boxY + 12);
  });

  let y = boxY + boxH + 10;

  // ── Pie chart + Category legend (side by side) ──
  if (categories.length > 0) {
    const grandTotal = categories.reduce((s, c) => s + c.total, 0);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(ro("Cheltuieli pe categorii"), 14, y);
    y += 4;

    // Draw pie chart on the left
    const pieX = 55;
    const pieY = y + 38;
    const pieR = 32;

    // Parse hex color to RGB
    const hexToRgb = (hex: string): [number, number, number] => {
      const h = hex.replace("#", "");
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };

    // Draw pie segments
    let startAngle = -Math.PI / 2; // start from top
    for (const cat of categories) {
      if (cat.total <= 0) continue;
      const sweep = (cat.total / grandTotal) * Math.PI * 2;
      const [r, g, b] = hexToRgb(cat.color);
      doc.setFillColor(r, g, b);

      // Draw segment as filled polygon (approximate arc with line segments)
      const steps = Math.max(Math.ceil(sweep / 0.05), 4);
      const points: [number, number][] = [[pieX, pieY]]; // center
      for (let i = 0; i <= steps; i++) {
        const a = startAngle + (sweep * i) / steps;
        points.push([pieX + Math.cos(a) * pieR, pieY + Math.sin(a) * pieR]);
      }

      // Draw as triangle fan
      for (let i = 1; i < points.length - 1; i++) {
        doc.triangle(
          points[0][0], points[0][1],
          points[i][0], points[i][1],
          points[i + 1][0], points[i + 1][1],
          "F"
        );
      }
      startAngle += sweep;
    }

    // Category legend on the right side of pie
    const legendX = pieX + pieR + 14;
    let legendY = y + 4;
    for (const cat of categories) {
      const pct = grandTotal > 0 ? (cat.total / grandTotal) * 100 : 0;
      const [r, g, b] = hexToRgb(cat.color);
      doc.setFillColor(r, g, b);
      doc.roundedRect(legendX, legendY - 2.5, 3, 3, 0.5, 0.5, "F");

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50);
      doc.text(ro(cat.name), legendX + 5, legendY);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(80);
      doc.text(`${fmt(cat.total)} ${currency}`, w - 42, legendY, { align: "right" });
      doc.setFontSize(7);
      doc.setTextColor(130);
      doc.text(`${pct.toFixed(1)}%`, w - 16, legendY, { align: "right" });

      legendY += 5;
    }

    // Total
    legendY += 2;
    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(legendX, legendY - 3, w - 14, legendY - 3);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Total", legendX + 5, legendY);
    doc.text(`${fmt(grandTotal)} ${currency}`, w - 42, legendY, { align: "right" });
    doc.text("100%", w - 16, legendY, { align: "right" });

    y = Math.max(pieY + pieR + 8, legendY + 8);
  }

  // ── Monthly bar chart ──
  if (months.length > 0) {
    if (y > 210) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(ro("Venituri si cheltuieli pe luni"), 14, y);
    y += 6;

    const chartLeft = 40;
    const chartRight = w - 16;
    const chartW = chartRight - chartLeft;
    const barGroupH = 7;
    const groupGap = 4;
    const maxMonthVal = Math.max(...months.map((m) => Math.max(m.income, m.expense)), 1);

    for (const m of months) {
      // Month label
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      doc.text(m.month, chartLeft - 2, y + 2.5, { align: "right" });

      // Income bar (green)
      const incW = Math.max((m.income / maxMonthVal) * chartW, 0.5);
      doc.setFillColor(22, 163, 74);
      doc.roundedRect(chartLeft, y, incW, 3, 0.5, 0.5, "F");
      if (m.income > 0) {
        doc.setFontSize(5.5);
        doc.setTextColor(22, 163, 74);
        const incLabel = `+${fmt(m.income)}`;
        if (incW > doc.getTextWidth(incLabel) + 4) {
          doc.text(incLabel, chartLeft + incW - 1, y + 2.3, { align: "right" });
        } else {
          doc.text(incLabel, chartLeft + incW + 1, y + 2.3);
        }
      }

      // Expense bar (red)
      const expW = Math.max((m.expense / maxMonthVal) * chartW, 0.5);
      doc.setFillColor(239, 68, 68);
      doc.roundedRect(chartLeft, y + 3.5, expW, 3, 0.5, 0.5, "F");
      if (m.expense > 0) {
        doc.setFontSize(5.5);
        doc.setTextColor(239, 68, 68);
        const expLabel = `-${fmt(m.expense)}`;
        if (expW > doc.getTextWidth(expLabel) + 4) {
          doc.text(expLabel, chartLeft + expW - 1, y + 5.8, { align: "right" });
        } else {
          doc.text(expLabel, chartLeft + expW + 1, y + 5.8);
        }
      }

      y += barGroupH + groupGap;
    }
    y += 4;
  }

  // Top expenses
  if (topExpenses.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Top cheltuieli", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["#", "Data", ro("Descriere"), `${ro("Suma")} ${currency}`, "Categorie"]],
      body: topExpenses.map((t, i) => [
        String(i + 1),
        t.date,
        ro(t.description.length > 50 ? t.description.slice(0, 47) + "..." : t.description),
        `-${fmt(t.amount)}`,
        ro(t.category_name || "-"),
      ]),
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 22 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 30, halign: "right", font: "courier", textColor: [239, 68, 68] },
        4: { cellWidth: 30 },
      },
      margin: { left: 14, right: 14 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Period comparison
  if (comparison && comparison.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(ro("Comparare cu perioada anterioara"), 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Categorie", "Curent", "Anterior", ro("Diferenta")]],
      body: comparison.map((c) => [
        ro(c.name),
        fmt(c.current),
        fmt(c.previous),
        `${c.delta > 0 ? "+" : ""}${fmt(c.delta)}${c.delta_pct != null ? ` (${c.delta_pct > 0 ? "+" : ""}${c.delta_pct.toFixed(0)}%)` : ""}`,
      ]),
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 28, halign: "right", font: "courier" },
        2: { cellWidth: 28, halign: "right", font: "courier", textColor: [130, 130, 130] },
        3: { cellWidth: 38, halign: "right", font: "courier" },
      },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const c = comparison[data.row.index];
          if (c) {
            if (c.delta > 0) data.cell.styles.textColor = [239, 68, 68];
            else if (c.delta < 0) data.cell.styles.textColor = [22, 163, 74];
          }
        }
      },
    });
  }

  addPageNumbers(doc);

  const dateStr = dateFrom && dateTo ? `_${dateFrom}_${dateTo}` : "";
  doc.save(`raport_sumar${dateStr}.pdf`);
}
