import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, AlertCircle, Check, X, Pencil, Filter, TrendingDown, TrendingUp, Hash } from "lucide-react";
import {
  getHiddenFilters,
  createHiddenFilter,
  updateHiddenFilter,
  deleteHiddenFilter,
  previewHiddenFilter,
  getHiddenTransactions,
  toggleTransactionHiddenOverride,
  getCategories,
  getSalaryTransactions,
  upsertSalaryAdjustment,
  deleteSalaryAdjustment,
} from "../lib/api";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategorySelectItems } from "./categories/CategorySelect";
import type { Category as CatType } from "./categories/types";

interface HiddenFilter {
  id: number;
  name: string;
  match_type: "contains" | "regex" | "category";
  pattern: string | null;
  category_id: number | null;
  category_name: string | null;
  is_active: boolean;
}

interface HiddenTransaction {
  id: number;
  transaction_date: string;
  description: string;
  amount: number;
  type: string;
  original_amount: number | null;
  original_currency: string | null;
  category_name: string | null;
  category_color: string | null;
  account_currency: string | null;
  bank: string | null;
  is_hidden: boolean;
  hidden_override: boolean;
  matched_filter: { id: number | null; name: string; match_type: string } | null;
  note: string | null;
}

const MATCH_TYPE_META: Record<string, { label: string; badge: string; pill: string; activePill: string }> = {
  contains: {
    label: "Conține",
    badge: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
    pill:  "bg-blue-500/10 border-blue-400/40 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20",
    activePill: "bg-blue-600 text-white border-blue-600",
  },
  regex: {
    label: "/regex/",
    badge: "bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800",
    pill:  "bg-violet-500/10 border-violet-400/40 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20",
    activePill: "bg-violet-600 text-white border-violet-600",
  },
  category: {
    label: "Categorie",
    badge: "bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800",
    pill:  "bg-orange-500/10 border-orange-400/40 text-orange-700 dark:text-orange-300 hover:bg-orange-500/20",
    activePill: "bg-orange-500 text-white border-orange-500",
  },
};

