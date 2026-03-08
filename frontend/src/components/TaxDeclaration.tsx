import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calculator, Loader2, TrendingUp, DollarSign, Banknote, Receipt, ExternalLink, Download, FileDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTaxIncome, convertTaxIncome, getTaxConfig } from "@/lib/api";
import { downloadCSV } from "@/lib/csv";
import { exportTaxDeclarationPDF } from "@/lib/pdf";

interface Income {
  id: number;
  date: string;
  description: string;
  amount: number;
  currency: string;
  account_name: string;
  rate?: number;
  amount_mdl?: number;
}

interface ConvertResult {
  total_mdl: number;
  eur_rate_today: number;
  total_eur_equivalent: number;
  errors?: string[];
}

interface TaxConfig {
  tax_rate: number;
  child_deduction: number;
  personal_deduction: number;
}

export default function TaxDeclaration() {
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [converted, setConverted] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<ConvertResult | null>(null);
  const [taxConfig, setTaxConfig] = useState<TaxConfig | null>(null);
  const [applyChildDeduction, setApplyChildDeduction] = useState(true);
  const [applyPersonalDeduction, setApplyPersonalDeduction] = useState(false);
  const [customDeduction, setCustomDeduction] = useState<number>(0);

  useEffect(() => {
    getTaxConfig().then(setTaxConfig);
  }, []);

  useEffect(() => {
    setConverted(false);
    setConvertResult(null);
    getTaxIncome(year).then((data) => {
      setIncomes(data.incomes);
    });
  }, [year]);

  const handleConvert = async () => {
    setConverting(true);
    try {
      const result = await convertTaxIncome(year);
      setIncomes(result.incomes);
      setConvertResult({
        total_mdl: result.total_mdl,
        eur_rate_today: result.eur_rate_today,
        total_eur_equivalent: result.total_eur_equivalent,
        errors: result.errors,
      });
      setConverted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setConverting(false);
    }
  };

  // Group totals by currency
  const totalsByCurrency: Record<string, number> = {};
  for (const inc of incomes) {
    totalsByCurrency[inc.currency] = (totalsByCurrency[inc.currency] || 0) + inc.amount;
  }

  // Tax calculation
  const totalDeductions = (taxConfig ? (
    (applyChildDeduction ? taxConfig.child_deduction : 0) +
    (applyPersonalDeduction ? taxConfig.personal_deduction : 0)
  ) : 0);
  const taxableIncome = convertResult ? Math.max(0, convertResult.total_mdl - totalDeductions - customDeduction) : 0;
  const taxAmount = taxConfig ? taxableIncome * (taxConfig.tax_rate / 100) : 0;

  const [bnmDate, setBnmDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  const bnmUrl = (() => {
    const [y, m, d] = bnmDate.split("-");
    return `https://bnm.md/ro/official_exchange_rates?get_xml=1&date=${d}.${m}.${y}`;
  })();

  const exportTaxCSV = () => {
    const headers = ["Data", "Descriere", "Cont", "Sumă", "Valută",
      ...(converted ? ["Curs BNM", "Sumă MDL"] : [])];
    const rows = incomes.map((inc) => [
      inc.date, inc.description, inc.account_name, inc.amount, inc.currency,
      ...(converted ? [inc.rate, inc.amount_mdl] : []),
    ]);
    downloadCSV(`declaratie_${year}.csv`, headers, rows);
  };

  const exportTaxPDF = () => {
    if (!convertResult || !taxConfig) return;
    exportTaxDeclarationPDF({
      year,
      incomes,
      totalMdl: convertResult.total_mdl,
      eurRateToday: convertResult.eur_rate_today,
      totalEurEquivalent: convertResult.total_eur_equivalent,
      taxRate: taxConfig.tax_rate,
      childDeduction: taxConfig.child_deduction,
      personalDeduction: taxConfig.personal_deduction,
      applyChildDeduction,
      applyPersonalDeduction,
      totalDeductions,
      taxableIncome,
      taxAmount,
      totalsByCurrency,
    });
  };

  const fmt = (n: number) => n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-2xl font-bold">Declarație fiscală</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setYear(year - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-semibold w-16 text-center">{year}</span>
          <Button variant="outline" size="icon" onClick={() => setYear(year + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Toate veniturile înregistrate în {year} (fără transferuri între conturi proprii).
        Apasă „Calculează în MDL" pentru a converti fiecare venit la cursul BNM din ziua tranzacției.
      </p>

      {/* Summary cards */}
      <div className={`grid gap-3 ${converted ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1"}`}>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Total venituri</span>
            </div>
            <div className="space-y-0.5">
              {Object.entries(totalsByCurrency).map(([cur, sum]) => (
                <p key={cur} className="text-lg font-semibold text-green-600">
                  +{fmt(sum)} {cur}
                </p>
              ))}
              {incomes.length === 0 && (
                <p className="text-lg font-semibold text-muted-foreground">0.00</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{incomes.length} tranzacții</p>
          </CardContent>
        </Card>

        {converted && convertResult && (
          <>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Banknote className="h-4 w-4 text-amber-600" />
                  <span className="text-xs text-muted-foreground">Total în MDL</span>
                </div>
                <p className="text-lg font-semibold text-amber-600">
                  {fmt(convertResult.total_mdl)} MDL
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Convertit la cursul BNM din ziua fiecărei tranzacții
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-blue-600" />
                  <span className="text-xs text-muted-foreground">Echivalent EUR (curs de azi)</span>
                </div>
                <p className="text-lg font-semibold text-blue-600">
                  ≈ {fmt(convertResult.total_eur_equivalent)} EUR
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Curs BNM EUR azi: {convertResult.eur_rate_today} MDL
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tax calculation card */}
      {converted && convertResult && taxConfig && (
        <Card className="border-2 border-red-200 bg-red-50/30">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="h-5 w-5 text-red-600" />
              <h2 className="text-lg font-bold text-red-600">Impozit de plătit</h2>
            </div>

            <div className="space-y-3">
              {/* Deductions */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyPersonalDeduction}
                    onChange={(e) => setApplyPersonalDeduction(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">
                    Scutire personală: <strong>{fmt(taxConfig.personal_deduction)} MDL</strong>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyChildDeduction}
                    onChange={(e) => setApplyChildDeduction(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">
                    Scutire pentru copil: <strong>{fmt(taxConfig.child_deduction)} MDL</strong>
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Scutire custom:</span>
                  <input
                    type="number"
                    value={customDeduction || ""}
                    onChange={(e) => setCustomDeduction(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="border rounded px-2 py-1 text-sm w-32 bg-background tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground">MDL</span>
                </div>
              </div>

              {/* Calculation breakdown */}
              <div className="border-t pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Venit total:</span>
                  <span>{fmt(convertResult.total_mdl)} MDL</span>
                </div>
                {totalDeductions > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scutiri:</span>
                    <span className="text-green-600">− {fmt(totalDeductions)} MDL</span>
                  </div>
                )}
                {customDeduction > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scutire custom:</span>
                    <span className="text-green-600">− {fmt(customDeduction)} MDL</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Venit impozabil:</span>
                  <span>{fmt(taxableIncome)} MDL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cota impozitului:</span>
                  <span>{taxConfig.tax_rate}%</span>
                </div>
              </div>

              {/* Final amount */}
              <div className="border-t pt-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-base font-semibold">De plătit:</span>
                  <span className="text-2xl font-bold text-red-600">
                    {fmt(taxAmount)} MDL
                  </span>
                </div>
                {convertResult.eur_rate_today > 0 && (
                  <p className="text-sm text-muted-foreground text-right mt-1">
                    ≈ {fmt(taxAmount / convertResult.eur_rate_today)} EUR la cursul de azi
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Convert button */}
      {!converted && incomes.length > 0 && (
        <Button onClick={handleConvert} disabled={converting} className="w-full sm:w-auto">
          {converting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Se calculează cursurile BNM...
            </>
          ) : (
            <>
              <Calculator className="h-4 w-4 mr-2" />
              Calculează în MDL
            </>
          )}
        </Button>
      )}

      {convertResult?.errors && convertResult.errors.length > 0 && (
        <div className="text-sm text-red-500 bg-red-50 p-3 rounded-lg space-y-1">
          {convertResult.errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}

      {/* Income table */}
      {incomes.length > 0 && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={exportTaxCSV}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          {converted && convertResult && taxConfig && (
            <Button variant="outline" size="sm" onClick={exportTaxPDF}>
              <FileDown className="h-4 w-4 mr-1" /> PDF
            </Button>
          )}
        </div>
      )}
      <Card>
        <CardContent className="px-0 pt-0">
          <div className="overflow-x-auto"><Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Data</TableHead>
                <TableHead>Descriere</TableHead>
                <TableHead className="w-[80px] hidden md:table-cell">Cont</TableHead>
                <TableHead className="w-[130px] text-right">Sumă</TableHead>
                {converted && (
                  <>
                    <TableHead className="w-[100px] text-right">Curs BNM</TableHead>
                    <TableHead className="w-[140px] text-right">Sumă MDL</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {incomes.map((inc) => (
                <TableRow key={inc.id}>
                  <TableCell className="text-sm">
                    {inc.date.split("-").reverse().join(".")}
                  </TableCell>
                  <TableCell className="text-sm max-w-[180px] md:max-w-[350px]">
                    <div
                      className="truncate cursor-pointer"
                      title={inc.description}
                      onClick={(e) => {
                        const el = e.currentTarget;
                        const expanded = el.classList.toggle("whitespace-normal");
                        el.classList.toggle("break-words", expanded);
                        el.classList.toggle("truncate", !expanded);
                        el.title = expanded ? "" : inc.description;
                      }}
                    >
                      {inc.description}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" className="text-xs">{inc.currency}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-green-600">
                    +{fmt(inc.amount)} {inc.currency}
                  </TableCell>
                  {converted && (
                    <>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {inc.rate ? (
                          <a
                            href={`https://bnm.md/ro/official_exchange_rates?get_xml=1&date=${inc.date.split("-").reverse().join(".")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-primary"
                            title="Verifică pe bnm.md"
                          >
                            {inc.rate.toFixed(4)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        {inc.amount_mdl ? fmt(inc.amount_mdl) : "—"} MDL
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
              {incomes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={converted ? 6 : 4} className="text-center py-8 text-muted-foreground">
                    Nu sunt venituri înregistrate în {year}.
                  </TableCell>
                </TableRow>
              )}
              {converted && incomes.length > 0 && (
                <TableRow className="bg-accent/50 font-semibold">
                  <TableCell colSpan={5} className="text-right text-sm">
                    TOTAL:
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {convertResult ? fmt(convertResult.total_mdl) : "—"} MDL
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table></div>
        </CardContent>
      </Card>

      {/* BNM rate checker */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Verifică cursul BNM:</span>
        <input
          type="date"
          value={bnmDate}
          onChange={(e) => setBnmDate(e.target.value)}
          className="border rounded px-1.5 py-0.5 text-xs bg-background"
        />
        <a
          href={bnmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          bnm.md <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
