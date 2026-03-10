import { lazy, Suspense, type ComponentProps } from "react";

const MuiDonutChartLazy = lazy(() => import("./MuiDonutChart"));
const MuiBarChartLazy = lazy(() => import("./MuiBarChart"));
const MuiSparkLineLazy = lazy(() => import("./MuiSparkLine"));

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

export function LazyMuiSparkLine(props: ComponentProps<typeof MuiSparkLineLazy>) {
  return (
    <Suspense fallback={<ChartFallback height={props.height} />}>
      <MuiSparkLineLazy {...props} />
    </Suspense>
  );
}
