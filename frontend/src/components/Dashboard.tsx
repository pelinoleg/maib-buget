import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  ArrowUpCircle,
  Loader2,
  RotateCcw,
  X,
  FileDown,
  BarChart3,
  ArrowLeft,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FilterSidebar, { FilterPanel } from "@/components/FilterSidebar";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";
import {
  getDashboardSummary,
  getExpensesByCategory,
  getIncomeExpenseByMonth,
  getTopExpenses,
  getAccounts,
  getCategoryTrend,
} from "@/lib/api";
import PeriodPresetBar, { type FilterState } from "@/components/PeriodPresetBar";
import { type PeriodPresetKey, computeDatesForPreset, formatPresetLabel, PERIOD_PRESETS, PRESET_GROUPS } from "@/lib/periodPresets";
import { subDays, parseISO, format, differenceInCalendarDays } from "date-fns";
import { exportDashboardPDF } from "@/lib/pdf";
import { currencySymbol } from "@/lib/currency";
import { useChartEngine } from "@/lib/chartEngine";
import { LazyMuiDonutChart as MuiDonutChart, LazyMuiBarChart as MuiBarChart, LazyMuiSparkLine as MuiSparkLine } from "@/components/charts";

interface Summary {
  total_income: number;
  total_expense: number;
  total_refunds: number;
  total_transfers: number;
  net: number;
  transaction_count: number;
  currency?: string;
  currencies?: string[];
}

interface CategoryData {
  category_id: number | null;
  name: string;
  color: string;
  total: number;
  count: number;
  has_children?: boolean;
}

interface MonthData {
  month: string;
  income: number;
  expense: number;
  refund: number;
}

interface TopExpense {
  id: number;
  date: string;
  description: string;
  amount: number;
  original_amount: number;
  original_currency: string;
  category_name: string | null;
  note: string | null;
}





interface Account {
  id: number;
  name: string;
  currency: string;
  bank: string | null;
}

const BASE_CURRENCY = import.meta.env.VITE_BASE_CURRENCY || "EUR";
const BASE_SYMBOL = currencySymbol(BASE_CURRENCY);

/* eslint-disable @typescript-eslint/no-explicit-any */
function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const d = entry.payload;
  const val = d.total as number;
  const pct = entry.percent ?? d.percent;
  return (
    <div className="rounded-lg border bg-popover/95 backdrop-blur-sm px-3 py-2 shadow-lg text-sm z-10">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
        <span className="font-medium">{d.name}</span>
      </div>
      <div className="text-muted-foreground text-xs flex items-baseline gap-1.5">
        <span className="font-semibold text-foreground">
          {val.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {BASE_SYMBOL}
        </span>
        {pct != null && <span>({(pct * 100).toFixed(1)}%)</span>}
      </div>
    </div>
  );
}
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover/95 backdrop-blur-sm px-3 py-2 shadow-lg text-sm z-10">
      {label && <p className="text-xs text-muted-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-xs text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-xs">
            {(p.value as number).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {BASE_SYMBOL}
          </span>
        </div>
      ))}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
const DASH_LS_KEY = "dash_filters";

function loadDashFilters() {
  try { return JSON.parse(localStorage.getItem(DASH_LS_KEY) || "{}"); }
  catch { return {}; }
}

