import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getChartEngine, setChartEngine as saveChartEngine } from "./api";

type Engine = "recharts" | "mui";

const LS_KEY = "chart_engine";

function readLocal(): Engine | null {
  const v = localStorage.getItem(LS_KEY);
  return v === "recharts" || v === "mui" ? v : null;
}

interface ChartEngineCtx {
  engine: Engine;
  setEngine: (e: Engine) => void;
  loading: boolean;
}

const Ctx = createContext<ChartEngineCtx>({ engine: "recharts", setEngine: () => {}, loading: true });

export function ChartEngineProvider({ children }: { children: ReactNode }) {
  const [engine, setEngineState] = useState<Engine>(() => readLocal() || "recharts");
  const [loading, setLoading] = useState(!readLocal());

  useEffect(() => {
    // If no local preference, fetch from backend
    if (!readLocal()) {
      getChartEngine()
        .then((r) => {
          const e = r.chart_engine as Engine;
          setEngineState(e);
          localStorage.setItem(LS_KEY, e);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, []);

  const setEngine = (e: Engine) => {
    setEngineState(e);
    localStorage.setItem(LS_KEY, e);
    saveChartEngine(e).catch(() => {});
  };

  return <Ctx.Provider value={{ engine, setEngine, loading }}>{children}</Ctx.Provider>;
}

export function useChartEngine() {
  return useContext(Ctx);
}
