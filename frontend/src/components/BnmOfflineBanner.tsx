import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { getExchangeRatesSummary } from "@/lib/api";

export default function BnmOfflineBanner() {
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    getExchangeRatesSummary()
      .then((data) => setEmpty(!data.total_dates))
      .catch(() => {});
  }, []);

  if (!empty) return null;

  return (
    <div className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-center gap-2 h-7 px-4">
      <AlertTriangle className="h-3 w-3 shrink-0" />
      <span>
        Nu sunt cursuri valutare în baza locală.{" "}
        <Link to="/rates" className="underline hover:no-underline font-medium">
          Actualizează
        </Link>
      </span>
    </div>
  );
}
