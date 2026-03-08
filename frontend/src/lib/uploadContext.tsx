import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { uploadPDF } from "@/lib/api";

interface UploadResult {
  filename: string;
  account: string;
  currency: string;
  new_transactions: number;
  duplicates_skipped: number;
  total_in_file: number;
  rules_applied?: number;
  ai_categorized?: number;
}

interface UploadJob {
  filename: string;
  status: "uploading" | "processing" | "done" | "error";
  result?: UploadResult;
  error?: string;
}

interface UploadContextType {
  jobs: UploadJob[];
  uploadFiles: (files: File[]) => void;
  clearDone: () => void;
  isUploading: boolean;
}

const UploadContext = createContext<UploadContextType | null>(null);

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within UploadProvider");
  return ctx;
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);

  const uploadFiles = useCallback((files: File[]) => {
    const newJobs: UploadJob[] = files.map((f) => ({
      filename: f.name,
      status: "uploading",
    }));

    setJobs((prev) => [...newJobs, ...prev]);

    files.forEach(async (file, i) => {
      // Mark as processing (PDF parsed, now categorizing)
      try {
        setJobs((prev) =>
          prev.map((j, idx) =>
            idx === i ? { ...j, status: "processing" } : j
          )
        );

        const result = await uploadPDF(file);

        setJobs((prev) =>
          prev.map((j) =>
            j.filename === file.name && j.status === "processing"
              ? { ...j, status: "done", result }
              : j
          )
        );
      } catch (e) {
        setJobs((prev) =>
          prev.map((j) =>
            j.filename === file.name && (j.status === "uploading" || j.status === "processing")
              ? { ...j, status: "error", error: String(e) }
              : j
          )
        );
      }
    });
  }, []);

  const clearDone = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status !== "done" && j.status !== "error"));
  }, []);

  const isUploading = jobs.some((j) => j.status === "uploading" || j.status === "processing");

  return (
    <UploadContext.Provider value={{ jobs, uploadFiles, clearDone, isUploading }}>
      {children}
    </UploadContext.Provider>
  );
}
