import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Loader2, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, XCircle, CalendarClock, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { useChartEngine } from "@/lib/chartEngine";
import { LazyMuiAreaChart as MuiAreaChart } from "@/components/charts";
import {
  getExchangeRates,
  getExchangeRatesSummary,
  syncExchangeRates,
  checkTomorrowRates,
  getTransactions,
} from "@/lib/api";

interface RateRow {
  date: string;
  currencies: Record<string, number>;
}

interface Summary {
  total_dates: number;
  min_date: string | null;
  max_date: string | null;
  today_date: string | null;
  today_rates: Record<string, number>;
  prev_rates: Record<string, number>;
  last_sync: string | null;
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "chiar acum";
  if (mins < 60) return `${mins} min în urmă`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "oră" : "ore"} în urmă`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "zi" : "zile"} în urmă`;
}

const MONTH_NAMES = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];

const DAY_HEADERS = ["L", "M", "M", "J", "V", "S", "D"];

type ChartPeriod = "7d" | "30d" | "6m" | "1y" | "all";
const CHART_PERIODS: { key: ChartPeriod; label: string }[] = [
  { key: "7d", label: "7 zile" },
  { key: "30d", label: "30 zile" },
  { key: "6m", label: "6 luni" },
  { key: "1y", label: "1 an" },
  { key: "all", label: "Tot" },
];

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

function periodDateFrom(period: ChartPeriod, minDate: string | null): string {
  const now = new Date();
  let d: Date;
  switch (period) {
    case "7d": d = new Date(now.getTime() - 7 * 86400000); break;
    case "30d": d = new Date(now.getTime() - 30 * 86400000); break;
    case "6m": d = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
    case "1y": d = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
    case "all": return minDate || "2023-01-01";
  }
  return d.toISOString().slice(0, 10);
}

function perPageForPeriod(period: ChartPeriod): number {
  switch (period) {
    case "7d": return 10;
    case "30d": return 35;
    case "6m": return 200;
    case "1y": return 370;
    case "all": return 1200;
  }
}