function getPreviousPeriod(from: string, to: string): { dateFrom: string; dateTo: string } {
  const fromDate = parseISO(from);
  const toDate = parseISO(to);
  const days = differenceInCalendarDays(toDate, fromDate) + 1;
  const prevTo = subDays(fromDate, 1);
  const prevFrom = subDays(prevTo, days - 1);
  return { dateFrom: format(prevFrom, "yyyy-MM-dd"), dateTo: format(prevTo, "yyyy-MM-dd") };
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { engine: chartEngine } = useChartEngine();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prevSummary, setPrevSummary] = useState<Summary | null>(null);
  const [prevByMonth, setPrevByMonth] = useState<MonthData[]>([]);
  const [byCategory, setByCategory] = useState<CategoryData[]>([]);
  const [byMonth, setByMonth] = useState<MonthData[]>([]);
  const [topExpenses, setTopExpenses] = useState<TopExpense[]>([]);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryVisible, setSummaryVisible] = useState<boolean>(() => {
    try { return localStorage.getItem("summaryCardsVisible") !== "false"; } catch { return true; }
  });

  // Top expenses — exclude categories (persisted)
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("dash_top_exclude");
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const toggleExcludeCategory = (name: string) => {
    setExcludedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      localStorage.setItem("dash_top_exclude", JSON.stringify([...next]));
      return next;
    });
  };

  // Category drill-down (stack for multi-level)
  const [drillStack, setDrillStack] = useState<{ id: number; name: string; color: string }[]>([]);
  const [drillData, setDrillData] = useState<CategoryData[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const drillParent = drillStack.length > 0 ? drillStack[drillStack.length - 1] : null;
  // Track chart height to prevent layout jumps
  const [chartMinHeight, setChartMinHeight] = useState<number | undefined>(undefined);

  // Category trend
  const [trendCategoryId, setTrendCategoryId] = useState<number | null>(null);
  const [trendCategoryName, setTrendCategoryName] = useState("");
  const [trendCategoryColor, setTrendCategoryColor] = useState("#94a3b8");
  const [trendData, setTrendData] = useState<{ month: string; total: number }[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const defaultPreset = (import.meta.env.VITE_DEFAULT_PERIOD || "last_month") as PeriodPresetKey;

  const saved = loadDashFilters();
  const initPreset = (saved.activePeriodPreset !== undefined ? saved.activePeriodPreset : defaultPreset) as PeriodPresetKey | null;
  const initOffset = (saved.presetOffset ?? 0) as number;
  const initDates = initPreset ? computeDatesForPreset(initPreset, initOffset) : { dateFrom: saved.dateFrom || "", dateTo: saved.dateTo || "" };

  const [accountId, setAccountId] = useState(saved.accountId || "");
  const [bankFilter, setBankFilter] = useState(saved.bankFilter || "");
  const [activePeriodPreset, setActivePeriodPreset] = useState<PeriodPresetKey | null>(initPreset);
  const [presetOffset, setPresetOffset] = useState(initOffset);
  const [dateFrom, setDateFrom] = useState(initDates.dateFrom);
  const [dateTo, setDateTo] = useState(initDates.dateTo);

  const handlePreset = (key: PeriodPresetKey | null, offset: number) => {
    setActivePeriodPreset(key);
    setPresetOffset(offset);
    if (key) {
      const { dateFrom: df, dateTo: dt } = computeDatesForPreset(key, offset);
      setDateFrom(df);
      setDateTo(dt);
    } else {
      setDateFrom("");
      setDateTo("");
    }
  };

  const handleApplySavedFilter = (filter: FilterState) => {
    setActivePeriodPreset(filter.periodPreset);
    setPresetOffset(filter.periodOffset);
    setDateFrom(filter.dateFrom);
    setDateTo(filter.dateTo);
    setAccountId(filter.accountId);
  };

  const baseParams = () => {
    const params: Record<string, string | number> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (accountId) params.account_id = accountId;
    if (bankFilter) params.bank = bankFilter;
    params.currency = BASE_CURRENCY;
    return params;
  };

  const drillInto = async (cat: CategoryData) => {
    // Capture current height to prevent jump
    const el = document.getElementById("category-chart-section");
    if (el) setChartMinHeight(el.offsetHeight);

    setDrillLoading(true);
    setDrillStack((prev) => [...prev, { id: cat.category_id!, name: cat.name, color: cat.color }]);
    setTrendCategoryId(null);
    try {
      const params = baseParams();
      params.parent_id = cat.category_id!;
      const data = await getExpensesByCategory(params);
      setDrillData(data);
    } catch { setDrillData([]); }
    setDrillLoading(false);
    // Release min height after transition
    setTimeout(() => setChartMinHeight(undefined), 300);
  };

  const drillBack = async () => {
    const el = document.getElementById("category-chart-section");
    if (el) setChartMinHeight(el.offsetHeight);

    const newStack = drillStack.slice(0, -1);
    setDrillStack(newStack);
    setTrendCategoryId(null);

    if (newStack.length === 0) {
      setDrillData([]);
    } else {
      setDrillLoading(true);
      try {
        const params = baseParams();
        params.parent_id = newStack[newStack.length - 1].id;
        const data = await getExpensesByCategory(params);
        setDrillData(data);
      } catch { setDrillData([]); }
      setDrillLoading(false);
    }
    setTimeout(() => setChartMinHeight(undefined), 300);
  };

  const reload = () => {
    const params = baseParams();

    setLoading(true);
    setPrevSummary(null);
    setPrevByMonth([]);
    setDrillStack([]);
    setDrillData([]);

    const promises: Promise<unknown>[] = [
      getDashboardSummary(params).then(setSummary),
      getExpensesByCategory(params).then(setByCategory),
      getIncomeExpenseByMonth(params).then(setByMonth),
      getTopExpenses(params, [...excludedCategories]).then(setTopExpenses),
    ];

    // Fetch previous period for comparison if date range is set
    if (dateFrom && dateTo) {
      const prev = getPreviousPeriod(dateFrom, dateTo);
      const prevParams: Record<string, string | number> = {
        date_from: prev.dateFrom,
        date_to: prev.dateTo,
      };
      if (accountId) prevParams.account_id = accountId;
      if (bankFilter) prevParams.bank = bankFilter;
      prevParams.currency = BASE_CURRENCY;
      promises.push(
        getDashboardSummary(prevParams).then(setPrevSummary),
        getIncomeExpenseByMonth(prevParams).then(setPrevByMonth),
      );
    }

    Promise.all(promises).catch(() => {}).finally(() => setLoading(false));
  };

  // Reload only top expenses when excluded categories change
  const reloadTopExpenses = () => {
    getTopExpenses(baseParams(), [...excludedCategories]).then(setTopExpenses).catch(() => {});
  };

  useEffect(() => {
    getAccounts().then(setAccounts);
  }, []);

  useEffect(reload, [dateFrom, dateTo, accountId, bankFilter]);
  useEffect(reloadTopExpenses, [excludedCategories]);

  const loadCategoryTrend = async (catId: number | null, name: string, color: string) => {
    if (catId === trendCategoryId) {
      setTrendCategoryId(null);
      return;
    }
    if (catId === null) return;
    setTrendCategoryId(catId);
    setTrendCategoryName(name);
    setTrendCategoryColor(color);
    setTrendLoading(true);
    try {
      const params: Record<string, string | number> = { category_id: catId, currency: BASE_CURRENCY };
      if (accountId) params.account_id = accountId;
      if (bankFilter) params.bank = bankFilter;
      const data = await getCategoryTrend(params);
      setTrendData(data);
    } catch {
      setTrendData([]);
    }
    setTrendLoading(false);
  };

  const fmt = (n: number) =>
    n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const currLabel = ` ${currencySymbol(BASE_CURRENCY)}`;

  // Persist filters
  useEffect(() => {
    localStorage.setItem(DASH_LS_KEY, JSON.stringify({
      accountId, bankFilter, activePeriodPreset, presetOffset, dateFrom, dateTo,
    }));
  }, [accountId, bankFilter, activePeriodPreset, presetOffset, dateFrom, dateTo]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const isDateModified = activePeriodPreset !== defaultPreset || presetOffset !== 0;
  const activeFilterCount = [accountId, bankFilter].filter(Boolean).length + (isDateModified ? 1 : 0);

  const resetAllFilters = () => {
    const def = computeDatesForPreset(defaultPreset, 0);
    setAccountId(""); setBankFilter("");
    setActivePeriodPreset(defaultPreset); setPresetOffset(0);
    setDateFrom(def.dateFrom); setDateTo(def.dateTo);
  };

  const activeChips = activeFilterCount > 0 ? (
    <>
      {accountId && (
        <Badge variant="secondary" className="gap-1 text-xs">
          {accounts.find(a => String(a.id) === accountId)?.name || "Cont"}
          <button onClick={() => setAccountId("")}><X className="h-3 w-3" /></button>
        </Badge>
      )}
      {bankFilter && (
        <Badge variant="secondary" className="gap-1 text-xs">
          {bankFilter.toUpperCase()}
          <button onClick={() => setBankFilter("")}><X className="h-3 w-3" /></button>
        </Badge>
      )}
      {isDateModified && (
        <Badge variant="secondary" className="gap-1 text-xs">
          {activePeriodPreset ? formatPresetLabel(activePeriodPreset, presetOffset) : `${dateFrom} — ${dateTo}`}
          <button onClick={() => { const def = computeDatesForPreset(defaultPreset, 0); setActivePeriodPreset(defaultPreset); setPresetOffset(0); setDateFrom(def.dateFrom); setDateTo(def.dateTo); }}><X className="h-3 w-3" /></button>
        </Badge>
      )}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={resetAllFilters}>
        <RotateCcw className="h-3 w-3 mr-1" /> Resetează
      </Button>
    </>
  ) : null;

  const filterContent = (
    <>
      {/* Date range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">De la</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setActivePeriodPreset(null); setPresetOffset(0); }}
            className={`${isDateModified ? "filter-active" : ""}`}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Până la</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setActivePeriodPreset(null); setPresetOffset(0); }}
            className={`${isDateModified ? "filter-active" : ""}`}
          />
        </div>
      </div>

      {/* Period presets */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Perioadă</span>
        {PRESET_GROUPS.map((group) => {
          const presets = PERIOD_PRESETS.filter((p) => p.group === group.key);
          return (
            <div key={group.key} className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase">{group.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.key}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      activePeriodPreset === p.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-accent border-border"
                    }`}
                    onClick={() => handlePreset(activePeriodPreset === p.key ? null : p.key, 0)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter selects */}
      <div className="space-y-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filtre</span>
        <div>
          <label className="text-[10px] text-muted-foreground">Cont</label>
          <Select value={accountId} onValueChange={(v) => setAccountId(v === "all" ? "" : v)}>
            <SelectTrigger className={`w-full ${accountId ? "filter-active" : ""}`}>
              <SelectValue placeholder="Toate conturile" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate conturile</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Bancă</label>
          <Select value={bankFilter} onValueChange={(v) => setBankFilter(v === "all" ? "" : v)}>
            <SelectTrigger className={`w-full ${bankFilter ? "filter-active" : ""}`}>
              <SelectValue placeholder="Toate băncile" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate băncile</SelectItem>
              {[...new Set(accounts.map(a => a.bank).filter(Boolean))].map((b) => (
                <SelectItem key={b!} value={b!}>{b!.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Reset */}

    </>
  );

  return (
    <div className="flex gap-6 items-start">
      <div className="flex-1 min-w-0 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="hidden md:block text-xl md:text-2xl font-bold">Tablou de bord</h1>
        <PeriodPresetBar
          activePreset={activePeriodPreset}
          presetOffset={presetOffset}
          onSelectPreset={handlePreset}
          currentFilters={{
            periodPreset: activePeriodPreset,
            periodOffset: presetOffset,
            dateFrom,
            dateTo,
            accountId,
            categoryId: "",
            type: "",
            search: "",
          }}
          onApplyFilter={handleApplySavedFilter}
        />
        <div className="flex items-center gap-1">
          {!loading && summary && (
            <Button
              variant="outline"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => exportDashboardPDF({
                dateFrom, dateTo, currency: BASE_CURRENCY,
                totalIncome: summary.total_income, totalExpense: summary.total_expense,
                totalTransfers: summary.total_transfers, net: summary.net,
                categories: byCategory, months: byMonth, topExpenses,
              })}
              title="Exportă PDF"
            >
              <FileDown className="h-4 w-4 mr-1" /> PDF
            </Button>
          )}
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={resetAllFilters}
              title="Resetează toate filtrele"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          <FilterSidebar open={filtersOpen} onOpenChange={setFiltersOpen} activeFilterCount={activeFilterCount} activeChips={activeChips}>
            {filterContent}
          </FilterSidebar>
        </div>
      </div>


      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Summary cards */}
      {!loading && summary && (
        <div>
          <button
            onClick={() => {
              const next = !summaryVisible;
              setSummaryVisible(next);
              try { localStorage.setItem("summaryCardsVisible", String(next)); } catch {}
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2 ml-auto"
          >
            {summaryVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {summaryVisible ? "Ascunde rezumat" : "Arată rezumat"}
          </button>
        {summaryVisible && <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(() => {
            const incDelta = prevSummary ? deltaPercent(summary.total_income, prevSummary.total_income) : null;
            const expDelta = prevSummary ? deltaPercent(summary.total_expense, prevSummary.total_expense) : null;
            const refDelta = prevSummary ? deltaPercent(summary.total_refunds, prevSummary.total_refunds) : null;

            const DeltaBadge = ({ delta, invertColor = false }: { delta: number | null; invertColor?: boolean }) => {
              if (delta === null) return null;
              const isUp = delta > 0;
              // For expenses: up = bad (red), down = good (green) — hence invertColor
              const isGood = invertColor ? !isUp : isUp;
              return (
                <span className={`text-xs font-medium ${isGood ? "text-green-600" : "text-red-500"}`}>
                  {isUp ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}%
                </span>
              );
            };

            return (
              <>
                <Card className={`py-0 ${summary.total_income === 0 ? "opacity-50 pointer-events-none" : ""}`}>
                  <CardContent className="px-2 sm:px-4 py-2 sm:py-3">
                    <div className="flex items-start gap-1.5 sm:gap-2.5">
                      <div className="p-1 sm:p-1.5 bg-green-100 rounded-md">
                        <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Venituri</p>
                        <p className="text-sm sm:text-lg font-bold text-green-600 truncate">+{fmt(summary.total_income)}{currLabel}</p>
                        <DeltaBadge delta={incDelta} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={`py-0 ${summary.total_expense === 0 ? "opacity-50 pointer-events-none" : ""}`}>
                  <CardContent className="px-2 sm:px-4 py-2 sm:py-3">
                    <div className="flex items-start gap-1.5 sm:gap-2.5">
                      <div className="p-1 sm:p-1.5 bg-red-100 rounded-md">
                        <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Cheltuieli</p>
                        <p className="text-sm sm:text-lg font-bold text-red-500 truncate">-{fmt(summary.total_expense)}{currLabel}</p>
                        <DeltaBadge delta={expDelta} invertColor />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={`py-0 hidden sm:block ${summary.total_refunds === 0 ? "opacity-50 pointer-events-none" : ""}`}>
                  <CardContent className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 bg-emerald-100 rounded-md">
                        <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Restituiri</p>
                        <p className="text-lg font-bold text-emerald-500 truncate">+{fmt(summary.total_refunds)}{currLabel}</p>
                        <DeltaBadge delta={refDelta} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={`py-0 hidden sm:block ${summary.total_transfers === 0 ? "opacity-50 pointer-events-none" : ""}`}>
                  <CardContent className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 bg-blue-100 rounded-md">
                        <ArrowLeftRight className="h-4 w-4 text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Transferuri</p>
                        <p className="text-lg font-bold text-blue-500 truncate">{fmt(summary.total_transfers)}{currLabel}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </div>}
        </div>
      )}

      {/* Expenses by category — donut + legend, full width */}
      {!loading && byCategory.length > 0 && (() => {
        const chartData = drillParent ? drillData : byCategory;
        const grandTotal = chartData.reduce((s, c) => s + c.total, 0);

        const navigateToCategory = (cat: CategoryData) => {
          const params = new URLSearchParams({ category_id: cat.category_id != null ? String(cat.category_id) : "none", type: "expense" });
          if (dateFrom) params.set("date_from", dateFrom);
          if (dateTo) params.set("date_to", dateTo);
          if (accountId) params.set("account_id", accountId);
          navigate(`/transactions?${params}`);
        };

        const handlePieClick = (_: unknown, index: number) => {
          const cat = chartData[index];
          if (cat?.has_children && cat.category_id !== drillParent?.id) drillInto(cat);
        };

        return (
          <Card id="category-chart-section" style={{ minHeight: chartMinHeight, transition: "min-height 0.3s ease" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 flex-wrap">
                {drillStack.length > 0 ? (
                  <>
                    <button onClick={drillBack} className="p-1 -ml-1 rounded hover:bg-accent transition-colors" title="Inapoi">
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setDrillStack([]); setDrillData([]); }} className="text-muted-foreground hover:text-foreground transition-colors">
                      Categorii
                    </button>
                    {drillStack.map((item, i) => (
                      <span key={item.id} className="flex items-center gap-1.5">
                        <span className="text-muted-foreground/50">›</span>
                        {i < drillStack.length - 1 ? (
                          <button
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            onClick={async () => {
                              const newStack = drillStack.slice(0, i + 1);
                              setDrillStack(newStack);
                              setDrillLoading(true);
                              try {
                                const params = baseParams();
                                params.parent_id = item.id;
                                const data = await getExpensesByCategory(params);
                                setDrillData(data);
                              } catch { setDrillData([]); }
                              setDrillLoading(false);
                            }}
                          >
                            {item.name}
                          </button>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                            {item.name}
                          </span>
                        )}
                      </span>
                    ))}
                  </>
                ) : (
                  "Cheltuieli pe categorii"
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {drillLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
              <div className="flex flex-col lg:flex-row items-center gap-8">
                <div className="w-full lg:w-[600px] lg:shrink-0 relative">
                  {chartEngine === "mui" ? (
                    <>
                      <div className="block lg:hidden">
                        <MuiDonutChart
                          data={chartData}
                          grandTotal={grandTotal}
                          centerLabel={drillParent ? drillParent.name : "total cheltuieli"}
                          height={340}
                          innerRadius={60}
                          outerRadius={145}
                          showLabels={false}
                          onPieClick={(i: number) => handlePieClick(null, i)}
                          formatValue={fmt}
                          currLabel={currLabel}
                        />
                      </div>
                      <div className="hidden lg:block">
                        <MuiDonutChart
                          data={chartData}
                          grandTotal={grandTotal}
                          centerLabel={drillParent ? drillParent.name : "total cheltuieli"}
                          height={500}
                          innerRadius={95}
                          outerRadius={180}
                          onPieClick={(i: number) => handlePieClick(null, i)}
                          formatValue={fmt}
                          currLabel={currLabel}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Mobile chart */}
                      <div className="block lg:hidden">
                        <ResponsiveContainer width="100%" height={340}>
                          <PieChart>
                            <Pie
                              data={chartData}
                              dataKey="total"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={145}
                              paddingAngle={1.5}
                              className="cursor-pointer"
                              onClick={handlePieClick}
                            >
                              {chartData.map((entry, index) => (
                                <Cell key={index} fill={entry.color} stroke="none" className="outline-none" />
                              ))}
                            </Pie>
                            <Tooltip content={<PieTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ height: 340 }}>
                          <div className="text-center">
                            <p className="text-xl font-bold">{fmt(grandTotal)}</p>
                            <p className="text-[10px] text-muted-foreground">{drillParent ? drillParent.name : "total cheltuieli"}</p>
                          </div>
                        </div>
                      </div>
                      {/* Desktop chart */}
                      <div className="hidden lg:block">
                        <ResponsiveContainer width="100%" height={470}>
                          <PieChart>
                            <Pie
                              data={chartData}
                              dataKey="total"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={95}
                              outerRadius={180}
                              paddingAngle={0.2}
                              label={({ name, percent, x, y, textAnchor }: { name?: string; percent?: number; x?: number; y?: number; textAnchor?: string }) =>
                                (percent ?? 0) > 0.04 ? (
                                  <text x={x} y={y} textAnchor={textAnchor as "start" | "middle" | "end"} dominantBaseline="central" className="fill-foreground text-xs">
                                    {name} {((percent ?? 0) * 100).toFixed(0)}%
                                  </text>
                                ) : null
                              }
                              labelLine={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeOpacity: 0.3 }}
                              className="cursor-pointer"
                              onClick={handlePieClick}
                            >
                              {chartData.map((entry, index) => (
                                <Cell key={index} fill={entry.color} stroke="none" className="outline-none" />
                              ))}
                            </Pie>
                            <Tooltip content={<PieTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="text-center">
                            <p className="text-2xl font-bold">{fmt(grandTotal)}</p>
                            <p className="text-xs text-muted-foreground">{drillParent ? drillParent.name : "total cheltuieli"}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  {chartData.map((cat) => {
                    const pct = grandTotal > 0 ? (cat.total / grandTotal) * 100 : 0;
                    return (
                      <div key={cat.category_id ?? "none"}>
                        <div
                          className={`flex items-center gap-2 cursor-pointer group py-0.5 rounded px-1 -mx-1 ${trendCategoryId === cat.category_id ? "bg-accent" : "hover:bg-accent/50"}`}
                          onClick={() => navigateToCategory(cat)}
                        >
                          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="text-sm truncate group-hover:underline">{cat.name}</span>
                          <span className="ml-auto text-sm font-mono tabular-nums shrink-0">{fmt(cat.total)}{currLabel}</span>
                          <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{pct.toFixed(0)}%</span>
                          {cat.has_children && (
                            <button
                              className="p-1 rounded transition-colors shrink-0 text-muted-foreground/40 hover:text-foreground hover:bg-accent"
                              title="Arată subcategorii"
                              onClick={(e) => { e.stopPropagation(); drillInto(cat); }}
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {cat.category_id != null ? (
                            <button
                              className={`p-1 rounded transition-colors shrink-0 ${trendCategoryId === cat.category_id ? "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40" : "text-muted-foreground/40 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"}`}
                              title="Tendință pe luni"
                              onClick={(e) => { e.stopPropagation(); loadCategoryTrend(cat.category_id, cat.name, cat.color); }}
                            >
                              <BarChart3 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <span className="p-1 shrink-0 w-[51px]" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t flex items-center justify-between text-sm font-semibold text-muted-foreground">
                    <span>Total</span>
                    <span className="font-mono tabular-nums">{fmt(grandTotal)}{currLabel}</span>
                  </div>

                  {/* Category trend chart */}
                  {trendCategoryId !== null && (
                    <div className="pt-3 border-t">
                      <p className="text-xs font-medium mb-2">
                        Tendință: <span style={{ color: trendCategoryColor }}>{trendCategoryName}</span>
                      </p>
                      {trendLoading ? (
                        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                      ) : trendData.length > 0 ? (
                        chartEngine === "mui" ? (
                          <MuiSparkLine
                            data={trendData.map((d: { total: number }) => d.total)}
                            labels={trendData.map((d: { month: string }) => d.month)}
                            height={120}
                            color={trendCategoryColor}
                            tooltipFormatter={(v: number) => v.toLocaleString("ro-RO", { minimumFractionDigits: 2 })}
                          />
                        ) : (
                          <ResponsiveContainer width="100%" height={120}>
                            <LineChart data={trendData}>
                              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} width={50} />
                              <Tooltip content={<ChartTooltip />} />
                              <Line type="monotone" dataKey="total" stroke={trendCategoryColor} strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        )
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">Nu sunt date</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {!loading && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Expense by month — area chart with net line */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Venituri vs Cheltuieli pe luni
              {activePeriodPreset && (
                <span className="text-sm font-normal text-muted-foreground">
                  {formatPresetLabel(activePeriodPreset, presetOffset)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {byMonth.length > 0 ? (
              chartEngine === "mui" ? (
                <MuiBarChart
                  data={byMonth}
                  height={280}
                  onBarClick={(month: string) => {
                    const [y, m] = month.split("-");
                    const params = new URLSearchParams({
                      date_from: `${y}-${m}-01`,
                      date_to: `${y}-${m}-${new Date(parseInt(y), parseInt(m), 0).getDate()}`,
                    });
                    if (accountId) params.set("account_id", accountId);
                    navigate(`/transactions?${params}`);
                  }}
                />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={byMonth}
                    className="cursor-pointer"
                    onClick={(e) => {
                      if (e?.activeLabel) {
                        const [y, m] = String(e.activeLabel).split("-");
                        const params = new URLSearchParams({
                          date_from: `${y}-${m}-01`,
                          date_to: `${y}-${m}-${new Date(parseInt(y), parseInt(m), 0).getDate()}`,
                        });
                        if (accountId) params.set("account_id", accountId);
                        navigate(`/transactions?${params}`);
                      }
                    }}
                  >
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend content={() => (
                      <div className="flex items-center justify-center gap-4 mt-2 text-sm">
                        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#22c55e" }} />Venituri</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#ef4444" }} />Cheltuieli</span>
                      </div>
                    )} />
                    <Bar dataKey="income" name="Venituri" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Cheltuieli" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )
            ) : (
              <p className="text-muted-foreground text-center py-8">Nu sunt date</p>
            )}
            {prevByMonth.length > 0 && prevSummary && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs text-muted-foreground mb-2">Perioada anterioară:</p>
                <div className="flex gap-4 text-xs">
                  <span className="flex items-center gap-1 text-green-600">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#22c55e" }} />
                    Venituri: +{fmt(prevSummary.total_income)}{currLabel}
                  </span>
                  <span className="flex items-center gap-1 text-red-500">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#ef4444" }} />
                    Cheltuieli: -{fmt(prevSummary.total_expense)}{currLabel}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top expenses */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Top cheltuieli
              {activePeriodPreset && (
                <span className="text-sm font-normal text-muted-foreground">
                  {formatPresetLabel(activePeriodPreset, presetOffset)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              // Top 5 expense categories + any currently excluded (so user can un-exclude)
              const top5 = byCategory.slice(0, 5).map((c) => c.name);
              const categoryNames = [...new Set([...top5, ...excludedCategories])];
              return (
                <>
                  {categoryNames.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {categoryNames.map((name) => {
                        const isExcluded = excludedCategories.has(name);
                        return (
                          <button
                            key={name}
                            onClick={() => toggleExcludeCategory(name)}
                            className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                              isExcluded
                                ? "bg-muted text-muted-foreground line-through border-transparent"
                                : "bg-background text-foreground border-border hover:bg-accent"
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {topExpenses.length > 0 ? (
                    <div className="space-y-2">
                      {topExpenses.map((t, i) => (
                        <div key={t.id} className="flex items-center gap-3 text-sm">
                          <span className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </span>
                          <div className="flex-1 truncate">
                            <p className="font-medium truncate">{t.description}</p>
                            {t.note && <p className="text-xs text-amber-600 dark:text-amber-400 truncate">{t.note}</p>}
                            <p className="text-xs text-muted-foreground">
                              {t.date} {t.category_name && `\u2022 ${t.category_name}`}
                            </p>
                          </div>
                          <span className="font-mono font-semibold text-red-500">
                            -{fmt(t.amount)}{currLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">Nu sunt date</p>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>

      </div>}

      </div>
      <FilterPanel activeChips={activeChips}>{filterContent}</FilterPanel>
    </div>
  );
}
