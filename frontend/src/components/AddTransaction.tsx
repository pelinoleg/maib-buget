import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelectItems } from "@/components/categories/CategorySelect";
import { getAccounts, getCategories, createTransaction } from "@/lib/api";

interface Account {
  id: number;
  account_number: string;
  currency: string;
  name: string | null;
  bank: string | null;
}

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  color: string;
}

const TYPE_OPTIONS = [
  { value: "expense", label: "Cheltuială" },
  { value: "income", label: "Venit" },
  { value: "transfer", label: "Transfer" },
  { value: "refund", label: "Restituire" },
  { value: "cancelled", label: "Anulare" },
];

export default function AddTransaction() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  // Form state
  const [accountId, setAccountId] = useState("");
  const [type, setType] = useState("expense");
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [originalAmount, setOriginalAmount] = useState("");
  const [originalCurrency, setOriginalCurrency] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    getAccounts().then(setAccounts);
    getCategories().then(setCategories);
  }, []);

  const selectedAccount = accounts.find((a) => String(a.id) === accountId) || null;
  const bankGroups = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    const bank = a.bank || "other";
    (acc[bank] ??= []).push(a);
    return acc;
  }, {});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!accountId || !transactionDate || !description.trim() || !amount) {
      setError("Completați toate câmpurile obligatorii.");
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount === 0) {
      setError("Suma trebuie să fie un număr valid diferit de zero.");
      return;
    }

    // Auto-negate for expense/transfer if user entered positive
    let finalAmount = Math.abs(numAmount);
    if (type === "expense" || type === "transfer") {
      finalAmount = -finalAmount;
    }

    setSaving(true);
    try {
      await createTransaction({
        account_id: parseInt(accountId),
        transaction_date: transactionDate,
        description: description.trim(),
        amount: finalAmount,
        type,
        category_id: categoryId ? parseInt(categoryId) : null,
        original_amount: originalAmount ? parseFloat(originalAmount) : null,
        original_currency: originalCurrency || null,
        note: note.trim() || null,
      });
      navigate("/transactions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la salvare");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="hidden md:block text-2xl font-bold">Tranzacție nouă</h1>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Cont <span className="text-red-500">*</span>
              </label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selectează contul" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(bankGroups).map(([bank, accs]) => (
                    <SelectGroup key={bank}>
                      <SelectLabel>{bank.toUpperCase()}</SelectLabel>
                      {accs.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name || a.account_number} ({a.currency})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type + Date row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Tip <span className="text-red-500">*</span>
                </label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Data <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Descriere <span className="text-red-500">*</span>
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ex: Plată factură electricitate"
              />
            </div>

            {/* Amount + Category row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Suma{selectedAccount ? ` (${selectedAccount.currency})` : ""} <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {type === "expense" || type === "transfer"
                    ? "Pozitivă — va fi salvată ca negativă"
                    : "Introduceți suma pozitivă"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Categorie
                </label>
                <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Fără categorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fără categorie</SelectItem>
                    <CategorySelectItems categories={categories as any} />
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Notă</label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Notă opțională..."
              />
            </div>

            {/* Collapsible details */}
            <div>
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {showDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Detalii suplimentare
              </button>
            </div>

            {showDetails && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Sumă originală</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={originalAmount}
                    onChange={(e) => setOriginalAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Valută originală</label>
                  <Select value={originalCurrency || "none"} onValueChange={(v) => setOriginalCurrency(v === "none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="MDL">MDL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => navigate("/transactions")}
              >
                Anulează
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? "Se salvează..." : "Salvează"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
