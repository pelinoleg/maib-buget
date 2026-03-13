import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, AlertCircle, Check, X, Pencil } from "lucide-react";
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
  const [txns, setTxns] = useState<SalaryTxn[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());

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
      const data = await getSalaryTransactions({ patterns });
      setTxns(data.transactions);
    } finally {
      setLoading(false);
    }
  }, [patterns]);

  useEffect(() => { load(); }, [load]);

  // Collapse all years except the most recent on data load
  useEffect(() => {
    if (txns.length > 0) {
      const years = [...new Set(txns.map((t) => t.transaction_date.slice(0, 4)))].sort().reverse();
      setCollapsedYears(new Set(years.slice(1)));
    }
  }, [txns]);

  const addPattern = () => {
    if (!newPatternText.trim()) return;
    setPatterns((prev) => [...prev, { text: newPatternText.trim(), match_type: newPatternType }]);
    setNewPatternText("");
    setAddingPattern(false);
  };

  const removePattern = (i: number) => setPatterns((prev) => prev.filter((_, idx) => idx !== i));

  const startEdit = (t: SalaryTxn) => {
    setEditingId(t.id);
    setEditValue(t.adjustment !== null ? String(Math.abs(t.adjustment)) : "");
  };

  const saveEdit = async (txn: SalaryTxn) => {
    const val = parseFloat(editValue.replace(",", "."));
    setSaving(true);
    try {
      if (editValue.trim() === "" || isNaN(val)) {
        if (txn.adjustment !== null) await deleteSalaryAdjustment(txn.id);
      } else {
        await upsertSalaryAdjustment({ transaction_id: txn.id, adjustment: -Math.abs(val) });
      }
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => setEditingId(null);

  const toggleYear = (y: string) => {
    setCollapsedYears((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y); else next.add(y);
      return next;
    });
  };

  // Group by year
  const byYear: Record<string, SalaryTxn[]> = {};
  for (const t of txns) {
    const y = t.transaction_date.slice(0, 4);
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(t);
  }
  const years = Object.keys(byYear).sort().reverse();

  const totalReal = txns.reduce((s, t) => s + t.amount, 0);
  const totalAdjusted = txns.reduce((s, t) => s + (t.adjusted_amount ?? t.amount), 0);
  const totalDiff = totalAdjusted - totalReal;
  const hasAdjustments = txns.some((t) => t.adjustment !== null);

  return (
    <div className="space-y-4">
      {/* Toolbar: patterns */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
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

      {loading && <div className="text-sm text-muted-foreground text-center py-6">Se încarcă...</div>}
      {!loading && txns.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-6">Nicio tranzacție găsită</div>
      )}

      <div className="space-y-4">
        {years.map((year) => {
          const yearTxns = byYear[year];
          const collapsed = collapsedYears.has(year);
          const yearReal = yearTxns.reduce((s, t) => s + t.amount, 0);
          const yearAdj = yearTxns.reduce((s, t) => s + (t.adjusted_amount ?? t.amount), 0);
          const yearDiff = yearAdj - yearReal;
          const yearHasAdj = yearTxns.some((t) => t.adjustment !== null);

          return (
            <div key={year}>
              {/* Year header */}
              <button
                onClick={() => toggleYear(year)}
                className="w-full flex items-center gap-3 px-1 mb-2 hover:opacity-80 transition-opacity text-left"
              >
                {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                <span className="text-sm font-semibold text-muted-foreground">{year}</span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">{yearTxns.length}</span>
                {yearHasAdj && (
                  <>
                    <span className="text-xs font-mono text-muted-foreground">{yearReal.toFixed(2)} →</span>
                    <span className="text-xs font-mono font-medium">{yearAdj.toFixed(2)}</span>
                    <span className={`text-xs font-mono ${yearDiff < 0 ? "text-red-500" : "text-emerald-500"}`}>({yearDiff.toFixed(2)})</span>
                  </>
                )}
              </button>

              {!collapsed && (
                <div className="border rounded-xl overflow-hidden">
                  <div className="divide-y divide-border/50">
                    {yearTxns.map((t) => {
                      const isExpanded = expandedId === t.id;
                      return (
                        <div key={t.id} className={t.adjustment !== null ? "bg-amber-50/40 dark:bg-amber-950/15" : ""}>
                          {/* Main row */}
                          <div className="flex items-center gap-3 px-4 py-3 text-sm">
                            <span className="text-xs text-muted-foreground flex-shrink-0 w-20">{t.transaction_date}</span>
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => setExpandedId(isExpanded ? null : t.id)}
                            >
                              <p className={`text-xs truncate ${isExpanded ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                                {t.description}
                              </p>
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

                          {/* Expanded description */}
                          {isExpanded && (
                            <div className="px-4 pb-3 pt-0 text-xs text-muted-foreground border-t border-border/40 bg-muted/20">
                              <p className="break-all leading-relaxed pt-2">{t.description}</p>
                              {t.account_name && (
                                <p className="mt-1 text-muted-foreground/70">{t.account_name} · {t.currency}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
  const [selectedFilterId, setSelectedFilterId] = useState<number | "override" | null>(null);
  const [statsExpanded, setStatsExpanded] = useState(false);
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

  // Group months by year for nested display
  const byYear: Record<string, string[]> = {};
  for (const m of months) {
    const y = m.slice(0, 4);
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(m);
  }
  const years = Object.keys(byYear).sort().reverse();

  // Stats (always from all transactions)
  const overrideCount = transactions.filter((t) => t.hidden_override).length;

  // All months collapsed by default except the most recent — initialize when data loads
  useEffect(() => {
    if (transactions.length > 0) {
      const allMonths = Object.keys(groupByMonth(transactions)).sort().reverse();
      // collapse all except the first (most recent)
      setCollapsedMonths(new Set(allMonths.slice(1)));
    }
  }, [transactions]);

  return (
    <div className="space-y-5">
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

      {tab === "salary" && <div className="max-w-4xl mx-auto"><SalaryBlock /></div>}

      {tab === "filters" && (
        <div className={`grid grid-cols-1 gap-5 items-start ${showAddFilter || editingFilter ? "lg:grid-cols-[500px_1fr]" : "lg:grid-cols-[340px_1fr]"} transition-all`}>

          {/* LEFT: Filter list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Filtre</h2>
              <button
                onClick={() => { setShowAddFilter(true); setEditingFilter(null); }}
                className="flex items-center gap-1 h-7 px-2.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-3 w-3" />
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

            {!loading && filters.length === 0 && !showAddFilter && (
              <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                Niciun filtru. Adăugați primul filtru.
              </div>
            )}

            <div className="space-y-1.5">
              {filters.map((f) => {
                const meta = MATCH_TYPE_META[f.match_type];
                const isSelected = selectedFilterId === f.id;

                return (
                  <div key={f.id}>
                    {editingFilter?.id === f.id ? (
                      <FilterForm
                        initial={f}
                        categories={categories}
                        onSave={(data) => handleUpdateFilter(f.id, data)}
                        onCancel={() => setEditingFilter(null)}
                      />
                    ) : (
                      <div
                        className={`rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                          isSelected
                            ? "border-primary/50 bg-primary/5"
                            : f.is_active
                            ? "bg-card hover:bg-muted/30"
                            : "bg-muted/20 opacity-60"
                        }`}
                        onClick={() => setSelectedFilterId(isSelected ? null : f.id)}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-mono px-1 py-0.5 rounded-sm flex-shrink-0 ${meta.badge}`}>
                                {meta.label}
                              </span>
                              <span className="text-sm font-medium truncate">{f.name}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
                              {f.match_type === "category" ? f.category_name : f.pattern}
                            </p>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => updateHiddenFilter(f.id, { is_active: !f.is_active }).then(load)}
                              className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent transition-colors"
                              title={f.is_active ? "Dezactivare" : "Activare"}
                            >
                              {f.is_active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
                            </button>
                            <button
                              onClick={() => { setEditingFilter(f); setShowAddFilter(false); }}
                              className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent transition-colors"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteFilter(f.id)}
                              className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 text-destructive transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Statistici pe filtre — collapsible at bottom of sidebar */}
            {!loading && filters.length > 0 && transactions.length > 0 && (
              <div className="border rounded-lg overflow-hidden mt-2">
                <button
                  onClick={() => setStatsExpanded((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                >
                  {statsExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-xs font-medium flex-1">Statistici pe filtre</span>
                </button>
                {statsExpanded && (
                  <div className="divide-y divide-border/50">
                    {filters.map((f) => {
                      const ftxns = transactions.filter((t) => t.matched_filter?.id === f.id);
                      if (ftxns.length === 0) return null;
                      const meta = MATCH_TYPE_META[f.match_type];
                      const txnCount = ftxns.length;
                      const monthCount = new Set(ftxns.map((t) => t.transaction_date.slice(0, 7))).size;

                      // Group expenses by currency
                      const expByCurrency: Record<string, number> = {};
                      for (const t of ftxns.filter((t) => t.type === "expense")) {
                        const cur = t.account_currency ?? "?";
                        expByCurrency[cur] = (expByCurrency[cur] ?? 0) + Math.abs(t.amount);
                      }
                      const incByCurrency: Record<string, number> = {};
                      for (const t of ftxns.filter((t) => t.type === "income")) {
                        const cur = t.account_currency ?? "?";
                        incByCurrency[cur] = (incByCurrency[cur] ?? 0) + t.amount;
                      }

                      return (
                        <div key={f.id} className="px-3 py-3 space-y-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-mono px-1 py-0.5 rounded-sm flex-shrink-0 ${meta.badge}`}>{meta.label}</span>
                            <span className="text-xs font-medium truncate">{f.name}</span>
                            {!f.is_active && <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">inactiv</span>}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {txnCount} tranzacții · {monthCount} {monthCount === 1 ? "lună" : "luni"}
                          </div>
                          {Object.keys(expByCurrency).length > 0 && (
                            <div className="space-y-0.5">
                              {Object.entries(expByCurrency).map(([cur, sum]) => (
                                <div key={cur} className="flex items-center justify-between text-[11px]">
                                  <span className="text-muted-foreground">Cheltuieli</span>
                                  <span className="font-mono text-red-500">−{sum.toFixed(2)} <span className="opacity-60">{cur}</span></span>
                                </div>
                              ))}
                            </div>
                          )}
                          {Object.keys(incByCurrency).length > 0 && (
                            <div className="space-y-0.5">
                              {Object.entries(incByCurrency).map(([cur, sum]) => (
                                <div key={cur} className="flex items-center justify-between text-[11px]">
                                  <span className="text-muted-foreground">Venituri</span>
                                  <span className="font-mono text-emerald-500">+{sum.toFixed(2)} <span className="opacity-60">{cur}</span></span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Filter pills + Transactions */}
          <div className="space-y-3 min-w-0">
            {/* Compact stats bar */}
            {!loading && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground border-b pb-2">
                <button
                  onClick={() => {
                    const allMonths = months;
                    const allCollapsed = allMonths.every((m) => collapsedMonths.has(m));
                    setCollapsedMonths(allCollapsed ? new Set() : new Set(allMonths));
                  }}
                  className="flex items-center gap-1 hover:text-foreground transition-colors flex-shrink-0"
                  title={months.every((m) => collapsedMonths.has(m)) ? "Extinde toate" : "Colapsează toate"}
                >
                  {months.every((m) => collapsedMonths.has(m))
                    ? <ChevronRight className="h-3 w-3" />
                    : <ChevronDown className="h-3 w-3" />}
                </button>
                <span>
                  <span className="font-medium text-foreground">{transactions.length}</span> tranzacții
                </span>
                <span>
                  <span className="font-mono font-medium text-red-500">
                    −{transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0).toFixed(2)}
                  </span>
                  {" "}cheltuieli
                </span>
                <span>
                  <span className="font-medium text-foreground">{filters.filter((f) => f.is_active).length}/{filters.length}</span> filtre active
                </span>
                {overrideCount > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {overrideCount} excepție
                  </span>
                )}
              </div>
            )}

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
                  Toate ({transactions.length})
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

            <div className="space-y-4">
              {years.map((year) => {
                const yearMonths = byYear[year];
                const yearTxns = yearMonths.flatMap((m) => grouped[m]);
                const yearExp = yearTxns.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
                const yearInc = yearTxns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);

                return (
                  <div key={year}>
                    {/* Year header */}
                    <div className="flex items-center gap-3 mb-2 px-1">
                      <span className="text-sm font-semibold text-muted-foreground">{year}</span>
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground">{yearTxns.length}</span>
                      {yearExp > 0 && <span className="text-xs text-red-500 font-mono">−{yearExp.toFixed(2)}</span>}
                      {yearInc > 0 && <span className="text-xs text-emerald-500 font-mono">+{yearInc.toFixed(2)}</span>}
                    </div>

                    <div className="space-y-1.5">
                      {yearMonths.map((monthKey) => {
                        const monthTxns = grouped[monthKey];
                        const collapsed = collapsedMonths.has(monthKey);
                        const totalExp = monthTxns.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
                        const totalInc = monthTxns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
                        const [, m] = monthKey.split("-");
                        const monthLabel = MONTH_NAMES[parseInt(m) - 1];

                        return (
                          <div key={monthKey} className="border rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleMonth(monthKey)}
                              className="w-full flex items-center gap-3 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                            >
                              {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              <span className="font-medium text-sm flex-1">{monthLabel}</span>
                              <span className="text-xs text-muted-foreground mr-2">{monthTxns.length}</span>
                              {totalExp > 0 && (
                                <span className="text-xs text-red-500 font-mono">−{totalExp.toFixed(2)}</span>
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
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
