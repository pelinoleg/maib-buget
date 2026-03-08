import { useState } from "react";
import { Plus, Trash2, Pencil, Check, X, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTypeRule, updateTypeRule, deleteTypeRule, reapplyTypeRules } from "@/lib/api";
import type { TypeRuleData } from "./types";

interface Props {
  typeRules: TypeRuleData[];
  reload: () => void;
}

export default function TypeRulesTab({ typeRules, reload }: Props) {
  const [newTRPattern, setNewTRPattern] = useState("");
  const [newTRMatchType, setNewTRMatchType] = useState("contains");
  const [newTRTargetType, setNewTRTargetType] = useState("expense");
  const [newTRDescription, setNewTRDescription] = useState("");
  const [editingTRId, setEditingTRId] = useState<number | null>(null);
  const [editTRPattern, setEditTRPattern] = useState("");
  const [editTRMatchType, setEditTRMatchType] = useState("");
  const [editTRTargetType, setEditTRTargetType] = useState("");
  const [editTRDescription, setEditTRDescription] = useState("");
  const [typeRuleStatus, setTypeRuleStatus] = useState("");

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Regulile determină tipul tranzacției (<strong>cheltuială</strong>, <strong>venit</strong> sau <strong>transfer</strong>) pe baza descrierii.
            Regulile se verifică în ordinea priorității — prima care se potrivește câștigă.
          </p>
          <div className="text-xs text-muted-foreground bg-accent/50 rounded-lg p-3 space-y-1.5">
            <p><strong>Căutare text (contains)</strong> — caută textul în descriere, fără a ține cont de litere mari/mici</p>
            <p><strong>Expresie regulată (regex)</strong> — pattern complex, ex: <code className="bg-accent px-1 rounded">tranzactie forex.*EUR</code> = „tranzactie forex" urmat de „EUR"</p>
          </div>

          <div className="space-y-3 border rounded-lg p-3">
            <p className="text-sm font-medium">Adaugă regulă nouă</p>
            <Input
              placeholder="Pattern (ex: a2a de intrare, tranzactie forex.*)"
              value={newTRPattern}
              onChange={(e) => setNewTRPattern(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={newTRMatchType} onValueChange={setNewTRMatchType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Căutare text</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newTRTargetType} onValueChange={setNewTRTargetType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Cheltuială</SelectItem>
                  <SelectItem value="income">Venit</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="Descriere scurtă (opțional)"
              value={newTRDescription}
              onChange={(e) => setNewTRDescription(e.target.value)}
            />
            <Button className="w-full" onClick={async () => {
              if (!newTRPattern.trim()) return;
              await createTypeRule({
                pattern: newTRPattern,
                match_type: newTRMatchType,
                target_type: newTRTargetType,
                description: newTRDescription || undefined,
              });
              setNewTRPattern("");
              setNewTRDescription("");
              reload();
            }}>
              <Plus className="h-4 w-4 mr-2" /> Adaugă
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {typeRules.map((tr) => (
          <div key={tr.id} className={`border rounded-lg overflow-hidden ${!tr.is_active ? "opacity-50" : ""}`}>
            {editingTRId === tr.id ? (
              <div className="p-3 space-y-3">
                <Input
                  value={editTRPattern}
                  onChange={(e) => setEditTRPattern(e.target.value)}
                  className="font-mono text-sm"
                  placeholder="Pattern"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingTRId(null);
                  }}
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={editTRMatchType} onValueChange={setEditTRMatchType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Căutare text</SelectItem>
                      <SelectItem value="regex">Regex</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={editTRTargetType} onValueChange={setEditTRTargetType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">Cheltuială</SelectItem>
                      <SelectItem value="income">Venit</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  value={editTRDescription}
                  onChange={(e) => setEditTRDescription(e.target.value)}
                  placeholder="Descriere"
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button className="flex-1" variant="outline" onClick={async () => {
                    await updateTypeRule(tr.id, {
                      pattern: editTRPattern,
                      match_type: editTRMatchType,
                      target_type: editTRTargetType,
                      description: editTRDescription,
                    });
                    setEditingTRId(null);
                    reload();
                  }}>
                    <Check className="h-4 w-4 mr-1" /> Salvează
                  </Button>
                  <Button variant="ghost" onClick={() => setEditingTRId(null)}>
                    Anulează
                  </Button>
                </div>
              </div>
            ) : (
              <div className="px-3 py-2.5 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      {tr.is_system && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-accent px-1.5 py-0.5 rounded">sistem</span>
                      )}
                      <code className="text-sm font-mono font-medium break-all">{tr.pattern}</code>
                    </div>
                    {tr.description && (
                      <p className="text-xs text-muted-foreground">{tr.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={async () => {
                        await updateTypeRule(tr.id, { is_active: !tr.is_active });
                        reload();
                      }}
                      title={tr.is_active ? "Dezactivează regula" : "Activează regula"}
                    >
                      {tr.is_active
                        ? <X className="h-3.5 w-3.5 text-muted-foreground" />
                        : <Check className="h-3.5 w-3.5 text-green-600" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => {
                        setEditingTRId(tr.id);
                        setEditTRPattern(tr.pattern);
                        setEditTRMatchType(tr.match_type);
                        setEditTRTargetType(tr.target_type);
                        setEditTRDescription(tr.description || "");
                      }}
                      title="Editează"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {!tr.is_system && (
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={async () => { await deleteTypeRule(tr.id); reload(); }}
                        title="Șterge"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground uppercase">
                    {tr.match_type === "contains" ? "text" : "regex"}
                  </span>
                  <Badge className={`text-[10px] px-1.5 py-0 ${
                    tr.target_type === "transfer" ? "bg-blue-500" :
                    tr.target_type === "income" ? "bg-green-500" : "bg-red-500"
                  }`}>
                    {tr.target_type === "transfer" ? "Transfer" :
                     tr.target_type === "income" ? "Venit" : "Cheltuială"}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0" title="Tranzacții care se potrivesc">
                    {tr.match_count} tranz.
                  </Badge>
                </div>
              </div>
            )}
          </div>
        ))}
        {typeRules.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            Nu există reguli de tip. Se vor crea automat la repornirea serverului.
          </p>
        )}
      </div>

      <div>
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            setTypeRuleStatus("loading");
            const result = await reapplyTypeRules();
            setTypeRuleStatus(
              result.updated > 0
                ? `${result.updated} tranzacții reclasificate din ${result.total}.`
                : `Nicio modificare. Toate ${result.total} tranzacțiile sunt deja clasificate corect.`
            );
          }}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${typeRuleStatus === "loading" ? "animate-spin" : ""}`} /> Reaplică regulile de tip
        </Button>
        <p className="text-xs text-muted-foreground mt-1.5">
          Reclasifică toate tranzacțiile existente conform regulilor curente. Util după ce ai modificat sau dezactivat reguli.
        </p>
      </div>
      {typeRuleStatus && typeRuleStatus !== "loading" && (
        <div className={`text-sm font-medium p-3 rounded border ${
          typeRuleStatus.startsWith("Nicio")
            ? "bg-muted text-muted-foreground border-border"
            : "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
        }`}>
          {typeRuleStatus}
        </div>
      )}
    </div>
  );
}