export default function ExchangeRates() {
  const { engine: chartEngine } = useChartEngine();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");

  // Calendar
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Tomorrow's rates
  const [tomorrow, setTomorrow] = useState<{
    available: boolean;
    date?: string;
    rates?: Record<string, { rate: number; delta: number | null }>;
  } | null>(null);
  const [checkingTomorrow, setCheckingTomorrow] = useState(false);

  // Salary overlay
  interface IncomeEntry { transaction_date: string; amount: number; account_currency: string; description: string }
  const [showSalary, setShowSalary] = useState(false);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);

  // Charts
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("7d");
  const [chartData, setChartData] = useState<RateRow[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try { setSummary(await getExchangeRatesSummary()); } catch { /* ignore */ }
  }, []);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    try {
      const [y, m] = viewMonth.split("-").map(Number);
      const dateFrom = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const dateTo = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const data = await getExchangeRates({ page: 1, per_page: 31, date_from: dateFrom, date_to: dateTo });
      setRows(data.rates ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [viewMonth]);

  const fetchChartData = useCallback(async () => {
    setChartLoading(true);
    try {
      const dateFrom = periodDateFrom(chartPeriod, summary?.min_date ?? null);
      const data = await getExchangeRates({
        page: 1,
        per_page: perPageForPeriod(chartPeriod),
        date_from: dateFrom,
      });
      setChartData(data.rates ?? []);
    } catch { /* ignore */ } finally { setChartLoading(false); }
  }, [chartPeriod, summary?.min_date]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchRates(); }, [fetchRates]);
  useEffect(() => { fetchChartData(); }, [fetchChartData]);

  // Fetch income transactions for salary overlay
  useEffect(() => {
    if (!showSalary) return;
    const [y, m] = viewMonth.split("-").map(Number);
    const dateFrom = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const dateTo = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    getTransactions({ type: "income", date_from: dateFrom, date_to: dateTo, include_transfers: false, limit: 200 })
      .then((data: { transactions: IncomeEntry[] }) => setIncomes(data.transactions))
      .catch(() => {});
  }, [showSalary, viewMonth]);

  const fetchTomorrow = useCallback(async () => {
    try { setTomorrow(await checkTomorrowRates()); } catch { /* ignore */ }
  }, []);

  // Check tomorrow on mount + every hour
  useEffect(() => {
    fetchTomorrow();
    const id = setInterval(fetchTomorrow, 3600_000);
    return () => clearInterval(id);
  }, [fetchTomorrow]);

  const handleCheckTomorrow = async () => {
    setCheckingTomorrow(true);
    try { setTomorrow(await checkTomorrowRates()); } catch { /* ignore */ }
    finally { setCheckingTomorrow(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult("");
    try {
      const result = await syncExchangeRates({ currencies: ["EUR", "USD"] });
      setSyncResult(result.synced_dates > 0 ? `+${result.synced_dates} zile noi` : "Totul e la zi");
      await Promise.all([fetchSummary(), fetchRates(), fetchChartData()]);
      setTimeout(() => setSyncResult(""), 4000);
    } catch {
      setSyncResult("BNM indisponibil");
      setTimeout(() => setSyncResult(""), 4000);
    } finally { setSyncing(false); }
  };

  const goMonth = (delta: number) => {
    const [y, m] = viewMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const [viewY, viewM] = viewMonth.split("-").map(Number);
  const monthLabel = `${MONTH_NAMES[viewM - 1]} ${viewY}`;
  const now = new Date();
  const isCurrentMonth = viewY === now.getFullYear() && viewM === now.getMonth() + 1;

  const ratesByDate = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const r of rows) map[r.date] = r.currencies;
    return map;
  }, [rows]);

  // Income grouped by date
  const incomeByDate = useMemo(() => {
    const map: Record<string, IncomeEntry[]> = {};
    for (const inc of incomes) {
      (map[inc.transaction_date] ??= []).push(inc);
    }
    return map;
  }, [incomes]);

  // Income summary with MDL conversion
  const incomeSummary = useMemo(() => {
    if (!showSalary || incomes.length === 0) return [];
    return incomes.map((inc) => {
      const cur = inc.account_currency;
      const rate = cur === "MDL" ? 1 : ratesByDate[inc.transaction_date]?.[cur];
      const amountMdl = rate ? inc.amount * rate : null;
      return { ...inc, rate, amountMdl };
    });
  }, [incomes, ratesByDate, showSalary]);

  const calendarWeeks = useMemo(() => {
    const firstDay = new Date(viewY, viewM - 1, 1);
    const lastDay = new Date(viewY, viewM, 0).getDate();
    const startCol = (firstDay.getDay() + 6) % 7;
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = Array(startCol).fill(null);
    for (let d = 1; d <= lastDay; d++) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }, [viewY, viewM]);

  // Chart data: sorted ascending for the line chart
  const chartEurUsd = useMemo(() =>
    [...chartData]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: r.date,
        label: chartPeriod === "all" || chartPeriod === "1y"
          ? r.date.slice(2, 7).split("-").reverse().join(".") // mm.yy
          : fmtDate(r.date).slice(0, 5), // dd.mm
        EUR: r.currencies?.EUR,
        USD: r.currencies?.USD,
      })),
    [chartData, chartPeriod],
  );

  const eurRate = summary?.today_rates?.EUR;
  const usdRate = summary?.today_rates?.USD;
  const eurPrev = summary?.prev_rates?.EUR;
  const usdPrev = summary?.prev_rates?.USD;
  const eurTrend = eurRate && eurPrev ? eurRate - eurPrev : 0;
  const usdTrend = usdRate && usdPrev ? usdRate - usdPrev : 0;

  // Tick formatter for charts — show fewer labels
  const tickInterval = chartPeriod === "7d" ? 0 : chartPeriod === "30d" ? 4 : chartPeriod === "6m" ? 25 : chartPeriod === "1y" ? 50 : 100;

  // Freshness: based on max_date (last rate in DB) relative to today
  const freshness = useMemo(() => {
    if (!summary?.max_date) return { level: "red" as const, label: "Nu sunt date", daysAgo: Infinity };
    const maxD = new Date(summary.max_date);
    const daysAgo = Math.floor((now.getTime() - maxD.getTime()) / 86400000);
    if (daysAgo <= 3) return { level: "green" as const, label: `Actualizat · ${fmtDate(summary.max_date)}`, daysAgo };
    if (daysAgo <= 7) return { level: "amber" as const, label: `${daysAgo} zile în urmă · ${fmtDate(summary.max_date)}`, daysAgo };
    return { level: "red" as const, label: `${daysAgo} zile în urmă · ${fmtDate(summary.max_date)}`, daysAgo };
  }, [summary?.max_date]);

  const freshnessColors = {
    green: "text-green-600 dark:text-green-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-500 dark:text-red-400",
  };
  const FreshnessIcon = freshness.level === "green" ? CheckCircle2 : freshness.level === "amber" ? AlertTriangle : XCircle;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-lg md:text-2xl font-bold">Cursuri valutare BNM</h1>

      {/* Latest rates */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground font-medium">EUR / MDL</p>
              {summary?.today_date && <p className="text-[10px] text-muted-foreground">{fmtDate(summary.today_date)}</p>}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tabular-nums">{eurRate ? eurRate.toFixed(4) : "—"}</span>
              {eurTrend !== 0 && (
                <span className={`flex items-center gap-0.5 text-[10px] font-medium ${eurTrend > 0 ? "text-green-600" : "text-red-500"}`}>
                  {eurTrend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {eurTrend > 0 ? "+" : ""}{eurTrend.toFixed(4)}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground font-medium">USD / MDL</p>
              {summary?.today_date && <p className="text-[10px] text-muted-foreground">{fmtDate(summary.today_date)}</p>}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tabular-nums">{usdRate ? usdRate.toFixed(4) : "—"}</span>
              {usdTrend !== 0 && (
                <span className={`flex items-center gap-0.5 text-[10px] font-medium ${usdTrend > 0 ? "text-green-600" : "text-red-500"}`}>
                  {usdTrend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {usdTrend > 0 ? "+" : ""}{usdTrend.toFixed(4)}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tomorrow's rates banner */}
      {tomorrow?.available && tomorrow.rates && (
        <div className="flex items-center gap-2 md:gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 px-3 md:px-4 py-2">
          <CalendarClock className="h-4 w-4 text-blue-500 shrink-0" />
          <div className="flex-1 flex items-center gap-2.5 md:gap-4 flex-wrap text-sm">
            <span className="text-[10px] md:text-xs font-medium text-blue-600 dark:text-blue-400">{fmtDate(tomorrow.date!)}</span>
            {Object.entries(tomorrow.rates).map(([cur, { rate, delta }]) => (
              <span key={cur} className="flex items-center gap-1 md:gap-1.5 tabular-nums text-xs md:text-sm">
                <span className="text-[10px] md:text-xs text-muted-foreground">{cur}</span>
                <span className="font-semibold">{rate.toFixed(4)}</span>
                {delta !== null && delta !== 0 && (
                  <span className={`text-[10px] font-medium ${delta > 0 ? "text-green-600" : "text-red-500"}`}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(4)}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tomorrow check button (when not available yet) */}
      {tomorrow && !tomorrow.available && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          <span>Cursul următor nu este publicat încă</span>
          <Button variant="ghost" size="sm" className="h-5 px-1.5 gap-1 text-[11px]" onClick={handleCheckTomorrow} disabled={checkingTomorrow}>
            {checkingTomorrow ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Verifică
          </Button>
        </div>
      )}

      {/* Info line */}
      <div className="flex items-center gap-1.5 md:gap-2 flex-wrap text-[10px] md:text-[11px] text-muted-foreground">
        <FreshnessIcon className={`h-3 w-3 md:h-3.5 md:w-3.5 ${freshnessColors[freshness.level]}`} />
        <span className={freshnessColors[freshness.level]}>{freshness.label}</span>
        {summary?.last_sync ? <span className="hidden sm:inline">· sincronizat {timeAgo(summary.last_sync)}</span> : null}
        {summary?.total_dates ? <span className="hidden sm:inline">· {summary.total_dates} zile în bază</span> : null}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="h-5 px-1.5 gap-1 text-[10px] md:text-[11px]" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          <span className="hidden sm:inline">Actualizează</span>
        </Button>
        {syncResult && <span>{syncResult}</span>}
      </div>

      {/* Two-column: Calendar left, Charts right (desktop) / stacked (mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        {/* Calendar */}
        <Card>
          <CardContent className="p-2.5 md:p-4">
            {/* Calendar header — stacks controls on mobile */}
            <div className="flex items-center gap-1.5 md:gap-2 mb-3 md:mb-4">
              <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8 shrink-0" onClick={() => goMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(e.target.value)}
                className="text-sm md:text-base font-semibold text-center bg-transparent border-none cursor-pointer focus:outline-none min-w-0"
              >
                {(() => {
                  const options: { value: string; label: string }[] = [];
                  const startY = summary?.min_date ? parseInt(summary.min_date.slice(0, 4)) : now.getFullYear() - 2;
                  for (let y = startY; y <= now.getFullYear(); y++) {
                    const maxM = y === now.getFullYear() ? now.getMonth() + 1 : 12;
                    for (let m = 1; m <= maxM; m++) {
                      const val = `${y}-${String(m).padStart(2, "0")}`;
                      options.push({ value: val, label: `${MONTH_NAMES[m - 1]} ${y}` });
                    }
                  }
                  return options.reverse().map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ));
                })()}
              </select>
              <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8 shrink-0" onClick={() => goMonth(1)} disabled={isCurrentMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!isCurrentMonth && (
                <Button variant="ghost" size="sm" className="text-xs h-6 md:h-7 px-1.5 md:ml-1 shrink-0" onClick={() => {
                  setViewMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
                }}>
                  Astăzi
                </Button>
              )}
              <span className="flex-1" />
              <label className="flex items-center gap-1 md:gap-1.5 cursor-pointer text-[11px] md:text-xs text-muted-foreground select-none shrink-0">
                <input
                  type="checkbox"
                  checked={showSalary}
                  onChange={(e) => setShowSalary(e.target.checked)}
                  className="rounded h-3.5 w-3.5"
                />
                <Wallet className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Venituri</span>
              </label>
            </div>

            <div className={`transition-opacity duration-150 ${loading ? "opacity-40" : ""}`}>
                <div className="grid grid-cols-7 mb-1">
                  {DAY_HEADERS.map((d, i) => (
                    <div key={`${d}-${i}`} className={`text-center text-[10px] md:text-xs font-medium py-0.5 md:py-1 ${i >= 5 ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-0.5 md:gap-1.5 bg-muted/50 dark:bg-muted/20 rounded-lg md:rounded-xl p-1 md:p-1.5">
                  {calendarWeeks.flat().map((day, idx) => {
                    if (day === null) {
                      return <div key={`e-${idx}`} className="min-h-[44px] md:min-h-[60px]" />;
                    }

                    const dateStr = `${viewY}-${String(viewM).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const rates = ratesByDate[dateStr];
                    const dayIncomes = showSalary ? incomeByDate[dateStr] : undefined;
                    const isWeekend = idx % 7 >= 5;
                    const isToday = viewY === now.getFullYear() && viewM === now.getMonth() + 1 && day === now.getDate();
                    const hasData = !!rates;

                    return (
                      <div
                        key={dateStr}
                        className={`p-1 md:p-1.5 min-h-[44px] md:min-h-[60px] rounded-md md:rounded-lg flex flex-col gap-0.5 transition-colors ${
                          isToday ? "bg-white dark:bg-card ring-2 ring-amber-400 dark:ring-amber-600"
                            : isWeekend ? "bg-white/60 dark:bg-card/40"
                              : "bg-white dark:bg-card"
                        }`}
                      >
                        <span className={`text-[10px] md:text-xs leading-none ${
                          isToday ? "text-amber-700 dark:text-amber-300 font-bold"
                            : isWeekend ? "text-muted-foreground/50"
                              : "text-muted-foreground"
                        }`}>
                          {day}
                        </span>
                        {hasData && (
                          <div className="mt-auto tabular-nums leading-tight">
                            <div className="text-[10px] md:text-xs">
                              <span className="text-[8px] md:text-[10px] text-muted-foreground/60">€</span>
                              <span className="font-medium">{rates.EUR?.toFixed(2)}</span>
                            </div>
                            <div className="text-[10px] md:text-xs text-muted-foreground">
                              <span className="text-[8px] md:text-[10px] text-muted-foreground/40">$</span>
                              {rates.USD?.toFixed(2)}
                            </div>
                          </div>
                        )}
                        {dayIncomes && dayIncomes.length > 0 && (
                          <div className="mt-0.5">
                            {dayIncomes.map((inc, i) => (
                              <div key={i} className="text-[8px] md:text-[10px] font-medium text-green-600 dark:text-green-400 truncate leading-tight">
                                +{inc.amount.toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {inc.account_currency}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
            </div>
          </CardContent>
        </Card>

        {/* Charts */}
        <Card>
          <CardContent className="p-3">
            {/* Period selector — scrollable on mobile */}
            <div className="flex items-center gap-1 mb-3 overflow-x-auto">
              {CHART_PERIODS.map((p) => (
                <Button
                  key={p.key}
                  variant={chartPeriod === p.key ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-[11px] shrink-0"
                  onClick={() => setChartPeriod(p.key)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            {chartLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : chartEurUsd.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nu sunt date pentru perioada selectată.</p>
            ) : (
              <div className="space-y-4">
                {/* EUR chart */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">EUR / MDL</p>
                  {chartEngine === "mui" ? (
                    <MuiAreaChart
                      data={chartEurUsd}
                      height={130}
                      dataKey="EUR"
                      color="#6366f1"
                      tickInterval={tickInterval}
                      tooltipLabel="EUR"
                      formatTooltip={(v) => v.toFixed(4)}
                    />
                  ) : (
                    <ResponsiveContainer width="100%" height={130}>
                      <AreaChart data={chartEurUsd}>
                        <defs>
                          <linearGradient id="eurGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={tickInterval} axisLine={false} tickLine={false} />
                        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9 }} width={38} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(2)} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)" }}
                          formatter={(v: number | undefined) => v != null ? [v.toFixed(4), "EUR"] : ""}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? fmtDate(payload[0].payload.date) : ""}
                        />
                        <Area type="linear" dataKey="EUR" stroke="#6366f1" strokeWidth={1.5} fill="url(#eurGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* USD chart */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">USD / MDL</p>
                  {chartEngine === "mui" ? (
                    <MuiAreaChart
                      data={chartEurUsd}
                      height={130}
                      dataKey="USD"
                      color="#10b981"
                      tickInterval={tickInterval}
                      tooltipLabel="USD"
                      formatTooltip={(v) => v.toFixed(4)}
                    />
                  ) : (
                    <ResponsiveContainer width="100%" height={130}>
                      <AreaChart data={chartEurUsd}>
                        <defs>
                          <linearGradient id="usdGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={tickInterval} axisLine={false} tickLine={false} />
                        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9 }} width={38} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(2)} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)" }}
                          formatter={(v: number | undefined) => v != null ? [v.toFixed(4), "USD"] : ""}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? fmtDate(payload[0].payload.date) : ""}
                        />
                        <Area type="linear" dataKey="USD" stroke="#10b981" strokeWidth={1.5} fill="url(#usdGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Income summary with MDL conversion */}
      {showSalary && incomeSummary.length > 0 && (
        <Card>
          <CardContent className="p-3 md:p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-green-600" />
              Venituri — {monthLabel}
            </h3>
            <div className="space-y-2">
              {incomeSummary.map((inc, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground shrink-0">{fmtDate(inc.transaction_date)}</span>
                    <span className="truncate text-muted-foreground text-xs sm:text-sm" title={inc.description}>{inc.description}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 sm:ml-auto shrink-0">
                    <span className="font-medium text-green-600 tabular-nums text-xs sm:text-sm">
                      +{inc.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} {inc.account_currency}
                    </span>
                    {inc.amountMdl !== null && (
                      <span className="text-[10px] sm:text-xs text-muted-foreground tabular-nums">
                        ≈ {inc.amountMdl!.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} MDL
                        <span className="text-[10px] ml-1 hidden sm:inline">({inc.rate!.toFixed(4)})</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {/* Total */}
              {(() => {
                const totalMdl = incomeSummary.reduce((s, inc) => s + (inc.amountMdl ?? 0), 0);
                const byCurrency: Record<string, number> = {};
                for (const inc of incomeSummary) byCurrency[inc.account_currency] = (byCurrency[inc.account_currency] ?? 0) + inc.amount;
                return (
                  <div className="border-t pt-2 mt-2 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 text-sm">
                    <span className="text-xs text-muted-foreground shrink-0">Total</span>
                    <div className="flex items-center gap-2 sm:gap-3 sm:ml-auto">
                      <span className="font-semibold text-green-600 tabular-nums text-xs sm:text-sm">
                        {Object.entries(byCurrency).map(([cur, sum]) => `+${sum.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} ${cur}`).join(" / ")}
                      </span>
                      {totalMdl > 0 && (
                        <span className="text-[10px] sm:text-xs font-medium tabular-nums">
                          ≈ {totalMdl.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} MDL
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
