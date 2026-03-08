import { useState, useEffect } from "react";
import { Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compareCategories } from "@/lib/api";

const BASE_CURRENCY = import.meta.env.VITE_BASE_CURRENCY || "EUR";

const MONTH_LABELS: Record<string, string> = {
  "01": "Ianuarie", "02": "Februarie", "03": "Martie", "04": "Aprilie",
  "05": "Mai", "06": "Iunie", "07": "Iulie", "08": "August",
  "09": "Septembrie", "10": "Octombrie", "11": "Noiembrie", "12": "Decembrie",
};

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTH_LABELS[m] || m} ${y}`;
}

const fmt = (n: number) =>
  n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type ComparePreset = "last_month" | "custom_months" | "custom_years";

interface ComparisonItem {
  category_id: number | null;
  name: string;
  color: string;
  current: number;
  previous: number;
  delta: number;
  delta_pct: number | null;
}

export default function CompareExpenses() {
  const [preset, setPreset] = useState<ComparePreset>("last_month");
  const [monthA, setMonthA] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [monthB, setMonthB] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Generate available years from 2020 to current
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: currentYear - 2019 }, (_, i) => currentYear - i);
  const [yearA, setYearA] = useState(String(currentYear - 1));
  const [yearB, setYearB] = useState(String(currentYear - 2));

  const [comparison, setComparison] = useState<ComparisonItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState<{ current: string; previous: string }>({ current: "", previous: "" });

  const currLabel = ` ${BASE_CURRENCY}`;

  const load = async (p?: ComparePreset, mA?: string, mB?: string, yA?: string, yB?: string) => {
    const pr = p ?? preset;
    const ma = mA ?? monthA;
    const mb = mB ?? monthB;
    const ya = yA ?? yearA;
    const yb = yB ?? yearB;

    let curFrom: string, curTo: string, prevFrom: string, prevTo: string;
    let curLabel: string, prevLabel: string;

    if (pr === "last_month") {
      const now = new Date();
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prev = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      curFrom = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-01`;
      curTo = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${new Date(last.getFullYear(), last.getMonth() + 1, 0).getDate()}`;
      prevFrom = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`;
      prevTo = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate()}`;
      curLabel = fmtMonth(`${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}`);
      prevLabel = fmtMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`);
    } else if (pr === "custom_years") {
      curFrom = `${ya}-01-01`; curTo = `${ya}-12-31`;
      prevFrom = `${yb}-01-01`; prevTo = `${yb}-12-31`;
      curLabel = ya;
      prevLabel = yb;
    } else {
      const [yA2, mAn] = ma.split("-");
      const [yB2, mBn] = mb.split("-");
      curFrom = `${yA2}-${mAn}-01`;
      curTo = `${yA2}-${mAn}-${new Date(parseInt(yA2), parseInt(mAn), 0).getDate()}`;
      prevFrom = `${yB2}-${mBn}-01`;
      prevTo = `${yB2}-${mBn}-${new Date(parseInt(yB2), parseInt(mBn), 0).getDate()}`;
      curLabel = fmtMonth(ma);
      prevLabel = fmtMonth(mb);
    }

    setLoading(true);
    setLabels({ current: curLabel, previous: prevLabel });
    try {
      const data = await compareCategories({
        date_from: curFrom, date_to: curTo,
        prev_date_from: prevFrom, prev_date_to: prevTo,
        currency: BASE_CURRENCY,
      });
      setComparison(data);
    } catch {
      setComparison([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="hidden md:block text-2xl font-bold">Comparare cheltuieli</h1>

      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Preset selector */}
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: "last_month" as ComparePreset, label: "Luna trecută vs anterioară" },
              { key: "custom_months" as ComparePreset, label: "Luni specifice" },
              { key: "custom_years" as ComparePreset, label: "An vs an" },
            ]).map((opt) => (
              <button
                key={opt.key}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  preset === opt.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent border-border"
                }`}
                onClick={() => { setPreset(opt.key); load(opt.key); }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Custom month selectors */}
          {preset === "custom_months" && (
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="month"
                value={monthA}
                onChange={(e) => { setMonthA(e.target.value); load("custom_months", e.target.value, monthB); }}
                className="w-44 h-9 text-sm"
              />
              <span className="text-sm text-muted-foreground">vs</span>
              <Input
                type="month"
                value={monthB}
                onChange={(e) => { setMonthB(e.target.value); load("custom_months", monthA, e.target.value); }}
                className="w-44 h-9 text-sm"
              />
            </div>
          )}

          {/* Custom year selectors */}
          {preset === "custom_years" && (
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={yearA} onValueChange={(v) => { setYearA(v); load("custom_years", undefined, undefined, v, yearB); }}>
                <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">vs</span>
              <Select value={yearB} onValueChange={(v) => { setYearB(v); load("custom_years", undefined, undefined, yearA, v); }}>
                <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Label */}
          {labels.current && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{labels.current}</span>
              {" vs "}
              <span className="font-medium text-foreground">{labels.previous}</span>
              {" — cheltuieli, "}
              {BASE_CURRENCY}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : comparison.length > 0 ? (() => {
        const globalMax = Math.max(...comparison.map((c) => Math.max(c.current, c.previous)), 1);
        const totalCurrent = comparison.reduce((s, c) => s + c.current, 0);
        const totalPrevious = comparison.reduce((s, c) => s + c.previous, 0);
        const totalDelta = totalCurrent - totalPrevious;
        const totalDeltaPct = totalPrevious > 0 ? (totalDelta / totalPrevious) * 100 : null;

        // Human-readable delta description
        const deltaText = (delta: number, pct: number | null) => {
          if (delta === 0) return "fără schimbare";
          const dir = delta > 0 ? "mai mult" : "mai puțin";
          if (pct != null) return `cu ${Math.abs(pct).toFixed(0)}% (${fmt(Math.abs(delta))} ${BASE_CURRENCY}) ${dir} în ${labels.current}`;
          return `cu ${fmt(Math.abs(delta))} ${BASE_CURRENCY} ${dir} în ${labels.current}`;
        };

        return (
          <div className="space-y-3">
            {comparison.map((c) => {
              const curW = Math.max((c.current / globalMax) * 100, 0.5);
              const prevW = Math.max((c.previous / globalMax) * 100, 0.5);
              const up = c.delta > 0;
              return (
                <Card key={c.category_id ?? "none"} className="overflow-hidden">
                  <CardContent className="py-3 px-4">
                    {/* Header: category name + delta phrase */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span className="flex items-center gap-2 text-sm font-medium min-w-0">
                        <span className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className={`text-xs shrink-0 ${
                        c.delta > 0 ? "text-red-500 dark:text-red-400" : c.delta < 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                      }`}>
                        {deltaText(c.delta, c.delta_pct)}
                      </span>
                    </div>

                    {/* Two bars */}
                    <div className="space-y-1.5">
                      {/* Current period bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground shrink-0 w-28 text-right">{labels.current}</span>
                        <div className="flex-1 h-7 bg-muted/40 rounded overflow-hidden relative">
                          <div
                            className="h-full rounded transition-all duration-500 flex items-center"
                            style={{ width: `${curW}%`, backgroundColor: c.color }}
                          >
                            {curW > 20 && (
                              <span className="px-2 text-[11px] font-bold text-white drop-shadow-sm truncate">
                                {fmt(c.current)} {BASE_CURRENCY}
                              </span>
                            )}
                          </div>
                          {curW <= 20 && (
                            <span className="absolute left-[calc(var(--w)+0.5rem)] top-1/2 -translate-y-1/2 text-[11px] font-semibold" style={{ "--w": `${curW}%` } as React.CSSProperties}>
                              {fmt(c.current)} {BASE_CURRENCY}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Previous period bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground shrink-0 w-28 text-right">{labels.previous}</span>
                        <div className="flex-1 h-7 bg-muted/40 rounded overflow-hidden relative">
                          <div
                            className="h-full rounded transition-all duration-500 flex items-center"
                            style={{ width: `${prevW}%`, backgroundColor: c.color, opacity: 0.35 }}
                          >
                            {prevW > 20 && (
                              <span className="px-2 text-[11px] font-bold text-white drop-shadow-sm truncate" style={{ opacity: 1 / 0.35 }}>
                                {fmt(c.previous)} {BASE_CURRENCY}
                              </span>
                            )}
                          </div>
                          {prevW <= 20 && (
                            <span className="absolute left-[calc(var(--w)+0.5rem)] top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground" style={{ "--w": `${prevW}%` } as React.CSSProperties}>
                              {fmt(c.previous)} {BASE_CURRENCY}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Total */}
            <Card className={`border-2 ${totalDelta > 0 ? "border-red-200 dark:border-red-900/50" : totalDelta < 0 ? "border-green-200 dark:border-green-900/50" : "border-border"}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="text-sm font-bold">Total</span>
                  <span className={`text-xs shrink-0 ${
                    totalDelta > 0 ? "text-red-500 dark:text-red-400" : totalDelta < 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                  }`}>
                    {deltaText(totalDelta, totalDeltaPct)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground shrink-0 w-28 text-right">{labels.current}</span>
                    <div className="flex-1 h-7 bg-muted/40 rounded overflow-hidden">
                      <div className="h-full rounded bg-foreground/70 transition-all duration-500 flex items-center" style={{ width: `${(totalCurrent / Math.max(totalCurrent, totalPrevious, 1)) * 100}%` }}>
                        <span className="px-2 text-[11px] font-bold text-background drop-shadow-sm">{fmt(totalCurrent)}{currLabel}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground shrink-0 w-28 text-right">{labels.previous}</span>
                    <div className="flex-1 h-7 bg-muted/40 rounded overflow-hidden">
                      <div className="h-full rounded bg-foreground/25 transition-all duration-500 flex items-center" style={{ width: `${(totalPrevious / Math.max(totalCurrent, totalPrevious, 1)) * 100}%` }}>
                        <span className="px-2 text-[11px] font-bold text-foreground">{fmt(totalPrevious)}{currLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })() : (
        <p className="text-sm text-muted-foreground text-center py-12">Nu sunt date pentru comparare</p>
      )}
    </div>
  );
}
