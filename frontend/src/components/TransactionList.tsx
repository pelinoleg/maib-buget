import { useState, useEffect, useRef } from "react";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Download,
  FileDown,
  X,
  MessageSquareMore,
  Check,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  CheckSquare,
  Scissors,
  Pencil,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import FilterSidebar, { FilterPanel } from "@/components/FilterSidebar";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelectItems } from "@/components/categories/CategorySelect";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getTransactions,
  getAccounts,
  getCategories,
  updateTransactionCategory,
  updateTransactionNote,
  deleteTransaction,
  deleteTransactionsBulk,
  splitTransaction,
  updateTransaction,
} from "@/lib/api";
import { useSearchParams, Link } from "react-router-dom";
import PeriodPresetBar, { type FilterState } from "@/components/PeriodPresetBar";
import { type PeriodPresetKey, computeDatesForPreset, formatPresetLabel, PERIOD_PRESETS, PRESET_GROUPS } from "@/lib/periodPresets";
import { getSavedFilters, createSavedFilter, deleteSavedFilter } from "@/lib/api";
import { downloadCSV } from "@/lib/csv";
import { exportTransactionsPDF } from "@/lib/pdf";

interface Transaction {
  id: number;
  account_id: number;
  account_number: string;
  account_currency: string;
  bank: string | null;
  transaction_date: string;
  processing_date: string;
  description: string;
  original_amount: number;
  original_currency: string;
  amount: number;
  type: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  balance_after: number | null;
  commission: number;
  is_transfer: boolean;
  source_file: string;
  note: string | null;
}

interface Account {
  id: number;
  account_number: string;
  currency: string;
  name: string;
  bank: string | null;
}

interface Category {
  id: number;
  name: string;
  color: string;
  parent_id: number | null;
  subcategories?: Category[];
}

const TYPE_OPTIONS = [
  { value: "expense", label: "Cheltuială" },
  { value: "income", label: "Venit" },
  { value: "transfer", label: "Transfer" },
  { value: "refund", label: "Restituire" },
  { value: "cancelled", label: "Anulare" },
];

const PAGE_SIZE = Number(import.meta.env.VITE_PAGE_SIZE) || 50;
const BASE_CURRENCY = import.meta.env.VITE_BASE_CURRENCY || "EUR";
const LS_KEY = "txn_filters";
const DEBOUNCE_MS = 300;

function loadSavedFilters() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch { return {}; }
}