function FilterForm({
  initial,
  categories,
  onSave,
  onCancel,
}: {
  initial?: Partial<HiddenFilter>;
  categories: CatType[];
  onSave: (data: { name: string; match_type: string; pattern?: string | null; category_id?: number | null; is_active: boolean }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [matchType, setMatchType] = useState<string>(initial?.match_type ?? "contains");
  const [pattern, setPattern] = useState(initial?.pattern ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(initial?.category_id ?? null);
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [preview, setPreview] = useState<{ count: number; examples: { id: number; description: string; amount: number; date: string }[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = async () => {
    setPreviewLoading(true);
    setError(null);
    try {
      const data = await previewHiddenFilter({
        name: name || "preview",
        match_type: matchType,
        pattern: matchType !== "category" ? pattern : null,
        category_id: matchType === "category" ? categoryId : null,
      });
      setPreview(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Introduceți un nume"); return; }
    if (matchType !== "category" && !pattern.trim()) { setError("Introduceți un pattern"); return; }
    if (matchType === "category" && !categoryId) { setError("Selectați o categorie"); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        match_type: matchType,
        pattern: matchType !== "category" ? pattern.trim() : null,
        category_id: matchType === "category" ? categoryId : null,
        is_active: isActive,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare la salvare");
      setSaving(false);
    }
  };

  return (
    <div className="border border-border rounded-lg p-4 bg-card space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Nume filtru</label>
          <input
            className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="ex: Amazon, Abonamente..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Tip</label>
          <select
            className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={matchType}
            onChange={(e) => { setMatchType(e.target.value); setPreview(null); }}
          >
            <option value="contains">Conține (text simplu)</option>
            <option value="regex">Regex</option>
            <option value="category">Categorie</option>
          </select>
        </div>
      </div>

      {matchType !== "category" ? (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {matchType === "regex" ? "Expresie regulată" : "Text de căutat"}
          </label>
          <input
            className="w-full h-9 px-3 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={matchType === "regex" ? "ex: amzn|amazon" : "ex: AMZN"}
            value={pattern}
            onChange={(e) => { setPattern(e.target.value); setPreview(null); }}
          />
        </div>
      ) : (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Categorie</label>
          <Select
            value={categoryId ? String(categoryId) : ""}
            onValueChange={(v) => { setCategoryId(v ? Number(v) : null); setPreview(null); }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="— selectați —" />
            </SelectTrigger>
            <SelectContent>
              <CategorySelectItems categories={categories} />
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="filter-active"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border"
        />
        <label htmlFor="filter-active" className="text-sm">Activ</label>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {preview && (
        <div className="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 space-y-1">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            Va ascunde {preview.count} tranzacție/tranzacții
          </p>
          {preview.examples.map((ex) => (
            <p key={ex.id} className="text-muted-foreground truncate">
              {ex.date} · {ex.description} · {Math.abs(ex.amount).toFixed(2)}
            </p>
          ))}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={handlePreview}
          disabled={previewLoading}
          className="h-8 px-3 text-xs rounded-md border hover:bg-accent transition-colors"
        >
          {previewLoading ? "..." : "Previzualizare"}
        </button>
        <button
          onClick={onCancel}
          className="h-8 px-3 text-xs rounded-md border hover:bg-accent transition-colors"
        >
          Anulare
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="h-8 px-3 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {saving ? "..." : "Salvare"}
        </button>
      </div>
    </div>
  );
}

// Group transactions by year-month
function groupByMonth(txns: HiddenTransaction[]): Record<string, HiddenTransaction[]> {
  const groups: Record<string, HiddenTransaction[]> = {};
  for (const t of txns) {
    const key = t.transaction_date.slice(0, 7);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return groups;
}

const MONTH_NAMES = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];

function formatMonth(key: string) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

interface SalaryTxn {
  id: number;
  transaction_date: string;
  description: string;
  amount: number;
  currency: string | null;
  account_name: string | null;
  adjustment: number | null;
  adjusted_amount: number | null;
}

type SalaryPattern = { text: string; match_type: "contains" | "regex" };

function SalaryBlock() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [txns, setTxns] = useState<SalaryTxn[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Multiple patterns
  const [patterns, setPatterns] = useState<SalaryPattern[]>([
    { text: "web development", match_type: "contains" },
  ]);
  const [addingPattern, setAddingPattern] = useState(false);
  const [newPatternText, setNewPatternText] = useState("");
  const [newPatternType, setNewPatternType] = useState<"contains" | "regex">("contains");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSalaryTransactions({ year, patterns });
      setTxns(data.transactions);
    } finally {
      setLoading(false);
    }
  }, [year, patterns]);

  useEffect(() => { load(); }, [load]);

  const addPattern = () => {
    if (!newPatternText.trim()) return;
    setPatterns((prev) => [...prev, { text: newPatternText.trim(), match_type: newPatternType }]);
    setNewPatternText("");
    setAddingPattern(false);
  };

  const removePattern = (i: number) => setPatterns((prev) => prev.filter((_, idx) => idx !== i));

  const startEdit = (t: SalaryTxn) => {
    setEditingId(t.id);
    // show absolute value — user just types the deduction amount
    setEditValue(t.adjustment !== null ? String(Math.abs(t.adjustment)) : "");
  };

  const saveEdit = async (txn: SalaryTxn) => {
    const val = parseFloat(editValue.replace(",", "."));
    setSaving(true);
    try {
      if (editValue.trim() === "" || isNaN(val)) {
        if (txn.adjustment !== null) await deleteSalaryAdjustment(txn.id);
      } else {
        // always store as negative (deduction)
        await upsertSalaryAdjustment({ transaction_id: txn.id, adjustment: -Math.abs(val) });
      }
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => setEditingId(null);

  const totalReal = txns.reduce((s, t) => s + t.amount, 0);
  const totalAdjusted = txns.reduce((s, t) => s + (t.adjusted_amount ?? t.amount), 0);
  const totalDiff = totalAdjusted - totalReal;
  const hasAdjustments = txns.some((t) => t.adjustment !== null);

  return (
    <div className="space-y-4">
      {/* Toolbar: year + patterns */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year nav */}
          <div className="flex items-center gap-1">
            <button onClick={() => setYear((y) => y - 1)} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors">
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
            <span className="text-sm font-medium w-12 text-center">{year}</span>
            <button onClick={() => setYear((y) => y + 1)} disabled={year >= currentYear} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Pattern pills */}
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            {patterns.map((p, i) => (
              <span key={i} className={`flex items-center gap-1 h-6 pl-2 pr-1 text-xs rounded-full border font-mono ${
                p.match_type === "regex"
                  ? "bg-violet-500/10 border-violet-400/40 text-violet-700 dark:text-violet-300"
                  : "bg-blue-500/10 border-blue-400/40 text-blue-700 dark:text-blue-300"
              }`}>
                <span className="opacity-60">{p.match_type === "regex" ? "/" : ""}</span>
                {p.text}
                <span className="opacity-60">{p.match_type === "regex" ? "/" : ""}</span>
                <button onClick={() => removePattern(i)} className="ml-0.5 h-4 w-4 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {!addingPattern && (
              <button
                onClick={() => setAddingPattern(true)}
                className="h-6 px-2 text-xs rounded-full border border-dashed hover:bg-accent transition-colors text-muted-foreground flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> patern
              </button>
            )}
          </div>

          {/* Totals */}
          {hasAdjustments && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
              <span className="font-mono">{totalReal.toFixed(2)}</span>
              <span>→</span>
              <span className="font-mono font-medium text-foreground">{totalAdjusted.toFixed(2)}</span>
              <span className={`font-mono ${totalDiff < 0 ? "text-red-500" : "text-emerald-500"}`}>
                ({totalDiff.toFixed(2)})
              </span>
            </div>
          )}
        </div>

        {/* Add pattern inline form */}
        {addingPattern && (
          <div className="flex items-center gap-2">
            <select
              className="h-7 px-2 text-xs rounded-md border bg-background focus:outline-none"
              value={newPatternType}
              onChange={(e) => setNewPatternType(e.target.value as "contains" | "regex")}
            >
              <option value="contains">conține</option>
              <option value="regex">regex</option>
            </select>
            <input
              autoFocus
              className="h-7 px-2 text-xs font-mono rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring flex-1"
              placeholder="ex: web development"
              value={newPatternText}
              onChange={(e) => setNewPatternText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addPattern(); if (e.key === "Escape") setAddingPattern(false); }}
            />
            <button onClick={addPattern} className="h-7 w-7 flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setAddingPattern(false)} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="border rounded-xl overflow-hidden">
        {loading && <div className="text-sm text-muted-foreground text-center py-6">Se încarcă...</div>}

        {!loading && txns.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-6">
            Nicio tranzacție găsită
          </div>
        )}

        {!loading && txns.length > 0 && (
          <div className="divide-y divide-border/50">
            {txns.map((t) => (
              <div key={t.id} className={`flex items-center gap-3 px-4 py-3 text-sm ${t.adjustment !== null ? "bg-amber-50/40 dark:bg-amber-950/15" : ""}`}>
                <span className="text-xs text-muted-foreground flex-shrink-0 w-20">{t.transaction_date}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-muted-foreground text-xs">{t.description}</p>
                </div>

                {/* Real amount */}
                <span className="font-mono text-sm flex-shrink-0">{t.amount.toFixed(2)}</span>

                {/* Arrow + adjusted */}
                {t.adjustment !== null && (
                  <>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className="font-mono text-sm font-medium flex-shrink-0 text-amber-600 dark:text-amber-400">
                      {(t.adjusted_amount ?? t.amount).toFixed(2)}
                    </span>
                  </>
                )}

                {/* Edit field */}
                {editingId === t.id ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">−</span>
                    <input
                      autoFocus
                      className="w-16 h-7 px-2 text-xs font-mono rounded border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="300"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(t); if (e.key === "Escape") cancelEdit(); }}
                    />
                    <button onClick={() => saveEdit(t)} disabled={saving} className="h-7 w-7 flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={cancelEdit} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(t)}
                      className="h-7 px-2 flex items-center gap-1 text-xs rounded-md hover:bg-accent transition-colors text-muted-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                      {t.adjustment !== null ? `−${Math.abs(t.adjustment)}` : "corecție"}
                    </button>
                    {t.adjustment !== null && (
                      <button
                        onClick={async () => { await deleteSalaryAdjustment(t.id); await load(); }}
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BlackLedger() {
  const [tab, setTab] = useState<"filters" | "salary">("filters");
  const [filters, setFilters] = useState<HiddenFilter[]>([]);
  const [transactions, setTransactions] = useState<HiddenTransaction[]>([]);
  const [categories, setCategories] = useState<CatType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [editingFilter, setEditingFilter] = useState<HiddenFilter | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [selectedFilterId, setSelectedFilterId] = useState<number | "override" | null>(null);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, t, c] = await Promise.all([
        getHiddenFilters(),
        getHiddenTransactions(),
        getCategories(),
      ]);
      setFilters(f);
      setTransactions(t.transactions);
      setCategories(c as CatType[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreateFilter = async (data: Parameters<typeof createHiddenFilter>[0]) => {
    await createHiddenFilter(data);
    setShowAddFilter(false);
    await load();
  };

  const handleUpdateFilter = async (id: number, data: Parameters<typeof updateHiddenFilter>[1]) => {
    await updateHiddenFilter(id, data);
    setEditingFilter(null);
    await load();
  };

  const handleDeleteFilter = async (id: number) => {
    if (!confirm("Ștergeți acest filtru?")) return;
    await deleteHiddenFilter(id);
    await load();
  };

  const handleToggle = async (txnId: number) => {
    setTogglingId(txnId);
    try {
      await toggleTransactionHiddenOverride(txnId);
      await load();
    } finally {
      setTogglingId(null);
    }
  };

  const toggleMonth = (key: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Filter transactions by selected rule
  const visibleTransactions = selectedFilterId === null
    ? transactions
    : selectedFilterId === "override"
      ? transactions.filter((t) => t.hidden_override)
      : transactions.filter((t) => t.matched_filter?.id === selectedFilterId);

  const grouped = groupByMonth(visibleTransactions);
  const months = Object.keys(grouped).sort().reverse();

  // Stats (always from all transactions)
  const totalExpense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const activeFilters = filters.filter((f) => f.is_active).length;
  const overrideCount = transactions.filter((t) => t.hidden_override).length;

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-gray-900 dark:bg-gray-100 flex items-center justify-center">
          <Filter className="h-4 w-4 text-gray-100 dark:text-gray-900" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Contabilitate privată</h1>
          <p className="text-xs text-muted-foreground">Tranzacții excluse din statistici principale</p>
        </div>
      </div>

      {/* Mini stats */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-card px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Hash className="h-3 w-3" /> Tranzacții
            </p>
            <p className="text-2xl font-semibold">{transactions.length}</p>
            {overrideCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{overrideCount} excepție/excepții</p>
            )}
          </div>
          <div className="rounded-xl border bg-card px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <TrendingDown className="h-3 w-3 text-red-400" /> Cheltuieli
            </p>
            <p className="text-2xl font-semibold text-red-500">{totalExpense.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">total cumulat</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-emerald-400" /> Venituri
            </p>
            <p className="text-2xl font-semibold text-emerald-500">{totalIncome.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">total cumulat</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Filter className="h-3 w-3" /> Filtre
            </p>
            <p className="text-2xl font-semibold">{filters.length}</p>
            <p className="text-xs text-muted-foreground">{activeFilters} activ/active</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab("filters")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "filters"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Filtre ascunse
        </button>
        <button
          onClick={() => setTab("salary")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "salary"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Corecție salariu
        </button>
      </div>

      {tab === "salary" && <SalaryBlock />}

      {tab === "filters" && <>

      {/* Per-filter stats — collapsible */}
      {!loading && filters.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <button
            onClick={() => setStatsExpanded((v) => !v)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          >
            {statsExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <span className="text-sm font-medium flex-1">Statistici pe filtre</span>
            {!statsExpanded && (
              <span className="text-xs text-muted-foreground">
                {filters.filter((f) => transactions.filter((t) => t.matched_filter?.id === f.id).length > 0).length} filtre cu date
              </span>
            )}
          </button>

          {statsExpanded && (
            <div className="divide-y divide-border/50">
              {filters.map((f) => {
                const ftxns = transactions.filter((t) => t.matched_filter?.id === f.id);
                if (ftxns.length === 0) return null;
                const meta = MATCH_TYPE_META[f.match_type];
                const exp = ftxns.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
                const inc = ftxns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
                const months = new Set(ftxns.map((t) => t.transaction_date.slice(0, 7))).size;
                const overrides = ftxns.filter((t) => t.hidden_override).length;

                return (
                  <div key={f.id} className="px-4 py-3 space-y-1.5">
                    {/* Filter name + type badge */}
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm ${meta.badge}`}>
                        {meta.label}
                      </span>
                      <span className="text-sm font-medium">{f.name}</span>
                      {!f.is_active && <span className="text-xs text-muted-foreground">(inactiv)</span>}
                    </div>

                    {/* Summary row */}
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-muted-foreground">{ftxns.length} tranzacții</span>
                      <span className="text-muted-foreground">{months} luni</span>
                      {exp > 0 && <span className="text-red-500 font-mono font-medium">−{exp.toFixed(2)}</span>}
                      {inc > 0 && <span className="text-emerald-500 font-mono font-medium">+{inc.toFixed(2)}</span>}
                      {overrides > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">{overrides} excepție</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Filters section — collapsible */}
      <div className="border rounded-xl overflow-hidden">
        <button
          onClick={() => { setFiltersExpanded((v) => !v); setShowAddFilter(false); }}
          className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        >
          {filtersExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-medium flex-1">Filtre</span>
          {/* Compact pills when collapsed */}
          {!filtersExpanded && filters.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-[80%]">
              {filters.slice(0, 5).map((f) => {
                const meta = MATCH_TYPE_META[f.match_type];
                return (
                  <span
                    key={f.id}
                    className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                      f.is_active ? meta.pill : "bg-muted border-border text-muted-foreground opacity-40"
                    }`}
                  >
                    <span className="opacity-60 font-mono">{meta.label}</span>
                    <span className="font-medium">{f.name}</span>
                  </span>
                );
              })}
              {filters.length > 5 && (
                <span className="text-xs text-muted-foreground">+{filters.length - 5}</span>
              )}
            </div>
          )}
          {filters.length === 0 && !filtersExpanded && (
            <span className="text-xs text-muted-foreground">niciun filtru</span>
          )}
        </button>

        {filtersExpanded && (
          <div className="p-4 space-y-3 border-t">
            <div className="flex justify-end">
              <button
                onClick={() => { setShowAddFilter(true); setEditingFilter(null); }}
                className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Filtru nou
              </button>
            </div>

            {showAddFilter && (
              <FilterForm
                categories={categories}
                onSave={handleCreateFilter}
                onCancel={() => setShowAddFilter(false)}
              />
            )}

            {filters.length === 0 && !showAddFilter && (
              <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                Niciun filtru. Adăugați un filtru pentru a ascunde tranzacțiile.
              </div>
            )}

            <div className="space-y-2">
              {filters.map((f) => (
                <div key={f.id}>
                  {editingFilter?.id === f.id ? (
                    <FilterForm
                      initial={f}
                      categories={categories}
                      onSave={(data) => handleUpdateFilter(f.id, data)}
                      onCancel={() => setEditingFilter(null)}
                    />
                  ) : (
                    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${f.is_active ? "bg-card" : "bg-muted/30 opacity-60"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm ${MATCH_TYPE_META[f.match_type].badge}`}>
                            {MATCH_TYPE_META[f.match_type].label}
                          </span>
                          <p className="text-sm font-medium truncate">{f.name}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate pl-0.5">
                          {f.match_type === "category" ? f.category_name : f.pattern}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => updateHiddenFilter(f.id, { is_active: !f.is_active }).then(load)}
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                          title={f.is_active ? "Dezactivare" : "Activare"}
                        >
                          {f.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                        </button>
                        <button
                          onClick={() => setEditingFilter(f)}
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteFilter(f.id)}
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Tranzacții ascunse</h2>
          {transactions.length > 0 && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{transactions.length}</span>
          )}
        </div>

        {/* Filter by rule pills */}
        {!loading && transactions.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedFilterId(null)}
              className={`h-7 px-3 text-xs rounded-full border transition-colors ${
                selectedFilterId === null
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-accent border-border"
              }`}
            >
              Toate
            </button>
            {filters.map((f) => {
              const count = transactions.filter((t) => t.matched_filter?.id === f.id).length;
              if (count === 0) return null;
              const active = selectedFilterId === f.id;
              const meta = MATCH_TYPE_META[f.match_type];
              return (
                <button
                  key={f.id}
                  onClick={() => setSelectedFilterId(active ? null : f.id)}
                  className={`h-7 px-2.5 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                    active ? meta.activePill : meta.pill
                  }`}
                >
                  <span className="font-mono opacity-70">{meta.label}</span>
                  <span className="font-medium">{f.name}</span>
                  <span className="opacity-60">{count}</span>
                </button>
              );
            })}
            {overrideCount > 0 && (
              <button
                onClick={() => setSelectedFilterId(selectedFilterId === "override" ? null : "override")}
                className={`h-7 px-3 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                  selectedFilterId === "override"
                    ? "bg-amber-500 text-white border-amber-500"
                    : "hover:bg-accent border-border text-amber-600 dark:text-amber-400"
                }`}
              >
                <Eye className="h-3 w-3" />
                Excepții
                <span className="opacity-60">{overrideCount}</span>
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="text-sm text-muted-foreground text-center py-8">Se încarcă...</div>
        )}

        {!loading && transactions.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
            Nicio tranzacție ascunsă. Adăugați filtre sau activați filtrele existente.
          </div>
        )}

        {months.map((monthKey) => {
          const monthTxns = grouped[monthKey];
          const collapsed = collapsedMonths.has(monthKey);
          const totalExp = monthTxns.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
          const totalInc = monthTxns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);

          return (
            <div key={monthKey} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleMonth(monthKey)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
              >
                {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium text-sm flex-1">{formatMonth(monthKey)}</span>
                <span className="text-xs text-muted-foreground mr-2">{monthTxns.length}</span>
                {totalExp > 0 && (
                  <span className="text-xs text-red-500 font-mono">-{totalExp.toFixed(2)}</span>
                )}
                {totalInc > 0 && (
                  <span className="text-xs text-emerald-500 font-mono ml-1">+{totalInc.toFixed(2)}</span>
                )}
              </button>

              {!collapsed && (
                <div className="divide-y divide-border/50">
                  {monthTxns.map((txn) => (
                    <div
                      key={txn.id}
                      className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                        txn.hidden_override
                          ? "bg-amber-50/50 dark:bg-amber-950/20"
                          : "hover:bg-muted/20"
                      }`}
                    >
                      <button
                        onClick={() => handleToggle(txn.id)}
                        disabled={togglingId === txn.id}
                        className={`h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md transition-colors ${
                          txn.hidden_override
                            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/40"
                            : "hover:bg-accent text-muted-foreground"
                        }`}
                        title={txn.hidden_override ? "Ascunde din nou" : "Arată în statistici principale"}
                      >
                        {togglingId === txn.id ? (
                          <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : txn.hidden_override ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" />
                        )}
                      </button>

                      <span className="text-xs text-muted-foreground flex-shrink-0 w-20">{txn.transaction_date}</span>

                      <div className="flex-1 min-w-0">
                        <p className={`truncate ${txn.hidden_override ? "text-foreground" : "text-muted-foreground"}`}>
                          {txn.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {txn.category_name && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: txn.category_color || "#94a3b8" }}
                            >
                              {txn.category_name}
                            </span>
                          )}
                          {txn.matched_filter && (
                            <span className="text-xs text-muted-foreground">
                              {txn.hidden_override ? (
                                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                  <AlertCircle className="h-3 w-3" />
                                  excepție din &ldquo;{txn.matched_filter.name}&rdquo;
                                </span>
                              ) : (
                                <span>filtru: {txn.matched_filter.name}</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className={`font-mono text-sm font-medium ${txn.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                          {txn.type === "income" ? "+" : ""}{Math.abs(txn.amount).toFixed(2)}
                          <span className="text-xs ml-1 text-muted-foreground">{txn.account_currency}</span>
                        </p>
                        {txn.original_currency && txn.original_currency !== txn.account_currency && (
                          <p className="text-xs text-muted-foreground font-mono">
                            {Math.abs(txn.original_amount || txn.amount).toFixed(2)} {txn.original_currency}
                          </p>
                        )}
                      </div>

                      {txn.hidden_override ? (
                        <span title="Vizibil în statistici"><Check className="h-4 w-4 text-amber-500 flex-shrink-0" /></span>
                      ) : (
                        <span title="Ascuns din statistici"><X className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" /></span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>}
    </div>
  );
}
