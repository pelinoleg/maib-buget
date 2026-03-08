import { useState, useEffect } from "react";
import {
  Wallet, ArrowLeftRight,
  CreditCard, Pencil, Loader2, Plus, Trash2,
  Building2, Banknote, PiggyBank, TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAccounts, createAccount, updateAccount, deleteAccount } from "@/lib/api";

interface Account {
  id: number;
  account_number: string;
  iban: string;
  currency: string;
  name: string;
  description: string | null;
  bank: string | null;
  account_type: string;
  is_monitored: boolean;
  transaction_count: number;
  total_income: number;
  total_expense: number;
  total_transfers_in: number;
  total_transfers_out: number;
  last_balance: number | null;
  date_from: string | null;
  date_to: string | null;
}

const ACCOUNT_TYPES = [
  { value: "checking", label: "Cont curent", icon: Building2 },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "cash", label: "Numerar", icon: Banknote },
  { value: "savings", label: "Economii", icon: PiggyBank },
  { value: "investment", label: "Investiții", icon: TrendingUp },
  { value: "other", label: "Altele", icon: Wallet },
];

const getTypeInfo = (type: string) =>
  ACCOUNT_TYPES.find((t) => t.value === type) || ACCOUNT_TYPES[5];

const fmt = (n: number) => n.toLocaleString("ro-RO", { minimumFractionDigits: 2 });

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y.slice(2)}`;
};

type DialogMode = "create" | "edit" | null;

export default function AccountsSummary() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [formName, setFormName] = useState("");
  const [formAccountNumber, setFormAccountNumber] = useState("");
  const [formIban, setFormIban] = useState("");
  const [formCurrency, setFormCurrency] = useState("EUR");
  const [formBank, setFormBank] = useState("");
  const [formType, setFormType] = useState("checking");
  const [formDesc, setFormDesc] = useState("");
  const [formMonitored, setFormMonitored] = useState(true);

  const refresh = () => getAccounts().then(setAccounts);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setDialogMode("create");
    setEditTarget(null);
    setFormName("");
    setFormAccountNumber("");
    setFormIban("");
    setFormCurrency("EUR");
    setFormBank("");
    setFormType("checking");
    setFormDesc("");
    setFormMonitored(true);
    setError("");
  };

  const openEdit = (acc: Account) => {
    setDialogMode("edit");
    setEditTarget(acc);
    setFormName(acc.name || "");
    setFormAccountNumber(acc.account_number);
    setFormIban(acc.iban || "");
    setFormCurrency(acc.currency);
    setFormBank(acc.bank || "");
    setFormType(acc.account_type || "checking");
    setFormDesc(acc.description || "");
    setFormMonitored(acc.is_monitored);
    setError("");
  };

  const handleSave = async () => {
    if (!formName.trim()) { setError("Numele este obligatoriu."); return; }

    setSaving(true);
    setError("");
    try {
      if (dialogMode === "create") {
        await createAccount({
          account_number: formAccountNumber.trim() || `${formType}_${Date.now()}`,
          currency: formCurrency,
          name: formName.trim(),
          description: formDesc.trim() || undefined,
          bank: formBank.trim() || undefined,
          iban: formIban.trim() || undefined,
          account_type: formType,
          is_monitored: formMonitored,
        });
      } else if (editTarget) {
        await updateAccount(editTarget.id, {
          name: formName.trim(),
          description: formDesc.trim() || undefined,
          bank: formBank.trim() || undefined,
          iban: formIban.trim() || undefined,
          currency: formCurrency,
          account_type: formType,
          is_monitored: formMonitored,
        });
      }
      setDialogMode(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteAccount(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la ștergere");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-2xl font-bold">Conturi</h1>
        <Button size="sm" className="gap-1 md:ml-0 ml-auto" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Adaugă cont
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {(() => {
        const grouped: Record<string, Account[]> = {};
        for (const acc of accounts) {
          const bank = (acc.bank || "").toUpperCase() || "FĂRĂ BANCĂ";
          (grouped[bank] ??= []).push(acc);
        }
        return Object.entries(grouped).map(([bank, accs]) => (
          <div key={bank}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{bank}</h2>
              <span className="text-xs text-muted-foreground">{accs.length} {accs.length === 1 ? "cont" : "conturi"}</span>
            </div>
            <Card className="mb-4">
              <CardContent className="p-0 divide-y">
                {accs.map((acc) => {
                  const typeInfo = getTypeInfo(acc.account_type);
                  const TypeIcon = typeInfo.icon;
                  return (
                    <div key={acc.id} className="px-3 py-2.5 group">
                      {/* Row 1: name + badges + actions */}
                      <div className="flex items-center gap-2 min-w-0">
                        <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm truncate">{acc.name}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{acc.currency}</Badge>
                        <Badge variant="secondary" className="text-[10px] shrink-0">{typeInfo.label}</Badge>
                        {acc.is_monitored && <Badge variant="secondary" className="text-[10px] shrink-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">monitorizat</Badge>}
                        <span className="flex-1" />
                        <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => openEdit(acc)}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </button>
                          {acc.transaction_count === 0 && (
                            <button onClick={() => { setDeleteTarget(acc); setError(""); }}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Row 2: stats */}
                      <div className="flex items-center gap-3 mt-1 text-xs flex-wrap">
                        <span className="text-green-600 font-medium">+{fmt(acc.total_income)}</span>
                        <span className="text-red-500 font-medium">−{fmt(acc.total_expense)}</span>
                        {(acc.total_transfers_in > 0 || acc.total_transfers_out > 0) && (
                          <span className="text-blue-500">
                            <ArrowLeftRight className="h-3 w-3 inline mr-0.5" />
                            +{fmt(acc.total_transfers_in)} / −{fmt(acc.total_transfers_out)}
                          </span>
                        )}
                        {acc.last_balance !== null && (
                          <span className="text-muted-foreground">sold: <strong className="text-foreground">{fmt(acc.last_balance)}</strong></span>
                        )}
                        <span className="text-muted-foreground">{acc.transaction_count} trz.</span>
                        {acc.date_from && acc.date_to && (
                          <span className="text-muted-foreground">{fmtDate(acc.date_from)} — {fmtDate(acc.date_to)}</span>
                        )}
                      </div>
                      {acc.iban && <p className="text-[11px] text-muted-foreground/60 mt-0.5 font-mono">{acc.iban}</p>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        ));
      })()}

      {!loading && accounts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nu există conturi. Creează un cont sau încarcă un extras PDF.
          </CardContent>
        </Card>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => { if (!open) setDialogMode(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Cont nou" : "Editează contul"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">Nume cont <span className="text-red-500">*</span></label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="ex: Cont salarial" />
            </div>
            {dialogMode === "create" && (
              <div className="col-span-2">
                <label className="text-sm font-medium mb-1 block">Număr cont</label>
                <Input value={formAccountNumber} onChange={(e) => setFormAccountNumber(e.target.value)} placeholder="opțional" />
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">IBAN</label>
              <Input value={formIban} onChange={(e) => setFormIban(e.target.value)} placeholder="opțional" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Valută</label>
              <Select value={formCurrency} onValueChange={setFormCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="MDL">MDL</SelectItem>
                  <SelectItem value="RON">RON</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Bancă</label>
              <Input value={formBank} onChange={(e) => setFormBank(e.target.value)} placeholder="ex: maib" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Tip cont</label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">Descriere</label>
              <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="opțional" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="is_monitored"
                checked={formMonitored}
                onChange={(e) => setFormMonitored(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="is_monitored" className="text-sm font-medium">Monitorizare extrase</label>
              <span className="text-xs text-muted-foreground">— afișează în verificarea încărcărilor</span>
            </div>
            {error && <p className="col-span-2 text-sm text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Anulează</Button>
            <Button disabled={saving} onClick={handleSave}>
              {saving ? "Se salvează..." : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmare ștergere</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Sigur doriți să ștergeți contul <strong>{deleteTarget?.name}</strong>? Această acțiune este ireversibilă.
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Anulează</Button>
            <Button variant="destructive" disabled={saving} onClick={handleDelete}>
              {saving ? "Se șterge..." : "Șterge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