export default function TransactionList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [sumIncome, setSumIncome] = useState(0);
  const [sumExpense, setSumExpense] = useState(0);
  const [sumTransfers, setSumTransfers] = useState(0);
  const [sumRefunds, setSumRefunds] = useState(0);
  const [page, setPage] = useState(0);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | "bulk" | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [splitTarget, setSplitTarget] = useState<Transaction | null>(null);
  const [splitDesc, setSplitDesc] = useState("");
  const [splitAmount, setSplitAmount] = useState("");
  const [splitType, setSplitType] = useState("");
  const [splitCategoryId, setSplitCategoryId] = useState("");
  const [splitNote, setSplitNote] = useState("");
  const [splitSaving, setSplitSaving] = useState(false);
  const [splitError, setSplitError] = useState("");
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);
  const [editFields, setEditFields] = useState({
    accountId: "", type: "", transactionDate: "", processingDate: "",
    description: "", amount: "", categoryId: "", note: "",
    originalAmount: "", originalCurrency: "",
  });
  const [editShowDetails, setEditShowDetails] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  // If URL has params (from dashboard drill-down), use them; otherwise default from env
  const hasUrlParams = searchParams.toString() !== "";
  const saved = hasUrlParams ? {} : loadSavedFilters();
  const defaultPreset = (import.meta.env.VITE_DEFAULT_PERIOD || "last_month") as PeriodPresetKey;
  const [search, setSearch] = useState(searchParams.get("search") || saved.search || "");
  const [accountFilter, setAccountFilter] = useState(searchParams.get("account_id") || saved.accountFilter || "");
  const [bankFilter, setBankFilter] = useState(searchParams.get("bank") || saved.bankFilter || "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || saved.typeFilter || "");
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category_id") || saved.categoryFilter || "");
  const savedPreset = (saved.activePeriodPreset !== undefined ? saved.activePeriodPreset : defaultPreset) as PeriodPresetKey | null;
  const savedOffset = (saved.presetOffset ?? 0) as number;
  const savedDates = savedPreset ? computeDatesForPreset(savedPreset, savedOffset) : { dateFrom: saved.dateFrom || "", dateTo: saved.dateTo || "" };

  const [dateFrom, setDateFrom] = useState(searchParams.get("date_from") || (hasUrlParams ? "" : savedDates.dateFrom));
  const [dateTo, setDateTo] = useState(searchParams.get("date_to") || (hasUrlParams ? "" : savedDates.dateTo));
  const [sortBy, setSortBy] = useState<string>(saved.sortBy || "");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [includeTransfers] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [activePeriodPreset, setActivePeriodPreset] = useState<PeriodPresetKey | null>(hasUrlParams ? null : savedPreset);
  const [presetOffset, setPresetOffset] = useState(hasUrlParams ? 0 : savedOffset);

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
    setPage(0);
  };

  const handleApplySavedFilter = (filter: FilterState) => {
    setActivePeriodPreset(filter.periodPreset);
    setPresetOffset(filter.periodOffset);
    setDateFrom(filter.dateFrom);
    setDateTo(filter.dateTo);
    setAccountFilter(filter.accountId);
    setCategoryFilter(filter.categoryId);
    setTypeFilter(filter.type);
    setSearch(filter.search);
    setPage(0);
  };

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({
      search, accountFilter, bankFilter, typeFilter, categoryFilter, sortBy,
      activePeriodPreset, presetOffset, dateFrom, dateTo,
    }));
  }, [search, accountFilter, bankFilter, typeFilter, categoryFilter, sortBy, activePeriodPreset, presetOffset, dateFrom, dateTo]);

  useEffect(() => {
    getAccounts().then(setAccounts);
    getCategories().then(setCategories);
    // Clear URL params after reading them
    if (searchParams.toString()) setSearchParams({}, { replace: true });
  }, []);

  const buildFilterParams = () => {
    const params: Record<string, string | number | boolean> = {
      include_transfers: includeTransfers,
    };
    if (search) params.search = search;
    if (accountFilter) params.account_id = accountFilter;
    if (bankFilter) params.bank = bankFilter;
    if (typeFilter) params.type = typeFilter;
    if (categoryFilter) params.category_id = categoryFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (sortBy) params.sort = sortBy;
    return params;
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = buildFilterParams();
      if (!showAll) {
        params.skip = page * PAGE_SIZE;
        params.limit = PAGE_SIZE;
      } else {
        params.skip = 0;
        params.limit = 100000;
      }

      setLoading(true);
      getTransactions(params).then((data) => {
        setTransactions(data.transactions);
        setTotal(data.total);
        setSumIncome(data.sum_income ?? 0);
        setSumExpense(Math.abs(data.sum_expense ?? 0));
        setSumTransfers(data.sum_transfers ?? 0);
        setSumRefunds(data.sum_refunds ?? 0);
      }).finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [page, search, accountFilter, bankFilter, typeFilter, categoryFilter, dateFrom, dateTo, includeTransfers, showAll, sortBy, refreshKey]);

  const handleCategoryChange = async (txnId: number, catId: string) => {
    const categoryId = catId === "none" ? null : parseInt(catId);
    await updateTransactionCategory(txnId, categoryId);
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id !== txnId) return t;
        const cat = categories.find((c) => c.id === categoryId);
        return { ...t, category_id: categoryId, category_name: cat?.name ?? null, category_color: cat?.color ?? null };
      })
    );
  };

  const fetchAllFiltered = async () => {
    const params = buildFilterParams();
    params.skip = 0;
    params.limit = 100000;
    return getTransactions(params);
  };

  const exportCSV = async () => {
    setExporting("csv");
    try {
      const data = await fetchAllFiltered();
      downloadCSV(
        "tranzactii.csv",
        ["Data", "Descriere", "Cont", "Sumă", "Valută", "Original", "Valută orig.", "Tip", "Categorie", "Sold"],
        data.transactions.map((t: Transaction) => [
          t.transaction_date,
          t.description,
          accounts.find((a) => a.id === t.account_id)?.name || t.account_number,
          t.amount,
          t.account_currency,
          t.original_amount,
          t.original_currency,
          t.type,
          t.category_name,
          t.balance_after,
        ]),
      );
    } finally {
      setExporting(null);
    }
  };

  const exportPDF = async () => {
    setExporting("pdf");
    try {
      const data = await fetchAllFiltered();
      exportTransactionsPDF({
        transactions: data.transactions,
        sumIncome,
        sumExpense,
        sumTransfers,
        dateFrom,
        dateTo,
        accountName: accountFilter ? accounts.find((a) => a.id === parseInt(accountFilter))?.name : undefined,
        total: data.total,
      });
    } finally {
      setExporting(null);
    }
  };

  const typeIcon = (type: string) => {
    if (type === "income") return <ArrowUpCircle className="h-4 w-4 text-green-600" />;
    if (type === "expense") return <ArrowDownCircle className="h-4 w-4 text-red-500" />;
    if (type === "refund") return <ArrowUpCircle className="h-4 w-4 text-emerald-400" />;
    if (type === "cancelled") return <RotateCcw className="h-4 w-4 text-purple-500" />;
    return <ArrowLeftRight className="h-4 w-4 text-blue-500" />;
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const summCurrLabel = ` ${BASE_CURRENCY}`;

  // Net balance from filtered summary
  const filteredNet = -sumExpense + sumIncome + sumRefunds;

  const [filtersOpen, setFiltersOpen] = useState(false);
  const isDateModified = activePeriodPreset !== defaultPreset || presetOffset !== 0;
  const activeFilterCount = [search, accountFilter, bankFilter, typeFilter, categoryFilter].filter(Boolean).length + (isDateModified ? 1 : 0);

  // Saved filters (moved from PeriodPresetBar)
  const [savedFilters, setSavedFilters] = useState<{ id: number; name: string; period_preset: PeriodPresetKey | null; date_from: string | null; date_to: string | null; account_id: number | null; category_id: number | null; type: string | null; search: string | null; }[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [filterName, setFilterName] = useState("");
  const loadSavedFilters_ = () => getSavedFilters().then(setSavedFilters);
  useEffect(() => { loadSavedFilters_(); }, []);

  const resetAllFilters = () => {
    const def = computeDatesForPreset(defaultPreset, 0);
    setSearch(""); setAccountFilter(""); setBankFilter("");
    setTypeFilter(""); setCategoryFilter(""); setSortBy("");
    setActivePeriodPreset(defaultPreset); setPresetOffset(0);
    setDateFrom(def.dateFrom); setDateTo(def.dateTo);
    setPage(0);
  };

  const activeChips = activeFilterCount > 0 ? (
    <>
      {search && (
        <Badge variant="secondary" className="gap-1 text-xs">
          „{search}"
          <button onClick={() => { setSearch(""); setPage(0); }}><X className="h-3 w-3" /></button>
        </Badge>
      )}
      {accountFilter && (
        <Badge variant="secondary" className="gap-1 text-xs">
          {accounts.find(a => a.id === parseInt(accountFilter))?.name || "Cont"}
          <button onClick={() => { setAccountFilter(""); setPage(0); }}><X className="h-3 w-3" /></button>
        </Badge>
      )}
      {bankFilter && (
        <Badge variant="secondary" className="gap-1 text-xs">
          {bankFilter.toUpperCase()}
          <button onClick={() => { setBankFilter(""); setPage(0); }}><X className="h-3 w-3" /></button>
        </Badge>
      )}
      {typeFilter && (
        <Badge variant="secondary" className="gap-1 text-xs">
          {typeFilter}
          <button onClick={() => { setTypeFilter(""); setPage(0); }}><X className="h-3 w-3" /></button>
        </Badge>
      )}
      {categoryFilter && (
        <Badge variant="secondary" className="gap-1 text-xs">
          {categoryFilter === "none" ? "Fără categorie" : categories.find(c => String(c.id) === categoryFilter)?.name || "Categorie"}
          <button onClick={() => { setCategoryFilter(""); setPage(0); }}><X className="h-3 w-3" /></button>
        </Badge>
      )}
      {isDateModified && (
        <Badge variant="secondary" className="gap-1 text-xs">
          {activePeriodPreset ? formatPresetLabel(activePeriodPreset, presetOffset) : `${dateFrom} — ${dateTo}`}
          <button onClick={() => { const def = computeDatesForPreset(defaultPreset, 0); setActivePeriodPreset(defaultPreset); setPresetOffset(0); setDateFrom(def.dateFrom); setDateTo(def.dateTo); setPage(0); }}><X className="h-3 w-3" /></button>
        </Badge>
      )}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={resetAllFilters}>
        <RotateCcw className="h-3 w-3 mr-1" /> Resetează
      </Button>
    </>
  ) : null;

  const handleSaveFilter = async () => {
    if (!filterName.trim()) return;
    await createSavedFilter({
      name: filterName.trim(),
      period_preset: activePeriodPreset,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      account_id: accountFilter ? parseInt(accountFilter) : null,
      category_id: categoryFilter === "none" ? -1 : categoryFilter ? parseInt(categoryFilter) : null,
      type: typeFilter || null,
      search: search || null,
    });
    setShowSaveDialog(false);
    setFilterName("");
    loadSavedFilters_();
  };

  const handleApplySaved = (sf: typeof savedFilters[0]) => {
    let df = sf.date_from || "";
    let dt = sf.date_to || "";
    const preset = sf.period_preset || null;
    if (preset) {
      const dates = computeDatesForPreset(preset, 0);
      df = dates.dateFrom;
      dt = dates.dateTo;
    }
    handleApplySavedFilter({
      periodPreset: preset,
      periodOffset: 0,
      dateFrom: df,
      dateTo: dt,
      accountId: sf.account_id ? String(sf.account_id) : "",
      categoryId: sf.category_id === -1 ? "none" : sf.category_id ? String(sf.category_id) : "",
      type: sf.type || "",
      search: sf.search || "",
    });
  };

  const filterContent = (
    <>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Caută descriere, sumă, notă..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className={`pl-9 ${search ? "filter-active" : ""}`}
        />
      </div>

      {/* Date range */}
      <div className="space-y-2">
        <div>
          <label className="text-[10px] text-muted-foreground">De la</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setActivePeriodPreset(null); setPresetOffset(0); setPage(0); }}
            className={`w-full ${isDateModified ? "filter-active" : ""}`}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Până la</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setActivePeriodPreset(null); setPresetOffset(0); setPage(0); }}
            className={`w-full ${isDateModified ? "filter-active" : ""}`}
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
          <Select value={accountFilter} onValueChange={(v) => { setAccountFilter(v === "all" ? "" : v); setPage(0); }}>
            <SelectTrigger className={`w-full ${accountFilter ? "filter-active" : ""}`}>
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
          <Select value={bankFilter} onValueChange={(v) => { setBankFilter(v === "all" ? "" : v); setPage(0); }}>
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
        <div>
          <label className="text-[10px] text-muted-foreground">Tip</label>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(0); }}>
            <SelectTrigger className={`w-full ${typeFilter ? "filter-active" : ""}`}>
              <SelectValue placeholder="Toate tipurile" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate tipurile</SelectItem>
              <SelectItem value="income">Venituri</SelectItem>
              <SelectItem value="expense">Cheltuieli</SelectItem>
              <SelectItem value="refund">Restituiri</SelectItem>
              <SelectItem value="transfer">Transferuri</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Categorie</label>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v === "all" ? "" : v); setPage(0); }}>
            <SelectTrigger className={`w-full ${categoryFilter ? "filter-active" : ""}`}>
              <SelectValue placeholder="Toate categoriile" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate categoriile</SelectItem>
              <SelectItem value="none">Fără categorie</SelectItem>
              <CategorySelectItems categories={categories.filter(c => !c.parent_id) as any} />
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Saved filters */}
      {savedFilters.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Salvate</span>
          {savedFilters.map((sf) => (
            <div key={sf.id} className="flex items-center justify-between gap-2">
              <button
                className="flex-1 text-left text-sm px-2.5 py-1.5 rounded-md border hover:bg-accent transition-colors truncate"
                onClick={() => { handleApplySaved(sf); setFiltersOpen(false); }}
              >
                {sf.name}
              </button>
              <button
                className="p-1 rounded hover:bg-destructive/20 shrink-0"
                onClick={async () => { await deleteSavedFilter(sf.id); loadSavedFilters_(); }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Save current filter */}
      {!showSaveDialog ? (
        <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => setShowSaveDialog(true)}>
          <Plus className="h-3.5 w-3.5" /> Salvează filtrul curent
        </Button>
      ) : (
        <div className="flex gap-2">
          <Input
            placeholder="Numele filtrului..."
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveFilter()}
            autoFocus
          />
          <Button size="sm" disabled={!filterName.trim()} onClick={handleSaveFilter}>Salvează</Button>
          <Button variant="ghost" size="sm" onClick={() => { setShowSaveDialog(false); setFilterName(""); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Reset */}

    </>
  );

  return (
    <div className="flex gap-6 items-start">
      <div className="flex-1 min-w-0 space-y-4">
      {/* Header with filter button + period nav */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="hidden md:block text-xl md:text-2xl font-bold">Tranzacții</h1>
        <PeriodPresetBar
          activePreset={activePeriodPreset}
          presetOffset={presetOffset}
          onSelectPreset={handlePreset}
          currentFilters={{
            periodPreset: activePeriodPreset,
            periodOffset: presetOffset,
            dateFrom,
            dateTo,
            accountId: accountFilter,
            categoryId: categoryFilter,
            type: typeFilter,
            search,
          }}
          onApplyFilter={handleApplySavedFilter}
        />
        <div className="flex items-center gap-1">
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

      {/* Summary — compact row on mobile, cards on desktop */}
      <div className="hidden sm:grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="py-0">
          <CardContent className="px-2 sm:px-4 py-2 sm:py-3">
            <div className="flex items-start gap-1.5 sm:gap-2.5">
              <div className="p-1 sm:p-1.5 bg-green-100 rounded-md">
                <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Venituri</p>
                <p className="text-sm sm:text-lg font-bold text-green-600 truncate">+{sumIncome.toLocaleString("ro-RO", { minimumFractionDigits: 2 })}{summCurrLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="px-2 sm:px-4 py-2 sm:py-3">
            <div className="flex items-start gap-1.5 sm:gap-2.5">
              <div className="p-1 sm:p-1.5 bg-red-100 rounded-md">
                <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Cheltuieli</p>
                <p className="text-sm sm:text-lg font-bold text-red-500 truncate">-{sumExpense.toLocaleString("ro-RO", { minimumFractionDigits: 2 })}{summCurrLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="px-2 sm:px-4 py-2 sm:py-3">
            <div className="flex items-start gap-1.5 sm:gap-2.5">
              <div className="p-1 sm:p-1.5 bg-emerald-100 rounded-md">
                <ArrowUpCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Restituiri</p>
                <p className="text-sm sm:text-lg font-bold text-emerald-500 truncate">+{sumRefunds.toLocaleString("ro-RO", { minimumFractionDigits: 2 })}{summCurrLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="px-2 sm:px-4 py-2 sm:py-3">
            <div className="flex items-start gap-1.5 sm:gap-2.5">
              <div className="p-1 sm:p-1.5 bg-blue-100 rounded-md">
                <ArrowLeftRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Transferuri</p>
                <p className="text-sm sm:text-lg font-bold text-blue-500 truncate">{sumTransfers.toLocaleString("ro-RO", { minimumFractionDigits: 2 })}{summCurrLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Mobile: same card style as desktop, 2 cols */}
      <div className="sm:hidden grid grid-cols-2 gap-2">
        <Card className="py-0">
          <CardContent className="px-2 py-2">
            <div className="flex items-start gap-1.5">
              <div className="p-1 bg-green-100 rounded-md">
                <TrendingUp className="h-3.5 w-3.5 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Venituri</p>
                <p className="text-sm font-bold text-green-600 truncate">+{sumIncome.toLocaleString("ro-RO", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="px-2 py-2">
            <div className="flex items-start gap-1.5">
              <div className="p-1 bg-red-100 rounded-md">
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Cheltuieli</p>
                <p className="text-sm font-bold text-red-500 truncate">-{sumExpense.toLocaleString("ro-RO", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="px-2 py-2">
            <div className="flex items-start gap-1.5">
              <div className="p-1 bg-emerald-100 rounded-md">
                <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Restituiri</p>
                <p className="text-sm font-bold text-emerald-500 truncate">+{sumRefunds.toLocaleString("ro-RO", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="px-2 py-2">
            <div className="flex items-start gap-1.5">
              <div className="p-1 bg-blue-100 rounded-md">
                <ArrowLeftRight className="h-3.5 w-3.5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Transferuri</p>
                <p className="text-sm font-bold text-blue-500 truncate">{sumTransfers.toLocaleString("ro-RO", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-2">
        <CardHeader className="pb-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6 pl-4">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <span>{total} tranzacții</span>
                {(sumExpense > 0 || sumIncome > 0) && (
                  <span className={`hidden text-sm font-semibold ${filteredNet >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {filteredNet >= 0 ? "+" : ""}{filteredNet.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} {BASE_CURRENCY}
                  </span>
                )}
              </CardTitle>
              <Link to="/transactions/new" className="hidden md:inline-flex">
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" /> Adaugă
                </Button>
              </Link>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <Button
                variant={bulkMode ? "default" : "outline"}
                size="sm"
                onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
                title="Selectare"
                className="hidden md:inline-flex"
              >
                <CheckSquare className="h-4 w-4 mr-1" /> Selectare
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={!!exporting} title="Exportă CSV" className="hidden md:inline-flex">
                {exporting === "csv" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} CSV
              </Button>
              <Button variant="outline" size="sm" onClick={exportPDF} disabled={!!exporting} title="Exportă PDF" className="hidden md:inline-flex">
                {exporting === "pdf" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />} PDF
              </Button>

              {!showAll && (
                <>
                  <Button className="md:ml-4" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">
                    {page + 1}/{totalPages || 1}
                  </span>
                  <Button className="md:mr-4" variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                  <Button
                variant={showAll ? "default" : "outline"}
                size="sm"
                onClick={() => { setShowAll(!showAll); setPage(0); }}
                className="hidden md:inline-flex"
              >
                {showAll ? "Paginare" : "Toate"}
              </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : <div className="overflow-x-auto"><Table>
            <TableHeader>
              <TableRow>
                {bulkMode && (
                  <TableHead className="w-[40px]">
                    <input
                      type="checkbox"
                      checked={transactions.length > 0 && selectedIds.size === transactions.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(transactions.map((t) => t.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      className="h-4 w-4 rounded"
                    />
                  </TableHead>
                )}
                <TableHead
                  className="w-[52px] md:w-[100px] cursor-pointer select-none hover:text-foreground"
                  onClick={() => setSortBy(sortBy === "date_asc" ? "" : sortBy === "" ? "date_asc" : "")}
                >
                  <span className="inline-flex items-center gap-1">
                    Data
                    {sortBy === "date_asc" ? <ArrowUp className="h-3 w-3" /> : sortBy === "" ? <ArrowDown className="h-3 w-3 opacity-30" /> : null}
                  </span>
                </TableHead>
                <TableHead>Descriere</TableHead>
                <TableHead className="w-[100px] hidden md:table-cell">Cont</TableHead>
                <TableHead
                  className="md:w-[120px] text-right cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                  onClick={() => setSortBy(sortBy === "amount_desc" ? "amount_asc" : "amount_desc")}
                >
                  <span className="inline-flex items-center gap-1 justify-end">
                    Sumă
                    {sortBy === "amount_desc" ? <ArrowDown className="h-3 w-3" /> : sortBy === "amount_asc" ? <ArrowUp className="h-3 w-3" /> : null}
                  </span>
                </TableHead>
                <TableHead className="w-[100px] text-right hidden md:table-cell">Original</TableHead>
                <TableHead className="w-[160px] hidden md:table-cell">Categorie</TableHead>
                <TableHead className="w-[60px] hidden md:table-cell">Tip</TableHead>
                {!bulkMode && <TableHead className="w-[90px] hidden md:table-cell" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((txn) => (
                <TableRow
                  key={txn.id}
                  className="md:cursor-default cursor-pointer"
                  onClick={() => {
                    // Mobile: tap row to edit
                    if (window.innerWidth < 768 && !bulkMode) {
                      setEditTarget(txn);
                      setEditFields({
                        accountId: String(txn.account_id),
                        type: txn.type,
                        transactionDate: txn.transaction_date,
                        processingDate: txn.processing_date || "",
                        description: txn.description,
                        amount: String(Math.abs(txn.amount)),
                        categoryId: txn.category_id ? String(txn.category_id) : "",
                        note: txn.note || "",
                        originalAmount: txn.original_amount ? String(txn.original_amount) : "",
                        originalCurrency: txn.original_currency || "",
                      });
                      setEditShowDetails(false);
                      setEditError("");
                    }
                  }}
                >
                  {bulkMode && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(txn.id)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(txn.id);
                          else next.delete(txn.id);
                          setSelectedIds(next);
                        }}
                        className="h-4 w-4 rounded"
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-sm whitespace-nowrap">
                    <span className="md:hidden">{txn.transaction_date.slice(8)}.{txn.transaction_date.slice(5,7)}</span>
                    <span className="hidden md:inline">{txn.transaction_date.split("-").reverse().join(".")}</span>
                  </TableCell>
                  <TableCell className="text-sm max-w-[140px] md:max-w-[350px]">
                    <div className="flex items-start gap-1">
                      <button
                        className={`mt-0.5 shrink-0 hidden md:block ${txn.note ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
                        onClick={(e) => { e.stopPropagation(); setEditingNoteId(txn.id); }}
                        title="Adaugă notă"
                      >
                        <MessageSquareMore className="h-3.5 w-3.5" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div
                          className="cursor-pointer truncate"
                          onClick={(e) => {
                            const el = e.currentTarget;
                            const expanded = el.classList.toggle("whitespace-normal");
                            el.classList.toggle("break-words", expanded);
                            el.classList.toggle("truncate", !expanded);
                            el.title = expanded ? "" : txn.description;
                          }}
                          title={txn.description}
                        >
                          {txn.description}
                        </div>
                        {txn.note && editingNoteId !== txn.id && (
                          <div
                            className="text-xs text-amber-600 dark:text-amber-400 cursor-pointer truncate"
                            onClick={(e) => { e.stopPropagation(); setEditingNoteId(txn.id); }}
                          >
                            {txn.note}
                          </div>
                        )}
                        {editingNoteId === txn.id && (
                          <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={noteRef}
                              defaultValue={txn.note || ""}
                              placeholder="Notă..."
                              className="h-5 text-xs flex-1 px-1 border rounded bg-background"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const val = noteRef.current?.value || "";
                                  updateTransactionNote(txn.id, val).then(() => {
                                    setTransactions((prev) => prev.map((t) => t.id === txn.id ? { ...t, note: val || null } : t));
                                    setEditingNoteId(null);
                                  });
                                }
                                if (e.key === "Escape") setEditingNoteId(null);
                              }}
                            />
                            <button
                              className="p-0.5 rounded hover:bg-muted shrink-0"
                              onClick={() => {
                                const val = noteRef.current?.value || "";
                                updateTransactionNote(txn.id, val).then(() => {
                                  setTransactions((prev) => prev.map((t) => t.id === txn.id ? { ...t, note: val || null } : t));
                                  setEditingNoteId(null);
                                });
                              }}
                            >
                              <Check className="h-3 w-3 text-green-600" />
                            </button>
                            <button
                              className="p-0.5 rounded hover:bg-muted shrink-0"
                              onClick={() => setEditingNoteId(null)}
                            >
                              <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-1">
                      {txn.bank && (
                        <Badge variant="secondary" className={`text-[10px] px-1 py-0 ${
                          txn.bank === "n26" ? "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300" :
                          txn.bank === "bbva" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" :
                          "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        }`}>
                          {txn.bank.toUpperCase()}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {txn.account_currency}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm whitespace-nowrap ${
                    txn.type === "cancelled" ? "text-purple-500" : txn.type === "refund" ? "text-emerald-400" : txn.is_transfer ? "text-blue-500" : txn.amount > 0 ? "text-green-600" : txn.amount < 0 ? "text-red-500" : ""
                  }`}>
                    {txn.amount > 0 ? "+" : ""}{txn.amount.toFixed(2)} {txn.account_currency}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground hidden md:table-cell">
                    {txn.original_currency !== txn.account_currency && txn.original_amount
                      ? `${txn.original_amount.toFixed(2)} ${txn.original_currency}`
                      : ""}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {(txn.is_transfer || txn.type === "cancelled" || txn.type === "refund") ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="relative">
                        <button
                          className="flex items-center gap-1 h-7 px-2 text-xs rounded border border-transparent hover:border-border w-full"
                          onClick={() => setEditingCategoryId(txn.id)}
                        >
                          {txn.category_name ? (
                            <>
                              <span
                                className="w-2 h-2 rounded-full inline-block shrink-0"
                                style={{ backgroundColor: txn.category_color || "#94a3b8" }}
                              />
                              <span className="truncate">{txn.category_name}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">---</span>
                          )}
                        </button>
                        {editingCategoryId === txn.id && (
                          <Select
                            value={txn.category_id ? String(txn.category_id) : "none"}
                            onValueChange={(v) => { handleCategoryChange(txn.id, v); setEditingCategoryId(null); }}
                            open
                            onOpenChange={(open) => { if (!open) setEditingCategoryId(null); }}
                          >
                            <SelectTrigger className="absolute inset-0 opacity-0 pointer-events-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Fără categorie</SelectItem>
                              <CategorySelectItems categories={categories.filter(c => !c.parent_id) as any} />
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{typeIcon(txn.type)}</TableCell>
                  {!bulkMode && (
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => {
                            setEditTarget(txn);
                            setEditFields({
                              accountId: String(txn.account_id),
                              type: txn.type,
                              transactionDate: txn.transaction_date,
                              processingDate: txn.processing_date || "",
                              description: txn.description,
                              amount: String(Math.abs(txn.amount)),
                              categoryId: txn.category_id ? String(txn.category_id) : "",
                              note: txn.note || "",
                              originalAmount: txn.original_amount ? String(txn.original_amount) : "",
                              originalCurrency: txn.original_currency || "",
                            });
                            setEditShowDetails(false);
                            setEditError("");
                          }}
                          className="p-1 rounded text-muted-foreground/40 hover:text-amber-500 transition-colors"
                          title="Editează"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setSplitTarget(txn);
                            setSplitDesc("");
                            setSplitAmount("");
                            setSplitType(txn.type);
                            setSplitCategoryId(txn.category_id ? String(txn.category_id) : "");
                            setSplitNote("");
                            setSplitError("");
                          }}
                          className="p-1 rounded text-muted-foreground/40 hover:text-blue-500 transition-colors"
                          title="Împarte"
                        >
                          <Scissors className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(txn.id)}
                          className="p-1 rounded text-muted-foreground/40 hover:text-red-500 transition-colors"
                          title="Șterge"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table></div>}
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="fixed md:bottom-4 left-1/2 -translate-x-1/2 bg-card border shadow-lg rounded-lg px-4 py-2.5 flex items-center gap-4 z-50" style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}>
          <span className="text-sm font-medium">{selectedIds.size} selectate</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteTarget("bulk")}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Șterge selectate
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setBulkMode(false); setSelectedIds(new Set()); }}
          >
            Anulează
          </Button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmare ștergere</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget === "bulk"
              ? `Sigur doriți să ștergeți ${selectedIds.size} tranzacții? Această acțiune este ireversibilă.`
              : "Sigur doriți să ștergeți această tranzacție? Această acțiune este ireversibilă."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Anulează
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleteTarget === "bulk") {
                  await deleteTransactionsBulk(Array.from(selectedIds));
                  setSelectedIds(new Set());
                  setBulkMode(false);
                } else if (typeof deleteTarget === "number") {
                  await deleteTransaction(deleteTarget);
                }
                setDeleteTarget(null);
                setRefreshKey((k) => k + 1);
              }}
            >
              Șterge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split dialog */}
      <Dialog open={splitTarget !== null} onOpenChange={(open) => { if (!open) setSplitTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Împarte tranzacția</DialogTitle>
          </DialogHeader>
          {splitTarget && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{splitTarget.description}</span>
                {" — "}
                <span className="font-mono">{splitTarget.amount.toFixed(2)} {splitTarget.account_currency}</span>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Descriere <span className="text-red-500">*</span>
                </label>
                <Input
                  value={splitDesc}
                  onChange={(e) => setSplitDesc(e.target.value)}
                  placeholder="Descriere parte nouă..."
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Sumă <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={Math.abs(splitTarget.amount)}
                  value={splitAmount}
                  onChange={(e) => setSplitAmount(e.target.value)}
                  placeholder="0.00"
                />
                {splitAmount && parseFloat(splitAmount) > 0 && parseFloat(splitAmount) <= Math.abs(splitTarget.amount) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Rămâne: {(Math.abs(splitTarget.amount) - parseFloat(splitAmount)).toFixed(2)} {splitTarget.account_currency}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Categorie</label>
                <Select value={splitCategoryId || "none"} onValueChange={(v) => setSplitCategoryId(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Fără categorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fără categorie</SelectItem>
                    <CategorySelectItems categories={categories.filter(c => !c.parent_id) as any} />
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Tip</label>
                <Select value={splitType} onValueChange={setSplitType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Cheltuială</SelectItem>
                    <SelectItem value="income">Venit</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="refund">Restituire</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Notă</label>
                <Input
                  value={splitNote}
                  onChange={(e) => setSplitNote(e.target.value)}
                  placeholder="Notă opțională..."
                />
              </div>
              {splitError && <p className="text-sm text-red-500">{splitError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitTarget(null)}>
              Anulează
            </Button>
            <Button
              disabled={splitSaving}
              onClick={async () => {
                if (!splitTarget) return;
                const amt = parseFloat(splitAmount);
                if (!splitDesc.trim()) { setSplitError("Descrierea este obligatorie."); return; }
                if (!amt || amt <= 0) { setSplitError("Suma trebuie să fie pozitivă."); return; }
                if (amt > Math.abs(splitTarget.amount)) { setSplitError("Suma nu poate depăși originalul."); return; }
                setSplitSaving(true);
                setSplitError("");
                try {
                  await splitTransaction(splitTarget.id, {
                    description: splitDesc.trim(),
                    amount: amt,
                    type: splitType || undefined,
                    category_id: splitCategoryId ? parseInt(splitCategoryId) : null,
                    note: splitNote.trim() || null,
                  });
                  setSplitTarget(null);
                  setRefreshKey((k) => k + 1);
                } catch (err) {
                  setSplitError(err instanceof Error ? err.message : "Eroare la împărțire");
                } finally {
                  setSplitSaving(false);
                }
              }}
            >
              {splitSaving ? "Se salvează..." : "Împarte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editează tranzacția</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Account — full width */}
              <div className="sm:col-span-2">
                <label className="text-sm font-medium mb-1 block">Cont</label>
                <Select value={editFields.accountId} onValueChange={(v) => setEditFields({ ...editFields, accountId: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(accounts.reduce<Record<string, Account[]>>((acc, a) => {
                      const bank = a.bank || "other";
                      (acc[bank] ??= []).push(a);
                      return acc;
                    }, {})).map(([bank, accs]) => (
                      <SelectGroup key={bank}>
                        <SelectLabel>{bank.toUpperCase()}</SelectLabel>
                        {accs.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.name || a.account_number} ({a.currency})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Type */}
              <div>
                <label className="text-sm font-medium mb-1 block">Tip</label>
                <Select value={editFields.type} onValueChange={(v) => setEditFields({ ...editFields, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Transaction date */}
              <div>
                <label className="text-sm font-medium mb-1 block">Data tranzacției</label>
                <Input
                  type="date"
                  value={editFields.transactionDate}
                  onChange={(e) => setEditFields({ ...editFields, transactionDate: e.target.value })}
                />
              </div>
              {/* Amount */}
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Sumă{editFields.accountId ? ` (${accounts.find(a => String(a.id) === editFields.accountId)?.currency || ""})` : ""}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editFields.amount}
                  onChange={(e) => setEditFields({ ...editFields, amount: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {editFields.type === "expense" || editFields.type === "transfer"
                    ? "Pozitivă — va fi salvată ca negativă"
                    : "Pozitivă"}
                </p>
              </div>
              {/* Description */}
              <div className="sm:col-span-2">
                <label className="text-sm font-medium mb-1 block">Descriere</label>
                <Input
                  value={editFields.description}
                  onChange={(e) => setEditFields({ ...editFields, description: e.target.value })}
                />
              </div>
              {/* Category */}
              <div className="sm:col-span-2">
                <label className="text-sm font-medium mb-1 block">Categorie</label>
                <Select value={editFields.categoryId || "none"} onValueChange={(v) => setEditFields({ ...editFields, categoryId: v === "none" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Fără categorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fără categorie</SelectItem>
                    <CategorySelectItems categories={categories.filter(c => !c.parent_id) as any} />
                  </SelectContent>
                </Select>
              </div>
              {/* Note */}
              <div className="sm:col-span-2">
                <label className="text-sm font-medium mb-1 block">Notă</label>
                <Input
                  value={editFields.note}
                  onChange={(e) => setEditFields({ ...editFields, note: e.target.value })}
                  placeholder="Notă opțională..."
                />
              </div>
              {/* Collapsible details */}
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setEditShowDetails(!editShowDetails)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {editShowDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Detalii suplimentare
                </button>
              </div>
              {editShowDetails && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Sumă originală</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editFields.originalAmount}
                      onChange={(e) => setEditFields({ ...editFields, originalAmount: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Valută originală</label>
                    <Select value={editFields.originalCurrency || "none"} onValueChange={(v) => setEditFields({ ...editFields, originalCurrency: v === "none" ? "" : v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="MDL">MDL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {editError && <p className="sm:col-span-2 text-sm text-red-500">{editError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Anulează
            </Button>
            <Button
              disabled={editSaving}
              onClick={async () => {
                if (!editTarget) return;
                if (!editFields.description.trim()) { setEditError("Descrierea este obligatorie."); return; }
                const numAmount = parseFloat(editFields.amount);
                if (!numAmount || numAmount === 0) { setEditError("Suma trebuie să fie diferită de zero."); return; }

                let finalAmount = Math.abs(numAmount);
                if (editFields.type === "expense" || editFields.type === "transfer") {
                  finalAmount = -finalAmount;
                }

                setEditSaving(true);
                setEditError("");
                try {
                  await updateTransaction(editTarget.id, {
                    account_id: parseInt(editFields.accountId),
                    type: editFields.type,
                    transaction_date: editFields.transactionDate,
                    processing_date: editFields.processingDate || null,
                    description: editFields.description.trim(),
                    amount: finalAmount,
                    category_id: editFields.categoryId ? parseInt(editFields.categoryId) : null,
                    note: editFields.note.trim() || null,
                    original_amount: editFields.originalAmount ? parseFloat(editFields.originalAmount) : null,
                    original_currency: editFields.originalCurrency || null,
                  });
                  setEditTarget(null);
                  setRefreshKey((k) => k + 1);
                } catch (err) {
                  setEditError(err instanceof Error ? err.message : "Eroare la salvare");
                } finally {
                  setEditSaving(false);
                }
              }}
            >
              {editSaving ? "Se salvează..." : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile FAB — add transaction */}
      <Link
        to="/transactions/new"
        className="md:hidden fixed right-4 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-transform"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Plus className="h-5 w-5" />
      </Link>
      </div>
      <FilterPanel activeChips={activeChips}>{filterContent}</FilterPanel>
    </div>
  );
}
