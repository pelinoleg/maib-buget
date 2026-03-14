import { useState } from "react";
import { Plus, Trash2, Pencil, Check, X, BookOpen, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCategoryRule, updateCategoryRule, deleteCategoryRule, applyRules, reapplyAllRules, previewCategoryRule } from "@/lib/api";
import type { Category, Rule } from "./types";
import { CategorySelectItems } from "./CategorySelect";

function textColorForBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#1a1a1a" : "#ffffff";
}

interface Props {
  categories: Category[];
  rules: Rule[];
  reload: () => void;
  setAiStatus: (s: string) => void;
}

export default function RulesTab({ categories, rules, reload, setAiStatus }: Props) {
  const [newPattern, setNewPattern] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");
  const [newMatchType, setNewMatchType] = useState<"contains" | "regex">("contains");
  const [newPriority, setNewPriority] = useState(1);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editRulePattern, setEditRulePattern] = useState("");
  const [editRuleCategoryId, setEditRuleCategoryId] = useState("");
  const [editMatchType, setEditMatchType] = useState<"contains" | "regex">("contains");
  const [editPriority, setEditPriority] = useState(1);
  const [selectedRules, setSelectedRules] = useState<Set<number>>(new Set());
  const [mergeCategoryId, setMergeCategoryId] = useState("");
  const [preview, setPreview] = useState<{ count: number; uncategorized: number; examples: { id: number; description: string; amount: number; date: string }[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(5);
  const handleCreateRule = async () => {
    if (!newPattern.trim() || !ruleCategory) return;
    const result = await createCategoryRule({ pattern: newPattern, category_id: parseInt(ruleCategory), match_type: newMatchType, priority: newPriority });
    setNewPattern("");
    setNewMatchType("contains");
    setNewPriority(1);
    setPreview(null);
    setAiStatus(`Regulă creată. Aplicată la ${result.applied_to} tranzacții.`);
    reload();
  };

  const handlePreview = async () => {
    if (!newPattern.trim()) return;
    setPreviewing(true);
    try {
      const result = await previewCategoryRule({ pattern: newPattern, category_id: parseInt(ruleCategory) || 0, match_type: newMatchType, priority: newPriority });
      setPreview(result);
      setPreviewVisible(5);
    } finally {
      setPreviewing(false);
    }
  };

  const startEditRule = (r: Rule) => {
    setEditingRuleId(r.id);
    setEditRulePattern(r.pattern);
    setEditRuleCategoryId(String(r.category_id));
    setEditMatchType((r.match_type as "contains" | "regex") || "contains");
    setEditPriority(r.priority || 1);
  };

  const saveEditRule = async () => {
    if (editingRuleId === null) return;
    await updateCategoryRule(editingRuleId, {
      pattern: editRulePattern,
      category_id: parseInt(editRuleCategoryId),
      match_type: editMatchType,
      priority: editPriority,
    });
    setEditingRuleId(null);
    reload();
  };

  const toggleRule = (id: number) => {
    setSelectedRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllRules = () => {
    if (selectedRules.size === rules.length) {
      setSelectedRules(new Set());
    } else {
      setSelectedRules(new Set(rules.map((r) => r.id)));
    }
  };

  const handleBulkCategoryRules = async () => {
    if (selectedRules.size === 0 || !mergeCategoryId) return;
    for (const id of selectedRules) {
      await updateCategoryRule(id, { category_id: parseInt(mergeCategoryId) });
    }
    setSelectedRules(new Set());
    setMergeCategoryId("");
    reload();
  };

  const handleDeleteSelectedRules = async () => {
    for (const id of selectedRules) {
      await deleteCategoryRule(id);
    }
    setSelectedRules(new Set());
    reload();
  };

  // Group rules following parent→subcategory hierarchy (same order as CategoriesTab)
  const topCategories = categories.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name));

  // Flatten all categories recursively for lookups
  type AnyCategory = { id: number; name: string; color: string; subcategories?: AnyCategory[] };
  const flattenAll = (cats: AnyCategory[]): AnyCategory[] =>
    cats.flatMap((c) => [c, ...flattenAll(c.subcategories || [])]);
  const allFlat = flattenAll(categories);

  // Index rules by category_id
  const rulesByCat = new Map<number, Rule[]>();
  for (const r of rules) {
    (rulesByCat.get(r.category_id) ?? rulesByCat.set(r.category_id, []).get(r.category_id)!).push(r);
  }

  // Build display groups recursively
  interface RuleGroup { catId: number; name: string; color: string; rules: Rule[]; indent: number }
  const displayGroups: RuleGroup[] = [];

  const buildGroups = (cats: AnyCategory[], depth: number) => {
    for (const cat of [...cats].sort((a, b) => a.name.localeCompare(b.name))) {
      const catRules = rulesByCat.get(cat.id) || [];
      const subs = (cat.subcategories || []);
      const hasSubRules = flattenAll(subs).some((s) => rulesByCat.has(s.id));

      if (catRules.length === 0 && !hasSubRules) continue;

      displayGroups.push({ catId: cat.id, name: cat.name, color: cat.color, rules: catRules, indent: depth });
      if (subs.length > 0) buildGroups(subs, depth + 1);
    }
  };
  buildGroups(topCategories, 0);

  // Catch orphan rules (category deleted or not in hierarchy)
  const usedCatIds = new Set(displayGroups.map((g) => g.catId));
  for (const [catId, catRules] of rulesByCat) {
    if (!usedCatIds.has(catId)) {
      const cat = allFlat.find((c) => c.id === catId);
      displayGroups.push({ catId, name: cat?.name || `#${catId}`, color: cat?.color || "#94a3b8", rules: catRules, indent: 0 });
    }
  }

  const [applyStatus, setApplyStatus] = useState("");

  const handleApplyNew = async () => {
    setApplyStatus("Se aplică...");
    try {
      const result = await applyRules();
      setApplyStatus(`Aplicate la ${result.applied} tranzacții necategorisate.`);
    } catch { setApplyStatus("Eroare"); }
    setTimeout(() => setApplyStatus(""), 4000);
  };

  const handleReapplyAll = async () => {
    setApplyStatus("Se re-aplică...");
    try {
      const result = await reapplyAllRules();
      setApplyStatus(`Re-aplicate: ${result.applied} din ${result.total} tranzacții actualizate.`);
    } catch { setApplyStatus("Eroare"); }
    setTimeout(() => setApplyStatus(""), 4000);
  };

  return (
    <div className="space-y-4">
      {/* Apply rules block — primary action */}
      <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/50 border border-border items-center">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <BookOpen className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-none">Aplică reguli</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Doar tranzacțiile fără categorie</p>
          </div>
          <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={handleApplyNew}>
            Aplică
          </Button>
        </div>
        <div className="w-px h-8 bg-border hidden sm:block" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-none">Re-aplică toate</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Suprascrie categoriile existente</p>
          </div>
          <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={handleReapplyAll}>
            Re-aplică
          </Button>
        </div>
        {applyStatus && <p className="w-full text-xs text-muted-foreground text-center">{applyStatus}</p>}
      </div>

      {/* Add form — always visible */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="pt-3 pb-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Regulă nouă</p>
            {rules.length > 1 && (
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={toggleAllRules}>
                {selectedRules.size === rules.length ? "Deselectează tot" : "Selectează tot"}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setNewMatchType(newMatchType === "contains" ? "regex" : "contains")}
              className={`shrink-0 text-[11px] font-mono px-2 py-1 rounded-md border font-semibold transition-colors ${newMatchType === "regex" ? "bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300" : "bg-muted border-border text-muted-foreground hover:text-foreground"}`}
              title={newMatchType === "contains" ? "Conține text — apasă pentru regex" : "Regex — apasă pentru contains"}
            >
              {newMatchType === "regex" ? ".*" : "ab"}
            </button>
            <Input
              placeholder={newMatchType === "regex" ? "Regex (ex: WEB\\s*DEV)" : "Pattern (ex: Netflix, Amazon)"}
              value={newPattern}
              onChange={(e) => { setNewPattern(e.target.value); setPreview(null); setPreviewVisible(5); }}
              onKeyDown={(e) => e.key === "Enter" && handleCreateRule()}
              className={`h-8 text-sm flex-1 min-w-[140px] ${newMatchType === "regex" ? "font-mono" : ""}`}
            />
            <Select value={ruleCategory} onValueChange={setRuleCategory}>
              <SelectTrigger className="h-8 text-sm w-44 shrink-0">
                <SelectValue placeholder="Categorie" />
              </SelectTrigger>
              <SelectContent>
                <CategorySelectItems categories={categories} />
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 shrink-0" title="Prioritate (1-10)">
              <span className="text-[10px] text-muted-foreground">P</span>
              <Input
                type="number" min={1} max={10}
                value={newPriority}
                onChange={(e) => setNewPriority(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                className="h-8 w-12 text-xs text-center px-1"
              />
            </div>
            <button
              type="button"
              onClick={handlePreview}
              disabled={!newPattern.trim() || previewing}
              className="h-8 px-3 text-xs rounded-md border hover:bg-accent transition-colors shrink-0 disabled:opacity-40"
            >
              {previewing ? "..." : "Previzualizare"}
            </button>
            <Button size="sm" onClick={handleCreateRule} disabled={!newPattern.trim() || !ruleCategory} className="h-8 shrink-0">
              <Plus className="h-3.5 w-3.5" /> Adaugă
            </Button>
          </div>
          {/* Preview results */}
          {preview && (
            <div className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{preview.count} tranzacții găsite</span>
                {preview.uncategorized > 0 && (
                  <span className="text-xs text-muted-foreground">({preview.uncategorized} fără categorie)</span>
                )}
                <button onClick={() => setPreview(null)} className="ml-auto text-muted-foreground hover:text-foreground text-xs">✕</button>
              </div>
              {preview.examples.slice(0, previewVisible).map((ex) => (
                <div key={ex.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0 text-[10px] tabular-nums">{ex.date.slice(0, 10)}</span>
                  <span className="flex-1 truncate">{ex.description}</span>
                  <span className={`shrink-0 font-medium tabular-nums ${ex.amount < 0 ? "text-destructive" : "text-green-600"}`}>
                    {ex.amount < 0 ? "" : "+"}{ex.amount.toFixed(2)}
                  </span>
                </div>
              ))}
              {previewVisible < preview.examples.length && (
                <button
                  onClick={() => setPreviewVisible(v => v + 10)}
                  className="text-[11px] text-primary hover:underline"
                >
                  + {Math.min(10, preview.examples.length - previewVisible)} mai multe
                  {preview.count > preview.examples.length && previewVisible + 10 >= preview.examples.length
                    ? ` (din ${preview.count} total)` : ""}
                </button>
              )}
              {previewVisible >= preview.examples.length && preview.count > preview.examples.length && (
                <p className="text-[10px] text-muted-foreground">+ {preview.count - preview.examples.length} mai multe (nu sunt afișate)</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      {selectedRules.size > 0 && (
        <div className="flex gap-2 flex-wrap items-center border rounded-lg p-3 bg-accent/50">
          <span className="text-sm font-medium">Selectate: {selectedRules.size}</span>
          <span className="text-sm text-muted-foreground">&rarr;</span>
          <Select value={mergeCategoryId} onValueChange={setMergeCategoryId}>
            <SelectTrigger className="w-[180px] h-8">
              <SelectValue placeholder="Mută în..." />
            </SelectTrigger>
            <SelectContent>
              <CategorySelectItems categories={categories} />
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleBulkCategoryRules} disabled={!mergeCategoryId}>
            <Check className="h-3.5 w-3.5 mr-1" /> Aplică
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDeleteSelectedRules}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Șterge
          </Button>
        </div>
      )}

      {/* Grouped rule chips */}
      <div className="space-y-3">
        {displayGroups.map((group) => (
          <div key={group.catId} className={`space-y-1.5`} style={{ marginLeft: group.indent * 16 }}>
            {/* Category header chip */}
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${group.indent > 0 ? "text-xs" : ""}`}
              style={group.indent > 0
                ? { backgroundColor: group.color + "20", color: group.color, border: `1px solid ${group.color}40` }
                : { backgroundColor: group.color, color: textColorForBg(group.color) }
              }
            >
              {group.name}
              {group.rules.length > 0 && <span className="text-[10px] opacity-60">{group.rules.length}</span>}
            </div>

            {/* Rule chips */}
            {group.rules.length > 0 && <div className="flex flex-wrap gap-1.5 pl-2">
              {group.rules.map((r) => (
                editingRuleId === r.id ? (
                  <div key={r.id} className="inline-flex items-center gap-1.5 p-1.5 rounded-lg border bg-card">
                    <button
                      type="button"
                      onClick={() => setEditMatchType(editMatchType === "contains" ? "regex" : "contains")}
                      className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border ${editMatchType === "regex" ? "bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300" : "bg-muted border-border text-muted-foreground"}`}
                    >
                      {editMatchType === "regex" ? ".*" : "ab"}
                    </button>
                    <Input
                      value={editRulePattern}
                      onChange={(e) => setEditRulePattern(e.target.value)}
                      className={`h-6 w-28 text-xs font-mono px-1.5`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditRule();
                        if (e.key === "Escape") setEditingRuleId(null);
                      }}
                      autoFocus
                    />
                    <Select value={editRuleCategoryId} onValueChange={setEditRuleCategoryId}>
                      <SelectTrigger className="h-6 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <CategorySelectItems categories={categories} />
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" min={1} max={10}
                      value={editPriority}
                      onChange={(e) => setEditPriority(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                      className="h-6 w-9 text-[10px] text-center px-0.5"
                      title="Prioritate"
                    />
                    <button onClick={saveEditRule} className="p-0.5"><Check className="h-3.5 w-3.5 text-green-600" /></button>
                    <button onClick={() => setEditingRuleId(null)} className="p-0.5"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <div
                    key={r.id}
                    className={`group/rule inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-mono cursor-default transition-colors ${
                      selectedRules.has(r.id) ? "bg-primary/10 border-primary/30" : "hover:bg-accent"
                    }`}
                    style={{ borderColor: selectedRules.has(r.id) ? undefined : group.color + "40" }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRules.has(r.id)}
                      onChange={() => toggleRule(r.id)}
                      className="shrink-0 h-3 w-3"
                    />
                    {r.match_type === "regex" && <span className="text-[9px] text-violet-600 dark:text-violet-400 font-semibold">.*</span>}
                    <span>{r.pattern}</span>
                    {(r.priority ?? 1) > 1 && <span className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold" title={`Prioritate ${r.priority}`}>P{r.priority}</span>}
                    <span className="inline-flex items-center gap-0.5">
                      <button onClick={() => startEditRule(r)} className="p-0.5 rounded hover:bg-accent">
                        <Pencil className="h-2.5 w-2.5 text-muted-foreground hover:text-foreground" />
                      </button>
                      <button onClick={() => { deleteCategoryRule(r.id); reload(); }} className="p-0.5 rounded hover:bg-accent">
                        <Trash2 className="h-2.5 w-2.5 text-destructive" />
                      </button>
                    </span>
                  </div>
                )
              ))}
            </div>}
          </div>
        ))}
        {rules.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            Nu există reguli. Adaugă un pattern mai sus.
          </p>
        )}
      </div>
    </div>
  );
}
