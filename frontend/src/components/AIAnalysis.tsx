import { useState, useEffect, type ComponentPropsWithoutRef } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { analyzeWithAI, getAccounts } from "@/lib/api";
import { type PeriodPresetKey, PERIOD_PRESETS, computeDatesForPreset } from "@/lib/periodPresets";

interface Account {
  id: number;
  name: string;
  currency: string;
  bank: string | null;
}

const mdComponents = {
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="text-sm font-semibold text-foreground mt-5 mb-1.5 first:mt-0 border-b border-border pb-1" {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => <p className="my-1 leading-relaxed text-sm text-muted-foreground" {...props} />,
  ul: (props: ComponentPropsWithoutRef<"ul">) => <ul className="my-1 space-y-0.5 pl-4 list-disc" {...props} />,
  ol: (props: ComponentPropsWithoutRef<"ol">) => <ol className="my-1 space-y-0.5 pl-4 list-decimal" {...props} />,
  li: (props: ComponentPropsWithoutRef<"li">) => <li className="text-sm leading-relaxed text-muted-foreground" {...props} />,
  strong: (props: ComponentPropsWithoutRef<"strong">) => <strong className="font-semibold text-foreground" {...props} />,
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-sm border-collapse" {...props} />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th className="text-left text-xs font-medium text-muted-foreground border-b border-border px-2 py-1" {...props} />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td className="text-sm border-b border-border/50 px-2 py-1" {...props} />
  ),
};

export default function AIAnalysis() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const defaultPreset = (import.meta.env.VITE_DEFAULT_PERIOD || "last_month") as PeriodPresetKey;
  const [activePreset, setActivePreset] = useState<PeriodPresetKey | null>(defaultPreset);
  const [dateFrom, setDateFrom] = useState(() => computeDatesForPreset(defaultPreset, 0).dateFrom);
  const [dateTo, setDateTo] = useState(() => computeDatesForPreset(defaultPreset, 0).dateTo);

  const [analysis, setAnalysis] = useState<string | null>(null);
  const [txnCount, setTxnCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAccounts().then(setAccounts);
  }, []);

  const banks = Array.from(new Set(accounts.map((a) => a.bank).filter(Boolean))) as string[];

  const selectPreset = (key: PeriodPresetKey) => {
    if (activePreset === key) {
      setActivePreset(null);
      setDateFrom("");
      setDateTo("");
    } else {
      setActivePreset(key);
      const { dateFrom: df, dateTo: dt } = computeDatesForPreset(key, 0);
      setDateFrom(df);
      setDateTo(dt);
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setTxnCount(null);

    const params: Record<string, string | number> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (accountId) params.account_id = parseInt(accountId);
    if (bankFilter) params.bank = bankFilter;

    try {
      const res = await analyzeWithAI(params);
      if (res.error) {
        setError(res.error);
      } else {
        setAnalysis(res.analysis);
        setTxnCount(res.transaction_count);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare necunoscută");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:flex text-2xl font-bold items-center gap-2">
          <Sparkles className="h-6 w-6" />
          Analiză AI
        </h1>
      </div>

      {/* Period presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIOD_PRESETS.map((p) => (
          <Button
            key={p.key}
            variant={activePreset === p.key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => selectPreset(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Date pickers + account/bank + analyze button */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setActivePreset(null); }}
            className="h-9 w-[150px]"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setActivePreset(null); }}
            className="h-9 w-[150px]"
          />
        </div>

        <Select value={accountId || "all"} onValueChange={(v) => setAccountId(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Toate conturile" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate conturile</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name} ({a.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {banks.length > 1 && (
          <Select value={bankFilter || "all"} onValueChange={(v) => setBankFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="Toate băncile" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate băncile</SelectItem>
              {banks.map((b) => (
                <SelectItem key={b} value={b}>
                  {b.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button onClick={handleAnalyze} disabled={loading} className="gap-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading ? "Se analizează..." : "Analizează cu AI"}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* AI Analysis result */}
      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              Raport de analiză
              {txnCount !== null && (
                <span className="text-xs font-normal text-muted-foreground ml-auto">{txnCount} tranzacții analizate</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{analysis}</ReactMarkdown>
          </CardContent>
        </Card>
      )}

      {/* Loading placeholder */}
      {loading && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Se analizează tranzacțiile cu AI...</p>
            <p className="text-xs text-muted-foreground">Poate dura 10-30 secunde</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
