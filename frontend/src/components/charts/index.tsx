import { lazy, Suspense, type ComponentProps } from "react";

const MuiDonutChartLazy = lazy(() => import("./MuiDonutChart"));
const MuiBarChartLazy = lazy(() => import("./MuiBarChart"));
const MuiLineChartLazy = lazy(() => import("./MuiLineChart"));
const MuiAreaChartLazy = lazy(() => import("./MuiAreaChart"));

function ChartFallback({ height }: { height: number }) {
  return (
    <div style={{ height }} className="flex items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
  );
}

export function LazyMuiDonutChart(props: ComponentProps<typeof MuiDonutChartLazy>) {
  return (
    <Suspense fallback={<ChartFallback height={props.height} />}>
      <MuiDonutChartLazy {...props} />
    </Suspense>
  );
}

export function LazyMuiBarChart(props: ComponentProps<typeof MuiBarChartLazy>) {
  return (
    <Suspense fallback={<ChartFallback height={props.height} />}>
      <MuiBarChartLazy {...props} />
    </Suspense>
  );
}

export function LazyMuiLineChart(props: ComponentProps<typeof MuiLineChartLazy>) {
  return (
    <Suspense fallback={<ChartFallback height={props.height} />}>
      <MuiLineChartLazy {...props} />
    </Suspense>
  );
}

export function LazyMuiAreaChart(props: ComponentProps<typeof MuiAreaChartLazy>) {
  return (
    <Suspense fallback={<ChartFallback height={props.height} />}>
      <MuiAreaChartLazy {...props} />
    </Suspense>
  );
}
