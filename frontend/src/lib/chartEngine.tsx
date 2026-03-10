import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getChartEngine, setChartEngine as saveChartEngine } from "./api";

type Engine = "recharts" | "mui";

interface ChartEngineCtx {
  engine: Engine;
  setEngine: (e: Engine) => void;
  loading: boolean;
}

const Ctx = createContext<ChartEngineCtx>({ engine: "recharts", setEngine: () => {}, loading: true });

export function ChartEngineProvider({ children }: { children: ReactNode }) {
  const [engine, setEngineState] = useState<Engine>("recharts");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getChartEngine()
      .then((r) => setEngineState(r.chart_engine as Engine))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setEngine = (e: Engine) => {
    setEngineState(e);
    saveChartEngine(e).catch(() => {});
  };

  return <Ctx.Provider value={{ engine, setEngine, loading }}>{children}</Ctx.Provider>;
}

export function useChartEngine() {
  return useContext(Ctx);
}
