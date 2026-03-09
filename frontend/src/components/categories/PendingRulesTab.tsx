import { useState, useCallback } from "react";
import { Trash2, Pencil, Check, X, CheckCheck, Eye, Loader2, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateCategoryRule,
  deleteCategoryRule,
  approveRule,
  approveRulesBulk,
  getRuleSampleTransactions,
  refreshAICategorization,
} from "@/lib/api";
import type { Category, Rule, SampleTransaction } from "./types";
import { CategorySelectItems } from "./CategorySelect";

interface Props {
  categories: Category[];
  pendingRules: Rule[];
  reload: () => void;
  setAiStatus: (s: string) => void;
}

export default function PendingRulesTab({ categories, pendingRules, reload, setAiStatus }: Props) {
  const [selectedPending, setSelectedPending] = useState<Set<number>>(new Set());
  const [mergeCategoryId, setMergeCategoryId] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editRulePattern, setEditRulePattern] = useState("");
  const [editRuleCategoryId, setEditRuleCategoryId] = useState("");
  const [expandedRuleId, setExpandedRuleId] = useState<number | null>(null);
  const [sampleTxns, setSampleTxns] = useState<SampleTransaction[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const LS_KEY = "pending-rules-collapsed";
  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const toggleCollapse = useCallback((catId: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      localStorage.setItem(LS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const toggleSamples = async (ruleId: number) => {
    if (expandedRuleId === ruleId) {
      setExpandedRuleId(null);
      return;
    }
    setExpandedRuleId(ruleId);
    setLoadingSamples(true);
    try {
      const txns = await getRuleSampleTransactions(ruleId);
      setSampleTxns(txns);
    } catch {
      setSampleTxns([]);
    }
    setLoadingSamples(false);
  };

  const startEditRule = (r: Rule) => {
    setEditingRuleId(r.id);
    setEditRulePattern(r.pattern);
    setEditRuleCategoryId(String(r.category_id));
  };

  const saveEditRule = async () => {
    if (editingRuleId === null) return;
    await updateCategoryRule(editingRuleId, {
      pattern: editRulePattern,
      category_id: parseInt(editRuleCategoryId),
    });
    setEditingRuleId(null);
    reload();
  };

  const togglePending = (id: number) => {
    setSelectedPending((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllPending = () => {
    if (selectedPending.size === pendingRules.length) {
      setSelectedPending(new Set());
    } else {
      setSelectedPending(new Set(pendingRules.map((r) => r.id)));
    }
  };

  const handleApproveSelected = async () => {
    if (selectedPending.size === 0) return;
    const result = await approveRulesBulk(Array.from(selectedPending));
    setAiStatus(`${result.approved} reguli aprobate, aplicate la ${result.applied_to} tranzacții.`);
    setSelectedPending(new Set());
    reload();
  };

  const handleApproveSingle = async (id: number) => {
    const result = await approveRule(id);
    setAiStatus(`Regulă aprobată, aplicată la ${result.applied_to} tranzacții.`);
    reload();
  };

  const handleRejectSelected = async () => {
    for (const id of selectedPending) {
      await deleteCategoryRule(id);
    }
    setSelectedPending(new Set());
    reload();
  };

  const handleBulkCategoryPending = async () => {
    if (selectedPending.size === 0 || !mergeCategoryId) return;
    for (const id of selectedPending) {
      await updateCategoryRule(id, { category_id: parseInt(mergeCategoryId) });
    }
    setSelectedPending(new Set());
    setMergeCategoryId("");
    reload();
  };

  // Flatten all categories recursively for lookups
  type AnyCategory = { id: number; name: string; color: string; parent_id?: number | null; subcategories?: AnyCategory[] };
  const flattenAll = (cats: AnyCategory[]): AnyCategory[] =>
    cats.flatMap((c) => [c, ...flattenAll(c.subcategories || [])]);
  const allFlat = flattenAll(categories);

  // Group rules by category
  const grouped = new Map<number, { name: string; parentName: string | null; color: string; rules: Rule[] }>();
  for (const r of pendingRules) {
    if (!grouped.has(r.category_id)) {
      const cat = allFlat.find((c) => c.id === r.category_id);
      const parent = cat?.parent_id ? allFlat.find((c) => c.id === cat.parent_id) : null;
      grouped.set(r.category_id, {
        name: r.category_name,
        parentName: parent?.name ?? null,
        color: cat?.color || "#94a3b8",
        rules: [],
      });
    }
    grouped.get(r.category_id)!.rules.push(r);
  }

  return (
    <div className="space-y-4">
      {/* Action blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Review actions */}
        <Card>
          <CardContent className="pt-4 pb-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <CheckCheck className="h-4 w-4 text-green-600 shrink-0" />
              <span className="text-sm font-medium">Verifică propunerile</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Aprobă regulile bune — vor fi aplicate automat la tranzacțiile viitoare. Șterge pe cele greșite.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={toggleAllPending}>
                {selectedPending.size === pendingRules.length ? "Deselectează" : "Selectează tot"}
              </Button>
              {selectedPending.size > 0 && (
                <>
                  <Button size="sm" onClick={handleApproveSelected}>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Aprobă ({selectedPending.size})
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleRejectSelected}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Șterge ({selectedPending.size})
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Regenerate with AI */}
        <Card>
          <CardContent className="pt-4 pb-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500 shrink-0" />
              <span className="text-sm font-medium">Regenerează cu AI</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Șterge toate propunerile de aici și trimite tranzacțiile fără categorie (max 50) la AI. Cele deja categorisate nu sunt afectate.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  const result = await refreshAICategorization();
                  setAiStatus(
                    result.error
                      ? `Eroare: ${result.error}`
                      : `Șterse ${result.deleted_pending} vechi. AI a propus ${result.pending ?? 0} reguli noi, categorisit ${result.categorized ?? 0} tranzacții.`
                  );
                } catch (e) {
                  setAiStatus(`Eroare: ${e}`);
                }
                setRefreshing(false);
                reload();
              }}
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Regenerează
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Bulk move category bar */}
      {selectedPending.size > 0 && (
        <div className="flex gap-2 flex-wrap items-center border rounded-lg p-3 bg-accent/50">
          <span className="text-sm font-medium">Mută {selectedPending.size} reguli în categoria:</span>
          <Select value={mergeCategoryId} onValueChange={setMergeCategoryId}>
            <SelectTrigger className="w-[200px] h-8">
              <SelectValue placeholder="Alege categorie" />
            </SelectTrigger>
            <SelectContent>
              <CategorySelectItems categories={categories} />
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleBulkCategoryPending} disabled={!mergeCategoryId}>
            <Check className="h-3.5 w-3.5 mr-1" /> Aplică
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {Array.from(grouped.entries()).map(([catId, group]) => (
          <div key={catId} className="border rounded-lg overflow-hidden">
            <div
              className="flex items-center gap-2 px-3 py-2 bg-accent/50 cursor-pointer select-none hover:bg-accent/70 transition-colors"
              onClick={() => toggleCollapse(catId)}
            >
              {collapsed.has(catId)
                ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
              <span className="text-sm font-medium flex-1">
                {group.parentName && <span className="text-muted-foreground">{group.parentName} › </span>}
                {group.name}
              </span>
              <Badge variant="secondary" className="text-xs">{group.rules.length}</Badge>
            </div>
            {!collapsed.has(catId) && <div className="divide-y">
              {group.rules.map((r) => (
                <div key={r.id} className="px-3 py-1.5">
                  {editingRuleId === r.id ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedPending.has(r.id)}
                        onChange={() => togglePending(r.id)}
                        className="shrink-0"
                      />
                      <Input
                        value={editRulePattern}
                        onChange={(e) => setEditRulePattern(e.target.value)}
                        className="h-7 w-[160px] text-sm font-mono"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEditRule();
                          if (e.key === "Escape") setEditingRuleId(null);
                        }}
                        autoFocus
                      />
                      <span className="text-muted-foreground">&rarr;</span>
                      <Select value={editRuleCategoryId} onValueChange={setEditRuleCategoryId}>
                        <SelectTrigger className="h-7 w-[180px] text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <CategorySelectItems categories={categories} />
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEditRule}>
                        <Check className="h-3 w-3 text-green-600" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingRuleId(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className={`flex items-center gap-2 text-sm cursor-pointer rounded p-1 -m-1 ${
                        selectedPending.has(r.id) ? "bg-primary/10" : "hover:bg-accent"
                      }`}
                      onClick={() => togglePending(r.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPending.has(r.id)}
                        onChange={() => togglePending(r.id)}
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Badge variant="outline" className="font-mono text-xs">{r.pattern}</Badge>
                      {r.match_count != null && (
                        <span className="text-[10px] text-muted-foreground">{r.match_count}</span>
                      )}
                      <span className="flex-1 text-xs text-muted-foreground truncate">
                        {r.source_example || ""}
                      </span>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                        title="Arată tranzacții"
                        onClick={(e) => { e.stopPropagation(); toggleSamples(r.id); }}
                      >
                        {loadingSamples && expandedRuleId === r.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Eye className={`h-3 w-3 ${expandedRuleId === r.id ? "text-primary" : ""}`} />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                        onClick={(e) => { e.stopPropagation(); startEditRule(r); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleApproveSingle(r.id); }}
                      >
                        <Check className="h-3 w-3 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                        onClick={(e) => { e.stopPropagation(); deleteCategoryRule(r.id).then(reload); }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  )}
                  {expandedRuleId === r.id && !loadingSamples && (
                    <div className="mt-1 ml-6 space-y-1 pb-1">
                      {sampleTxns.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nu s-au găsit tranzacții</p>
                      ) : sampleTxns.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5">
                          <span className="text-muted-foreground shrink-0">{t.date}</span>
                          <span className={`font-medium shrink-0 ${t.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                            {t.amount > 0 ? "+" : ""}{t.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} {t.currency}
                          </span>
                          <span className="truncate">{t.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}
