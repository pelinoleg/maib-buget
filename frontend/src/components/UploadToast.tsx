import { Loader2, Check, AlertCircle, X } from "lucide-react";
import { useUpload } from "@/lib/uploadContext";

export default function UploadToast() {
  const { jobs, clearDone } = useUpload();

  if (jobs.length === 0) return null;

  const activeJobs = jobs.filter((j) => j.status === "uploading" || j.status === "processing");
  const doneJobs = jobs.filter((j) => j.status === "done");
  const errorJobs = jobs.filter((j) => j.status === "error");
  const hasFinished = doneJobs.length > 0 || errorJobs.length > 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[380px] space-y-2">
      {activeJobs.map((job) => (
        <div
          key={job.filename}
          className="bg-card border rounded-lg shadow-lg p-3 flex items-center gap-3"
        >
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{job.filename}</p>
            <p className="text-xs text-muted-foreground">
              {job.status === "uploading" ? "Se încarcă..." : "Se procesează și categorisește..."}
            </p>
          </div>
        </div>
      ))}

      {hasFinished && (
        <div className="bg-card border rounded-lg shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {doneJobs.length > 0 && `${doneJobs.length} finalizat${doneJobs.length > 1 ? "e" : ""}`}
              {errorJobs.length > 0 && ` ${errorJobs.length} eroare`}
            </span>
            <button onClick={clearDone} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          {doneJobs.map((job) => (
            <div key={job.filename} className="flex items-start gap-2 text-xs mb-1">
              <Check className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium">{job.filename}</span>
                {job.result && (
                  <span className="text-muted-foreground">
                    {" "}&bull; {job.result.new_transactions} noi
                    {(job.result.rules_applied || job.result.ai_categorized) ?
                      `, ${(job.result.rules_applied || 0) + (job.result.ai_categorized || 0)} categorisit` : ""}
                  </span>
                )}
              </div>
            </div>
          ))}
          {errorJobs.map((job) => (
            <div key={job.filename} className="flex items-start gap-2 text-xs mb-1">
              <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
              <span className="text-destructive">{job.filename}: eroare</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
