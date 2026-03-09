import { useState, useEffect } from "react";
import { AlertTriangle, Trash2, Check, X, Save, RotateCcw, Loader2, Search, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getUploadCoverage,
  getAIPrompt,
  saveAIPrompt,
  resetAIPrompt,
  resetDatabase,
  getSuspectDuplicates,
  saveCoverageStart,
} from "@/lib/api";
import { API_BASE } from "@/lib/api";
import { ACCENT_COLORS, getStoredAccent, setStoredAccent } from "@/lib/accent";

interface CoverageAccount {
  account_id: number;
  name: string;
  currency: string;
  account_type: string;
  months: Record<string, boolean>;
}

interface CoverageBank {
  bank: string;
  accounts: CoverageAccount[];
}

export default function Settings() {
  // Coverage
  const [coverage, setCoverage] = useState<CoverageBank[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [hasWarnings, setHasWarnings] = useState(false);
  const [coverageStart, setCoverageStart] = useState("");
  const [coverageStartSaving, setCoverageStartSaving] = useState(false);

  // Reset DB
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetInput, setResetInput] = useState("");

  // Suspect duplicates
  interface DupTxn { id: number; description: string; amount: number; type: string; account_number: string | null; account_currency: string | null; bank: string | null; category_name: string | null; source_file: string | null; }
  interface DupGroup { date: string; amount: number; transactions: DupTxn[]; }
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
    getUploadCoverage().then((data) => {
      setCoverage(data.banks);
      setHasWarnings(data.has_warnings);
      if (data.coverage_start) setCoverageStart(data.coverage_start);
      // Extract unique sorted months from all accounts
      const allMonths = new Set<string>();
      for (const b of data.banks) {
        for (const acc of b.accounts) {
          for (const m of Object.keys(acc.months)) allMonths.add(m);
        }
      }
      setMonths(Array.from(allMonths).sort());
    }).catch(() => {});

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
    // Reload coverage
    const data = await getUploadCoverage();
    setCoverage(data.banks);
    setHasWarnings(data.has_warnings);
  };

  const MONTH_NAMES = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Group months by year for compact display
  const yearGroups = (() => {
    const years = new Set<string>();
    for (const m of months) years.add(m.split("-")[0]);
    return Array.from(years).sort();
  })();

  return (
    <div className="space-y-6">
      <h1 className="hidden md:block text-2xl font-bold">Setări</h1>

      {/* Section 1: Upload Coverage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            Monitorizare încărcări
            {hasWarnings && (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                <AlertTriangle className="h-3 w-3" />
                Lipsesc extrase
              </span>
            )}
            <span className="flex-1" />
            <span className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
              din
              <Input
                type="month"
                value={coverageStart}
                onChange={(e) => setCoverageStart(e.target.value)}
                onBlur={async () => {
                  if (!coverageStart || coverageStart.length < 7) return;
                  setCoverageStartSaving(true);
                  try {
                    await saveCoverageStart(coverageStart);
                    const data = await getUploadCoverage();
                    setCoverage(data.banks);
                    setHasWarnings(data.has_warnings);
                    const allMonths = new Set<string>();
                    for (const b of data.banks) {
                      for (const acc of b.accounts) {
                        for (const m of Object.keys(acc.months)) allMonths.add(m);
                      }
                    }
                    setMonths(Array.from(allMonths).sort());
                  } catch { /* ignore */ }
                  setCoverageStartSaving(false);
                }}
                className="h-7 w-[140px] text-xs"
                disabled={coverageStartSaving}
              />
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {coverage.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nu sunt conturi încărcate sau nu există luni de verificat.</p>
          ) : (
            <div className="relative">

              <div className="relative space-y-6">
                {coverage.map((b) => {
                  const bankMissing = b.accounts.reduce((sum, acc) => sum + Object.values(acc.months).filter((v) => !v).length, 0);
                  return (
                    <div key={b.bank}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-base font-bold">{b.bank}</span>
                        <span className="text-xs text-muted-foreground">{b.accounts.length} {b.accounts.length === 1 ? "cont" : "conturi"}</span>
                        {bankMissing > 0 && (
                          <span className="text-xs text-red-500 dark:text-red-400">{bankMissing} lipsă</span>
                        )}
                        {bankMissing === 0 && (
                          <span className="text-xs text-green-600 dark:text-green-400">complet</span>
                        )}
                      </div>
                      <div className="ml-2 space-y-2">
                        {b.accounts.map((acc) => {
                          const missingCount = Object.values(acc.months).filter((v) => !v).length;
                          return (
                            <div key={acc.account_id} className={`border-l-2 pl-4 pb-2 ${missingCount > 0 ? "border-red-300 dark:border-red-800" : "border-green-300 dark:border-green-800"}`}>
                              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                <span className="text-sm font-semibold truncate max-w-[60vw] sm:max-w-none">{acc.name}</span>
                                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded shrink-0">{acc.currency}</span>
                                {missingCount > 0 ? (
                                  <span className="text-[10px] text-red-500 dark:text-red-400 shrink-0">{missingCount} lipsă</span>
                                ) : (
                                  <span className="text-[10px] text-green-600 dark:text-green-400 shrink-0">complet</span>
                                )}
                              </div>
                              {yearGroups.map((year) => {
                                const yearMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
                                const hasAny = yearMonths.some((m) => m in acc.months);
                                if (!hasAny) return null;
                                return (
                                  <div key={year} className="mb-1">
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground w-10 shrink-0">{year}</span>
                                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-1 flex-1">
                                        {yearMonths.map((m, i) => {
                                          const inRange = m in acc.months;
                                          if (!inRange) {
                                            return (
                                              <div key={m} className="w-full h-7 rounded bg-slate-400/10 flex items-center justify-center">
                                                <span className="text-[12px] text-muted-foreground/30">{MONTH_NAMES[i]}</span>
                                              </div>
                                            );
                                          }
                                          const ok = acc.months[m];
                                          return (
                                            <div key={m} className={`w-full h-7 rounded flex items-center justify-center gap-0.5 ${
                                              ok
                                                ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                                                : "bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400"
                                            }`}>
                                              <span className="text-[12px] font-medium">{MONTH_NAMES[i]}</span>
                                              {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>



      {/* Section: Suspect Duplicates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Tranzacții suspecte de duplicate
            {dupsLoaded && duplicates.length > 0 && (
              <Badge variant="secondary" className="text-xs">{duplicates.length} grupuri</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Caută tranzacții cu aceeași dată și sumă dar descriere diferită — posibile duplicate care nu au fost detectate automat.
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
              Verifică
            </Button>
          ) : duplicates.length === 0 ? (
            <p className="text-sm text-green-600 dark:text-green-400">Nu s-au găsit duplicate suspecte.</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {duplicates.map((g, gi) => (
                <div key={gi} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium">{g.date}</span>
                    <span className="font-mono">{g.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} {g.transactions[0]?.account_currency || ""}</span>
                    <Badge variant="outline" className="text-[10px]">{g.transactions.length} tranzacții</Badge>
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

      {/* Section 3: AI Prompt Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center pt-4 gap-2">
            Prompt AI analiză
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
              {promptSaved ? "Salvat!" : "Salvează"}
            </Button>
            {isCustom && (
              <Button variant="outline" onClick={handleResetPrompt} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Resetează la implicit
              </Button>
            )}
          </div>
        </CardContent>
      </Card>



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

      {/* Section 2: Reset Database */}
      <Card className="border-destructive/50">
        <CardContent className="pt-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-destructive">Resetare bază de date</p>
              <p className="text-xs text-muted-foreground">Șterge toate tranzacțiile, conturile, regulile. Categoriile rămân.</p>
            </div>
            {!showResetConfirm ? (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={() => { setShowResetConfirm(true); setResetInput(""); }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Resetare completă
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(false)}>
                Anulează
              </Button>
            )}
          </div>
          {showResetConfirm && (
            <div className="mt-4 p-3 border border-destructive/30 rounded-lg bg-destructive/5 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm">
                  Această acțiune este ireversibilă. Scrie <strong>RESET</strong> pentru a confirma.
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
                  Confirmă ștergerea
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
