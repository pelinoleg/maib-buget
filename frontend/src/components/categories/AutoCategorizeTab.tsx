import { BookOpen, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { applyRules, refreshAICategorization } from "@/lib/api";

interface Props {
  aiStatus: string;
  setAiStatus: (s: string) => void;
  reload: () => void;
}

export default function AutoCategorizeTab({ aiStatus, setAiStatus, reload }: Props) {
  const handleApplyRules = async () => {
    setAiStatus("Se aplică regulile...");
    const result = await applyRules();
    setAiStatus(`Reguli aplicate la ${result.applied} tranzacții.`);
  };

  const handleAI = async () => {
    setAiStatus("Se categorizează cu AI...");
    try {
      const result = await refreshAICategorization();
      if (result.error) {
        setAiStatus(`Eroare: ${result.error}`);
      } else {
        const parts = [`AI a categorisit ${result.categorized} din ${result.total} tranzacții.`];
        if (result.pending > 0) parts.push(`${result.pending} reguli noi de verificat.`);
        setAiStatus(parts.join(" "));
      }
    } catch (e) {
      setAiStatus(`Eroare: ${e}`);
    }
    reload();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div>
            <Button onClick={handleApplyRules} variant="outline" className="w-full">
              <BookOpen className="h-4 w-4 mr-2" /> Aplică regulile existente
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">
              Parcurge toate tranzacțiile necategorisate și le asociază cu categorii conform regulilor aprobate din tab-ul „Reguli".
            </p>
          </div>
          <div>
            <Button onClick={handleAI} variant="outline" className="w-full">
              <Sparkles className="h-4 w-4 mr-2" /> Categorizare cu AI
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">
              Trimite tranzacțiile necategorisate la OpenAI. Dacă există deja o regulă aprobată pentru tranzacție — categoria se aplică imediat.
              Altfel, AI creează reguli noi în tab-ul „De verificat" — tranzacțiile rămân necategorisate până aprobezi regulile.
            </p>
          </div>
          {aiStatus && (
            <p className="text-sm text-muted-foreground bg-accent p-2 rounded">{aiStatus}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
