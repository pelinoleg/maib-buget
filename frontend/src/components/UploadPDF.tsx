import { useState, useCallback, useEffect, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getUploads, API_BASE } from "@/lib/api";
import { useUpload } from "@/lib/uploadContext";

interface UploadRecord {
  id: number;
  filename: string;
  stored_path: string | null;
  uploaded_at: string;
  account_number: string;
  transactions_count: number;
  duplicates_skipped: number;
  has_file: boolean;
}

const MONTH_NAMES = ["", "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];

function fmtYm(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  return m ? `${MONTH_NAMES[parseInt(m[2])]} ${m[1]}` : ym;
}

function displayName(h: UploadRecord): string {
  if (!h.stored_path || !h.stored_path.includes("/")) return h.filename;
  const file = h.stored_path.split("/").pop() || h.filename;
  const m = file.match(/^(\w+)_([A-Z]{3})_(\d+)_(.+)\.pdf$/i);
  if (!m) return file;
  const [, bank, currency, acc, period] = m;
  const parts = period.split("_");
  const periodStr = parts.length === 2 ? `${fmtYm(parts[0])}–${fmtYm(parts[1])}` : fmtYm(parts[0]);
  return `${bank.toUpperCase()} ${currency.toUpperCase()} ${acc} — ${periodStr}.pdf`;
}

function bankFromPath(h: UploadRecord): string {
  if (!h.stored_path || !h.stored_path.includes("/")) return "Altele";
  const bank = h.stored_path.split("/")[0];
  return bank ? bank.toUpperCase() : "Altele";
}

export default function UploadPDF() {
  const [history, setHistory] = useState<UploadRecord[]>([]);
  const { uploadFiles, isUploading, jobs } = useUpload();

  const loadHistory = () => getUploads().then(setHistory).catch(() => {});

  useEffect(() => {
    loadHistory();
  }, []);

  // Reload history when uploads finish
  const doneCount = jobs.filter((j) => j.status === "done").length;
  useEffect(() => {
    if (doneCount > 0) loadHistory();
  }, [doneCount]);

  const onDrop = useCallback((files: File[]) => {
    uploadFiles(files);
  }, [uploadFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: true,
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="hidden md:block text-2xl font-bold">Încărcare PDF</h1>

      <Card>
        <CardContent className="pt-6">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isUploading ? (
              <div>
                <p className="text-lg font-medium">Se procesează...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Poți naviga pe alte pagini. Progresul se vede în colțul din dreapta jos.
                </p>
              </div>
            ) : isDragActive ? (
              <p className="text-primary">Plasează fișierele aici...</p>
            ) : (
              <>
                <p className="text-lg font-medium">
                  Trage fișierele PDF aici sau click pentru a selecta
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Extrase de cont MAIB (format PDF). Categorisirea se face automat.
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {history.length > 0 && (() => {
        const grouped = new Map<string, UploadRecord[]>();
        for (const h of history) {
          const bank = bankFromPath(h);
          (grouped.get(bank) ?? grouped.set(bank, []).get(bank)!).push(h);
        }
        const banks = Array.from(grouped.entries()).sort((a, b) => {
          if (a[0] === "Altele") return 1;
          if (b[0] === "Altele") return -1;
          return a[0].localeCompare(b[0]);
        });

        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Istoric încărcări</h2>
            {banks.map(([bank, uploads]) => (
              <Card key={bank}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold">{bank}</span>
                    <span className="text-xs text-muted-foreground">{uploads.length} {uploads.length === 1 ? "fișier" : "fișiere"}</span>
                  </div>
                  <div className="space-y-1">
                    {uploads.map((h) => (
                      <div key={h.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{displayName(h)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(h.uploaded_at).toLocaleString("ro-RO")} &bull; {h.transactions_count} tranzacții, {h.duplicates_skipped} duplicate
                          </p>
                        </div>
                        {h.has_file && (
                          <a
                            href={`${API_BASE}/uploads/${h.id}/download`}
                            download
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
                            title="Descarcă PDF"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
