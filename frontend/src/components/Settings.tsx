import { useState, useEffect } from "react";
import { AlertTriangle, Trash2, Check, Save, RotateCcw, Loader2, Search, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getAIPrompt,
  saveAIPrompt,
  resetAIPrompt,
  resetDatabase,
  getSuspectDuplicates,
} from "@/lib/api";
import { API_BASE } from "@/lib/api";
import { ACCENT_COLORS, getStoredAccent, setStoredAccent } from "@/lib/accent";

interface DupTxn { id: number; description: string; amount: number; type: string; account_number: string | null; account_currency: string | null; bank: string | null; category_name: string | null; source_file: string | null; }
interface DupGroup { date: string; amount: number; transactions: DupTxn[]; }

export default function Settings() {
  // Reset DB
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetInput, setResetInput] = useState("");

  // Suspect duplicates
  const [duplicates, setDuplicates] = useState<DupGroup[]>([]);
  const [dupsLoading, setDupsLoading] = useState(false);
  const [dupsLoaded, setDupsLoaded] = useState(false);

  // Accent color
  const [activeAccent, setActiveAccent] = useState(getStoredAccent);

  // AI Prompt
  const [systemMessage, setSystemMessage] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);

  useEffect(() => {
    getAIPrompt().then((data) => {
      setSystemMessage(data.system_message);
      setUserPrompt(data.user_prompt_template);
      setIsCustom(data.is_custom);
    }).catch(() => {});
  }, []);

  const handleSavePrompt = async () => {
    setPromptSaving(true);
    try {
      await saveAIPrompt({ system_message: systemMessage, user_prompt_template: userPrompt });
      setIsCustom(true);
      setPromptSaved(true);
      setTimeout(() => setPromptSaved(false), 2000);
    } catch { /* ignore */ }
    setPromptSaving(false);
  };

  const handleResetPrompt = async () => {
    try { await resetAIPrompt(); } catch { return; }
    const data = await getAIPrompt();
    setSystemMessage(data.system_message);
    setUserPrompt(data.user_prompt_template);
    setIsCustom(false);
  };

  const handleResetDB = async () => {
    await resetDatabase();
    setShowResetConfirm(false);
    setResetInput("");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="hidden md:block text-2xl font-bold">Setari</h1>

      {/* Accent color */}
      <Card>
        <CardHeader>
          <CardTitle>Culoare accent</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.name}
                onClick={() => { setStoredAccent(color.name); setActiveAccent(color.name); }}
                className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                  activeAccent === color.name
                    ? "border-foreground scale-110 ring-2 ring-foreground/20"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: color.swatch }}
                title={color.label}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Suspect Duplicates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Tranzactii suspecte de duplicate
            {dupsLoaded && duplicates.length > 0 && (
              <Badge variant="secondary" className="text-xs">{duplicates.length} grupuri</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Cauta tranzactii cu aceeasi data si suma dar descriere diferita — posibile duplicate care nu au fost detectate automat.
          </p>
          {!dupsLoaded ? (
            <Button
              variant="outline"
              size="sm"
              disabled={dupsLoading}
              onClick={async () => {
                setDupsLoading(true);
                try {
                  const data = await getSuspectDuplicates({});
                  setDuplicates(data);
                } catch { setDuplicates([]); }
                setDupsLoading(false);
                setDupsLoaded(true);
              }}
            >
              {dupsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
              Verifica
            </Button>
          ) : duplicates.length === 0 ? (
            <p className="text-sm text-green-600 dark:text-green-400">Nu s-au gasit duplicate suspecte.</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {duplicates.map((g, gi) => (
                <div key={gi} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium">{g.date}</span>
                    <span className="font-mono">{g.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} {g.transactions[0]?.account_currency || ""}</span>
                    <Badge variant="outline" className="text-[10px]">{g.transactions.length} tranzactii</Badge>
                  </div>
                  {g.transactions.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1.5">
                      <span className={`font-mono shrink-0 ${t.amount < 0 ? "text-red-500" : "text-green-600"}`}>
                        {t.amount > 0 ? "+" : ""}{t.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="truncate flex-1">{t.description}</span>
                      {t.category_name && <Badge variant="secondary" className="text-[10px] shrink-0">{t.category_name}</Badge>}
                      {t.bank && <span className="text-[10px] text-muted-foreground shrink-0">{t.bank.toUpperCase()}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Prompt Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Prompt AI analiza
            {isCustom && (
              <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">personalizat</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">System message</label>
            <textarea
              value={systemMessage}
              onChange={(e) => setSystemMessage(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">User prompt template</label>
            <p className="text-xs text-muted-foreground mb-2">
              Variabile disponibile: <code className="bg-muted px-1 rounded">{"{period}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{len_txns}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{transactions_list}"}</code>
            </p>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[300px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              rows={15}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleSavePrompt} disabled={promptSaving} className="gap-2">
              {promptSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : promptSaved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {promptSaved ? "Salvat!" : "Salveaza"}
            </Button>
            {isCustom && (
              <Button variant="outline" onClick={handleResetPrompt} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Reseteaza la implicit
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reset Database */}
      <Card className="border-destructive/50">
        <CardContent className="pt-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-destructive">Resetare baza de date</p>
              <p className="text-xs text-muted-foreground">Sterge toate tranzactiile, conturile, regulile. Categoriile raman.</p>
            </div>
            {!showResetConfirm ? (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={() => { setShowResetConfirm(true); setResetInput(""); }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Resetare completa
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(false)}>
                Anuleaza
              </Button>
            )}
          </div>
          {showResetConfirm && (
            <div className="mt-4 p-3 border border-destructive/30 rounded-lg bg-destructive/5 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm">
                  Aceasta actiune este ireversibila. Scrie <strong>RESET</strong> pentru a confirma.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={resetInput}
                  onChange={(e) => setResetInput(e.target.value)}
                  placeholder="Scrie RESET"
                  className="h-8 w-40 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && resetInput === "RESET") handleResetDB();
                    if (e.key === "Escape") setShowResetConfirm(false);
                  }}
                />
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={resetInput !== "RESET"}
                  onClick={handleResetDB}
                >
                  Confirma stergerea
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Docs link */}
      <div className="text-center pb-4">
        <a
          href={`${API_BASE}/docs`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          API Documentation
        </a>
      </div>
    </div>
  );
}
