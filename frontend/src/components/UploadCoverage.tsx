import { useState, useEffect } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getUploadCoverage, saveCoverageStart } from "@/lib/api";

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

const MONTH_NAMES = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function UploadCoverage() {
  const [coverage, setCoverage] = useState<CoverageBank[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [hasWarnings, setHasWarnings] = useState(false);
  const [coverageStart, setCoverageStart] = useState("");
  const [coverageStartSaving, setCoverageStartSaving] = useState(false);

  const loadCoverage = async () => {
    try {
      const data = await getUploadCoverage();
      setCoverage(data.banks);
      setHasWarnings(data.has_warnings);
      if (data.coverage_start) setCoverageStart(data.coverage_start);
      const allMonths = new Set<string>();
      for (const b of data.banks) {
        for (const acc of b.accounts) {
          for (const m of Object.keys(acc.months)) allMonths.add(m);
        }
      }
      setMonths(Array.from(allMonths).sort());
    } catch { /* ignore */ }
  };

  useEffect(() => { loadCoverage(); }, []);

  const yearGroups = (() => {
    const years = new Set<string>();
    for (const m of months) years.add(m.split("-")[0]);
    return Array.from(years).sort();
  })();

  const handleSaveCoverageStart = async (value?: string) => {
    const v = value ?? coverageStart;
    if (!v || v.length < 7) return;
    setCoverageStartSaving(true);
    try {
      await saveCoverageStart(v);
      await loadCoverage();
    } catch { /* ignore */ }
    setCoverageStartSaving(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
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
                onChange={(e) => {
                  setCoverageStart(e.target.value);
                  if (e.target.value.length >= 7) handleSaveCoverageStart(e.target.value);
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
            <div className="space-y-6">
              {coverage.map((b) => {
                const bankMissing = b.accounts.reduce((sum, acc) => sum + Object.values(acc.months).filter((v) => !v).length, 0);
                return (
                  <div key={b.bank}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base font-bold">{b.bank}</span>
                      <span className="text-xs text-muted-foreground">{b.accounts.length} {b.accounts.length === 1 ? "cont" : "conturi"}</span>
                      {bankMissing > 0 ? (
                        <span className="text-xs text-red-500 dark:text-red-400">{bankMissing} lipsă</span>
                      ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
