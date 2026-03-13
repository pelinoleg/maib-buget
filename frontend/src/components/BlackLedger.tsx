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

const MATCH_TYPE_LABELS: Record<string, string> = {
  contains: "Conține",
  regex: "Regex",
  category: "Categorie",
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

export default function BlackLedger() {
  const [filters, setFilters] = useState<HiddenFilter[]>([]);
  const [transactions, setTransactions] = useState<HiddenTransaction[]>([]);
  const [categories, setCategories] = useState<CatType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [editingFilter, setEditingFilter] = useState<HiddenFilter | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
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

  const grouped = groupByMonth(transactions);
  const months = Object.keys(grouped).sort().reverse();

  // Stats
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
              <Hash className="h-3 w-3" /> Tranzacții ascunse
            </p>
            <p className="text-2xl font-semibold">{transactions.length}</p>
            {overrideCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{overrideCount} excepție/excepții</p>
            )}
          </div>
          <div className="rounded-xl border bg-card px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <TrendingDown className="h-3 w-3 text-red-400" /> Cheltuieli ascunse
            </p>
            <p className="text-2xl font-semibold text-red-500">{totalExpense.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">total cumulat</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-emerald-400" /> Venituri ascunse
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

      {/* Filters section — collapsible */}
      <div className="border rounded-xl overflow-hidden">
        <button
          onClick={() => { setFiltersExpanded((v) => !v); setShowAddFilter(false); }}
          className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        >
          {filtersExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-medium flex-1">Filtre de ascundere</span>
          {/* Compact pills when collapsed */}
          {!filtersExpanded && filters.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-[60%]">
              {filters.slice(0, 5).map((f) => (
                <span
                  key={f.id}
                  className={`text-xs px-2 py-0.5 rounded-full border font-mono ${
                    f.is_active
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted border-border text-muted-foreground opacity-50"
                  }`}
                >
                  {f.name}
                </span>
              ))}
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
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${f.is_active ? "bg-emerald-500" : "bg-gray-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded mr-1">{MATCH_TYPE_LABELS[f.match_type]}</span>
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
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Tranzacții ascunse</h2>
          {transactions.length > 0 && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{transactions.length}</span>
          )}
        </div>

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
    </div>
  );
}
